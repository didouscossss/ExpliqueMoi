/**
 * Adaptateurs extraction existante → entrée V4.
 * Ne réimplémente pas PDF.js / OCR — transforme seulement les sorties.
 */

import type { TextBlock, TextSource } from "../types/textBlock.js";
import type { BoundingBox } from "../types/geometry.js";

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionLike {
  pageTexts?: PdfPageText[];
  fullText?: string;
  hasText?: boolean;
  scanned?: boolean;
  pageCount?: number;
}

/** Item OCR/pdf.js générique (si bbox disponible). */
export interface ExtractionItemLike {
  text: string;
  page?: number;
  pageNumber?: number;
  bbox?: Partial<BoundingBox> | null;
  blockId?: string | null;
  lineId?: string | null;
  source?: TextSource;
}

export interface OcrResultLike {
  text?: string;
  fullText?: string;
  pages?: Array<{ pageNumber?: number; page?: number; text?: string }>;
  items?: ExtractionItemLike[];
  blocks?: ExtractionItemLike[];
  source?: TextSource;
}

export interface AnalyzePageLike {
  mimeType?: string;
  name?: string;
  order?: number;
  pdfPageTexts?: PdfPageText[];
  pdfFullText?: string;
  pdfHasText?: boolean;
  pdfScanned?: boolean;
  pdfPageCount?: number;
}

export interface V4AdapterResult {
  blocks: TextBlock[];
  text: string;
  source: TextSource;
  extractionQuality: "full" | "partial" | "empty";
  pageCount: number;
  diagnostics: Array<Record<string, unknown>>;
}

function asBbox(raw: ExtractionItemLike["bbox"]): BoundingBox | null {
  if (!raw || typeof raw !== "object") return null;
  const x = Number((raw as BoundingBox).x);
  const y = Number((raw as BoundingBox).y);
  const width = Number(
    (raw as BoundingBox).width ?? (raw as { w?: number }).w
  );
  const height = Number(
    (raw as BoundingBox).height ?? (raw as { h?: number }).h
  );
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}

/** Découpe un texte plat en blocs ligne à ligne (provenance préservée). */
export function textToV4Blocks(
  text: string,
  options: { page?: number; source?: TextSource; idPrefix?: string } = {}
): TextBlock[] {
  const page = options.page ?? 1;
  const source = options.source ?? "text";
  const prefix = options.idPrefix ?? `p${page}`;
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: TextBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!String(line).trim()) continue;
    blocks.push({
      id: `${prefix}_line_${i + 1}`,
      text: line,
      page,
      lineId: `${prefix}_L${i + 1}`,
      blockId: `${prefix}_B${i + 1}`,
      source,
      bbox: null
    });
  }
  return blocks;
}

/** PDF inspect (pageTexts) → TextBlocks, une ligne ≈ un block. */
export function pdfExtractionToV4Blocks(
  extraction: PdfExtractionLike,
  options: { source?: TextSource } = {}
): V4AdapterResult {
  const source = options.source ?? "pdfjs";
  const diagnostics: Array<Record<string, unknown>> = [];
  const pageTexts = Array.isArray(extraction.pageTexts)
    ? extraction.pageTexts
    : [];
  const blocks: TextBlock[] = [];

  for (const page of pageTexts) {
    const pageNumber = Number(page.pageNumber) || 1;
    const pageBlocks = textToV4Blocks(page.text || "", {
      page: pageNumber,
      source,
      idPrefix: `pdf_p${pageNumber}`
    });
    blocks.push(...pageBlocks);
  }

  if (!blocks.length && extraction.fullText) {
    const cleaned = String(extraction.fullText)
      .replace(/^--- Page \d+ ---\n/gm, "")
      .replace(/\[aucun texte sélectionnable\]/g, "");
    blocks.push(
      ...textToV4Blocks(cleaned, { page: 1, source, idPrefix: "pdf_full" })
    );
    diagnostics.push({ step: "adapter", note: "fallback_fullText" });
  }

  const text = blocks.map((b) => b.text).join("\n");
  const chars = text.replace(/\s+/g, "").length;
  const extractionQuality =
    chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty";

  diagnostics.push({
    step: "pdfExtractionToV4Blocks",
    pages: pageTexts.length,
    blocks: blocks.length,
    chars,
    extractionQuality,
    scanned: extraction.scanned === true
  });

  return {
    blocks,
    text,
    source,
    extractionQuality,
    pageCount: extraction.pageCount || pageTexts.length || 1,
    diagnostics
  };
}

