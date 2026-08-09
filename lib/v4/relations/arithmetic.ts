/**
 * Validateurs arithmétiques génériques.
 * Renforcent des hypothèses existantes — ne fabriquent jamais de valeurs absentes.
 */

import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { Contradiction, Relation } from "../types/relation.js";
import { normalizeLex } from "../candidates/normalize.js";
import {
  bestRole,
  evidenceOf,
  moneyCandidates,
  nearlyEqual,
  percentCandidates,
  pushReason,
  roleScore,
  sumReasons
} from "./helpers.js";
import { nextRelationId } from "./ids.js";
import { RELATION_WEIGHTS as W } from "./weights.js";

function isTopRole(c: EntityCandidate, role: string | string[]): boolean {
  const top = bestRole(c);
  if (!top) return false;
  return Array.isArray(role) ? role.includes(top) : top === role;
}

/** HT crédible : rôle principal HT, score suffisant, hors sous-total/remise. */
function isCredibleInvoiceHt(c: EntityCandidate): boolean {
  if (!isTopRole(c, "amountHT")) return false;
  if (roleScore(c, "amountHT") < 0.45) return false;
  const line = normalizeLex(c.context?.sameLine || "");
  if (/sous[-\s]?total|remise\b|deja\s+(paye|prelev)|acompte/.test(line)) {
    return false;
  }
  return true;
}

/** TTC crédible pour l’équation HT+TVA — pas un « reste à payer » seul. */
function isCredibleInvoiceTtc(c: EntityCandidate): boolean {
  if (!isTopRole(c, "amountTTC")) return false;
  return roleScore(c, "amountTTC") >= 0.45;
}

function isCredibleVatAmount(c: EntityCandidate): boolean {
  if (!isTopRole(c, "vatAmount")) return false;
  return roleScore(c, "vatAmount") >= 0.45;
}

/** Montants de ligne / section locale — pas un trio fiscal global. */
function isSectionLocalAmount(c: EntityCandidate): boolean {
  const line = normalizeLex(c.context?.sameLine || "");
  const blob = normalizeLex(
    [c.context?.previousLine, c.context?.sameLine, c.context?.nextLine]
      .filter(Boolean)
      .join(" ")
  );
  return /acheminement|abonnement|consommation|services?\b|htva\b|reseaux?\s+sociaux|support|contact|faq|sous[-\s]?total|detail|ligne|index\b|kwh/.test(
    `${line} ${blob}`
  );
}

function lineIndex(c: EntityCandidate): number | null {
  const fromBlock = Number(String(c.blockIds?.[0] || "").replace(/\D/g, ""));
  if (fromBlock > 0) return fromBlock;
  const fromEv = Number(
    String(c.evidence?.[0]?.lineId || c.evidence?.[0]?.blockId || "").replace(
      /\D/g,
      ""
    )
  );
  return fromEv > 0 ? fromEv : null;
}

/**
 * Affinité de bundle comptable (0..1).
 * Absence de proximité ≠ incohérence — seulement un score faible.
 */
function bundleAffinity(a: EntityCandidate, b: EntityCandidate): number {
  if (a.id === b.id) return 1;
  if (a.page !== b.page) return 0;

  const aLine = a.context?.sameLine || "";
  const bLine = b.context?.sameLine || "";
  if (aLine && aLine === bLine) return 1;

  const aPrev = a.context?.previousLine || "";
  const aNext = a.context?.nextLine || "";
  const bPrev = b.context?.previousLine || "";
  const bNext = b.context?.nextLine || "";
  if (
    (aLine && (aLine === bPrev || aLine === bNext)) ||
    (bLine && (bLine === aPrev || bLine === aNext))
  ) {
    return 0.75;
  }

  const ai = lineIndex(a);
  const bi = lineIndex(b);
  if (ai != null && bi != null) {
    const dist = Math.abs(ai - bi);
    if (dist <= 1) return 0.7;
    if (dist <= 3) return 0.55;
    if (dist <= 6) return 0.35;
    return 0.1;
  }

  // Même page sans proximité mesurable : faible — insuffisant pour contradiction
  const aTotal = /\btotal\b/.test(normalizeLex(aLine));
  const bTotal = /\btotal\b/.test(normalizeLex(bLine));
  if (aTotal && bTotal) return 0.4;
  return 0.15;
}

