import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES JURIDIQUES
 * =====================================================
 *
 * Règle de prudence :
 * - ne jamais conclure à une obligation sur un seul mot ;
 * - les délais doivent être confirmés par le document ;
 * - une décision de justice et une simple information
 *   ne sont pas la même chose.
 */

export const JURIDIQUE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Mise en demeure
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Mise en demeure",

    aliases: [
      "lettre de mise en demeure",
      "mise en demeure de payer",
      "mise en demeure d'exécuter"
    ],

    vocabulary: [
      "mise en demeure",
      "somme due",
      "obligation",
      "délai",
      "delai",
      "à défaut",
      "a defaut",
      "régulariser",
      "regulariser",
      "payer",
      "exécuter",
      "executer"
    ],

    phrases: [
      "nous vous mettons en demeure",
      "je vous mets en demeure",
      "à défaut de paiement",
      "a defaut de paiement",
      "dans un délai de"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Ce document vous demande formellement de régulariser une situation dans un délai indiqué.",

    importantFields: [
      "émetteur",
      "motif",
      "montant éventuel",
      "date limite",
      "action demandée"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Injonction de payer
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Injonction de payer",

    aliases: [
      "ordonnance portant injonction de payer",
      "requête en injonction de payer"
    ],

    vocabulary: [
      "injonction de payer",
      "ordonnance",
      "créancier",
      "creancier",
      "débiteur",
      "debiteur",
      "somme",
      "greffe",
      "tribunal",
      "opposition"
    ],

    phrases: [
      "ordonnance portant injonction de payer",
      "vous êtes condamné à payer",
      "vous etes condamne a payer",
      "former opposition"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document concerne une procédure judiciaire liée au paiement d'une somme et peut prévoir un délai pour agir.",

    importantFields: [
      "tribunal",
      "créancier",
      "débiteur",
      "montant",
      "date",
      "délai d'opposition"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Assignation
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Assignation en justice",

    aliases: [
      "assignation",
      "assignation devant le tribunal"
    ],

    vocabulary: [
      "assignation",
      "tribunal",
      "audience",
      "demandeur",
      "défendeur",
      "defendeur",
      "avocat",
      "comparaitre",
      "comparaître"
    ],

    phrases: [
      "vous êtes assigné",
      "vous etes assigne",
      "à comparaître",
      "a comparaitre",
      "devant le tribunal"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Ce document vous convoque dans le cadre d'une procédure judiciaire.",

    importantFields: [
      "juridiction",
      "date d'audience",
      "heure",
      "lieu",
      "parties",
      "objet"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Convocation tribunal
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Convocation judiciaire",

    aliases: [
      "convocation tribunal",
      "convocation audience",
      "convocation judiciaire"
    ],

    vocabulary: [
      "convocation",
      "audience",
      "tribunal",
      "cour",
      "greffe",
      "comparution",
      "présence",
      "presence"
    ],

    phrases: [
      "vous êtes convoqué",
      "vous etes convoque",
      "à l'audience du",
      "a l'audience du"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Cette convocation vous informe d'une audience ou d'un rendez-vous judiciaire.",

    importantFields: [
      "juridiction",
      "date",
      "heure",
      "lieu",
      "motif"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Jugement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Jugement",

    aliases: [
      "décision de justice",
      "decision de justice",
      "jugement du tribunal"
    ],

    vocabulary: [
      "jugement",
      "tribunal",
      "demandeur",
      "défendeur",
      "defendeur",
      "condamne",
      "déboute",
      "deboute",
      "dispositif",
      "motifs",
      "appel"
    ],

    phrases: [
      "par ces motifs",
      "le tribunal",
      "condamne",
      "déboute",
      "deboute"
    ],

    sections: [
      "faits",
      "motifs",
      "par ces motifs",
      "dispositif"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document présente une décision rendue par une juridiction.",

    importantFields: [
      "juridiction",
      "date",
      "parties",
      "décision",
      "montant éventuel",
      "voies de recours"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Ordonnance de justice
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Ordonnance de justice",

    aliases: [
      "ordonnance judiciaire",
      "ordonnance du tribunal"
    ],

    vocabulary: [
      "ordonnance",
      "juge",
      "tribunal",
      "greffe",
      "statuant",
      "ordonne",
      "décide",
      "decide"
    ],

    phrases: [
      "par ordonnance",
      "le juge ordonne",
      "il est ordonné",
      "il est ordonne"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document contient une décision prise par un juge dans le cadre d'une procédure.",

    importantFields: [
      "juge",
      "date",
      "parties",
      "décision",
      "délai éventuel"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Courrier d'avocat
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Courrier d'avocat",

    aliases: [
      "lettre avocat",
      "courrier cabinet avocat"
    ],

    vocabulary: [
      "avocat",
      "cabinet",
      "client",
      "dossier",
      "mise en demeure",
      "procédure",
      "procedure",
      "contentieux"
    ],

    phrases: [
      "nous intervenons pour le compte de",
      "notre client",
      "dans le cadre du dossier"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce courrier concerne un dossier juridique ou un différend suivi par un avocat.",

    importantFields: [
      "cabinet",
      "client",
      "objet",
      "action demandée",
      "délai éventuel"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Commissaire de justice
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Acte de commissaire de justice",

    aliases: [
      "acte huissier",
      "acte de commissaire de justice",
      "signification"
    ],

    organizations: [
      "commissaire de justice",
      "huissier de justice"
    ],

    vocabulary: [
      "commissaire de justice",
      "huissier",
      "signification",
      "acte",
      "commandement",
      "saisie",
      "débiteur",
      "debiteur",
      "créancier",
      "creancier"
    ],

    phrases: [
      "signification d'un acte",
      "commandement de payer",
      "acte de commissaire de justice"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Ce document est un acte officiel remis dans le cadre d'une procédure ou d'un recouvrement.",

    importantFields: [
      "nature de l'acte",
      "date",
      "créancier",
      "débiteur",
      "montant",
      "délai"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Commandement de payer
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Commandement de payer",

    aliases: [
      "commandement",
      "commandement de payer"
    ],

    vocabulary: [
      "commandement de payer",
      "somme due",
      "dette",
      "créancier",
      "creancier",
      "débiteur",
      "debiteur",
      "commissaire de justice",
      "délai",
      "delai"
    ],

    phrases: [
      "commandement de payer",
      "vous êtes tenu de payer",
      "vous etes tenu de payer"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document vous demande officiellement de payer une somme dans le cadre d'une procédure de recouvrement.",

    importantFields: [
      "montant",
      "créancier",
      "date",
      "délai",
      "commissaire de justice"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Recours
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.JURIDIQUE,

    type:
      "Information sur un recours",

    aliases: [
      "voie de recours",
      "droit de recours",
      "possibilité d'appel",
      "possibilite d'appel"
    ],

    vocabulary: [
      "recours",
      "appel",
      "contester",
      "opposition",
      "délai",
      "delai",
      "juridiction"
    ],

    phrases: [
      "vous pouvez exercer un recours",
      "vous pouvez faire appel",
      "dans un délai de",
      "dans un delai de"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document explique qu'une décision peut éventuellement être contestée dans un délai déterminé.",

    importantFields: [
      "type de recours",
      "délai",
      "juridiction compétente"
    ]
  })
];
