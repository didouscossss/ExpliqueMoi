/**
 * Fixtures + formule de test moteur V4-U.
 * La formule ci-dessous sert UNIQUEMENT à tester le moteur (extraFormulas).
 * Elle n’est PAS dans le pack production TAX_FORMULAS (volontairement vide).
 */

export const CALC_DOCS = {
  multiAmountsNoFormula: {
    fileName: "notes-montants.pdf",
    text: `
Notes personnelles
Montant A : 500 €
Montant B : 800 €
Montant C : 1200 €
Sans case fiscale identifiable
`.trim()
  },

  salary1AJ: {
    fileName: "2042-1AJ.pdf",
    text: `
Direction générale des Finances publiques
Déclaration des revenus — Formulaire 2042
Revenus de l'année 2024
déclarant 1 Case 1AJ : 32 450 €
`.trim()
  },

  empty1AJ: {
    fileName: "2042-empty.pdf",
    text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
Case 1AJ
`.trim()
  },

  foncierMicro: {
    fileName: "micro.pdf",
    text: `
Formulaire 2042
Revenus de l'année 2024
Régime micro-foncier
`.trim()
  },

  duplicatePair: [
    {
      fileName: "2042-a.pdf",
      text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 1 Case 1AJ : 32 450 €
`.trim()
    },
    {
      fileName: "2042-a-copy.pdf",
      text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 1 Case 1AJ : 32 450 €
`.trim()
    }
  ]
};

/** Formule de test moteur — somme EUR household, provenance synthétique. */
export function makeTestSumFormula(overrides = {}) {
  return {
    formulaId: "test-fixture-sum-eur-household",
    targetFieldCode: "TEST_SUM",
    documentRef: "test",
    taxYears: [2024, 2025, 2026],
    yearPolicy: "verifiedStable",
    rolePolicy: "household",
    operation: "sum",
    inputs: [
      {
        inputId: "a",
        label: "Montant A",
        fieldCode: "TEST_A",
        unit: "EUR",
        required: true,
        allowUserFact: true
      },
      {
        inputId: "b",
        label: "Montant B",
        fieldCode: "TEST_B",
        unit: "EUR",
        required: true,
        allowUserFact: true
      },
      {
        inputId: "c",
        label: "Montant C",
        fieldCode: "TEST_C",
        unit: "EUR",
        required: true,
        allowUserFact: true
      }
    ],
    unit: "EUR",
    roundingPolicy: "none",
    requiresApplicabilityField: "TEST_SUM",
    provenance: [
      {
        sourceType: "official",
        authority: "TEST-FIXTURE",
        url: "https://example.test/formula-sum",
        retrievedAt: "2026-08-08",
        title: "Fixture moteur — formule somme (tests V4-U uniquement)",
        supports: ["calculation"]
      }
    ],
    sourceExcerpt:
      "Formule de test du moteur de calcul : somme de trois montants EUR household.",
    verificationStatus: "verified",
    ...overrides
  };
}

export function makeApplicable(fieldCode = "TEST_SUM") {
  return {
    fieldCode,
    status: "applicable",
    headline: "applicable (fixture)",
    ruleId: "fixture-app",
    reasons: [],
    satisfiedConditions: [],
    unsatisfiedConditions: [],
    missingInformation: [],
    conflicts: [],
    evidence: [],
    sources: [],
    yearPolicy: "verifiedStable",
    yearRelation: "sameYear",
    role: null,
    limits: [],
    clarificationQuestionCandidates: []
  };
}

export function makeFacts(amounts) {
  return Object.entries(amounts).map(([code, value], i) => ({
    factId: `tf-${code}-${i}`,
    factType: "amount",
    fieldCode: code,
    value,
    displayValue: String(value),
    year: 2024,
    declarantRole: "household",
    documentType: "taxForm",
    sourceDocumentId: `doc-${code}`,
    sourceDocumentLabel: `${code}.pdf`,
    provenanceNote: `fixture ${code}`,
    evidence: []
  }));
}
