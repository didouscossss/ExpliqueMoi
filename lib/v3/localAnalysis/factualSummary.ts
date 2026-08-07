/**
 * Résumé factuel local V3 — phrase courte depuis les champs structurés fiables.
 * Générique par type. Aucun template marque-spécifique. Aucun appel IA.
 */

import type { LocalAnalysis, LocalDocumentType } from "../types/LocalAnalysis.js";
import { selectPrincipalAmountValue } from "./extractors.js";

const TYPE_LABELS: Record<LocalDocumentType, string> = {
  facture: "Facture",
  devis: "Devis",
  contrat: "Contrat",
  bulletin_de_salaire: "Bulletin de salaire",
  releve_bancaire: "Relevé bancaire",
  courrier: "Courrier",
  ordonnance: "Ordonnance",
  document_inconnu: "Document"
};

function formatEuro(value: number): string {
  return `${Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

function formatFrenchLongDate(isoOrRaw: string | null): string | null {
  if (!isoOrRaw) return null;
  const iso = String(isoOrRaw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    );
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      });
    }
  }
  const fr = String(isoOrRaw).match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (fr) {
    let year = Number(fr[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(Date.UTC(year, Number(fr[2]) - 1, Number(fr[1])));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      });
    }
  }
  return null;
}

function isReliableIssuer(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = String(name).replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 48) return null;
  if (/^(facture|devis|contrat|document)\b/i.test(cleaned)) return null;
  if (/capital(\s+social)?|au\s+capital/i.test(cleaned)) return null;
  if (/^\d/.test(cleaned) || /\b\d+[.,]\d{2}\b/.test(cleaned)) return null;
  if (/\beuros?\b/i.test(cleaned) && /\d/.test(cleaned)) return null;
  // Forme juridique seule sans nom commercial
  if (/^(SASU|SAS|SARL|EURL|SA|SCI|SNC)\s*$/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Construit une phrase factuelle courte à partir des champs locaux fiables.
 */
export function buildFactualSummary(
  analysis: LocalAnalysis,
  _sourceText?: string
): string {
  const type = analysis.documentType || "document_inconnu";
  const typeLabel = TYPE_LABELS[type] || "Document";
  const issuer = isReliableIssuer(analysis.fields.companyName || analysis.issuer);
  const fields = analysis.fields;

  const principal = selectPrincipalAmountValue({
    amountToPay: fields.amountToPay,
    amountTTC: fields.amountTTC,
    netToPay: fields.netToPay,
    amountHT: fields.amountHT
  });

  // Date : pour facture, préférer paymentDate (déjà dans fields.date si buildFields OK)
  const actionDate = fields.paymentDate || fields.date;
  const dateLabel = formatFrenchLongDate(actionDate);
  const isPaymentDate = Boolean(fields.paymentDate);

  const parts: string[] = [];
  if (issuer) {
    parts.push(`${typeLabel} ${issuer}`);
  } else {
    parts.push(typeLabel);
  }

  if (principal.value != null) {
    const amountText = formatEuro(principal.value);
    const isTtcLike =
      principal.source === "amountToPay" ||
      principal.source === "amountTTC" ||
      principal.source === "netToPay";
    if (type === "bulletin_de_salaire" && principal.source === "netToPay") {
      parts.push(`— net à payer ${amountText}`);
    } else if (isTtcLike && (type === "facture" || type === "devis")) {
      parts.push(`de ${amountText} TTC`);
    } else if (principal.source === "amountHT") {
      parts.push(`de ${amountText} HT`);
    } else {
      parts.push(`de ${amountText}`);
    }
  }

  let dateClause = "";
  if (dateLabel) {
    if ((type === "facture" || type === "devis") && isPaymentDate) {
      dateClause = `prélevée le ${dateLabel}`;
    } else if (type === "facture" || type === "devis") {
      dateClause = `datée du ${dateLabel}`;
    } else {
      dateClause = `du ${dateLabel}`;
    }
  }

  let sentence = parts.join(" ");
  if (dateClause) {
    sentence += `, ${dateClause}`;
  }
  sentence = sentence.replace(/\s+/g, " ").trim();
  if (!/[.!?]$/.test(sentence)) {
    sentence += ".";
  }
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
