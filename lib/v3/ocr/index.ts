/**
 * Couche OCR / extraction locale V3.
 */

export { OcrEngine } from "./OcrEngine.js";
export type { OcrBinarySource, OcrEngineOptions } from "./OcrEngine.js";
export { detectLanguageFromText } from "./languageDetection.js";
export type { LanguageDetectionResult } from "./languageDetection.js";

import type { DocumentInput } from "../types/DocumentInput.js";
import type { OCRResult } from "../types/OCRResult.js";
import { OcrEngine } from "./OcrEngine.js";

function firstPageBytes(document: DocumentInput): Uint8Array {
  const page = document.pages?.[0];
  if (!page?.bytes || !(page.bytes instanceof Uint8Array) || !page.bytes.length) {
    throw new Error("DocumentInput sans octets exploitables.");
  }
  return page.bytes;
}

/** Extraction / OCR à partir d’un DocumentInput (première page / buffer). */
export async function extractPdfText(document: DocumentInput): Promise<OCRResult> {
  const engine = new OcrEngine();
  try {
    return await engine.extractText(firstPageBytes(document));
  } finally {
    await engine.destroy();
  }
}

/** Alias OCR local pour photos / scans via DocumentInput. */
export async function runLocalOcr(document: DocumentInput): Promise<OCRResult> {
  return extractPdfText(document);
}
