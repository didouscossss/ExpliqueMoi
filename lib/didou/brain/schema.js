/**
 * Didou Brain Schema V1
 *
 * Schéma universel du cerveau Didou.
 *
 * Ce fichier ne fait aucune analyse.
 * Il définit uniquement les structures
 * utilisées par les autres composants Brain.
 */

export const DIDOU_SCHEMA_VERSION = "1.0";

/**
 * =====================================================
 * DOCUMENT BRAIN VIDE
 * =====================================================
 */

export function createEmptyDocumentBrain() {
  return {
    schemaVersion:
      DIDOU_SCHEMA_VERSION,

    /*
     * Identification générale du document.
     */
    document: {
      family: null,
      type: null,
      confidence: 0
    },

    /*
     * Acteurs.
     */
    issuer: null,
    issuerVerified: false,

    recipient: null,
    recipientVerified: false,

    /*
     * Compréhension générale.
     */
    summary: null,
    purpose: null,
    situation: null,

    /*
     * Événements métier.
     */
    events: [],

    /*
     * Informations structurées.
     */
    amounts: [],
    dates: [],

    /*
     * Obligations / actions.
     */
    obligations: [],
    actions: [],
    deadlines: [],

    /*
     * Informations importantes.
     */
    importantFacts: [],

    /*
     * Prudence.
     */
    warnings: [],
    uncertainties: [],
    contradictions: [],

    /*
     * Preuves.
     */
    evidence: [],

    /*
     * Scores internes.
     */
    score: {
      extraction: 0,
      reasoning: 0,
      verification: 0,
      global: 0
    },

    /*
     * Métadonnées futures.
     */
    meta: {
      createdBy: "didou-brain",
      schemaVersion:
        DIDOU_SCHEMA_VERSION
    }
  };
}

/**
 * =====================================================
 * EVENT
 * =====================================================
 */

export function createEvent({
  type = null,
  label = null,
  amount = null,
  date = null,
  place = null,
  actor = null,
  actionRequired = null,
  confidence = 0,
  evidence = []
} = {}) {
  return {
    type,
    label,
    amount,
    date,
    place,
    actor,
    actionRequired,
    confidence,
    evidence:
      Array.isArray(evidence)
        ? evidence
        : []
  };
}

/**
 * =====================================================
 * AMOUNT
 * =====================================================
 */

export function createAmount({
  value = null,
  numeric = null,
  role = null,
  confidence = 0,
  verified = false,
  evidence = null
} = {}) {
  return {
    value,
    numeric,
    role,
    confidence,
    verified,
    evidence
  };
}

/**
 * =====================================================
 * DATE
 * =====================================================
 */

export function createDate({
  value = null,
  role = null,
  confidence = 0,
  verified = false,
  evidence = null
} = {}) {
  return {
    value,
    role,
    confidence,
    verified,
    evidence
  };
}

/**
 * =====================================================
 * ACTION
 * =====================================================
 */

export function createAction({
  action = null,
  how = null,
  deadline = null,
  reason = null,
  confidence = 0,
  verified = false
} = {}) {
  return {
    action,
    how,
    deadline,
    reason,
    confidence,
    verified
  };
}

/**
 * =====================================================
 * EVIDENCE
 * =====================================================
 */

export function createEvidence({
  quote = null,
  explanation = null,
  page = null,
  start = null,
  end = null,
  confidence = 0
} = {}) {
  return {
    quote,
    explanation,
    page,
    start,
    end,
    confidence
  };
}

/**
 * =====================================================
 * IMPORTANT FACT
 * =====================================================
 */

export function createImportantFact({
  kind = null,
  label = null,
  value = null,
  confidence = 0,
  verified = false
} = {}) {
  return {
    kind,
    label,
    value,
    confidence,
    verified
  };
}

/**
 * =====================================================
 * DEADLINE
 * =====================================================
 */

export function createDeadline({
  date = null,
  label = null,
  meaning = null,
  confidence = 0,
  verified = false
} = {}) {
  return {
    date,
    label,
    meaning,
    confidence,
    verified
  };
}

/**
 * =====================================================
 * EVENT TYPES
 * =====================================================
 */

export const EVENT_TYPES = {
  PAYMENT_DUE:
    "payment_due",

  AUTOMATIC_DEBIT:
    "automatic_debit",

  PAYMENT_COMPLETED:
    "payment_completed",

  REFUND:
    "refund",

  REFUND_COMPLETED:
    "refund_completed",

  MEETING:
    "meeting",

  CONTRACT:
    "contract",

  CLAIM:
    "claim",

  TAX_DECLARATION:
    "tax_declaration",

  DEADLINE:
    "deadline",

  REQUEST:
    "request",

  DECISION:
    "decision",

  INFORMATION:
    "information",

  UNKNOWN:
    "unknown"
};

/**
 * =====================================================
 * DATE TYPES
 * =====================================================
 */

export const DATE_TYPES = {
  ISSUE:
    "issue",

  DEADLINE:
    "deadline",

  PAYMENT:
    "payment",

  DEBIT:
    "debit",

  REFUND:
    "refund",

  MEETING:
    "meeting",

  PERIOD:
    "period",

  START:
    "start",

  END:
    "end",

  SIGNATURE:
    "signature",

  UNKNOWN:
    "unknown"
};

/**
 * =====================================================
 * AMOUNT TYPES
 * =====================================================
 */

export const AMOUNT_TYPES = {
  DUE:
    "due",

  REFUND:
    "refund",

  PAID:
    "paid",

  DEBIT:
    "debit",

  INSTALLMENT:
    "installment",

  VAT:
    "vat",

  HT:
    "ht",

  TTC:
    "ttc",

  PENALTY:
    "penalty",

  DEPOSIT:
    "deposit",

  CREDIT:
    "credit",

  LEGAL:
    "legal",

  UNKNOWN:
    "unknown"
};

/**
 * =====================================================
 * UNDERSTANDING LEVELS
 * =====================================================
 */

export const BRAIN_UNDERSTANDING_LEVELS = {
  STRONG:
    "strong",

  PROBABLE:
    "probable",

  PARTIAL:
    "partial",

  EXTRACTION:
    "extraction",

  UNKNOWN:
    "unknown"
};

/**
 * =====================================================
 * VERIFICATION STATES
 * =====================================================
 */

export const VERIFICATION_STATES = {
  VERIFIED:
    "verified",

  PROBABLE:
    "probable",

  UNVERIFIED:
    "unverified",

  CONTRADICTED:
    "contradicted"
};
