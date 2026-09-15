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

    /*
     * Un devis est structuré comme une facture (lignes désignation/
     * quantité/prix unitaire/total, TVA...) et sans "sections"
     * déclarées ici, il perdait systématiquement contre la fiche
     * "Facture" — dont les 4 en-têtes de tableau génériques
     * ("désignation", "prix unitaire", "tva", "total ttc",
     * communs aux deux types de document) valaient à eux seuls
     * plus de points que le nom exact du type ("Devis", +60) et
     * deux phrases distinctives ("devis valable", "bon pour
     * accord") réunis.
     */

    aliases: [
      "proposition commerciale",
      "estimation",
      "offre de prix",
      "devis n°",
      "devis n"
    ],

    vocabulary: [
      "devis",
      "proposition commerciale",
      "estimation",
      "validité du devis",
      "validite du devis",
      "bon pour accord",
      "prix proposé",
      "prix propose",
      "acompte à la commande",
      "acompte a la commande",
      "solde à réception",
      "solde a reception"
    ],

    phrases: [
      "devis valable",
      "bon pour accord",
      "proposition commerciale",
      "signature du client",
      "devis n°"
    ],

    sections: [
      "désignation",
      "quantité",
      "prix unitaire",
      "total ht",
      "tva",
      "total ttc",
      "acompte"
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
   * Avis d'évolution tarifaire
   * ---------------------------------------------------
   *
   * Absent jusqu'ici du catalogue : un avis de hausse de tarif
   * (énergie, télécom, assurance, abonnement...) — pourtant un
   * courrier extrêmement courant — ressortait sans type reconnu,
   * avec un label générique "Document de facturation" et un résumé
   * qui ne dit rien du contenu réel.
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Avis d'évolution tarifaire",

    aliases: [
      "évolution de votre tarif",
      "evolution de votre tarif",
      "évolution tarifaire",
      "evolution tarifaire",
      "hausse de tarif",
      "augmentation de tarif",
      "modification tarifaire",
      "révision tarifaire",
      "revision tarifaire"
    ],

    vocabulary: [
      "évolution de votre tarif",
      "evolution de votre tarif",
      "évolution tarifaire",
      "evolution tarifaire",
      "nouveau tarif",
      "nouveaux tarifs",
      "hausse estimée",
      "hausse estimee",
      "droit de résiliation",
      "droit de resiliation",
      "sans frais",
      "prix du kwh",
      "abonnement passera",
      "passera de"
    ],

    phrases: [
      "évolution de votre tarif",
      "nouveau tarif s'appliquera",
      "droit de résiliation sans frais",
      "aucune démarche à effectuer"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe d'une évolution de vos tarifs (abonnement, prix unitaire...) à compter d'une date donnée. Aucune démarche n'est requise pour que le nouveau tarif s'applique, mais vous disposez généralement d'un délai pour résilier sans frais si cette évolution ne vous convient pas.",

    importantFields: [
      "date d'entrée en vigueur du nouveau tarif",
      "ancien tarif / nouveau tarif",
      "impact estimé sur la facture",
      "délai de résiliation sans frais"
    ],

    ignoredFields: [
      "mentions légales",
      "conditions générales"
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
  }),

  /**
   * ---------------------------------------------------
   * Relance de facture impayée
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FACTURE,

    type:
      "Relance de facture impayée",

    aliases: [
      "relance facture impayée",
      "relance facture impayee",
      "facture impayée",
      "facture impayee",
      "rappel de paiement"
    ],

    organizations: [],

    domains: [],

    vocabulary: [
      "impayée",
      "impayee",
      "demeure impayée",
      "demeure impayee",
      "régularisation",
      "regularisation",
      "suspension",
      "relance"
    ],

    phrases: [
      "demeure impayée à ce jour",
      "demeure impayee a ce jour",
      "sans régularisation",
      "sans regularisation",
      "suspension de votre ligne",
      "suspension du service"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document vous rappelle qu'une facture reste impayée et précise les conséquences possibles (suspension du service, majoration) en l'absence de régularisation.",

    importantFields: [
      "montant impayé",
      "date de la facture",
      "délai de régularisation",
      "conséquence en cas de non-paiement"
    ]
  })
];
