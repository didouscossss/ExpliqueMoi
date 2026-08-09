/**
 * V4-Y — Compréhension documentaire générique (hors fiscalité).
 * Ne dépend PAS de knowledge/fr/tax/.
 */

export type {
  GenericFactKind,
  GenericFactImportance,
  GenericDocumentTypeId,
  GenericNormalizedAmount,
  GenericNormalizedValue,
  GenericDocumentFact,
  GenericClarificationQuestion,
  GenericUserFact,
  GenericSafetyInvariants,
  GenericDocumentPreview,
  GenericDocumentUnderstanding,
  GenericDocumentSeed,
  GenericDocumentSession
} from "./types.js";

export {
  analyzeGenericDocument,
  buildGenericDocumentSession,
  addDocumentsToGenericSession,
  removeDocumentFromGenericSession,
  applyGenericUserAnswer,
  genericUnderstandingPreviewPayload,
  assertGenericSafetyClean
} from "./analyzeGenericDocument.js";

export { classifyGenericDocument } from "./classifyGenericDocument.js";
export {
  extractGenericFacts,
  resetGenericFactIdsForTests
} from "./extractGenericFacts.js";
export {
  rankDocumentFacts,
  extractImportantFacts,
  importanceForKind,
  GENERIC_IMPORTANCE_BY_KIND
} from "./rankDocumentFacts.js";
export {
  buildGenericDocumentExplanations,
  formatImportantLine,
  resetGenericExplanationIdsForTests
} from "./buildGenericDocumentExplanations.js";
export {
  buildGenericClarifications,
  applyGenericClarificationAnswer,
  resetGenericClarificationIdsForTests
} from "./clarification.js";
export {
  emptyGenericSafety,
  auditGenericSafety
} from "./safety.js";
export {
  buildGenericDocumentPreview,
  genericUnderstandingToPreviewJson
} from "./mapGenericToPreview.js";
