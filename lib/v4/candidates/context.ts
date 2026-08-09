/**
 * Contexte local autour d’un match dans une liste de TextBlock (1 ligne ≈ 1 block).
 */

import type { CandidateContext } from "../types/entityCandidate.js";
import type { TextBlock } from "../types/textBlock.js";

export interface MatchSpan {
  blockIndex: number;
  start: number;
  end: number;
  raw: string;
}

export function lineOf(blocks: readonly TextBlock[], index: number): string {
  return blocks[index]?.text ?? "";
}

export function buildContext(
  blocks: readonly TextBlock[],
  match: MatchSpan
): CandidateContext {
  const sameLine = lineOf(blocks, match.blockIndex);
  const previousLine = lineOf(blocks, match.blockIndex - 1);
  const nextLine = lineOf(blocks, match.blockIndex + 1);
  const before = sameLine.slice(0, match.start);
  const after = sameLine.slice(match.end);
  return { sameLine, previousLine, nextLine, before, after };
}

export function contextBlob(ctx: CandidateContext): string {
  return [ctx.previousLine, ctx.before, ctx.after, ctx.nextLine, ctx.sameLine]
    .filter(Boolean)
    .join(" ");
}

/** Découpe un texte plat en TextBlock (une ligne = un block). */
export function blocksFromPlainText(
  text: string,
  source: "pdfjs" | "ocr" | "text" = "text"
): TextBlock[] {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  return lines.map((line, i) => ({
    id: `line_${i + 1}`,
    text: line,
    page: 1,
    lineId: `L${i + 1}`,
    blockId: `B${i + 1}`,
    source,
    bbox: null
  }));
}
