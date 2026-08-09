import type { EntityCandidate } from "../../types/entityCandidate.js";
import type { TextBlock } from "../../types/textBlock.js";
import type { MatchSpan } from "../context.js";

export interface ExtractionHit {
  type: EntityCandidate["type"];
  value: unknown;
  raw: string;
  match: MatchSpan;
}

export type BlockExtractor = (blocks: readonly TextBlock[]) => ExtractionHit[];
