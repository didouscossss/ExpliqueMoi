/**
 * Poids centralisés du scoring V4-B.
 * Aucun nombre magique dispersé dans les extracteurs / scorer.
 * Deltas exprimés sur une échelle 0..1 (somme ensuite clampée).
 */

export const SCORE_WEIGHTS = {
  // —— Labels spatiaux ——
  sameLineLabel: 0.55,
  previousLineLabel: 0.35,
  nextLineLabel: 0.22,
  nearLabelProximity: 0.17,

  // —— Unités / forme ——
  currencyEur: 0.1,
  percentUnit: 0.12,
  moneyDecimals: 0.08,

  // —— Structure ——
  sameBlock: 0.08,
  sameColumn: 0.12,
  sameTable: 0.15,

  // —— Lexical positif générique ——
  totalKeyword: 0.18,
  payableKeyword: 0.2,
  referenceKeyword: 0.45,
  clientNumberKeyword: 0.5,
  vatRateKeyword: 0.5,
  vatAmountKeyword: 0.4,
  htKeyword: 0.55,
  ttcKeyword: 0.55,
  dateKeyword: 0.35,
  personCivility: 0.4,
  organizationLegalForm: 0.45,
  ibanKeyword: 0.5,
  addressPostalCode: 0.35,

  // —— Négatifs ——
  capitalSocialPenalty: -0.7,
  plafondPenalty: -0.45,
  exemplePenalty: -0.5,
  tarifIndicatifPenalty: -0.4,
  ancienMontantPenalty: -0.35,
  percentAsMoneyPenalty: -0.8,
  numericAsPersonPenalty: -0.9,
  largeRoundCapitalLike: -0.25,

  // —— Base selon type ——
  baseMoney: 0.12,
  basePercentage: 0.15,
  baseDate: 0.15,
  baseReference: 0.2,
  basePerson: 0.1,
  baseOrganization: 0.1,
  baseIban: 0.25,
  baseSiren: 0.2,
  baseSiret: 0.22,
  baseEmail: 0.3,
  basePhone: 0.25,
  baseAddress: 0.15
} as const;

export type ScoreWeightKey = keyof typeof SCORE_WEIGHTS;
