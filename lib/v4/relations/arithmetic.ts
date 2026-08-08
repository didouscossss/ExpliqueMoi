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

        if (ok && ttcGreater) {
          pushReason(
            reasons,
            `arithmetic:HT+TVA≈TTC (${num(ht)}+${num(vat)}=${sum}≈${num(ttc)})`,
            W.htPlusVatEqualsTtc
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

          // Cherche un taux compatible
          let rateCand: EntityCandidate | undefined;
          for (const rate of rates) {
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

          // Bundle global seulement si les rôles métier sont alignés
          // (évite 10+90=100 / 50+58=108 comme « meilleure » solution).
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
          isCredibleVatAmount(vat)
        ) {
          const penaltyReasons: ScoreReason[] = [];
          pushReason(
            penaltyReasons,
            `contradiction:HT+TVA≠TTC (${num(ht)}+${num(vat)}=${sum}≠${num(ttc)})`,
            W.arithmeticMismatch
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
        if (!nearlyEqual(expected, num(ttc), W.moneyTolerance)) {
          if (topTrioRoles && isTopRole(rate, "vatRate")) {
            // HT×taux ≠ TTC alors que les rôles principaux pointent ici
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
        if (!ttcGreater) continue;
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
