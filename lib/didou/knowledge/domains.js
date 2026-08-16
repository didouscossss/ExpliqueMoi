/**
 * Didou Knowledge
 * Domaines connus V1
 *
 * Objectif :
 * reconnaître un organisme à partir
 * d'un nom de domaine présent dans le document.
 */

export const KNOWN_DOMAINS = [
  /*
   * =====================================================
   * FISCAL
   * =====================================================
   */

  {
    domain: "impots.gouv.fr",
    organization:
      "Direction générale des Finances publiques",
    family:
      "fiscal"
  },

  {
    domain: "economie.gouv.fr",
    organization:
      "Ministère de l'Économie",
    family:
      "fiscal"
  },

  /*
   * =====================================================
   * SANTE
   * =====================================================
   */

  {
    domain: "ameli.fr",
    organization:
      "Assurance Maladie",
    family:
      "sante"
  },

  /*
   * =====================================================
   * SOCIAL
   * =====================================================
   */

  {
    domain: "caf.fr",
    organization:
      "CAF",
    family:
      "social"
  },

  {
    domain: "francetravail.fr",
    organization:
      "France Travail",
    family:
      "social"
  },

  {
    domain: "pole-emploi.fr",
    organization:
      "France Travail",
    family:
      "social"
  },

  {
    domain: "msa.fr",
    organization:
      "MSA",
    family:
      "social"
  },

  /*
   * =====================================================
   * ASSURANCE
   * =====================================================
   */

  {
    domain: "axa.fr",
    organization:
      "AXA",
    family:
      "assurance"
  },

  {
    domain: "allianz.fr",
    organization:
      "Allianz",
    family:
      "assurance"
  },

  {
    domain: "maif.fr",
    organization:
      "MAIF",
    family:
      "assurance"
  },

  {
    domain: "macif.fr",
    organization:
      "MACIF",
    family:
      "assurance"
  },

  {
    domain: "matmut.fr",
    organization:
      "MATMUT",
    family:
      "assurance"
  },

  {
    domain: "groupama.fr",
    organization:
      "Groupama",
    family:
      "assurance"
  },

  {
    domain: "generali.fr",
    organization:
      "Generali",
    family:
      "assurance"
  },

  {
    domain: "mma.fr",
    organization:
      "MMA",
    family:
      "assurance"
  },

  /*
   * =====================================================
   * BANQUE
   * =====================================================
   */

  {
    domain: "credit-agricole.fr",
    organization:
      "Crédit Agricole",
    family:
      "bancaire"
  },

  {
    domain: "bnpparibas.fr",
    organization:
      "BNP Paribas",
    family:
      "bancaire"
  },

  {
    domain: "sg.fr",
    organization:
      "Société Générale",
    family:
      "bancaire"
  },

  {
    domain: "societegenerale.fr",
    organization:
      "Société Générale",
    family:
      "bancaire"
  },

  {
    domain: "creditmutuel.fr",
    organization:
      "Crédit Mutuel",
    family:
      "bancaire"
  },

  {
    domain: "cic.fr",
    organization:
      "CIC",
    family:
      "bancaire"
  },

  {
    domain: "caisse-epargne.fr",
    organization:
      "Caisse d'Épargne",
    family:
      "bancaire"
  },

  {
    domain: "banquepopulaire.fr",
    organization:
      "Banque Populaire",
    family:
      "bancaire"
  },

  {
    domain: "labanquepostale.fr",
    organization:
      "La Banque Postale",
    family:
      "bancaire"
  },

  {
    domain: "boursobank.com",
    organization:
      "BoursoBank",
    family:
      "bancaire"
  },

  {
    domain: "boursorama.com",
    organization:
      "BoursoBank",
    family:
      "bancaire"
  },

  {
    domain: "revolut.com",
    organization:
      "Revolut",
    family:
      "bancaire"
  },

  {
    domain: "n26.com",
    organization:
      "N26",
    family:
      "bancaire"
  },

  /*
   * =====================================================
   * ENERGIE / FACTURATION
   * =====================================================
   */

  {
    domain: "edf.fr",
    organization:
      "EDF",
    family:
      "facture"
  },

  {
    domain: "engie.fr",
    organization:
      "Engie",
    family:
      "facture"
  },

  {
    domain: "totalenergies.fr",
    organization:
      "TotalEnergies",
    family:
      "facture"
  },

  {
    domain: "ekwateur.fr",
    organization:
      "Ekwateur",
    family:
      "facture"
  },

  /*
   * =====================================================
   * TELECOM
   * =====================================================
   */

  {
    domain: "orange.fr",
    organization:
      "Orange",
    family:
      "facture"
  },

  {
    domain: "sfr.fr",
    organization:
      "SFR",
    family:
      "facture"
  },

  {
    domain: "bouyguestelecom.fr",
    organization:
      "Bouygues Telecom",
    family:
      "facture"
  },

  {
    domain: "free.fr",
    organization:
      "Free",
    family:
      "facture"
  }
];

/**
 * =====================================================
 * RECHERCHE D'UN DOMAINE CONNU
 * =====================================================
 */

export function findKnownDomain(
  text
) {
  const source =
    normalizeDomainText(
      text
    );

  if (!source) {
    return null;
  }

  /*
   * Domaines longs en priorité.
   */

  const candidates =
    [...KNOWN_DOMAINS]
      .sort(
        (a, b) =>
          String(
            b?.domain || ""
          ).length -
          String(
            a?.domain || ""
          ).length
      );

  for (
    const item
    of candidates
  ) {
    const domain =
      normalizeDomainText(
        item?.domain
      );

    if (
      !domain
    ) {
      continue;
    }

    if (
      source.includes(
        domain
      )
    ) {
      return {
        domain:
          item.domain,

        organization:
          item.organization ||
          null,

        family:
          item.family ||
          null
      };
    }
  }

  return null;
}

/**
 * =====================================================
 * RETOURNER TOUS LES DOMAINES TROUVES
 * =====================================================
 */

export function findKnownDomains(
  text
) {
  const source =
    normalizeDomainText(
      text
    );

  if (!source) {
    return [];
  }

  const results = [];

  const seen =
    new Set();

  for (
    const item
    of KNOWN_DOMAINS
  ) {
    const domain =
      normalizeDomainText(
        item?.domain
      );

    if (
      !domain ||
      !source.includes(
        domain
      )
    ) {
      continue;
    }

    if (
      seen.has(domain)
    ) {
      continue;
    }

    seen.add(
      domain
    );

    results.push({
      domain:
        item.domain,

      organization:
        item.organization ||
        null,

      family:
        item.family ||
        null
    });
  }

  return results;
}

/**
 * =====================================================
 * RECHERCHE PAR DOMAINE EXACT
 * =====================================================
 */

export function getKnownDomain(
  domain
) {
  const target =
    normalizeDomainText(
      domain
    );

  if (!target) {
    return null;
  }

  return (
    KNOWN_DOMAINS.find(
      (item) =>
        normalizeDomainText(
          item?.domain
        ) ===
        target
    ) ||
    null
  );
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function normalizeDomainText(
  value
) {
  return String(
    value || ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /https?:\/\//g,
      ""
    )
    .replace(
      /\bwww\./g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
