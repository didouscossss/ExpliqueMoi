/**
 * Helpers evidence-first pour V4-F.
 */

import type { EvidenceSpan } from "../types/evidence.js";
import type { TextBlock } from "../types/textBlock.js";
import type { UnderstandingItem } from "../types/documentUnderstanding.js";

export function enrichEvidence(
  evidence: readonly EvidenceSpan[] | undefined,
  blocks: readonly TextBlock[]
): EvidenceSpan[] {
  const out: EvidenceSpan[] = [];
  const seen = new Set<string>();
  for (const e of evidence || []) {
    const block = e.blockId
      ? blocks.find((b) => b.id === e.blockId)
      : undefined;
    const span: EvidenceSpan = {
      text: e.text || block?.text || "",
      page: e.page ?? block?.page ?? 1,
      bbox: e.bbox ?? block?.bbox ?? null,
      blockId: e.blockId ?? block?.id ?? null,
      lineId: e.lineId ?? block?.lineId ?? null
    };
    const key = `${span.blockId}|${span.page}|${span.text}`;
    if (!span.text || seen.has(key)) continue;
    seen.add(key);
    out.push(span);
  }
  return out;
}

export function evidenceFromBlocks(
  blocks: readonly TextBlock[],
  predicate: (b: TextBlock) => boolean
): EvidenceSpan[] {
  return blocks.filter(predicate).map((b) => ({
    text: b.text,
    page: b.page,
    bbox: b.bbox ?? null,
    blockId: b.id,
    lineId: b.lineId ?? null
  }));
}

/** Affirmation factuelle exposée ⇒ evidence non vide. */
export function isFactualClaim(item: UnderstandingItem): boolean {
  if (
    item.status === "missing" ||
    item.status === "notApplicable" ||
    item.status === "notFound" ||
    item.status === "unknown" ||
    item.status === "noExplicitActionDetected"
  ) {
    return false;
  }
  return item.value !== undefined && item.value !== null;
}

export function assertClaimEvidence(item: UnderstandingItem): boolean {
  if (!isFactualClaim(item)) return true;
  return item.evidence.length > 0;
}
