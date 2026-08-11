/**
 * OCR local Tesseract.js — français, assets packagés, 0 CDN.
 * Porté depuis V4 (lib/v4/localExtraction/ocrImageLocally.ts).
 */

import { createWorker } from "tesseract.js";
import { getLocalOcrPaths } from "./ocrPaths.js";

/** Seuil minimal — en dessous : needsExtraction, pas d’invention. */
export const MIN_OCR_TEXT_CHARS = 12;
export const MIN_OCR_CONFIDENCE = 35;
/** Garde-fou inférieur au timeout Vercel (60 s) pour toujours rendre du JSON. */
export const OCR_TIMEOUT_MS = 35_000;

/**
 * OCR une image (PNG/JPEG bytes) en français, entièrement local.
 * @param {Uint8Array|Buffer} imageBytes
 */
export async function ocrImageLocally(imageBytes) {
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
  globalThis.fetch = (async (input) => {
    fetchCount += 1;
    const url = String(input);
    throw new Error(`ocr_fetch_forbidden:${url.slice(0, 160)}`);
  });

  let worker = null;
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

    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`ocr_timeout:${OCR_TIMEOUT_MS}ms`));
      }, OCR_TIMEOUT_MS);
    });

    let recognition;
    try {
      recognition = await Promise.race([worker.recognize(buffer), timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const {
      data: { text, confidence }
    } = recognition;

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

    // Confiance faible : texte renvoyé mais marqué uncertain (Didou ne doit pas l’affirmer)
    if (conf != null && conf < MIN_OCR_CONFIDENCE) {
      return {
        ok: true,
        text: cleaned,
        confidence: conf,
        method: "local-ocr",
        error: "ocr_low_confidence",
        uncertain: true,
        fetchCount
      };
    }

    return {
      ok: true,
      text: cleaned,
      confidence: conf,
      method: "local-ocr",
      error: null,
      uncertain: false,
      fetchCount
    };
  } catch (error) {
    return {
      ok: false,
      text: null,
      confidence: null,
      method: "local-ocr",
      error: String(error?.message || error).slice(0, 240),
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
