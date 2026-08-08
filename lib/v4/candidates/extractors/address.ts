import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

/** Adresse FR approximative : n° + voie + CP + ville (candidate). */
const ADDRESS_RE =
  /\b(\d{1,4}\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av\.|bd|boulevard|chemin|impasse|place|allee|allée)\s+[^\n,]{3,40})[,\s]+(\d{5})\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇ \-']{2,40})/gi;

const CP_CITY_RE =
  /\b(\d{5})\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇ \-']{2,40})\b/g;

export function extractAddressHits(
  blocks: readonly TextBlock[]
): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    ADDRESS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let foundFull = false;
    while ((m = ADDRESS_RE.exec(line)) !== null) {
      foundFull = true;
      const value = `${m[1]}, ${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim();
      hits.push({
        type: "address",
        value,
        raw: m[0].trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0].trim()
        }
      });
    }
    if (foundFull) continue;
    // Repli : code postal + ville si libellé adresse proche
    if (!/adresse|domicile|siege|siège/i.test(line) && !/adresse|domicile/i.test(blocks[i - 1]?.text || "")) {
      continue;
    }
    CP_CITY_RE.lastIndex = 0;
    while ((m = CP_CITY_RE.exec(line)) !== null) {
      const value = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
      hits.push({
        type: "address",
        value,
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
  return hits;
}
