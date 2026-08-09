/**
 * Frontière V4-Z : DocumentInput → V4-Y (si prêt).
 * IMAGE/PDF sans extraction → pas d’analyse fictive.
 */

import { analyzeGenericDocument } from "../generic/analyzeGenericDocument.js";
import type { GenericDocumentUnderstanding } from "../generic/types.js";
import {
  auditDocumentInputSafety,
  prepareDocumentInput
} from "./normalizeDocumentInput.js";
import type {
  DocumentExtractionStatus,
  DocumentInput,
  DocumentInputSafetyInvariants,
  RawDocumentAcquisition
} from "./types.js";

export interface GenericDocumentPipelineResult {
  status: DocumentExtractionStatus;
  reason: string;
  input: DocumentInput;
  /** null si needsExtraction / unsupportedInput / empty — aucune analyse fictive. */
  understanding: GenericDocumentUnderstanding | null;
  inputSafety: DocumentInputSafetyInvariants;
  fetchCount: number;
  llmCount: number;
}

export interface RunGenericDocumentAnalysisOptions {
  resetIds?: boolean;
  documentId?: string;
}

/**
 * Point d’entrée recommandé V4-Z :
 * acquisition → DocumentInput → (si ready) compréhension V4-Y.
 */
export function runGenericDocumentAnalysis(
  raw: RawDocumentAcquisition | string,
  options: RunGenericDocumentAnalysisOptions = {}
): GenericDocumentPipelineResult {
  const prepared = prepareDocumentInput(
    typeof raw === "string"
      ? raw
      : {
          ...raw,
          id: options.documentId || raw.id || undefined
        }
  );
  const inputSafety = auditDocumentInputSafety(prepared);

  if (!prepared.readyForAnalysis) {
    return {
      status: prepared.status,
      reason: prepared.reason,
      input: prepared.input,
      understanding: null,
      inputSafety,
      fetchCount: 0,
      llmCount: 0
    };
  }

  const text = prepared.input.text || "";
  const understanding = analyzeGenericDocument(
    {
      text,
      fileName: prepared.input.filename ?? null,
      id: prepared.input.id
    },
    {
      documentId: prepared.input.id,
      resetIds: options.resetIds
    }
  );

  // Si analyse produisait des faits alors que texte vide — compteur
  if (!text.trim() && understanding.facts.length > 0) {
    inputSafety.emptyPromotedToFacts += 1;
  }

  return {
    status: "ready",
    reason: prepared.reason,
    input: prepared.input,
    understanding,
    inputSafety,
    fetchCount: 0,
    llmCount: 0
  };
}
