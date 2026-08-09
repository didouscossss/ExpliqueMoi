import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { Relation } from "../types/relation.js";
import { contextHas, evidenceOf, pushReason, roleScore, sumReasons } from "./helpers.js";
import { nextRelationId } from "./ids.js";
import { RELATION_WEIGHTS as W } from "./weights.js";

/**
 * Relie une action explicite à une date / deadline proche.
 */
export function scanActionDeadlineRelations(
  candidates: readonly EntityCandidate[]
): Relation[] {
  const actions = candidates.filter((c) => c.type === "action");
  const dates = candidates.filter(
    (c) => c.type === "date" || c.type === "deadline"
  );
  const relations: Relation[] = [];

  for (const action of actions) {
    for (const date of dates) {
      const sameLine =
        action.context?.sameLine &&
        date.context?.sameLine &&
        action.context.sameLine === date.context.sameLine;
      const near =
        sameLine ||
        action.page === date.page &&
          (contextHas(action, /avant\s+le|au\s+plus\s+tard|delai/) ||
            contextHas(date, /avant\s+le|au\s+plus\s+tard|merci\s+de/));

      if (!near && !sameLine) continue;

      const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
      pushReason(reasons, "relation:actionDeadline", W.actionDeadline);
      if (sameLine) pushReason(reasons, "spatial:sameLine", W.sameLine);
      if (roleScore(date, "deadline") > 0.3) {
        pushReason(reasons, "local:deadlineHypothesis", roleScore(date, "deadline") * 0.15);
      }
      if (roleScore(action, "requestedAction") > 0.3) {
        pushReason(
          reasons,
          "local:requestedAction",
          roleScore(action, "requestedAction") * 0.15
        );
      }
      pushReason(reasons, "temporal:beforeCue", W.temporalBefore);

      relations.push({
        id: nextRelationId("act"),
        sourceCandidateId: action.id,
        targetCandidateId: date.id,
        type: "actionDeadline",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(action, date),
        label: "action ↔ deadline"
      });
    }
  }
  return relations;
}
