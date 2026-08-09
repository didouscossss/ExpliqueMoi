import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

export const formProfile = createDocumentProfile({
  id: "form",
  expectedFields: [
    required({
      field: "formTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/\bformulaire\b|\bdemande\b/i]
    })
  ],
  optionalFields: [
    field({
      field: "issuingOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "fields",
      candidateTypes: ["person", "address", "email", "phone", "reference"],
      preferredRoles: ["recipient", "other", "contactEmail"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3,
      positiveContext: [/signature/i]
    }),
    field({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "deadline"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.35
    }),
    field({
      field: "instructions",
      candidateTypes: ["action", "warning"],
      preferredRoles: ["requestedAction", "warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "submissionDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      expectedRelations: ["actionDeadline"]
    })
  ],
  notApplicableFields: [na("amountTTC"), na("principalAmount")]
});
