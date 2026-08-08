/**
 * Pipeline V4-E : classification V4-D → profil → résolution de champs.
 * Aucun résumé narratif.
 */

import { blocksFromPlainText } from "../candidates/context.js";
import { CandidatePipeline } from "../candidates/pipeline.js";
import { DocumentSchemaRouter } from "../classification/DocumentSchemaRouter.js";
import {
  FISCAL_SPECIALIZED_SCHEMA_PROFILES,
  listSchemaProfiles
} from "../classification/profiles/registry.js";
import { analyzeFiscalKnowledge } from "../knowledge/fr/tax/analyzeFiscalKnowledge.js";
import { mergeFiscalKnowledgeIntoClassification } from "../knowledge/fr/tax/applyKnowledge.js";
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
import type { FiscalKnowledgeAnalysis } from "../types/knowledge.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import { resolveProfileForType } from "./registry.js";

/** Options V4-E — fiscalKnowledge opt-in (V4-L), défaut false. */
export interface ProfilePipelineOptions {
  fiscalKnowledge?: boolean;
}

export interface ProfilePipelineResult {
  blocks: TextBlock[];
  candidates: EntityCandidate[];
  relations: Relation[];
  consistency: ConsistencyResult;
  classification: DocumentClassification;
  profile: DocumentProfile;
  resolution: ProfileResolutionResult;
  validation: ProfileValidationResult;
  /** Présent uniquement si fiscalKnowledge=true. */
  fiscalKnowledge?: FiscalKnowledgeAnalysis | null;
}

export class ProfilePipeline {
  private readonly candidates = new CandidatePipeline();
  private readonly router = new DocumentSchemaRouter();
  private readonly options: ProfilePipelineOptions;

  constructor(options: ProfilePipelineOptions = {}) {
    this.options = options;
  }

  runOnText(text: string): ProfilePipelineResult {
    return this.runOnBlocks(blocksFromPlainText(text));
  }

  runOnBlocks(blocks: readonly TextBlock[]): ProfilePipelineResult {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const built = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);

    const router = this.options.fiscalKnowledge
      ? new DocumentSchemaRouter([
          ...listSchemaProfiles(),
          ...FISCAL_SPECIALIZED_SCHEMA_PROFILES
        ])
      : this.router;

    let classification = router.classify({
      blocks,
      candidates,
      relations: built.relations,
      consistency
    });

    let fiscalKnowledge: FiscalKnowledgeAnalysis | null = null;
    if (this.options.fiscalKnowledge) {
      fiscalKnowledge = analyzeFiscalKnowledge(blocks);
      classification = mergeFiscalKnowledgeIntoClassification(
        classification,
        fiscalKnowledge
      );
    }

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
      validation,
      fiscalKnowledge
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
