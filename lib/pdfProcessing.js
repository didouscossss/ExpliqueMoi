import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const pdfjsPackagePath = dirname(
  require.resolve("pdfjs-dist/package.json")
);

const STANDARD_FONT_DATA_URL = join(
  pdfjsPackagePath,
  "standard_fonts"
) + "/";

const CMAP_URL = join(pdfjsPackagePath, "cmaps") + "/";

const FALLBACK_FONT_CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts/DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
];

let fallbackFontFamily = "sans-serif";

for (const fontPath of FALLBACK_FONT_CANDIDATES) {
  if (existsSync(fontPath)) {
    try {
      GlobalFonts.registerFromPath(fontPath, "ExpliqueMoiFallback");
      fallbackFontFamily = "ExpliqueMoiFallback";
      break;
    } catch {
      // try next
    }
  }
}

/** Soft cap only for runaway docs — NEVER used to refuse a valid PDF under 4 Mo. */
export const MAX_PDF_PAGES_SOFT = 200;
export const RENDER_SCALE = 1.5;
export const JPEG_QUALITY = 72;
export const MIN_TEXT_CHARS = 20;
export const MIN_DARK_PIXELS = 80;

/**
 * Inspect a PDF buffer: page count, selectable text, encryption, corruption.
 * Does not keep the pdf.js document open after return.
 * No user-facing page-count rejection.
 */
