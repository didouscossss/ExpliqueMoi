/**
 * Résultat OCR / extraction locale V3.
 * Signatures uniquement — aucun traitement métier.
 */

export interface OCRPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OCRResult {
  pages: OCRPageResult[];
  fullText: string;
  warnings: string[];
}
