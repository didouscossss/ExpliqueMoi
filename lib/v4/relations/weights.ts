/**
 * Poids centralisés V4-C — relations & cohérence globale.
 */

export const RELATION_WEIGHTS = {
  // Arithmetic
  htPlusVatEqualsTtc: 0.55,
  htTimesRateEqualsTtc: 0.5,
  arithmeticBundleBonus: 0.25,
  moneyTolerance: 0.02, // €

  // Spatial / structural
  sameLine: 0.2,
  adjacentLine: 0.12,
  samePage: 0.05,
  sameSection: 0.1,
  tableMembership: 0.15,

  // Semantic labels
  semanticIssuer: 0.45,
  semanticRecipient: 0.45,
  semanticSender: 0.4,
  organizationPerson: 0.3,

  // Temporal / action
  actionDeadline: 0.55,
  temporalBefore: 0.2,

  // Ownership
  ownership: 0.25,

  // Contradiction penalties
  arithmeticMismatch: -0.7,
  roleConflict: -0.4,
  capitalAsTotal: -0.8,

  // Global consistency assembly
  localScoreWeight: 0.45,
  relationScoreWeight: 0.4,
  contradictionWeight: 1.0,
  ambiguityMargin: 0.08 // si |scoreA - scoreB| < margin → ambiguous
} as const;
