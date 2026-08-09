/**
 * Audit clarification V4-S — npm run knowledge:tax:clarification:audit
 */

import type {
  ClarificationSession,
  ClarificationState,
  DocumentCase
} from "../../../../types/knowledge.js";

export interface ClarificationAuditReport {
  ok: boolean;
  violations: string[];
  invariants: ClarificationSession["invariants"] | null;
}

export function auditClarificationState(
  state: ClarificationState
): ClarificationAuditReport {
  return auditClarification(state.documentCase, state.session);
}

export function auditClarification(
  docCase: DocumentCase,
  session?: ClarificationSession | null
): ClarificationAuditReport {
  const sess = session || docCase.clarificationSession;
  const violations: string[] = [];

  if (!sess) {
    return { ok: true, violations: [], invariants: null };
  }

  for (const [k, v] of Object.entries(sess.invariants)) {
    if (typeof v === "number" && v > 0) {
      violations.push(`${k}=${v}`);
    }
  }

  for (const f of sess.activeUserFacts) {
    if (f.kind !== "user") {
      violations.push(`userFact.kind:${f.factId}`);
    }
    if (f.source !== "user" && f.source !== "clarification") {
      violations.push(`userFact.source:${f.factId}`);
    }
    // Ne doit pas apparaître comme DocumentFact
    if (
      docCase.factIndex.some(
        (df) =>
          df.factId === f.factId ||
          (df.provenanceNote || "").includes("OfficialKnowledge")
      )
    ) {
      // user facts are not in factIndex by design — if factId collides, bad
      if (docCase.factIndex.some((df) => df.factId === f.factId)) {
        violations.push(`userFactInDocumentIndex:${f.factId}`);
      }
    }
  }

  for (const c of docCase.conflicts) {
    if (c.kind === "userVsDocument" && c.resolution && c.resolution !== "unresolved" && c.resolution !== "acknowledged") {
      violations.push(`autoResolvedConflict:${c.conflictId}`);
    }
  }

  for (const q of sess.questions) {
    if (!q.provenance?.length) violations.push(`missingProvenance:${q.questionId}`);
    if (q.askedCount > q.maxAskedCount) {
      violations.push(`loop:${q.questionId}`);
    }
  }

  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
  }

  return {
    ok: violations.length === 0,
    violations,
    invariants: sess.invariants
  };
}
