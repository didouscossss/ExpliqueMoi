/**
 * Scoring sémantique local des montants (sans IA).
 * Priorise ce que l’utilisateur doit payer (TTC / à payer) face au HT, TVA, capital, etc.
 *
 * Important : le contexte est évalué dans une FENÊTRE LOCALE autour de chaque
 * montant (pas toute la page PDF.js aplatie), sinon « au capital de » tague
 * tous les candidats et les élimine.
 */

import type { LocalAmountFinding } from "../types/LocalAnalysis.js";
import { linesOf, parseFrenchAmount } from "./normalize.js";

/** Montants monétaires FR / OCR, y compris « 9 99 € » (espace = séparateur décimal). */
/** Symbole monétaire : € / EUR / OCR « e » isolé après un montant. */
const CURRENCY_TAIL = String.raw`(?:[ \u00a0\s]*(?:€|eur|euros?|(?<![a-z])e(?![a-z])))?`;
const AMOUNT_TOKEN = new RegExp(
  String.raw`(\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d{1,3}[ \u00a0]\d{2}(?=[ \u00a0\s]*(?:€|eur|euros?|(?<![a-z])e(?![a-z])))|\d{1,3}(?:[ \u00a0]\d{3})+|\d+)${CURRENCY_TAIL}`,
  "gi"
);

/** Rayon de contexte local (caractères) — assez pour un libellé, trop peu pour toute la page. */
const CONTEXT_RADIUS_BEFORE = 56;
const CONTEXT_RADIUS_AFTER = 16;

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
  context?: string;
}

export interface AmountFieldSelection {
  amountHT: number | null;
  /** Montant TVA monétaire (€). */
  amountTVA: number | null;
  /** Taux TVA en pourcentage (ex. 20), jamais utiliséé comme montant. */
  vatRate: number | null;
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

export interface AmountPipelineDebug {
  textPreview: string;
  lineCount: number;
  keywordHits: Record<string, boolean>;
  candidates: Array<{
    value: number;
    score: number;
    tags: string[];
    reasons: string[];
    context: string;
    raw: string;
  }>;
  rejectedForPrincipal: Array<{ value: number; reason: string }>;
  selection: Omit<AmountFieldSelection, "candidates" | "amounts">;
}

function pushUniqueReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function normalizeCtx(context: string): string {
  return context
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type LabelHit = {
  tag: string;
  weight: number;
  index: number;
  reason: string;
};

function lastMatchIndex(text: string, re: RegExp): number {
  let last = -1;
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  for (const match of text.matchAll(global)) {
    last = match.index ?? last;
  }
  return last;
}

/**
 * Score par libellés les plus proches À GAUCHE du montant.
 * Sur une page PDF.js aplatie, seul le voisinage immédiat compte
 * (HT/TVA/TTC ne se contaminent plus mutuellement).
 */
export function scoreLineContext(context: string): {
  tags: string[];
  score: number;
  reasons: string[];
} {
  const c = normalizeCtx(context);
  const tags: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  const labelDefs: Array<{
    tag: string;
    re: RegExp;
    weight: number;
    reason: string;
  }> = [
    {
      tag: "payable",
      re: /(?:somme|montant|total|net|reste)\s*a\s*(?:payer|regler)|\ba\s*payer\b/g,
      weight: 100,
      reason: "libellé à payer / somme à payer (+100)"
    },
    {
      tag: "payable",
      re: /montant\s*(?:du|de)\s*prelevement/g,
      weight: 90,
      reason: "montant de prélèvement (+90)"
    },
    {
      // « total auprès d'… » / « total du montant prélevé » = total facture TTC
      tag: "payable",
      re: /total\s+aupres\s+d|total\s+du\s+montant\s+preleve|montant\s+preleve/g,
      weight: 95,
      reason: "total auprès / montant prélevé (+95)"
    },
    {
      tag: "ttc",
      re: /\bttc\b|toutes\s*taxes\s*comprises/g,
      weight: 80,
      reason: "libellé TTC (+80)"
    },
    {
      tag: "net",
      re: /\bnet\s*a\s*payer\b|\bnet\b(?=[^\n]{0,12}payer)/g,
      weight: 70,
      reason: "net à payer (+70)"
    },
    {
      tag: "ht",
      re: /\bht\b|hors\s*taxes?/g,
      weight: 20,
      reason: "libellé HT (+20)"
    },
    {
      tag: "tva",
      re: /\btva\b|\bvat\b/g,
      weight: 15,
      reason: "libellé TVA (+15)"
    },
    {
      tag: "total",
      re: /\btotal\b/g,
      weight: 35,
      reason: "total (+35)"
    },
    {
      tag: "partial",
      re: /prix\s*unitaire|\bpu\b|remise|rabais|\bprix\s*ht\b|\boptions?\b/g,
      weight: -50,
      reason: "montant partiel / unitaire (−50)"
    },
    {
      tag: "balance",
      re: /ancien\s+solde|solde\s+anterieur/g,
      weight: -40,
      reason: "ancien solde (−40)"
    },
    {
      tag: "capital",
      re: /capital(?:\s+social)?\s+de|au\s+capital/g,
      weight: -120,
      reason: "contexte capital social local (−120)"
    }
  ];

  const hits: LabelHit[] = [];
  for (const def of labelDefs) {
    const index = lastMatchIndex(c, def.re);
    if (index >= 0) {
      hits.push({
        tag: def.tag,
        weight: def.weight,
        index,
        reason: def.reason
      });
    }
  }

  if (!hits.length) {
    return { tags, score, reasons };
  }

  hits.sort((a, b) => b.index - a.index);
  const closest = hits[0];
  // Fenêtre de proximité : libellés dans les ~28 car. du plus proche
  const NEAR = 28;
  const nearby = hits.filter((h) => closest.index - h.index <= NEAR);

  // Buckets mutuellement exclusifs HT / TVA / TTC : ne garder que le plus proche
  // parmi ces trois, sauf combo payable+TTC.
  const moneyBucket = nearby.filter((h) =>
    ["ht", "tva", "ttc"].includes(h.tag)
  );
  let chosenMoney: LabelHit | null = moneyBucket[0] || null;

  for (const hit of nearby) {
    if (["ht", "tva", "ttc"].includes(hit.tag)) {
      if (!chosenMoney || hit.tag === chosenMoney.tag) {
        if (!tags.includes(hit.tag)) {
          tags.push(hit.tag);
          score += hit.weight;
          pushUniqueReason(reasons, hit.reason);
        }
      }
      continue;
    }
    if (!tags.includes(hit.tag)) {
      tags.push(hit.tag);
      score += hit.weight;
      pushUniqueReason(reasons, hit.reason);
    } else if (hit.tag === "payable" && hit.weight > 0) {
      // déjà tagué payable — ignore doublon
    }
  }

  // total HT : bonus si total + ht proches
  if (tags.includes("ht") && nearby.some((h) => h.tag === "total")) {
    score += 25;
    pushUniqueReason(reasons, "total HT (+25)");
  }
  // total générique sans HT déjà scoré via tag total ; retire total si HT/TTC présent
  if (
    tags.includes("total") &&
    (tags.includes("ht") || tags.includes("ttc") || tags.includes("payable"))
  ) {
    // le poids total peut doubler avec TTC — OK pour ranking payable
  }

  if (tags.includes("payable") && tags.includes("ttc")) {
    score += 40;
    pushUniqueReason(reasons, "paiement + TTC sur le même contexte (+40)");
  }

  return { tags, score, reasons };
}

/**
 * Nombre associé à % / pourcent / taux → rate, jamais montant monétaire.
 * Couvre « TVA [20.00%] 1.66 € » : seul 20.00 est un taux ; 1.66 reste un montant.
 * Règle : le % doit être IMMÉDIATEMENT après ce token (pas un % plus tôt sur la ligne).
 */
function isLikelyVatRateToken(
  line: string,
  matchIndex: number,
  matchText: string,
  _value: number
): boolean {
  // Symbole monétaire collé au token → montant, pas taux
  if (/€|eur|euros?|(?:^|\s)e(?:\s|$)/i.test(matchText)) return false;

  const after = line.slice(
    matchIndex + matchText.length,
    matchIndex + matchText.length + 12
  );

  // « 20% », « 20.00% », « 20 % », « 20 %] », « 20%] »
  if (/^\s*%/.test(after)) return true;
  if (/^\s*\]\s*%/.test(after)) return true;
  if (/^\s*%\s*\]/.test(after)) return true;

