/**
 * Pipeline V4-D : candidats + relations → classification documentaire.
 */

import type { DocumentClassification } from "../types/documentClassification.js";
import type { DocumentSession } from "../types/documentSession.js";
import type { TextBlock } from "../types/textBlock.js";
import { blocksFromPlainText } from "../candidates/context.js";
import { CandidatePipeline } from "../candidates/pipeline.js";
import { buildRelations } from "../relations/RelationEngine.js";
import { analyzeConsistency } from "../relations/GlobalConsistencyEngine.js";
import {
  DocumentSchemaRouter,
  classifyDocument,
  explainClassification
} from "./DocumentSchemaRouter.js";

export interface ClassificationPipelineResult {
  blocks: TextBlock[];
  classification: DocumentClassification;
  explanation: string[];
}

export class ClassificationPipeline {
  private readonly candidates = new CandidatePipeline();
  private readonly router: DocumentSchemaRouter;

  constructor() {
    this.router = new DocumentSchemaRouter();
  }

  runOnText(text: string): ClassificationPipelineResult {
    return this.runOnBlocks(blocksFromPlainText(text));
  }

  runOnBlocks(blocks: readonly TextBlock[]): ClassificationPipelineResult {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const relations = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    const classification = this.router.classify({
      blocks,
      candidates,
      relations: relations.relations,
      consistency
    });
    return {
      blocks: [...blocks],
      classification,
      explanation: explainClassification(classification)
    };
  }

  runOnSession(session: DocumentSession): ClassificationPipelineResult {
    const blocks =
      session.blocks.length > 0
        ? session.blocks
        : blocksFromPlainText(session.rawText || "");
    if (!session.blocks.length && blocks.length) session.setBlocks([...blocks]);
    const result = this.runOnBlocks(blocks);
    session.setClassification(result.classification);
    return result;
  }
}

export function classifyDocumentText(text: string): ClassificationPipelineResult {
  return new ClassificationPipeline().runOnText(text);
}

export { classifyDocument, explainClassification };
