import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

export const administrativeLetterProfile = createDocumentProfile({
  id: "administrativeLetter",
  expectedRelations: [
    { type: "actionDeadline", importance: "high" },
    { type: "sender", importance: "medium" }
  ],
  expectedFields: [
    required({
      field: "senderOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "sender"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    required({
      field: "requestedActions",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.45,
      expectedRelations: ["actionDeadline"]
    })
  ],
  optionalFields: [
    field({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "subject",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle", "sectionTitle", "dossierReference"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bobjet\s*:/i]
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "importantDates",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field({
      field: "deadlines",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.5,
      expectedRelations: ["actionDeadline"],
      positiveContext: [/avant\s+le|d['’]?ici\s+le|[eé]ch[eé]ance/i]
    }),
    field({
      field: "requiredDocuments",
      candidateTypes: ["action", "reference"],
      preferredRoles: ["requestedAction", "dossierReference"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pi[eè]ces?|documents?\s+[aà]\s+fournir|joindre/i]
    }),
    field({
      field: "contactInformation",
      candidateTypes: ["email", "phone", "address"],
      preferredRoles: ["contactEmail", "contactPhone"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  // Une lettre peut être complète sans aucun montant
  notApplicableFields: [
    na("amountTTC"),
    na("amountHT"),
    na("amountDue"),
    na("principalAmount")
  ]
});
