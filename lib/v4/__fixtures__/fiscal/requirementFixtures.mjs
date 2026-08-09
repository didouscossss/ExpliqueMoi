/**
 * Fixtures V4-Q — requirements / cross-document — synthétiques.
 */

export const REQUIREMENT_FIXTURES = {
  /** A — case connue + aucune information utilisateur */
  knownFieldNoUserInfo: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires
Case 1AJ
Corrigez si le montant est inexact
`.trim(),

  /** B — case connue + information trouvée */
  knownFieldFound: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
Traitements et salaires déclarant 1
Case 1AJ : 32 450 €
`.trim(),

  /** C — information ambiguë */
  ambiguousAmounts: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Case 1AJ 10 000 € 20 000 € 30 000 €
`.trim(),

  /** D — document justificatif candidat (attestation) */
  supportingAttestation: `
Attestation fiscale — services à la personne
Emploi à domicile — année 2024
Montant des dépenses : 2 400 €
CESU / crédit d'impôt
`.trim(),

  /** E — plusieurs documents candidats */
  multiSupportDocs: {
    form: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Services à la personne
Case 7DB
`.trim(),
    attestationA: `
Attestation fiscale emploi à domicile 2024
Dépenses : 1 200 €
`.trim(),
    attestationB: `
Attestation fiscale services à la personne 2024
Dépenses : 1 800 €
`.trim()
  },

  /** F — années différentes */
  yearMismatch: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2022
Case 1AJ : 30 000 €
`.trim(),

  /** G — déclarant différent */
  wrongDeclarantContext: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 2
Case 1AJ : 22 000 €
`.trim(),

  /** H — valeur présente mais mauvais type (checkbox sur case amount) */
  wrongTypeNearAmount: `
Direction générale des Finances publiques
Formulaire 2042-RICI
Case 7DB [x] cochée
`.trim(),

  /** I — requirement absent du Knowledge (case registry sans pack Q) */
  fieldWithoutRequirements: `
Direction générale des Finances publiques
Formulaire 2042
Case 2TR : 150 €
`.trim(),

  /** J — case inconnue */
  unknownField: `
Direction générale des Finances publiques
Formulaire 2042
Case 9ZZ : 100 €
`.trim(),

  /** L — condition générale (7DB / 4BC) */
  generalCondition7DB: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Case 7DB : 3 600 €
`.trim(),

  /** O — facture non fiscale candidate */
  invoiceCandidate: `
Facture n°FAC-7DB-99
Services ménage
Total TTC : 240,00 €
`.trim(),

  /** P — montant adjacent non pertinent */
  adjacentIrrelevant: `
Direction générale des Finances publiques
Formulaire 2042
Case 1AJ
Frais de dossier administratif : 45 €
`.trim(),

  /** Q — plusieurs montants sans règle d’agrégation */
  multiAmountsNoAgg: {
    docs: [
      {
        id: "a",
        label: "Attestation A",
        documentType: "taxCertificate",
        year: 2024,
        text: `Attestation fiscale emploi à domicile 2024\nDépenses : 500 €`
      },
      {
        id: "b",
        label: "Attestation B",
        documentType: "taxCertificate",
        year: 2024,
        text: `Attestation fiscale emploi à domicile 2024\nDépenses : 800 €`
      },
      {
        id: "c",
        label: "Attestation C",
        documentType: "taxCertificate",
        year: 2024,
        text: `Attestation fiscale emploi à domicile 2024\nDépenses : 1 200 €`
      }
    ],
    form: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Case 7DB
`.trim()
  },

  /** R — checkbox */
  checkboxField: `
Direction générale des Finances publiques
Formulaire 2042
Case 8UU [x] cochée
`.trim(),

  /** S — case vide */
  emptyCase: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Case 4BA
`.trim(),

  /** T — cross-document match */
  crossDocument: {
    form: `
Direction générale des Finances publiques
Formulaire n°2042-RICI
Revenus de l'année 2024
Services à la personne
Case 7DB
`.trim(),
    attestation: `
Attestation fiscale — emploi à domicile
Année 2024
Montant des dépenses ouvrant droit à crédit d'impôt : 2 150 €
`.trim()
  },

  /** Exemple 4BA */
  case4BA: `
Direction générale des Finances publiques
Formulaire n°2042
Revenus de l'année 2024
Revenus fonciers — régime réel
Case 4BA : 6 200 €
`.trim(),

  /** Preview 2044 */
  form2044: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Revenus de l'année 2024
Régime réel
Résultat à reporter en 4BA : 4 100 €
`.trim()
};
