import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

export const receiptProfile = createDocumentProfile({
  id: "receipt",
  expectedFields: [
    required({
      field: "amountTTC",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC", "amountDue"],
      importance: "critical",
      confidenceThreshold: 0.5
    })
  ],
  optionalFields: [
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "issuer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ]
});
