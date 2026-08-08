/**
 * ActionUnderstanding — actions explicites uniquement.
 * noExplicitActionDetected ≠ nothingToDo.
 */

import { toConfidence } from "../types/confidence.js";
import type { ResolvedField } from "../types/documentProfile.js";
import type { EntityCandidate } from "../types/entityCandidate.js";
import type { Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import type {
  ActionUnderstanding,
  UnderstandingItem
} from "../types/documentUnderstanding.js";
import { enrichEvidence } from "./evidence.js";
import { importanceFor } from "./importance.js";
import type { DocumentTypeId } from "../types/documentClassification.js";

function deadlineItemFromRelation(
  rel: Relation,
  candidates: readonly EntityCandidate[],
  blocks: readonly TextBlock[],
  type: DocumentTypeId
): UnderstandingItem | null {
  const dateCand = candidates.find(
    (c) =>
      (c.id === rel.targetCandidateId || c.id === rel.sourceCandidateId) &&
      (c.type === "date" || c.type === "deadline")
  );
  if (!dateCand) return null;
  const evidence = enrichEvidence(dateCand.evidence, blocks);
  if (!evidence.length) return null;
  return {
    kind: "actionDeadline",
    value: dateCand.value,
    confidence: toConfidence(rel.score),
    status: "resolved",
    importance: importanceFor(type, "actionDeadline", "critical"),
    evidence,
    derivedFrom: [
      `relation:${rel.id}`,
      `candidate:${dateCand.id}`,
      "relationType:actionDeadline"
    ],
    reasoning: rel.reasons
  };
}

export function buildActions(
  type: DocumentTypeId,
  fields: readonly ResolvedField[],
  candidates: readonly EntityCandidate[],
  relations: readonly Relation[],
  blocks: readonly TextBlock[]
): ActionUnderstanding[] {
  const actions: ActionUnderstanding[] = [];
  const actionRels = relations.filter((r) => r.type === "actionDeadline");

  const actionField = fields.find(
    (f) =>
      (f.field === "requestedActions" || f.field === "obligations") &&
      (f.status === "resolved" || f.status === "ambiguous")
  );

  const actionCandidates = candidates.filter((c) => c.type === "action");

  // Via relations action↔deadline (fort)
  for (const rel of actionRels) {
    const actionCand = candidates.find(
      (c) =>
        (c.id === rel.sourceCandidateId || c.id === rel.targetCandidateId) &&
        c.type === "action"
    );
    if (!actionCand) continue;
    const evidence = enrichEvidence(
      [...(actionCand.evidence || []), ...(rel.evidence || [])],
      blocks
    );
    if (!evidence.length) continue;
    const deadline = deadlineItemFromRelation(rel, candidates, blocks, type);
    actions.push({
      actionType: "requestedAction",
      description: String(actionCand.value),
      actor: null,
      target: null,
      deadline,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(rel.score),
      evidence,
      status: "resolved",
      derivedFrom: [
        `candidate:${actionCand.id}`,
        `relation:${rel.id}`,
        ...(deadline ? deadline.derivedFrom : [])
      ],
      reasoning: [
        ...rel.reasons,
        { signal: "actionDeadline:linked", delta: 0.2 }
      ]
    });
  }

  // Actions sans deadline liée
  for (const c of actionCandidates) {
    if (actions.some((a) => a.derivedFrom.includes(`candidate:${c.id}`))) {
      continue;
    }
    const evidence = enrichEvidence(c.evidence, blocks);
    if (!evidence.length) continue;
    actions.push({
      actionType: "requestedAction",
      description: String(c.value),
      actor: null,
      target: null,
      deadline: null,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(c.hypotheses[0]?.score ?? 0.5),
      evidence,
      status: "resolved",
      derivedFrom: [`candidate:${c.id}`],
      reasoning: c.hypotheses[0]?.reasons || [
        { signal: "action:explicit", delta: 0.4 }
      ]
    });
  }

  // Field-level actions (multiple)
  if (actionField && Array.isArray(actionField.value)) {
    for (const v of actionField.value) {
      if (actions.some((a) => a.description === String(v))) continue;
      const evidence = enrichEvidence(actionField.evidence, blocks);
      if (!evidence.length) continue;
      actions.push({
        actionType: "requestedAction",
        description: String(v),
        actor: null,
        target: null,
        deadline: null,
        requiredDocuments: [],
        conditions: [],
        confidence: actionField.confidence || toConfidence(0.5),
        evidence,
        status: actionField.status,
        derivedFrom: [`field:${actionField.field}`],
        reasoning: actionField.reasons || []
      });
    }
  }

  if (!actions.length) {
    // Structure explicite : aucune action EXPLICITE détectée — pas "nothingToDo"
    actions.push({
      actionType: "none",
      description: null,
      actor: null,
      target: null,
      deadline: null,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(0.9),
      evidence: [],
      status: "noExplicitActionDetected",
      derivedFrom: ["scan:actions"],
      reasoning: [{ signal: "noExplicitActionDetected", delta: 0 }]
    });
  }

  return actions;
}
