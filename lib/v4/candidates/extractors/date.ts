import type { TextBlock } from "../../types/textBlock.js";
import { parseFrenchDate } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

const DATE_NUM_RE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/g;
const DATE_NAMED_RE =
  /\b(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/gi;

export function extractDateHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    for (const re of [DATE_NUM_RE, DATE_NAMED_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const value = parseFrenchDate(raw);
        if (!value) continue;
        hits.push({
          type: "date",
          value,
          raw,
          match: {
            blockIndex: i,
            start: m.index,
            end: m.index + raw.length,
            raw
          }
        });
      }
    }
  }
  return hits;
}
