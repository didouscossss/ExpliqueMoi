/**
 * V4-AA — Extraction locale documentaire (avant compréhension V4-Y).
 */

export type {
  LocalExtractionStatus,
  LocalExtractionMethod,
  LocalExtractionSegment,
  LocalExtractionPage,
  LocalExtractionResult,
  LocalExtractionInput
} from "./types.js";

export { extractDocumentLocally } from "./extractDocumentLocally.js";
export {
  extractThenAnalyzeLocally,
  type ExtractThenAnalyzeResult
} from "./extractThenAnalyzeLocally.js";
