/**
 * Scoring sémantique local des montants (sans IA).
 * Priorise ce que l’utilisateur doit payer (TTC / à payer) face au HT, TVA, capital, etc.
 */

import type { LocalAmountFinding } from "../types/LocalAnalysis.js";
import { linesOf, parseFrenchAmount } from "./normalize.js";

const AMOUNT_TOKEN =
  /(\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:\s*(?:€|eur|euros?))?/gi;

export interface RankedAmountCandidate {
  value: number;
  raw: string;
  /** Labels sémantiques: payable | ttc | ht | tva | net | capital | other */
  tags: string[];
  score: number;
  reasons: string[];
  lineIndex: number;
  start: number | null;
  end: number | null;
}

export interface AmountFieldSelection {
  amountHT: number | null;
  amountTVA: number | null;
  amountTTC: number | null;
  amountToPay: number | null;
  netToPay: number | null;
  principal: number | null;
  principalSource: string | null;
  principalReasons: string[];
  candidates: RankedAmountCandidate[];
  amounts: LocalAmountFinding[];
  arithmeticOk: boolean | null;
}

function pushUniqueReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function scoreLineContext(context: string): {
  tags: string[];
  score: number;
  reasons: string[];
} {
  const c = context.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tags: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  // Parasites forts (négatif)
  if (/capital(\s+social)?|au\s+capital/.test(c)) {
    tags.push("capital");
    score -= 120;
    pushUniqueReason(reasons, "contexte capital social (−120)");
  }
  if (
    /prix\s*unitaire|pu\b|remise|rabais|avoir\b|acompte|\bprix\s*ht\b|\boptions?\b/.test(
      c
    )
  ) {
    tags.push("partial");
    score -= 50;
    pushUniqueReason(reasons, "montant partiel / unitaire (−50)");
  }
  if (/ancien\s+solde|solde\s+anterieur|report/.test(c)) {
    tags.push("balance");
    score -= 40;
    pushUniqueReason(reasons, "ancien solde (−40)");
  }

  // Payable / dû (fort)
  if (
    /(somme|montant|total|net|reste)\s*a\s*(payer|regler)/.test(c) ||
    /\ba\s*payer\b/.test(c) ||
    /\bnet\s*a\s*payer\b/.test(c) ||
    /\breste\s*a\s*payer\b/.test(c)
  ) {
    tags.push("payable");
    score += 100;
    pushUniqueReason(reasons, "libellé à payer / somme à payer (+100)");
  }
  // Montant de prélèvement — pas « Date de prélèvement »
  if (
    /montant\s*(du|de)\s*prelevement/.test(c) ||
    (/\bprelevement\s*[:=]/.test(c) && !/\bdate\b/.test(c))
  ) {
    tags.push("payable");
    score += 90;
    pushUniqueReason(reasons, "montant de prélèvement (+90)");
  }

  // TTC
  if (/\bttc\b|toutes\s*taxes\s*comprises|\bt\s*\.?\s*t\s*\.?\s*c\b/.test(c)) {
    tags.push("ttc");
    score += 80;
    pushUniqueReason(reasons, "libellé TTC (+80)");
  }

  // Net
  if (/\bnet\b/.test(c) && /payer|salaire/.test(c)) {
    tags.push("net");
    score += 70;
    pushUniqueReason(reasons, "net à payer (+70)");
  }

  // Total générique (sans HT)
  if (/\btotal\b/.test(c) && !/\bht\b|hors\s*taxes?/.test(c)) {
    tags.push("total");
    score += 35;
    pushUniqueReason(reasons, "total (non HT) (+35)");
  }

  // HT
  if (/\bht\b|hors\s*taxes?/.test(c)) {
    tags.push("ht");
    score += 20;
    pushUniqueReason(reasons, "libellé HT (+20)");
    if (/\btotal\b/.test(c)) {
      score += 25;
      pushUniqueReason(reasons, "total HT (+25)");
    }
  }

  // TVA (montant), pas le seul mot « taux »
  if (/\btva\b|\bvat\b/.test(c)) {
    tags.push("tva");
    score += 15;
    pushUniqueReason(reasons, "libellé TVA (+15)");
  }
  // Pénalité légère si la ligne ne contient qu’un taux % sans montant €
  if (/\btva\b/.test(c) && /%/.test(c) && !/[€]|eur|euros?|[.,]\d{2}/i.test(c)) {
    score -= 30;
    pushUniqueReason(reasons, "ligne TVA taux seul (−30)");
  }

  // Combo paiement + TTC
  if (tags.includes("payable") && tags.includes("ttc")) {
    score += 40;
    pushUniqueReason(reasons, "paiement + TTC sur le même contexte (+40)");
  }

  return { tags, score, reasons };
}

