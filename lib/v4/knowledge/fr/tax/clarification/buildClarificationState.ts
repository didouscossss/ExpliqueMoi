/**
 * Construit / synchronise ClarificationSession depuis un DocumentCase — V4-S.
 */

import { createHash } from "node:crypto";
import type {
  ClarificationInvariants,
  ClarificationQuestion,
  ClarificationSession,
  DocumentCase,
  ClarificationAnswerType,
  RequirementEvidenceSource
} from "../../../../types/knowledge.js";
import { DEFAULT_MAX_ASKED, selectNextClarificationQuestion } from "./selectNextQuestion.js";

export function emptyClarificationInvariants(): ClarificationInvariants {
  return {
    userFactPromotedToDocumentFact: 0,
    userFactPromotedToOfficialKnowledge: 0,
    unknownPromotedToKnown: 0,
    refusedPromotedToNegative: 0,
    invalidAnswerAccepted: 0,
    ambiguousAnswerPromotedToCertain: 0,
    userDocumentConflictAutoResolved: 0,
    userUserConflictLost: 0,
    crossYearAnswerPromoted: 0,
    crossRoleAnswerPromoted: 0,
    clarificationLoopDetected: 0,
    questionRepeatedAfterRefusal: 0,
    questionRepeatedAfterUnknownImmediately: 0,
    uploadOrderChangesQuestion: 0,
    automaticUnsafeAggregation: 0,
    unsupportedEligibilityDecision: 0,
    missingProvenance: 0
  };
}

function mapAnswerType(t: string | undefined): ClarificationAnswerType {
  switch (t) {
    case "amount":
    case "year":
    case "text":
    case "document":
    case "declarant":
    case "yesNo":
      return t;
    default:
      return "text";
  }
}

function questionId(
  caseId: string,
  requirementId: string,
  fieldCode: string | null
): string {
  const h = createHash("sha256")
    .update(`${caseId}|${requirementId}|${fieldCode || ""}`)
    .digest("hex")
    .slice(0, 12);
  return `cq-${h}`;
}

/**
 * Synchronise les questions depuis les requirement matches + assistance.
 * Préserve l’historique answers / askedCount de la session précédente.
 */
