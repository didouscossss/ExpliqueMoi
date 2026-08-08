import type { TextBlock } from "../../types/textBlock.js";
import { parseFrenchMoney } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

/**
 * Détecte les montants monétaires FR.
 * Ne crée PAS de rôle métier (amountHT etc.) — MoneyCandidate seulement.
 */
// Entiers avec devise acceptés (ex. « 100 € ») — sans devise, les entiers seuls
// sont filtrés plus bas pour éviter les n° client / SIRET.
const MONEY_RE =
  /(?<![\w.])(\d{1,3}(?:[ .\u00a0]\d{3})+,\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:\s*(?:€|eur|euros?))?/gi;

export function extractMoneyHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    MONEY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MONEY_RE.exec(line)) !== null) {
      const raw = m[0];
      // Ignorer les pourcentages (ex. 20,00 % capturé sans %)
      const after = line.slice(m.index + raw.length, m.index + raw.length + 4);
      if (/^\s*%/.test(after)) continue;
      // Exiger une forme monétaire ou décimales (évite n° entiers)
      const hasCurrency = /€|eur/i.test(raw);
      const hasDecimals = /[.,]\d{1,2}/.test(raw);
      if (!hasCurrency && !hasDecimals) continue;

      const value = parseFrenchMoney(raw);
      if (value == null) continue;
      hits.push({
        type: "money",
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
