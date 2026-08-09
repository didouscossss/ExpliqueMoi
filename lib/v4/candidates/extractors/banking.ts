import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

const IBAN_RE =
  /\b([A-Z]{2}\d{2}(?:[ \u00a0]?[A-Z0-9]{4}){2,8}[A-Z0-9]{0,4})\b/g;
const BIC_RE = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;

export function extractIbanHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    IBAN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IBAN_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length < 15 || compact.length > 34) continue;
      if (!/^FR/i.test(compact) && !/^[A-Z]{2}\d{2}/.test(compact)) continue;
      hits.push({
        type: "iban",
        value: compact.toUpperCase(),
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

export function extractBicHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    // Uniquement si la ligne mentionne BIC pour limiter les faux positifs
    if (!/\bbic\b/i.test(line)) continue;
    BIC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BIC_RE.exec(line)) !== null) {
      if (/^(IBAN|TOTAL|FACTURE)$/i.test(m[1])) continue;
      hits.push({
        type: "bic",
        value: m[1].toUpperCase(),
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
