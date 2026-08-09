export { SCORE_WEIGHTS } from "./weights.js";
export {
  normalizeLex,
  parseFrenchMoney,
  parseFrenchPercentage,
  parseFrenchDate
} from "./normalize.js";
export { blocksFromPlainText, buildContext, contextBlob } from "./context.js";
export { resetCandidateIdsForTests, nextCandidateId } from "./ids.js";
export {
  CandidateExtractor,
  extractCandidates
} from "./extractors/CandidateExtractor.js";
export type { CandidateExtractorOptions } from "./extractors/CandidateExtractor.js";
export { HypothesisEngine, assignHypotheses } from "./hypothesis/HypothesisEngine.js";
export type { HypothesisEngineOptions } from "./hypothesis/HypothesisEngine.js";
export { ROLES_BY_TYPE } from "./hypothesis/roles.js";
export { scoreRole } from "./hypothesis/scorer.js";
export {
  CandidatePipeline,
  extractAndScoreCandidates
} from "./pipeline.js";
export type {
  CandidatePipelineOptions,
  CandidatePipelineResult
} from "./pipeline.js";
