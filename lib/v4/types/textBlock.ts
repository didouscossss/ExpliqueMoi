/**
 * Unité de texte du socle universel V4.
 * Produite par pdf.js, OCR ou texte plat — avant tout rôle métier.
 */

import type { BoundingBox } from "./geometry.js";

export type TextSource = "pdfjs" | "ocr" | "text";

export interface TextBlock {
  /** Identifiant stable dans la DocumentSession. */
  id: string;
  text: string;
  /** Numéro de page 1-based. */
  page: number;
  bbox?: BoundingBox | null;
  lineId?: string | null;
  blockId?: string | null;
  source: TextSource;
}
