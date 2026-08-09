import { createDocumentProfile } from "../baseProfile.js";
import { field } from "../fieldHelpers.js";

/** Document fiscal non identifiable précisément — mieux qu'une fausse classe. */
export const unknownTaxDocumentProfile = createDocumentProfile({
  id: "unknownTaxDocument",
  alsoSupports: ["taxDocument", "unknown"],
  expectedRelations: [],
  expectedFields: [
    field({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "other"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate"],
      importance: "low",
      confidenceThreshold: 0.45
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["other", "dossierReference"],
      importance: "low",
      confidenceThreshold: 0.45
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});
