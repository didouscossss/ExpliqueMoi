/**
 * Actions explicites (formulaires, demandes…) — générique, hors facture.
 */

import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

const ACTION_PATTERNS: RegExp[] = [
  /merci\s+de\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+remercions\s+de\s+([^.\n]{5,100})/gi,
  /veuillez\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+prions\s+de\s+([^.\n]{5,80})/gi,
  /vous\s+devez\s+([^.\n]{5,80})/gi,
  /doit\s+([^.\n]{5,60})/gi,
  /transmettre\s+([^.\n]{5,80})/gi
];

export function extractActionHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    for (const re of ACTION_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const phrase = (m[1] || m[0]).replace(/\s+/g, " ").trim();
        if (phrase.length < 5) continue;
        hits.push({
          type: "action",
          value: phrase,
          raw: m[0].trim(),
          match: {
            blockIndex: i,
            start: m.index,
            end: m.index + m[0].length,
            raw: m[0].trim()
          }
        });
      }
    }
  }
  return hits;
}
