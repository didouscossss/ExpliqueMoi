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

  /*
   * Pages dont la couche texte est absente ou trop courte,
   * DANS UN PDF QUI A PAR AILLEURS DU TEXTE.
   *
   * Cas réel : une annexe scannée (devis, pièce jointe) collée
   * dans un PDF de convocation par ailleurs entièrement
   * numérique. `page.pdfHasText` ne dit que "ce fichier a du
   * texte quelque part" — pas "toutes ses pages en ont".
   */
  const weakPageNumbers = findWeakTextPageNumbers(page);

  // Couche texte déjà inspectée et exploitable sur TOUTES les pages → pas d’OCR
  if (page.pdfHasText === true && hasUsablePdfText(page) && !weakPageNumbers.length) {
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

  // PDF globalement textuel, mais avec quelques pages sans texte exploitable
  // → OCR ciblé sur ces pages précises seulement, pas sur tout le document.
  if (page.pdfHasText === true && hasUsablePdfText(page) && weakPageNumbers.length) {
    return preparePartialOcrPdfPage(page, weakPageNumbers, ctx, ocrPagesUsed);
  }

  // PDF scanné / sans texte du tout → OCR sur les premières pages (budget global)
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

  const rasterResult = await rasterizeForOcr(bytes, {
    maxPages: remaining
  });

  const ocrResult = await ocrRasterizedImages({
    images: rasterResult.images,
    page,
    ctx,
    ocrPagesUsed
  });

  ocrPagesUsed = ocrResult.ocrPagesUsed;

  if (ocrResult.anyOk) {
    // Ne pas écraser une éventuelle couche texte partielle : fusionner sans dupliquer
    const merged = mergePdfTextAndOcr(page.pdfPageTexts, ocrResult.ocrPageTexts);
    page.pdfPageTexts = merged.pageTexts;
    page.pdfFullText = merged.fullText;
    page.ocrText = merged.fullText;
    page.text = merged.fullText;
    page.pdfScanned = true;
    page.localExtraction = {
      status: "extracted",
      method: "local-ocr",
      uncertain: ocrResult.anyUncertain || merged.hasUncertain,
      pageCount: merged.pageTexts.length
    };
    if (ocrResult.anyUncertain || merged.hasUncertain) {
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

/**
 * OCR ciblé sur un sous-ensemble de pages d'un PDF par ailleurs
 * textuel (ex : quelques pages d'annexe scannée). Ne consomme le
 * budget OCR que pour ces pages précises, jamais pour tout le
 * document — ce qui laisse davantage de budget disponible pour
 * les vrais PDF scannés.
 */
async function preparePartialOcrPdfPage(page, weakPageNumbers, ctx, ocrPagesUsedIn) {
  const { diagnostics, warnings } = ctx;
  let ocrPagesUsed = ocrPagesUsedIn;

  if (!ctx.pathsReady) {
    diagnostics.push({
      step: "pdf_partial_text_layer",
      name: page.name,
      method: "local-pdf-text",
      weakPages: weakPageNumbers,
      ocrSkipped: true,
      reason: "ocr_assets_missing"
    });
    page.localExtraction = {
      status: "extracted",
      method: "local-pdf-text",
      uncertain: true
    };
    return { page, ocrPagesUsed };
  }

  const bytes = pageBytes(page);
  const remaining = Math.max(0, ctx.maxOcrPages - ocrPagesUsed);

  if (!bytes?.length || remaining <= 0) {
    diagnostics.push({
      step: "pdf_partial_text_layer",
      name: page.name,
      method: "local-pdf-text",
      weakPages: weakPageNumbers,
      ocrSkipped: true,
      reason: !bytes?.length ? "pdf_bytes_missing" : "ocr_page_budget_exhausted"
    });
    page.localExtraction = {
      status: "extracted",
      method: "local-pdf-text",
      uncertain: true
    };
    return { page, ocrPagesUsed };
  }

  const targetPages = weakPageNumbers.slice(0, remaining);

  /*
   * `rasterizePdfPages` clamps `onlyPages` to `[1, maxPages]` (it
   * shares the "limit" with the no-onlyPages case). Ces pages
   * faibles peuvent être n'importe où dans un document long
   * (ex : page 63 sur 69) : `maxPages` doit donc couvrir le
   * numéro de page le plus haut demandé, pas juste le nombre de
   * pages qu'on veut OCRiser.
   */
  const rasterResult = await rasterizeForOcr(bytes, {
    maxPages: Math.max(
      Number(page.pdfPageCount) || 0,
      ...targetPages
    ),
    onlyPages: targetPages
  });

  const ocrResult = await ocrRasterizedImages({
    images: rasterResult.images,
    page,
    ctx,
    ocrPagesUsed
  });

  ocrPagesUsed = ocrResult.ocrPagesUsed;

  const merged = mergePdfTextAndOcr(page.pdfPageTexts, ocrResult.ocrPageTexts);
  page.pdfPageTexts = merged.pageTexts;
  page.pdfFullText = merged.fullText;
  page.text = merged.fullText;

  const stillWeak = findWeakTextPageNumbers(page);

  page.localExtraction = {
    status: "extracted",
    method: ocrResult.anyOk ? "local-pdf-text+local-ocr" : "local-pdf-text",
    uncertain: ocrResult.anyUncertain || merged.hasUncertain || stillWeak.length > 0,
    pageCount: merged.pageTexts.length
  };

  diagnostics.push({
    step: "pdf_partial_text_layer",
    name: page.name,
    method: page.localExtraction.method,
    weakPagesBefore: weakPageNumbers,
    weakPagesAfter: stillWeak,
    ocrSkipped: false
  });

  if (ocrResult.anyUncertain || merged.hasUncertain) {
    warnings.push(
      "Certaines pages OCR ont une confiance faible — interprétées avec prudence."
    );
  }

  if (stillWeak.length) {
    warnings.push(
      `${stillWeak.length} page(s) du document n’ont pas pu être lues (ni texte ni OCR exploitable).`
    );
  }

  return { page, ocrPagesUsed };
}

/**
 * Rendu image d'un PDF, dédié à l'OCR (texte de secours désactivé
 * pour forcer le rendu image même si une couche texte partielle
 * existe déjà par ailleurs sur le document).
 */
async function rasterizeForOcr(bytes, { maxPages, onlyPages } = {}) {
  // Copie défensive : pdfjs peut détacher l’ArrayBuffer
  return rasterizePdfPages(new Uint8Array(bytes), {
    maxPages,
    onlyPages,
    scale: 1.5,
    quality: 80,
    pageTexts: [] // forcer rendu image, pas synthèse texte
  });
}

/**
 * Lance l'OCR local sur une liste d'images rasterisées et
 * construit les pageTexts résultants, en respectant le budget
 * OCR global (`ctx.maxOcrPages`).
 */
async function ocrRasterizedImages({ images, page, ctx, ocrPagesUsed }) {
  const { diagnostics, warnings } = ctx;
  const list = Array.isArray(images) ? images : [];
  const ocrPageTexts = [];
  let anyUncertain = false;
  let anyOk = false;
  let used = ocrPagesUsed;

  for (const image of list) {
    if (!image?.bytes?.length) continue;
    if (used >= ctx.maxOcrPages) break;

    const ocr = await ocrImageLocally(image.bytes);
    used += 1;

    diagnostics.push({
      step: "pdf_page_ocr",
      name: page.name,
      pageNumber: image.pageNumber || used,
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

  return { ocrPageTexts, anyUncertain, anyOk, ocrPagesUsed: used };
}

/**
 * Pages dont le texte extrait (pdf.js) est absent ou trop court
 * pour être exploitable, à l'intérieur d'un PDF par ailleurs
 * textuel. Purement structurel : ne regarde que la longueur du
 * texte par page, aucun mot-clé ni type de document.
 */
function findWeakTextPageNumbers(page) {
  const pageTexts = Array.isArray(page.pdfPageTexts) ? page.pdfPageTexts : [];

  if (!pageTexts.length) {
    return [];
  }

  return pageTexts
    .filter(
      (item) =>
        String(item?.text || "").replace(/\s+/g, "").length < MIN_PAGE_TEXT_CHARS
    )
    .map((item) => Number(item?.pageNumber || item?.page || 0))
    .filter((pageNumber) => pageNumber > 0)
    .sort((a, b) => a - b);
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
