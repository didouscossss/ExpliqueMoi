import type { SchemaProfile } from "../schemaProfile.js";

export const contractProfile: SchemaProfile = {
  type: "contract",
  expectedEntities: ["organization", "person", "date", "money"],
  expectedRelations: ["organizationPerson"],
  expectedStructures: ["hasContractMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.9,
      matcher: { kind: "regex", pattern: /\bcontrat\b|\bconvention\b/i, label: "lexical:contrat" }
    },
    {
      family: "structural",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasContractMarks",
        label: "structure:contract"
      }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /entre\s+les\s+soussign|article\s+\d|r[eé]siliation|pr[eé]avis/i,
        label: "lexical:clauses"
      }
    }
  ],
  negativeSignals: []
};

export const payslipProfile: SchemaProfile = {
  type: "payslip",
  expectedEntities: ["money", "person", "period"],
  expectedRelations: [],
  expectedStructures: ["hasPayslipMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasPayslipMarks",
        label: "structure:payslip"
      }
    },
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /bulletin\s+de\s+(salaire|paie)|salaire\s+net|salaire\s+brut/i,
        label: "lexical:salaire"
      }
    }
  ],
  negativeSignals: []
};

export const formProfile: SchemaProfile = {
  type: "form",
  expectedEntities: ["person", "address", "phone", "email"],
  expectedRelations: [],
  expectedStructures: ["hasFormFields"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: { kind: "structure", key: "hasFormFields", label: "structure:formFields" }
    },
    {
      family: "lexical",
      weight: 0.9,
      matcher: {
        kind: "regex",
        pattern: /\bformulaire\b/i,
        label: "lexical:formulaire"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\bsignature\b/i,
        label: "lexical:signature"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /case\s+[aà]\s+cocher|\[[ xX]?\]/i,
        label: "lexical:checkbox"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /\bnom\s*:|\bpr[eé]nom\s*:/i,
        label: "lexical:identityFields"
      }
    }
  ],
  negativeSignals: []
};

export const certificateProfile: SchemaProfile = {
  type: "certificate",
  expectedEntities: ["person", "organization", "date"],
  expectedRelations: [],
  expectedStructures: ["hasCertificateMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasCertificateMarks",
        label: "structure:certificate"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /attestation|certificat|je\s+soussign/i,
        label: "lexical:attestation"
      }
    }
  ],
  negativeSignals: []
};

export const receiptProfile: SchemaProfile = {
  type: "receipt",
  expectedEntities: ["money", "date"],
  expectedRelations: [],
  expectedStructures: ["hasReceiptMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: { kind: "structure", key: "hasReceiptMarks", label: "structure:receipt" }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /ticket\s+de\s+caisse|justificatif\s+de\s+paiement|\bre[cç]u\b/i,
        label: "lexical:receipt"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /total\s+ht|total\s+ttc|n[°o]\s*facture/i,
        label: "negative:looksLikeInvoice"
      }
    }
  ]
};

export const noticeProfile: SchemaProfile = {
  type: "notice",
  expectedEntities: ["date", "organization"],
  expectedRelations: [],
  expectedStructures: ["hasNoticeMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasNoticeMarks", label: "structure:notice" }
    },
    {
      family: "lexical",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /\bavis\b|\bnotice\b|information\s+importante|porte\s+[aà]\s+votre\s+connaissance/i,
        label: "lexical:notice"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /document\s+[aà]\s+conserver|pour\s+information/i,
        label: "lexical:noticeConserve"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.6,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceTotals"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.45,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankStructure"
      }
    }
  ]
};

export const financialStatementProfile: SchemaProfile = {
  type: "financialStatement",
  expectedEntities: ["money", "organization", "period"],
  expectedRelations: [],
  expectedStructures: ["hasFinancialStatementMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasFinancialStatementMarks",
        label: "structure:financial"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /bilan|compte\s+de\s+r[eé]sultat|liasse\s+fiscale|actif|passif/i,
        label: "lexical:liasse"
      }
    }
  ],
  negativeSignals: []
};

export const explanatoryDocumentProfile: SchemaProfile = {
  type: "explanatoryDocument",
  expectedEntities: [],
  expectedRelations: [],
  expectedStructures: ["hasExplanatoryMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasExplanatoryMarks",
        label: "structure:explanatory"
      }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /mode\s+d['’]?emploi|guide\s+pratique|\bfaq\b|comment\s+faire/i,
        label: "lexical:guide"
      }
    }
  ],
  negativeSignals: []
};
