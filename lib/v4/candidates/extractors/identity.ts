import type { TextBlock } from "../../types/textBlock.js";
import { normalizeLex } from "../normalize.js";
import type { ExtractionHit } from "./types.js";

const CIVILITIES =
  /\b(m\.?|mme|mlle|mr|monsieur|madame|mademoiselle)\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇéèêàâîïôûùç'’\-]+(?:\s+[A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇéèêàâîïôûùç'’\-]+){0,3})/gi;

const ORG_RE =
  /\b((?:SAS|SARL|SA|SCI|EURL|SNC|SASU)\s+[A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ][A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ &\-'’]{2,60}|\b[A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ &\-'’]{2,40}\s+(?:SAS|SARL|SA|SCI|EURL))\b/g;

function isNumericId(value: string): boolean {
  return /^\d{5,}$/.test(value.replace(/\s/g, ""));
}

function looksLikeClientNumberContext(line: string): boolean {
  const lex = normalizeLex(line);
  return /n[°o]?\s*client|numero\s+client|id\s+client|compte\s+client/.test(lex);
}

export function extractPersonHits(blocks: readonly TextBlock[]): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (looksLikeClientNumberContext(line)) continue;
    CIVILITIES.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CIVILITIES.exec(line)) !== null) {
      const value = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
      if (isNumericId(m[2])) continue;
      hits.push({
        type: "person",
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

export function extractOrganizationHits(
  blocks: readonly TextBlock[]
): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    ORG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ORG_RE.exec(line)) !== null) {
      const value = m[1].replace(/\s+/g, " ").trim();
      if (value.length < 3) continue;
      hits.push({
        type: "organization",
        value,
        raw: value,
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: value
        }
      });
    }
  }
  return hits;
}
