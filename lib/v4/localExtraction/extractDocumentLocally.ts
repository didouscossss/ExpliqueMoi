/**
 * extractDocumentLocally — V4-AA + V4-AC OCR local.
 *
 * Priorité : texte fourni → couche texte PDF (pdfjs) → OCR local (image / PDF scanné 1 page).
 * Indépendant de V4-Y. Aucun CDN / LLM.
 */

import {
  extractPdfTextBlocks,
  rasterizePdfPages
} from "../../pdfProcessing.js";
import { ocrImageLocally } from "./ocrImageLocally.js";
import type {
  LocalExtractionInput,
  LocalExtractionResult,
  LocalExtractionSegment
} from "./types.js";

function asUint8Array(
  bytes: LocalExtractionInput["bytes"]
): Uint8Array | null {
  if (!bytes) return null;
  // Toujours copier : pdfjs peut détacher/transferer l’ArrayBuffer source.
  if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) {
    return Uint8Array.from(bytes);
  }
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  return null;
}

/** Copie défensive avant chaque appel pdfjs. */
function copyBytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
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
  if (input.bytes) return "pdf";
  return "unknown";
}

function ocrFailureResult(
  sourceType: string,
  error: string,
  pageCount?: number
): LocalExtractionResult {
  return {
    status: "needsExtraction",
    text: null,
    pages: null,
    segments: null,
    method: "none",
    error,
    meta: {
      sourceType,
      pageCount,
      hasTextLayer: false,
      scannedGuess: true
    }
  };
}

function ocrSuccessResult(
  text: string,
  sourceType: string,
  page = 1
): LocalExtractionResult {
  return {
    status: "extracted",
    text,
    pages: [{ page, text }],
    segments: text
      .split(/\n/)
      .map((line, i) => line.trim())
      .filter(Boolean)
      .map((line, i) => ({
        text: line,
        page,
        bbox: null,
        lineId: `ocr_p${page}_L${i + 1}`
      })),
    method: "local-ocr",
    error: null,
    meta: {
      sourceType,
      pageCount: page,
      hasTextLayer: false,
      scannedGuess: true
    }
  };
}

/**
 * Extraction locale du contenu textuel.
 * Ne lit jamais le filename comme texte.
 * N’invente jamais de contenu si OCR échoue.
 */
export async function extractDocumentLocally(
  input: LocalExtractionInput
): Promise<LocalExtractionResult> {
  const sourceType = inferSourceType(input || {});

  // 1) Texte déjà fourni
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

  // 2) Image → OCR local (1 page)
  if (sourceType === "image") {
    const data = asUint8Array(input.bytes);
    if (!data || !data.length) {
      return ocrFailureResult("image", "image_bytes_missing");
    }
    const ocr = await ocrImageLocally(data);
    if (ocr.fetchCount > 0) {
      return ocrFailureResult("image", "ocr_network_attempt");
    }
    if (!ocr.ok || !ocr.text) {
      return ocrFailureResult("image", ocr.error || "ocr_failed");
    }
    return ocrSuccessResult(ocr.text, "image", 1);
  }

  // 3) PDF — couche texte d’abord, sinon OCR page 1
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
      const extracted = await extractPdfTextBlocks(copyBytes(data), {
        maxPages: 50
      });
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

      if (extracted.hasText) {
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
        const segments: LocalExtractionSegment[] = (
          extracted.blocks || []
        ).map(
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
      }

      // PDF scanné — OCR page 1 uniquement (V4-AC)
      const raster = await rasterizePdfPages(copyBytes(data), {
        maxPages: 1,
        scale: 1.5,
        quality: 80
      });
      const first = Array.isArray(raster.images) ? raster.images[0] : null;
      if (!first?.bytes?.length) {
        return ocrFailureResult(
          "pdf",
          "pdf_raster_failed",
          extracted.pageCount
        );
      }

      const ocr = await ocrImageLocally(first.bytes);
      if (ocr.fetchCount > 0) {
        return ocrFailureResult("pdf", "ocr_network_attempt", extracted.pageCount);
      }
      if (!ocr.ok || !ocr.text) {
        return ocrFailureResult(
          "pdf",
          ocr.error || "pdf_no_text_layer",
          extracted.pageCount
        );
      }
      return ocrSuccessResult(ocr.text, "pdf", first.pageNumber || 1);
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
