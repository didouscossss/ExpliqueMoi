/**
 * Importance des faits selon le DocumentProfile / type.
 */

import type { DocumentTypeId } from "../types/documentClassification.js";
import type { FieldImportance } from "../types/documentProfile.js";

const FINANCIAL_KINDS = new Set([
  "amountHT",
  "vatAmount",
  "vatRate",
  "amountTTC",
  "amountDue",
  "taxAmount",
  "grossSalary",
  "netSalary",
  "openingBalance",
  "closingBalance",
  "turnover",
  "netResult",
  "transactions"
]);

const DATE_KINDS = new Set([
  "documentDate",
  "invoiceDate",
  "dueDate",
  "paymentDeadline",
  "effectiveDate",
  "endDate",
  "fiscalPeriod",
  "statementPeriod",
  "actionDeadline",
  "deadlines",
  "importantDates"
]);

const PARTY_KINDS = new Set([
  "issuer",
  "legalIssuer",
  "sender",
  "senderOrganization",
  "recipient",
  "beneficiary",
  "accountHolder",
  "employer",
  "employee",
  "taxpayer",
  "taxAuthority",
  "parties",
  "authority"
]);

/** Priorités par type documentaire (générique, sans fournisseur). */
const PROFILE_BOOST: Partial<
  Record<DocumentTypeId, Partial<Record<string, FieldImportance>>>
> = {
  invoice: {
    amountTTC: "critical",
    amountDue: "critical",
    amountHT: "high",
    vatAmount: "high",
    invoiceDate: "high",
    issuer: "high",
    dueDate: "medium"
  },
  administrativeLetter: {
    requestedActions: "critical",
    deadlines: "critical",
    subject: "high",
    senderOrganization: "high",
    amountTTC: "low",
    amountDue: "low"
  },
  contract: {
    parties: "critical",
    effectiveDate: "high",
    noticePeriod: "high",
    duration: "high",
    contractTitle: "high",
    paymentMethod: "low"
  },
  bankStatement: {
    transactions: "critical",
    openingBalance: "high",
    closingBalance: "high",
    principalAmount: "low"
  },
  taxDocument: {
    amountDue: "critical",
    paymentDeadline: "critical",
    fiscalPeriod: "high",
    taxAmount: "high"
  },
  explanatoryDocument: {
    title: "high",
    sections: "high",
    keyPoints: "high",
    procedures: "high",
    amountTTC: "low"
  },
  financialStatement: {
    turnover: "high",
    netResult: "high",
    company: "high",
    fiscalYear: "high",
    principalAmount: "low"
  }
};

export function importanceFor(
  type: DocumentTypeId,
  field: string,
  fallback?: FieldImportance
): FieldImportance {
  const boosted = PROFILE_BOOST[type]?.[field];
  if (boosted) return boosted;
  if (fallback) return fallback;
  if (FINANCIAL_KINDS.has(field)) return "medium";
  if (DATE_KINDS.has(field)) return "medium";
  if (PARTY_KINDS.has(field)) return "medium";
  return "low";
}

export function isFinancialField(field: string): boolean {
  return FINANCIAL_KINDS.has(field);
}

export function isDateField(field: string): boolean {
  return DATE_KINDS.has(field);
}

export function isPartyField(field: string): boolean {
  return PARTY_KINDS.has(field);
}
