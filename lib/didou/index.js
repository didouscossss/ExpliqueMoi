/**
 * Didou — moteur local de compréhension documentaire (parcours gratuit).
 * Aucun appel Gemini / OpenAI.
 */

import { runDidouPipeline } from "./pipeline.js";
import { didouResultToPreviewAnalysis } from "./mapToPreview.js";
import { emptyDidouResult, DIDOU_ENGINE, DIDOU_VERSION } from "./types.js";

export {
  runDidouPipeline,
  didouResultToPreviewAnalysis,
  emptyDidouResult,
  DIDOU_ENGINE,
  DIDOU_VERSION
};

/**
 * Point d’entrée standard pour /api/analyze.
 * @param {{
 *   pastedText?: string,
 *   pages?: Array<object>,
 *   fileName?: string|null,
 *   heterogeneous?: boolean
 * }} input
 */
export function analyzeDocumentWithDidou(input = {}) {
  const pages = buildPagesFromAnalyzeInput(input);
  const text = String(input.pastedText || input.text || "").trim();

  const didou = runDidouPipeline({
    text,
    pastedText: text,
    pages,
    fileName: input.fileName || pages[0]?.name || null
  });

  if (input.heterogeneous) {
    didou.warnings = [
      ...(didou.warnings || []),
      "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément."
    ];
  }

  const preview = didouResultToPreviewAnalysis(didou);
  return {
    didou,
    preview,
    ok: true,
    engine: DIDOU_ENGINE
  };
}

function buildPagesFromAnalyzeInput(input) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const out = [];

  for (const page of pages) {
    const mime = String(page.mimeType || "");
    if (mime === "application/pdf") {
      if (Array.isArray(page.pdfPageTexts) && page.pdfPageTexts.length) {
        for (const item of page.pdfPageTexts) {
          const pageText = String(item?.text || "").trim();
          if (pageText) {
            out.push({
              page: Number(item.pageNumber || item.page || out.length + 1),
              text: pageText,
              name: page.name || null
            });
          }
        }
      } else if (page.pdfFullText) {
        out.push({
          page: 1,
          text: String(page.pdfFullText),
          name: page.name || null
        });
      }
      continue;
    }

    // Image : texte OCR éventuel déjà collé dans page.text / ocrText
    const imageText = String(page.ocrText || page.text || page.content || "").trim();
    if (imageText) {
      out.push({
        page: Number(page.order ?? out.length) + 1,
        text: imageText,
        name: page.name || null
      });
    }
  }

  return out;
}