/** Même bundle comptable : preuves structurelles suffisantes (pas cross-section). */
function sameAccountingBundle(
  ht: EntityCandidate,
  vat: EntityCandidate,
  ttc: EntityCandidate
): boolean {
  if (isSectionLocalAmount(ht) || isSectionLocalAmount(vat)) {
    // Un HT/TVA de ligne locale ne peut contredire un TTC global
    // que s'il est adjacent au TTC.
    const localToTtc =
      Math.min(bundleAffinity(ht, ttc), bundleAffinity(vat, ttc)) >= 0.7;
    if (!localToTtc) return false;
  }
  const ab = bundleAffinity(ht, vat);
  const bc = bundleAffinity(vat, ttc);
  const ac = bundleAffinity(ht, ttc);
  // Exiger une proximité réelle sur au moins 2 paires, et un minimum global
  const strong = [ab, bc, ac].filter((x) => x >= 0.55).length;
  const min = Math.min(ab, bc, ac);
  return strong >= 2 && min >= 0.35;
}

export interface ArithmeticScanResult {
  relations: Relation[];
  contradictions: Contradiction[];
  /** Bundles HT/TVA/taux/TTC cohérents. */
  coherentBundles: Array<{
    ht: EntityCandidate;
    ttc: EntityCandidate;
    vatAmount?: EntityCandidate;
    vatRate?: EntityCandidate;
    relations: Relation[];
  }>;
}

function num(c: EntityCandidate): number {
  return Number(c.value);
}

/**
 * Explore les combinaisons de montants/% déjà extraits.
 */
