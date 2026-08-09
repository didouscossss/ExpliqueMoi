import { createDocumentProfile } from "../baseProfile.js";
import { field, required } from "../fieldHelpers.js";

export const invoiceProfile = createDocumentProfile({
  id: "invoice",
  expectedRelations: [
    { type: "arithmetic", importance: "high" },
    { type: "issuer", importance: "medium" }
  ],
  expectedFields: [
    required({
      field: "issuer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.35
    }),
    required({
      field: "amountTTC",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.55,
      expectedRelations: ["arithmetic"],
      negativeSignals: [
        /capital\s+social/i,
        /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement/i
      ]
    }),
    required({
      field: "amountHT",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"],
      negativeSignals: [
        /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement/i
      ]
    }),
    required({
      field: "vatAmount",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    })
  ],
  optionalFields: [
    field({
      field: "refundAmount",
      candidateTypes: ["money"],
      preferredRoles: ["refundAmount"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [
        /rembourser|remboursement|solde\s+cr[eé]diteur|a\s+votre\s+cr[eé]dit/i
      ]
    }),
    field({
      field: "amountPaid",
      candidateTypes: ["money"],
      preferredRoles: ["amountPaid"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [
        /mensualit|d[eé]j[aà]\s+(pay[eé]|pr[eé]lev|factur)|paiements?\s+(ant[eé]rieurs|factur)/i
      ]
    }),
    field({
      field: "legalIssuer",
      candidateTypes: ["organization"],
      preferredRoles: ["legalIssuer", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "invoiceNumber",
      candidateTypes: ["reference", "invoiceNumber"],
      preferredRoles: ["invoiceNumber"],
      importance: "high",
      positiveContext: [/facture|n[°o]/i],
      confidenceThreshold: 0.45
    }),
    field({
      field: "invoiceDate",
      candidateTypes: ["date"],
      preferredRoles: ["invoiceDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+(de\s+)?facture|date\s+d['’]?[eé]mission/i],
      negativeSignals: [
        /date\s+de\s+cr[eé]ation|cr[eé]ation\s+de\s+(la\s+)?soci[eé]t[eé]|capital\s+social/i
      ]
    }),
    field({
      field: "dueDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["dueDate", "deadline"],
      importance: "medium",
      confidenceThreshold: 0.55,
      positiveContext: [
        /[eé]ch[eé]ance|arrive\s+[aà]\s+[eé]ch[eé]ance|payable|avant\s+le/i
      ],
      negativeSignals: [
        /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|date\s+de\s+pr[eé]l[eè]vement|rembourserons?\s+(au|le)|sera\s+rembours/i
      ]
    }),
    field({
      field: "refundDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["refundDate", "paymentDate"],
      importance: "high",
      confidenceThreshold: 0.5,
      positiveContext: [
        /rembourser|remboursement|sera\s+rembours/i
      ]
    }),
    field({
      field: "paymentDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["paymentDate", "dueDate"],
      importance: "medium",
      confidenceThreshold: 0.5,
      positiveContext: [
        /pr[eé]l[eè]vement|sera\s+pr[eé]lev|date\s+de\s+pr[eé]l[eè]vement|paiement\s+le/i
      ],
      negativeSignals: [/rembourser|remboursement|sera\s+rembours/i]
    }),
    field({
      field: "servicePeriod",
      candidateTypes: ["period"],
      preferredRoles: ["billingPeriod", "fiscalPeriod"],
      importance: "low",
      confidenceThreshold: 0.5
    }),
    field({
      field: "vatRate",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    }),
    field({
      field: "amountDue",
      candidateTypes: ["money"],
      // amountTTC = repli faible si aucun « reste à payer » / « à payer » explicite.
      // Le resolver démotive ce repli dès qu’un candidat amountDue / refund est fort.
      preferredRoles: ["amountDue", "netToPay", "amountTTC"],
      importance: "high",
      // Ne force PAS égalité avec amountTTC
      confidenceThreshold: 0.5,
      positiveContext: [
        /reste\s+[aà]\s+payer|montant\s+restant|montant\s+(total\s+)?([aà]\s+payer|d[uû])|net\s+[aà]\s+payer|somme\s+[aà]\s+payer|devez\s+r[eé]gler/i
      ],
      negativeSignals: [
        /deja\s+(pay[eé]|pr[eé]lev)|sous[-\s]?total|remise\b|capital\s+social|rembourser|remboursement|rien\s+[aà]\s+faire|mensualit/i
      ]
    }),
    field({
      field: "paymentMethod",
      candidateTypes: ["iban"],
      preferredRoles: ["paymentIban"],
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["clientNumber", "dossierReference", "invoiceNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ],
  forbiddenOrSuspiciousFields: [
    field({
      field: "bankOpeningBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance"],
      positiveContext: [/solde\s+precedent|opening\s+balance/i],
      confidenceThreshold: 0.7,
      importance: "low"
    })
  ]
});