/** OCRResult-like → entrée V4 (items avec bbox prioritaires). */
export function ocrResultToV4Input(ocr: OcrResultLike): V4AdapterResult {
  const source: TextSource = ocr.source || "ocr";
  const diagnostics: Array<Record<string, unknown>> = [];
  const items = [
    ...(Array.isArray(ocr.blocks) ? ocr.blocks : []),
    ...(Array.isArray(ocr.items) ? ocr.items : [])
  ];

  if (items.length) {
    const blocks: TextBlock[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const text = String(item.text || "").trim();
      if (!text) continue;
      const page = Number(item.pageNumber ?? item.page) || 1;
      blocks.push({
        id: item.blockId || `ocr_${page}_${i + 1}`,
        text,
        page,
        bbox: asBbox(item.bbox),
        lineId: item.lineId ?? `ocr_L${i + 1}`,
        blockId: item.blockId ?? `ocr_B${i + 1}`,
        source: item.source || source
      });
    }

    const text = blocks.map((b) => b.text).join("\n");
    const chars = text.replace(/\s+/g, "").length;
    return {
      blocks,
      text,
      source,
      extractionQuality: chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty",
      pageCount: Math.max(1, ...blocks.map((b) => b.page), 1),
      diagnostics: [
        ...diagnostics,
        { step: "ocrResultToV4Input", mode: "items", blocks: blocks.length }
      ]
    };
  }

  if (Array.isArray(ocr.pages) && ocr.pages.length) {
    const merged: PdfPageText[] = ocr.pages.map((p, i) => ({
      pageNumber: Number(p.pageNumber ?? p.page) || i + 1,
      text: String(p.text || "")
    }));
    return pdfExtractionToV4Blocks(
      { pageTexts: merged, fullText: ocr.fullText || ocr.text },
      { source }
    );
  }

  const plain = String(ocr.fullText || ocr.text || "");
  const blocks = textToV4Blocks(plain, { source, idPrefix: "ocr" });
  const chars = plain.replace(/\s+/g, "").length;
  return {
    blocks,
    text: blocks.map((b) => b.text).join("\n"),
    source,
    extractionQuality: chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty",
    pageCount: 1,
    diagnostics: [
      ...diagnostics,
      { step: "ocrResultToV4Input", mode: "plain", chars }
    ]
  };
}

/**
 * Agrège pages upload (PDF inspectés + texte collé) → entrée V4.
 * Images sans OCR local : uniquement le texte collé éventuel.
 */
export function pagesToV4Input(input: {
  pages?: AnalyzePageLike[];
  pastedText?: string;
}): V4AdapterResult {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const diagnostics: Array<Record<string, unknown>> = [];
  const blocks: TextBlock[] = [];
  let pageOffset = 0;

  for (const page of pages) {
    if (page.mimeType === "application/pdf") {
      const adapted = pdfExtractionToV4Blocks(
        {
          pageTexts: page.pdfPageTexts,
          fullText: page.pdfFullText,
          hasText: page.pdfHasText,
          scanned: page.pdfScanned,
          pageCount: page.pdfPageCount
        },
        { source: "pdfjs" }
      );
      // Remapper les pages si plusieurs PDF dans le lot
      for (const b of adapted.blocks) {
        blocks.push({
          ...b,
          page: b.page + pageOffset,
          id: `u${page.order ?? pageOffset}_${b.id}`
        });
      }
      pageOffset += page.pdfPageCount || adapted.pageCount || 1;
      diagnostics.push(...adapted.diagnostics);
    } else {
      // Photo / image : pas de nouvel OCR ici
      pageOffset += 1;
      diagnostics.push({
        step: "pagesToV4Input",
        note: "image_without_local_ocr",
        name: page.name,
        mimeType: page.mimeType
      });
    }
  }

  const pasted = String(input.pastedText || "").trim();
  if (pasted) {
    blocks.push(
      ...textToV4Blocks(pasted, {
        page: Math.max(1, pageOffset || 1),
        source: "text",
        idPrefix: "paste"
      })
    );
    diagnostics.push({ step: "pagesToV4Input", note: "pasted_text", chars: pasted.length });
  }

  const text = blocks.map((b) => b.text).join("\n");
  const chars = text.replace(/\s+/g, "").length;

  return {
    blocks,
    text,
    source: blocks.some((b) => b.source === "pdfjs")
      ? "pdfjs"
      : blocks.some((b) => b.source === "ocr")
        ? "ocr"
        : "text",
    extractionQuality: chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty",
    pageCount: Math.max(pageOffset, 1),
    diagnostics
  };
}
