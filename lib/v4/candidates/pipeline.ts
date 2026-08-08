/**
 * Pipeline V4-B : extraction → hypothèses scorées.
 * Pas de classification document, pas de relations métier.
 */

import type { EntityCandidate } from "../types/entityCandidate.js";
import type { TextBlock } from "../types/textBlock.js";
import type { DocumentSession } from "../types/documentSession.js";
import { blocksFromPlainText } from "./context.js";
import {
  CandidateExtractor,
  type CandidateExtractorOptions
} from "./extractors/CandidateExtractor.js";
import {
  HypothesisEngine,
  type HypothesisEngineOptions
} from "./hypothesis/HypothesisEngine.js";

export interface CandidatePipelineOptions {
  extractor?: CandidateExtractorOptions;
  hypothesis?: HypothesisEngineOptions;
}

export interface CandidatePipelineResult {
  blocks: TextBlock[];
  candidates: EntityCandidate[];
}

export class CandidatePipeline {
  private readonly extractor: CandidateExtractor;
  private readonly hypothesis: HypothesisEngine;

  constructor(options: CandidatePipelineOptions = {}) {
    this.extractor = new CandidateExtractor(options.extractor);
    this.hypothesis = new HypothesisEngine(options.hypothesis);
  }

  runOnBlocks(blocks: readonly TextBlock[]): CandidatePipelineResult {
    const extracted = this.extractor.extract(blocks);
    const candidates = this.hypothesis.assign(extracted);
    return { blocks: [...blocks], candidates };
  }

  runOnText(text: string): CandidatePipelineResult {
    const blocks = blocksFromPlainText(text);
    return this.runOnBlocks(blocks);
  }

  /** Remplit une DocumentSession (sans destroy). */
  runOnSession(session: DocumentSession): EntityCandidate[] {
    const blocks =
      session.blocks.length > 0
        ? session.blocks
        : blocksFromPlainText(session.rawText || "");
    if (session.blocks.length === 0 && blocks.length) {
      session.setBlocks([...blocks]);
    }
    const { candidates } = this.runOnBlocks(blocks);
    session.setCandidates(candidates);
    return candidates;
  }
}

export function extractAndScoreCandidates(
  textOrBlocks: string | readonly TextBlock[],
  options?: CandidatePipelineOptions
): EntityCandidate[] {
  const pipeline = new CandidatePipeline(options);
  if (typeof textOrBlocks === "string") {
    return pipeline.runOnText(textOrBlocks).candidates;
  }
  return pipeline.runOnBlocks(textOrBlocks).candidates;
}
