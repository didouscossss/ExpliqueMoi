/**
 * Prépare les pages analyze pour Didou :
 * - PDF avec couche texte → conserve le texte, PAS d’OCR
 * - PDF scanné → raster + OCR local (multipage, plafond raisonnable)
 * - image/photo → OCR local
 *
 * Aucun Gemini / OpenAI / CDN.
 */

import { rasterizePdfPages } from "../../pdfProcessing.js";
import { ocrImageLocally, MIN_OCR_CONFIDENCE } from "./ocrImageLocally.js";
import { getLocalOcrPaths } from "./ocrPaths.js";

/** Plafond OCR pages — documents volumineux. */
export const MAX_OCR_PAGES = 8;
/** Seuil caractères page pour considérer la couche texte exploitable. */
export const MIN_PAGE_TEXT_CHARS = 20;

/**
 * @param {Array<object>} pages — pages api/analyze
 * @param {{ maxOcrPages?: number }} [options]
 * @returns {Promise<{ pages: object[], diagnostics: object[], warnings: string[] }>}
 */
export async function preparePagesWithLocalOcr(pages, options = {}) {
  const maxOcrPages = Number(options.maxOcrPages) > 0
    ? Number(options.maxOcrPages)
    : MAX_OCR_PAGES;
  const list = Array.isArray(pages) ? pages : [];
  const out = [];
  const diagnostics = [];
  const warnings = [];
  let ocrPagesUsed = 0;

  const paths = getLocalOcrPaths();
  diagnostics.push({
    step: "ocr_assets",
    ready: paths.ready,
    missing: paths.missing
  });

  for (const page of list) {
    const mime = String(page.mimeType || "");
    const copy = { ...page };

    if (mime === "application/pdf") {
      const prepared = await preparePdfPage(copy, {
        maxOcrPages,
        ocrPagesUsed,
        pathsReady: paths.ready,
        diagnostics,
        warnings
      });
      ocrPagesUsed = prepared.ocrPagesUsed;
      out.push(prepared.page);
      continue;
    }

    if (mime.startsWith("image/")) {
      const prepared = await prepareImagePage(copy, {
        maxOcrPages,
        ocrPagesUsed,
        pathsReady: paths.ready,
        diagnostics,
        warnings
      });
      ocrPagesUsed = prepared.ocrPagesUsed;
      out.push(prepared.page);
      continue;
    }

    out.push(copy);
  }

  if (ocrPagesUsed >= maxOcrPages) {
    warnings.push(
      `OCR limité aux ${maxOcrPages} premières pages scannées pour rester fiable et rapide.`
    );
  }

  return { pages: out, diagnostics, warnings };
}

