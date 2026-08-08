/**
 * Helpers PDF internes V3 (pdfjs + canvas).
 * Aucun import depuis les modules métier V2.
 */

import { createRequire } from "module";
import { dirname, join } from "path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const pdfjsPackagePath = dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONT_DATA_URL = join(pdfjsPackagePath, "standard_fonts") + "/";
const CMAP_URL = join(pdfjsPackagePath, "cmaps") + "/";

/** Seuil : en dessous, le PDF est traité comme scanné. */
export const MIN_SELECTABLE_TEXT_CHARS = 20;

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfTextExtraction {
  pageCount: number;
  pages: PdfPageText[];
  fullText: string;
  textLength: number;
}

export function toUint8Array(source: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  // Copie propriétaire : pdfjs peut détacher le ArrayBuffer source.
  // Buffer est refusé par pdfjs → Uint8Array pur obligatoire.
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source.slice(0));
  }
  const view =
    typeof Buffer !== "undefined" && Buffer.isBuffer(source)
      ? source
      : source instanceof Uint8Array
        ? source
        : new Uint8Array(source as ArrayBufferLike);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) {
    return false;
  }
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function looksLikeImage(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

async function loadPdfDocument(bytes: Uint8Array) {
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true
  });
  return loadingTask.promise;
}

export async function extractSelectableText(
  source: Uint8Array | ArrayBuffer | Buffer
): Promise<PdfTextExtraction> {
  const bytes = toUint8Array(source);
  if (!looksLikePdf(bytes)) {
    throw new Error("extractSelectableText: fichier PDF invalide.");
  }

  let doc: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;

  try {
    doc = await loadPdfDocument(bytes);
    const pageCount = doc.numPages || 0;
    const pages: PdfPageText[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? String(item.str || "") : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ pageNumber, text });
      try {
        page.cleanup?.();
      } catch {
        // ignore
      }
    }

    const fullText = pages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return {
      pageCount,
      pages,
      fullText,
      textLength: fullText.replace(/\s+/g, "").length
    };
  } finally {
    try {
      await doc?.destroy?.();
    } catch {
      // ignore
    }
    doc = null;
  }
}

export async function rasterizePdfPage(
  source: Uint8Array | ArrayBuffer | Buffer,
  pageNumber: number,
  options: { scale?: number } = {}
): Promise<Buffer> {
  const bytes = toUint8Array(source);
  const scale = Number(options.scale) > 0 ? Number(options.scale) : 2;
  let doc: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;

  try {
    doc = await loadPdfDocument(bytes);
    if (pageNumber < 1 || pageNumber > (doc.numPages || 0)) {
      throw new Error(`Page PDF invalide: ${pageNumber}`);
    }

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height))
    );
    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise;

    const png = canvas.toBuffer("image/png");

    try {
      page.cleanup?.();
    } catch {
      // ignore
    }

    canvas.width = 0;
    canvas.height = 0;

    return png;
  } finally {
    try {
      await doc?.destroy?.();
    } catch {
      // ignore
    }
    doc = null;
  }
}
