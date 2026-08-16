/**
 * Didou Knowledge
 * Organisations connues V1
 *
 * Objectif :
 * reconnaître plus facilement l'émetteur probable
 * d'un document à partir de son nom.
 */

export const KNOWN_ORGANIZATIONS = [
  {
    name: "Direction générale des Finances publiques",
    aliases: [
      "dgfip",
      "finances publiques",
      "service des impôts",
      "service des impots",
      "trésor public",
      "tresor public"
    ],
    family: "fiscal"
  },

  {
    name: "Assurance Maladie",
    aliases: [
      "cpam",
      "ameli",
      "caisse primaire d'assurance maladie",
      "caisse primaire assurance maladie"
    ],
    family: "sante"
  },

  {
    name: "CAF",
    aliases: [
      "caisse d'allocations familiales",
      "caisse allocations familiales"
    ],
    family: "social"
  },

  {
    name: "France Travail",
    aliases: [
      "pôle emploi",
      "pole emploi"
    ],
    family: "social"
  },

  {
    name: "MSA",
    aliases: [
      "mutualité sociale agricole",
      "mutualite sociale agricole"
    ],
    family: "social"
  },

  {
    name: "AXA",
    aliases: [
      "axa france",
      "axa assurances"
    ],
    family: "assurance"
  },

  {
    name: "Allianz",
    aliases: [
      "allianz france",
      "allianz assurances"
    ],
    family: "assurance"
  },

  {
    name: "MAIF",
    aliases: [
      "maif assurances"
    ],
    family: "assurance"
  },

  {
    name: "MACIF",
    aliases: [
      "macif assurances"
    ],
    family: "assurance"
  },

  {
    name: "MATMUT",
    aliases: [
      "matmut assurances"
    ],
    family: "assurance"
  },

  {
    name: "Groupama",
    aliases: [
      "groupama assurances"
    ],
    family: "assurance"
  },

  {
    name: "Generali",
    aliases: [
      "generali france",
      "generali assurances"
    ],
    family: "assurance"
  },

  {
    name: "MMA",
    aliases: [
      "mma assurances"
    ],
    family: "assurance"
  },

  {
    name: "Crédit Agricole",
    aliases: [
      "credit agricole",
      "ca banque"
    ],
    family: "bancaire"
  },

  {
    name: "BNP Paribas",
    aliases: [
      "bnp",
      "bnp paribas"
    ],
    family: "bancaire"
  },

  {
    name: "Société Générale",
    aliases: [
      "societe generale",
      "sg"
    ],
    family: "bancaire"
  },

  {
    name: "Crédit Mutuel",
    aliases: [
      "credit mutuel"
    ],
    family: "bancaire"
  },

  {
    name: "CIC",
    aliases: [
      "credit industriel et commercial"
    ],
    family: "bancaire"
  },

  {
    name: "Caisse d'Épargne",
    aliases: [
      "caisse d epargne",
      "caisse epargne"
    ],
    family: "bancaire"
  },

  {
    name: "Banque Populaire",
    aliases: [
      "banque populaire"
    ],
    family: "bancaire"
  },

  {
    name: "La Banque Postale",
    aliases: [
      "banque postale",
      "la banque postale"
    ],
    family: "bancaire"
  },

  {
    name: "Boursobank",
    aliases: [
      "boursorama banque",
      "boursobank"
    ],
    family: "bancaire"
  },

  {
    name: "Revolut",
    aliases: [
      "revolut bank"
    ],
    family: "bancaire"
  },

  {
    name: "N26",
    aliases: [
      "n26 bank"
    ],
    family: "bancaire"
  },

  {
    name: "EDF",
    aliases: [
      "edf france",
      "electricite de france"
    ],
    family: "facture"
  },

  {
    name: "Engie",
    aliases: [
      "engie france"
    ],
    family: "facture"
  },

  {
    name: "TotalEnergies",
    aliases: [
      "total energies",
      "totalenergies"
    ],
    family: "facture"
  },

  {
    name: "Ekwateur",
    aliases: [
      "ekwateur"
    ],
    family: "facture"
  },

  {
    name: "Orange",
    aliases: [
      "orange france"
    ],
    family: "facture"
  },

  {
    name: "SFR",
    aliases: [
      "sfr"
    ],
    family: "facture"
  },

  {
    name: "Bouygues Telecom",
    aliases: [
      "bouygues telecom"
    ],
    family: "facture"
  },

  {
    name: "Free",
    aliases: [
      "free mobile",
      "freebox"
    ],
    family: "facture"
  }
];

/**
 * Recherche simple d'organisation.
 */
export function findKnownOrganization(
  text
) {
  const source =
    normalize(
      text
    );

  if (!source) {
    return null;
  }

  for (
    const organization
    of KNOWN_ORGANIZATIONS
  ) {
    const candidates = [
      organization.name,
      ...(organization.aliases || [])
    ];

    for (
      const candidate
      of candidates
    ) {
      const value =
        normalize(
          candidate
        );

      if (
        value &&
        source.includes(
          value
        )
      ) {
        return organization;
      }
    }
  }

  return null;
}

function normalize(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[’']/g,
      "'"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
