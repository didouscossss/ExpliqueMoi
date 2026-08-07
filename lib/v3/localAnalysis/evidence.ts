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

  add(
    "amountHT",
    "Montant HT",
    bestAmountRaw(amounts, ["HT"], fields.amountHT)
  );
  add(
    "amountTVA",
    "TVA",
    bestAmountRaw(amounts, ["TVA"], fields.amountTVA)
  );
  add(
    "amountTTC",
    "Montant TTC",
    bestAmountRaw(amounts, ["TTC"], fields.amountTTC)
  );
  add(
    "amountToPay",
    "Montant à payer",
    bestAmountRaw(amounts, ["montant_a_payer"], fields.amountToPay)
  );
  add(
    "netToPay",
    "Net à payer",
    bestAmountRaw(amounts, ["net_a_payer"], fields.netToPay)
  );

  // Si à payer === TTC et une seule preuve TTC, c’est OK.
  // Garantir au moins le montant principal si manquant.
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
