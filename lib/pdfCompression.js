/**
 * Compression PDF ciblée — uniquement scannés / grosses images.
 * Ne convertit jamais un PDF texte léger en images.
 * Conserve toutes les pages et l’ordre.
 */
import { PDFDocument } from "pdf-lib";
import { rasterizePdfPages } from "./pdfProcessing.js";

/** Sous ce seuil, on ne touche pas au PDF. */
const LIGHT_PDF_BYTES = 250 * 1024;

/** Au-delà, un PDF scanné / image-heavy mérite compression. */
const HEAVY_PDF_BYTES = 700 * 1024;

const COMPRESS_SCALE = 1.05;
const COMPRESS_JPEG_QUALITY = 58;
const MAX_EDGE_PX = 1400;

/**
 * @param {Buffer|Uint8Array} bytes
 * @param {{ scanned?: boolean, hasText?: boolean, textLength?: number, pageCount?: number }} meta
 */
export function shouldCompressPdf(bytes, meta = {}) {
  const size = bytes?.length || 0;
  if (size <= 0) return false;
  if (size <= LIGHT_PDF_BYTES) return false;

  const scanned = meta.scanned === true;
  const textLength = Number(meta.textLength) || 0;
  const pageCount = Math.max(1, Number(meta.pageCount) || 1);
  const avgText = textLength / pageCount;
  // Peu de texte sélectionnable + gros fichier ≈ pages image / scan
  const imageHeavy = scanned || avgText < 80;

  if (!imageHeavy) return false;
  if (size >= HEAVY_PDF_BYTES) return true;
  if (size >= 1 * 1024 * 1024 && avgText < 120) return true;
  return scanned && size > LIGHT_PDF_BYTES;
}

/**
 * Rasterise les pages en JPEG puis reconstruire un PDF image.
 * Texte sélectionnable d’origine peut disparaître sur un scan (déjà peu/pas de texte).
 * Sur PDF texte, shouldCompressPdf renvoie false → jamais appelé.
 */
export async function compressPdfForAnalysis(bytes, meta = {}) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const beforeBytes = input.length;

  if (!shouldCompressPdf(input, meta)) {
    return {
      ok: true,
      compressed: false,
      bytes: input,
      beforeBytes,
      afterBytes: beforeBytes,
      reason: "skipped_light_or_text"
    };
  }

  const started = Date.now();

  try {
    const raster = await rasterizePdfPages(input, {
      scale: COMPRESS_SCALE,
      quality: COMPRESS_JPEG_QUALITY,
      pageTexts: meta.pageTexts || [],
      maxPages: meta.pageCount || undefined
    });

    if (!raster.ok || !(raster.images || []).length) {
      return {
        ok: true,
        compressed: false,
        bytes: input,
        beforeBytes,
        afterBytes: beforeBytes,
        reason: "raster_failed_keep_original",
        durationMs: Date.now() - started
      };
    }

    const pdf = await PDFDocument.create();

    for (const image of raster.images) {
      const jpegBytes = image.bytes;
      if (!jpegBytes?.length) continue;

      const embedded = await pdf.embedJpg(jpegBytes);
      let width = embedded.width;
      let height = embedded.height;
      const edge = Math.max(width, height);

      if (edge > MAX_EDGE_PX) {
        const ratio = MAX_EDGE_PX / edge;
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const page = pdf.addPage([width, height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width,
        height
      });
    }

    if (pdf.getPageCount() < 1) {
      return {
        ok: true,
        compressed: false,
        bytes: input,
        beforeBytes,
        afterBytes: beforeBytes,
        reason: "empty_rebuild_keep_original",
        durationMs: Date.now() - started
      };
    }

    const out = Buffer.from(await pdf.save({ useObjectStreams: true }));
    const afterBytes = out.length;

    // Si la « compression » grossit le fichier, garder l’original
    if (afterBytes >= beforeBytes * 0.98) {
      return {
        ok: true,
        compressed: false,
        bytes: input,
        beforeBytes,
        afterBytes: beforeBytes,
        reason: "no_gain",
        durationMs: Date.now() - started,
        pageCount: raster.pageCount
      };
    }

    return {
      ok: true,
      compressed: true,
      bytes: out,
      beforeBytes,
      afterBytes,
      ratio: afterBytes / beforeBytes,
      pageCount: pdf.getPageCount(),
      durationMs: Date.now() - started,
      reason: "scanned_or_image_heavy"
    };
  } catch (error) {
    return {
      ok: true,
      compressed: false,
      bytes: input,
      beforeBytes,
      afterBytes: beforeBytes,
      reason: "error_keep_original",
      message: String(error?.message || error).slice(0, 240),
      durationMs: Date.now() - started
    };
  }
}
