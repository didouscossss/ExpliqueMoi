import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

/**
 * Avis de taxe foncière — pas de logique facture HT/TVA/TTC.
 */
export const propertyTaxProfile = createDocumentProfile({
  id: "propertyTax",
  alsoSupports: ["taxDocument"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [
        /taxe\s+fonci[eè]re|montant\s+(total\s+)?([aà]\s+payer|de\s+la\s+taxe)|total\s+[aà]\s+payer/i
      ],
      negativeSignals: [/\bht\b|\bttc\b|tva\b/i]
    }),
    field({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay", "taxAmount"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/montant\s+[aà]\s+payer|total\s+[aà]\s+payer|reste\s+[aà]\s+payer/i]
    }),
    field({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/ann[eé]e\s+d['’]?imposition|au\s+titre\s+de\s+\d{4}/i]
    }),
    field({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/date\s+limite\s+de\s+paiement|payer\s+avant\s+le/i]
    }),
    field({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.35
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});
