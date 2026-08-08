/**
 * Pipeline V4-H : DocumentExplanation → UserPresentation.
 * Ne relit jamais le document source (PDF/OCR).
 */

import {
  ExplanationPipeline,
  type ExplanationPipelineResult
} from "../explanation/pipeline.js";
import type { UserPresentation } from "../types/userPresentation.js";
import { buildUserPresentation } from "./builder.js";
import { presentationInvariantsHold } from "./invariant.js";

export interface PresentationPipelineResult extends ExplanationPipelineResult {
  presentation: UserPresentation;
  presentationInvariantErrors: string[];
}

export class PresentationPipeline {
  private readonly explanation = new ExplanationPipeline();

  runOnText(text: string): PresentationPipelineResult {
    const base = this.explanation.runOnText(text);
    return this.fromExplanationResult(base);
  }

  fromExplanationResult(
    base: ExplanationPipelineResult
  ): PresentationPipelineResult {
    const presentation = buildUserPresentation(base.explanation);
    return {
      ...base,
      presentation,
      presentationInvariantErrors: presentationInvariantsHold(presentation)
    };
  }
}

export function presentDocumentText(text: string): PresentationPipelineResult {
  return new PresentationPipeline().runOnText(text);
}
