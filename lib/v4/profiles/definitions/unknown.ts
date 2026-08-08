import { createDocumentProfile } from "../baseProfile.js";
import { field } from "../fieldHelpers.js";

/** Unknown : faits génériques, aucun champ obligatoire. */
export const unknownProfile = createDocumentProfile({
  id: "unknown",
  expectedFields: [],
  optionalFields: [
    field({
      field: "probableTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "medium",
      confidenceThreshold: 0.25
    }),
    field({
      field: "organizations",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "recipientOrg", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "persons",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "sender", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "moneyValues",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC", "amountDue"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["other", "dossierReference"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
      field: "actions",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
      field: "sections",
      candidateTypes: ["sectionTitle"],
      preferredRoles: ["sectionTitle"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.45,
      positiveContext: [/section|chapitre|partie\s+\d/i]
    })
  ]
});
