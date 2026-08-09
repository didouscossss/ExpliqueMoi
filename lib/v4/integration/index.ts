/**
 * V4-K/O — Intégration Preview contrôlée + view model fiscal.
 * V4-Y — attache aussi generic_understanding (hors fiscalité).
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
  parseMultiDocumentPaste,
  type V4PreviewRunInput,
  type V4PreviewRunResult
} from "./runPreview.js";
export {
  buildFiscalDocumentViewModel,
  fiscalViewModelToPreviewJson,
  shouldAttachFiscalViewModel,
  familyLabelFr,
  qualityStatusLabelFr,
  humanFieldLabel,
  humanEvidenceSupport,
  type FiscalDocumentViewModel,
  type FiscalRecognitionLevel,
  type FiscalViewFact,
  type FiscalViewAction
} from "./fiscalViewModel.js";
export {
  runV4PreviewDocumentCase,
  type V4DocumentCaseRunInput
} from "./runDocumentCase.js";
export { documentCaseToPreviewJson } from "./documentCaseViewModel.js";
