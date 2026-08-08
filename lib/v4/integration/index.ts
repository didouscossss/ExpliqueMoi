/**
 * V4-K — Intégration Preview contrôlée.
 */

export { isV4EngineEnabled, type V4FlagRequest } from "./featureFlag.js";
export {
  textToV4Blocks,
  pdfExtractionToV4Blocks,
  ocrResultToV4Input,
  pagesToV4Input,
  type PdfExtractionLike,
  type OcrResultLike,
  type AnalyzePageLike,
  type V4AdapterResult
} from "./adapters.js";
export {
  mapV4ResultToPreviewAnalysis,
  type PreviewAnalysisMapped
} from "./mapToPreview.js";
export {
  runV4PreviewAnalysis,
  type V4PreviewRunInput,
  type V4PreviewRunResult
} from "./runPreview.js";
