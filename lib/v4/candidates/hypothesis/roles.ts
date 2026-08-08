/**
 * Rôles candidats par type d’entité (V4-B).
 * Pas de décision finale — uniquement des hypothèses à scorer.
 */

import type { EntityType } from "../../types/entityCandidate.js";

export const ROLES_BY_TYPE: Record<EntityType, readonly string[]> = {
  money: [
    "amountHT",
    "amountTTC",
    "amountDue",
    "vatAmount",
    "linePrice",
    "offerPrice",
    "capitalSocial",
    "balance",
    "netToPay",
    "other"
  ],
  percentage: ["vatRate", "discountRate", "other"],
  date: [
    "invoiceDate",
    "dueDate",
    "paymentDate",
    "documentDate",
    "deadline",
    "other"
  ],
  person: ["recipient", "sender", "signatory", "other"],
  organization: ["issuer", "recipientOrg", "legalIssuer", "other"],
  reference: [
    "clientNumber",
    "invoiceNumber",
    "accountIdentifier",
    "dossierReference",
    "other"
  ],
  email: ["contactEmail", "other"],
  phone: ["contactPhone", "other"],
  iban: ["paymentIban", "accountIban", "other"],
  bic: ["paymentBic", "other"],
  siren: ["companySiren", "other"],
  siret: ["companySiret", "other"],
  address: ["postalAddress", "issuerAddress", "other"],
  accountNumber: ["accountIdentifier", "other"],
  invoiceNumber: ["invoiceNumber", "other"],
  period: ["fiscalPeriod", "billingPeriod", "other"],
  deadline: ["deadline", "other"],
  documentTitle: ["documentTitle", "other"],
  sectionTitle: ["sectionTitle", "other"],
  action: ["requestedAction", "other"],
  obligation: ["obligation", "other"],
  warning: ["warning", "other"],
  table: ["amountTable", "other"]
};
