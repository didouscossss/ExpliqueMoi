/**
 * Didou Knowledge Schema V1
 *
 * Structure standard de toutes les fiches.
 */

/**
 * Création d'une fiche documentaire.
 */
export function createKnowledgeDocument({
  family = null,
  type = null,

  aliases = [],
  organizations = [],
  domains = [],

  vocabulary = [],
  phrases = [],

  sections = [],
  references = [],

  intent = null,
  situation = null,

  summary = null,

  actionRequired = null,

  importantFields = [],
  ignoredFields = []
} = {}) {
  return {
    family,
    type,

    aliases,

    organizations,
    domains,

    vocabulary,
    phrases,

    sections,
    references,

    intent,
    situation,

    summary,

    actionRequired,

    importantFields,
    ignoredFields
  };
}

/**
 * Familles standard.
 */
export const KNOWLEDGE_FAMILIES = {
  FISCAL: "fiscal",
  ASSURANCE: "assurance",
  BANCAIRE: "bancaire",
  FACTURE: "facture",
  EMPLOI: "emploi",
  LOGEMENT: "logement",
  COPROPRIETE: "copropriete",
  SANTE: "sante",
  SOCIAL: "social",
  JURIDIQUE: "juridique",
  ADMINISTRATIF: "administratif",
  CONTRAT: "contrat",
  COURRIER: "courrier"
};

/**
 * Intentions.
 */
export const KNOWLEDGE_INTENTS = {
  PROOF: "proof",
  CONTRACT: "contract",
  PAYMENT: "payment",
  REFUND: "refund",
  DECLARATION: "declaration",
  DECISION: "decision",
  REQUEST: "request",
  INFORMATION: "information",
  MEETING: "meeting",
  PROFILE: "profile"
};

/**
 * Situations.
 */
export const KNOWLEDGE_SITUATIONS = {
  PAYMENT_DUE: "payment_due",
  AUTOMATIC_DEBIT: "automatic_debit",
  REFUND: "refund",
  PROOF: "proof",
  CONTRACT: "contract",
  DECLARATION: "declaration",
  MEETING: "meeting",
  NOTIFICATION: "notification"
};
