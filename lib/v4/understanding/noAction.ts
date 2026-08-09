/**
 * Preuve explicite de non-action (« vous n'avez rien à faire »).
 * actionRequired=false ≠ action utilisateur.
 */

import { toConfidence } from "../types/confidence.js";
import type { UnderstandingItem } from "../types/documentUnderstanding.js";
import type { TextBlock } from "../types/textBlock.js";
import { normalizeLex } from "../candidates/normalize.js";
import { evidenceFromBlocks } from "./evidence.js";

const NO_ACTION_RE =
  /rien\s+a\s+faire|n['’]avez\s+rien\s+a\s+faire|aucune\s+demarche\s+(n['’]est|ne\s+sera)|pas\s+d['’]action\s+(a\s+)?effectuer|aucune\s+action\s+(n['’]est|requise)/i;

export function detectExplicitNoAction(
  blocks: readonly TextBlock[]
): UnderstandingItem | null {
  const hit = blocks.find((b) => NO_ACTION_RE.test(normalizeLex(b.text)));
  if (!hit) return null;
  const evidence = evidenceFromBlocks(blocks, (b) =>
    NO_ACTION_RE.test(normalizeLex(b.text))
  );
  if (!evidence.length) return null;
  return {
    kind: "actionRequired",
    value: false,
    confidence: toConfidence(0.9),
    status: "resolved",
    importance: "high",
    evidence: evidence.slice(0, 3),
    derivedFrom: ["scan:explicitNoAction"],
    reasoning: [{ signal: "content:rienAFaire", delta: 0.9 }]
  };
}
