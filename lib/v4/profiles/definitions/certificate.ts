import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

export const certificateProfile = createDocumentProfile({
  id: "certificate",
  expectedFields: [
    required({
      field: "issuingOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    required({
      field: "beneficiary",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "signatory"],
      importance: "high",
      confidenceThreshold: 0.4
    })
  ],
  optionalFields: [
    field({
      field: "certificateType",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/attestation|certificat/i]
    }),
    field({
      field: "issueDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field({
      field: "validityPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "dueDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "statements",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "signature",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/signature|soussign/i]
    })
  ],
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});
