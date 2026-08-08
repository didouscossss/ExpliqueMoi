import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

/**
 * Liasse / états financiers : beaucoup de nombres.
 * JAMAIS de principalAmount unique par défaut.
 */
export const financialStatementProfile = createDocumentProfile({
  id: "financialStatement",
  alsoSupports: ["fiscalPackage"],
  expectedFields: [
    required({
      field: "company",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer", "other"],
      importance: "high",
      confidenceThreshold: 0.3
    }),
    required({
      field: "fiscalYear",
      candidateTypes: ["period", "date", "sectionTitle", "documentTitle"],
      preferredRoles: ["fiscalPeriod", "documentDate", "documentTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/exercice\s+20\d{2}|ann[eé]e\s+20\d{2}|fiscal\s*year/i]
    })
  ],
  optionalFields: [
    field({
      field: "turnover",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/chiffre\s+d['’]?affaires|ca\b|turnover/i]
    }),
    field({
      field: "operatingResult",
      candidateTypes: ["money"],
      preferredRoles: ["other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+d['’]?exploitation/i]
    }),
    field({
      field: "netResult",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+net/i]
    }),
    field({
      field: "assets",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/actif/i]
    }),
    field({
      field: "liabilities",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/passif/i]
    }),
    field({
      field: "equity",
      candidateTypes: ["money"],
      preferredRoles: ["capitalSocial", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/capitaux\s+propres|equity/i]
    }),
    field({
      field: "tableReferences",
      candidateTypes: ["reference", "table"],
      preferredRoles: ["other", "amountTable"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    })
  ],
  notApplicableFields: [
    na("principalAmount"),
    na("amountDue"),
    na("amountTTC")
  ]
});
