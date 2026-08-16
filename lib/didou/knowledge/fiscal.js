import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES FISCALES
 * =====================================================
 *
 * Objectif :
 * donner à Didou une vraie culture documentaire
 * autour des impôts, déclarations, avis, formulaires
 * et documents DGFIP.
 *
 * IMPORTANT :
 * - une référence de formulaire seule ne suffit pas ;
 * - on combine vocabulaire, phrases, organismes,
 *   domaines et références ;
 * - les documents vierges doivent rester prudents.
 */

export const FISCAL_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Déclaration de résultats 2031-SD
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Déclaration de résultats — formulaire 2031-SD",

    aliases: [
      "2031-SD",
      "formulaire 2031",
      "déclaration 2031",
      "liasse 2031",
      "déclaration de résultats BIC"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "service des impôts des entreprises",
      "sie",
      "finances publiques"
    ],

    domains: [
      "impots.gouv.fr",
      "economie.gouv.fr"
    ],

    vocabulary: [
      "2031",
      "2031-sd",
      "déclaration de résultats",
      "declaration de resultats",
      "bénéfices industriels et commerciaux",
      "benefices industriels et commerciaux",
      "bic",
      "bénéfices professionnels",
      "benefices professionnels",
      "exercice clos",
      "résultat fiscal",
      "resultat fiscal",
      "entreprise individuelle",
      "régime réel",
      "regime reel"
    ],

    phrases: [
      "déclaration de résultats",
      "exercice clos le",
      "bénéfices industriels et commerciaux",
      "régime réel d'imposition",
      "regime reel d'imposition"
    ],

    references: [
      "2031",
      "2031-SD"
    ],

    sections: [
      "identification de l'entreprise",
      "exercice clos",
      "résultat fiscal",
      "résultat comptable",
      "benefices industriels et commerciaux"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECLARATION,

    situation:
      KNOWLEDGE_SITUATIONS.DECLARATION,

    actionRequired:
      null,

    summary:
      "Ce formulaire sert à déclarer les résultats fiscaux d'une activité relevant des bénéfices industriels et commerciaux.",

    importantFields: [
      "raison sociale",
      "siren",
      "adresse",
      "exercice",
      "résultat",
      "régime fiscal"
    ],

    ignoredFields: [
      "mentions légales",
      "références historiques",
      "valeurs d'exemple",
      "tableaux vierges"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Déclaration professionnelle 2035
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Déclaration professionnelle — formulaire 2035",

    aliases: [
      "2035",
      "2035-SD",
      "déclaration 2035",
      "déclaration BNC"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "service des impôts des entreprises",
      "finances publiques"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "2035",
      "2035-sd",
      "bénéfices non commerciaux",
      "benefices non commerciaux",
      "bnc",
      "profession libérale",
      "profession liberale",
      "recettes",
      "dépenses professionnelles",
      "depenses professionnelles",
      "résultat",
      "resultat"
    ],

    phrases: [
      "déclaration des bénéfices non commerciaux",
      "declaration des benefices non commerciaux",
      "profession libérale",
      "profession liberale"
    ],

    references: [
      "2035",
      "2035-SD"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECLARATION,

    situation:
      KNOWLEDGE_SITUATIONS.DECLARATION,

    actionRequired:
      null,

    summary:
      "Ce formulaire sert à déclarer les revenus professionnels d'une activité relevant des bénéfices non commerciaux.",

    importantFields: [
      "identité",
      "siren",
      "recettes",
      "dépenses",
      "résultat"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Déclaration IS 2065
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Déclaration de résultats — formulaire 2065",

    aliases: [
      "2065",
      "2065-SD",
      "déclaration impôt sur les sociétés"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "service des impôts des entreprises"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "2065",
      "impôt sur les sociétés",
      "impot sur les societes",
      "is",
      "résultat fiscal",
      "resultat fiscal",
      "société",
      "societe",
      "exercice clos"
    ],

    phrases: [
      "déclaration de résultats",
      "impôt sur les sociétés",
      "impot sur les societes"
    ],

    references: [
      "2065",
      "2065-SD"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECLARATION,

    situation:
      KNOWLEDGE_SITUATIONS.DECLARATION,

    actionRequired:
      null,

    summary:
      "Ce formulaire sert à déclarer le résultat fiscal d'une société soumise à l'impôt sur les sociétés.",

    importantFields: [
      "société",
      "siren",
      "exercice",
      "résultat fiscal"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Déclaration de revenus 2042
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Déclaration de revenus — formulaire 2042",

    aliases: [
      "2042",
      "2042-K",
      "déclaration de revenus",
      "déclaration impôt sur le revenu"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "2042",
      "revenus",
      "traitements et salaires",
      "revenus fonciers",
      "charges déductibles",
      "charges deductibles",
      "foyer fiscal",
      "personnes à charge",
      "personnes a charge",
      "revenu fiscal"
    ],

    phrases: [
      "déclaration des revenus",
      "declaration des revenus",
      "revenus de l'année",
      "revenus de l'annee"
    ],

    references: [
      "2042",
      "2042-K"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECLARATION,

    situation:
      KNOWLEDGE_SITUATIONS.DECLARATION,

    actionRequired:
      null,

    summary:
      "Ce formulaire sert à déclarer les revenus d'un foyer fiscal.",

    importantFields: [
      "foyer fiscal",
      "revenus",
      "charges",
      "personnes à charge",
      "année"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Avis d'impôt sur le revenu
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Avis d'impôt sur le revenu",

    aliases: [
      "avis d'impôt",
      "avis d'imposition",
      "avis impôt sur le revenu"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques",
      "trésor public"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "avis d'impôt",
      "avis d'imposition",
      "impôt sur le revenu",
      "impot sur le revenu",
      "revenu fiscal de référence",
      "revenu fiscal de reference",
      "nombre de parts",
      "montant de l'impôt",
      "montant de l'impot",
      "solde",
      "prélèvement",
      "prelevement"
    ],

    phrases: [
      "avis d'impôt sur les revenus",
      "revenu fiscal de référence",
      "montant restant à payer",
      "montant restant a payer"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Cet avis récapitule le calcul de votre impôt sur le revenu et indique éventuellement un montant à payer ou à rembourser.",

    importantFields: [
      "revenu fiscal de référence",
      "montant de l'impôt",
      "solde",
      "échéances",
      "numéro fiscal"
    ],

    ignoredFields: [
      "informations générales",
      "mentions légales",
      "textes réglementaires"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Avis de situation déclarative
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Avis de situation déclarative à l'impôt sur le revenu",

    aliases: [
      "asdir",
      "avis de situation déclarative"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "avis de situation déclarative",
      "asdir",
      "revenu fiscal de référence",
      "revenu fiscal de reference",
      "déclaration en ligne",
      "declaration en ligne",
      "impôt sur le revenu"
    ],

    phrases: [
      "avis de situation déclarative à l'impôt sur le revenu",
      "avis de situation declarative"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce document sert de justificatif provisoire de votre situation fiscale après votre déclaration de revenus.",

    importantFields: [
      "identité",
      "revenu fiscal de référence",
      "année",
      "numéro fiscal"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Taxe foncière
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Avis de taxe foncière",

    aliases: [
      "taxe foncière",
      "avis de taxe foncière"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques",
      "trésor public"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "taxe foncière",
      "taxe fonciere",
      "propriétés bâties",
      "proprietes baties",
      "propriétaire",
      "proprietaire",
      "base d'imposition",
      "commune",
      "intercommunalité",
      "intercommunalite",
      "montant à payer",
      "montant a payer"
    ],

    phrases: [
      "taxe foncière sur les propriétés bâties",
      "taxe fonciere sur les proprietes baties"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      null,

    summary:
      "Cet avis indique le montant de taxe foncière dû pour un bien immobilier.",

    importantFields: [
      "bien concerné",
      "montant",
      "date limite",
      "référence de l'avis"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Remboursement fiscal
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Remboursement fiscal",

    aliases: [
      "remboursement impôt",
      "remboursement d'impôt",
      "restitution fiscale"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques",
      "trésor public"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "remboursement",
      "restitution",
      "trop-perçu",
      "trop percu",
      "crédit d'impôt",
      "credit d'impot",
      "sera versé",
      "sera verse",
      "virement"
    ],

    phrases: [
      "vous serez remboursé",
      "vous serez rembourse",
      "un remboursement sera effectué",
      "un remboursement sera effectue",
      "crédit d'impôt"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Ce document vous informe qu'une somme doit vous être remboursée par l'administration fiscale.",

    importantFields: [
      "montant remboursé",
      "date de remboursement",
      "compte bancaire",
      "référence"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Mise en demeure fiscale
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Mise en demeure fiscale",

    aliases: [
      "mise en demeure de payer",
      "relance fiscale",
      "avis de mise en recouvrement"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "service des impôts",
      "trésor public"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "mise en demeure",
      "somme due",
      "montant dû",
      "montant du",
      "recouvrement",
      "majoration",
      "pénalité",
      "penalite",
      "délai",
      "delai",
      "payer"
    ],

    phrases: [
      "mise en demeure de payer",
      "à défaut de paiement",
      "a defaut de paiement",
      "somme restant due"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document vous demande de régulariser une somme fiscale impayée.",

    importantFields: [
      "montant dû",
      "date limite",
      "référence",
      "motif",
      "service à contacter"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Courrier fiscal générique
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Courrier de l'administration fiscale",

    aliases: [
      "courrier dgfip",
      "courrier des impôts",
      "courrier finances publiques"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "finances publiques",
      "service des impôts des particuliers",
      "service des impôts des entreprises"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "numéro fiscal",
      "numero fiscal",
      "référence",
      "reference",
      "dossier fiscal",
      "service des impôts",
      "service des impots"
    ],

    phrases: [
      "nous vous informons",
      "votre dossier fiscal",
      "service des impôts"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce courrier contient une information relative à votre dossier fiscal.",

    importantFields: [
      "objet du courrier",
      "référence",
      "date",
      "service émetteur",
      "action éventuelle"
    ]
  })

];