async function preparePdfPage(page, ctx) {
  const { diagnostics, warnings } = ctx;
  let ocrPagesUsed = ctx.ocrPagesUsed;

  // Couche texte déjà inspectée et exploitable → pas d’OCR
  if (page.pdfHasText === true && hasUsablePdfText(page)) {
    diagnostics.push({
      step: "pdf_text_layer",
      name: page.name,
      method: "local-pdf-text",
      pageCount: page.pdfPageCount || page.pdfPageTexts?.length || 1,
      ocrSkipped: true
    });
    page.localExtraction = {
      status: "extracted",
      method: "local-pdf-text",
      uncertain: false
    };
    return { page, ocrPagesUsed };
  }

  // PDF scanné / sans texte → OCR
  if (!ctx.pathsReady) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "ocr_assets_missing"
    };
    warnings.push(
      "OCR local indisponible (assets manquants) — le PDF scanné n’a pas pu être lu."
    );
    return { page, ocrPagesUsed };
  }

  const bytes = pageBytes(page);
  if (!bytes?.length) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "pdf_bytes_missing"
    };
    return { page, ocrPagesUsed };
  }

  const remaining = Math.max(0, ctx.maxOcrPages - ocrPagesUsed);
  if (remaining <= 0) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "ocr_page_budget_exhausted"
    };
    return { page, ocrPagesUsed };
  }

  // Copie défensive : pdfjs peut détacher l’ArrayBuffer
  const raster = await rasterizePdfPages(new Uint8Array(bytes), {
    maxPages: remaining,
    scale: 1.5,
    quality: 80,
    pageTexts: [] // forcer rendu image, pas synthèse texte
  });

  const images = Array.isArray(raster.images) ? raster.images : [];
  const ocrPageTexts = [];
  let anyUncertain = false;
  let anyOk = false;

  for (const image of images) {
    if (!image?.bytes?.length) continue;
    if (ocrPagesUsed >= ctx.maxOcrPages) break;

    const ocr = await ocrImageLocally(image.bytes);
    ocrPagesUsed += 1;

    diagnostics.push({
      step: "pdf_page_ocr",
      name: page.name,
      pageNumber: image.pageNumber || ocrPagesUsed,
      ok: ocr.ok,
      confidence: ocr.confidence,
      uncertain: Boolean(ocr.uncertain || ocr.error === "ocr_low_confidence"),
      error: ocr.error || null,
      fetchCount: ocr.fetchCount,
      chars: ocr.text ? ocr.text.replace(/\s+/g, "").length : 0
    });

    if (ocr.fetchCount > 0) {
      warnings.push("Tentative réseau bloquée pendant l’OCR local.");
    }

    if (ocr.ok && ocr.text) {
      anyOk = true;
      if (ocr.uncertain) anyUncertain = true;
      ocrPageTexts.push({
        pageNumber: Number(image.pageNumber || ocrPageTexts.length + 1),
        text: ocr.text,
        confidence: ocr.confidence,
        uncertain: Boolean(ocr.uncertain)
      });
    }
  }

  if (anyOk) {
    // Ne pas écraser une éventuelle couche texte partielle : fusionner sans dupliquer
    const merged = mergePdfTextAndOcr(page.pdfPageTexts, ocrPageTexts);
    page.pdfPageTexts = merged.pageTexts;
    page.pdfFullText = merged.fullText;
    page.ocrText = merged.fullText;
    page.text = merged.fullText;
    page.pdfScanned = true;
    page.localExtraction = {
      status: "extracted",
      method: "local-ocr",
      uncertain: anyUncertain || merged.hasUncertain,
      pageCount: merged.pageTexts.length
    };
    if (anyUncertain || merged.hasUncertain) {
      warnings.push(
        "Certaines pages OCR ont une confiance faible — interprétées avec prudence."
      );
    }
  } else {
    page.localExtraction = {
      status: "needsExtraction",
      method: "local-ocr",
      error: "ocr_no_usable_pages"
    };
  }

  return { page, ocrPagesUsed };
}

