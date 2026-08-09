import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

/** explanatoryDocument + notice — aucun montant/date/personne requis. */
export const explanatoryDocumentProfile = createDocumentProfile({
  id: "explanatoryDocument",
  alsoSupports: ["notice"],
  expectedFields: [
    required({
      field: "title",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "high",
      confidenceThreshold: 0.3
    })
  ],
  optionalFields: [
    field({
      field: "topic",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle", "documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "sections",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.25
    }),
    field({
      field: "keyPoints",
      candidateTypes: ["action", "obligation", "warning"],
      preferredRoles: ["requestedAction", "obligation", "warning"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field({
      field: "definitions",
      candidateTypes: ["sectionTitle", "reference"],
      preferredRoles: ["sectionTitle", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3,
      positiveContext: [/d[eé]finition|signifie|on\s+entend/i]
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "procedures",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "contactReferences",
      candidateTypes: ["email", "phone", "organization", "reference"],
      preferredRoles: ["contactEmail", "contactPhone", "issuer"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.35
    })
  ],
  notApplicableFields: [
    na("amountTTC"),
    na("amountHT"),
    na("amountDue"),
    na("principalAmount"),
    {
      field: "requiredDate",
      candidateTypes: ["date"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    },
    {
      field: "requiredPerson",
      candidateTypes: ["person"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    }
  ]
});
