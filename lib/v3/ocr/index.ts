/**
 * Couche OCR / extraction locale V3 — signatures uniquement (étape C).
 */

import type { DocumentInput } from "../types/DocumentInput.js";
import type { OCRResult } from "../types/OCRResult.js";

/** Extraction texte PDF locale — non implémenté. */
export async function extractPdfText(
  _document: DocumentInput
): Promise<OCRResult> {
  throw new Error("extractPdfText — non implémenté (étape C).");
}

/** OCR page par page (photos / scans) — non implémenté. */
export async function runLocalOcr(
  _document: DocumentInput
): Promise<OCRResult> {
  throw new Error("runLocalOcr — non implémenté (étape C).");
}
