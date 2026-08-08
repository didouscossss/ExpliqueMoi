import type { SchemaProfile } from "../schemaProfile.js";

export const bankStatementProfile: SchemaProfile = {
  type: "bankStatement",
  expectedEntities: ["iban", "money", "date"],
  expectedRelations: ["spatial"],
  expectedStructures: ["hasTransactionTable"],
  contradictions: ["invoiceTotals"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /relev[ée]\s+(de\s+)?compte|relev[ée]\s+bancaire/i,
        label: "lexical:releve"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /solde\s+precedent|nouveau\s+solde|solde\s+(crediteur|debiteur)/i,
        label: "lexical:soldes"
      }
    },
    {
      family: "lexical",
      weight: 0.65,
      matcher: {
        kind: "regex",
        pattern: /\bdebit\b|\bcredit\b/i,
        label: "lexical:debitCredit"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /date\s+valeur|\blibelle\b|\boperation/i,
        label: "lexical:operations"
      }
    },
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "structure:transactions"
      }
    },
    {
      family: "entity",
      weight: 0.25,
      matcher: { kind: "entity", entityType: "iban", min: 1, label: "entity:iban" }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "money", min: 3, label: "entity:money≥3" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 1,
      matcher: {
        kind: "absence",
        key: "hasTransactionTable",
        label: "negative:noTransactionStructure"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceTotalsPresent"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /\bfacture\b/i,
        label: "negative:factureLabel"
      }
    }
  ]
};
