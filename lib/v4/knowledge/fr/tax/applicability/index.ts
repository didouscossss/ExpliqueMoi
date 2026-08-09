/**
 * V4-T — Applicabilité fiscale déterministe, sourcée et explicable.
 */

export { evaluateCondition, resetApplicabilityEvidenceIdsForTests } from "./evaluateCondition.js";
export {
  evaluateTaxFieldApplicability,
  evaluateDocumentCaseApplicability,
  assertApplicabilityOrderStable,
  emptyApplicabilityInvariants
} from "./evaluateApplicability.js";
export {
  TAX_APPLICABILITY_RULES,
  getApplicabilityRulesForField,
  listApplicabilityRuleIds,
  FIELDS_WITHOUT_STRONG_APPLICABILITY
} from "./rules.js";
export {
  explainTaxApplicability,
  applicabilityStatusLabel
} from "./explainApplicability.js";
export {
  buildClarificationCandidatesFromApplicability,
  mergeApplicabilityQuestionsIntoSession
} from "./bridgeClarification.js";
export { buildApplicabilityEvidence, resetApplicabilityBuildIdsForTests } from "./buildApplicabilityEvidence.js";
export {
  auditTaxApplicability,
  type ApplicabilityAuditReport
} from "./audit.js";
