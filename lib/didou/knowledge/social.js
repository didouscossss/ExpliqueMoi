import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES SOCIAL / PRESTATIONS
 * =====================================================
 */

export const SOCIAL_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Notification de droits CAF
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification de droits CAF",

    aliases: [
      "notification caf",
      "notification de droits",
      "droits caf",
      "notification prestations"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "caisse allocations familiales"
    ],

    domains: [
      "caf.fr"
    ],

    vocabulary: [
      "allocataire",
      "droits",
      "prestations",
      "allocation",
      "montant mensuel",
      "quotient familial",
      "numéro allocataire",
      "numero allocataire",
      "caisse d'allocations familiales"
    ],

    phrases: [
      "vos droits",
      "montant de vos droits",
      "nous avons étudié vos droits",
      "nous avons etudie vos droits"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe des prestations sociales auxquelles vous avez droit et de leur montant.",

    importantFields: [
      "prestation",
      "montant",
      "période",
      "allocataire",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * RSA
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification RSA",

    aliases: [
      "rsa",
      "revenu de solidarité active",
      "revenu de solidarite active"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "rsa",
      "revenu de solidarité active",
      "revenu de solidarite active",
      "ressources",
      "foyer",
      "montant forfaitaire",
      "déclaration trimestrielle",
      "declaration trimestrielle"
    ],

    phrases: [
      "revenu de solidarité active",
      "montant de votre rsa",
      "vos droits au rsa"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document concerne vos droits au RSA et peut indiquer un montant, une période ou une démarche à effectuer.",

    importantFields: [
      "montant",
      "période",
      "ressources",
      "foyer",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * APL / aide au logement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification d'aide au logement",

    aliases: [
      "apl",
      "aide personnalisée au logement",
      "aide personnalisee au logement",
      "allocation logement"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "apl",
      "aide au logement",
      "allocation logement",
      "loyer",
      "bailleur",
      "logement",
      "montant mensuel",
      "aide personnalisée au logement",
      "aide personnalisee au logement"
    ],

    phrases: [
      "aide au logement",
      "montant de votre aide",
      "aide personnalisée au logement"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe du montant de votre aide au logement et de la période concernée.",

    importantFields: [
      "montant",
      "logement",
      "période",
      "bailleur",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Prime d'activité
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification de prime d'activité",

    aliases: [
      "prime d'activité",
      "prime d activite",
      "prime activité"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "prime d'activité",
      "prime d activite",
      "revenus professionnels",
      "ressources",
      "déclaration trimestrielle",
      "declaration trimestrielle",
      "montant"
    ],

    phrases: [
      "prime d'activité",
      "montant de votre prime",
      "vos droits à la prime d'activité"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document concerne vos droits à la prime d'activité et indique généralement le montant calculé.",

    importantFields: [
      "montant",
      "période",
      "revenus",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Allocations familiales
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification d'allocations familiales",

    aliases: [
      "allocations familiales",
      "allocation familiale"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "allocations familiales",
      "enfants à charge",
      "enfants a charge",
      "foyer",
      "prestations familiales",
      "montant mensuel"
    ],

    phrases: [
      "allocations familiales",
      "prestations familiales",
      "enfants à charge"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe des prestations familiales calculées pour votre foyer.",

    importantFields: [
      "montant",
      "enfants concernés",
      "période",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Demande de pièces CAF
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Demande de pièces CAF",

    aliases: [
      "demande de justificatifs caf",
      "dossier caf incomplet",
      "pièces manquantes caf"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales"
    ],

    domains: [
      "caf.fr"
    ],

    vocabulary: [
      "pièces justificatives",
      "pieces justificatives",
      "document manquant",
      "dossier incomplet",
      "justificatif",
      "transmettre",
      "fournir",
      "compléter",
      "completer"
    ],

    phrases: [
      "merci de nous transmettre",
      "veuillez nous fournir",
      "votre dossier est incomplet",
      "documents nécessaires",
      "documents necessaires"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "La CAF vous demande de fournir un ou plusieurs justificatifs pour compléter votre dossier.",

    importantFields: [
      "documents demandés",
      "date limite",
      "numéro allocataire",
      "dossier concerné"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Trop-perçu CAF
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification de trop-perçu",

    aliases: [
      "trop-perçu caf",
      "trop percu caf",
      "indu caf",
      "dette caf"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "trop-perçu",
      "trop percu",
      "indu",
      "dette",
      "rembourser",
      "somme due",
      "retenue sur prestations",
      "échéancier",
      "echeancier"
    ],

    phrases: [
      "vous devez rembourser",
      "somme versée à tort",
      "somme versee a tort",
      "retenue sur vos prestations",
      "montant de votre dette"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document indique qu'une prestation a été versée en trop et qu'une somme peut être à rembourser.",

    importantFields: [
      "montant",
      "motif",
      "période",
      "modalités de remboursement",
      "délai de contestation"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Remboursement / régularisation CAF
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Régularisation de prestation sociale",

    aliases: [
      "régularisation caf",
      "regularisation caf",
      "rappel caf",
      "versement complémentaire"
    ],

    organizations: [
      "caf",
      "caisse d'allocations familiales",
      "msa"
    ],

    domains: [
      "caf.fr",
      "msa.fr"
    ],

    vocabulary: [
      "régularisation",
      "regularisation",
      "rappel",
      "versement complémentaire",
      "versement complementaire",
      "somme versée",
      "somme versee"
    ],

    phrases: [
      "un rappel vous sera versé",
      "un rappel vous sera verse",
      "versement complémentaire",
      "régularisation de vos droits"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Ce document vous informe d'un versement complémentaire ou d'une régularisation en votre faveur.",

    importantFields: [
      "montant",
      "prestation",
      "période",
      "date de versement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * France Travail - notification de droits
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Notification de droits France Travail",

    aliases: [
      "notification france travail",
      "notification pôle emploi",
      "notification pole emploi",
      "allocation chômage",
      "allocation chomage"
    ],

    organizations: [
      "france travail",
      "pôle emploi",
      "pole emploi"
    ],

    domains: [
      "francetravail.fr",
      "pole-emploi.fr"
    ],

    vocabulary: [
      "demandeur d'emploi",
      "demandeur d emploi",
      "allocation",
      "are",
      "allocation d'aide au retour à l'emploi",
      "allocation d aide au retour a l emploi",
      "indemnisation",
      "durée des droits",
      "duree des droits",
      "allocation journalière",
      "allocation journaliere"
    ],

    phrases: [
      "ouverture de vos droits",
      "allocation d'aide au retour à l'emploi",
      "durée d'indemnisation",
      "duree d'indemnisation"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous informe de vos droits à l'indemnisation chômage.",

    importantFields: [
      "montant journalier",
      "date de début",
      "durée des droits",
      "référence dossier"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Convocation France Travail
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Convocation France Travail",

    aliases: [
      "convocation france travail",
      "convocation pôle emploi",
      "convocation pole emploi"
    ],

    organizations: [
      "france travail",
      "pôle emploi",
      "pole emploi"
    ],

    domains: [
      "francetravail.fr",
      "pole-emploi.fr"
    ],

    vocabulary: [
      "convocation",
      "entretien",
      "conseiller",
      "rendez-vous",
      "rendez vous",
      "agence",
      "demandeur d'emploi",
      "demandeur d emploi"
    ],

    phrases: [
      "vous êtes convoqué",
      "vous etes convoque",
      "nous vous invitons à un entretien",
      "nous vous invitons a un entretien",
      "rendez-vous avec votre conseiller"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Cette convocation vous informe d'un rendez-vous avec France Travail.",

    importantFields: [
      "date",
      "heure",
      "lieu",
      "conseiller",
      "motif"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Demande d'actualisation France Travail
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SOCIAL,

    type:
      "Rappel d'actualisation France Travail",

    aliases: [
      "actualisation france travail",
      "actualisation pôle emploi",
      "actualisation pole emploi"
    ],

    organizations: [
      "france travail",
      "pôle emploi",
      "pole emploi"
    ],

    domains: [
      "francetravail.fr",
      "pole-emploi.fr"
    ],

    vocabulary: [
      "actualisation",
      "déclarer votre situation",
      "declarer votre situation",
      "demandeur d'emploi",
      "demandeur d emploi",
      "période d'actualisation",
      "periode d actualisation"
    ],

    phrases: [
      "vous devez vous actualiser",
      "pensez à vous actualiser",
      "pensez a vous actualiser",
      "déclarez votre situation mensuelle"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Ce document vous rappelle de déclarer votre situation mensuelle pour maintenir votre inscription et vos droits.",

    importantFields: [
      "période d'actualisation",
      "date limite",
      "dossier"
    ]
  })
];
