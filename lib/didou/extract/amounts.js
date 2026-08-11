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
      const context = evidenceAround(source, match.index, match[0]);
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

function evidenceAround(text, index, rawMatch) {
  const source = String(text || "");
  const beforeNl = source.lastIndexOf("\n", Math.max(0, index - 1));
  const afterNl = source.indexOf("\n", index + String(rawMatch || "").length);
  const lineStart = beforeNl >= 0 ? beforeNl + 1 : 0;
  const lineEnd = afterNl >= 0 ? afterNl : source.length;
  const line = cleanEvidence(source.slice(lineStart, lineEnd));

  // Une vraie ligne OCR est une meilleure preuve qu'une fenêtre arbitraire de 160 caractères.
  if (line && line.length <= 220) return line;

  const start = Math.max(0, index - 65);
  const end = Math.min(source.length, index + String(rawMatch || "").length + 65);
  return cleanEvidence(source.slice(start, end));
}

function cleanEvidence(value) {
  return String(value || "")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .slice(0, 220);
}
