import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

export const bankStatementProfile = createDocumentProfile({
  id: "bankStatement",
  expectedFields: [
    required({
      field: "openingBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/solde\s+pr[eé]c[eé]dent|solde\s+initial|opening/i]
    }),
    required({
      field: "closingBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/nouveau\s+solde|solde\s+(cr[eé]diteur|final)|closing/i]
    }),
    required({
      field: "transactions",
      candidateTypes: ["money"],
      preferredRoles: ["linePrice", "other", "balance", "amountDue"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.35,
      // Structure ledger — pas IBAN seul
      positiveContext: [/d[eé]bit|cr[eé]dit|libell[eé]|op[eé]ration|carte|virement/i],
      negativeSignals: [/iban|mandat\s+sepa|total\s+ttc|facture/i]
    })
  ],
  optionalFields: [
    field({
      field: "accountHolder",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "bank",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "accountIdentifiers",
      candidateTypes: ["iban", "accountNumber", "reference"],
      preferredRoles: ["accountIban", "accountIdentifier"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "statementPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "transactionDates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "other"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.35
    })
  ],
  // IBAN seul n'est pas une expectation critique — et pas de principalAmount
  notApplicableFields: [
    {
      field: "principalAmount",
      candidateTypes: ["money"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    }
  ]
});
