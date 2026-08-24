/**
 * Didou — moteur local de compréhension documentaire (parcours gratuit).
 * Aucun appel Gemini / OpenAI.
 */

import { runDidouPipeline } from "./pipeline.js";
import { didouResultToPreviewAnalysis } from "./mapToPreview.js";
import { emptyDidouResult, DIDOU_ENGINE, DIDOU_VERSION } from "./types.js";
import { preparePagesWithLocalOcr } from "./ocr/index.js";

export {
  runDidouPipeline,
  didouResultToPreviewAnalysis,
  emptyDidouResult,
  DIDOU_ENGINE,
  DIDOU_VERSION,
  preparePagesWithLocalOcr
};

/**
 * Point d’entrée standard pour /api/analyze.
 * @param {{
 *   pastedText?: string,
 *   pages?: Array<object>,
 *   fileName?: string|null,
 *   heterogeneous?: boolean,
 *   ocrWarnings?: string[],
 *   ocrDiagnostics?: object[]
 * }} input
 */
export function analyzeDocumentWithDidou(input = {}) {
  const built = buildPagesFromAnalyzeInput(input);
  const text = String(input.pastedText || input.text || "").trim();

  const didou = runDidouPipeline({
    text,
    pastedText: text,
    pages: built.pages,
    fileName: input.fileName || built.pages[0]?.name || null
  });

  // Provenance OCR / extraction
  didou.meta = {
    ...(didou.meta || {}),
    extractionMethods: built.methods,
    ocrUncertain: built.ocrUncertain,
    pageProvenance: built.provenance
  };

  if (built.ocrUncertain) {
    didou.uncertainties = [
      ...(didou.uncertainties || []),
      "Le texte provient en partie d’un OCR de confiance limitée — les faits affichés restent prudents."
    ];
    // Ne pas sur-affirmer si OCR faible
    if (didou.understandingLevel === "strong") {
      didou.understandingLevel = "probable";
      didou.confidence = Math.min(didou.confidence || 0, 75);
    }
  }

  if (input.heterogeneous) {
    didou.warnings = [
      ...(didou.warnings || []),
      "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément."
    ];
  }

  for (const warning of input.ocrWarnings || []) {
    if (warning && !(didou.warnings || []).includes(warning)) {
      didou.warnings = [...(didou.warnings || []), warning];
    }
  }

  // Evidence : rattacher le numéro de page quand possible
  if (Array.isArray(didou.evidence)) {
    didou.evidence = didou.evidence.map((item) => {
      if (item?.page && item.page !== "Page ?") return item;
      const hit = built.provenance.find((p) =>
        item?.quote && p.text.includes(String(item.quote).slice(0, 40))
      );
      return hit
        ? { ...item, page: `Page ${hit.page}` }
        : item;
    });
  }

  const preview = didouResultToPreviewAnalysis(didou);
  return {
    didou,
    preview,
    ok: true,
    engine: DIDOU_ENGINE,
    ocrDiagnostics: input.ocrDiagnostics || []
  };
}

/**
 * Variante async : OCR local puis Didou (utilisée par /api/analyze).
 */
export async function analyzeDocumentWithDidouAsync(input = {}) {
  const prepared = await preparePagesWithLocalOcr(input.pages || [], {
    maxOcrPages: input.maxOcrPages
  });

  return analyzeDocumentWithDidou({
    ...input,
    pages: prepared.pages,
    ocrWarnings: prepared.warnings,
    ocrDiagnostics: prepared.diagnostics
  });
}

function buildPagesFromAnalyzeInput(input) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const out = [];
  const methods = new Set();
  const provenance = [];
  let ocrUncertain = false;

  for (const page of pages) {
    const mime = String(page.mimeType || "");
    const method = page.localExtraction?.method || null;
    if (method) methods.add(method);
    if (page.localExtraction?.uncertain) ocrUncertain = true;

    if (mime === "application/pdf") {
      if (Array.isArray(page.pdfPageTexts) && page.pdfPageTexts.length) {
       
       console.log(
  "[DIDOU INPUT PDFPAGETEXTS]",
  page.pdfPageTexts
    .slice(0, 15)
    .map((item, index) => ({
      index,
      pageNumber: item?.pageNumber,
      page: item?.page,
      detectedPrintedPage:
        String(item?.text || "")
          .match(/Page\s+(\d+)\s*\/\s*58/i)?.[1] ||
        null
    }))
);
        for (const item of page.pdfPageTexts) {
          const pageText = String(item?.text || "").trim();
          if (pageText) {
            const pageNo = Number(item.pageNumber || item.page || out.length + 1);
            const source = item.source || method || "local-pdf-text";
            if (item.uncertain) ocrUncertain = true;
            out.push({
              page: pageNo,
              text: pageText,
              name: page.name || null,
              source,
              uncertain: Boolean(item.uncertain)
            });
            provenance.push({
              page: pageNo,
              text: pageText,
              source,
              uncertain: Boolean(item.uncertain)
            });
          }
        }
      } else if (page.pdfFullText || page.ocrText) {
        const text = String(page.pdfFullText || page.ocrText || "");
        out.push({
          page: 1,
          text,
          name: page.name || null,
          source: method || "local-ocr",
          uncertain: Boolean(page.localExtraction?.uncertain)
        });
        provenance.push({
          page: 1,
          text,
          source: method || "local-ocr",
          uncertain: Boolean(page.localExtraction?.uncertain)
        });
      }
      continue;
    }

    const imageText = String(page.ocrText || page.text || page.content || "").trim();
    if (imageText) {
      const pageNo = Number(page.order ?? out.length) + 1;
      out.push({
        page: pageNo,
        text: imageText,
        name: page.name || null,
        source: method || "local-ocr",
        uncertain: Boolean(page.localExtraction?.uncertain)
      });
      provenance.push({
        page: pageNo,
        text: imageText,
        source: method || "local-ocr",
        uncertain: Boolean(page.localExtraction?.uncertain)
      });
      methods.add(method || "local-ocr");
    }
  }

  return {
    pages: out,
    methods: [...methods],
    provenance,
    ocrUncertain
  };
}
