/**
 * Facade JS Preview V4-K.
 * Réexporte le bundle déterministe (0 LLM) pour api/analyze.js / Vercel.
 *
 * Rebuild : npm run build:v4-preview
 */

export {
  isV4EngineEnabled,
  runV4PreviewAnalysis,
  mapV4ResultToPreviewAnalysis,
  ocrResultToV4Input,
  pagesToV4Input,
  pdfExtractionToV4Blocks,
  textToV4Blocks
} from "./v4Preview.bundle.mjs";
