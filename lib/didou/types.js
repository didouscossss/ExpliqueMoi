/**
 * Contrat stable Didou — consommé par le frontend et Didoutor.
 * ABSENCE D'INFORMATION > INFORMATION INVENTÉE.
 */

export const DIDOU_ENGINE = "didou";
export const DIDOU_VERSION = "1.0.0";

/** @typedef {'strong'|'probable'|'family'|'partial'|'extraction'} UnderstandingLevel */

export const DOCUMENT_FAMILIES = [
  "fiscal",
  "administratif",
  "facture",
  "bancaire",
  "assurance",
  "logement",
  "copropriete",
  "emploi",
  "social",
  "sante",
  "juridique",
  "courrier",
  "contrat",
  "formulaire",
  "autre"
];

export const ATTENTION_LEVELS = ["none", "soon", "urgent", "uncertain"];

/**
 * Crée un résultat Didou vide mais valide.
 * @returns {import('./types.js').DidouResult}
 */
export function emptyDidouResult(overrides = {}) {
  return {
    engine: DIDOU_ENGINE,
    version: DIDOU_VERSION,
    family: "autre",
    documentType: null,
    understandingLevel: "extraction",
    confidence: 0,
    issuer: null,
    recipient: null,
    mainDate: null,
    mainAmount: null,
    importantFacts: [],
    actions: [],
    deadlines: [],
    references: [],
    entities: {
      people: [],
      organizations: [],
      addresses: [],
      contacts: []
    },
    tables: [],
    evidence: [],
    warnings: [],
    uncertainties: [],
    userSummary: {
      document_label: "Document",
      one_sentence: "Le document a été reçu mais peu d’informations certaines ont pu être extraites.",
      important_points: []
    },
    whyReceived: null,
    documentPurpose: null,
    attentionLevel: "uncertain",
    extraction: {
      dates: [],
      amounts: [],
      periods: [],
      rawSignals: []
    },
    ...overrides
  };
}
