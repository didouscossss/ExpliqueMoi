import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

const SIRET_RE = /\b(\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{5})\b/g;
const SIREN_RE = /\b(?:siren|siret)?\s*[:\s]*(\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{3})\b/gi;

export function extractSiretHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (!/siret/i.test(line) && !/\d{14}/.test(line.replace(/\s/g, ""))) {
      // Exiger le mot SIRET ou 14 chiffres groupés
    }
    SIRET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SIRET_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length !== 14) continue;
      if (!/siret/i.test(line) && !/siret/i.test(blocks[i - 1]?.text || "")) {
        continue;
      }
      hits.push({
        type: "siret",
        value: compact,
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}

export function extractSirenHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (!/siren\b/i.test(line)) continue;
    SIREN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SIREN_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length !== 9) continue;
      hits.push({
        type: "siren",
        value: compact,
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index + m[0].indexOf(m[1]),
          end: m.index + m[0].indexOf(m[1]) + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}
