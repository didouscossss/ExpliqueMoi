/**
 * Orchestration Preview V4-K :
 * extraction existante → adaptateur → analyzeDocumentV4 → mapper Preview.
 * V4-R : dossier multi-documents si plusieurs fichiers / séparateurs ---DOC---.
 */

import { analyzeDocumentV4 } from "../pipeline/analyzeDocumentV4.js";
import { resetCandidateIdsForTests } from "../candidates/ids.js";
import { resetRelationIdsForTests } from "../relations/ids.js";
import { resetRequirementFactIdsForTests } from "../knowledge/fr/tax/fields/requirements/documentFactIndex.js";
import {
  buildDocumentCase,
  assertUploadOrderStable
} from "../knowledge/fr/tax/case/buildDocumentCase.js";
import { checkDocumentCaseSafety } from "../knowledge/fr/tax/case/safety.js";
import {
  applyClarificationAnswer,
  initClarificationState
} from "../knowledge/fr/tax/clarification/index.js";
import {
  ocrResultToV4Input,
  pagesToV4Input,
  type AnalyzePageLike,
  type OcrResultLike,
  type V4AdapterResult
} from "./adapters.js";
import { mapV4ResultToPreviewAnalysis, type PreviewAnalysisMapped } from "./mapToPreview.js";
import { documentCaseToPreviewJson } from "./documentCaseViewModel.js";
import {
  analyzeGenericDocument,
  genericUnderstandingPreviewPayload
} from "../generic/index.js";
import { extractDocumentLocally } from "../localExtraction/extractDocumentLocally.js";

export interface V4PreviewRunInput {
  pages?: AnalyzePageLike[];
  pastedText?: string;
  /** V4-R — documents distincts (multi-upload / dossier). */
  documents?: Array<{ text: string; fileName?: string | null }>;
  /** Si fourni, prioritaire sur pages (tests / OCR déjà structuré). */
  ocrResult?: OcrResultLike;
  /** Blocks déjà adaptés. */
  adapted?: V4AdapterResult;
  /** Reset ids — utile en tests. */
  resetIds?: boolean;
  /** V4-S — réponses de clarification à appliquer dans l’ordre. */
  clarificationAnswers?: Array<{ questionId?: string; answer: string }>;
}

