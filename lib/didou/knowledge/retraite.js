import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES RETRAITE
 * =====================================================
 *
 * "Assurance vieillesse" est le nom légal de la branche
 * retraite de la Sécurité sociale française — un relevé de
 * carrière CNAV ou une notification de pension n'a rien à
 * voir avec un contrat d'assurance privée, malgré le
 * vocabulaire partagé ("assuré", "assurance"). Une famille
 * dédiée évite que ces documents soient absorbés par la
 * famille "assurance" ou laissés non reconnus.
 */

export const RETRAITE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Relevé de carrière
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.RETRAITE,

    type:
      "Relevé de carrière",

    aliases: [
      "relevé de carrière",
      "releve de carriere",
      "relevé individuel de situation",
      "releve individuel de situation",
      "relevé de situation individuelle",
      "releve de situation individuelle",
      "rsi"
    ],

    organizations: [
      "caisse nationale d'assurance vieillesse",
      "cnav",
      "assurance retraite",
      "carsat",
      "agirc-arrco",
      "msa",
      "ircantec"
    ],

    domains: [
      "lassuranceretraite.fr",
      "info-retraite.fr"
    ],

    vocabulary: [
      "relevé de carrière",
      "releve de carriere",
      "trimestres validés",
      "trimestres valides",
      "trimestres cotisés",
      "trimestres cotises",
      "régime général",
      "regime general",
      "salaire annuel moyen",
      "points retraite",
      "carrière",
      "carriere",
      "assurance vieillesse",
      "caisse nationale d'assurance vieillesse"
    ],

    phrases: [
      "relevé de carrière",
      "ce relevé récapitule",
      "ce releve recapitule",
      "trimestres validés",
      "droits acquis au régime général",
      "droits acquis au regime general"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce relevé récapitule les trimestres et droits à la retraite que vous avez acquis au cours de votre carrière.",

    importantFields: [
      "trimestres validés",
      "salaire annuel moyen",
      "régime",
      "période concernée"
    ],

    ignoredFields: [
      "mentions légales",
      "explications générales sur le calcul des droits"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Notification de pension de retraite
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.RETRAITE,

    type:
      "Notification de pension de retraite",

    aliases: [
      "notification de retraite",
      "notification de pension",
      "notification de droits à la retraite",
      "notification de droits a la retraite",
      "attribution de pension"
    ],

    organizations: [
      "caisse nationale d'assurance vieillesse",
      "cnav",
      "assurance retraite",
      "carsat",
      "agirc-arrco",
      "msa"
    ],

    domains: [
      "lassuranceretraite.fr"
    ],

    vocabulary: [
      "pension de retraite",
      "montant de la pension",
      "date d'effet de la retraite",
      "date d effet de la retraite",
      "retraite de base",
      "retraite complémentaire",
      "retraite complementaire",
      "point de départ",
      "point de depart"
    ],

    phrases: [
      "votre pension de retraite",
      "montant mensuel de votre pension",
      "date d'effet de votre retraite",
      "date d effet de votre retraite"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document vous notifie l'attribution et le montant de votre pension de retraite.",

    importantFields: [
      "montant de la pension",
      "date d'effet",
      "régime",
      "référence de dossier"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Décompte de pension de retraite
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.RETRAITE,

    type:
      "Décompte de pension de retraite",

    aliases: [
      "décompte de pension",
      "decompte de pension",
      "décompte de retraite",
      "decompte de retraite"
    ],

    organizations: [
      "caisse nationale d'assurance vieillesse",
      "cnav",
      "assurance retraite",
      "carsat",
      "agirc-arrco",
      "msa"
    ],

    domains: [
      "lassuranceretraite.fr"
    ],

    vocabulary: [
      "décompte",
      "decompte",
      "pension nette",
      "pension brute",
      "prélèvement social",
      "prelevement social",
      "csg",
      "crds",
      "virement de votre pension"
    ],

    phrases: [
      "montant net versé",
      "montant net verse",
      "votre pension vous a été versée",
      "votre pension vous a ete versee"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce décompte détaille le montant de votre pension de retraite versée, après prélèvements sociaux.",

    importantFields: [
      "montant net",
      "montant brut",
      "date de versement",
      "prélèvements"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Demande de régularisation de carrière
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.RETRAITE,

    type:
      "Demande de régularisation de carrière",

    aliases: [
      "régularisation de carrière",
      "regularisation de carriere",
      "demande de pièces retraite",
      "demande de pieces retraite"
    ],

    organizations: [
      "caisse nationale d'assurance vieillesse",
      "cnav",
      "assurance retraite",
      "carsat"
    ],

    domains: [
      "lassuranceretraite.fr"
    ],

    vocabulary: [
      "régularisation",
      "regularisation",
      "pièces justificatives",
      "pieces justificatives",
      "trimestres manquants",
      "carrière incomplète",
      "carriere incomplete"
    ],

    phrases: [
      "merci de nous transmettre",
      "votre dossier de retraite ne peut être finalisé",
      "votre dossier de retraite ne peut etre finalise"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Ce document vous demande de fournir des pièces manquantes pour compléter ou corriger votre dossier de retraite.",

    importantFields: [
      "pièces demandées",
      "date limite",
      "référence de dossier"
    ]
  })

];
