/**
 * Déclarations minimales pour l’extraction PDF locale (pdfjs).
 * Implémentation : lib/pdfProcessing.js
 */

export const MAX_PDF_PAGES_SOFT: number;
export const MIN_TEXT_CHARS: number;

export function extractPdfTextBlocks(
  bytes: Uint8Array | ArrayBuffer | Buffer,
  options?: { maxPages?: number; password?: string }
): Promise<{
  ok: boolean;
  pageCount: number;
  blocks: Array<{
    id: string;
    text: string;
    page: number;
    lineId?: string;
    blockId?: string;
    source?: string;
    bbox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  }>;
  pageTexts: Array<{ pageNumber: number; text: string }>;
  fullText: string;
  hasText: boolean;
  scanned: boolean;
  textLength?: number;
  detail?: string;
}>;

export function rasterizePdfPages(
  bytes: Uint8Array | ArrayBuffer | Buffer,
  options?: {
    maxPages?: number;
    scale?: number;
    quality?: number;
    password?: string;
    pageTexts?: Array<{ pageNumber: number; text: string }>;
  }
): Promise<{
  ok: boolean;
  pageCount: number;
  images: Array<{
    pageNumber: number;
    mimeType: string;
    bytes: Buffer | Uint8Array;
    size: number;
    width: number;
    height: number;
    source?: string;
  }>;
  readablePages: number[];
  failedPages: number[];
  code?: string;
  message?: string;
}>;
