/**
 * V4-X — Moteur d’explication locale, déterministe et traçable.
 * Distinct de DocumentExplanation (V4-G).
 */

export {
  buildLocalExplanations,
  attachLocalExplanations,
  emptyLocalExplanationInvariants,
  resetLocalExplanationIdsForTests
} from "./buildLocalExplanations.js";
export { collectSourceFactsForSubject } from "./explainDocumentFacts.js";
export { explainApplicabilityLocal } from "./explainApplicabilityLocal.js";
export { explainDerivedValueLocal } from "./explainDerivedValueLocal.js";
export {
  auditLocalExplanations,
  type LocalExplanationAuditReport
} from "./audit.js";
export { buildPremiumExplanationContext } from "./premiumBoundary.js";
