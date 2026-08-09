/**
 * Profils de classification fiscaux spécialisés (V4-L).
 * Une référence seule ne suffit pas — signaux combinés.
 */

import type { SchemaProfile } from "../schemaProfile.js";

export const incomeTaxReturnSchemaProfile: SchemaProfile = {
  type: "incomeTaxReturn",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.1,
      matcher: {
        kind: "regex",
        pattern:
          /d[eé]claration\s+des\s+revenus|formulaire\s+n[°o]?\s*2042|n[°o]\s*2042\b/i,
        label: "lexical:incomeTaxReturn"
      }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /foyer\s+fiscal|traitements\s+et\s+salaires|d[eé]clarant/i,
        label: "lexical:returnSections"
      }
    },
    {
      family: "structural",
      weight: 0.5,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern:
          /voir\s+votre\s+d[eé]claration\s+2042|reportez[- ]vous\s+[aà]\s+votre\s+d[eé]claration\s+2042|conform[eé]ment\s+[aà]\s+votre\s+d[eé]claration\s+2042/i,
        label: "negative:2042MentionOnly"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /avis\s+d['’]?imp[oô]t\s+sur\s+les\s+revenus/i,
        label: "negative:isNoticeNotReturn"
      }
    }
  ]
};

export const incomeTaxNoticeSchemaProfile: SchemaProfile = {
  type: "incomeTaxNotice",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.15,
      matcher: {
        kind: "regex",
        pattern:
          /avis\s+d['’]?imp[oô]t\s+sur\s+le[s]?\s+revenu[s]?|avis\s+d['’]?imposition/i,
        label: "lexical:incomeTaxNotice"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern:
          /revenu\s+fiscal\s+de\s+r[eé]f[eé]rence|pr[eé]l[eè]vement\s+[aà]\s+la\s+source|reste\s+[aà]\s+payer|montant\s+[aà]\s+rembourser/i,
        label: "lexical:noticeFields"
      }
    },
    {
      family: "structural",
      weight: 0.5,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
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

export const propertyTaxSchemaProfile: SchemaProfile = {
  type: "propertyTax",
  expectedEntities: ["money", "date", "reference"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.2,
      matcher: {
        kind: "regex",
        pattern:
          /avis\s+de\s+taxe\s+fonci[eè]re|taxe\s+fonci[eè]re\s+sur\s+les\s+propri[eé]t[eé]s|taxes?\s+fonci[eè]res/i,
        label: "lexical:propertyTax"
      }
    },
    {
      family: "lexical",
      weight: 0.4,
      matcher: {
        kind: "regex",
        pattern: /propri[eé]t[eé]\s+b[aâ]tie|base\s+d['’]?imposition|cotisation/i,
        label: "lexical:propertyParts"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\btotal\s+ht\b|\btotal\s+ttc\b|facture\s+n/i,
        label: "negative:invoiceLogic"
      }
    }
  ]
};

export const taxFormSchemaProfile: SchemaProfile = {
  type: "taxForm",
  expectedEntities: ["reference", "date"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /2065\s*-?\s*sd|3310\s*-?\s*ca3|2572\s*-?\s*sd|1330\s*-?\s*cvae/i,
        label: "lexical:taxFormRef"
      }
    },
    {
      family: "structural",
      weight: 0.4,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    }
  ],
  negativeSignals: []
};

export const unknownTaxDocumentSchemaProfile: SchemaProfile = {
  type: "unknownTaxDocument",
  expectedEntities: [],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 0.35,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:taxWeak" }
    },
    {
      family: "lexical",
      weight: 0.3,
      matcher: {
        kind: "regex",
        pattern: /imp[oô]t|fiscal|dgfip|finances\s+publiques/i,
        label: "lexical:fiscalVague"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.4,
      matcher: {
        kind: "regex",
        pattern:
          /avis\s+d['’]?imp[oô]t\s+sur\s+les\s+revenus|d[eé]claration\s+des\s+revenus|taxe\s+fonci[eè]re/i,
        label: "negative:knownTaxFamily"
      }
    }
  ]
};