function pageBytesFromPreview(
  page: AnalyzePageLike
): Uint8Array | null {
  if (page.bytes) {
    if (page.bytes instanceof Uint8Array) return new Uint8Array(page.bytes);
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(page.bytes)) {
      return Uint8Array.from(page.bytes);
    }
  }
  if (page.base64) {
    try {
      return Uint8Array.from(Buffer.from(String(page.base64), "base64"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * V4-AD — enrichit les pages image / PDF scanné via extractDocumentLocally.
 * PDF avec couche texte : inchangé (pas d’OCR).
 */
export async function enrichPagesWithLocalExtraction(
  pages: readonly AnalyzePageLike[]
): Promise<AnalyzePageLike[]> {
  const out: AnalyzePageLike[] = [];
  for (const page of pages) {
    const copy: AnalyzePageLike = { ...page };
    const mime = String(page.mimeType || "");
    const isPdf = mime === "application/pdf";
    const isImage = mime.startsWith("image/");

    // PDF texte déjà inspecté → ne pas OCR
    if (isPdf && page.pdfHasText === true) {
      out.push(copy);
      continue;
    }

    if (!isImage && !(isPdf && page.pdfHasText !== true)) {
      out.push(copy);
      continue;
    }

    const bytes = pageBytesFromPreview(page);
    if (!bytes?.length) {
      copy.localExtraction = {
        status: "needsExtraction",
        method: "none",
        error: isImage ? "image_bytes_missing" : "pdf_bytes_missing"
      };
      out.push(copy);
      continue;
    }

    const extracted = await extractDocumentLocally({
      sourceType: isPdf ? "pdf" : "image",
      mimeType: mime || null,
      filename: page.name || null,
      bytes
    });

    copy.localExtraction = {
      status: extracted.status,
      method: extracted.method,
      error: extracted.error || null
    };

    if (extracted.status === "extracted" && extracted.text?.trim()) {
      copy.ocrText = extracted.text;
      copy.text = extracted.text;
      if (isPdf) {
        // Ne pas forcer pdfHasText : pagesToV4Input utilisera ocrText
        copy.pdfScanned = true;
      }
    }
    out.push(copy);
  }
  return out;
}

/**
 * Preview async : OCR local (V4-AC) puis analyse sync existante.
 */
export async function runV4PreviewAnalysisAsync(
  input: V4PreviewRunInput
): Promise<V4PreviewRunResult> {
  const pages = Array.isArray(input.pages)
    ? await enrichPagesWithLocalExtraction(input.pages)
    : input.pages;
  return runV4PreviewAnalysis({ ...input, pages });
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

/** Parse `---DOC---` ou `---DOC:filename.pdf---` dans un collage multi-documents. */
export function parseMultiDocumentPaste(
  text: string
): Array<{ text: string; fileName: string | null }> {
  const raw = text || "";
  if (!/^---DOC/m.test(raw)) {
    return [{ text: raw, fileName: null }];
  }
  const parts = raw.split(/^---DOC(?::([^\n]+))?---\s*$/m);
  // split yields: [before, fileName1?, body1, fileName2?, body2, ...]
  const docs: Array<{ text: string; fileName: string | null }> = [];
  // When using capturing group, odd pattern:
  // parts[0] = preamble, then pairs (filename, body)
  if (parts[0]?.trim()) {
    // preamble without marker — ignore unless only content
  }
  for (let i = 1; i < parts.length; i += 2) {
    const fileName = (parts[i] || "").trim() || null;
    const body = (parts[i + 1] || "").trim();
    if (body.length >= 10) docs.push({ text: body, fileName });
  }
  if (!docs.length && raw.trim()) {
    return [{ text: raw, fileName: null }];
  }
  return docs;
}

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
      resetRequirementFactIdsForTests();
    }

    // V4-R — résoudre la liste de documents du dossier
    let dossierDocs = input.documents || [];
    if (!dossierDocs.length && input.pastedText) {
      dossierDocs = parseMultiDocumentPaste(input.pastedText);
    }
    // Group pages by sourceName if provided
    if (!dossierDocs.length && input.pages?.length) {
      const byFile = new Map<string, string[]>();
      for (const p of input.pages) {
        const key =
          (p as { sourceName?: string; name?: string }).sourceName ||
          (p as { name?: string }).name ||
          "document";
        const list = byFile.get(key) || [];
        const pageText =
          (p as { ocrText?: string }).ocrText ||
          (p as { text?: string }).text ||
          (p as { content?: string }).content ||
          "";
        list.push(pageText);
        byFile.set(key, list);
      }
      if (byFile.size > 1) {
        dossierDocs = [...byFile.entries()].map(([fileName, texts]) => ({
          fileName,
          text: texts.join("\n")
        }));
      }
    }

    const multi = dossierDocs.length > 1;

    const adapted =
      input.adapted ||
      (input.ocrResult
        ? ocrResultToV4Input(input.ocrResult)
        : pagesToV4Input({
            pages: input.pages,
            pastedText:
              multi
                ? dossierDocs.map((d) => d.text).join("\n\n")
                : input.pastedText || dossierDocs[0]?.text
          }));

    diagnostics.push(...adapted.diagnostics);
    diagnostics.push({
      step: "v4_input",
      blocks: adapted.blocks.length,
      chars: adapted.text.replace(/\s+/g, "").length,
      extractionQuality: adapted.extractionQuality,
      source: adapted.source,
      dossierDocuments: dossierDocs.length
    });

    const v4 = analyzeDocumentV4(
      adapted.blocks.length > 0
        ? { blocks: adapted.blocks, fiscalKnowledge: true }
        : { text: adapted.text || "", fiscalKnowledge: true }
    );

    const analysis = mapV4ResultToPreviewAnalysis(v4, {
      extractionQuality: adapted.extractionQuality,
      fallbackReason: null
    });

    // V4-R/S — DocumentCase + clarification (multi-doc, ou mono fiscal)
    const fiscalMono =
      !multi &&
      dossierDocs.length === 1 &&
      Boolean(analysis.fiscal_document);
    if (multi || fiscalMono) {
      let docCase = buildDocumentCase(
        dossierDocs.map((d) => ({
          text: d.text,
          fileName: d.fileName || null
        })),
        { resetIds: Boolean(input.resetIds) }
      );
      if (multi) {
        const order = assertUploadOrderStable(
          dossierDocs.map((d) => ({ text: d.text, fileName: d.fileName })),
          [...dossierDocs]
            .reverse()
            .map((d) => ({ text: d.text, fileName: d.fileName }))
        );
        docCase.invariants.uploadOrderChangesConclusion =
          order.uploadOrderChangesConclusion;
      }
      let clar = initClarificationState(docCase);
      for (const step of input.clarificationAnswers || []) {
        const qid =
          step.questionId ||
          clar.currentQuestion?.questionId ||
          clar.session.currentQuestionId;
        if (!qid) break;
        clar = applyClarificationAnswer(clar, qid, step.answer).state;
      }
      docCase = clar.documentCase;
      const safety = checkDocumentCaseSafety(docCase);
      if (!safety.ok && docCase.invariants.crossDocumentUnsafeAggregation > 0) {
        return {
          ok: false,
          technicalError: true,
          fallbackReason: "v4_invariant_violation",
          message: "Invariants dossier V4-R/S violés.",
          diagnostics: [...diagnostics, { step: "case_safety", ...safety }]
        };
      }
      analysis.document_case = documentCaseToPreviewJson(docCase);
      if (analysis.fiscal_document && docCase.caseCentricViews.length) {
        const fd = analysis.fiscal_document as Record<string, unknown>;
        fd.dossier_summary = {
          documents_count: docCase.documents.length,
          years_present: docCase.taxContext.yearsPresent,
          conflicts_count: docCase.conflicts.length
        };
      }
      diagnostics.push({
        step: "document_case",
        caseId: docCase.caseId,
        metrics: docCase.metrics,
        safety_ok: safety.ok,
        clarification_question: clar.currentQuestion?.requirementId || null
      });
    }

    // V4-Y — compréhension générique (chemin hors fr/tax, fiscalKnowledge=false)
    try {
      const primaryText =
        dossierDocs[0]?.text || adapted.text || input.pastedText || "";
      if (primaryText.trim()) {
        const generic = analyzeGenericDocument(
          {
            text: primaryText,
            fileName: dossierDocs[0]?.fileName || null,
            id: "preview-primary"
          },
          { resetIds: Boolean(input.resetIds) }
        );
        analysis.generic_understanding =
          genericUnderstandingPreviewPayload(generic);
        diagnostics.push({
          step: "generic_understanding",
          document_type: generic.documentType,
          facts: generic.facts.length,
          important: generic.importantFacts.length,
          explanations: generic.explanations.length,
          safety_ok: Object.values(generic.safety).every((n) => n === 0)
        });
      }
    } catch (genericErr) {
      diagnostics.push({
        step: "generic_understanding_error",
        message: String((genericErr as Error)?.message || genericErr).slice(
          0,
          200
        )
      });
    }

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
        pageCount: multi ? dossierDocs.length : adapted.pageCount,
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
