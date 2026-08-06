/**
 * Compression PDF côté client (navigateur) pour passer sous la limite Vercel.
 * Node (tests) : délègue à lib/pdfCompression.js + @napi-rs/canvas.
 *
 * Ne touche pas aux PDF déjà sous le seuil SAFE.
 */

import { PDFDocument } from "pdf-lib";
import {
  PDF_COMPRESS_ATTEMPT_BYTES,
  SAFE_UPLOAD_BYTES
} from "./uploadGate.js";

const JPEG_QUALITY = 0.58;
const MAX_EDGE_PX = 1400;
const SCALE = 1.05;

/**
 * @param {Blob|File|Uint8Array|ArrayBuffer} input
 * @param {{ targetBytes?: number, name?: string }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   compressed: boolean,
 *   file: File|null,
 *   beforeBytes: number,
 *   afterBytes: number,
 *   reason: string
 * }>}
 */
export async function compressPdfForUpload(input, options = {}) {
  const bytes = await toUint8Array(input);
  const beforeBytes = bytes.length;
  const targetBytes = Number(options.targetBytes) || SAFE_UPLOAD_BYTES;
  const name = options.name || "document.pdf";

  if (beforeBytes <= 0) {
    return {
      ok: false,
      compressed: false,
      file: null,
      beforeBytes,
      afterBytes: 0,
      reason: "empty"
    };
  }

  if (beforeBytes < PDF_COMPRESS_ATTEMPT_BYTES * 0.85) {
    return {
      ok: true,
      compressed: false,
      file: toFile(bytes, name),
      beforeBytes,
      afterBytes: beforeBytes,
      reason: "below_threshold"
    };
  }

  const textMeta = await detectPdfTextMeta(bytes);
  if (textMeta.textHeavy) {
    // PDF texte dense : la rasterisation dégraderait la qualité sans garantie de gain.
    return {
      ok: true,
      compressed: false,
      file: toFile(bytes, name),
      beforeBytes,
      afterBytes: beforeBytes,
      reason: "skipped_text_pdf"
    };
  }

  try {
    const compressedBytes = await rasterizeAndRebuild(bytes, textMeta);

    if (!compressedBytes || !compressedBytes.length) {
      return {
        ok: true,
        compressed: false,
        file: toFile(bytes, name),
        beforeBytes,
        afterBytes: beforeBytes,
        reason: "raster_failed"
      };
    }

    if (compressedBytes.length >= beforeBytes) {
      return {
        ok: true,
        compressed: false,
        file: toFile(bytes, name),
        beforeBytes,
        afterBytes: beforeBytes,
        reason: "no_gain"
      };
    }

    return {
      ok: true,
      compressed: true,
      file: toFile(compressedBytes, name),
      beforeBytes,
      afterBytes: compressedBytes.length,
      reason:
        compressedBytes.length <= targetBytes
          ? "compressed_under_limit"
          : "compressed_still_large"
    };
  } catch (error) {
    return {
      ok: true,
      compressed: false,
      file: toFile(bytes, name),
      beforeBytes,
      afterBytes: beforeBytes,
      reason: `error:${error?.message || "compress_failed"}`
    };
  }
}

async function detectPdfTextMeta(bytes) {
  if (typeof window === "undefined") {
    try {
      const { inspectPdf } = await import("./pdfProcessing.js");
      const meta = await inspectPdf(Buffer.from(bytes));
      const pageCount = Math.max(1, Number(meta.pageCount) || 1);
      const textLength = Number(meta.textLength) || 0;
      const avg = textLength / pageCount;
      return {
        scanned: meta.scanned === true,
        hasText: meta.hasText === true,
        textLength,
        pageCount,
        textHeavy: meta.hasText && avg >= 200
      };
    } catch {
      return {
        scanned: false,
        hasText: false,
        textLength: 0,
        pageCount: 1,
        textHeavy: false
      };
    }
  }

  // Navigateur : échantillonner le texte via pdf.js
  try {
    const pdfjs = await import("pdfjs-dist");
    const lib = pdfjs.default || pdfjs;
    const loadingTask = lib.getDocument({
      data: bytes.slice(0, Math.min(bytes.length, bytes.length)),
      disableWorker: true,
      useSystemFonts: true
    });
    const pdf = await loadingTask.promise;
    let textLength = 0;
    const sample = Math.min(pdf.numPages, 3);
    for (let i = 1; i <= sample; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      textLength += (content.items || []).reduce(
        (sum, item) => sum + String(item.str || "").length,
        0
      );
    }
    const avg = textLength / Math.max(1, sample);
    return {
      scanned: avg < 40,
      hasText: textLength > 40,
      textLength,
      pageCount: pdf.numPages,
      textHeavy: avg >= 200
    };
  } catch {
    return {
      scanned: true,
      hasText: false,
      textLength: 0,
      pageCount: 1,
      textHeavy: false
    };
  }
}

