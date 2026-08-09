import { createDocumentProfile } from "../baseProfile.js";
import { field, na, required } from "../fieldHelpers.js";

export const payslipProfile = createDocumentProfile({
  id: "payslip",
  expectedFields: [
    required({
      field: "grossSalary",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT", "other", "amountTTC"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/brut|salaire\s+brut/i]
    }),
    required({
      field: "netSalary",
      candidateTypes: ["money"],
      preferredRoles: ["netToPay", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [/net\s+[aà]\s+payer|salaire\s+net|net\s+pay[eé]/i]
    })
  ],
  optionalFields: [
    field({
      field: "employer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "employee",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "signatory"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "payPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "netTaxable",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountHT"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/net\s+imposable/i]
    }),
    field({
      field: "socialContributions",
      candidateTypes: ["money"],
      preferredRoles: ["linePrice", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/cotisation|urssaf|cs[g|g]/i]
    }),
    field({
      field: "withholdingTax",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]l[eè]vement\s+[aà]\s+la\s+source|pas\b/i]
    }),
    field({
      field: "paymentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "dueDate"],
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  // Ne pas transformer toutes les cotisations en montant principal
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});
