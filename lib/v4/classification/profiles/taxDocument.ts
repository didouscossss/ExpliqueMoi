import type { SchemaProfile } from "../schemaProfile.js";

export const taxDocumentProfile: SchemaProfile = {
  type: "taxDocument",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern:
          /avis\s+d['’]?imp[oô]t|imp[oô]t\s+sur\s+le\s+revenu|num[eé]ro\s+fiscal|direction\s+g[eé]n[eé]rale\s+des\s+finances|dgfip|taxe\s+fonci[eè]re/i,
        label: "lexical:fiscal"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "money", min: 1, label: "entity:money" }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /revenu\s+fiscal|montant\s+[aà]\s+payer|date\s+limite\s+de\s+paiement/i,
        label: "lexical:taxPayment"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankLedger"
      }
    }
  ]
};
