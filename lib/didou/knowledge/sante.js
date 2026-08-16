import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES SANTE
 * =====================================================
 */

export const SANTE_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Ordonnance
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Ordonnance médicale",

    aliases: [
      "ordonnance",
      "prescription médicale",
      "prescription medicale"
    ],

    vocabulary: [
      "ordonnance",
      "prescription",
      "médecin",
      "medecin",
      "patient",
      "traitement",
      "posologie",
      "comprimé",
      "comprime",
      "gélule",
      "gelule",
      "prise",
      "renouvelable"
    ],

    phrases: [
      "à prendre",
      "a prendre",
      "fois par jour",
      "pendant",
      "renouvelable"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Cette ordonnance indique les traitements ou soins prescrits par un professionnel de santé.",

    importantFields: [
      "patient",
      "prescripteur",
      "médicament",
      "posologie",
      "durée",
      "date"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Arrêt de travail
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Arrêt de travail",

    aliases: [
      "avis d'arrêt de travail",
      "arret de travail",
      "arrêt maladie"
    ],

    vocabulary: [
      "arrêt de travail",
      "arret de travail",
      "incapacité",
      "incapacite",
      "maladie",
      "employeur",
      "assuré",
      "assure",
      "date de début",
      "date de fin"
    ],

    phrases: [
      "avis d'arrêt de travail",
      "interruption de travail",
      "arrêt prescrit jusqu'au",
      "arret prescrit jusqu'au"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      true,

    summary:
      "Ce document justifie une interruption temporaire de travail pour raison de santé.",

    importantFields: [
      "patient",
      "date de début",
      "date de fin",
      "prescripteur",
      "employeur"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Certificat médical
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Certificat médical",

    aliases: [
      "certificat médical",
      "certificat medical",
      "attestation médicale",
      "attestation medicale"
    ],

    vocabulary: [
      "certifie",
      "certificat",
      "patient",
      "médecin",
      "medecin",
      "état de santé",
      "etat de sante",
      "aptitude",
      "inaptitude"
    ],

    phrases: [
      "je soussigné docteur",
      "je soussigne docteur",
      "certifie que",
      "atteste que"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce certificat sert à justifier une situation ou un état de santé.",

    importantFields: [
      "patient",
      "médecin",
      "date",
      "objet du certificat"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Compte rendu médical
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Compte rendu médical",

    aliases: [
      "compte rendu médical",
      "compte rendu medical",
      "compte rendu de consultation",
      "compte rendu hospitalier"
    ],

    vocabulary: [
      "compte rendu",
      "consultation",
      "hospitalisation",
      "diagnostic",
      "examen clinique",
      "antécédents",
      "antecedents",
      "traitement",
      "conclusion"
    ],

    phrases: [
      "compte rendu de consultation",
      "compte rendu d'hospitalisation",
      "conclusion médicale",
      "conclusion medicale"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document résume une consultation, un examen ou une hospitalisation.",

    importantFields: [
      "patient",
      "date",
      "médecin",
      "diagnostic",
      "conclusion",
      "traitement"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Feuille de soins
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Feuille de soins",

    aliases: [
      "feuille de soins",
      "feuille soins maladie"
    ],

    vocabulary: [
      "feuille de soins",
      "assuré",
      "assure",
      "bénéficiaire",
      "beneficiaire",
      "actes",
      "honoraires",
      "professionnel de santé",
      "professionnel de sante"
    ],

    phrases: [
      "feuille de soins",
      "assurance maladie",
      "honoraires perçus",
      "honoraires percus"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Cette feuille permet de transmettre des informations de soins pour obtenir un remboursement.",

    importantFields: [
      "assuré",
      "bénéficiaire",
      "professionnel de santé",
      "date des soins",
      "montant"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Décompte CPAM
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Décompte de remboursement Assurance Maladie",

    aliases: [
      "décompte cpam",
      "decompte cpam",
      "décompte assurance maladie",
      "decompte assurance maladie"
    ],

    organizations: [
      "cpam",
      "assurance maladie",
      "ameli"
    ],

    domains: [
      "ameli.fr"
    ],

    vocabulary: [
      "remboursement",
      "base de remboursement",
      "taux",
      "montant remboursé",
      "montant rembourse",
      "participation forfaitaire",
      "franchise médicale",
      "franchise medicale"
    ],

    phrases: [
      "montant remboursé",
      "montant rembourse",
      "base de remboursement",
      "assurance maladie"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Ce décompte détaille les remboursements effectués par l'Assurance Maladie pour des soins.",

    importantFields: [
      "date des soins",
      "professionnel",
      "montant payé",
      "base de remboursement",
      "montant remboursé"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Décompte mutuelle
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Décompte de mutuelle",

    aliases: [
      "décompte mutuelle",
      "decompte mutuelle",
      "remboursement mutuelle",
      "complémentaire santé",
      "complementaire sante"
    ],

    vocabulary: [
      "mutuelle",
      "complémentaire santé",
      "complementaire sante",
      "remboursement",
      "part complémentaire",
      "part complementaire",
      "reste à charge",
      "reste a charge"
    ],

    phrases: [
      "remboursement complémentaire",
      "remboursement complementaire",
      "part mutuelle",
      "reste à charge"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Ce document détaille les remboursements versés par votre complémentaire santé.",

    importantFields: [
      "soin",
      "montant",
      "part assurance maladie",
      "part mutuelle",
      "reste à charge"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Attestation de droits
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Attestation de droits Assurance Maladie",

    aliases: [
      "attestation de droits",
      "attestation sécurité sociale",
      "attestation securite sociale"
    ],

    organizations: [
      "cpam",
      "assurance maladie",
      "ameli"
    ],

    domains: [
      "ameli.fr"
    ],

    vocabulary: [
      "attestation de droits",
      "assuré",
      "assure",
      "bénéficiaire",
      "beneficiaire",
      "numéro de sécurité sociale",
      "numero de securite sociale",
      "droits ouverts"
    ],

    phrases: [
      "attestation de droits",
      "droits à l'assurance maladie",
      "droits a l'assurance maladie"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Cette attestation prouve que vous bénéficiez de droits auprès de l'Assurance Maladie.",

    importantFields: [
      "assuré",
      "bénéficiaires",
      "numéro de sécurité sociale",
      "période de droits"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Convocation médicale
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Convocation médicale",

    aliases: [
      "convocation médecin",
      "convocation medecin",
      "rendez-vous médical",
      "rendez vous medical"
    ],

    vocabulary: [
      "convocation",
      "rendez-vous",
      "rendez vous",
      "consultation",
      "médecin",
      "medecin",
      "service",
      "hôpital",
      "hopital"
    ],

    phrases: [
      "vous êtes convoqué",
      "vous etes convoque",
      "rendez-vous le",
      "rendez vous le"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Cette convocation vous informe d'un rendez-vous médical à une date et un lieu précis.",

    importantFields: [
      "date",
      "heure",
      "lieu",
      "service",
      "professionnel"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Demande de pièces médicales / administratives
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.SANTE,

    type:
      "Demande de pièces santé",

    aliases: [
      "demande de justificatifs santé",
      "demande de documents médicaux",
      "demande de documents medicaux"
    ],

    vocabulary: [
      "merci de transmettre",
      "veuillez transmettre",
      "pièces justificatives",
      "pieces justificatives",
      "document manquant",
      "dossier incomplet"
    ],

    phrases: [
      "merci de nous transmettre",
      "veuillez nous adresser",
      "votre dossier est incomplet"
    ],

    intent:
      KNOWLEDGE_INTENTS.REQUEST,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      true,

    summary:
      "Ce document vous demande de fournir des informations ou justificatifs pour compléter un dossier de santé.",

    importantFields: [
      "pièces demandées",
      "date limite",
      "organisme",
      "référence du dossier"
    ]
  })

];
