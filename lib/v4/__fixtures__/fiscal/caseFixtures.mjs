/**
 * Fixtures dossier multi-documents V4-R — synthétiques.
 */

export const CASE_DOCS = {
  form2042: {
    fileName: "2042.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
déclarant 1 Case 1AJ : 32 450 €
déclarant 2 Case 1BJ : 18 200 €
`.trim()
  },

  form2042Rici: {
    fileName: "2042-RICI.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Services à la personne
Case 7DB : 3 600 €
Case 7DR : 400 €
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

  attestation7DB_2025: {
    fileName: "attestation-2025.pdf",
    text: `
Attestation fiscale — emploi à domicile
Année 2025
Montant des dépenses : 2 100 €
`.trim()
  },

  form2044: {
    fileName: "2044.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Revenus de l'année 2024
Régime réel
Résultat à reporter — case 4BA liée : 4 100 €
`.trim()
  },

  foncierJustificatif: {
    fileName: "loyers-2024.pdf",
    text: `
Décompte de loyers — année 2024
Local loué nu
Recettes brutes perçues : 12 000 €
Charges déductibles : 3 200 €
Justificatif immobilier
`.trim()
  },

  unknownDoc: {
    fileName: "scan-inconnu.pdf",
    text: `
Document divers
Notes personnelles
Montant mentionné : 150 €
Sans formulaire identifiable
`.trim()
  },

  invoiceFP: {
    fileName: "facture-7DB.pdf",
    text: `
Facture n°FAC-7DB-99
Services ménage
Référence produit 7DB
Total TTC : 240,00 €
`.trim()
  },

  attestationA: {
    fileName: "attestation-A.pdf",
    text: `Attestation fiscale emploi à domicile 2024\nDépenses : 500 €`
  },
  attestationB: {
    fileName: "attestation-B.pdf",
    text: `Attestation fiscale emploi à domicile 2024\nDépenses : 800 €`
  },
  attestationC: {
    fileName: "attestation-C.pdf",
    text: `Attestation fiscale emploi à domicile 2024\nDépenses : 1 200 €`
  },

  draft2042: {
    fileName: "2042-brouillon.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
BROUILLON
Case 1AJ : 30 000 €
`.trim()
  },

  final2042: {
    fileName: "2042-final.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
VERSION FINALE
Case 1AJ : 32 450 €
`.trim()
  },

  noYearDoc: {
    fileName: "attestation-sans-annee.pdf",
    text: `
Attestation fiscale — emploi à domicile
Montant des dépenses : 900 €
CESU
`.trim()
  },

  conflictAmountAttestation: {
    fileName: "attestation-alt.pdf",
    text: `
Attestation fiscale — services à la personne
Emploi à domicile — année 2024
Montant des dépenses : 9 999 €
`.trim()
  }
};

/** 10 documents pour perf */
export function tenDocumentBundle() {
  return [
    CASE_DOCS.form2042,
    CASE_DOCS.form2042Rici,
    CASE_DOCS.attestation7DB,
    CASE_DOCS.form2044,
    CASE_DOCS.foncierJustificatif,
    CASE_DOCS.unknownDoc,
    CASE_DOCS.attestationA,
    CASE_DOCS.attestationB,
    CASE_DOCS.noYearDoc,
    CASE_DOCS.draft2042
  ];
}
