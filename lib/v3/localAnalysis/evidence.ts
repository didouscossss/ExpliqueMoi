/**
 * EvidenceBuilder V3 — passages importants = extraits verbatim du texte/OCR.
 * Aucune reformulation IA.
 */

import type {
  LocalAnalysis,
  LocalAmountFinding,
  LocalEvidenceSpan
} from "../types/LocalAnalysis.js";
import type { OCRResult } from "../types/OCRResult.js";
import { selectPrincipalAmountValue } from "./extractors.js";

function findInText(
  fullText: string,
  needle: string
): { start: number; end: number } | null {
  if (!needle) return null;
  const idx = fullText.indexOf(needle);
  if (idx >= 0) {
    return { start: idx, end: idx + needle.length };
  }
  // Tentative insensible aux espaces multiples
  const compactNeedle = needle.replace(/\s+/g, " ").trim();
  const compactFull = fullText.replace(/\s+/g, " ");
  const compactIdx = compactFull.indexOf(compactNeedle);
  if (compactIdx < 0) return null;
  // Approximation d’offset sur le texte original
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

function pushEvidence(
  list: LocalEvidenceSpan[],
  seen: Set<string>,
  fullText: string,
  item: Omit<LocalEvidenceSpan, "id">
): void {
  const quote = String(item.quote || "").replace(/\s+/g, " ").trim();
  if (quote.length < 3) return;
  // Jamais de citation inventée / reformulée : doit exister dans le texte source.
  if (!isVerbatimInSource(fullText, quote)) return;
  const key = `${item.field}|${quote}`;
  if (seen.has(key)) return;
  seen.add(key);
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

/** Élargit une citation montant avec le libellé voisin présent dans le texte. */
function expandAmountQuote(fullText: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (fullText.includes(cleaned) && cleaned.length > 8) return cleaned;

  // Cherche une ligne / segment contenant le montant + un libellé utile
  const money = cleaned.match(
    /(\d{1,3}(?:[ \u00a0]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s*(?:€|eur|euros?)?/i
  );
  const token = money?.[0] || cleaned;
  const idx = fullText.indexOf(token);
  if (idx < 0) {
    return fullText.includes(cleaned) ? cleaned : cleaned;
  }
  const lineStart = fullText.lastIndexOf("\n", idx) + 1;
  let lineEnd = fullText.indexOf("\n", idx);
  if (lineEnd < 0) lineEnd = fullText.length;
  let line = fullText.slice(lineStart, lineEnd).replace(/\s+/g, " ").trim();
  // Sur ligne aplatie très longue, fenêtre autour du montant
  if (line.length > 120) {
    const local = fullText.slice(Math.max(0, idx - 40), Math.min(fullText.length, idx + token.length + 8));
    line = local.replace(/\s+/g, " ").trim();
  }
  if (/payer|ttc|ht|tva|total|montant|somme|net/i.test(line)) {
    return line;
  }
  return fullText.includes(cleaned) ? cleaned : token;
}

/**
 * Construit les preuves locales à partir de l’analyse et du texte source.
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
    quote: string | null | undefined
  ) => {
    if (!quote) return;
    const cleaned = String(quote).trim();
    if (!cleaned) return;
    const loc = findInText(text, cleaned);
    const page = findPage(pages, cleaned) ?? null;
    pushEvidence(evidence, seen, text, {
      quote: cleaned,
      field,
      label,
      page,
      start: loc?.start ?? null,
      end: loc?.end ?? null,
      source: "ocr"
    });
  };

  const fields = analysis.fields;
  const amounts = analysis.amounts || [];

  if (fields.invoiceNumber) {
    const escaped = fields.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawHit = text.match(
      new RegExp(
        String.raw`(?:facture|devis)?\s*n[°o]?\s*[:=]?\s*${escaped}`,
        "i"
      )
    );
    add("invoiceNumber", "N° de facture", rawHit?.[0] || fields.invoiceNumber);
  }

  if (fields.companyName || analysis.issuer) {
    add("companyName", "Émetteur", fields.companyName || analysis.issuer);
  }

  // Date principale actionnable (prélèvement/échéance pour facture) + émission séparée.
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
        item.iso === fields.issueDate
    ) || analysis.dates[0];

  if (paymentLike?.raw && fields.paymentDate) {
    add("date", "Date de paiement / prélèvement", paymentLike.raw);
  } else if (issueLike?.raw) {
    add("date", "Date", issueLike.raw);
  }

  if (
    issueLike?.raw &&
    fields.issueDate &&
    fields.paymentDate &&
    fields.issueDate !== fields.paymentDate
  ) {
    add("issueDate", "Date d'émission", issueLike.raw);
  }

  for (const deadline of analysis.deadlines || []) {
    if (deadline.raw) {
      add("deadline", "Échéance", deadline.raw);
    }
  }

  // Preuves montants : indépendantes du gagnant principalAmount.
  // Utilise fields si présents, sinon les findings amounts[] (candidats scorés).
  const htQuote = expandAmountQuote(
    text,
    bestAmountRaw(amounts, ["HT"], fields.amountHT) ||
      amounts.find((a) => a.label === "HT" && a.raw)?.raw
  );
  const tvaQuote = expandAmountQuote(
    text,
    bestAmountRaw(amounts, ["TVA"], fields.amountTVA) ||
      amounts.find((a) => a.label === "TVA" && a.raw)?.raw
  );
  const ttcQuote = expandAmountQuote(
    text,
    bestAmountRaw(amounts, ["TTC"], fields.amountTTC) ||
      amounts.find((a) => a.label === "TTC" && a.raw)?.raw
  );
  const payQuote = expandAmountQuote(
    text,
    bestAmountRaw(amounts, ["montant_a_payer"], fields.amountToPay) ||
      amounts.find((a) => a.label === "montant_a_payer" && a.raw)?.raw ||
      // Si à payer === TTC, cite le libellé « somme à payer TTC » s’il existe
      (fields.amountToPay != null && fields.amountToPay === fields.amountTTC
        ? bestAmountRaw(amounts, ["TTC"], fields.amountTTC)
        : null)
  );
  const netQuote = expandAmountQuote(
    text,
    bestAmountRaw(amounts, ["net_a_payer"], fields.netToPay) ||
      amounts.find((a) => a.label === "net_a_payer" && a.raw)?.raw
  );

  add("amountHT", "Montant HT", htQuote);
  add("amountTVA", "TVA", tvaQuote);
  add("amountTTC", "Montant TTC", ttcQuote);
  add("amountToPay", "Montant à payer", payQuote);
  add("netToPay", "Net à payer", netQuote);

  // Autres montants factuels détectés (passages importants même si principal échoue)
  for (const amount of amounts) {
    if (!amount.raw || amount.value == null) continue;
    if (
      ["HT", "TVA", "TTC", "montant_a_payer", "net_a_payer"].includes(
        String(amount.label || "")
      )
    ) {
      continue;
    }
    // Ne cite que si verbatim dans le texte
    add("amountOther", "Montant détecté", amount.raw);
  }

  const principal = selectPrincipalAmountValue(fields);
  if (principal.value != null && !evidence.some((item) =>
    ["amountToPay", "amountTTC", "netToPay", "amountHT"].includes(item.field)
  )) {
    const raw =
      bestAmountRaw(amounts, ["montant_a_payer", "TTC", "net_a_payer", "HT"], principal.value) ||
      `${principal.value}`;
    add(principal.source || "amountTTC", "Montant principal", raw);
  }

  if (fields.siret) {
    const siretRef = analysis.references.find(
      (item) => item.kind === "siret" && item.value === fields.siret
    );
    add("siret", "SIRET", siretRef ? `SIRET ${siretRef.value}` : `SIRET ${fields.siret}`);
  }

  if (fields.iban) {
    add("iban", "IBAN", fields.iban);
  }

  return evidence;
}
