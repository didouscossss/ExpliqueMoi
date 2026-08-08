/**
 * Pipeline V4 end-to-end (V4-I).
 * Orchestre les briques A→H sans dupliquer leurs heuristiques.
 *
 * TextBlocks → candidats → relations → classification → profile/fields
 * → understanding → explanation → presentation
 *
 * V4-L : fiscalKnowledge opt-in (défaut false) — pas de changement Preview.
 */

import type { DocumentClassification } from "../types/documentClassification.js";
import type { DocumentExplanation } from "../types/documentExplanation.js";
import type {
  DocumentProfile,
  ProfileResolutionResult
} from "../types/documentProfile.js";
import type { EntityCandidate } from "../types/entityCandidate.js";
import type { FiscalKnowledgeAnalysis } from "../types/knowledge.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import type { DocumentUnderstanding } from "../types/documentUnderstanding.js";
import type { UserPresentation } from "../types/userPresentation.js";
import { ExplanationPipeline } from "../explanation/pipeline.js";
import { PresentationPipeline } from "../presentation/pipeline.js";
import { ProfilePipeline } from "../profiles/pipeline.js";
import { UnderstandingPipeline } from "../understanding/pipeline.js";
import { buildV4Diagnostics, type V4Diagnostics } from "./diagnostics.js";

export interface AnalyzeDocumentV4Input {
  /** Texte brut (fixtures / tests). */
  text?: string;
  /** Blocs déjà extraits (pdf.js / OCR) — priorité sur text. */
  blocks?: readonly TextBlock[];
  /**
   * V4-L — active registre fiscal FR + détecteur de références.
   * Défaut false : Preview / production inchangés.
   */
  fiscalKnowledge?: boolean;
}

export interface AnalyzeDocumentV4Result {
  blocks: TextBlock[];
  candidates: EntityCandidate[];
  relations: Relation[];
  consistency: ConsistencyResult;
  classification: DocumentClassification;
  profile: DocumentProfile;
  fields: ProfileResolutionResult;
  understanding: DocumentUnderstanding;
  explanation: DocumentExplanation;
  presentation: UserPresentation;
  diagnostics: V4Diagnostics;
  /** Analyse knowledge si fiscalKnowledge=true. */
  fiscalKnowledge?: FiscalKnowledgeAnalysis | null;
}

/**
 * Point d’entrée interne V4 — analyse locale complète.
 * Aucun fetch / LLM / UI.
 */
export function analyzeDocumentV4(
  input: AnalyzeDocumentV4Input
): AnalyzeDocumentV4Result {
  const useFiscal = Boolean(input.fiscalKnowledge);

  if (useFiscal) {
    const profilePipe = new ProfilePipeline({ fiscalKnowledge: true });
    const profileResult =
      input.blocks && input.blocks.length > 0
        ? profilePipe.runOnBlocks(input.blocks)
        : profilePipe.runOnText(input.text || "");

    const understanding = new UnderstandingPipeline().fromProfileResult(
      profileResult
    );
    const explanation = new ExplanationPipeline().fromUnderstandingResult(
      understanding
    );
    const presentation = new PresentationPipeline().fromExplanationResult(
      explanation
    );

    const diagnostics = buildV4Diagnostics({
      classification: presentation.classification,
      resolution: presentation.resolution,
      relations: presentation.relations,
      consistency: presentation.consistency,
      understanding: presentation.understanding,
      explanation: presentation.explanation,
      presentation: presentation.presentation,
      explanationInvariantErrors: presentation.explanationInvariantErrors,
      presentationInvariantErrors: presentation.presentationInvariantErrors
    });

    return {
      blocks: presentation.blocks,
      candidates: presentation.candidates,
      relations: presentation.relations,
      consistency: presentation.consistency,
      classification: presentation.classification,
      profile: presentation.profile,
      fields: presentation.resolution,
      understanding: presentation.understanding,
      explanation: presentation.explanation,
      presentation: presentation.presentation,
      diagnostics,
      fiscalKnowledge: profileResult.fiscalKnowledge ?? null
    };
  }

  const pipeline = new PresentationPipeline();

  const result =
    input.blocks && input.blocks.length > 0
      ? pipeline.runOnBlocks(input.blocks)
      : pipeline.runOnText(input.text || "");

  const diagnostics = buildV4Diagnostics({
    classification: result.classification,
    resolution: result.resolution,
    relations: result.relations,
    consistency: result.consistency,
    understanding: result.understanding,
    explanation: result.explanation,
    presentation: result.presentation,
    explanationInvariantErrors: result.explanationInvariantErrors,
    presentationInvariantErrors: result.presentationInvariantErrors
  });

  return {
    blocks: result.blocks,
    candidates: result.candidates,
    relations: result.relations,
    consistency: result.consistency,
    classification: result.classification,
    profile: result.profile,
    fields: result.resolution,
    understanding: result.understanding,
    explanation: result.explanation,
    presentation: result.presentation,
    diagnostics,
    fiscalKnowledge: null
  };
}

/** Variante explicite texte. */
export function analyzeDocumentV4Text(text: string): AnalyzeDocumentV4Result {
  return analyzeDocumentV4({ text });
}
