/**
 * Pipeline V4-AA → V4-Z → V4-Y
 * image/pdf → extractDocumentLocally → DocumentInput → compréhension
 */

import {
  runGenericDocumentAnalysis,
  type GenericDocumentPipelineResult
} from "../documentInput/runGenericDocumentAnalysis.js";
import { extractDocumentLocally } from "./extractDocumentLocally.js";
import type {
  LocalExtractionInput,
  LocalExtractionResult
} from "./types.js";

export interface ExtractThenAnalyzeResult {
  extraction: LocalExtractionResult;
  analysis: GenericDocumentPipelineResult;
  fetchCount: number;
  llmCount: number;
  cloudOcrCount: number;
}

/**
 * Branchement minimal : extraction locale puis analyse générique si ready.
 */
export async function extractThenAnalyzeLocally(
  input: LocalExtractionInput,
  options: { resetIds?: boolean; documentId?: string } = {}
): Promise<ExtractThenAnalyzeResult> {
  const extraction = await extractDocumentLocally(input);

  // Mappe vers RawDocumentAcquisition — jamais filename comme text
  if (extraction.status === "extracted" && extraction.text?.trim()) {
    const analysis = runGenericDocumentAnalysis(
      {
        id: options.documentId || input.id || undefined,
        sourceType:
          (input.sourceType as "text" | "image" | "pdf" | "unknown") ||
          (extraction.meta?.sourceType as "pdf") ||
          "pdf",
        text: extraction.text,
        pages: extraction.pages || null,
        filename: input.filename || null,
        mimeType: input.mimeType || null
      },
      { resetIds: options.resetIds, documentId: options.documentId }
    );
    return {
      extraction,
      analysis,
      fetchCount: 0,
      llmCount: 0,
      cloudOcrCount: 0
    };
  }

  // Pas de texte utilisable — DocumentInput explicite needsExtraction/empty
  const sourceType =
    (input.sourceType as "text" | "image" | "pdf" | "unknown") ||
    (extraction.meta?.sourceType === "image" ? "image" : "pdf");

  const analysis = runGenericDocumentAnalysis(
    {
      id: options.documentId || input.id || undefined,
      sourceType,
      text: null,
      filename: input.filename || null,
      mimeType: input.mimeType || null
    },
    { resetIds: options.resetIds, documentId: options.documentId }
  );

  return {
    extraction,
    analysis,
    fetchCount: 0,
    llmCount: 0,
    cloudOcrCount: 0
  };
}
