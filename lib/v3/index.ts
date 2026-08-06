/**
 * ExpliqueMoi V3 — fondations (étape B).
 * Aucun branchement sur la V2.
 */

export * from "./types/index.js";
export * from "./providers/index.js";
export * from "./session/index.js";
export * from "./document/index.js";
export {
  OcrEngine,
  detectLanguageFromText,
  extractPdfText,
  runLocalOcr
} from "./ocr/index.js";
export type {
  OcrBinarySource,
  OcrEngineOptions,
  LanguageDetectionResult
} from "./ocr/index.js";
export * from "./localAnalysis/index.js";
