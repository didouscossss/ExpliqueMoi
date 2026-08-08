/**
 * EvidenceBuilder V3 — passages importants = extraits verbatim du texte/OCR.
 * Aucune reformulation IA.
 *
 * Règle : chaque preuve est liée à un champ structuré retenu, avec un
 * contexte OCR compréhensible (pas un nombre isolé).
 */

import type {
  LocalAnalysis,
  LocalAmountFinding,
  LocalEvidenceSpan
} from "../types/LocalAnalysis.js";
import type { OCRResult } from "../types/OCRResult.js";
import { selectPrincipalAmountValue } from "./extractors.js";
import { linesOf } from "./normalize.js";

const SEMANTIC_HINT =
  /facture|devis|n[°o]|total|montant|somme|payer|r[eé]gler|ht|ttc|tva|net|date|émission|emise|pr[eé]l[eè]vement|échéance|iban|siret|client|émetteur|emetteur|taux/i;

function findInText(
  fullText: string,
  needle: string
): { start: number; end: number } | null {
  if (!needle) return null;
  const idx = fullText.indexOf(needle);
  if (idx >= 0) {
    return { start: idx, end: idx + needle.length };
  }
  const compactNeedle = needle.replace(/\s+/g, " ").trim();
  const compactFull = fullText.replace(/\s+/g, " ");
  const compactIdx = compactFull.indexOf(compactNeedle);
  if (compactIdx < 0) return null;
  return { start: compactIdx, end: compactIdx + compactNeedle.length };
}

function findPage(
  pages: Array<{ pageNumber: number; text: string }> | undefined,
  quote: string
): number | null {
  if (!pages?.length || !quote) return null;
  for (const page of pages) {
    if (page.text && page.text.includes(quote)) {
      return page.pageNumber;
    }
    const compactQuote = quote.replace(/\s+/g, " ").trim();
    if (page.text?.replace(/\s+/g, " ").includes(compactQuote)) {
      return page.pageNumber;
    }
  }
  return null;
}

function isVerbatimInSource(fullText: string, quote: string): boolean {
  if (!fullText || !quote) return false;
  if (fullText.includes(quote)) return true;
  const compactFull = fullText.replace(/\s+/g, " ");
  const compactQuote = quote.replace(/\s+/g, " ").trim();
  return compactFull.includes(compactQuote);
}

/** Clé de dédup normalisée (conserve le quote original à l’affichage). */
export function normalizeQuoteKey(quote: string): string {
  return String(quote || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/€|eur|euros?/gi, "e")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nombre / montant / % isolé sans contexte sémantique → pas une preuve affichable.
 * Les dates courtes restent autorisées pour les champs date_* / invoiceDate / debitDate.
 */
export function isIsolatedNumericQuote(
  quote: string,
  field: string
): boolean {
  const q = String(quote || "").replace(/\s+/g, " ").trim();
  if (!q) return true;

  const isDateField = /^(invoiceDate|issueDate|debitDate|paymentDate|date|deadline)$/i.test(
    field
  );
  if (isDateField) {
    // Date seule (ex. « 21 novembre 2025 ») OK pour un champ date.
    if (
      /^\d{1,2}\s+[a-zéûôù]+\s+\d{4}$/i.test(q) ||
      /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(q) ||
      /^date\b/i.test(q)
    ) {
      return false;
    }
  }

  // Pourcentage seul : « 20% », « 20.00% », « [20.00%] »
  if (/^\[?\d+[.,]?\d*\s*%\]?$/.test(q)) return true;

  // Uniquement chiffres / séparateurs / symbole monétaire / e OCR
  const withoutMoneyNoise = q
    .replace(/€|eur|euros?/gi, "")
    .replace(/\be\b/gi, "")
    .replace(/[\[\]():]/g, "")
    .trim();
  if (/^[\d\s.,]+$/.test(withoutMoneyNoise)) {
    return true;
  }

  // Montant + € mais aucun libellé sémantique
  if (
    /\d+[.,]\d{2}/.test(q) &&
    !SEMANTIC_HINT.test(q) &&
    !/[a-zàâäéèêëïîôùûüç]{3,}/i.test(q.replace(/\b(?:eur|euros?)\b/gi, ""))
  ) {
    return true;
  }

  return false;
}

function formatValueHints(value: number | string | null | undefined): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const s = value.trim();
    return s ? [s] : [];
  }
  const n = value;
  const hints = new Set<string>();
  hints.add(String(n));
  hints.add(n.toFixed(2));
  hints.add(n.toFixed(2).replace(".", ","));
  // Variante FR avec espace milliers non nécessaire pour petits montants
  return [...hints];
}

