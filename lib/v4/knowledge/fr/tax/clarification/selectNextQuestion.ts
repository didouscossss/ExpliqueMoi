/**
 * Sélection déterministe de la prochaine question — V4-S.
 * Indépendante de l’ordre d’upload.
 */

import type {
  ClarificationQuestion,
  ClarificationSession,
  DocumentCase,
  RequirementPriority
} from "../../../../types/knowledge.js";

const PRIORITY_WEIGHT: Record<RequirementPriority | string, number> = {
  ambiguity: 100,
  blocking: 90,
  declarantUnknown: 80,
  yearUnknown: 70,
  supportingDocument: 40,
  secondary: 20
};

export const DEFAULT_MAX_ASKED = 2;

export function selectNextClarificationQuestion(
  session: ClarificationSession,
  docCase: DocumentCase,
  options?: { focusFieldCode?: string | null }
): ClarificationQuestion | null {
  const focus = options?.focusFieldCode || null;
  const candidates = session.questions
    .filter((q) => isAskable(q, session))
    .filter((q) => !focus || q.fieldCode === focus)
    .map((q) => scoreQuestion(q, docCase, session))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return (
        (a.requirementId || "").localeCompare(b.requirementId || "") ||
        (a.fieldCode || "").localeCompare(b.fieldCode || "") ||
        a.questionId.localeCompare(b.questionId)
      );
    });

  return candidates[0] || null;
}

function isAskable(
  q: ClarificationQuestion,
  session: ClarificationSession
): boolean {
  if (
    q.status === "answered" ||
    q.status === "resolved" ||
    q.status === "superseded" ||
    q.status === "notApplicable" ||
    q.status === "refused"
  ) {
    return false;
  }
  if (q.status === "unknown") {
    // ne pas reposer immédiatement
    return false;
  }
  if (q.askedCount >= (q.maxAskedCount || DEFAULT_MAX_ASKED)) {
    return false;
  }
  // invalid/ambiguous : une reformulation max (askedCount < 2 déjà via max)
  if (q.dependsOnQuestionId) {
    const dep = session.questions.find(
      (x) => x.questionId === q.dependsOnQuestionId
    );
    if (!dep || dep.status !== "answered") return false;
    const ans = session.answers
      .filter((a) => a.questionId === dep.questionId)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (ans && ans.normalizedValue === false) {
      // dépendance booléenne false → non applicable
      return false;
    }
  }
  return (
    q.status === "unasked" ||
    q.status === "asked" ||
    q.status === "invalid" ||
    q.status === "ambiguous"
  );
}

function scoreQuestion(
  q: ClarificationQuestion,
  docCase: DocumentCase,
  _session: ClarificationSession
): ClarificationQuestion {
  const reasons: string[] = [];
  let score = PRIORITY_WEIGHT[q.priority] || 10;
  const present = new Set(docCase.taxContext.fieldCodesPresent || []);

  const match = docCase.requirementMatches.find(
    (m) => m.requirementId === q.requirementId
  );
  if (match?.status === "ambiguous") {
    score += 50;
    reasons.push("blocking_ambiguity");
  }
  if (match?.status === "missing" && (q.priority === "blocking" || q.expectedAnswerType === "amount")) {
    score += 40;
    reasons.push("missing_required");
  }
  if (q.priority === "declarantUnknown" || /role|déclarant/i.test(q.requirementId)) {
    // Rôle prioritaire seulement s’il résout une ambiguïté sur une case présente
    // (pas « quel montant est le bon ? » d’emblée)
    const fieldPresent = q.fieldCode ? present.has(q.fieldCode) : false;
    const fieldMatches = docCase.requirementMatches.filter(
      (m) => m.fieldCode === q.fieldCode && m.status === "ambiguous"
    );
    const multiAmount =
      fieldPresent &&
      (docCase.factIndex.filter(
        (f) =>
          f.fieldCode === q.fieldCode &&
          (f.factType === "amount" || f.factType === "fieldValue") &&
          f.displayValue != null
      ).length > 1 ||
        fieldMatches.length > 0);
    if (multiAmount) {
      score += 55;
      reasons.push("role_resolves_ambiguity");
    } else if (!fieldPresent) {
      score -= 60;
      reasons.push("role_field_not_in_case");
    }
  }
  if (q.priority === "yearUnknown") {
    score += 25;
    reasons.push("year_needed");
  }
  if (q.fieldCode && present.has(q.fieldCode)) {
    score += 30;
    reasons.push("field_present_in_case");
  } else if (q.fieldCode && present.size > 0) {
    score -= 45;
    reasons.push("field_not_currently_examined");
  }
  if (match?.evidenceSource === "foundInDocument" || (match?.status === "found" && match.verdict === "strong")) {
    score -= 100;
    reasons.push("already_found_in_document");
  }
  if (match?.evidenceSource === "providedByUser") {
    score -= 100;
    reasons.push("already_provided_by_user");
  }

  reasons.push(`base_priority:${q.priority}`);

  return {
    ...q,
    priorityScore: score,
    priorityReasons: reasons
  };
}

/** Invariant : même dossier logique → même question, ordre upload inversé. */
export function assertQuestionOrderStable(
  sessionA: ClarificationSession,
  caseA: DocumentCase,
  sessionB: ClarificationSession,
  caseB: DocumentCase
): { ok: boolean; uploadOrderChangesQuestion: number } {
  const qa = selectNextClarificationQuestion(sessionA, caseA);
  const qb = selectNextClarificationQuestion(sessionB, caseB);
  const idA = qa?.questionId || null;
  const idB = qb?.questionId || null;
  // Compare requirementId+fieldCode (questionId contains caseId which is order-stable)
  const key = (q: ClarificationQuestion | null) =>
    q ? `${q.requirementId}|${q.fieldCode}|${q.expectedAnswerType}` : null;
  const ok = key(qa) === key(qb);
  return { ok, uploadOrderChangesQuestion: ok ? 0 : 1 };
}
