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
   * Annexes de liasse fiscale — 2032 / 2033 / 2050-2059
   * ---------------------------------------------------
   *
   * Ces formulaires ne sont pas "la" déclaration de résultats
   * (2031/2035/2065) mais des ANNEXES qui l'accompagnent :
   * détermination détaillée du résultat fiscal, bilan, compte
   * de résultat. Une fiche dédiée évite qu'un tel document soit
   * confondu avec le 2031-SD via leur vocabulaire commun
   * ("liasse", "résultat fiscal", "bénéfices").
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Liasse fiscale — annexe (bilan / résultat fiscal)",

    aliases: [
      "2032",
      "formulaire 2032",
      "2033",
      "2033-a",
      "2033-b",
      "2033-c",
      "2033-d",
      "2050",
      "2051",
      "2052",
      "2053",
      "2054",
      "2055",
      "2056",
      "2057",
      "2058-a",
      "2058-b",
      "2059",
      "annexe de liasse fiscale",
      "bilan simplifié",
      "compte de résultat simplifié"
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
      "2032",
      "2033",
      "2050",
      "2059",
      "détermination du résultat fiscal",
      "determination du resultat fiscal",
      "résultat comptable",
      "resultat comptable",
      "résultat fiscal",
      "resultat fiscal",
      "réintégrations fiscales",
      "reintegrations fiscales",
      "déductions fiscales",
      "deductions fiscales",
      "bilan simplifié",
      "bilan simplifie",
      "compte de résultat",
      "compte de resultat",
      "immobilisations",
      "amortissements",
      "exercice clos"
    ],

    phrases: [
      "détermination du résultat fiscal",
      "determination du resultat fiscal",
      "résultat fiscal de l'exercice",
      "resultat fiscal de l'exercice",
      "réintégrations fiscales",
      "déductions fiscales",
      "annexe de la liasse fiscale"
    ],

    references: [
      "2032",
      "2033",
      "2033-A",
      "2033-B",
      "2033-C",
      "2033-D",
      "2050",
      "2059"
    ],

    sections: [
      "identification de l'entreprise",
      "exercice clos",
      "détermination du résultat fiscal",
      "réintégrations",
      "déductions",
      "bilan",
      "compte de résultat"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECLARATION,

    situation:
      KNOWLEDGE_SITUATIONS.DECLARATION,

    actionRequired:
      null,

    summary:
      "Ce document est une annexe de la liasse fiscale : il détaille le calcul du résultat fiscal, le bilan ou le compte de résultat d'une entreprise, en complément de sa déclaration de résultats.",

    importantFields: [
      "raison sociale",
      "siren",
      "exercice",
      "résultat comptable",
      "résultat fiscal",
      "réintégrations",
      "déductions"
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
   * Taxe d'habitation
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Avis de taxe d'habitation",

    aliases: [
      "taxe d'habitation",
      "taxe d habitation",
      "avis de taxe d'habitation",
      "avis de taxe d habitation"
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
      "taxe d'habitation",
      "taxe d habitation",
      "résidence secondaire",
      "residence secondaire",
      "contribuable",
      "base d'imposition",
      "commune",
      "montant à payer",
      "montant a payer"
    ],

    phrases: [
      "taxe d'habitation sur les résidences secondaires",
      "taxe d habitation sur les residences secondaires",
      "avis de taxe d'habitation",
      "avis de taxe d habitation"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      null,

    summary:
      "Cet avis indique le montant de taxe d'habitation dû, généralement pour une résidence secondaire.",

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
   * Avis à tiers détenteur
   * ---------------------------------------------------
   *
   * À NE PAS CONFONDRE avec une mise en demeure fiscale : le
   * DESTINATAIRE n'est pas le débiteur, mais un tiers qui détient
   * des fonds pour son compte (employeur, banque...), sommé de les
   * reverser au Trésor Public — sinon absent du catalogue, ce
   * document tombait sur "Mise en demeure fiscale" par recouvrement
   * de vocabulaire ("payer", "recouvrement", "délai"), avec un
   * résumé qui s'adresse au débiteur ("régulariser VOTRE dette")
   * alors que le vrai destinataire n'est lui-même redevable de rien
   * — une confusion susceptible de le faire ignorer une obligation
   * légale réelle (verser les fonds sous peine d'engager sa propre
   * responsabilité), ou à l'inverse de croire à tort qu'il doit de
   * l'argent lui-même.
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.FISCAL,

    type:
      "Avis à tiers détenteur",

    aliases: [
      "avis à tiers détenteur",
      "avis a tiers detenteur",
      "atd"
    ],

    organizations: [
      "direction générale des finances publiques",
      "dgfip",
      "trésor public",
      "comptable public"
    ],

    domains: [
      "impots.gouv.fr"
    ],

    vocabulary: [
      "avis à tiers détenteur",
      "avis a tiers detenteur",
      "tiers détenteur",
      "tiers detenteur",
      "effet d'attribution immédiate",
      "effet d attribution immediate",
      "dépositaire, détenteur ou débiteur",
      "depositaire, detenteur ou debiteur"
    ],

    phrases: [
      "avis à tiers détenteur",
      "en votre qualité de tiers détenteur",
      "effet d'attribution immédiate"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Vous n'êtes pas le débiteur : ce document vous demande, en tant que tiers détenteur de fonds pour le compte d'un débiteur envers le Trésor Public (par exemple son employeur ou sa banque), de verser directement au comptable public la somme indiquée, dans la limite des fonds que vous détenez pour lui — à défaut, votre propre responsabilité peut être engagée.",

    importantFields: [
      "débiteur concerné",
      "montant à verser",
      "date limite de versement",
      "comptable public destinataire du versement"
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
