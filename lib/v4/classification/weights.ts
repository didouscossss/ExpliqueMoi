/**
 * Poids centralisés du Document Schema Router (V4-D).
 */

export const CLASSIFICATION_WEIGHTS = {
  // Familles
  lexicalStrong: 0.22,
  lexicalSecondary: 0.1,
  structural: 0.22,
  entity: 0.12,
  relation: 0.14,
  arithmetic: 0.18,
  layout: 0.08,
  negativeEvidence: -0.35,
  missingExpectedStructure: -0.2,

  // Seuils globaux
  unknownMaxScore: 0.24,
  ambiguousMargin: 0.1,
  secondarySectionMin: 0.22,
  secondarySectionMaxPrimaryRatio: 0.55,

  // Spécifiques critiques
  ibanAloneBankCap: 0.12,
  bankNeedsTransactionStructure: 0.25
} as const;
