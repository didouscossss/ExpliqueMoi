import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

/** Profil fiscal générique — aucune règle DGFiP hardcodée. */
export const taxDocumentProfile = createDocumentProfile({
  id: "taxDocument",
  alsoSupports: ["taxNotice"],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "vatAmount"],
      importance: "high",
      confidenceThreshold: 0.5,
      positiveContext: [/imp[oô]t|taxe|montant\s+[aà]\s+payer/i]
    }),
    required({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/montant\s+[aà]\s+payer|[aà]\s+payer/i]
    })
  ],
  optionalFields: [
    field({
      field: "taxAuthority",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxpayer",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxType",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/imp[oô]t|taxe|fonci[eè]re|revenu/i]
    }),
    field({
      field: "fiscalPeriod",
      candidateTypes: ["period", "reference", "documentTitle", "sectionTitle"],
      preferredRoles: ["fiscalPeriod", "billingPeriod", "other", "documentTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/p[eé]riode\s+fiscale|exercice\s+20\d{2}|revenu\s+20\d{2}|fiscale\s+20\d{2}/i],
      negativeSignals: [/date\s+limite|paiement|montant/i]
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT", "other"],
      importance: "low",
      confidenceThreshold: 0.5,
      positiveContext: [/base\s+(imposable|taxable)|revenu\s+fiscal/i]
    }),
    field({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+limite|avant\s+le|limite\s+de\s+paiement|paiement/i]
    }),
    field({
      field: "rates",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning", "action"],
      preferredRoles: ["warning", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ]
});
