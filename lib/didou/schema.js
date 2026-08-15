/**
 * Didou Brain Schema V1
 *
 * Format universel utilisé par :
 * - documentReasoner
 * - factVerifier
 * - future mémoire
 * - future apprentissage
 */

export const DIDOU_SCHEMA_VERSION = "1.0";

export function createEmptyDocumentBrain() {
  return {
    schemaVersion:
      DIDOU_SCHEMA_VERSION,

    document: {
      family: null,
      type: null,
      confidence: 0
    },

    issuer: null,

    recipient: null,

    summary: null,

    purpose: null,

    situation: null,

    events: [],

    amounts: [],

    dates: [],

    obligations: [],

    actions: [],

    deadlines: [],

    warnings: [],

    importantFacts: [],

    evidence: [],

    contradictions: [],

    uncertainties: [],

    score: {
      extraction: 0,
      reasoning: 0,
      verification: 0,
      global: 0
    }
  };
}
export function createEvent({
  type = null,
  label = null,
  amount = null,
  date = null,
  place = null,
  confidence = 0
} = {}) {
  return {
    type,
    label,
    amount,
    date,
    place,
    confidence
  };
}

export function createAmount({
  value = null,
  role = null,
  confidence = 0
} = {}) {
  return {
    value,
    role,
    confidence
  };
}

export function createDate({
  value = null,
  role = null,
  confidence = 0
} = {}) {
  return {
    value,
    role,
    confidence
  };
}

export function createAction({
  action = null,
  how = null,
  confidence = 0
} = {}) {
  return {
    action,
    how,
    confidence
  };
}

export function createEvidence({
  quote = null,
  explanation = null,
  confidence = 0
} = {}) {
  return {
    quote,
    explanation,
    confidence
  };
}
