/**
 * Orchestration Preview V4-K :
 * extraction existante → adaptateur → analyzeDocumentV4 → mapper Preview.
 */

import { analyzeDocumentV4 } from "../pipeline/analyzeDocumentV4.js";
import { resetCandidateIdsForTests } from "../candidates/ids.js";
import { resetRelationIdsForTests } from "../relations/ids.js";
import {
  ocrResultToV4Input,
  pagesToV4Input,
  type AnalyzePageLike,
  type OcrResultLike,
  type V4AdapterResult
} from "./adapters.js";
import { mapV4ResultToPreviewAnalysis, type PreviewAnalysisMapped } from "./mapToPreview.js";

export interface V4PreviewRunInput {
  pages?: AnalyzePageLike[];
  pastedText?: string;
  /** Si fourni, prioritaire sur pages (tests / OCR déjà structuré). */
  ocrResult?: OcrResultLike;
  /** Blocks déjà adaptés. */
  adapted?: V4AdapterResult;
  /** Reset ids — utile en tests. */
  resetIds?: boolean;
}

export interface V4PreviewRunSuccess {
  ok: true;
  analysis: PreviewAnalysisMapped;
  warnings: string[];
  pdfProcessing: {
    mode: "v4_local";
    engine: "v4";
    hasText: boolean;
    scanned: boolean;
    pageCount: number;
    extractionQuality: string;
    diagnostics: Array<Record<string, unknown>>;
  };
  adapted: V4AdapterResult;
}

export interface V4PreviewRunTechnicalFailure {
  ok: false;
  technicalError: true;
  fallbackReason: string;
  message: string;
  diagnostics: Array<Record<string, unknown>>;
}

export type V4PreviewRunResult = V4PreviewRunSuccess | V4PreviewRunTechnicalFailure;

/**
 * Exécute le chemin V4 Preview.
 * unknown / faible confiance = succès honnête (pas un fallback V3).
 * Seules les exceptions techniques renvoient ok:false.
 */
export function runV4PreviewAnalysis(
  input: V4PreviewRunInput
): V4PreviewRunResult {
  const diagnostics: Array<Record<string, unknown>> = [];

  try {
    if (input.resetIds) {
      resetCandidateIdsForTests();
      resetRelationIdsForTests();
    }

    const adapted =
      input.adapted ||
      (input.ocrResult
        ? ocrResultToV4Input(input.ocrResult)
        : pagesToV4Input({
            pages: input.pages,
            pastedText: input.pastedText
          }));

    diagnostics.push(...adapted.diagnostics);
    diagnostics.push({
      step: "v4_input",
      blocks: adapted.blocks.length,
      chars: adapted.text.replace(/\s+/g, "").length,
      extractionQuality: adapted.extractionQuality,
      source: adapted.source
    });

    // V4-O — active la knowledge fiscale offline (0 fetch / 0 LLM).
    // Les factures restent protégées (non écrasées) ; fiscal_document=null si non fiscal.
    const v4 = analyzeDocumentV4(
      adapted.blocks.length > 0
        ? { blocks: adapted.blocks, fiscalKnowledge: true }
        : { text: adapted.text || "", fiscalKnowledge: true }
    );

    const analysis = mapV4ResultToPreviewAnalysis(v4, {
      extractionQuality: adapted.extractionQuality,
      fallbackReason: null
    });

    // Invariants d’intégration — refus technique si cassés
    const inv = analysis.v4_invariants;
    if (
      inv.unsupportedPresentationFacts !== 0 ||
      inv.unsupportedExplanationFacts !== 0 ||
      inv.inventedActions !== 0 ||
      inv.inventedDeadlines !== 0 ||
      inv.inventedAmounts !== 0 ||
      inv.inventedReasons !== 0 ||
      (inv.knowledgePromotedToDocumentFact || 0) !== 0 ||
      (inv.unsupportedUserActions || 0) !== 0 ||
      (inv.taxFieldKnowledgePromotedToFact || 0) !== 0 ||
      (inv.emptyFieldConvertedToZero || 0) !== 0 ||
      (inv.fieldFalsePositiveCritical || 0) !== 0 ||
      (inv.knowledgePromotedToUserFact || 0) !== 0 ||
      (inv.requirementPromotedToObligation || 0) !== 0 ||
      (inv.candidateFactPromotedToCertain || 0) !== 0 ||
      (inv.unsupportedEligibilityDecision || 0) !== 0 ||
      (inv.unsupportedTaxAmount || 0) !== 0 ||
      (inv.automaticUnsafeAggregation || 0) !== 0 ||
      (inv.missingPresentedAsUserDoesNotHave || 0) !== 0
    ) {
      return {
        ok: false,
        technicalError: true,
        fallbackReason: "v4_invariant_violation",
        message: "Invariants V4 violés — fallback V3 possible.",
        diagnostics: [
          ...diagnostics,
          { step: "invariants", ...inv }
        ]
      };
    }

    const warnings = [...(analysis.warnings || [])];

    return {
      ok: true,
      analysis,
      warnings,
      pdfProcessing: {
        mode: "v4_local",
        engine: "v4",
        hasText: adapted.extractionQuality !== "empty",
        scanned: adapted.extractionQuality === "empty",
        pageCount: adapted.pageCount,
        extractionQuality: adapted.extractionQuality,
        diagnostics
      },
      adapted
    };
  } catch (error) {
    const message = String(
      (error as Error)?.message || error || "erreur V4 inconnue"
    ).slice(0, 400);
    return {
      ok: false,
      technicalError: true,
      fallbackReason: "v4_technical_error",
      message,
      diagnostics: [
        ...diagnostics,
        { step: "v4_exception", message }
      ]
    };
  }
}
