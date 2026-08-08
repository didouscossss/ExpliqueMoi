/**
 * Pipeline V4-F : profils V4-E → DocumentUnderstanding structuré.
 */

import { ProfilePipeline, type ProfilePipelineResult } from "../profiles/pipeline.js";
import type { DocumentUnderstanding } from "../types/documentUnderstanding.js";
import { buildDocumentUnderstanding } from "./builder.js";
import { invariantsHold } from "./coverage.js";

export interface UnderstandingPipelineResult extends ProfilePipelineResult {
  understanding: DocumentUnderstanding;
  invariantErrors: string[];
}

export class UnderstandingPipeline {
  private readonly profiles = new ProfilePipeline();

  runOnText(text: string): UnderstandingPipelineResult {
    const base = this.profiles.runOnText(text);
    return this.fromProfileResult(base);
  }

  fromProfileResult(base: ProfilePipelineResult): UnderstandingPipelineResult {
    const understanding = buildDocumentUnderstanding({
      classification: base.classification,
      profile: base.profile,
      resolution: base.resolution,
      candidates: base.candidates,
      relations: base.relations,
      consistency: base.consistency,
      blocks: base.blocks
    });
    return {
      ...base,
      understanding,
      invariantErrors: invariantsHold(understanding)
    };
  }
}

export function understandDocumentText(text: string): UnderstandingPipelineResult {
  return new UnderstandingPipeline().runOnText(text);
}
