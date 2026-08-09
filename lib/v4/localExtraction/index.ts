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
export {
  ocrImageLocally,
  MIN_OCR_TEXT_CHARS,
  MIN_OCR_CONFIDENCE,
  type OcrImageResult
} from "./ocrImageLocally.js";
export { getLocalOcrPaths, getOcrAssetsRoot } from "./ocrPaths.js";
