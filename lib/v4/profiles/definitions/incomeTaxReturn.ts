import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

/**
 * Déclaration de revenus (ex. 2042).
 * V4-L identifie / structure — pas d'aide au remplissage.
 */
export const incomeTaxReturnProfile = createDocumentProfile({
  id: "incomeTaxReturn",
  alsoSupports: ["taxDocument", "form"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "invoiceNumber", "other"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/2042|formulaire|n[°o]\s*d[eé]claration/i]
    }),
    field({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "critical",
      confidenceThreshold: 0.4,
      positiveContext: [/revenus\s+de\s+l['’]?\s*ann[eé]e|ann[eé]e\s+\d{4}/i]
    }),
    field({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/d[eé]clarant|nom\s+et\s+pr[eé]nom/i]
    }),
    field({
      field: "taxAuthority",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/dgfip|finances\s+publiques|imp[oô]ts\.gouv/i]
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/traitements\s+et\s+salaires|revenus\s+fonciers|montant\s+d[eé]clar/i]
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});
