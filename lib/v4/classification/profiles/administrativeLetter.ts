import type { SchemaProfile } from "../schemaProfile.js";

export const administrativeLetterProfile: SchemaProfile = {
  type: "administrativeLetter",
  expectedEntities: ["date", "person", "organization", "action"],
  expectedRelations: ["actionDeadline", "sender", "recipient"],
  expectedStructures: ["hasLetterFormulas"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.8,
      matcher: { kind: "regex", pattern: /\bobjet\s*:/i, label: "lexical:objet" }
    },
    {
      family: "lexical",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /madame[,.]?\s*monsieur/i,
        label: "lexical:madameMonsieur"
      }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /nous\s+vous\s+informons|je\s+vous\s+prie|cordialement/i,
        label: "lexical:formules"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: {
        kind: "structure",
        key: "hasLetterFormulas",
        label: "structure:letter"
      }
    },
    {
      family: "relation",
      weight: 0.7,
      matcher: {
        kind: "relation",
        relationType: "actionDeadline",
        label: "relation:actionDeadline"
      }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "action", min: 1, label: "entity:action" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceStructure"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankStructure"
      }
    }
  ]
};
