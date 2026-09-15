import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES CONTRATS (hors assurance, banque, emploi)
 * =====================================================
 */

export const CONTRAT_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Confirmation de souscription — fournisseur d'énergie
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.CONTRAT,

    type:
      "Confirmation de souscription énergie",

    aliases: [
      "confirmation de souscription",
      "souscription énergie",
      "souscription energie",
      "contrat d'électricité",
      "contrat d electricite",
      "contrat de gaz"
    ],

    organizations: [
      "edf",
      "engie",
      "totalenergies",
      "eni"
    ],

    domains: [],

    vocabulary: [
      "confirmation de souscription",
      "contrat d'électricité",
      "contrat d electricite",
      "contrat de gaz",
      "délai de rétractation",
      "delai de retractation",
      "entre en vigueur",
      "mensualité estimée",
      "mensualite estimee",
      "numéro de contrat",
      "numero de contrat"
    ],

    phrases: [
      "confirmation de souscription",
      "délai de rétractation",
      "entre en vigueur"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      false,

    summary:
      "Ce document confirme la souscription d'un contrat d'énergie (électricité ou gaz), sa date d'entrée en vigueur et votre délai de rétractation.",

    importantFields: [
      "fournisseur",
      "numéro de contrat",
      "date d'entrée en vigueur",
      "délai de rétractation",
      "mensualité estimée"
    ],

    ignoredFields: [
      "mentions légales",
      "conditions générales"
    ]
  })

];