/** « TVA 20% » / taux sans montant monétaire → à ignorer. */
function isLikelyVatRateToken(
  line: string,
  matchIndex: number,
  matchText: string,
  value: number
): boolean {
  const commonRates = new Set([2.1, 5.5, 10, 20]);
  if (!commonRates.has(value)) return false;
  const hasMoneyDecimals = /[.,]\d{2}\b/.test(matchText);
  const hasCurrency = /€|eur|euros?/i.test(matchText);
  if (hasMoneyDecimals || hasCurrency) return false;
  const around = line.slice(
    Math.max(0, matchIndex - 12),
    Math.min(line.length, matchIndex + matchText.length + 4)
  );
  // « TVA 20% » ou « TVA 20 » immédiatement après le mot TVA
  if (/tva\s*$/i.test(line.slice(Math.max(0, matchIndex - 8), matchIndex))) {
    if (/%/.test(around) || !hasMoneyDecimals) return true;
  }
  if (/%/.test(around) && /tva/i.test(line)) return true;
  return false;
}

/** True si le token est un fragment de date (jj/mm/aaaa, etc.). */
function isDateFragment(line: string, matchIndex: number, matchText: string): boolean {
  const start = Math.max(0, matchIndex - 1);
  const end = Math.min(line.length, matchIndex + matchText.length + 1);
  const window = line.slice(start, end);
  // 24/11/2025, 24-11-2025, 24.11.2025
  if (/\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}/.test(
    line.slice(Math.max(0, matchIndex - 3), Math.min(line.length, matchIndex + matchText.length + 8))
  )) {
    return true;
  }
  // Année isolée dans une date déjà couverte ; refuse aussi 11 ou 2025 collés aux séparateurs date
  if (/[\/.\-]/.test(window) && /^\d{1,4}$/.test(matchText.trim())) {
    return true;
  }
  return false;
}

function extractAmountsFromLine(
  line: string,
  _lineIndex: number,
  absoluteOffset: number
): Array<{ value: number; raw: string; start: number; end: number }> {
  const out: Array<{ value: number; raw: string; start: number; end: number }> =
    [];
  for (const match of line.matchAll(AMOUNT_TOKEN)) {
    const rawNum = match[1] || match[0];
    const value = parseFrenchAmount(rawNum);
    if (value == null || !Number.isFinite(value)) continue;
    // Ignore années / numéros trop grands non monétaires sans décimales dans contexte capital déjà géré
    if (value >= 1000000 && !/[.,]\d{2}/.test(match[0])) continue;
    if (isDateFragment(line, match.index || 0, match[0])) continue;
    if (isLikelyVatRateToken(line, match.index || 0, match[0], value)) {
      continue;
    }
    // Années seules (1900–2100) sans décimales monétaires
    if (value >= 1900 && value <= 2100 && !/[.,]\d{2}/.test(match[0])) continue;
    const start = absoluteOffset + (match.index || 0);
    out.push({
      value,
      raw: match[0].trim(),
      start,
      end: start + match[0].length
    });
  }
  return out;
}

/**
 * Construit et score tous les candidats montant à partir du texte (analyse par lignes).
 */
