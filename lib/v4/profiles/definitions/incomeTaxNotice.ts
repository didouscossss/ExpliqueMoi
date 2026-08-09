import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

/**
 * Avis d'impôt sur le revenu (FR).
 * expected field ≠ detected field — valeurs uniquement si evidence document.
 */
export const incomeTaxNoticeProfile = createDocumentProfile({
  id: "incomeTaxNotice",
  alsoSupports: ["taxDocument", "taxNotice"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [
        /imp[oô]t\s+(sur\s+le\s+revenu|calcul[eé])|montant\s+de\s+l['’]?imp[oô]t/i
      ]
    }),
    field({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/reste\s+[aà]\s+payer|montant\s+restant|solde\s+[aà]\s+payer/i],
      negativeSignals: [/rembours|d[eé]j[aà]\s+pr[eé]lev|cr[eé]dit\s+d['’]?imp[oô]t/i]
    }),
    field({
      field: "refundAmount",
      candidateTypes: ["money"],
      preferredRoles: ["refundAmount"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/rembours|montant\s+[aà]\s+votre\s+cr[eé]dit|trop[\s-]?vers[eé]/i]
    }),
    field({
      field: "amountPaid",
      candidateTypes: ["money"],
      preferredRoles: ["amountPaid"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [
        /d[eé]j[aà]\s+pr[eé]lev|pr[eé]l[eè]vement\s+[aà]\s+la\s+source|retenue\s+[aà]\s+la\s+source|acomptes?\s+vers[eé]s?/i
      ],
      negativeSignals: [/reste\s+[aà]\s+payer|montant\s+[aà]\s+rembourser|solde\s+[aà]\s+payer/i]
    }),
    field({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/revenus\s+de\s+l['’]?\s*ann[eé]e|ann[eé]e\s+d['’]?imposition|au\s+titre\s+de/i]
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]f[eé]rence\s+(de\s+l['’]?avis|avis)|n[°o]\s*avis/i]
    }),
    field({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/date\s+limite|payer\s+avant|échéance/i]
    }),
    field({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountHT"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/revenu\s+fiscal\s+de\s+r[eé]f[eé]rence|revenu\s+imposable/i]
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      importance: "low",
      confidenceThreshold: 0.5,
      cardinality: "multiple"
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});
