import type { SchemaProfile } from "../schemaProfile.js";

export const invoiceProfile: SchemaProfile = {
  type: "invoice",
  expectedEntities: ["money", "percentage", "organization", "reference", "date"],
  expectedRelations: ["arithmetic", "issuer", "recipient"],
  expectedStructures: ["hasHtTvaTtc"],
  contradictions: ["bankTransactionLedger"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /\bfacture(?:\s+d['’]\w+)?\b/i,
        label: "lexical:facture"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /total\s+(hors\s+taxes?|ht)|montant\s+ht|\bht\b/i,
        label: "lexical:HT"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\btva\b|taxes?\s+et\s+contributions?/i,
        label: "lexical:TVA/taxes"
      }
    },
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /total\s+(facture\s+)?ttc|montant\s+total\s+ttc|\bttc\b/i,
        label: "lexical:TTC"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /n[°o]\s*(de\s*)?facture|numero\s+de\s+facture/i,
        label: "lexical:invoiceNumber"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /\bconsommation\b|\bprestation\b|\babonnement\b/i,
        label: "lexical:consommation/prestation"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasHtTvaTtc", label: "structure:HT/TVA/TTC" }
    },
    {
      family: "entity",
      weight: 0.5,
      matcher: { kind: "entity", entityType: "money", min: 2, label: "entity:money≥2" }
    },
    {
      family: "entity",
      weight: 0.35,
      matcher: {
        kind: "entity",
        entityType: "percentage",
        min: 1,
        label: "entity:percentage"
      }
    },
    {
      family: "relation",
      weight: 0.55,
      matcher: { kind: "relation", relationType: "issuer", label: "relation:issuer" }
    },
    {
      family: "relation",
      weight: 0.45,
      matcher: {
        kind: "relation",
        relationType: "recipient",
        label: "relation:recipient"
      }
    },
    {
      family: "arithmetic",
      weight: 1,
      matcher: { kind: "arithmetic", label: "arithmetic:HT+TVA≈TTC" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:transactionLedger"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /solde\s+precedent|nouveau\s+solde|date\s+valeur/i,
        label: "negative:bankSoldes"
      }
    },
    {
      family: "negativeEvidence",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern:
          /a\s+titre\s+d['’]?exemple|uniquement\s+[aà]\s+titre\s+illustratif|montants?\s+sont\s+donn[eé]s|guide\s+pratique|mode\s+d['’]?emploi/i,
        label: "negative:illustrativeOrGuide"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.9,
      matcher: {
        kind: "structure",
        key: "hasExplanatoryMarks",
        label: "negative:explanatoryStructure"
      }
    }
  ]
};
