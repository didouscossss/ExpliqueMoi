/**
 * Analyse locale déterministe V3.
 */

export { LocalAnalysisEngine } from "./LocalAnalysisEngine.js";
export type { LocalAnalysisInput } from "./LocalAnalysisEngine.js";
export { detectDocumentType } from "./documentType.js";
export {
  extractAmounts,
  extractClientName,
  extractCompanyName,
  extractDates,
  extractIban,
  extractInvoiceNumber,
  extractSiret,
  isPlausibleIban,
  isValidSiret,
  pickBestAmount,
  selectPrincipalAmountValue
} from "./extractors.js";

import type { OCRResult } from "../types/OCRResult.js";
import type { LocalAnalysis } from "../types/LocalAnalysis.js";
import { LocalAnalysisEngine } from "./LocalAnalysisEngine.js";

/** Point d’entrée simple : OCR → LocalAnalysis (sans IA). */
export function analyzeLocally(ocr: OCRResult | string): LocalAnalysis {
  return new LocalAnalysisEngine().analyze(ocr);
}
