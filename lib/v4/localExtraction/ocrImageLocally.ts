/**
 * OCR local Tesseract.js — français, assets packagés, 0 CDN.
 */

import { createWorker } from "tesseract.js";
import { getLocalOcrPaths } from "./ocrPaths.js";

/** Seuil minimal — en dessous : needsExtraction, pas d’invention. */
export const MIN_OCR_TEXT_CHARS = 12;
export const MIN_OCR_CONFIDENCE = 35;

export interface OcrImageResult {
  ok: boolean;
  text: string | null;
  confidence: number | null;
  method: "local-ocr";
  error: string | null;
  /** Compteur fetch observé pendant l’OCR (doit rester 0). */
  fetchCount: number;
}

/**
 * OCR une image (PNG/JPEG bytes) en français, entièrement local.
 */
export async function ocrImageLocally(
  imageBytes: Uint8Array | Buffer
): Promise<OcrImageResult> {
  const paths = getLocalOcrPaths();
  if (!paths.ready) {
    return {
      ok: false,
      text: null,
      confidence: null,
      method: "local-ocr",
      error: `ocr_assets_missing:${paths.missing.join(",")}`,
      fetchCount: 0
    };
  }

  let fetchCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    fetchCount += 1;
    const url = String(input);
    // Interdit tout téléchargement réseau pendant l’OCR
    throw new Error(`ocr_fetch_forbidden:${url.slice(0, 160)}`);
  }) as typeof fetch;

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker("fra", 1, {
      workerPath: paths.workerPath,
      corePath: paths.corePath,
      langPath: paths.langPath,
      cachePath: paths.cachePath,
      cacheMethod: "none",
      gzip: true
    });

    const buffer =
      imageBytes instanceof Buffer
        ? imageBytes
        : Buffer.from(
            imageBytes.buffer,
            imageBytes.byteOffset,
            imageBytes.byteLength
          );

    const {
      data: { text, confidence }
    } = await worker.recognize(buffer);

    const cleaned = String(text || "").trim();
    const chars = cleaned.replace(/\s+/g, "").length;
    const conf = typeof confidence === "number" ? confidence : null;

    if (!cleaned || chars < MIN_OCR_TEXT_CHARS) {
      return {
        ok: false,
        text: null,
        confidence: conf,
        method: "local-ocr",
        error: "ocr_insufficient_text",
        fetchCount
      };
    }
    if (conf != null && conf < MIN_OCR_CONFIDENCE) {
      return {
        ok: false,
        text: null,
        confidence: conf,
        method: "local-ocr",
        error: "ocr_low_confidence",
        fetchCount
      };
    }

    return {
      ok: true,
      text: cleaned,
      confidence: conf,
      method: "local-ocr",
      error: null,
      fetchCount
    };
  } catch (error) {
    return {
      ok: false,
      text: null,
      confidence: null,
      method: "local-ocr",
      error: String((error as Error)?.message || error).slice(0, 240),
      fetchCount
    };
  } finally {
    globalThis.fetch = previousFetch;
    try {
      await worker?.terminate();
    } catch {
      // ignore
    }
  }
}