export function rankAmountCandidates(text: string): RankedAmountCandidate[] {
  const lines = linesOf(text);
  const candidates: RankedAmountCandidate[] = [];
  let offset = 0;
  const full = String(text || "");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    // Contexte de la ligne courante uniquement (évite la fuite de libellés vers la ligne suivante).
    const own = scoreLineContext(line);

    const lineOffset = full.indexOf(line, offset);
    const abs = lineOffset >= 0 ? lineOffset : offset;
    if (lineOffset >= 0) offset = lineOffset + line.length;

    const onLine = extractAmountsFromLine(line, i, abs);

    // Montant sur la ligne suivante seulement si la ligne courante a un libellé
    // fort et aucun montant monétaire (ex. « Somme à payer TTC » puis « 9.99 € »,
    // ou « TVA 20% » puis « 1.66 EUR »).
    const onNext =
      onLine.length === 0 && own.tags.length
        ? extractAmountsFromLine(next, i + 1, abs + line.length + 1)
        : [];

    // Pour le cas multiligne, rescoring avec label+montant afin d’éviter
    // la pénalité « taux seul » quand le montant € est sur la ligne suivante.
    const multi =
      onNext.length > 0 ? scoreLineContext(`${line} ${next}`) : null;

    const hits =
      onNext.length > 0
        ? onNext.map((hit) => ({
            hit,
            tags: multi!.tags.length ? multi!.tags : own.tags,
            score: multi!.score,
            reasons: multi!.reasons.length ? multi!.reasons : own.reasons,
            raw: `${line} / ${next}`.trim()
          }))
        : onLine.map((hit) => ({
            hit,
            tags: own.tags,
            score: own.score,
            reasons: own.reasons,
            raw: line.trim()
          }));

    for (const item of hits) {
      let score = item.score;
      const localReasons = [...item.reasons];
      const localTags = [...item.tags];

      if (localTags.length === 0) {
        score = 5;
        pushUniqueReason(localReasons, "montant sans libellé fort (+5)");
      }

      candidates.push({
        value: item.hit.value,
        raw: item.raw.includes(item.hit.raw) ? item.raw : item.hit.raw,
        tags: localTags,
        score,
        reasons: localReasons,
        lineIndex: i,
        start: item.hit.start,
        end: item.hit.end
      });
    }
  }

  // Boost arithmétique HT + TVA ≈ TTC
  const htCands = candidates.filter((c) => c.tags.includes("ht"));
  const tvaCands = candidates.filter((c) => c.tags.includes("tva"));
  if (htCands.length && tvaCands.length) {
    // Meilleurs HT/TVA par score
    htCands.sort((a, b) => b.score - a.score);
    tvaCands.sort((a, b) => b.score - a.score);
    const ht = htCands[0].value;
    const tva = tvaCands[0].value;
    const expected = Math.round((ht + tva) * 100) / 100;

    for (const cand of candidates) {
      if (Math.abs(cand.value - expected) <= 0.02) {
        cand.score += 50;
        pushUniqueReason(
          cand.reasons,
          `cohérence HT+TVA≈montant (${ht}+${tva}≈${cand.value}) (+50)`
        );
        if (!cand.tags.includes("ttc") && !cand.tags.includes("ht") && !cand.tags.includes("tva")) {
          cand.tags.push("ttc");
          pushUniqueReason(cand.reasons, "inféré TTC via cohérence arithmétique");
        } else if (cand.tags.includes("ttc") || cand.tags.includes("payable")) {
          pushUniqueReason(cand.reasons, "confiance TTC/à payer renforcée");
        }
      }
    }
  }

  // Dédupliquer par valeur+tags principaux en gardant le meilleur score
  const byKey = new Map<string, RankedAmountCandidate>();
  for (const cand of candidates) {
    const key = `${cand.value}|${cand.tags.sort().join(",")}`;
    const prev = byKey.get(key);
    if (!prev || cand.score > prev.score) {
      byKey.set(key, cand);
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

function hasMoneyDecimals(cand: RankedAmountCandidate): boolean {
  return /[.,]\d{2}\b/.test(cand.raw) || /€|eur|euros?/i.test(cand.raw);
}

function bestByTag(
  candidates: RankedAmountCandidate[],
  tag: string,
  minScore = -Infinity
): RankedAmountCandidate | null {
  const list = candidates.filter(
    (c) =>
      c.tags.includes(tag) &&
      c.score >= minScore &&
      !c.tags.includes("capital") &&
      // Un candidat HT/TVA ne doit pas aussi être « payable » pur si un meilleur existe
      !(tag === "ht" && c.tags.includes("payable") && !c.tags.includes("ht"))
  );
  if (!list.length) return null;
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // À score égal : préférer un vrai montant monétaire (décimales / €)
    const moneyDiff = Number(hasMoneyDecimals(b)) - Number(hasMoneyDecimals(a));
    if (moneyDiff) return moneyDiff;
    return 0;
  });
  return list[0];
}

