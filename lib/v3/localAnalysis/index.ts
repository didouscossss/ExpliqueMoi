/**
 * Analyse locale déterministe V3 — signatures uniquement (étape D).
 */

import type { OCRResult } from "../types/OCRResult.js";
import type { LocalAnalysis } from "../types/LocalAnalysis.js";

/** Extrait entités admin sans IA — non implémenté. */
export function analyzeLocally(_ocr: OCRResult): LocalAnalysis {
  throw new Error("analyzeLocally — non implémenté (étape D).");
}
