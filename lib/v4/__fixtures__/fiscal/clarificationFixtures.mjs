/**
 * Fixtures clarification V4-S — synthétiques, déterministes.
 */

export const CLARIFICATION_FIXTURES = {
  /** 1AJ present but amount missing */
  missing1AJ: {
    fileName: "2042-empty-1AJ.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
Case 1AJ
Corrigez si le montant est inexact
`.trim()
  },

  /** 1AJ amount found in document */
  found1AJ: {
    fileName: "2042-1AJ.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
déclarant 1 Case 1AJ : 32 450 €
`.trim()
  },

  /** Two declarants with amounts — role may still need confirmation */
  bothDeclarants: {
    fileName: "2042-1AJ-1BJ.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
déclarant 1 Case 1AJ : 32 450 €
déclarant 2 Case 1BJ : 18 200 €
`.trim()
  },

  /** Ambiguous multi-amount without clear role labels */
  roleAmbiguousAmounts: {
    fileName: "2042-role-ambig.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
Case 1AJ 32 450 € 35 000 €
`.trim()
  },

  year2024: {
    fileName: "2042-2024.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Case 1AJ : 30 000 €
`.trim()
  },

  year2025Support: {
    fileName: "attestation-2025.pdf",
    text: `
Attestation fiscale — emploi à domicile
Année 2025
Montant des dépenses : 2 100 €
`.trim()
  },

  form2042RiciEmpty7DB: {
    fileName: "2042-RICI-empty.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Services à la personne
Case 7DB
Corrigez si nécessaire
`.trim()
  },

  attestation7DB: {
    fileName: "attestation-fiscale.pdf",
    text: `
Attestation fiscale — services à la personne
Emploi à domicile — année 2024
Montant des dépenses : 2 400 €
CESU / crédit d'impôt
`.trim()
  },

  form2044: {
    fileName: "2044.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Revenus de l'année 2024
Régime réel
`.trim()
  },

  confirming1AJ: {
    fileName: "bulletin-paie.pdf",
    text: `
Bulletin de paie — année 2024
Rémunération nette imposable
Case 1AJ mentionnée : 32 450 €
déclarant 1
`.trim()
  },

  contradicting1AJ: {
    fileName: "autre-source.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 1 Case 1AJ : 35 000 €
`.trim()
  }
};
