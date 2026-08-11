/**
 * C — Extraction générique des montants.
 */

import {
  formatEuro,
  normalizeAmountKey,
  parseFrenchAmount
} from "../normalize/text.js";

// Pas de \b après € (non word-char) — sinon 370,97 € est manqué.
const AMOUNT_RE =
  /(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\s*(?:€|EUR|euros?)(?=\s|$|[.,;:)\]])/gi;
const AMOUNT_EUR_FIRST_RE =
  /(?:€|EUR)\s*(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})(?=\s|$|[.,;:)\]])/gi;

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractAmounts(text) {
  const source = String(text || "");
  const results = [];
  const seen = new Set();

  const collect = (regex) => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source))) {
      const rawNumber = match[1] || match[0];
      const numeric = parseFrenchAmount(rawNumber);
      if (!Number.isFinite(numeric)) continue;
      // Ignore très petits bruits (1 € seul sans contexte utile reste possible)
      if (numeric <= 0) continue;
      const formatted = formatEuro(numeric);
      const key = normalizeAmountKey(formatted);
      const context = snippetAround(source, match.index, 80);
      const dedupe = `${key}|${context.slice(0, 40)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      results.push({
        raw: match[0].trim(),
        value: formatted,
        numeric,
        key,
        context,
        confidence: 60
      });
    }
  };

  collect(AMOUNT_RE);
  collect(AMOUNT_EUR_FIRST_RE);

  return results.sort((a, b) => b.numeric - a.numeric);
}

function snippetAround(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
