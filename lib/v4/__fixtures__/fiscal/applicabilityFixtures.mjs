/**
 * Fixtures applicabilité V4-T — synthétiques.
 */

export const APP_FIXTURES = {
  salary1AJComplete: {
    fileName: "2042-1AJ.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
déclarant 1 Case 1AJ : 32 450 €
`.trim()
  },

  salary1AJEmpty: {
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

  salaryBoth: {
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

  foncierReel: {
    fileName: "2044-reel.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Revenus de l'année 2024
Régime réel
Résultat à reporter — case 4BA liée : 4 100 €
`.trim()
  },

  foncierMicro: {
    fileName: "2042-micro.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Revenus fonciers
Régime micro-foncier
`.trim()
  },

  foncierNoRegime: {
    fileName: "note-foncier.pdf",
    text: `
Document divers
Notes personnelles sur un bien locatif
Sans régime ni formulaire identifiable
`.trim()
  },

  riciEmpty7DB: {
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

  form7DR: {
    fileName: "2042-RICI-7DR.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Case 7DR : 400 €
`.trim()
  },

  year2022: {
    fileName: "2042-2022.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2022
déclarant 1 Case 1AJ : 30 000 €
`.trim()
  }
};
