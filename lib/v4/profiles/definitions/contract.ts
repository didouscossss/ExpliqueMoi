import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

export const contractProfile = createDocumentProfile({
  id: "contract",
  expectedRelations: [
    { type: "organizationPerson", importance: "medium" },
    { type: "actionDeadline", importance: "low" }
  ],
  expectedFields: [
    required({
      field: "parties",
      candidateTypes: ["organization", "person"],
      preferredRoles: ["issuer", "recipient", "recipientOrg", "signatory"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.35
    }),
    required({
      field: "effectiveDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/effet|entr[eé]e\s+en\s+vigueur|commence|partir\s+du/i]
    })
  ],
  optionalFields: [
    field({
      field: "contractTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bcontrat\b|\bconvention\b/i]
    }),
    field({
      field: "endDate",
      candidateTypes: ["date"],
      preferredRoles: ["dueDate", "deadline", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/fin|terme|expire|jusqu['’]?au/i]
    }),
    field({
      field: "duration",
      candidateTypes: ["period", "reference"],
      preferredRoles: ["billingPeriod", "other"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/dur[eé]e|mois|ans|ann[eé]e/i]
    }),
    field({
      field: "noticePeriod",
      candidateTypes: ["period", "deadline", "date"],
      preferredRoles: ["deadline", "other"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]avis|r[eé]siliation|d[eé]nonciation/i]
    }),
    field({
      field: "obligations",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "paymentClauses",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/signature|sign[eé]/i]
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});
