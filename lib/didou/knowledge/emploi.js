import {
  createKnowledgeDocument,
  KNOWLEDGE_FAMILIES,
  KNOWLEDGE_INTENTS,
  KNOWLEDGE_SITUATIONS
} from "./schema.js";

/**
 * =====================================================
 * CONNAISSANCES EMPLOI / TRAVAIL
 * =====================================================
 */

export const EMPLOI_KNOWLEDGE = [

  /**
   * ---------------------------------------------------
   * Curriculum Vitae
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Curriculum vitae",

    aliases: [
      "cv",
      "curriculum vitae",
      "resume"
    ],

    vocabulary: [
      "expérience professionnelle",
      "experience professionnelle",
      "formation",
      "compétences",
      "competences",
      "langues",
      "diplôme",
      "diplome",
      "profil",
      "parcours professionnel",
      "centres d'intérêt",
      "centres d'interet"
    ],

    phrases: [
      "expérience professionnelle",
      "formation académique",
      "compétences professionnelles",
      "parcours professionnel"
    ],

    sections: [
      "profil",
      "expérience",
      "formation",
      "compétences",
      "langues",
      "centres d'intérêt"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROFILE,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce document présente le parcours, les compétences et l'expérience professionnelle d'une personne.",

    importantFields: [
      "nom",
      "coordonnées",
      "expérience",
      "formation",
      "compétences",
      "langues"
    ],

    ignoredFields: [
      "mise en page",
      "éléments décoratifs"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Bulletin de salaire
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Bulletin de salaire",

    aliases: [
      "bulletin de paie",
      "fiche de paie",
      "bulletin de salaire"
    ],

    vocabulary: [
      "salaire brut",
      "salaire net",
      "net à payer",
      "net a payer",
      "cotisations",
      "cotisations sociales",
      "employeur",
      "salarié",
      "salarie",
      "période de paie",
      "periode de paie",
      "prélèvement à la source",
      "prelevement a la source"
    ],

    phrases: [
      "net à payer",
      "salaire brut",
      "net imposable",
      "prélèvement à la source"
    ],

    sections: [
      "salaire de base",
      "cotisations",
      "net imposable",
      "net à payer",
      "cumul annuel"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      false,

    summary:
      "Ce bulletin détaille votre rémunération, les cotisations et le montant net versé pour une période de travail.",

    importantFields: [
      "employeur",
      "salarié",
      "période",
      "salaire brut",
      "net imposable",
      "net à payer"
    ],

    ignoredFields: [
      "codes internes de paie",
      "lignes techniques secondaires"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Contrat de travail
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Contrat de travail",

    aliases: [
      "contrat emploi",
      "contrat salarié",
      "contrat salarie"
    ],

    vocabulary: [
      "employeur",
      "salarié",
      "salarie",
      "contrat de travail",
      "rémunération",
      "remuneration",
      "temps de travail",
      "durée du travail",
      "duree du travail",
      "poste",
      "fonction",
      "période d'essai",
      "periode d'essai",
      "convention collective"
    ],

    phrases: [
      "contrat de travail",
      "il est convenu ce qui suit",
      "durée hebdomadaire",
      "rémunération mensuelle",
      "période d'essai"
    ],

    sections: [
      "objet du contrat",
      "fonction",
      "rémunération",
      "durée du travail",
      "période d'essai",
      "congés"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce contrat définit les conditions de votre emploi, notamment le poste, la rémunération et la durée du travail.",

    importantFields: [
      "employeur",
      "salarié",
      "poste",
      "date de début",
      "type de contrat",
      "rémunération",
      "temps de travail"
    ]
  }),

  /**
   * ---------------------------------------------------
   * CDI
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Contrat de travail à durée indéterminée",

    aliases: [
      "cdi",
      "contrat à durée indéterminée",
      "contrat a duree indeterminee"
    ],

    vocabulary: [
      "cdi",
      "durée indéterminée",
      "duree indeterminee",
      "date d'embauche",
      "poste",
      "rémunération",
      "remuneration",
      "période d'essai",
      "periode d'essai"
    ],

    phrases: [
      "contrat à durée indéterminée",
      "engagé à compter du",
      "embauché à compter du"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce document fixe les conditions d'un emploi sans date de fin prévue.",

    importantFields: [
      "date d'embauche",
      "poste",
      "rémunération",
      "temps de travail",
      "période d'essai"
    ]
  }),

  /**
   * ---------------------------------------------------
   * CDD
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Contrat de travail à durée déterminée",

    aliases: [
      "cdd",
      "contrat à durée déterminée",
      "contrat a duree determinee"
    ],

    vocabulary: [
      "cdd",
      "durée déterminée",
      "duree determinee",
      "terme du contrat",
      "date de fin",
      "motif du recours",
      "remplacement",
      "accroissement temporaire",
      "indemnité de fin de contrat",
      "indemnite de fin de contrat"
    ],

    phrases: [
      "contrat à durée déterminée",
      "le présent contrat prendra fin",
      "motif du recours"
    ],

    intent:
      KNOWLEDGE_INTENTS.CONTRACT,

    situation:
      KNOWLEDGE_SITUATIONS.CONTRACT,

    actionRequired:
      null,

    summary:
      "Ce contrat prévoit un emploi pour une durée limitée ou jusqu'à un événement déterminé.",

    importantFields: [
      "date de début",
      "date de fin",
      "motif",
      "poste",
      "rémunération"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Attestation employeur
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Attestation employeur",

    aliases: [
      "attestation de travail",
      "attestation d'emploi",
      "attestation employeur"
    ],

    vocabulary: [
      "atteste que",
      "employeur",
      "salarié",
      "salarie",
      "emploi",
      "poste occupé",
      "poste occupe",
      "date d'embauche",
      "rémunération",
      "remuneration"
    ],

    phrases: [
      "atteste que",
      "est employé",
      "est employee",
      "travaille au sein de",
      "occupe le poste de"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Cette attestation sert à prouver votre situation professionnelle auprès d'un tiers.",

    importantFields: [
      "employeur",
      "salarié",
      "poste",
      "date d'embauche",
      "date de l'attestation"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Certificat de travail
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Certificat de travail",

    aliases: [
      "certificat employeur",
      "certificat de fin de contrat"
    ],

    vocabulary: [
      "certificat de travail",
      "a travaillé",
      "a travaille",
      "emploi occupé",
      "emploi occupe",
      "date d'entrée",
      "date d'entree",
      "date de sortie",
      "fin du contrat"
    ],

    phrases: [
      "certifions que",
      "a été employé",
      "a ete employe",
      "a travaillé du",
      "certificat de travail"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      false,

    summary:
      "Ce certificat prouve les périodes pendant lesquelles vous avez travaillé pour un employeur.",

    importantFields: [
      "employeur",
      "salarié",
      "poste",
      "date d'entrée",
      "date de sortie"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Solde de tout compte
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Reçu pour solde de tout compte",

    aliases: [
      "solde de tout compte",
      "reçu solde de tout compte",
      "recu solde de tout compte"
    ],

    vocabulary: [
      "solde de tout compte",
      "reçu",
      "recu",
      "fin de contrat",
      "indemnité",
      "indemnite",
      "congés payés",
      "conges payes",
      "salaire",
      "prime"
    ],

    phrases: [
      "reçu pour solde de tout compte",
      "sommes versées à l'occasion de la rupture",
      "sommes versees a l'occasion de la rupture"
    ],

    intent:
      KNOWLEDGE_INTENTS.PROOF,

    situation:
      KNOWLEDGE_SITUATIONS.PROOF,

    actionRequired:
      null,

    summary:
      "Ce document récapitule les sommes versées lors de la fin du contrat de travail.",

    importantFields: [
      "montant total",
      "indemnités",
      "salaires",
      "congés payés",
      "date de fin de contrat"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Lettre de licenciement
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Lettre de licenciement",

    aliases: [
      "notification de licenciement",
      "licenciement"
    ],

    vocabulary: [
      "licenciement",
      "rupture du contrat",
      "motif",
      "préavis",
      "preavis",
      "entretien préalable",
      "entretien prealable",
      "notification"
    ],

    phrases: [
      "nous vous notifions votre licenciement",
      "décision de licenciement",
      "decision de licenciement",
      "rupture de votre contrat de travail"
    ],

    intent:
      KNOWLEDGE_INTENTS.DECISION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Cette lettre vous informe de la décision de mettre fin à votre contrat de travail.",

    importantFields: [
      "motif",
      "date",
      "préavis",
      "date de fin du contrat",
      "droits éventuels"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Convocation entretien préalable
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Convocation à un entretien préalable",

    aliases: [
      "entretien préalable",
      "convocation licenciement"
    ],

    vocabulary: [
      "convocation",
      "entretien préalable",
      "entretien prealable",
      "licenciement",
      "sanction disciplinaire",
      "date de l'entretien",
      "lieu de l'entretien"
    ],

    phrases: [
      "nous vous convoquons",
      "entretien préalable",
      "vous pouvez vous faire assister"
    ],

    intent:
      KNOWLEDGE_INTENTS.MEETING,

    situation:
      KNOWLEDGE_SITUATIONS.MEETING,

    actionRequired:
      true,

    summary:
      "Cette convocation vous informe d'un entretien professionnel auquel votre présence peut être importante.",

    importantFields: [
      "date",
      "heure",
      "lieu",
      "motif",
      "possibilité d'assistance"
    ]
  }),

  /**
   * ---------------------------------------------------
   * Offre d'emploi
   * ---------------------------------------------------
   */

  createKnowledgeDocument({
    family:
      KNOWLEDGE_FAMILIES.EMPLOI,

    type:
      "Offre d'emploi",

    aliases: [
      "offre de poste",
      "annonce emploi",
      "job offer"
    ],

    vocabulary: [
      "poste",
      "candidat",
      "profil recherché",
      "profil recherche",
      "missions",
      "compétences requises",
      "competences requises",
      "salaire",
      "candidature",
      "recrutement"
    ],

    phrases: [
      "nous recherchons",
      "profil recherché",
      "envoyez votre candidature",
      "missions principales"
    ],

    intent:
      KNOWLEDGE_INTENTS.INFORMATION,

    situation:
      KNOWLEDGE_SITUATIONS.NOTIFICATION,

    actionRequired:
      null,

    summary:
      "Cette offre présente un poste disponible, les missions et les compétences recherchées.",

    importantFields: [
      "poste",
      "employeur",
      "lieu",
      "missions",
      "compétences",
      "rémunération"
    ]
  })
];
