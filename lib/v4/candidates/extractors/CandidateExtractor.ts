/**
 * CandidateExtractor — TextBlock[] → EntityCandidate[] (sans rôles métier définitifs).
 * Hypothèses scorées ajoutées ensuite par HypothesisEngine.
 */

import type { EntityCandidate } from "../../types/entityCandidate.js";
import type { EvidenceSpan } from "../../types/evidence.js";
import type { TextBlock } from "../../types/textBlock.js";
import { buildContext } from "../context.js";
import { nextCandidateId } from "../ids.js";
import { extractAddressHits } from "./address.js";
import { extractBicHits, extractIbanHits } from "./banking.js";
import { extractSirenHits, extractSiretHits } from "./companyIds.js";
import { extractEmailHits, extractPhoneHits } from "./contact.js";
import { extractDateHits } from "./date.js";
import { extractOrganizationHits, extractPersonHits } from "./identity.js";
import { extractMoneyHits } from "./money.js";
import { extractPercentageHits } from "./percentage.js";
import { extractReferenceHits } from "./reference.js";
import type { ExtractionHit } from "./types.js";

const EXTRACTORS = [
  extractMoneyHits,
  extractPercentageHits,
  extractDateHits,
  extractReferenceHits,
  extractEmailHits,
  extractPhoneHits,
  extractIbanHits,
  extractBicHits,
  extractSiretHits,
  extractSirenHits,
  extractPersonHits,
  extractOrganizationHits,
  extractAddressHits
] as const;

function hitKey(hit: ExtractionHit): string {
  return `${hit.type}|${String(hit.value)}|${hit.match.blockIndex}|${hit.match.start}`;
}

function toCandidate(
  hit: ExtractionHit,
  blocks: readonly TextBlock[]
): EntityCandidate {
  const block = blocks[hit.match.blockIndex];
  const context = buildContext(blocks, hit.match);
  const evidence: EvidenceSpan[] = [
    {
      text: context.sameLine.trim() || hit.raw,
      page: block?.page ?? 1,
      bbox: block?.bbox ?? null,
      blockId: block?.id ?? null,
      lineId: block?.lineId ?? null
    }
  ];
  return {
    id: nextCandidateId(hit.type),
    type: hit.type,
    value: hit.value,
    raw: hit.raw,
    hypotheses: [],
    evidence,
    page: block?.page ?? 1,
    blockIds: block ? [block.id] : [],
    bbox: block?.bbox ?? null,
    context
  };
}

export interface CandidateExtractorOptions {
  /** Extracteurs additionnels (extensibilité). */
  extraExtractors?: Array<(blocks: readonly TextBlock[]) => ExtractionHit[]>;
}

export class CandidateExtractor {
  private readonly extractors: Array<
    (blocks: readonly TextBlock[]) => ExtractionHit[]
  >;

  constructor(options: CandidateExtractorOptions = {}) {
    this.extractors = [...EXTRACTORS, ...(options.extraExtractors || [])];
  }

  extract(blocks: readonly TextBlock[]): EntityCandidate[] {
    const seen = new Set<string>();
    const candidates: EntityCandidate[] = [];
    for (const extract of this.extractors) {
      for (const hit of extract(blocks)) {
        const key = hitKey(hit);
        if (seen.has(key)) continue;
        // Un même span ne doit pas être person s’il est déjà reference
        if (hit.type === "person") {
          const asRef = [...seen].some((k) =>
            k.startsWith(`reference|${String(hit.value)}|`)
          );
          if (asRef) continue;
          if (/^\d+$/.test(String(hit.value).replace(/\s/g, ""))) continue;
        }
        seen.add(key);
        candidates.push(toCandidate(hit, blocks));
      }
    }
    return candidates;
  }
}

export function extractCandidates(
  blocks: readonly TextBlock[],
  options?: CandidateExtractorOptions
): EntityCandidate[] {
  return new CandidateExtractor(options).extract(blocks);
}
