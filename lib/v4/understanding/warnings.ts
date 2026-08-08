/**
 * Warnings structurés V4-F.
 * Contradiction = relation qui devrait être vraie et ne l'est pas.
 */

import { toConfidence } from "../types/confidence.js";
import type { ProfileResolutionResult } from "../types/documentProfile.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import type {
  UnderstandingUncertainty,
  UnderstandingWarning
} from "../types/documentUnderstanding.js";
import { enrichEvidence } from "./evidence.js";

export function buildWarnings(
  resolution: ProfileResolutionResult,
  consistency: ConsistencyResult | null,
  relations: readonly Relation[],
  blocks: readonly TextBlock[]
): UnderstandingWarning[] {
  const warnings: UnderstandingWarning[] = [];

  // Contradictions arithmétiques / globales
  for (const c of consistency?.contradictions || []) {
    const evidence = enrichEvidence(c.evidence, blocks);
    const isArith =
      /HT|TVA|TTC|arithmetic|≠|!=/i.test(c.message) ||
      c.kind.includes("arithmetic");
    warnings.push({
      kind: isArith ? "arithmeticContradiction" : "conflictingValues",
      message: c.message,
      relatedKinds: c.subjectIds,
      confidence: toConfidence(0.85),
      evidence,
      derivedFrom: [`contradiction:${c.id}`, ...c.subjectIds.map((id) => `candidate:${id}`)],
      reasoning: c.reasons
    });
  }

  // Champs requis manquants (pas une affirmation négative factuelle)
  for (const name of resolution.completeness.missingRequired) {
    warnings.push({
      kind: "missingExpectedField",
      message: `Champ attendu non résolu: ${name}`,
      relatedKinds: [name],
      confidence: toConfidence(0.7),
      evidence: [],
      derivedFrom: [`field:${name}`, "status:missing"],
      reasoning: [{ signal: "missingExpectedField", delta: 0 }]
    });
  }

  // Ambiguïtés
  for (const f of resolution.fields) {
    if (f.status !== "ambiguous") continue;
    warnings.push({
      kind: "ambiguousField",
      message: `Champ ambigu: ${f.field}`,
      relatedKinds: [f.field],
      confidence: f.confidence || toConfidence(0.5),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || [{ signal: "ambiguousField", delta: -0.1 }]
    });
  }

  // Faible confiance sur champs critiques
  for (const f of resolution.fields) {
    if (f.status !== "resolved") continue;
    if ((f.confidence?.score ?? 1) >= 0.45) continue;
    if (f.expectation.importance !== "critical" && f.expectation.importance !== "high") {
      continue;
    }
    warnings.push({
      kind: "lowConfidence",
      message: `Faible confiance: ${f.field}`,
      relatedKinds: [f.field],
      confidence: f.confidence || toConfidence(0.3),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: [{ signal: "lowConfidence", delta: -0.1 }]
    });
  }

  // Relations attendues non résolues (soft)
  const hasActionDeadline = relations.some((r) => r.type === "actionDeadline");
  const expectsAction = resolution.fields.some(
    (f) => f.field === "requestedActions" && f.status === "resolved"
  );
  const expectsDeadline = resolution.fields.some(
    (f) =>
      (f.field === "deadlines" || f.field === "paymentDeadline") &&
      f.status === "resolved"
  );
  if (expectsAction && expectsDeadline && !hasActionDeadline) {
    warnings.push({
      kind: "unresolvedRelation",
      message: "Action et échéance présentes sans relation actionDeadline forte",
      relatedKinds: ["requestedActions", "deadlines"],
      confidence: toConfidence(0.55),
      evidence: [],
      derivedFrom: ["relation:actionDeadline:missing"],
      reasoning: [{ signal: "unresolvedRelation", delta: -0.05 }]
    });
  }

  return warnings;
}

export function buildUncertainties(
  resolution: ProfileResolutionResult,
  blocks: readonly TextBlock[]
): UnderstandingUncertainty[] {
  const out: UnderstandingUncertainty[] = [];
  for (const f of resolution.fields) {
    if (f.status !== "ambiguous") continue;
    const alts = f.alternatives?.length
      ? f.alternatives
      : [
          {
            value: f.value,
            confidence: f.confidence?.score ?? 0.5,
            candidateIds: f.candidateIds || [],
            reasons: f.reasons || []
          }
        ];
    out.push({
      kind: f.field,
      status: "ambiguous",
      candidates: alts.map((a) => ({
        value: a.value,
        confidence: a.confidence,
        evidence: enrichEvidence(f.evidence, blocks),
        derivedFrom: (a.candidateIds || []).map((id) => `candidate:${id}`)
      })),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || [{ signal: "ambiguous", delta: -0.1 }]
    });
  }
  return out;
}