export async function inspectPdf(bytes, options = {}) {
  const softCap =
    Number(options.maxPages) > 0
      ? Number(options.maxPages)
      : MAX_PDF_PAGES_SOFT;
  const data = toUint8Array(bytes);

  if (!data.length) {
    return {
      ok: false,
      code: "PDF_CORRUPTED",
      message: "Le fichier PDF est vide.",
      pageCount: 0,
      hasText: false,
      textLength: 0,
      encrypted: false,
      scanned: false,
      textPreview: ""
    };
  }

  if (!looksLikePdf(data)) {
    return {
      ok: false,
      code: "PDF_CORRUPTED",
      message: "Le fichier ne semble pas être un PDF valide.",
      pageCount: 0,
      hasText: false,
      textLength: 0,
      encrypted: false,
      scanned: false,
      textPreview: ""
    };
  }

  let doc = null;

  try {
    // Note: disableWorker:true casse pdfjs sous Node (DataCloneError).
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      password: options.password || ""
    });

    doc = await loadingTask.promise;
    const pageCount = doc.numPages || 0;

    if (pageCount < 1) {
      return {
        ok: false,
        code: "PDF_CORRUPTED",
        message: "Le PDF ne contient aucune page lisible.",
        pageCount: 0,
        hasText: false,
        textLength: 0,
        encrypted: false,
        scanned: false,
        textPreview: ""
      };
    }

    let textLength = 0;
    let textPreview = "";
    const pageTexts = [];
    // Lire toutes les pages (softCap uniquement anti-runaway mémoire)
    const pagesToScan = Math.min(pageCount, softCap);

    for (let i = 1; i <= pagesToScan; i += 1) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        const pageText = (content.items || [])
          .map((item) => (typeof item?.str === "string" ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        pageTexts.push({ pageNumber: i, text: pageText });
        textLength += pageText.length;

        if (!textPreview && pageText) {
          textPreview = pageText.slice(0, 160);
        }
      } finally {
        page.cleanup?.();
      }
    }

    const hasText = textLength >= MIN_TEXT_CHARS;
    const scanned = !hasText;

    return {
      ok: true,
      code: null,
      message: null,
      pageCount,
      hasText,
      textLength,
      encrypted: false,
      scanned,
      textPreview,
      pageTexts,
      fullText: pageTexts
        .map((item) =>
          item.text
            ? `--- Page ${item.pageNumber} ---\n${item.text}`
            : `--- Page ${item.pageNumber} ---\n[aucun texte sélectionnable]`
        )
        .join("\n\n")
    };
  } catch (error) {
    const message = String(error?.message || error || "");
    const name = String(error?.name || "");

    if (
      /password|encrypted|NeedPassword|PasswordException|No password given/i.test(
        `${name} ${message}`
      )
    ) {
      return {
        ok: false,
        code: "PDF_PROTECTED",
        message: "Ce PDF est protégé par un mot de passe.",
        pageCount: 0,
        hasText: false,
        textLength: 0,
        encrypted: true,
        scanned: false,
        textPreview: ""
      };
    }

    return {
      ok: false,
      code: "PDF_CORRUPTED",
      message: "Le fichier semble endommagé.",
      pageCount: 0,
      hasText: false,
      textLength: 0,
      encrypted: false,
      scanned: false,
      textPreview: "",
      detail: message.slice(0, 240)
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

/**
 * Rasterize PDF pages to JPEG buffers in order.
 * If a page renders blank but selectable text exists, synthesize a text image.
 * Returns readable/failed page numbers (1-based).
 */
export async function rasterizePdfPages(bytes, options = {}) {
  const maxPages =
    Number(options.maxPages) > 0
      ? Number(options.maxPages)
      : MAX_PDF_PAGES_SOFT;
  const scale = Number(options.scale) || RENDER_SCALE;
  const quality = Number(options.quality) || JPEG_QUALITY;
  const rotation = normalizeRotation(options.rotation);
  const pageTexts = Array.isArray(options.pageTexts) ? options.pageTexts : [];
  const onlyPages = Array.isArray(options.onlyPages)
    ? options.onlyPages.map(Number).filter((n) => n > 0)
    : null;
  const data = toUint8Array(bytes);

  let doc = null;
  const images = [];
  const readablePages = [];
  const failedPages = [];
  let pageCount = 0;

  try {
    doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      password: options.password || ""
    }).promise;

    pageCount = doc.numPages || 0;
    const limit = Math.min(pageCount, maxPages);
    const pageList = onlyPages?.length
      ? onlyPages.filter((n) => n >= 1 && n <= limit)
      : range(1, limit);

    for (const pageNumber of pageList) {
      let page = null;
      let canvas = null;
      const pageText =
        pageTexts.find((item) => item.pageNumber === pageNumber)?.text || "";

      try {
        page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({
          scale,
          rotation
        });

        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));

        // Cap very large canvases to stay within serverless memory
        const maxEdge = 1600;
        const edgeScale = Math.min(1, maxEdge / Math.max(width, height));
        const finalViewport =
          edgeScale < 1
            ? page.getViewport({
                scale: scale * edgeScale,
                rotation
              })
            : viewport;

        const finalWidth = Math.max(1, Math.ceil(finalViewport.width));
        const finalHeight = Math.max(1, Math.ceil(finalViewport.height));

        canvas = createCanvas(finalWidth, finalHeight);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, finalWidth, finalHeight);

        // Silence noisy font warnings for standard Helvetica PDFs
        const originalWarn = console.warn;
        console.warn = () => {};

        try {
          await page.render({
            canvasContext: ctx,
            viewport: finalViewport
          }).promise;
        } finally {
          console.warn = originalWarn;
        }

        let jpeg = canvas.toBuffer("image/jpeg", quality);
        let source = "raster";

        if (!jpeg?.length || countDarkPixels(ctx, finalWidth, finalHeight) < MIN_DARK_PIXELS) {
          if (pageText && pageText.length >= 8) {
            const synthesized = renderTextPageImage(pageText, pageNumber, quality);
            jpeg = synthesized.bytes;
            source = "text_image";
          } else if (!jpeg?.length) {
            failedPages.push(pageNumber);
            continue;
          } else if (!pageText) {
            // Keep sparse scan image if any ink exists; otherwise fail
            if (countDarkPixels(ctx, finalWidth, finalHeight) < 10) {
              failedPages.push(pageNumber);
              continue;
            }
          }
        }

        images.push({
          pageNumber,
          mimeType: "image/jpeg",
          bytes: jpeg,
          size: jpeg.length,
          width: finalWidth,
          height: finalHeight,
          source
        });
        readablePages.push(pageNumber);
      } catch {
        if (pageText && pageText.length >= 8) {
          const synthesized = renderTextPageImage(pageText, pageNumber, quality);
          images.push({
            pageNumber,
            mimeType: "image/jpeg",
            bytes: synthesized.bytes,
            size: synthesized.bytes.length,
            width: synthesized.width,
            height: synthesized.height,
            source: "text_image"
          });
          readablePages.push(pageNumber);
        } else {
          failedPages.push(pageNumber);
        }
      } finally {
        try {
          page?.cleanup?.();
        } catch {
          // ignore
        }

        canvas = null;
        page = null;
      }
    }

    return {
      ok: images.length > 0,
      pageCount,
      images,
      readablePages,
      failedPages
    };
  } catch (error) {
    const message = String(error?.message || error || "");

    if (/password|encrypted|NeedPassword|PasswordException|No password given/i.test(message)) {
      return {
        ok: false,
        pageCount,
        images: [],
        readablePages: [],
        failedPages: [],
        code: "PDF_PROTECTED",
        message: "Ce PDF est protégé par un mot de passe."
      };
    }

    // Last resort: synthesize images from provided texts
    if (pageTexts.some((item) => item.text && item.text.length >= 8)) {
      for (const item of pageTexts.slice(0, maxPages)) {
        if (!item.text || item.text.length < 8) {
          failedPages.push(item.pageNumber);
          continue;
        }

        const synthesized = renderTextPageImage(
          item.text,
          item.pageNumber,
          quality
        );
        images.push({
          pageNumber: item.pageNumber,
          mimeType: "image/jpeg",
          bytes: synthesized.bytes,
          size: synthesized.bytes.length,
          width: synthesized.width,
          height: synthesized.height,
          source: "text_image"
        });
        readablePages.push(item.pageNumber);
      }

      if (images.length) {
        return {
          ok: true,
          pageCount: pageTexts.length,
          images,
          readablePages,
          failedPages
        };
      }
    }

    return {
      ok: false,
      pageCount,
      images: [],
      readablePages: [],
      failedPages: [],
      code: "PDF_CORRUPTED",
      message: "Le PDF n’a pas pu être converti en images.",
      detail: message.slice(0, 240)
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

function renderTextPageImage(text, pageNumber, quality = JPEG_QUALITY) {
  const width = 900;
  const height = 1200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111111";
  ctx.font = `20px ${fallbackFontFamily}`;
  ctx.fillText(`Page ${pageNumber}`, 48, 48);

  const lines = wrapText(String(text || ""), 72);
  let y = 96;

  for (const line of lines) {
    if (y > height - 48) {
      break;
    }

    ctx.fillText(line, 48, y);
    y += 28;
  }

  const bytes = canvas.toBuffer("image/jpeg", quality);

  return { bytes, width, height };
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars) {
      if (current) {
        lines.push(current);
      }

      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function countDarkPixels(ctx, width, height) {
  const sample = ctx.getImageData(0, 0, width, height).data;
  let dark = 0;

  // Stride sampling for speed
  for (let i = 0; i < sample.length; i += 32) {
    if (sample[i] < 235 || sample[i + 1] < 235 || sample[i + 2] < 235) {
      dark += 1;
    }
  }

  return dark;
}

function looksLikePdf(data) {
  if (!data || data.length < 5) {
    return false;
  }

  // %PDF-
  return (
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46
  );
}

function toUint8Array(bytes) {
  // Buffer extends Uint8Array in Node — test Buffer first.
  // pdfjs refuses Buffer and requires a pure Uint8Array.
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) {
    return Uint8Array.from(bytes);
  }

  if (bytes instanceof Uint8Array) {
    return bytes;
  }

  return Uint8Array.from(bytes || []);
}

function normalizeRotation(value) {
  const number = Number(value) || 0;
  const normalized = ((number % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

/** @deprecated use MAX_PDF_PAGES_SOFT — kept so older imports do not crash */
export const MAX_PDF_PAGES = MAX_PDF_PAGES_SOFT;

