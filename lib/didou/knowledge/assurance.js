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
  }),

  /**
   * ---------------------------------------------------
   * Suivi de dossier sinistre
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ASSURANCE,

    type:
      "Suivi de dossier sinistre",

    aliases: [
      "déclaration de sinistre",
      "declaration de sinistre",
      "dossier sinistre",
      "suivi de sinistre",
      "ouverture de sinistre"
    ],

    organizations: [],

    domains: [],

    vocabulary: [
      "sinistre",
      "dossier de sinistre",
      "expert",
      "expertise",
      "dommages",
      "indemnisation",
      "dégât des eaux",
      "degat des eaux",
      "constat amiable",
      "franchise"
    ],

    phrases: [
      "dossier de sinistre",
      "votre déclaration de sinistre",
      "votre declaration de sinistre",
      "un expert se rendra",
      "montant de l'indemnisation",
      "montant de l indemnisation"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document vous informe du suivi de votre dossier de sinistre auprès de votre assureur, et précise éventuellement les pièces à fournir ou le montant d'indemnisation envisagé.",

    importantFields: [
      "numéro de sinistre",
      "date de la déclaration",
      "montant d'indemnisation",
      "pièces à fournir",
      "rendez-vous d'expertise"
    ],

    ignoredFields: [
      "mentions légales",
      "conditions générales"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Rejet de prise en charge / remboursement
   * ---------------------------------------------------
   *
   * Absent jusqu'ici du catalogue : ce refus (mutuelle ou
   * assurance) tombait sans fiche dédiée sur un label générique
   * "Contrat d'assurance" et un résumé "définit ou confirme une
   * relation contractuelle" — sans aucun rapport avec un refus de
   * remboursement, et surtout sans jamais mentionner le délai de
   * contestation, l'information la plus importante du document.
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ASSURANCE,

    type:
      "Rejet de prise en charge",

    aliases: [
      "rejet de prise en charge",
      "refus de prise en charge",
      "refus de remboursement",
      "rejet de remboursement",
      "décision de rejet",
      "decision de rejet"
    ],

    vocabulary: [
      "rejet de votre demande",
      "ne peut être acceptée",
      "ne peut etre acceptee",
      "nous sommes au regret",
      "non couvert",
      "n'est pas couvert",
      "n est pas couvert",
      "réclamation",
      "reclamation",
      "médiateur de l'assurance",
      "mediateur de l assurance",
      "décision définitive",
      "decision definitive"
    ],

    phrases: [
      "rejet de votre demande",
      "ne peut être acceptée",
      "nous sommes au regret",
      "vous disposez d'un délai",
      "médiateur de l'assurance"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe qu'une demande de prise en charge ou de remboursement a été refusée, et précise le motif ainsi que le délai dont vous disposez pour contester cette décision (réclamation ou médiateur de l'assurance) si vous n'êtes pas d'accord.",

    importantFields: [
      "motif du refus",
      "montant concerné",
      "délai de contestation",
      "interlocuteur (réclamation / médiateur)"
    ],

    ignoredFields: [
      "mentions légales",
      "conditions générales"
    ]
  })

];
