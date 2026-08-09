/**
 * V4-AA — Extraction locale photo/PDF (couche indépendante de V4-Y).
 * Aucun OCR cloud / LLM / fr/tax.
 */

export type LocalExtractionStatus =
  | "extracted"
  | "empty"
  | "needsExtraction"
  | "unsupported"
  | "failed";

export type LocalExtractionMethod =
  | "direct-text"
  | "local-pdf-text"
  | "none";

export interface LocalExtractionSegment {
  text: string;
  page: number;
  /** bbox approximative si disponible (pdfjs). */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  lineId?: string | null;
}

export interface LocalExtractionPage {
  page: number;
  text: string;
}

export interface LocalExtractionResult {
  status: LocalExtractionStatus;
  text: string | null;
  pages?: LocalExtractionPage[] | null;
  segments?: LocalExtractionSegment[] | null;
  method: LocalExtractionMethod;
  error?: string | null;
  /** Métadonnées diagnostics (pas du contenu inventé). */
  meta?: {
    pageCount?: number;
    hasTextLayer?: boolean;
    scannedGuess?: boolean;
    sourceType?: string;
  };
}

/**
 * Entrée extraction — bytes optionnels pour PDF.
 * Le filename n’est JAMAIS du contenu.
 */
export interface LocalExtractionInput {
  id?: string | null;
  sourceType?: "text" | "image" | "pdf" | "unknown" | null;
  mimeType?: string | null;
  filename?: string | null;
  /** Texte déjà disponible — court-circuit. */
  text?: string | null;
  /** Octets PDF (ou futurs formats). */
  bytes?: Uint8Array | ArrayBuffer | Buffer | null;
}
