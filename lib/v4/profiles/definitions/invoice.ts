import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

export const invoiceProfile = createDocumentProfile({
  id: "invoice",
  expectedRelations: [
    { type: "arithmetic", importance: "high" },
    { type: "issuer", importance: "medium" }
  ],
  expectedFields: [
    required({
      field: "issuer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.35
    }),
    required({
      field: "amountTTC",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.55,
      expectedRelations: ["arithmetic"],
      negativeSignals: [/capital\s+social/i]
    }),
    required({
      field: "amountHT",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    }),
    required({
      field: "vatAmount",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    })
  ],
  optionalFields: [
    field({
      field: "legalIssuer",
      candidateTypes: ["organization"],
      preferredRoles: ["legalIssuer", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "invoiceNumber",
      candidateTypes: ["reference", "invoiceNumber"],
      preferredRoles: ["invoiceNumber"],
      importance: "high",
      positiveContext: [/facture|n[°o]/i],
      confidenceThreshold: 0.45
    }),
    field({
      field: "invoiceDate",
      candidateTypes: ["date"],
      preferredRoles: ["invoiceDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+(de\s+)?facture|date\s+d['’]?[eé]mission/i]
    }),
    field({
      field: "dueDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["dueDate", "deadline"],
      importance: "medium",
      confidenceThreshold: 0.55,
      positiveContext: [/[eé]ch[eé]ance|payable|avant\s+le/i]
    }),
    field({
      field: "servicePeriod",
      candidateTypes: ["period"],
      preferredRoles: ["billingPeriod", "fiscalPeriod"],
      importance: "low",
      confidenceThreshold: 0.5
    }),
    field({
      field: "vatRate",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    }),
    field({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "netToPay"],
      importance: "high",
      // Ne force PAS égalité avec amountTTC
      confidenceThreshold: 0.5,
      positiveContext: [/montant\s+(total\s+)?([aà]\s+payer|d[uû])|net\s+[aà]\s+payer/i]
    }),
    field({
      field: "paymentMethod",
      candidateTypes: ["iban"],
      preferredRoles: ["paymentIban"],
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["clientNumber", "dossierReference", "invoiceNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ],
  forbiddenOrSuspiciousFields: [
    field({
      field: "bankOpeningBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance"],
      positiveContext: [/solde\s+precedent|opening\s+balance/i],
      confidenceThreshold: 0.7,
      importance: "low"
    })
  ]
});