async function prepareImagePage(page, ctx) {
  const { diagnostics, warnings } = ctx;
  let ocrPagesUsed = ctx.ocrPagesUsed;

  // Texte OCR déjà présent → ne pas relancer
  const existing = String(page.ocrText || page.text || "").trim();
  if (existing.replace(/\s+/g, "").length >= MIN_PAGE_TEXT_CHARS) {
    diagnostics.push({
      step: "image_text_reuse",
      name: page.name,
      method: "reuse",
      ocrSkipped: true
    });
    page.localExtraction = {
      status: "extracted",
      method: page.localExtraction?.method || "local-ocr",
      uncertain: Boolean(page.localExtraction?.uncertain)
    };
    return { page, ocrPagesUsed };
  }

  if (!ctx.pathsReady) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "ocr_assets_missing"
    };
    warnings.push("OCR local indisponible (assets manquants) pour l’image.");
    return { page, ocrPagesUsed };
  }

  if (ocrPagesUsed >= ctx.maxOcrPages) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "ocr_page_budget_exhausted"
    };
    return { page, ocrPagesUsed };
  }

  const bytes = pageBytes(page);
  if (!bytes?.length) {
    page.localExtraction = {
      status: "needsExtraction",
      method: "none",
      error: "image_bytes_missing"
    };
    return { page, ocrPagesUsed };
  }

  const ocr = await ocrImageLocally(bytes);
  ocrPagesUsed += 1;

  diagnostics.push({
    step: "image_ocr",
    name: page.name,
    ok: ocr.ok,
    confidence: ocr.confidence,
    uncertain: Boolean(ocr.uncertain || ocr.error === "ocr_low_confidence"),
    error: ocr.error || null,
    fetchCount: ocr.fetchCount,
    chars: ocr.text ? ocr.text.replace(/\s+/g, "").length : 0
  });

  if (ocr.fetchCount > 0) {
    warnings.push("Tentative réseau bloquée pendant l’OCR local.");
  }

  if (ocr.ok && ocr.text) {
    page.ocrText = ocr.text;
    page.text = ocr.text;
    page.localExtraction = {
      status: "extracted",
      method: "local-ocr",
      uncertain: Boolean(ocr.uncertain),
      confidence: ocr.confidence
    };
    if (ocr.uncertain || (ocr.confidence != null && ocr.confidence < MIN_OCR_CONFIDENCE)) {
      warnings.push(
        "Texte OCR de confiance faible — Didou ne le traitera pas comme un fait certain."
      );
    }
  } else {
    page.localExtraction = {
      status: "needsExtraction",
      method: "local-ocr",
      error: ocr.error || "ocr_failed",
      confidence: ocr.confidence
    };
  }

  return { page, ocrPagesUsed };
}

function hasUsablePdfText(page) {
  const full = String(page.pdfFullText || "").replace(/\s+/g, "").length;
  if (full >= MIN_PAGE_TEXT_CHARS) return true;
  const pages = Array.isArray(page.pdfPageTexts) ? page.pdfPageTexts : [];
  return pages.some(
    (p) => String(p?.text || "").replace(/\s+/g, "").length >= MIN_PAGE_TEXT_CHARS
  );
}

/**
 * Fusionne texte PDF existant et OCR sans dupliquer une page déjà textuelle.
 */
function mergePdfTextAndOcr(existingPageTexts, ocrPageTexts) {
  const byPage = new Map();
  let hasUncertain = false;

  for (const item of existingPageTexts || []) {
    const pageNumber = Number(item.pageNumber || item.page || 0);
    const text = String(item.text || "").trim();
    if (!pageNumber || !text) continue;
    byPage.set(pageNumber, {
      pageNumber,
      text,
      source: "pdf-text",
      uncertain: false
    });
  }

  for (const item of ocrPageTexts || []) {
    const pageNumber = Number(item.pageNumber || 0);
    if (!pageNumber) continue;
    const existing = byPage.get(pageNumber);
    const existingChars = String(existing?.text || "").replace(/\s+/g, "").length;
    // Ne pas écraser une couche texte déjà correcte
    if (existing && existingChars >= MIN_PAGE_TEXT_CHARS) {
      continue;
    }
    if (item.uncertain) hasUncertain = true;
    byPage.set(pageNumber, {
      pageNumber,
      text: String(item.text || "").trim(),
      source: "local-ocr",
      uncertain: Boolean(item.uncertain),
      confidence: item.confidence ?? null
    });
  }

  const pageTexts = [...byPage.values()].sort(
    (a, b) => a.pageNumber - b.pageNumber
  );
  const fullText = pageTexts.map((p) => p.text).filter(Boolean).join("\n\n");

  return { pageTexts, fullText, hasUncertain };
}

function pageBytes(page) {
  if (page?.bytes && page.bytes.length) {
    return page.bytes instanceof Uint8Array
      ? page.bytes
      : Uint8Array.from(page.bytes);
  }
  if (page?.base64) {
    return Buffer.from(page.base64, "base64");
  }
  return null;
}