export function buildClarificationSession(
  docCase: DocumentCase,
  previous?: ClarificationSession | null
): ClarificationSession {
  const sessionId =
    previous?.sessionId ||
    `cs-${createHash("sha256").update(docCase.caseId).digest("hex").slice(0, 12)}`;

  const prevByReq = new Map(
    (previous?.questions || []).map((q) => [q.requirementId, q])
  );

  const questions: ClarificationQuestion[] = [];

  for (const assist of docCase.fieldAssistance) {
    for (const q of assist.questions) {
      const match = docCase.requirementMatches.find(
        (m) => m.requirementId === q.requirementId
      );
      const evidenceSource: RequirementEvidenceSource | undefined =
        match?.evidenceSource;

      // Pas de question si déjà trouvé fortement dans un document / fourni par l’utilisateur
      if (
        evidenceSource === "foundInDocument" ||
        evidenceSource === "providedByUser" ||
        (match?.status === "found" && match.verdict === "strong")
      ) {
        continue;
      }

      const prev = prevByReq.get(q.requirementId);
      let status = prev?.status || ("unasked" as const);
      if (evidenceSource === "notApplicableKnown") status = "notApplicable";
      else if (evidenceSource === "unknown" && prev?.status === "unknown") {
        status = "unknown";
      } else if (evidenceSource === "refused") status = "refused";

      // Si toujours missing/ambiguous → askable
      if (
        match &&
        (match.status === "missing" || match.status === "ambiguous") &&
        status === "resolved"
      ) {
        status = "unasked";
      }

      const qid = questionId(
        docCase.caseId,
        q.requirementId,
        assist.fieldCode
      );

      questions.push({
        questionId: qid,
        caseId: docCase.caseId,
        requirementId: q.requirementId,
        fieldCode: assist.fieldCode,
        documentRef: assist.documentRef,
        declarantRole: /1AJ|1AS|1AP|1AK/i.test(assist.fieldCode)
          ? "declarant1"
          : /1BJ|1BS|1BP|1BK/i.test(assist.fieldCode)
            ? "declarant2"
            : "household",
        question: q.question,
        expectedAnswerType: mapAnswerType(q.expectedAnswerType),
        reason: q.reason,
        priority: q.priority,
        provenance: q.provenance || [],
        evidenceRefs: (match?.evidenceLinks || []).map((l) => l.factId),
        status: status as ClarificationQuestion["status"],
        askedCount: prev?.askedCount || 0,
        firstAskedSequence: prev?.firstAskedSequence ?? null,
        lastAskedSequence: prev?.lastAskedSequence ?? null,
        priorityScore: 0,
        priorityReasons: [],
        choices:
          q.expectedAnswerType === "declarant"
            ? ["déclarant 1", "déclarant 2", "foyer"]
            : q.expectedAnswerType === "yesNo"
              ? ["oui", "non"]
              : undefined,
        dependsOnQuestionId: null,
        maxAskedCount: DEFAULT_MAX_ASKED
      });
    }
  }

  // Dédupliquer par requirementId (stable)
  const byReq = new Map<string, ClarificationQuestion>();
  for (const q of questions.sort((a, b) =>
    a.requirementId.localeCompare(b.requirementId)
  )) {
    if (!byReq.has(q.requirementId)) byReq.set(q.requirementId, q);
  }
  const uniqueQuestions = [...byReq.values()].sort(
    (a, b) =>
      a.requirementId.localeCompare(b.requirementId) ||
      (a.fieldCode || "").localeCompare(b.fieldCode || "")
  );

  // Dépendances conditionnelles sourcées (foncier régime réel → 4BA amount)
  for (const q of uniqueQuestions) {
    if (q.requirementId.endsWith("-2044") || q.requirementId.includes("4ba-2044")) {
      // pas de dépendance inventée hors knowledge
    }
  }

  const session: ClarificationSession = {
    sessionId,
    caseId: docCase.caseId,
    sequence: previous?.sequence || 0,
    questions: uniqueQuestions,
    answers: previous?.answers || [],
    activeUserFacts: (previous?.activeUserFacts || []).filter((f) => f.active !== false),
    historicalUserFacts: previous?.historicalUserFacts || [],
    currentQuestionId: null,
    changeHistory: previous?.changeHistory || [],
    invariants: previous?.invariants || emptyClarificationInvariants()
  };

  // missingProvenance est auditée dans auditClarification (pas accumulée au rebuild)

  const next = selectNextClarificationQuestion(session, docCase);
  session.currentQuestionId = next?.questionId || null;
  // Marquer asked
  if (next) {
    const idx = session.questions.findIndex((q) => q.questionId === next.questionId);
    if (idx >= 0 && session.questions[idx].status === "unasked") {
      // ne pas incrémenter askedCount tant que non présentée — fait dans markQuestionAsked
    }
  }

  return session;
}

export function markQuestionAsked(
  session: ClarificationSession,
  questionId: string
): ClarificationSession {
  const sequence = session.sequence + 1;
  const questions = session.questions.map((q) => {
    if (q.questionId !== questionId) return q;
    if (q.status === "refused" || q.status === "unknown") {
      // anti-loop invariant
      const inv = { ...session.invariants };
      if (q.status === "refused") inv.questionRepeatedAfterRefusal += 1;
      if (q.status === "unknown") inv.questionRepeatedAfterUnknownImmediately += 1;
      session.invariants = inv;
    }
    return {
      ...q,
      status: q.status === "unasked" ? ("asked" as const) : q.status,
      askedCount: q.askedCount + 1,
      firstAskedSequence: q.firstAskedSequence ?? sequence,
      lastAskedSequence: sequence
    };
  });

  // Loop detection: same question asked > max
  const q = questions.find((x) => x.questionId === questionId);
  if (q && q.askedCount > q.maxAskedCount) {
    session.invariants.clarificationLoopDetected += 1;
  }

  return {
    ...session,
    sequence,
    questions,
    currentQuestionId: questionId
  };
}
