import type { TextBlock } from "../../types/textBlock.js";
import { parseFrenchDate } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

const DATE_RE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/g;

export function extractDateHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    DATE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DATE_RE.exec(line)) !== null) {
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
  return hits;
}