function toFinding(
  cand: RankedAmountCandidate | null,
  label: string
): LocalAmountFinding | null {
  if (!cand) return null;
  return {
    raw: cand.raw,
    value: cand.value,
    currency: "EUR",
    label,
    rank: cand.score,
    page: null
  };
}

/**
 * Sélectionne les champs montant + principal à partir du ranking sémantique.
 */
export function selectAmountFields(text: string): AmountFieldSelection {
  const candidates = rankAmountCandidates(text);

  const ht = bestByTag(candidates, "ht", 10);
  const tva = bestByTag(candidates, "tva", 10);

  // Payable d’abord, puis TTC, puis net
  const payable = bestByTag(candidates, "payable", 40);
  const ttc = bestByTag(candidates, "ttc", 40);
  const net = bestByTag(candidates, "net", 40);

  // Si cohérence arithmétique pointe vers une valeur et qu’aucun TTC/payable,
  // promouvoir le candidat cohérent.
  let amountTTC = ttc;
  let amountToPay = payable;
  const netToPay = net;

  let arithmeticOk: boolean | null = null;
  if (ht && tva) {
    const expected = Math.round((ht.value + tva.value) * 100) / 100;
    const ttcValue = amountToPay?.value ?? amountTTC?.value ?? null;
    if (ttcValue != null) {
      arithmeticOk = Math.abs(ttcValue - expected) <= 0.02;
    }
    if (!amountTTC && !amountToPay) {
      const inferred = candidates.find(
        (c) =>
          Math.abs(c.value - expected) <= 0.02 &&
          !c.tags.includes("ht") &&
          !c.tags.includes("tva") &&
          !c.tags.includes("capital")
      );
      if (inferred) {
        amountTTC = inferred;
        pushUniqueReason(
          inferred.reasons,
          "sélectionné comme TTC car HT+TVA≈valeur"
        );
      }
    }
  }

  // Principal = meilleur candidat payable/ttc/net, jamais HT/TVA/capital si mieux existe
  const principalPool = [amountToPay, amountTTC, netToPay]
    .filter(Boolean)
    .sort((a, b) => (b!.score) - (a!.score)) as RankedAmountCandidate[];

  let principal: RankedAmountCandidate | null = principalPool[0] || null;
  let principalSource: string | null = null;

  if (principal) {
    if (principal === amountToPay || principal.tags.includes("payable")) {
      principalSource = "amountToPay";
      // Aligner amountToPay sur le principal si payable
      amountToPay = amountToPay || principal;
      if (principal.tags.includes("ttc")) {
        amountTTC = amountTTC || principal;
      }
    } else if (principal.tags.includes("net")) {
      principalSource = "netToPay";
    } else {
      principalSource = "amountTTC";
      amountTTC = amountTTC || principal;
    }
  } else if (ht && !tva) {
    // Dernier recours : HT seul
    principal = ht;
    principalSource = "amountHT";
  }

  const amounts: LocalAmountFinding[] = [];
  const pushF = (f: LocalAmountFinding | null) => {
    if (f && f.value != null) amounts.push(f);
  };
  pushF(toFinding(ht, "HT"));
  pushF(toFinding(tva, "TVA"));
  pushF(toFinding(amountTTC, "TTC"));
  pushF(toFinding(amountToPay, "montant_a_payer"));
  pushF(toFinding(netToPay, "net_a_payer"));

  return {
    amountHT: ht?.value ?? null,
    amountTVA: tva?.value ?? null,
    amountTTC: amountTTC?.value ?? null,
    amountToPay: amountToPay?.value ?? null,
    netToPay: netToPay?.value ?? null,
    principal: principal?.value ?? null,
    principalSource,
    principalReasons: principal?.reasons || [],
    candidates,
    amounts,
    arithmeticOk
  };
}
