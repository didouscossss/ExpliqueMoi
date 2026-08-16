import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES BANCAIRES
 * =====================================================
 */

export const BANQUE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * RIB
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Relevé d'identité bancaire",

    aliases: [
      "rib",
      "releve d'identite bancaire",
      "relevé d'identité bancaire"
    ],

    vocabulary: [
      "iban",
      "bic",
      "titulaire du compte",
      "domiciliation bancaire",
      "identifiant national",
      "relevé d'identité bancaire",
      "releve d'identite bancaire"
    ],

    phrases: [
      "coordonnées bancaires",
      "relevé d'identité bancaire",
      "iban",
      "bic"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce document permet de communiquer vos coordonnées bancaires.",

    importantFields: [
      "titulaire",
      "iban",
      "bic",
      "banque"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Relevé bancaire
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Relevé bancaire",

    aliases: [
      "relevé de compte",
      "releve de compte",
      "extrait de compte"
    ],

    vocabulary: [
      "solde",
      "opérations",
      "operations",
      "débit",
      "debit",
      "crédit",
      "credit",
      "date valeur",
      "mouvements",
      "compte courant"
    ],

    phrases: [
      "relevé de compte",
      "solde précédent",
      "solde précédent au",
      "liste des opérations"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document récapitule les opérations réalisées sur votre compte bancaire.",

    importantFields: [
      "solde",
      "débits",
      "crédits",
      "dates",
      "libellés"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Avis de virement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Avis de virement",

    aliases: [
      "virement bancaire",
      "avis de virement"
    ],

    vocabulary: [
      "virement",
      "ordre de virement",
      "bénéficiaire",
      "beneficiaire",
      "montant viré",
      "montant vire",
      "référence de virement",
      "reference de virement"
    ],

    phrases: [
      "avis de virement",
      "virement effectué",
      "virement effectue"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document confirme un transfert d'argent vers ou depuis un compte bancaire.",

    importantFields: [
      "montant",
      "émetteur",
      "bénéficiaire",
      "date"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Prélèvement SEPA
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Prélèvement SEPA",

    aliases: [
      "mandat sepa",
      "prelevement sepa",
      "prélèvement sepa"
    ],

    vocabulary: [
      "sepa",
      "mandat",
      "créancier",
      "creancier",
      "référence unique de mandat",
      "rum",
      "prélèvement",
      "prelevement"
    ],

    phrases: [
      "mandat de prélèvement sepa",
      "référence unique de mandat"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.AUTOMATIC_DEBIT,

    actionRequired:
      false,

    summary:
      "Ce document autorise ou décrit un prélèvement automatique sur votre compte.",

    importantFields: [
      "créancier",
      "iban",
      "montant",
      "date",
      "rum"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Offre de prêt
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Offre de prêt",

    aliases: [
      "offre de crédit",
      "offre de credit",
      "offre de prêt"
    ],

    vocabulary: [
      "emprunteur",
      "capital emprunté",
      "capital emprunte",
      "taux",
      "mensualité",
      "mensualite",
      "durée",
      "duree",
      "coût du crédit",
      "cout du credit"
    ],

    phrases: [
      "offre de prêt",
      "offre préalable",
      "offre prealable",
      "conditions du crédit"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce document présente les conditions d'un crédit avant acceptation.",

    importantFields: [
      "montant",
      "durée",
      "taux",
      "mensualité",
      "coût total"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Tableau d'amortissement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Tableau d'amortissement",

    aliases: [
      "amortissement du prêt",
      "tableau du prêt"
    ],

    vocabulary: [
      "capital restant dû",
      "capital restant du",
      "échéance",
      "echeance",
      "intérêts",
      "interets",
      "amortissement",
      "mensualité"
    ],

    phrases: [
      "capital restant dû",
      "tableau d'amortissement",
      "échéances du prêt"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document détaille chaque échéance du prêt jusqu'à son remboursement complet.",

    importantFields: [
      "capital restant dû",
      "mensualités",
      "intérêts",
      "dates"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Rejet de prélèvement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Rejet de prélèvement",

    aliases: [
      "incident de paiement",
      "rejet bancaire"
    ],

    vocabulary: [
      "rejet",
      "incident",
      "paiement refusé",
      "paiement refuse",
      "insuffisance de provision",
      "opération rejetée",
      "operation rejetee"
    ],

    phrases: [
      "prélèvement rejeté",
      "paiement refusé",
      "insuffisance de provision"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document signale qu'un paiement ou prélèvement n'a pas pu être exécuté.",

    importantFields: [
      "montant",
      "motif",
      "date",
      "créancier"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Frais bancaires
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.BANCAIRE,

    type:
      "Avis de frais bancaires",

    aliases: [
      "frais bancaires",
      "commission bancaire"
    ],

    vocabulary: [
      "commission",
      "frais",
      "agios",
      "incident bancaire",
      "facturation bancaire"
    ],

    phrases: [
      "frais prélevés",
      "commission d'intervention",
      "agios"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document détaille des frais facturés par votre établissement bancaire.",

    importantFields: [
      "montant",
      "motif",
      "date",
      "type de frais"
    ]
  })

];
