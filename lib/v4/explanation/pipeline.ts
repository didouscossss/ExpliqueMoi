/**
 * Pipeline V4-G : DocumentUnderstanding → DocumentExplanation.
 */

import {
  UnderstandingPipeline,
  type UnderstandingPipelineResult
} from "../understanding/pipeline.js";
import type { DocumentExplanation } from "../types/documentExplanation.js";
import { buildDocumentExplanation } from "./builder.js";
import { explanationInvariantsHold } from "./invariant.js";

export interface ExplanationPipelineResult extends UnderstandingPipelineResult {
  explanation: DocumentExplanation;
  explanationInvariantErrors: string[];
}

export class ExplanationPipeline {
  private readonly understanding = new UnderstandingPipeline();

  runOnText(text: string): ExplanationPipelineResult {
    const base = this.understanding.runOnText(text);
    return this.fromUnderstandingResult(base);
  }

  fromUnderstandingResult(
    base: UnderstandingPipelineResult
  ): ExplanationPipelineResult {
    const explanation = buildDocumentExplanation({
      understanding: base.understanding,
      classification: base.classification,
      blocks: base.blocks
    });
    return {
      ...base,
      explanation,
      explanationInvariantErrors: explanationInvariantsHold(explanation)
    };
  }
}

export function explainDocumentText(text: string): ExplanationPipelineResult {
  return new ExplanationPipeline().runOnText(text);
}
