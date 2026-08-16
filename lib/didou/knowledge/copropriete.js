import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES COPROPRIETE
 * =====================================================
 */

export const COPROPRIETE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Convocation AG
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Convocation à une assemblée générale de copropriété",

    aliases: [
      "convocation ag",
      "convocation assemblée générale",
      "convocation assemblee generale"
    ],

    vocabulary: [
      "convocation",
      "assemblée générale",
      "assemblee generale",
      "copropriété",
      "copropriete",
      "syndic",
      "copropriétaire",
      "coproprietaire",
      "ordre du jour",
      "résolution",
      "resolution",
      "vote"
    ],

    phrases: [
      "vous êtes convoqué",
      "vous etes convoque",
      "assemblée générale des copropriétaires",
      "assemblee generale des coproprietaires",
      "ordre du jour",
      "projets de résolution",
      "projets de resolution"
    ],

    sections: [
      "ordre du jour",
      "résolutions",
      "resolutions",
      "pouvoir",
      "vote par correspondance"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Cette convocation vous informe de la date d'une assemblée générale de copropriété et des sujets qui seront soumis au vote.",

    importantFields: [
      "date",
      "heure",
      "lieu",
      "syndic",
      "ordre du jour",
      "modalités de vote"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Ordre du jour
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Ordre du jour d'assemblée générale",

    aliases: [
      "ordre du jour ag",
      "ordre du jour copropriété",
      "ordre du jour copropriete"
    ],

    vocabulary: [
      "ordre du jour",
      "résolution",
      "resolution",
      "vote",
      "majorité",
      "majorite",
      "assemblée générale",
      "assemblee generale"
    ],

    phrases: [
      "ordre du jour",
      "résolution numéro",
      "resolution numero",
      "soumis au vote"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      false,

    summary:
      "Ce document liste les sujets et décisions qui seront examinés lors de l'assemblée générale.",

    importantFields: [
      "résolutions",
      "travaux",
      "budgets",
      "votes"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Procès-verbal AG
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Procès-verbal d'assemblée générale",

    aliases: [
      "pv assemblée générale",
      "pv assemblee generale",
      "procès verbal ag",
      "proces verbal ag"
    ],

    vocabulary: [
      "procès-verbal",
      "proces-verbal",
      "assemblée générale",
      "assemblee generale",
      "résolution adoptée",
      "resolution adoptee",
      "résolution rejetée",
      "resolution rejetee",
      "vote",
      "majorité",
      "majorite",
      "présents",
      "presents",
      "représentés",
      "representes"
    ],

    phrases: [
      "procès-verbal de l'assemblée générale",
      "proces-verbal de l'assemblee generale",
      "résolution adoptée",
      "resolution adoptee",
      "résolution rejetée",
      "resolution rejetee"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce procès-verbal récapitule les décisions et votes de l'assemblée générale de copropriété.",

    importantFields: [
      "date de l'assemblée",
      "résolutions",
      "résultats des votes",
      "travaux adoptés",
      "budget"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Appel de fonds
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Appel de fonds de copropriété",

    aliases: [
      "appel de fonds",
      "appel de provisions",
      "provisions copropriété",
      "provisions copropriete"
    ],

    vocabulary: [
      "appel de fonds",
      "provision",
      "charges de copropriété",
      "charges de copropriete",
      "budget prévisionnel",
      "budget previsionnel",
      "montant à payer",
      "montant a payer",
      "échéance",
      "echeance",
      "lot"
    ],

    phrases: [
      "appel de fonds",
      "provisions pour charges",
      "montant à régler",
      "montant a regler"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document indique une somme à verser pour financer les charges ou dépenses de la copropriété.",

    importantFields: [
      "montant",
      "date limite",
      "lot",
      "période",
      "nature des charges"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Décompte de charges copropriété
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Décompte de charges de copropriété",

    aliases: [
      "décompte individuel de charges",
      "decompte individuel de charges",
      "charges copropriété",
      "charges copropriete"
    ],

    vocabulary: [
      "charges",
      "répartition",
      "repartition",
      "tantièmes",
      "tantiemes",
      "quote-part",
      "quote part",
      "provisions",
      "régularisation",
      "regularisation",
      "solde"
    ],

    phrases: [
      "décompte individuel de charges",
      "decompte individuel de charges",
      "répartition des charges",
      "repartition des charges"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document détaille votre part des charges de copropriété et indique un éventuel solde.",

    importantFields: [
      "période",
      "provisions",
      "charges réelles",
      "quote-part",
      "solde"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Travaux de copropriété
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Notification de travaux de copropriété",

    aliases: [
      "travaux copropriété",
      "travaux copropriete",
      "travaux votés",
      "travaux votes"
    ],

    vocabulary: [
      "travaux",
      "devis",
      "entreprise",
      "résolution",
      "resolution",
      "budget",
      "appel de fonds",
      "chantier",
      "part copropriétaire",
      "part coproprietaire"
    ],

    phrases: [
      "travaux votés",
      "travaux votes",
      "travaux adoptés",
      "travaux adoptes",
      "appel de fonds travaux"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document vous informe de travaux décidés ou envisagés dans la copropriété.",

    importantFields: [
      "nature des travaux",
      "montant",
      "entreprise",
      "date prévue",
      "part à financer"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Résolution
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Résolution de copropriété",

    aliases: [
      "résolution ag",
      "resolution ag",
      "projet de résolution",
      "projet de resolution"
    ],

    vocabulary: [
      "résolution",
      "resolution",
      "vote",
      "majorité",
      "majorite",
      "adopté",
      "adopte",
      "rejeté",
      "rejete",
      "abstention"
    ],

    phrases: [
      "résolution numéro",
      "resolution numero",
      "soumise au vote",
      "adoptée à la majorité",
      "adoptee a la majorite"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Cette résolution décrit une décision soumise au vote ou adoptée par les copropriétaires.",

    importantFields: [
      "objet",
      "résultat du vote",
      "majorité",
      "montant éventuel"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Pouvoir
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Pouvoir pour assemblée générale",

    aliases: [
      "procuration ag",
      "pouvoir ag",
      "mandat de représentation"
    ],

    vocabulary: [
      "pouvoir",
      "procuration",
      "mandat",
      "mandataire",
      "représenter",
      "representer",
      "assemblée générale",
      "assemblee generale"
    ],

    phrases: [
      "donne pouvoir à",
      "donne pouvoir a",
      "pour me représenter",
      "pour me representer"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      null,

    summary:
      "Ce document permet de désigner une personne pour vous représenter à l'assemblée générale.",

    importantFields: [
      "copropriétaire",
      "mandataire",
      "date de l'assemblée",
      "signature"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Vote par correspondance
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Formulaire de vote par correspondance",

    aliases: [
      "vote par correspondance",
      "formulaire de vote ag"
    ],

    vocabulary: [
      "vote par correspondance",
      "pour",
      "contre",
      "abstention",
      "résolution",
      "resolution",
      "assemblée générale",
      "assemblee generale"
    ],

    phrases: [
      "formulaire de vote par correspondance",
      "vote par correspondance",
      "à retourner avant",
      "a retourner avant"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Ce formulaire permet de voter sur les résolutions sans être présent à l'assemblée générale.",

    importantFields: [
      "résolutions",
      "choix de vote",
      "date limite",
      "signature"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Mise en demeure charges copropriété
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.COPROPRIETE,

    type:
      "Mise en demeure pour charges de copropriété",

    aliases: [
      "relance charges copropriété",
      "relance charges copropriete",
      "impayé copropriété",
      "impaye copropriete"
    ],

    vocabulary: [
      "mise en demeure",
      "charges impayées",
      "charges impayees",
      "somme due",
      "régulariser",
      "regulariser",
      "recouvrement",
      "délai",
      "delai",
      "syndic"
    ],

    phrases: [
      "mise en demeure de payer",
      "charges restant dues",
      "à défaut de règlement",
      "a defaut de reglement"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document vous demande de régulariser des charges de copropriété impayées.",

    importantFields: [
      "montant dû",
      "date limite",
      "période",
      "syndic",
      "référence"
    ]
  })

];
