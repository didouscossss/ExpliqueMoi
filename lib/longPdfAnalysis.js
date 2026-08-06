import { rasterizePdfPages } from "./pdfProcessing.js";
import { callGeminiForAnalysis, parseGeminiJson } from "./geminiAnalysis.js";
import { planPdfChunks, mergeChunkAnalyses } from "./pdfChunking.js";
import {
  normalizeTables,
  normalizeTimeline,
  normalizeEntities,
  normalizeAmountsDetail
} from "./documentContext.js";

/**
 * Analyse un PDF long par chunks, puis fusionne.
 * N’envoie pas tout le PDF en un seul énorme prompt.
 */
export async function analyzeLongPdf({
  page,
  text,
  heterogeneous,
  buildPrompt,
  validateResult,
  hasUsableContent
}) {
  const bytes = page.bytes || Buffer.from(page.base64 || "", "base64");
  const pageCount = page.pdfPageCount || 0;
  const pageTexts = page.pdfPageTexts || [];
  const scanned = page.pdfScanned === true;

  const plan = planPdfChunks({
    pageCount,
    fileSize: page.size,
    textLength: pageTexts.reduce(
      (sum, item) => sum + String(item.text || "").length,
      0
    ),
    scanned,
    pageTexts
  });

  const chunkResults = [];
  const diagnostics = [
    {
      step: "chunk_plan",
      mode: plan.mode,
      chunkCount: plan.chunkCount,
      pagesPerChunk: plan.pagesPerChunk || null,
      reason: plan.reason
    }
  ];

  for (const chunk of plan.chunks) {
    const label = `pages_${chunk.startPage}_${chunk.endPage}`;

    try {
      let parts;

      if (chunk.strategy === "page_images" || scanned) {
        const raster = await rasterizePdfPages(bytes, {
          onlyPages: chunk.pageNumbers,
          pageTexts,
          rotation: page.rotation
        });

        const failedInChunk = chunk.pageNumbers.filter(
          (n) => !(raster.readablePages || []).includes(n)
        );

        if (!(raster.images || []).length) {
          chunkResults.push({
            ok: false,
            failedPages: chunk.pageNumbers,
            processedPages: [],
            warnings: [
              `Les pages ${chunk.startPage} à ${chunk.endPage} n’ont pas pu être converties.`
            ]
          });
          diagnostics.push({
            step: "chunk_raster_fail",
            label,
            failedPages: chunk.pageNumbers
          });
          continue;
        }

        parts = [
          {
            text: buildPrompt(
              text,
              raster.images.length,
              heterogeneous,
              "page_images"
            )
          },
          {
            text:
              `Lot de pages ${chunk.startPage} à ${chunk.endPage} ` +
              `sur ${pageCount}. Analyse uniquement ces pages.`
          }
        ];

        for (const image of raster.images) {
          parts.push({
            text: `--- Page ${image.pageNumber} / ${pageCount} ---`
          });
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: image.bytes.toString("base64")
            }
          });
          image.bytes = null;
        }

        const gemini = await callGeminiForAnalysis(parts, {
          retries: 1,
          timeoutMs: 50000
        });

        const parsed = parseChunkGemini(
          gemini,
          validateResult,
          hasUsableContent
        );

        chunkResults.push({
          ok: parsed.ok,
          analysis: parsed.analysis,
          emptyOrUnusable: parsed.emptyOrUnusable,
          failedPages: failedInChunk,
          processedPages: raster.readablePages || [],
          warnings: []
        });

        diagnostics.push({
          step: "chunk_done",
          label,
          ok: parsed.ok,
          strategy: "page_images"
        });
      } else {
        // text_chunk : texte sélectionnable + éventuellement PDF direct pour petits lots
        const chunkText = pageTexts
          .filter((item) => chunk.pageNumbers.includes(item.pageNumber))
          .map(
            (item) =>
              `--- Page ${item.pageNumber} ---\n${item.text || "[vide]"}`
          )
          .join("\n\n");

        parts = [
          {
            text: buildPrompt(
              text,
              chunk.pageNumbers.length,
              heterogeneous,
              "direct"
            )
          },
          {
            text:
              `Lot de pages ${chunk.startPage} à ${chunk.endPage} ` +
              `sur ${pageCount}.\n\nTEXTE EXTRAIT DE CES PAGES :\n${chunkText}`
          }
        ];

        // Pour le premier petit chunk uniquement, joindre aussi le PDF si léger
        if (
          plan.chunkCount === 1 &&
          page.size <= 1.2 * 1024 * 1024 &&
          page.base64
        ) {
          parts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: page.base64
            }
          });
        }

        const gemini = await callGeminiForAnalysis(parts, {
          retries: 1,
          timeoutMs: 50000
        });

        const parsed = parseChunkGemini(
          gemini,
          validateResult,
          hasUsableContent
        );

        chunkResults.push({
          ok: parsed.ok,
          analysis: parsed.analysis,
          emptyOrUnusable: parsed.emptyOrUnusable,
          failedPages: parsed.ok ? [] : chunk.pageNumbers,
          processedPages: parsed.ok ? chunk.pageNumbers : [],
          warnings: []
        });

        diagnostics.push({
          step: "chunk_done",
          label,
          ok: parsed.ok,
          strategy: "text_chunk"
        });
      }
    } catch (error) {
      chunkResults.push({
        ok: false,
        failedPages: chunk.pageNumbers,
        processedPages: [],
        warnings: [
          `Échec sur les pages ${chunk.startPage}-${chunk.endPage}.`
        ],
        detail: String(error?.message || "").slice(0, 200)
      });
      diagnostics.push({
        step: "chunk_error",
        label,
        message: String(error?.message || "").slice(0, 200)
      });
    }
  }

  const merged = mergeChunkAnalyses(chunkResults);

  if (merged.ok && merged.analysis) {
    // Normaliser tables / entités via helpers partagés
    merged.analysis.tables = normalizeTables(merged.analysis.tables);
    merged.analysis.timeline = normalizeTimeline(merged.analysis.timeline);
    merged.analysis.entities = normalizeEntities(merged.analysis.entities);
    merged.analysis.amounts_detail = normalizeAmountsDetail(
      merged.analysis.amounts_detail
    );
  }

  return {
    plan,
    merged,
    diagnostics,
    chunkResults
  };
}

function parseChunkGemini(gemini, validateResult, hasUsableContent) {
  if (!gemini?.ok || !gemini.rawText) {
    return { ok: false, analysis: null, emptyOrUnusable: true };
  }

  try {
    const raw = parseGeminiJson(gemini.rawText, { label: "chunk" });
    const validated = validateResult(raw, [], [], false);
    const usable = hasUsableContent(validated);
    return {
      ok: usable,
      analysis: validated,
      emptyOrUnusable: !usable
    };
  } catch {
    return { ok: false, analysis: null, emptyOrUnusable: true };
  }
}
