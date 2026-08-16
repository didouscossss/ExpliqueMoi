import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * ASSURANCE
 * =====================================================
 */

export const ASSURANCE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Attestation d'assurance
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ASSURANCE,

    type:
      "Attestation d'assurance",

    aliases: [
      "attestation assurance",
      "certificat assurance",
      "justificatif assurance"
    ],

    organizations: [
      "axa",
      "allianz",
      "maif",
      "macif",
      "matmut",
      "groupama",
      "generali",
      "mma",
      "gan",
      "pacifica",
      "covéa",
      "covea"
    ],

    domains: [
      "axa.fr",
      "allianz.fr",
      "maif.fr",
      "macif.fr",
      "matmut.fr",
      "groupama.fr",
      "generali.fr"
    ],

    vocabulary: [
      "assuré",
      "assure",
      "assureur",
      "garantie",
      "responsabilité civile",
      "responsabilite civile",
      "contrat d'assurance",
      "contrat assurance",
      "risque couvert",
      "risques couverts",
      "souscripteur",
      "atteste que",
      "est assuré",
      "est assure"
    ],

    phrases: [
      "atteste que",
      "certifie que",
      "est assuré",
      "est assure",
      "justifie d'une assurance",
      "justifie d’un contrat"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce document sert à prouver que vous êtes couvert par une assurance.",

    importantFields: [
      "assuré",
      "numero contrat",
      "date effet",
      "date expiration",
      "garanties"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Avis d'échéance
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ASSURANCE,

    type:
      "Avis d'échéance",

    vocabulary: [
      "échéance",
      "echeance",
      "cotisation",
      "prime",
      "montant à payer",
      "montant a payer",
      "renouvellement"
    ],

    phrases: [
      "avis d'échéance",
      "cotisation annuelle",
      "prime annuelle",
      "montant à régler"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document indique une cotisation ou une prime d'assurance à payer."
  }),

  /**
   * ---------------------------------------------------
   * Relevé de situation
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ASSURANCE,

    type:
      "Relevé de situation",

    vocabulary: [
      "sinistre",
      "bonus",
      "malus",
      "historique",
      "relevé d'information",
      "releve d'information",
      "coefficient"
    ],

    phrases: [
      "relevé d'information",
      "historique des sinistres",
      "bonus malus"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document présente votre historique d'assurance."
  })

];