/**
 * Libellés OCR ordonnés du plus spécifique au plus générique.
 * Sur texte PDF.js aplati, éviter qu’un simple « TTC » / « HT » masque
 * « Somme à payer TTC » / « Total de la facture HT ».
 */
const SOURCE_LABEL_SPECS: Array<{ re: RegExp; weight: number }> = [
  { re: /somme\s+[àa]\s+payer(?:\s+ttc)?/gi, weight: 55 },
  { re: /total\s+de\s+la\s+facture(?:\s+ht)?/gi, weight: 55 },
  { re: /montant\s+[àa]\s+payer/gi, weight: 50 },
  { re: /net\s+[àa]\s+payer/gi, weight: 50 },
  { re: /date\s+d['’]émission/gi, weight: 50 },
  { re: /date\s+de\s+pr[eé]l[eè]vement/gi, weight: 50 },
  { re: /date\s+de\s+facture/gi, weight: 45 },
  { re: /facture\s*n[°o]?/gi, weight: 45 },
  { re: /montant\s*ttc/gi, weight: 40 },
  { re: /montant\s*ht/gi, weight: 40 },
  { re: /\btva\b/gi, weight: 35 },
  { re: /pr[eé]l[eè]vement/gi, weight: 30 },
  { re: /échéance/gi, weight: 25 },
  { re: /\bttc\b/gi, weight: 12 },
  { re: /\bht\b/gi, weight: 12 },
  { re: /\bdate\b/gi, weight: 10 }
];

function bestLabelBefore(
  before: string
): { index: number; weight: number; length: number } | null {
  let best: { index: number; weight: number; length: number; score: number } | null =
    null;
  for (const spec of SOURCE_LABEL_SPECS) {
    const re = new RegExp(spec.re.source, "gi");
    for (const match of before.matchAll(re)) {
      const index = match.index ?? -1;
      if (index < 0) continue;
      const length = match[0].length;
      // Proximité du montant : un libellé proche (TVA) bat un libellé
      // plus « fort » mais trop éloigné (Total de la facture … HT).
      const distance = before.length - index;
      const score = spec.weight * 2 - distance * 1.35;
      if (
        !best ||
        score > best.score ||
        (score === best.score && index > best.index)
      ) {
        best = { index, weight: spec.weight, length, score };
      }
    }
  }
  return best;
}

/** Montants monétaires (ignore les taux du type 20.00%). */
function countMoneyTokens(snippet: string): number {
  return (snippet.match(/\d+[.,]\d{2}(?!\s*%)/g) || []).length;
}

function countDateTokens(snippet: string): number {
  return (
    snippet.match(
      /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}\s+[a-zéûôù]+\s+\d{4}/gi
    ) || []
  ).length;
}

/**
 * Retrouve la meilleure ligne / fenêtre OCR contenant la valeur + un libellé.
 * Préfère une ligne réelle ; sinon une fenêtre ancrée sur le libellé le plus
 * spécifique à gauche (pas seulement le token le plus proche).
 */
export function findBestSourceLine(
  fullText: string,
  valueHints: string[],
  extraLabelRe?: RegExp | null
): string | null {
  const text = String(fullText || "");
  if (!text || !valueHints.length) return null;
  const labelRe = extraLabelRe || SEMANTIC_HINT;

  let bestSnippet: string | null = null;
  let bestScore = -Infinity;

  const consider = (snippet: string, baseScore: number) => {
    const compact = snippet.replace(/\s+/g, " ").trim();
    if (compact.length < 3 || compact.length > 160) return;
    if (
      !isVerbatimInSource(text, compact) &&
      !text.replace(/\s+/g, " ").includes(compact)
    ) {
      return;
    }
    let score = baseScore;
    // Recréer le test sans flag g sticky
    if (new RegExp(labelRe.source, labelRe.flags.replace("g", "")).test(compact)) {
      score += 20;
    }
    if (SEMANTIC_HINT.test(compact)) score += 10;
    if (isIsolatedNumericQuote(compact, "amountOther")) score -= 50;
    if (compact.length >= 12 && compact.length <= 90) score += 5;
    // Une preuve = un champ : pénaliser les fenêtres qui mélangent plusieurs valeurs
    if (countMoneyTokens(compact) > 1) score -= 45;
    if (countDateTokens(compact) > 1) score -= 45;
    if (score > bestScore) {
      bestScore = score;
      bestSnippet = compact;
    }
  };

  // 1) Lignes OCR réelles — priorité forte (preuves propres et courtes)
  for (const line of linesOf(text)) {
    const compact = line.replace(/\s+/g, " ").trim();
    if (compact.length > 120) continue; // page aplatie → fenêtre ci-dessous
    const hasValue = valueHints.some((h) => h && compact.includes(h));
    if (!hasValue) continue;
    consider(compact, 80);
  }

  // 2) Fenêtre ancrée sur le libellé le plus spécifique à gauche de la valeur
  const flat = text.replace(/\s+/g, " ");
  for (const hint of valueHints) {
    if (!hint) continue;
    let from = 0;
    while (from < flat.length) {
      const idx = flat.indexOf(hint, from);
      if (idx < 0) break;
      const lookback = Math.min(90, idx);
      const before = flat.slice(idx - lookback, idx);
      const label = bestLabelBefore(before);
      let start =
        label != null
          ? idx - lookback + label.index
          : Math.max(0, idx - 18);

      // Cas TVA [20.00%] 1.66 : inclure « TVA » si juste avant le montant
      const sliceToVal = flat.slice(Math.max(0, idx - 28), idx);
      if (/\btva\b/i.test(sliceToVal)) {
        const tvaRel = sliceToVal.toLowerCase().lastIndexOf("tva");
        if (tvaRel >= 0) {
          start = Math.min(start, idx - sliceToVal.length + tvaRel);
        }
      }

      let end = idx + hint.length;
      const after = flat.slice(end, end + 12);
      const cur = after.match(/^\s*(?:€|eur|euros?|(?<![a-z])e(?![a-z]))/i);
      if (cur) end += cur[0].length;

      const snippet = flat.slice(start, end).trim();
      const labelWeight = label?.weight ?? 0;
      const proximityBonus = label != null ? 20 + Math.min(20, labelWeight / 3) : 0;
      const brevityBonus =
        snippet.length <= 60 ? 15 : snippet.length <= 90 ? 5 : -10;
      consider(snippet, 20 + proximityBonus + brevityBonus);
      from = idx + Math.max(1, hint.length);
    }
  }

  if (bestSnippet && bestScore >= 15) return bestSnippet;
  if (bestSnippet && bestScore >= 0) return bestSnippet;
  return null;
}

function pushEvidence(
  list: LocalEvidenceSpan[],
  seen: Set<string>,
  fullText: string,
  item: Omit<LocalEvidenceSpan, "id">
): void {
  const quote = String(item.quote || "").replace(/\s+/g, " ").trim();
  if (quote.length < 3) return;
  if (!isVerbatimInSource(fullText, quote)) return;
  if (isIsolatedNumericQuote(quote, item.field)) return;

  const norm = normalizeQuoteKey(quote);
  if (!norm) return;
  if (seen.has(norm)) return;
  seen.add(norm);

  list.push({
    id: `ev-${list.length + 1}`,
    ...item,
    quote
  });
}

function bestAmountRaw(
  amounts: LocalAmountFinding[],
  labels: string[],
  value: number | null
): string | null {
  if (value == null) return null;
  const match = amounts.find(
    (item) =>
      labels.includes(String(item.label || "")) &&
      item.value === value &&
      item.raw
  );
  return match?.raw || null;
}

function resolveAmountQuote(
  fullText: string,
  amounts: LocalAmountFinding[],
  labels: string[],
  value: number | null,
  labelRe: RegExp
): string | null {
  if (value == null) return null;
  const raw = bestAmountRaw(amounts, labels, value);
  const hints = [
    ...formatValueHints(value),
    ...(raw ? [raw.replace(/\s+/g, " ").trim()] : [])
  ];
  const fromLine = findBestSourceLine(fullText, hints, labelRe);
  if (fromLine && !isIsolatedNumericQuote(fromLine, labels[0] || "amount")) {
    return fromLine;
  }
  // Dernier recours : raw seulement s’il a déjà un contexte
  if (raw && !isIsolatedNumericQuote(raw, labels[0] || "amount")) {
    return raw.replace(/\s+/g, " ").trim();
  }
  return null;
}

/**
 * Construit les preuves locales à partir des champs structurés retenus.
 * N’inclut jamais de candidats orphelins (ex. « 16.79 » sans libellé).
 */
export function buildLocalEvidence(
  analysis: LocalAnalysis,
  fullText: string,
  ocr?: OCRResult | null
): LocalEvidenceSpan[] {
  const evidence: LocalEvidenceSpan[] = [];
  const seen = new Set<string>();
  const text = String(fullText || "");
  const pages = ocr?.pages?.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text || ""
  }));

  const add = (
    field: string,
    label: string,
    quote: string | null | undefined,
    confidence?: number | null
  ) => {
    if (!quote) return;
    const cleaned = String(quote).replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    const loc = findInText(text, cleaned);
    const page = findPage(pages, cleaned) ?? (pages?.[0]?.pageNumber ?? null);
    pushEvidence(evidence, seen, text, {
      quote: cleaned,
      field,
      label,
      page,
      start: loc?.start ?? null,
      end: loc?.end ?? null,
      source: "ocr",
      confidence: confidence ?? null
    });
  };

  const fields = analysis.fields;
  const amounts = analysis.amounts || [];

  // ——— Champs structurés uniquement ———
  if (fields.invoiceNumber) {
    const escaped = fields.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawHit = text.match(
      new RegExp(
        String.raw`(?:facture|devis)?\s*n[°o]?\s*[:=]?\s*${escaped}`,
        "i"
      )
    );
    const line =
      findBestSourceLine(text, [fields.invoiceNumber], /facture|devis|n[°o]/i) ||
      rawHit?.[0] ||
      null;
    // Refuse le numéro nu sans « Facture n° »
    if (line && !isIsolatedNumericQuote(line, "invoiceNumber")) {
      add("invoiceNumber", "N° de facture", line, 90);
    } else if (rawHit?.[0]) {
      add("invoiceNumber", "N° de facture", rawHit[0], 85);
    }
  }

  // Émetteur : seulement si texte non numérique / non capital social
  if (fields.companyName || analysis.issuer) {
    const name = String(fields.companyName || analysis.issuer || "").trim();
    if (
      name &&
      !isIsolatedNumericQuote(name, "companyName") &&
      !/capital/i.test(name) &&
      /[a-zàâäéèêëïîôùûüç]{2,}/i.test(name)
    ) {
      const line = findBestSourceLine(text, [name], /./) || name;
      if (line === name || line.includes(name)) {
        add("companyName", "Émetteur", name, 70);
      }
    }
  }

  const paymentLike =
    analysis.deadlines.find(
      (item) =>
        item.label === "payment_date" ||
        item.label === "deadline" ||
        item.iso === fields.paymentDate
    ) ||
    analysis.dates.find(
      (item) =>
        item.label === "payment_date" || item.iso === fields.paymentDate
    );
  const issueLike =
    analysis.dates.find(
      (item) =>
        item.label === "issue_date" ||
        item.label === "document_date" ||
        item.iso === fields.issueDate ||
        item.iso === fields.invoiceDate
    ) || null;

  if (fields.invoiceDate || fields.issueDate) {
    const iso = fields.invoiceDate || fields.issueDate;
    const raw = issueLike?.raw || null;
    const dateHints = iso
      ? (() => {
          const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return [] as string[];
          return [
            `${Number(m[3])}/${m[2]}/${m[1]}`,
            `${m[3]}/${m[2]}/${m[1]}`,
            `${Number(m[3])}-${m[2]}-${m[1]}`
          ];
        })()
      : [];
    // Préférer les formes courtes (valeur date) pour ancrer la fenêtre OCR ;
    // un raw trop large (ligne mélangée) ne doit pas devenir la preuve telle quelle.
    const hints = [
      ...dateHints,
      ...(raw && String(raw).length <= 40 ? [String(raw).replace(/\s+/g, " ").trim()] : [])
    ];
    const line =
      findBestSourceLine(
        text,
        hints,
        /date|émission|facture|novembre|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|décembre/i
      ) ||
      (raw &&
      !isIsolatedNumericQuote(String(raw), "invoiceDate") &&
      countDateTokens(String(raw)) <= 1
        ? String(raw).replace(/\s+/g, " ").trim()
        : null) ||
      dateHints.find((h) => text.includes(h)) ||
      null;
    if (line) add("invoiceDate", "Date de facture", line, 85);
  }

  if (fields.debitDate || fields.paymentDate) {
    const raw = paymentLike?.raw || null;
    const iso = fields.debitDate || fields.paymentDate;
    const dateHints = iso
      ? (() => {
          const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return [] as string[];
          return [
            `${Number(m[3])}/${m[2]}/${m[1]}`,
            `${m[3]}/${m[2]}/${m[1]}`
          ];
        })()
      : [];
    const hints = [
      ...dateHints,
      ...(raw && String(raw).length <= 40 ? [String(raw).replace(/\s+/g, " ").trim()] : [])
    ];
    if (hints.length) {
      const line =
        findBestSourceLine(
          text,
          hints,
          /pr[eé]l|échéance|paiement|date/i
        ) ||
        (raw &&
        countDateTokens(String(raw)) <= 1 &&
        !isIsolatedNumericQuote(String(raw), "debitDate")
          ? String(raw).replace(/\s+/g, " ").trim()
          : null);
      if (line) add("debitDate", "Date de prélèvement", line, 80);
    }
  }

  // Montants structurés retenus uniquement
  add(
    "amountHT",
    "Montant HT",
    resolveAmountQuote(text, amounts, ["HT"], fields.amountHT, /ht|hors\s*taxe|total/i),
    85
  );
  add(
    "amountTVA",
    "TVA",
    resolveAmountQuote(
      text,
      amounts,
      ["TVA"],
      fields.amountTVA,
      /tva|vat|taux/i
    ),
    85
  );
  const ttcQuote = resolveAmountQuote(
    text,
    amounts,
    ["TTC", "montant_a_payer"],
    fields.amountTTC ?? fields.amountToPay,
    /ttc|payer|somme|montant/i
  );
  add("amountTTC", "Montant TTC", ttcQuote, 90);
  // amountToPay : seulement si citation distincte après dédup
  if (
    fields.amountToPay != null &&
    fields.amountToPay !== fields.amountTTC
  ) {
    add(
      "amountToPay",
      "Montant à payer",
      resolveAmountQuote(
        text,
        amounts,
        ["montant_a_payer"],
        fields.amountToPay,
        /payer|somme|montant/i
      ),
      90
    );
  }
  add(
    "netToPay",
    "Net à payer",
    resolveAmountQuote(
      text,
      amounts,
      ["net_a_payer"],
      fields.netToPay,
      /net|payer/i
    ),
    85
  );

  // Garantir une preuve pour le principal si manquante (toujours contextualisée)
  const principal = selectPrincipalAmountValue(fields);
  if (
    principal.value != null &&
    !evidence.some((item) =>
      ["amountToPay", "amountTTC", "netToPay", "amountHT"].includes(item.field)
    )
  ) {
    const quote = resolveAmountQuote(
      text,
      amounts,
      ["montant_a_payer", "TTC", "net_a_payer", "HT"],
      principal.value,
      /ttc|payer|ht|total|montant|somme/i
    );
    if (quote) {
      add(principal.source || "amountTTC", "Montant principal", quote, 80);
    }
  }

  if (fields.siret) {
    const siretRef = analysis.references.find(
      (item) => item.kind === "siret" && item.value === fields.siret
    );
    const line =
      findBestSourceLine(text, [fields.siret, `SIRET ${fields.siret}`], /siret/i) ||
      (siretRef ? `SIRET ${siretRef.value}` : null);
    if (line && !isIsolatedNumericQuote(line, "siret")) {
      add("siret", "SIRET", line, 75);
    }
  }

  if (fields.iban) {
    const line =
      findBestSourceLine(text, [fields.iban], /iban/i) || fields.iban;
    if (line && /iban|[A-Z]{2}\d{2}/i.test(line)) {
      add("iban", "IBAN", line, 75);
    }
  }

  return evidence;
}
