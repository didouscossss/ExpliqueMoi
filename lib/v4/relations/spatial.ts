import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { Relation } from "../types/relation.js";
import { evidenceOf, pushReason, samePage, sumReasons } from "./helpers.js";
import { nextRelationId } from "./ids.js";
import { RELATION_WEIGHTS as W } from "./weights.js";

/**
 * Relations spatiales / section (génériques, sans layout OCR avancé).
 */
export function scanSpatialRelations(
  candidates: readonly EntityCandidate[]
): Relation[] {
  const relations: Relation[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (!samePage(a, b)) continue;

      const aLine = a.context?.sameLine || "";
      const bLine = b.context?.sameLine || "";
      const aPrev = a.context?.previousLine || "";
      const bPrev = b.context?.previousLine || "";

      if (aLine && aLine === bLine) {
        const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
        pushReason(reasons, "spatial:sameLine", W.sameLine);
        relations.push({
          id: nextRelationId("spat"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "spatial",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(a, b),
          label: "sameLine"
        });
      } else if (
        aLine &&
        (aLine === bPrev || bLine === aPrev || a.context?.nextLine === bLine)
      ) {
        const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
        pushReason(reasons, "spatial:adjacentLine", W.adjacentLine);
        relations.push({
          id: nextRelationId("spat"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "spatial",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(a, b),
          label: "adjacentLine"
        });
      }

      // sameSection heuristique : même page + proximité lexicale de titres
      if (
        /total|tva|facture|emetteur|destinataire/i.test(aLine) &&
        /total|tva|facture|emetteur|destinataire/i.test(bLine)
      ) {
        relations.push({
          id: nextRelationId("sect"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "sameSection",
          score: W.sameSection,
          reasons: [{ signal: "spatial:sameSectionHeuristic", delta: W.sameSection }],
          evidence: evidenceOf(a, b),
          label: "sameSection"
        });
      }
    }
  }
  return relations;
}
