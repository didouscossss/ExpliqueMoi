/**
 * extractDocumentLocally — orchestration minimale V4-AA.
 *
 * Priorité : couche texte PDF (pdfjs déjà présent).
 * Image / PDF scanné → needsExtraction (pas d’OCR installé en V4-AA).
 * Indépendant de V4-Y.
 */

import { extractPdfTextBlocks } from "../../pdfProcessing.js";
import type {
  LocalExtractionInput,
  LocalExtractionResult,
  LocalExtractionSegment
} from "./types.js";

function asUint8Array(
  bytes: LocalExtractionInput["bytes"]
): Uint8Array | null {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) {
    return new Uint8Array(bytes);
  }
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return null;
}

function inferSourceType(input: LocalExtractionInput): string {
  if (input.sourceType) return input.sourceType;
  const mime = String(input.mimeType || "").toLowerCase();
  if (mime === "application/pdf" || mime.endsWith("/pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  const name = String(input.filename || "").toLowerCase();
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(name)) return "image";
  if (typeof input.text === "string") return "text";
  if (input.bytes) return "pdf"; // tentative — validée par looksLikePdf côté pdfjs
  return "unknown";
}

/**
 * Extraction locale du contenu textuel.
 * Ne lit jamais le filename comme texte.
 * N’invente jamais de contenu pour image / PDF scanné.
 */
export async function extractDocumentLocally(
  input: LocalExtractionInput
): Promise<LocalExtractionResult> {
  const sourceType = inferSourceType(input || {});

  // 1) Texte déjà fourni — pas d’OCR / PDF
  if (typeof input.text === "string") {
    const trimmed = input.text.trim();
    if (!trimmed) {
      return {
        status: "empty",
        text: null,
        pages: null,
        segments: null,
        method: "direct-text",
        error: null,
        meta: { sourceType, hasTextLayer: false }
      };
    }
    return {
      status: "extracted",
      text: input.text,
      pages: [{ page: 1, text: input.text }],
      segments: null,
      method: "direct-text",
      error: null,
      meta: { sourceType, pageCount: 1, hasTextLayer: true }
    };
  }

  // 2) Image — pas d’OCR local en V4-AA (aucune dépendance OCR)
  if (sourceType === "image") {
    return {
      status: "needsExtraction",
      text: null,
      pages: null,
      segments: null,
      method: "none",
      error: "local_ocr_unavailable",
      meta: {
        sourceType: "image",
        hasTextLayer: false,
        scannedGuess: true
      }
    };
  }

  // 3) PDF — couche texte via pdfjs (dépendance déjà présente)
  if (sourceType === "pdf" || input.bytes) {
    const data = asUint8Array(input.bytes);
    if (!data || !data.length) {
      return {
        status: "needsExtraction",
        text: null,
        pages: null,
        segments: null,
        method: "none",
        error: "pdf_bytes_missing",
        meta: { sourceType: "pdf", hasTextLayer: false }
      };
    }

    try {
      const extracted = await extractPdfTextBlocks(data, { maxPages: 50 });
      if (!extracted.ok) {
        return {
          status: "failed",
          text: null,
          pages: null,
          segments: null,
          method: "none",
          error: extracted.detail || "pdf_extract_failed",
          meta: {
            sourceType: "pdf",
            pageCount: extracted.pageCount || 0,
            hasTextLayer: false
          }
        };
      }

      if (!extracted.hasText) {
        // PDF scanné / sans couche texte — pas d’OCR ici
        return {
          status: "needsExtraction",
          text: null,
          pages: (extracted.pageTexts || []).map(
            (p: { pageNumber: number; text: string }) => ({
              page: p.pageNumber,
              text: ""
            })
          ),
          segments: null,
          method: "none",
          error: "pdf_no_text_layer",
          meta: {
            sourceType: "pdf",
            pageCount: extracted.pageCount,
            hasTextLayer: false,
            scannedGuess: true
          }
        };
      }

      const pages = (extracted.pageTexts || []).map(
        (p: { pageNumber: number; text: string }) => ({
          page: p.pageNumber,
          text: p.text || ""
        })
      );
      const text = pages
        .map((p: { text: string }) => p.text)
        .filter(Boolean)
        .join("\n\n");
      const segments: LocalExtractionSegment[] = (extracted.blocks || []).map(
        (b: {
          text: string;
          page: number;
          bbox?: LocalExtractionSegment["bbox"];
          lineId?: string;
        }) => ({
          text: b.text,
          page: b.page,
          bbox: b.bbox || null,
          lineId: b.lineId || null
        })
      );

      if (!text.trim()) {
        return {
          status: "empty",
          text: null,
          pages,
          segments,
          method: "local-pdf-text",
          error: null,
          meta: {
            sourceType: "pdf",
            pageCount: extracted.pageCount,
            hasTextLayer: false
          }
        };
      }

      return {
        status: "extracted",
        text,
        pages,
        segments,
        method: "local-pdf-text",
        error: null,
        meta: {
          sourceType: "pdf",
          pageCount: extracted.pageCount,
          hasTextLayer: true,
          scannedGuess: false
        }
      };
    } catch (error) {
      return {
        status: "failed",
        text: null,
        pages: null,
        segments: null,
        method: "none",
        error: String((error as Error)?.message || error).slice(0, 240),
        meta: { sourceType: "pdf" }
      };
    }
  }

  // 4) Inconnu sans texte
  return {
    status: "unsupported",
    text: null,
    pages: null,
    segments: null,
    method: "none",
    error: "unsupported_input",
    meta: { sourceType }
  };
}
