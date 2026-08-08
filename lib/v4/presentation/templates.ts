/**
 * Templates FR déterministes — uniquement si champs supportés.
 */

import type { DocumentExplanation, ExplanationFact } from "../types/documentExplanation.js";
import {
  capitalize,
  documentTypeLabel,
  formatDateFR,
  formatMoneyFR,
  isUsableFactStatus
} from "./format.js";

function findFact(
  facts: readonly ExplanationFact[],
  ...fields: string[]
): ExplanationFact | undefined {
  return facts.find(
    (f) =>
      fields.includes(f.field) &&
      isUsableFactStatus(f.status) &&
      f.value !== undefined &&
      !Array.isArray(f.value)
  );
}

function findAny(
  explanation: DocumentExplanation,
  ...fields: string[]
): ExplanationFact | undefined {
  const pool = [
    ...explanation.amounts,
    ...explanation.deadlines,
    ...explanation.importantFacts,
    ...explanation.summaryFacts,
    ...(explanation.title ? [explanation.title] : [])
  ];
  return findFact(pool, ...fields);
}

export function buildIdentityText(explanation: DocumentExplanation): {
  label: string;
  text: string;
  sources: ExplanationFact[];
} {
  const type = explanation.documentType.primary;
  const label = capitalize(documentTypeLabel(type));
  const sources: ExplanationFact[] = [];

  if (type === "invoice") {
    const ttc = findAny(explanation, "amountTTC", "amountDue");
    const date = findAny(explanation, "invoiceDate", "documentDate");
    if (ttc) sources.push(ttc);
    if (date) sources.push(date);
    const money = ttc ? formatMoneyFR(ttc.value) : null;
    const d = date ? formatDateFR(date.value) : null;
    if (money && d) {
      return {
        label,
        text: `Facture de ${money} TTC, datée du ${d}.`,
        sources
      };
    }
    if (money) {
      return { label, text: `Facture de ${money} TTC.`, sources };
    }
    return { label, text: "Il s'agit d'une facture.", sources };
  }

  if (type === "administrativeLetter") {
    return {
      label,
      text: "Il s'agit d'un courrier administratif.",
      sources
    };
  }

  if (type === "contract") {
    const pool = [
      ...explanation.importantFacts,
      ...explanation.summaryFacts,
      ...explanation.deadlines
    ];
    const parties = pool.find(
      (f) =>
        f.field === "parties" &&
        isUsableFactStatus(f.status) &&
        f.value != null
    );
    const date = findAny(explanation, "effectiveDate", "documentDate");
    const title = findAny(explanation, "contractTitle", "subject", "title");
    if (parties) sources.push(parties);
    if (date) sources.push(date);
    if (title) sources.push(title);
    const partyList = Array.isArray(parties?.value)
      ? parties!.value.map(String).join(" et ")
      : parties
        ? String(parties.value)
        : null;
    const d = date ? formatDateFR(date.value) : null;
    if (partyList && d) {
      return {
        label,
        text: `Contrat entre ${partyList}, daté du ${d}.`,
        sources
      };
    }
    if (partyList) {
      return { label, text: `Contrat entre ${partyList}.`, sources };
    }
    return { label, text: "Il s'agit d'un contrat.", sources };
  }

  if (type === "bankStatement") {
    const period = findAny(explanation, "statementPeriod", "fiscalPeriod");
    if (period && !Array.isArray(period.value)) {
      sources.push(period);
      return {
        label,
        text: `Relevé bancaire — période : ${String(period.value)}.`,
        sources
      };
    }
    return { label, text: "Il s'agit d'un relevé bancaire.", sources };
  }

  if (type === "taxDocument") {
    return { label, text: "Il s'agit d'un document fiscal.", sources };
  }

  const noun = documentTypeLabel(type);
  const article = /^(attestation|facture|notice)/i.test(noun) ? "d'une" : "d'un";
  return {
    label,
    text: `Il s'agit ${article} ${noun}.`,
    sources
  };
}

export function buildReasonText(
  explanation: DocumentExplanation
): { text: string; sources: ExplanationFact[] } | null {
  const purpose = explanation.summaryFacts.find(
    (f) => f.field === "purpose" && isUsableFactStatus(f.status)
  );
  if (!purpose) return null;

  const map: Record<string, string> = {
    paymentRequest: "Ce document concerne une demande de paiement.",
    informationRequest: "Ce document vous demande une information ou une pièce.",
    certification: "Ce document certifie une information.",
    information: "Ce document vous informe.",
    agreement: "Ce document formalise un accord.",
    accountStatement: "Ce document présente l'état d'un compte.",
    taxObligation: "Ce document concerne une obligation fiscale.",
    explanation: "Ce document explique une procédure ou une information.",
    formSubmission: "Ce document est un formulaire à compléter."
    // billingNotice : pas de reason — l'identité documentaire suffit
  };
  const key = String(purpose.value);
  if (key === "billingNotice" || key === "unknown") return null;
  const text = map[key];
  if (!text) return null;
  // Ne pas utiliser « vous avez reçu ce document car c'est une facture »
  return { text, sources: [purpose] };
}

export function buildActionText(
  description: string,
  deadline: ExplanationFact | null
): string {
  const base = description.trim().replace(/\s+/g, " ");
  const d =
    deadline && isUsableFactStatus(deadline.status) && !Array.isArray(deadline.value)
      ? formatDateFR(deadline.value)
      : null;
  if (d) {
    return capitalize(`Merci de ${base.replace(/^merci\s+de\s+/i, "")} avant le ${d}.`);
  }
  return capitalize(base.endsWith(".") ? base : `${base}.`);
}

export function buildWarningText(kind: string, message: string): string {
  if (kind === "arithmeticInconsistency") {
    return "Les montants indiqués semblent incohérents : le HT et la TVA ne correspondent pas au TTC indiqué.";
  }
  if (kind === "ambiguousField") {
    return "Certaines informations importantes ne sont pas certaines.";
  }
  return message;
}

export function amountLabel(field: string): string {
  const map: Record<string, string> = {
    amountHT: "Total HT",
    vatAmount: "TVA",
    vatRate: "Taux de TVA",
    amountTTC: "Total TTC",
    amountDue: "Montant dû",
    taxAmount: "Montant fiscal",
    openingBalance: "Solde d'ouverture",
    closingBalance: "Solde de clôture",
    transactions: "Opérations",
    grossSalary: "Salaire brut",
    netSalary: "Salaire net",
    turnover: "Chiffre d'affaires",
    netResult: "Résultat net",
    arithmeticConsistency: "Cohérence HT + TVA ≈ TTC"
  };
  return map[field] || field;
}

export function dateLabel(field: string): string {
  const map: Record<string, string> = {
    invoiceDate: "Date de facture",
    documentDate: "Date du document",
    dueDate: "Date d'échéance",
    paymentDate: "Date de prélèvement",
    paymentDeadline: "Date limite de paiement",
    actionDeadline: "Échéance d'action",
    effectiveDate: "Date d'effet",
    endDate: "Date de fin",
    fiscalPeriod: "Période fiscale",
    statementPeriod: "Période du relevé",
    noticePeriod: "Préavis"
  };
  return map[field] || field;
}
