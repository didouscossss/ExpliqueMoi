/**
 * Pipeline V4-C : candidats scorés → relations → cohérence globale.
 */

import type { EntityCandidate } from "../types/entityCandidate.js";
import type { TextBlock } from "../types/textBlock.js";
import type { ConsistencyResult } from "../types/relation.js";
import type { DocumentSession } from "../types/documentSession.js";
import {
  CandidatePipeline,
  type CandidatePipelineOptions
} from "../candidates/pipeline.js";
import { blocksFromPlainText } from "../candidates/context.js";
import { analyzeConsistency } from "./GlobalConsistencyEngine.js";
import { buildRelations, type RelationEngineResult } from "./RelationEngine.js";

export interface ConsistencyPipelineResult {
  blocks: TextBlock[];
  candidates: EntityCandidate[];
  relations: RelationEngineResult;
  consistency: ConsistencyResult;
}

export class ConsistencyPipeline {
  private readonly candidates: CandidatePipeline;

  constructor(options: CandidatePipelineOptions = {}) {
    this.candidates = new CandidatePipeline(options);
  }

  runOnBlocks(blocks: readonly TextBlock[]): ConsistencyPipelineResult {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const relations = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    return {
      blocks: [...blocks],
      candidates,
      relations,
      consistency
    };
  }

  runOnText(text: string): ConsistencyPipelineResult {
    return this.runOnBlocks(blocksFromPlainText(text));
  }

  runOnSession(session: DocumentSession): ConsistencyPipelineResult {
    const candidates = this.candidates.runOnSession(session);
    const relations = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    session.setRelations(relations.relations);
    return {
      blocks: [...session.blocks],
      candidates,
      relations,
      consistency
    };
  }
}

export function analyzeDocumentText(text: string): ConsistencyPipelineResult {
  return new ConsistencyPipeline().runOnText(text);
}