  // Nombre à l’intérieur de [20.00%] : après le nombre on a « %] » ou « % »
  // déjà couvert ; aussi « 20.00%] » si le [ est avant
  const before = line.slice(Math.max(0, matchIndex - 4), matchIndex);
  if (/\[/.test(before) && /^\s*%\s*\]/.test(after)) return true;
  if (/\[/.test(before) && /^\s*%/.test(after)) return true;

  // « 20 pourcent » / « taux 20 »
  if (/^\s*(?:pour\s*cent|pourcentage)\b/i.test(after)) return true;
  if (
    /\btaux\b/i.test(before + matchText) &&
    /^\s*%/.test(after)
  ) {
    return true;
  }

  return false;
}

/** Extrait les taux de TVA (%) présents dans le texte. */
export function extractVatRates(text: string): number[] {
  const rates: number[] = [];
  const seen = new Set<number>();
  const patterns = [
    /(?:tva|vat|taux(?:\s*(?:de\s*)?tva)?)\s*[[(:]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gi,
    /(?:tva|vat)\s+est\s+de\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gi,
    /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*\]?\s*(?:tva|vat|t\.?\s*v\.?\s*a)/gi,
    /\[(\d{1,2}(?:[.,]\d{1,2})?)\s*%\]/gi,
    /\((\d{1,2}(?:[.,]\d{1,2})?)\s*%\)/gi
  ];
  for (const re of patterns) {
    for (const match of String(text || "").matchAll(re)) {
      const raw = String(match[1] || "").replace(",", ".");
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0 || value > 100) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      rates.push(value);
    }
  }
  return rates;
}

function isDateFragment(
  line: string,
  matchIndex: number,
  matchText: string
): boolean {
  if (
    /\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}/.test(
      line.slice(
        Math.max(0, matchIndex - 3),
        Math.min(line.length, matchIndex + matchText.length + 8)
      )
    )
  ) {
    return true;
  }
  const window = line.slice(
    Math.max(0, matchIndex - 1),
    Math.min(line.length, matchIndex + matchText.length + 1)
  );
  if (/[\/.\-]/.test(window) && /^\d{1,4}$/.test(matchText.trim())) {
    return true;
  }
  return false;
}

