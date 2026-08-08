import type { TextBlock } from "../../types/textBlock.js";
import { normalizeLex } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

/**
 * Références typées (n° client, n° facture, dossier…).
 * Favorise reference — jamais person.
 */
const REF_PATTERNS: Array<{ re: RegExp; label: string }> = [
  {
    re: /n[°oº]\s*client\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "client"
  },
  {
    re: /n[°oº]\s*(?:de\s*)?facture\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "facture"
  },
  {
    re: /(?:ref(?:erence)?|dossier)\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "ref"
  }
];

export function extractReferenceHits(
  blocks: readonly TextBlock[]
): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    for (const { re } of REF_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const value = m[1].trim();
        // Ne pas prendre une date
        if (/^\d{1,2}[\/.\-]\d{1,2}/.test(value)) continue;
        const start = m.index + m[0].indexOf(m[1]);
        hits.push({
          type: "reference",
          value,
          raw: m[0].trim(),
          match: {
            blockIndex: i,
            start,
            end: start + m[1].length,
            raw: value
          }
        });
      }
    }
    // Garde-fou : « N° client : 2009682949 » même si regex rate l’accent OCR
    const lex = normalizeLex(line);
    if (/n[°o]?\s*client/.test(lex)) {
      const num = line.match(/\b(\d{6,})\b/);
      if (num) {
        const already = hits.some(
          (h) => h.type === "reference" && h.value === num[1]
        );
        if (!already) {
          hits.push({
            type: "reference",
            value: num[1],
            raw: num[1],
            match: {
              blockIndex: i,
              start: num.index || 0,
              end: (num.index || 0) + num[1].length,
              raw: num[1]
            }
          });
        }
      }
    }
  }
  return hits;
}
