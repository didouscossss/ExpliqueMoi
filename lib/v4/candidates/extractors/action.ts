/**
 * Actions explicites (formulaires, demandes…) — générique, hors facture.
 * Les négations évidentes (aucun / ne … pas) ne produisent PAS d’action.
 */

import type { TextBlock } from "../../types/textBlock.js";
import { normalizeLex } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

const ACTION_PATTERNS: RegExp[] = [
  /merci\s+de\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+remercions\s+de\s+([^.\n]{5,100})/gi,
  /veuillez\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+prions\s+de\s+([^.\n]{5,80})/gi,
  /vous\s+devez\s+([^.\n]{5,80})/gi,
  /(?<!ne\s)(?<!n['’])doit\s+([^.\n]{5,60})/gi,
  /transmettre\s+([^.\n]{5,80})/gi,
  // Impératifs de démarche (formulaires) — pas les négations (filtrées à part)
  /\b((?:retournez|transmettez|envoyez|compl[eé]tez|joignez)\s+[^.\n]{5,80})/gi
];

/** Négation / éventualité : ne pas extraire d’obligation. */
function isNonObligatoryLine(line: string): boolean {
  const lex = normalizeLex(line);
  if (
    /\baucun\b|\baucune\b|\bne\s+pas\b|\bn['’]est\s+pas\b|\bne\s+doit\b|\bne\s+retournez\b|\bne\s+transmettez\b/.test(
      lex
    )
  ) {
    return true;
  }
  // « vous pouvez » = possibilité, pas obligation
  if (/\bvous\s+pouvez\b/.test(lex) && !/\bvous\s+devez\b/.test(lex)) {
    return true;
  }
  // Disponibilité future ≠ demande d’action
  if (/\bsera\s+disponible\b|\bdisponible\s+[aà]\s+partir\b/.test(lex)) {
    return true;
  }
  // Formule d’accompagnement (« veuillez trouver ci-joint ») ≠ obligation métier
  if (
    /\btrouver\s+(ci[-\s]?joint|en\s+annexe|ci[-\s]?apres)\b|\bci[-\s]?joint\b/.test(
      lex
    )
  ) {
    return true;
  }
  return false;
}

export function extractActionHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (isNonObligatoryLine(line)) continue;
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
