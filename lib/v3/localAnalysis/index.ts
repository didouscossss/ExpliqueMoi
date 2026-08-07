/**
 * Analyse locale déterministe V3.
 */

export { LocalAnalysisEngine } from "./LocalAnalysisEngine.js";
export type { LocalAnalysisInput } from "./LocalAnalysisEngine.js";
export { detectDocumentType } from "./documentType.js";
export { buildLocalEvidence } from "./evidence.js";
export { buildFactualSummary } from "./factualSummary.js";
export {
  debugAmountPipeline,
  rankAmountCandidates,
  selectAmountFields
} from "./amountRanking.js";
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

/**
 * Complète amountTTC / amountToPay depuis des textes OCR/texte additionnels.
 * Ne doit pas être alimenté par des keyPoints IA.
 */
export function enrichLocalAmountFields(
  analysis: LocalAnalysis,
  extraTexts: string[]
): LocalAnalysis {
  return new LocalAnalysisEngine().enrichAmountFields(analysis, extraTexts);
}
