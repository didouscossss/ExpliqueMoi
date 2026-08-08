/**
 * Pipeline V4-E : classification V4-D → profil → résolution de champs.
 * Aucun résumé narratif.
 */

import { blocksFromPlainText } from "../candidates/context.js";
import { CandidatePipeline } from "../candidates/pipeline.js";
import { DocumentSchemaRouter } from "../classification/DocumentSchemaRouter.js";
import { buildRelations } from "../relations/RelationEngine.js";
import { analyzeConsistency } from "../relations/GlobalConsistencyEngine.js";
import type { DocumentClassification } from "../types/documentClassification.js";
import type {
  DocumentProfile,
  DocumentProfileContext,
  ProfileResolutionResult,
  ProfileValidationResult
} from "../types/documentProfile.js";
import type { EntityCandidate } from "../types/entityCandidate.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import { resolveProfileForType } from "./registry.js";

export interface ProfilePipelineResult {
  blocks: TextBlock[];
  candidates: EntityCandidate[];
  relations: Relation[];
  consistency: ConsistencyResult;
  classification: DocumentClassification;
  profile: DocumentProfile;
  resolution: ProfileResolutionResult;
  validation: ProfileValidationResult;
}

export class ProfilePipeline {
  private readonly candidates = new CandidatePipeline();
  private readonly router = new DocumentSchemaRouter();

  runOnText(text: string): ProfilePipelineResult {
    return this.runOnBlocks(blocksFromPlainText(text));
  }

  runOnBlocks(blocks: readonly TextBlock[]): ProfilePipelineResult {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const built = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    const classification = this.router.classify({
      blocks,
      candidates,
      relations: built.relations,
      consistency
    });
    const profile = resolveProfileForType(classification.primary);
    const ctx: DocumentProfileContext = {
      classification,
      candidates,
      blocks,
      relations: built.relations,
      consistency,
      text: blocks.map((b) => b.text).join("\n")
    };
    const resolution = profile.resolveFields(ctx);
    const validation = profile.validate(ctx);
    return {
      blocks: [...blocks],
      candidates: [...candidates],
      relations: built.relations,
      consistency,
      classification,
      profile,
      resolution,
      validation
    };
  }
}

export function resolveDocumentProfileText(text: string): ProfilePipelineResult {
  return new ProfilePipeline().runOnText(text);
}

/** Force un profil (tests de séparation) sans changer la classification affichée. */
export function resolveWithForcedProfile(
  text: string,
  profile: DocumentProfile
): ProfilePipelineResult {
  const base = new ProfilePipeline().runOnText(text);
  const ctx: DocumentProfileContext = {
    classification: base.classification,
    candidates: base.candidates,
    blocks: base.blocks,
    relations: base.relations,
    consistency: base.consistency,
    text
  };
  const resolution = profile.resolveFields(ctx);
  const validation = profile.validate(ctx);
  return { ...base, profile, resolution, validation };
}