async function rasterizeAndRebuild(bytes, textMeta = {}) {
  if (typeof window === "undefined") {
    return rasterizeNode(bytes, textMeta);
  }

  return rasterizeBrowser(bytes);
}

async function rasterizeNode(bytes, textMeta = {}) {
  const { compressPdfForAnalysis, shouldCompressPdf } = await import(
    "./pdfCompression.js"
  );
  const { inspectPdf, rasterizePdfPages } = await import("./pdfProcessing.js");
  const { PDFDocument } = await import("pdf-lib");
  const buffer = Buffer.from(bytes);

  let inspectMeta = textMeta;
  try {
    const inspected = await inspectPdf(buffer);
    inspectMeta = {
      scanned: inspected.scanned === true,
      hasText: inspected.hasText === true,
      textLength: Number(inspected.textLength) || 0,
      pageCount: Number(inspected.pageCount) || 1,
      pageTexts: inspected.pageTexts || [],
      textPreview: inspected.textPreview || ""
    };
  } catch {
    // keep textMeta
  }

  const meta = {
    scanned: inspectMeta.scanned === true,
    hasText: inspectMeta.hasText === true,
    textLength: Number(inspectMeta.textLength) || 0,
    pageCount: Number(inspectMeta.pageCount) || 1,
    pageTexts: inspectMeta.pageTexts || []
  };

  if (!shouldCompressPdf(buffer, meta) && !meta.scanned && meta.textLength > 500) {
    return null;
  }

  // 1) Pipeline serveur habituel
  const result = await compressPdfForAnalysis(buffer, meta);
  if (result?.ok && result.compressed && result.bytes) {
    return new Uint8Array(result.bytes);
  }

  // 2) Fallback : rasterize avec pageTexts (évite pages blanches si polices cassées)
  const pageTexts =
    Array.isArray(meta.pageTexts) && meta.pageTexts.length
      ? meta.pageTexts
      : [
          {
            pageNumber: 1,
            text:
              inspectMeta.textPreview ||
              "Document scanné — version compressée pour envoi."
          }
        ];

  const raster = await rasterizePdfPages(buffer, {
    scale: SCALE,
    quality: Math.round(JPEG_QUALITY * 100),
    pageTexts,
    maxPages: meta.pageCount || undefined
  });

  if (!raster?.ok || !(raster.images || []).length) {
    return null;
  }

  const out = await PDFDocument.create();
  for (const image of raster.images) {
    const jpg = await out.embedJpg(image.bytes);
    const page = out.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, {
      x: 0,
      y: 0,
      width: jpg.width,
      height: jpg.height
    });
  }

  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

async function rasterizeBrowser(bytes) {
  const pdfjs = await import("pdfjs-dist");
  const lib = pdfjs.default || pdfjs;

  if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    try {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    } catch {
      // worker optionnel — pdf.js peut tourner sans selon build
    }
  }

  const loadingTask = lib.getDocument({
    data: bytes.slice(),
    disableWorker: true,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const out = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const edge = Math.max(base.width, base.height);
    const scale =
      edge * SCALE > MAX_EDGE_PX
        ? (MAX_EDGE_PX / edge) * SCALE
        : SCALE;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob) {
      continue;
    }

    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const image = await out.embedJpg(jpeg);
    const pdfPage = out.addPage([image.width, image.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height
    });
  }

  if (out.getPageCount() === 0) {
    return null;
  }

  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

async function toUint8Array(input) {
  if (!input) {
    return new Uint8Array();
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(input)) {
    return new Uint8Array(input);
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  return new Uint8Array();
}

function toFile(bytes, name) {
  const buffer =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);

  if (typeof File !== "undefined") {
    return new File([buffer], name, { type: "application/pdf" });
  }

  // Node tests — objet File-like
  const blob =
    typeof Blob !== "undefined"
      ? new Blob([buffer], { type: "application/pdf" })
      : null;

  return {
    name,
    type: "application/pdf",
    size: buffer.length,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ),
    slice: (...args) => (blob ? blob.slice(...args) : buffer),
    _bytes: buffer,
    _blob: blob
  };
}
