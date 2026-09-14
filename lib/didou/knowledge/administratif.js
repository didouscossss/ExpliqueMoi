import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES ADMINISTRATIVES GÉNÉRALES
 * =====================================================
 *
 * Documents d'identité et pièces administratives de base,
 * parmi les plus courants qu'un particulier reçoit — mais
 * jusqu'ici absents du catalogue, tombant sur un libellé
 * générique ("Certificat") sans aucune explication.
 */

export const ADMINISTRATIF_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Certificat d'immatriculation (carte grise)
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ADMINISTRATIF,

    type:
      "Certificat d'immatriculation",

    aliases: [
      "carte grise",
      "certificat d'immatriculation",
      "certificat d immatriculation"
    ],

    organizations: [
      "préfecture",
      "prefecture",
      "agence nationale des titres sécurisés",
      "agence nationale des titres securises",
      "ants"
    ],

    domains: [
      "ants.gouv.fr"
    ],

    vocabulary: [
      "certificat d'immatriculation",
      "certificat d immatriculation",
      "carte grise",
      "titulaire",
      "immatriculation",
      "première mise en circulation",
      "premiere mise en circulation",
      "numéro de formule",
      "numero de formule",
      "puissance fiscale"
    ],

    phrases: [
      "certificat d'immatriculation",
      "certificat d immatriculation",
      "première mise en circulation",
      "premiere mise en circulation"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce certificat (carte grise) identifie officiellement un véhicule et son titulaire ; il doit être conservé et présenté lors de contrôles.",

    importantFields: [
      "titulaire",
      "immatriculation",
      "véhicule",
      "date de première mise en circulation"
    ],

    ignoredFields: [
      "mentions légales",
      "codes techniques du véhicule"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Pièce d'identité (CNI / passeport)
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ADMINISTRATIF,

    type:
      "Pièce d'identité",

    aliases: [
      "carte nationale d'identité",
      "carte nationale d identite",
      "cni",
      "passeport"
    ],

    organizations: [
      "république française",
      "republique francaise",
      "préfecture",
      "prefecture",
      "agence nationale des titres sécurisés",
      "agence nationale des titres securises",
      "ants"
    ],

    domains: [
      "ants.gouv.fr",
      "service-public.fr"
    ],

    vocabulary: [
      "carte nationale d'identité",
      "carte nationale d identite",
      "passeport",
      "nationalité française",
      "nationalite francaise",
      "date de délivrance",
      "date de delivrance",
      "date d'expiration",
      "date d expiration",
      "autorité de délivrance",
      "autorite de delivrance"
    ],

    phrases: [
      "carte nationale d'identité",
      "carte nationale d identite",
      "république française",
      "republique francaise"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce document est une pièce d'identité officielle attestant de votre identité et de votre nationalité.",

    importantFields: [
      "identité",
      "date de délivrance",
      "date d'expiration",
      "autorité de délivrance"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Justificatif de domicile
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.ADMINISTRATIF,

    type:
      "Justificatif de domicile",

    aliases: [
      "justificatif de domicile",
      "attestation de domicile"
    ],

    organizations: [],

    domains: [],

    vocabulary: [
      "justificatif de domicile",
      "domicilié",
      "domicilie",
      "atteste résider",
      "atteste resider",
      "adresse du domicile"
    ],

    phrases: [
      "justificatif de domicile",
      "atteste que le domicile"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce document sert de preuve d'adresse pour vos démarches administratives.",

    importantFields: [
      "adresse",
      "date d'émission",
      "titulaire"
    ]
  })

];
