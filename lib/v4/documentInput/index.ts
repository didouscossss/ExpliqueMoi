/**
 * V4-Z — Contrat d’entrée documentaire local (avant OCR/vision).
 */

export type {
  DocumentSourceType,
  DocumentExtractionStatus,
  DocumentExtractionMethod,
  DocumentInputPage,
  DocumentExtractionInfo,
  DocumentInput,
  RawDocumentAcquisition,
  PreparedDocumentInput,
  DocumentInputSafetyInvariants
} from "./types.js";

export {
  prepareDocumentInput,
  normalizeDocumentInput,
  auditDocumentInputSafety,
  emptyDocumentInputSafety,
  resetDocumentInputIdsForTests
} from "./normalizeDocumentInput.js";

export {
  runGenericDocumentAnalysis,
  type GenericDocumentPipelineResult,
  type RunGenericDocumentAnalysisOptions
} from "./runGenericDocumentAnalysis.js";