function parseAmountToken(rawNum: string, fullMatch: string): number | null {
  // OCR « 9 99 € » → 9.99
  const spacedCents = String(rawNum || "").match(
    /^(\d{1,3})[ \u00a0](\d{2})$/
  );
  if (spacedCents && /€|eur|euros?/i.test(fullMatch)) {
    return Number(`${spacedCents[1]}.${spacedCents[2]}`);
  }
  return parseFrenchAmount(rawNum);
}

function extractAmountsFromText(
  text: string
): Array<{ value: number; raw: string; start: number; end: number }> {
  const out: Array<{ value: number; raw: string; start: number; end: number }> =
    [];
  const line = String(text || "");
  for (const match of line.matchAll(AMOUNT_TOKEN)) {
    const rawNum = match[1] || match[0];
    const value = parseAmountToken(rawNum, match[0]);
    if (value == null || !Number.isFinite(value)) continue;
    // Capital social / très grands entiers sans décimales monétaires
    if (value >= 1000000 && !/[.,]\d{2}/.test(match[0]) && !/[ \u00a0]\d{2}\s*(?:€|eur)/i.test(match[0])) {
      continue;
    }
    if (isDateFragment(line, match.index || 0, match[0])) continue;
    if (isLikelyVatRateToken(line, match.index || 0, match[0], value)) continue;
    if (value >= 1900 && value <= 2100 && !/[.,]\d{2}/.test(match[0])) continue;
    const start = match.index || 0;
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
 * Contexte de classification = même ligne, texte À GAUCHE du montant,
 * plus un suffixe immédiat À DROITE (ex. « 21,66 € HT », « 25,99 € TTC »).
 * Sur texte multiligne, ne remonte pas à la ligne précédente (sinon
 * « Montant HT » pollue le scoring de « TVA : 20 € »).
 * Sur texte PDF.js aplati (une seule ligne), le rayon limite la portée.
 * La passe multiligne dédiée gère libellé → montant ligne suivante.
 */
function classificationContext(
  full: string,
  start: number,
  end: number,
  prevLine: string,
  nextLine: string
): { classify: string; display: string; after: string } {
  const lineStart = full.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const from = Math.max(lineStart, start - CONTEXT_RADIUS_BEFORE);
  const before = full.slice(from, start);
  const after = full.slice(end, Math.min(full.length, end + CONTEXT_RADIUS_AFTER));
  const classify = before;
  const display = [prevLine.slice(-24), before, after, nextLine.slice(0, 24)]
    .filter(Boolean)
    .join(" ");
  return { classify, display, after };
}

/** Libellé HT/TTC/TVA immédiatement après le montant — même ligne uniquement. */
function immediateSuffixMoneyTag(
  after: string
): { tag: "ht" | "ttc" | "tva"; weight: number; reason: string } | null {
  // Pas de \n : « 21,66 €\nTVA : 20 % » ≠ suffixe du montant.
  // Pas de nouveau champ / taux : « 8.33 € TVA : 1.66 » ou « 8.33 € TVA [20%] ».
  const m = String(after || "").match(
    /^[ \t\u00a0]*(?:€|eur|euros?|(?<![a-z])e(?![a-z]))?[ \t\u00a0]*(ttc|ht|tva)\b(?![ \t\u00a0]*[:\[]|[ \t\u00a0]*\d)/i
  );
  if (!m) return null;
  const tag = m[1].toLowerCase() as "ht" | "ttc" | "tva";
  if (tag === "ttc") {
    return { tag, weight: 80, reason: "suffixe TTC après montant (+80)" };
  }
  if (tag === "ht") {
    return { tag, weight: 20, reason: "suffixe HT après montant (+20)" };
  }
  return { tag, weight: 15, reason: "suffixe TVA après montant (+15)" };
}

function assignColumnRolesToAmounts(
  text: string,
  headerMatch: RegExpMatchArray,
  roles: Array<"ht" | "tva" | "ttc">,
  candidates: RankedAmountCandidate[],
  reasonPrefix: string
): void {
  const headerEnd = (headerMatch.index || 0) + headerMatch[0].length;
  // Fenêtre assez large : en-têtes souvent 1–2 lignes au-dessus des montants
  const after = text.slice(headerEnd, headerEnd + 320);
  const amounts = extractAmountsFromText(after).filter((a) =>
    /[.,]\d{2}/.test(a.raw)
  );
  if (amounts.length < roles.length) return;

  for (let i = 0; i < roles.length; i += 1) {
    const absStart = headerEnd + amounts[i].start;
    const role = roles[i];
    let cand =
      candidates.find(
        (c) =>
          c.start != null &&
          Math.abs(c.start - absStart) <= 2 &&
          Math.abs(c.value - amounts[i].value) < 0.001
      ) || null;
    // Repli : même valeur non encore assignée à ce rôle
    if (!cand) {
      cand =
        candidates.find(
          (c) =>
            Math.abs(c.value - amounts[i].value) < 0.001 &&
            !c.tags.includes(role)
        ) || null;
    }
    if (!cand) continue;

    cand.tags = cand.tags.filter(
      (t) => !["ht", "tva", "ttc", "offer", "partial", "payable"].includes(t)
    );
    cand.tags.push(role);
    if (role === "ttc") cand.tags.push("payable");

    let score = 8;
    if (role === "ht") {
      score += 50;
      pushUniqueReason(cand.reasons, `${reasonPrefix} HT (+50)`);
    } else if (role === "tva") {
      score += 30;
      pushUniqueReason(cand.reasons, `${reasonPrefix} TVA (+30)`);
    } else {
      score += 100;
      pushUniqueReason(cand.reasons, `${reasonPrefix} TTC (+100)`);
    }
    // Ne pas laisser une pénalité offre/partial écraser le total facture
    cand.score = Math.max(cand.score, score);
  }
}

/**
 * En-têtes colonnes HT/TVA/TTC ou HT/TTC suivis des montants (layout télécom).
 */
function applyColumnHeaderRoles(
  full: string,
  candidates: RankedAmountCandidate[]
): void {
  const text = String(full || "");

  // 1) HT TVA TTC → 3 montants
  for (const match of text.matchAll(/\bht\b[\s\/.|:]*\btva\b[\s\/.|:]*\bttc\b/gi)) {
    assignColumnRolesToAmounts(
      text,
      match,
      ["ht", "tva", "ttc"],
      candidates,
      "colonne (ordre HT/TVA/TTC)"
    );
  }

  // 2) HT TTC → 2 montants (ex. « HT TTC » puis « total auprès d'… 21,66 25,99 »)
  for (const match of text.matchAll(/\bht\b[\s\/.|:]*\bttc\b/gi)) {
    // Évite le sous-match de « HT TVA TTC »
    const slice = match[0].replace(/\s+/g, " ");
    if (/\btva\b/i.test(slice)) continue;
    assignColumnRolesToAmounts(
      text,
      match,
      ["ht", "ttc"],
      candidates,
      "colonne (ordre HT/TTC)"
    );
  }

  // 3) Même ligne : « total auprès d'X 21,66 25,99 » → HT puis TTC
  for (const match of text.matchAll(
    /total\s+aupr[eè]s\s+d['’]?[^\n\d]{0,40}?(\d+[.,]\d{2})\s+(\d+[.,]\d{2})/gi
  )) {
    const htVal = parseFrenchAmount(match[1]);
    const ttcVal = parseFrenchAmount(match[2]);
    if (htVal == null || ttcVal == null || htVal >= ttcVal) continue;
    const htCand = candidates.find((c) => Math.abs(c.value - htVal) < 0.001);
    const ttcCand = candidates.find((c) => Math.abs(c.value - ttcVal) < 0.001);
    if (htCand) {
      htCand.tags = htCand.tags.filter(
        (t) => !["ttc", "payable", "offer", "partial", "tva"].includes(t)
      );
      if (!htCand.tags.includes("ht")) htCand.tags.push("ht");
      if (!htCand.tags.includes("total")) htCand.tags.push("total");
      htCand.score = Math.max(htCand.score, 70);
      pushUniqueReason(
        htCand.reasons,
        "paire HT/TTC après « total auprès » (+HT)"
      );
    }
    if (ttcCand) {
      ttcCand.tags = ttcCand.tags.filter(
        (t) => !["ht", "offer", "partial", "tva"].includes(t)
      );
      if (!ttcCand.tags.includes("ttc")) ttcCand.tags.push("ttc");
      if (!ttcCand.tags.includes("payable")) ttcCand.tags.push("payable");
      ttcCand.score = Math.max(ttcCand.score, 120);
      pushUniqueReason(
        ttcCand.reasons,
        "paire HT/TTC après « total auprès » (+TTC)"
      );
    }
  }
}

function looksLikeOfferContext(before: string): boolean {
  const c = normalizeCtx(before);
  return (
    /\b(forfait|abonnement|offre|option|pack|promo(?:tion)?)\b/.test(c) &&
    !/\b(total|somme|montant|ttc|a\s*payer|facture)\b/.test(c.slice(-40))
  );
}

function lineIndexAt(lines: string[], offset: number, full: string): number {
  let acc = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const idx = full.indexOf(lines[i], acc);
    if (idx < 0) continue;
    if (offset >= idx && offset <= idx + lines[i].length) return i;
    acc = idx + lines[i].length;
  }
  return 0;
}

/**
 * Construit et score tous les candidats montant (fenêtre locale par montant).
 */
export function rankAmountCandidates(text: string): RankedAmountCandidate[] {
  const full = String(text || "");
  const lines = linesOf(full);
  const hits = extractAmountsFromText(full);
  const candidates: RankedAmountCandidate[] = [];

  for (const hit of hits) {
    const li = lineIndexAt(lines, hit.start, full);
    const prev = lines[li - 1] || "";
    const next = lines[li + 1] || "";
    const { classify, display, after } = classificationContext(
      full,
      hit.start,
      hit.end,
      prev,
      next
    );
    const { tags, score: baseScore, reasons } = scoreLineContext(classify);

    let score = baseScore;
    const localReasons = [...reasons];
    let localTags = [...tags];
    const monetary =
      /€|eur|euros?/i.test(hit.raw) ||
      /[.,]\d{2}\b/.test(hit.raw) ||
      /\d[ \u00a0]\d{2}\b/.test(hit.raw);

    // Suffixe immédiat « 21,66 € HT » / « 25,99 € TTC » : prioritaire sur le gauche
    const suffix = immediateSuffixMoneyTag(after);
    if (suffix && monetary) {
      localTags = localTags.filter((t) => !["ht", "tva", "ttc"].includes(t));
      // Retirer les poids HT/TVA/TTC déjà comptés à gauche (recalcul propre)
      score = localTags.reduce((acc, t) => {
        if (t === "payable") return acc + 100;
        if (t === "net") return acc + 70;
        if (t === "total") return acc + 35;
        if (t === "partial") return acc - 50;
        if (t === "balance") return acc - 40;
        if (t === "capital") return acc - 120;
        return acc;
      }, 0);
      localTags.push(suffix.tag);
      score += suffix.weight;
      pushUniqueReason(localReasons, suffix.reason);
      if (suffix.tag === "ht" && localTags.includes("total")) {
        score += 25;
        pushUniqueReason(localReasons, "total HT (+25)");
      }
    }

    // Entiers sans forme monétaire (n° de ligne, etc.) : jamais HT/TVA/TTC/payable
    if (!monetary) {
      localTags = localTags.filter(
        (t) => !["ht", "tva", "ttc", "payable", "net", "total"].includes(t)
      );
      score = 5;
      pushUniqueReason(
        localReasons,
        "entier non monétaire (réf./ligne) — tags facture ignorés (+5)"
      );
    } else if (localTags.length === 0) {
      score = 5;
      pushUniqueReason(localReasons, "montant monétaire sans libellé fort (+5)");
    }
    if (monetary) {
      score += 8;
      pushUniqueReason(localReasons, "forme monétaire (€ / décimales) (+8)");
    }

    // Prix d’offre / forfait : ce n’est pas un total facture par défaut
    if (
      monetary &&
      looksLikeOfferContext(classify) &&
      !localTags.includes("ttc") &&
      !localTags.includes("payable") &&
      !localTags.includes("ht")
    ) {
      if (!localTags.includes("offer")) localTags.push("offer");
      score -= 45;
      pushUniqueReason(
        localReasons,
        "contexte offre/forfait (pas un total facture) (−45)"
      );
    }

    candidates.push({
      value: hit.value,
      raw: hit.raw,
      tags: localTags,
      score,
      reasons: localReasons,
      lineIndex: li,
      start: hit.start,
      end: hit.end,
      context: display.replace(/\s+/g, " ").trim()
    });
  }

  // Aussi : libellé seul sur une ligne + montant sur la suivante (OCR PDF).
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    const labelScore = scoreLineContext(line);
    if (!labelScore.tags.length) continue;
    if (extractAmountsFromText(line).length) continue;
    const nextHits = extractAmountsFromText(next);
    if (!nextHits.length) continue;
    const multi = scoreLineContext(`${line} ${next}`);
    for (const hit of nextHits) {
      const exists = candidates.some(
        (c) =>
          c.value === hit.value &&
          Math.abs((c.start || 0) - (full.indexOf(next) + hit.start)) < 3
      );
      if (exists) {
        // Renforce le candidat déjà vu avec le libellé de la ligne précédente.
        for (const c of candidates) {
          if (c.value === hit.value && c.score < multi.score) {
            c.score = multi.score + (/€|eur/i.test(hit.raw) ? 8 : 0);
            c.tags = [...new Set([...c.tags, ...multi.tags])];
            for (const r of multi.reasons) pushUniqueReason(c.reasons, r);
            pushUniqueReason(c.reasons, "libellé ligne précédente / montant ligne suivante");
          }
        }
        continue;
      }
      candidates.push({
        value: hit.value,
        raw: `${line} / ${next}`.trim(),
        tags: [...multi.tags],
        score: multi.score + (/€|eur/i.test(hit.raw) ? 8 : 0),
        reasons: [
          ...multi.reasons,
          "libellé ligne précédente / montant ligne suivante"
        ],
        lineIndex: i,
        start: null,
        end: null,
        context: `${line} ${next}`.replace(/\s+/g, " ").trim()
      });
    }
  }

  // Colonnes HT / TVA / TTC (layout tableau) avant le boost arithmétique.
  applyColumnHeaderRoles(full, candidates);

  // Boost arithmétique HT+TVA€≈TTC et/ou HT×(1+taux%)≈TTC (renforce, n’élimine pas).
  applyArithmeticBoost(candidates, extractVatRates(full)[0] ?? null);

  // Dédupliquer par valeur : max score + union des tags/raisons
  // (ex. « Total TTC 9,99 » + « Montant à payer : 9,99 » → payable+ttc).
  // Si une occurrence est une offre et une autre un total TTC, garder le total.
  const byValue = new Map<number, RankedAmountCandidate>();
  for (const cand of candidates) {
    const prev = byValue.get(cand.value);
    if (!prev) {
      byValue.set(cand.value, { ...cand, tags: [...cand.tags], reasons: [...cand.reasons] });
      continue;
    }
    const invoiceTotalTags = (c: RankedAmountCandidate) =>
      c.tags.includes("ttc") ||
      c.tags.includes("payable") ||
      (c.tags.includes("total") && !c.tags.includes("offer") && !c.tags.includes("partial"));
    const isOfferLike = (c: RankedAmountCandidate) =>
      c.tags.includes("offer") || c.tags.includes("partial");

    // Union des tags, mais une occurrence total facture purge offre/partial
    if (invoiceTotalTags(cand) && isOfferLike(prev)) {
      prev.tags = prev.tags.filter((t) => t !== "offer" && t !== "partial");
    }
    if (invoiceTotalTags(prev) && isOfferLike(cand)) {
      // ne pas importer offer/partial depuis l’offre
      prev.tags = [...new Set([...prev.tags, ...cand.tags.filter((t) => t !== "offer" && t !== "partial")])];
    } else {
      prev.tags = [...new Set([...prev.tags, ...cand.tags])];
    }
    for (const r of cand.reasons) pushUniqueReason(prev.reasons, r);
    const preferCand =
      cand.score > prev.score ||
      (invoiceTotalTags(cand) && isOfferLike(prev)) ||
      (cand.tags.includes("ttc") &&
        !prev.tags.includes("ttc") &&
        cand.score >= prev.score - 20) ||
      (prev.tags.includes("offer") &&
        !cand.tags.includes("offer") &&
        (cand.tags.includes("ttc") || cand.tags.includes("payable")));
    if (preferCand) {
      prev.score = Math.max(prev.score, cand.score);
      if (invoiceTotalTags(cand)) {
        prev.tags = prev.tags.filter((t) => t !== "offer" && t !== "partial");
        prev.score = Math.max(prev.score, cand.score);
      }
      prev.raw = cand.raw;
      prev.context = cand.context;
      prev.start = cand.start;
      prev.end = cand.end;
      prev.lineIndex = cand.lineIndex;
    }
    // Recalcule le combo payable+TTC si les tags viennent d’occurrences distinctes
    if (
      prev.tags.includes("payable") &&
      prev.tags.includes("ttc") &&
      !prev.reasons.some((r) => /paiement \+ TTC/.test(r))
    ) {
      prev.score += 40;
      pushUniqueReason(prev.reasons, "paiement + TTC sur le même contexte (+40)");
    }
  }

  return [...byValue.values()].sort((a, b) => b.score - a.score);
}

function promoteAsTtc(
  cand: RankedAmountCandidate,
  reason: string,
  boost: number
): void {
  cand.score += boost;
  pushUniqueReason(cand.reasons, reason);
  // Un montant cohérent avec HT×taux / HT+TVA n’est pas un montant TVA
  if (cand.tags.includes("tva") && !cand.tags.includes("ttc")) {
    cand.tags = cand.tags.filter((t) => t !== "tva");
  }
  if (cand.tags.includes("offer")) {
    cand.tags = cand.tags.filter((t) => t !== "offer");
  }
  if (!cand.tags.includes("ttc") && !cand.tags.includes("ht")) {
    cand.tags.push("ttc");
    pushUniqueReason(cand.reasons, "inféré TTC via cohérence arithmétique");
  } else if (cand.tags.includes("ttc") || cand.tags.includes("payable")) {
    pushUniqueReason(cand.reasons, "confiance TTC/à payer renforcée");
  }
}

function applyArithmeticBoost(
  candidates: RankedAmountCandidate[],
  vatRate: number | null
): void {
  const htCands = candidates
    .filter(
      (c) =>
        c.tags.includes("ht") &&
        !c.tags.includes("capital") &&
        !c.tags.includes("ttc") &&
        !c.tags.includes("payable")
    )
    .sort((a, b) => b.score - a.score);
  if (!htCands.length) return;
  const ht = htCands[0];

  // 1) HT + montant TVA (€) ≈ TTC
  const tvaCands = candidates
    .filter(
      (c) =>
        c.tags.includes("tva") &&
        !c.tags.includes("capital") &&
        c.value !== ht.value &&
        // Exclure un faux « montant TVA » qui est en réalité le TTC
        !(vatRate != null && Math.abs(c.value - ht.value * (1 + vatRate / 100)) <= 0.05)
    )
    .sort((a, b) => b.score - a.score);
  if (tvaCands.length) {
    const tva = tvaCands[0];
    const expectedSum = Math.round((ht.value + tva.value) * 100) / 100;
    for (const cand of candidates) {
      if (cand.value === ht.value || cand.value === tva.value) continue;
      if (Math.abs(cand.value - expectedSum) <= 0.02) {
        promoteAsTtc(
          cand,
          `cohérence HT+TVA≈montant (${ht.value}+${tva.value}≈${cand.value}) (+50)`,
          50
        );
      }
    }
  }

  // 2) HT × (1 + taux/100) ≈ TTC — générique, sans montant TVA requis
  if (vatRate != null && vatRate > 0 && vatRate <= 100) {
    const expectedRate =
      Math.round(ht.value * (1 + vatRate / 100) * 100) / 100;
    for (const cand of candidates) {
      if (cand.value === ht.value) continue;
      if (Math.abs(cand.value - expectedRate) <= 0.02) {
        promoteAsTtc(
          cand,
          `cohérence HT×(1+TVA%)≈montant (${ht.value}×${(1 + vatRate / 100).toFixed(2)}≈${cand.value}) (+55)`,
          55
        );
      }
    }
  }
}

function hasMoneyCurrency(cand: RankedAmountCandidate): boolean {
  return (
    /€|eur|euros?/i.test(cand.raw) ||
    /\d[.,]\d{2}\s*e\b/i.test(cand.raw) ||
    /€|eur|euros?|\d[.,]\d{2}\s*e\b/i.test(cand.context || "")
  );
}

function hasMoneyDecimals(cand: RankedAmountCandidate): boolean {
  return (
    /[.,]\d{2}\b/.test(cand.raw) ||
    /[ \u00a0]\d{2}\b/.test(cand.raw) ||
    hasMoneyCurrency(cand)
  );
}

/**
 * Sélectionne le meilleur candidat pour un tag.
 * N’élimine PAS un montant monétaire pour incertitude de classification :
 * le tag capital n’exclut que s’il n’y a aucun autre signal facture.
 */
function bestByTag(
  candidates: RankedAmountCandidate[],
  tag: string,
  minScore = -Infinity
): RankedAmountCandidate | null {
  const list = candidates.filter((c) => {
    if (!c.tags.includes(tag) || c.score < minScore) return false;
    // Capital pur (sans autre tag utile) → jamais choisi comme HT/TTC/payable
    if (
      c.tags.includes("capital") &&
      !c.tags.includes("payable") &&
      !c.tags.includes("ttc") &&
      !c.tags.includes("ht") &&
      !c.tags.includes("tva") &&
      !c.tags.includes("net")
    ) {
      return false;
    }
    return true;
  });
  if (!list.length) return null;

  // Préfère le candidat « pur » pour le tag demandé
  // (HT sans TVA/TTC/payable ; TVA sans HT/TTC/payable).
  list.sort((a, b) => {
    const purity = (c: RankedAmountCandidate): number => {
      if (tag === "ht") {
        return Number(
          !c.tags.includes("tva") &&
            !c.tags.includes("ttc") &&
            !c.tags.includes("payable")
        );
      }
      if (tag === "tva") {
        return Number(
          !c.tags.includes("ht") &&
            !c.tags.includes("ttc") &&
            !c.tags.includes("payable")
        );
      }
      if (tag === "ttc" || tag === "payable") {
        return Number(!c.tags.includes("ht") || c.tags.includes("payable") || c.tags.includes("ttc"));
      }
      return 0;
    };
    const purityDiff = purity(b) - purity(a);
    if (purityDiff) return purityDiff;
    if (b.score !== a.score) return b.score - a.score;
    return Number(hasMoneyDecimals(b)) - Number(hasMoneyDecimals(a));
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
    page: null,
    reasons: cand.reasons
  };
}

function expectedTtcFromHtRate(ht: number, vatRate: number): number {
  return Math.round(ht * (1 + vatRate / 100) * 100) / 100;
}

/**
 * Sélectionne les champs montant + principal à partir du ranking sémantique.
 */
export function selectAmountFields(text: string): AmountFieldSelection {
  const candidates = rankAmountCandidates(text);
  const vatRates = extractVatRates(text);
  const vatRate = vatRates[0] ?? null;

  // Seuils bas (y compris scores légèrement négatifs dus à un taux % voisin) :
  // un montant monétaire classé reste éligible ; le score départage.
  const ht = bestByTag(candidates, "ht", -50);

  const rateConsistentTtc =
    ht && vatRate != null
      ? candidates.find(
          (c) =>
            c.value !== ht.value &&
            !c.tags.includes("capital") &&
            Math.abs(c.value - expectedTtcFromHtRate(ht.value, vatRate)) <= 0.02
        ) || null
      : null;

  // Montant TVA : jamais un taux % ; jamais un TTC cohérent avec HT×taux.
  const tvaCandidates = candidates.filter((c) => {
    if (!c.tags.includes("tva")) return false;
    if (vatRate != null && Math.abs(c.value - vatRate) < 0.001 && !hasMoneyCurrency(c)) {
      return false;
    }
    if (
      ht &&
      vatRate != null &&
      Math.abs(c.value - expectedTtcFromHtRate(ht.value, vatRate)) <= 0.02
    ) {
      return false;
    }
    if (c.tags.includes("ttc") || c.tags.includes("payable")) return false;
    return hasMoneyDecimals(c) || hasMoneyCurrency(c);
  });
  let tva: RankedAmountCandidate | null =
    tvaCandidates.sort((a, b) => b.score - a.score)[0] || null;

  const payable = bestByTag(candidates, "payable", -50);
  let ttc = bestByTag(candidates, "ttc", -50);
  const net = bestByTag(candidates, "net", -50);

  // Si le meilleur « TTC » est en réalité le HT, préférer le candidat cohérent
  if (ht && ttc && ttc.value === ht.value && rateConsistentTtc) {
    ttc = rateConsistentTtc;
  }
  if (!ttc && rateConsistentTtc) {
    ttc = rateConsistentTtc;
    pushUniqueReason(
      rateConsistentTtc.reasons,
      "sélectionné comme TTC car HT×(1+TVA%)≈valeur"
    );
    if (!rateConsistentTtc.tags.includes("ttc")) {
      rateConsistentTtc.tags.push("ttc");
    }
  }

  let amountTTC = ttc;
  let amountToPay = payable;
  const netToPay = net;

  let arithmeticOk: boolean | null = null;
  if (ht && tva && ht.value !== tva.value) {
    const expected = Math.round((ht.value + tva.value) * 100) / 100;
    const ttcValue = amountToPay?.value ?? amountTTC?.value ?? null;
    if (ttcValue != null) {
      arithmeticOk = Math.abs(ttcValue - expected) <= 0.02;
    }
    if (!amountTTC && !amountToPay) {
      const inferred = candidates.find(
        (c) =>
          Math.abs(c.value - expected) <= 0.02 &&
          c.value !== ht.value &&
          c.value !== tva!.value &&
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
  } else if (ht && vatRate != null && (amountTTC || amountToPay || rateConsistentTtc)) {
    const expected = expectedTtcFromHtRate(ht.value, vatRate);
    const ttcValue =
      amountToPay?.value ?? amountTTC?.value ?? rateConsistentTtc?.value ?? null;
    if (ttcValue != null) {
      arithmeticOk = Math.abs(ttcValue - expected) <= 0.02;
    }
    // Ne pas inventer amountTVA s’il n’apparaît pas dans le document :
    // le taux seul + cohérence HT×(1+taux) suffit pour valider le TTC.
  }

  const principalPool = [amountToPay, amountTTC, netToPay]
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score) as RankedAmountCandidate[];

  let principal: RankedAmountCandidate | null = principalPool[0] || null;
  let principalSource: string | null = null;

  if (principal) {
    if (principal === amountToPay || principal.tags.includes("payable")) {
      principalSource = "amountToPay";
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
  } else if (rateConsistentTtc) {
    principal = rateConsistentTtc;
    principalSource = "amountTTC";
    amountTTC = amountTTC || rateConsistentTtc;
    pushUniqueReason(
      rateConsistentTtc.reasons,
      "principal = TTC cohérent HT×(1+TVA%)"
    );
  } else {
    // Fallback : meilleur candidat monétaire non-HT / non-TVA / non-offre
    const fallback = candidates.find(
      (c) =>
        hasMoneyDecimals(c) &&
        !c.tags.includes("tva") &&
        !c.tags.includes("ht") &&
        !c.tags.includes("capital") &&
        !c.tags.includes("partial") &&
        !c.tags.includes("offer") &&
        c.score >= 5
    );
    if (fallback) {
      principal = fallback;
      principalSource = "amountTTC";
      amountTTC = amountTTC || fallback;
      pushUniqueReason(
        fallback.reasons,
        "fallback : meilleur montant monétaire conservé"
      );
    } else if (ht) {
      principal = ht;
      principalSource = "amountHT";
    }
  }

  // Ne jamais laisser le HT gagner s’il existe un TTC arithmétiquement cohérent
  if (
    principal &&
    ht &&
    principal.value === ht.value &&
    rateConsistentTtc &&
    rateConsistentTtc.value !== ht.value
  ) {
    principal = rateConsistentTtc;
    principalSource = "amountTTC";
    amountTTC = rateConsistentTtc;
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
  // Ne PAS pousser les candidats orphelins (label « autre ») :
  // ils polluaient EvidenceBuilder avec des nombres isolés (ex. « 16.79 »).

  return {
    amountHT: ht?.value ?? null,
    amountTVA: tva?.value ?? null,
    vatRate,
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

/** Diagnostic pipeline montants (pour debug Preview / tests). */
export function debugAmountPipeline(text: string): AmountPipelineDebug {
  const full = String(text || "");
  const selection = selectAmountFields(full);
  const keywordHits: Record<string, boolean> = {
    "9,99": /9[,.]99/.test(full),
    "9.99": /9\.99/.test(full),
    "8,33": /8[,.]33/.test(full),
    "8.33": /8\.33/.test(full),
    "1,66": /1[,.]66/.test(full),
    "1.66": /1\.66/.test(full),
    TTC: /\bttc\b/i.test(full),
    HT: /\bht\b/i.test(full),
    TVA: /\btva\b/i.test(full),
    payer: /payer/i.test(full),
    prelevement: /pr[ée]l[èe]vement/i.test(full)
  };

  const rejectedForPrincipal: Array<{ value: number; reason: string }> = [];
  for (const c of selection.candidates) {
    if (selection.principal != null && c.value === selection.principal) continue;
    let reason = `score ${c.score} < gagnant`;
    if (c.tags.includes("capital")) reason = "capital social";
    else if (c.tags.includes("tva") && !c.tags.includes("payable"))
      reason = "TVA (pas principal)";
    else if (c.tags.includes("ht") && !c.tags.includes("payable") && !c.tags.includes("ttc"))
      reason = "HT (priorité inférieure)";
    else if (c.tags.includes("partial")) reason = "montant partiel";
    rejectedForPrincipal.push({ value: c.value, reason });
  }

  return {
    textPreview: full.slice(0, 500),
    lineCount: linesOf(full).length,
    keywordHits,
    candidates: selection.candidates.map((c) => ({
      value: c.value,
      score: c.score,
      tags: c.tags,
      reasons: c.reasons,
      context: c.context || "",
      raw: c.raw
    })),
    rejectedForPrincipal,
    selection: {
      amountHT: selection.amountHT,
      amountTVA: selection.amountTVA,
      vatRate: selection.vatRate,
      amountTTC: selection.amountTTC,
      amountToPay: selection.amountToPay,
      netToPay: selection.netToPay,
      principal: selection.principal,
      principalSource: selection.principalSource,
      principalReasons: selection.principalReasons,
      arithmeticOk: selection.arithmeticOk
    }
  };
}
