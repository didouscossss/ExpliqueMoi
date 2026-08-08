/**
 * Fixtures V4-V — première formule réelle (micro-foncier 4BE).
 */

export const FIRST_FORMULA_DOCS = {
  micro4BE_10000: {
    fileName: "2042-micro-4BE.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Revenus fonciers
Régime micro-foncier
Case 4BE : 10 000 €
`.trim()
  },

  micro4BE_16000: {
    fileName: "2042-micro-over.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Revenus fonciers
Régime micro-foncier
Case 4BE : 16 000 €
`.trim()
  },

  micro4BE_noAmount: {
    fileName: "2042-micro-empty.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Revenus fonciers
Régime micro-foncier
Case 4BE
`.trim()
  },

  reel4BA: {
    fileName: "2044-reel.pdf",
    text: `
Direction générale des Finances publiques
Formulaire n°2044 — Déclaration des revenus fonciers
Revenus de l'année 2024
Régime réel
Résultat à reporter — case 4BA liée : 4 100 €
`.trim()
  },

  micro4BE_declarant1_roleNoise: {
    fileName: "2042-micro-role.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 1
Régime micro-foncier
Case 4BE : 8 000 €
`.trim()
  }
};

export function makeExclusionsOkUserFact(overrides = {}) {
  return {
    kind: "user",
    factId: "uf-4be-exclusions",
    questionId: "q-4be-exclusions",
    requirementId: "4be-micro-exclusions-ok",
    fieldCode: "4BE",
    answer: "oui",
    normalizedValue: true,
    valueType: "boolean",
    answerStatus: "accepted",
    answeredAt: null,
    source: "clarification",
    active: true,
    year: 2024,
    role: "household",
    ...overrides
  };
}

export function make4BEFacts(amount, overrides = {}) {
  return [
    {
      factId: `tf-4BE-${amount}`,
      factType: "amount",
      fieldCode: "4BE",
      value: amount,
      displayValue: String(amount),
      year: 2024,
      declarantRole: "household",
      documentType: "taxForm",
      sourceDocumentId: "doc-4BE",
      sourceDocumentLabel: "4BE.pdf",
      provenanceNote: "fixture 4BE",
      evidence: [],
      ...overrides
    }
  ];
}
