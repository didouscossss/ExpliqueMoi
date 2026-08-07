/**
 * Résumé factuel local V3 — phrase courte depuis les champs structurés.
 * Générique par type de document. Aucun template marque-spécifique.
 * Aucun appel IA.
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
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
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

function hasPrelevementCue(analysis: LocalAnalysis, sourceText?: string): boolean {
  const blob = [
    sourceText || "",
    ...(analysis.dates || []).map((item) => item.raw || ""),
    ...(analysis.deadlines || []).map((item) => item.raw || ""),
    ...(analysis.amounts || []).map((item) => item.raw || "")
  ].join(" ");
  return /pr[ée]l[èe]vement|pr[ée]lever/i.test(blob);
}

function issuerLabel(analysis: LocalAnalysis): string | null {
  const name = analysis.fields.companyName || analysis.issuer;
  if (!name) return null;
  const cleaned = String(name).replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  // Évite les titres document trop génériques et les montants
  if (/^(facture|devis|contrat|document)\b/i.test(cleaned)) return null;
  if (/^\d/.test(cleaned) || /\b\d+[.,]\d{2}\b/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Construit une phrase factuelle courte à partir des champs locaux.
 */
export function buildFactualSummary(
  analysis: LocalAnalysis,
  sourceText?: string
): string {
  const type = analysis.documentType || "document_inconnu";
  const typeLabel = TYPE_LABELS[type] || "Document";
  const issuer = issuerLabel(analysis);
  const fields = analysis.fields;
  const principal = selectPrincipalAmountValue(fields);
  const dateLabel = formatFrenchLongDate(fields.date);
  const prelevement = hasPrelevementCue(analysis, sourceText);

  const parts: string[] = [];

  // Sujet
  if (issuer) {
    parts.push(`${typeLabel} ${issuer}`);
  } else {
    parts.push(typeLabel);
  }

  // Montant principal
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

  // Date (séparée par une virgule pour une phrase naturelle)
  let dateClause = "";
  if (dateLabel) {
    if ((type === "facture" || type === "devis") && prelevement) {
      dateClause = `prélevée le ${dateLabel}`;
    } else if (type === "facture" || type === "devis") {
      dateClause = `datée du ${dateLabel}`;
    } else {
      dateClause = `du ${dateLabel}`;
    }
  }

  // Client (optionnel, discret)
  let clientClause = "";
  if (fields.clientName && type !== "bulletin_de_salaire") {
    if (parts.join(" ").length < 90) {
      clientClause = `pour ${fields.clientName}`;
    }
  }

  let sentence = parts.join(" ");
  if (dateClause) {
    sentence += `, ${dateClause}`;
  }
  if (clientClause) {
    sentence += ` ${clientClause}`;
  }
  sentence = sentence.replace(/\s+/g, " ").trim();
  if (!/[.!?]$/.test(sentence)) {
    sentence += ".";
  }
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return sentence;
}
