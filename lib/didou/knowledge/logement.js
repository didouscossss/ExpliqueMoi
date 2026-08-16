import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES LOGEMENT
 * =====================================================
 */

export const LOGEMENT_KNOWLEDGE = [

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Quittance de loyer",

    aliases: [
      "quittance",
      "reçu de loyer",
      "recu de loyer"
    ],

    vocabulary: [
      "quittance",
      "loyer",
      "charges",
      "bailleur",
      "locataire",
      "paiement reçu",
      "paiement recu",
      "mois de"
    ],

    phrases: [
      "quittance de loyer",
      "reçu la somme de",
      "recu la somme de",
      "loyer et charges"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Cette quittance prouve que le loyer et les charges indiqués ont été réglés.",

    importantFields: [
      "locataire",
      "bailleur",
      "adresse du logement",
      "période",
      "loyer",
      "charges",
      "montant total"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Contrat de location",

    aliases: [
      "bail",
      "bail d'habitation",
      "contrat de bail"
    ],

    vocabulary: [
      "bailleur",
      "locataire",
      "loyer",
      "dépôt de garantie",
      "depot de garantie",
      "charges",
      "durée du bail",
      "duree du bail",
      "logement",
      "résidence principale",
      "residence principale"
    ],

    phrases: [
      "contrat de location",
      "bail d'habitation",
      "le présent bail",
      "le present bail"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce contrat définit les conditions de location du logement entre le bailleur et le locataire.",

    importantFields: [
      "bailleur",
      "locataire",
      "adresse",
      "loyer",
      "charges",
      "dépôt de garantie",
      "date de début",
      "durée"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "État des lieux",

    aliases: [
      "etat des lieux",
      "état des lieux d'entrée",
      "état des lieux de sortie"
    ],

    vocabulary: [
      "état des lieux",
      "etat des lieux",
      "entrée",
      "entree",
      "sortie",
      "pièce",
      "piece",
      "équipement",
      "equipement",
      "compteur",
      "clés",
      "cles",
      "observations"
    ],

    phrases: [
      "état des lieux d'entrée",
      "etat des lieux d'entree",
      "état des lieux de sortie",
      "etat des lieux de sortie"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      null,

    summary:
      "Ce document décrit l'état du logement et de ses équipements à l'entrée ou à la sortie du locataire.",

    importantFields: [
      "adresse",
      "date",
      "locataire",
      "bailleur",
      "état des pièces",
      "compteurs",
      "clés"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Avis d'échéance de loyer",

    aliases: [
      "appel de loyer",
      "avis d'echeance loyer"
    ],

    vocabulary: [
      "loyer",
      "échéance",
      "echeance",
      "charges",
      "montant à payer",
      "montant a payer",
      "appel de loyer"
    ],

    phrases: [
      "avis d'échéance",
      "appel de loyer",
      "loyer à régler"
    ],

    intent:
      KNOWLEDGE_INTENTS.PAYMENT,

    situation:
      KNOWLEDGE_SITUATIONS.PAYMENT_DUE,

    actionRequired:
      true,

    summary:
      "Ce document indique le montant du loyer et des charges à régler pour une période donnée.",

    importantFields: [
      "période",
      "loyer",
      "charges",
      "montant total",
      "date limite"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Régularisation de charges locatives",

    aliases: [
      "regularisation de charges",
      "décompte de charges",
      "decompte de charges"
    ],

    vocabulary: [
      "régularisation",
      "regularisation",
      "charges locatives",
      "provisions",
      "décompte",
      "decompte",
      "solde",
      "charges récupérables",
      "charges recuperables"
    ],

    phrases: [
      "régularisation annuelle des charges",
      "regularisation annuelle des charges",
      "décompte des charges"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document compare les provisions déjà payées avec les charges réelles et indique un éventuel solde.",

    importantFields: [
      "période",
      "provisions versées",
      "charges réelles",
      "solde"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Restitution du dépôt de garantie",

    aliases: [
      "restitution caution",
      "remboursement dépôt de garantie",
      "remboursement depot de garantie"
    ],

    vocabulary: [
      "dépôt de garantie",
      "depot de garantie",
      "restitution",
      "retenue",
      "dégradation",
      "degradation",
      "remboursement"
    ],

    phrases: [
      "restitution du dépôt de garantie",
      "restitution du depot de garantie",
      "somme restituée"
    ],

    intent:
      KNOWLEDGE_INTENTS.REFUND,

    situation:
      KNOWLEDGE_SITUATIONS.REFUND,

    actionRequired:
      false,

    summary:
      "Ce document indique la somme restituée après la fin de la location, éventuellement après certaines retenues.",

    importantFields: [
      "montant du dépôt",
      "retenues",
      "montant restitué",
      "date"
    ]
  }),

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.LOGEMENT,

    type:
      "Congé du bail",

    aliases: [
      "préavis logement",
      "preavis logement",
      "congé locatif",
      "conge locatif"
    ],

    vocabulary: [
      "préavis",
      "preavis",
      "congé",
      "conge",
      "fin du bail",
      "quitter le logement",
      "résiliation",
      "resiliation"
    ],

    phrases: [
      "donne congé",
      "donne conge",
      "préavis de départ",
      "preavis de depart",
      "fin du bail"
    ],

    intent:
      KNOWLEDGE_INTENTS.NOTIFICATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Ce document informe de la fin prochaine du bail ou du départ du logement.",

    importantFields: [
      "date d'envoi",
      "date de fin du préavis",
      "adresse",
      "locataire",
      "bailleur"
    ]
  })

];
