/**
 * V4-S — Boucle de clarification déterministe.
 */

export { parseClarificationAnswer } from "./parseAnswer.js";
export {
  selectNextClarificationQuestion,
  assertQuestionOrderStable,
  DEFAULT_MAX_ASKED
} from "./selectNextQuestion.js";
export {
  buildClarificationSession,
  markQuestionAsked,
  emptyClarificationInvariants
} from "./buildClarificationState.js";
export {
  initClarificationState,
  applyClarificationAnswer,
  type ApplyClarificationResult
} from "./applyUserAnswer.js";
export { explainClarificationChanges } from "./explainCaseChanges.js";
export {
  auditClarification,
  auditClarificationState,
  type ClarificationAuditReport
} from "./audit.js";
