export type {
  ExplanationStatus,
  ExplanationWarningKind,
  ExplanationFact,
  ExplanationAction,
  ExplanationWarning,
  ExplanationSecondaryInfo,
  DocumentExplanation
} from "../types/documentExplanation.js";

export { toExplanationStatus } from "./mapStatus.js";
export {
  countUnsupportedExplanationFacts,
  explanationInvariantsHold
} from "./invariant.js";
export { buildDocumentExplanation } from "./builder.js";
export {
  ExplanationPipeline,
  explainDocumentText
} from "./pipeline.js";
export type { ExplanationPipelineResult } from "./pipeline.js";
