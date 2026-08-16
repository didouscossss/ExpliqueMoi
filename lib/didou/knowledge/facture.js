import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES FACTURATION / PAIEMENT
 * =====================================================
 */

export const FACTURE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Facture standard
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Facture",

    aliases: [
      "facture client",
      "invoice",
      "facture fournisseur"
    ],

    vocabulary: [
      "facture",
      "total ht",
      "total ttc",
      "tva",
      "net à payer",
      "net a payer",
      "montant à régler",
      "montant a regler",
      "référence facture",
      "reference facture",
      "numéro de facture",
      "numero de facture",
      "date de facture",
      "client",
      "fournisseur"
    ],

    phrases: [
      "net à payer",
      "montant à régler",
      "total ttc",
      "référence facture",
      "date de facture"
    ],

    sections: [
      "désignation",
      "quantité",
      "prix unitaire",
      "montant ht",
      "tva",
      "total ttc"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      null,

    summary:
      "Cette facture présente le détail d'une somme facturée et indique éventuellement un montant à payer.",

    importantFields: [
      "émetteur",
      "client",
      "numéro de facture",
      "date",
      "montant ttc",
      "date limite",
      "mode de paiement"
    ],

    ignoredFields: [
      "mentions légales",
      "conditions générales",
      "coordonnées secondaires"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Facture acquittée
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Facture acquittée",

    aliases: [
      "facture payée",
      "facture réglée",
      "facture acquittee"
    ],

    vocabulary: [
      "facture acquittée",
      "facture acquittee",
      "payé",
      "paye",
      "réglé",
      "regle",
      "acquitté",
      "acquitte",
      "solde réglé",
      "solde regle"
    ],

    phrases: [
      "facture acquittée",
      "payé le",
      "réglé le",
      "solde acquitté"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Cette facture sert de preuve qu'un paiement a déjà été effectué.",

    importantFields: [
      "montant payé",
      "date du paiement",
      "référence facture",
      "émetteur"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Avoir
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Avoir",

    aliases: [
      "facture d'avoir",
      "note de crédit",
      "credit note"
    ],

    vocabulary: [
      "avoir",
      "facture d'avoir",
      "note de crédit",
      "note de credit",
      "crédit",
      "credit",
      "remboursement",
      "régularisation",
      "regularisation",
      "montant crédité",
      "montant credite"
    ],

    phrases: [
      "facture d'avoir",
      "avoir à votre crédit",
      "montant crédité",
      "somme remboursée"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Cet avoir indique une somme créditée en votre faveur, souvent après une correction ou un remboursement.",

    importantFields: [
      "montant de l'avoir",
      "facture d'origine",
      "date",
      "motif"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Prélèvement automatique
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Avis de prélèvement",

    aliases: [
      "prélèvement automatique",
      "avis de prélèvement",
      "prelevement automatique"
    ],

    vocabulary: [
      "prélèvement",
      "prelevement",
      "prélèvement automatique",
      "prelevement automatique",
      "sera prélevé",
      "sera preleve",
      "sera débité",
      "sera debite",
      "mandat sepa",
      "sepa"
    ],

    phrases: [
      "sera prélevé le",
      "sera débité le",
      "prélèvement automatique",
      "mandat sepa"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.AUTOMATIC_DEBIT,

    actionRequired:
      false,

    summary:
      "Ce document vous informe d'un prélèvement automatique prévu sur votre compte.",

    importantFields: [
      "montant",
      "date du prélèvement",
      "créancier",
      "référence de mandat"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Échéancier
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Échéancier de paiement",

    aliases: [
      "échéancier",
      "echeancier",
      "plan de paiement"
    ],

    vocabulary: [
      "échéancier",
      "echeancier",
      "échéance",
      "echeance",
      "mensualité",
      "mensualite",
      "paiement mensuel",
      "prélèvement mensuel",
      "prelevement mensuel"
    ],

    phrases: [
      "vos prochaines échéances",
      "prochain prélèvement",
      "échéancier de paiement",
      "montant des mensualités"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Cet échéancier présente les paiements ou prélèvements prévus à venir.",

    importantFields: [
      "montant de chaque échéance",
      "dates",
      "nombre d'échéances",
      "mode de paiement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Devis
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Devis",

    aliases: [
      "proposition commerciale",
      "estimation",
      "offre de prix"
    ],

    vocabulary: [
      "devis",
      "proposition commerciale",
      "estimation",
      "validité du devis",
      "validite du devis",
      "bon pour accord",
      "prix proposé",
      "prix propose"
    ],

    phrases: [
      "devis valable",
      "bon pour accord",
      "proposition commerciale",
      "signature du client"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce devis présente une proposition de prix avant une éventuelle commande ou réalisation.",

    importantFields: [
      "prestataire",
      "client",
      "montant",
      "validité",
      "prestations",
      "conditions"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Bon de commande
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Bon de commande",

    aliases: [
      "commande",
      "purchase order"
    ],

    vocabulary: [
      "bon de commande",
      "commande",
      "quantité",
      "quantite",
      "prix unitaire",
      "référence produit",
      "reference produit",
      "livraison"
    ],

    phrases: [
      "bon de commande",
      "référence de commande",
      "conditions de livraison"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce document formalise une commande de produits ou de services.",

    importantFields: [
      "vendeur",
      "acheteur",
      "référence commande",
      "articles",
      "quantités",
      "montant",
      "livraison"
    ]
  })
];
