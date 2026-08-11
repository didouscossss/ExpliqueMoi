/**
 * C — Extraction générique agrégée.
 */

import { extractDatesAndPeriods } from "./dates.js";
import { extractAmounts } from "./amounts.js";
import { extractEntities } from "./entities.js";
import { extractActionPhrases } from "./actions.js";

/**
 * @param {string} text
 */
export function extractGenericSignals(text) {
  const { dates, periods } = extractDatesAndPeriods(text);
  const amounts = extractAmounts(text);
  const entities = extractEntities(text);
  const actionPhrases = extractActionPhrases(text);

  return {
    dates,
    periods,
    amounts,
    entities,
    actionPhrases,
    charCount: String(text || "").replace(/\s+/g, "").length
  };
}
