/**
 * C — Extraction générique des dates / périodes.
 */

import { normalizeDateKey } from "../normalize/text.js";

const DATE_RE =
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
const VERBAL_DATE_RE =
  /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/gi;
const PERIOD_MONTH_RE =
  /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/gi;
const PERIOD_RANGE_RE =
  /\b(?:du|période(?:\s+du)?)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(?:au|à)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/gi;

/**
 * @param {string} text
 * @returns {{ dates: object[], periods: object[] }}
 */
export function extractDatesAndPeriods(text) {
  const source = String(text || "");
  const dates = [];
  const periods = [];
  const seen = new Set();

  const pushDate = (raw, index, hint = "") => {
    const value = String(raw).trim();
    const key = normalizeDateKey(value);
    if (!key || seen.has(`d:${key}:${hint}`)) return;
    seen.add(`d:${key}:${hint}`);
    const context = snippetAround(source, index, 70);
    dates.push({
      raw: value,
      key,
      context,
      hint,
      confidence: hint ? 70 : 55
    });
  };

  let match;
  DATE_RE.lastIndex = 0;
  while ((match = DATE_RE.exec(source))) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    pushDate(
      `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`,
      match.index
    );
  }

  VERBAL_DATE_RE.lastIndex = 0;
  while ((match = VERBAL_DATE_RE.exec(source))) {
    pushDate(match[0], match.index);
  }

  PERIOD_MONTH_RE.lastIndex = 0;
  while ((match = PERIOD_MONTH_RE.exec(source))) {
    const value = `${capitalize(match[1])} ${match[2]}`;
    const key = normalizeDateKey(value);
    if (seen.has(`p:${key}`)) continue;
    seen.add(`p:${key}`);
    periods.push({
      raw: value,
      key,
      kind: "month",
      context: snippetAround(source, match.index, 80),
      confidence: 75
    });
  }

  PERIOD_RANGE_RE.lastIndex = 0;
  while ((match = PERIOD_RANGE_RE.exec(source))) {
    const value = `${match[1]} → ${match[2]}`;
    const key = `${normalizeDateKey(match[1])}_${normalizeDateKey(match[2])}`;
    if (seen.has(`p:${key}`)) continue;
    seen.add(`p:${key}`);
    periods.push({
      raw: value,
      key,
      kind: "range",
      start: match[1],
      end: match[2],
      context: snippetAround(source, match.index, 90),
      confidence: 80
    });
  }

  return { dates, periods };
}

function snippetAround(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
