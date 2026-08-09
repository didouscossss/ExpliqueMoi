/**
 * Hash / normalisation déterministes pour DocumentCase — V4-R.
 */

import { createHash } from "node:crypto";

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase();
}

export function hashDocumentContent(text: string): string {
  return createHash("sha256")
    .update(normalizeDocumentText(text), "utf8")
    .digest("hex");
}

/** Similarité lexicale prudente (Jaccard tokens) — versions ≠ doublons. */
export function textSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeDocumentText(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeDocumentText(b).split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

export function buildCaseId(contentHashes: readonly string[]): string {
  const sorted = [...contentHashes].sort();
  return `case-${createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 16)}`;
}

/** ID stable contenu ; indexOccurrence pour copies multiples du même hash. */
export function buildDocumentId(
  contentHash: string,
  occurrenceIndex: number = 0
): string {
  if (occurrenceIndex <= 0) return `d-${contentHash.slice(0, 14)}`;
  return `d-${contentHash.slice(0, 14)}-x${occurrenceIndex}`;
}
