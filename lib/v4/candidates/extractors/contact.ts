import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;

export function extractEmailHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    EMAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMAIL_RE.exec(line)) !== null) {
      hits.push({
        type: "email",
        value: m[0].toLowerCase(),
        raw: m[0],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0]
        }
      });
    }
  }
  return hits;
}

export function extractPhoneHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    PHONE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHONE_RE.exec(line)) !== null) {
      const raw = m[0];
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10) continue;
      hits.push({
        type: "phone",
        value: digits,
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