export function scanArithmeticRelations(
  candidates: readonly EntityCandidate[]
): ArithmeticScanResult {
  const monies = moneyCandidates(candidates);
  const rates = percentCandidates(candidates);
  const relations: Relation[] = [];
  const contradictions: Contradiction[] = [];
  const coherentBundles: ArithmeticScanResult["coherentBundles"] = [];

  for (const ht of monies) {
    for (const ttc of monies) {
      if (ht.id === ttc.id) continue;
      const ttcGreater = num(ttc) > num(ht) + W.moneyTolerance;
      // Ne pas traiter amountDue (reste à payer) comme TTC de l’équation fiscale.
      const topTrioRoles =
        isCredibleInvoiceHt(ht) && isCredibleInvoiceTtc(ttc);

      // HT + TVA ≈ TTC
      for (const vat of monies) {
        if (vat.id === ht.id || vat.id === ttc.id) continue;
        const sum = Math.round((num(ht) + num(vat)) * 100) / 100;
        const ok = nearlyEqual(sum, num(ttc), W.moneyTolerance);
        const reasons: ScoreReason[] = [];
        pushReason(reasons, "pair:htCandidate", roleScore(ht, "amountHT") * 0.2);
        pushReason(reasons, "pair:vatCandidate", roleScore(vat, "vatAmount") * 0.2);
        pushReason(reasons, "pair:ttcCandidate", roleScore(ttc, "amountTTC") * 0.2);

        const roleAlignedBundle =
          isCredibleInvoiceHt(ht) &&
          isCredibleInvoiceTtc(ttc) &&
          isCredibleVatAmount(vat);
        const sameBundle = sameAccountingBundle(ht, vat, ttc);

        if (ok && ttcGreater && sameBundle) {
          pushReason(
            reasons,
            `arithmetic:HT+TVA≈TTC (${num(ht)}+${num(vat)}=${sum}≈${num(ttc)})`,
            W.htPlusVatEqualsTtc
          );
          pushReason(
            reasons,
            "bundle:sameAccountingBundle",
            Math.min(
              bundleAffinity(ht, vat),
              bundleAffinity(vat, ttc),
              bundleAffinity(ht, ttc)
            ) * 0.2
          );
          relations.push({
            id: nextRelationId("arith"),
            sourceCandidateId: ht.id,
            targetCandidateId: ttc.id,
            type: "arithmetic",
            score: sumReasons(reasons),
            reasons,
            evidence: evidenceOf(ht, vat, ttc),
            via: [vat.id],
            label: "HT + TVA ≈ TTC"
          });

          // Cherche un taux compatible (même zone)
          let rateCand: EntityCandidate | undefined;
          for (const rate of rates) {
            if (bundleAffinity(rate, ht) < 0.35 && bundleAffinity(rate, ttc) < 0.35) {
              continue;
            }
            const expected =
              Math.round(num(ht) * (1 + num(rate) / 100) * 100) / 100;
            if (nearlyEqual(expected, num(ttc), W.moneyTolerance)) {
              rateCand = rate;
              const rReasons = [...reasons];
              pushReason(
                rReasons,
                `arithmetic:HT×(1+taux/100)≈TTC (${num(ht)}×(1+${num(rate)}/100)=${expected}≈${num(ttc)})`,
                W.htTimesRateEqualsTtc
              );
              pushReason(rReasons, "bundle:bonus", W.arithmeticBundleBonus);
              relations.push({
                id: nextRelationId("arith"),
                sourceCandidateId: ht.id,
                targetCandidateId: ttc.id,
                type: "arithmetic",
                score: sumReasons(rReasons),
                reasons: rReasons,
                evidence: evidenceOf(ht, vat, rate, ttc),
                via: [vat.id, rate.id],
                label: "HT + TVA ≈ TTC et HT × (1+taux) ≈ TTC"
              });
              break;
            }
          }

          // Bundle cohérent : rôles + même section comptable
          if (roleAlignedBundle) {
            coherentBundles.push({
              ht,
              ttc,
              vatAmount: vat,
              vatRate: rateCand,
              relations: relations.filter(
                (r) =>
                  r.sourceCandidateId === ht.id &&
                  r.targetCandidateId === ttc.id &&
                  (r.via || []).includes(vat.id)
              )
            });
          }
        } else if (
          !ok &&
          topTrioRoles &&
          isCredibleVatAmount(vat) &&
          sameBundle
        ) {
          // Contradiction UNIQUEMENT avec preuve de même bundle.
          // Absence de preuve de cohérence ≠ preuve d'incohérence.
          const penaltyReasons: ScoreReason[] = [];
          pushReason(
            penaltyReasons,
            `contradiction:HT+TVA≠TTC (${num(ht)}+${num(vat)}=${sum}≠${num(ttc)})`,
            W.arithmeticMismatch
          );
          pushReason(
            penaltyReasons,
            "bundle:sameAccountingBundle",
            0.1
          );
          contradictions.push({
            id: nextRelationId("contra"),
            subjectIds: [ht.id, vat.id, ttc.id],
            kind: "arithmeticMismatch",
            message: `HT (${num(ht)}) + TVA (${num(vat)}) ≠ TTC (${num(ttc)})`,
            penalty: W.arithmeticMismatch,
            reasons: penaltyReasons,
            evidence: evidenceOf(ht, vat, ttc)
          });
        }
      }

      // HT × (1+taux) ≈ TTC sans montant TVA explicite
      for (const rate of rates) {
        const expected =
          Math.round(num(ht) * (1 + num(rate) / 100) * 100) / 100;
        const rateNear =
          bundleAffinity(ht, ttc) >= 0.55 &&
          (bundleAffinity(rate, ht) >= 0.35 || bundleAffinity(rate, ttc) >= 0.35);
        if (!nearlyEqual(expected, num(ttc), W.moneyTolerance)) {
          if (
            topTrioRoles &&
            isTopRole(rate, "vatRate") &&
            rateNear &&
            !isSectionLocalAmount(ht)
          ) {
            contradictions.push({
              id: nextRelationId("contra"),
              subjectIds: [ht.id, rate.id, ttc.id],
              kind: "arithmeticMismatch",
              message: `HT (${num(ht)}) × (1+${num(rate)}/100) ≠ TTC (${num(ttc)})`,
              penalty: W.arithmeticMismatch,
              reasons: [
                {
                  signal: `contradiction:HT×taux≠TTC (expected ${expected})`,
                  delta: W.arithmeticMismatch
                }
              ],
              evidence: evidenceOf(ht, rate, ttc)
            });
          }
          continue;
        }
        if (!ttcGreater || !rateNear) continue;
        const already = relations.some(
          (r) =>
            r.sourceCandidateId === ht.id &&
            r.targetCandidateId === ttc.id &&
            (r.via || []).includes(rate.id)
        );
        if (already) continue;
        const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
        pushReason(
          reasons,
          `arithmetic:HT×(1+taux/100)≈TTC (${num(ht)}×(1+${num(rate)}/100)=${expected}≈${num(ttc)})`,
          W.htTimesRateEqualsTtc
        );
        pushReason(reasons, "pair:htCandidate", roleScore(ht, "amountHT") * 0.15);
        pushReason(reasons, "pair:rateCandidate", roleScore(rate, "vatRate") * 0.15);
        pushReason(reasons, "pair:ttcCandidate", roleScore(ttc, "amountTTC") * 0.15);
        relations.push({
          id: nextRelationId("arith"),
          sourceCandidateId: ht.id,
          targetCandidateId: ttc.id,
          type: "arithmetic",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(ht, rate, ttc),
          via: [rate.id],
          label: "HT × (1+taux) ≈ TTC"
        });
      }
    }
  }

  return { relations, contradictions, coherentBundles };
}
