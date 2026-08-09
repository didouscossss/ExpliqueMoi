/**
 * V4-Y — Fixture documentaire synthétique non fiscale.
 * Aucune donnée personnelle réelle. Aucune connaissance assurance.
 */

export const RENEWAL_NOTICE_FULL = {
  fileName: "avis-renouvellement.txt",
  id: "gdoc-renewal-1",
  text: `
AVIS DE RENOUVELLEMENT

Organisme : Exemple Assurances
Référence contrat : AB-458921
Date du document : 12/03/2026
Montant : 486,50 €
Date limite : 15/04/2026

Votre contrat arrive à échéance.
Le montant indiqué pour la prochaine période est de 486,50 €.
Pour toute question, utilisez la référence AB-458921.
`.trim()
};

/** Montant isolé — pas de signification « à payer ». */
export const ISOLATED_AMOUNT = {
  fileName: "montant-isole.txt",
  id: "gdoc-amount-1",
  text: `
Document
486,50 €
`.trim()
};

/** Date isolée — ne devient pas deadline. */
export const ISOLATED_DATE = {
  fileName: "date-isolee.txt",
  id: "gdoc-date-1",
  text: `
Document
15/04/2026
`.trim()
};

/** Document sans marqueur de type — unknown. */
export const UNKNOWN_ADMIN = {
  fileName: "inconnu.txt",
  id: "gdoc-unknown-1",
  text: `
Information
Organisme : Exemple Assurances
Référence : ZZ-100
`.trim()
};

export const GENERIC_FIXTURES = {
  renewalFull: RENEWAL_NOTICE_FULL,
  isolatedAmount: ISOLATED_AMOUNT,
  isolatedDate: ISOLATED_DATE,
  unknownAdmin: UNKNOWN_ADMIN
};
