import type { TextBlock } from "../../types/textBlock.js";
import { parseFrenchPercentage } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

const PCT_RE = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g;

export function extractPercentageHits(
  blocks: readonly TextBlock[]
): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    PCT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PCT_RE.exec(line)) !== null) {
      const raw = m[0];
      const value = parseFrenchPercentage(raw);
      if (value == null) continue;
      hits.push({
        type: "percentage",
        value,
        raw: raw.trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + raw.length,
          raw: raw.trim()
        }
      });
    }
  }
  return hits;
}
