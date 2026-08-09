/**
 * Pont Applicability → ClarificationQuestion candidates — V4-T.
 * N’écrit JAMAIS dans UserProvidedFacts.
 */

import type {
  ClarificationSession,
  TaxApplicabilityEvaluation,
  TaxApplicabilityInvariants
} from "../../../../types/knowledge.js";

/**
 * Produit des candidates de questions à partir des missingInformation,
 * en respectant l’anti-loop V4-S (unknown/refused/answered/max attempts).
 */
export function buildClarificationCandidatesFromApplicability(
  evaluation: TaxApplicabilityEvaluation,
  session: ClarificationSession | null,
  invariants: TaxApplicabilityInvariants
): TaxApplicabilityEvaluation["clarificationQuestionCandidates"] {
  const out: TaxApplicabilityEvaluation["clarificationQuestionCandidates"] =
    [];

  for (const miss of evaluation.missingInformation) {
    if (session) {
      const blocked = findBlockingQuestion(miss.id, miss.fieldCode, session);
      if (blocked) {
        // Question déjà close — ne pas recréer (anti-loop). Compteur reste 0.
        if (
          blocked.status === "asked" &&
          blocked.askedCount >= blocked.maxAskedCount
        ) {
          // déjà au max — OK
        }
        void invariants;
        continue;
      }
    }
    out.push({
      requirementId: miss.id,
      question: miss.question,
      expectedAnswerType: miss.expectedAnswerType,
      reason: miss.reason
    });
  }

  return out.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

function findBlockingQuestion(
  missingId: string,
  fieldCode: string,
  session: ClarificationSession
) {
  return session.questions.find((q) => {
    const idHit =
      q.requirementId === missingId ||
      q.requirementId.endsWith(missingId) ||
      missingId.endsWith(q.requirementId);
    const fieldHit = q.fieldCode === fieldCode && idHit;
    if (!idHit && !fieldHit) return false;
    return (
      q.status === "unknown" ||
      q.status === "refused" ||
      q.status === "answered" ||
      q.status === "resolved" ||
      q.status === "notApplicable" ||
      q.status === "superseded" ||
      q.askedCount >= q.maxAskedCount
    );
  });
}

/**
 * Enrichit la session de clarification avec des questions issues de l’applicabilité
 * (unasked seulement), sans toucher aux UserProvidedFacts.
 */
export function mergeApplicabilityQuestionsIntoSession(
  session: ClarificationSession,
  evaluations: readonly TaxApplicabilityEvaluation[],
  invariants?: TaxApplicabilityInvariants
): ClarificationSession {
  const existing = new Set(session.questions.map((q) => q.requirementId));
  const additions = [];
  for (const ev of evaluations) {
    for (const c of ev.clarificationQuestionCandidates) {
      if (existing.has(c.requirementId)) continue;
      if (findBlockingQuestion(c.requirementId, ev.fieldCode, session)) {
        if (invariants) {
          // Tentative de re-création bloquée correctement — pas une loop détectée
        }
        continue;
      }
      // Détecter loop si une question same id existe déjà askable
      const prior = session.questions.find(
        (q) => q.requirementId === c.requirementId
      );
      if (prior && prior.askedCount > 0 && invariants) {
        invariants.applicabilityClarificationLoop += 1;
        continue;
      }
      additions.push({
        questionId: `cq-app-${c.requirementId}`,
        caseId: session.caseId,
        requirementId: c.requirementId,
        fieldCode: ev.fieldCode,
        documentRef: null as string | null,
        declarantRole: ev.role,
        question: c.question,
        expectedAnswerType: c.expectedAnswerType,
        reason: c.reason,
        priority: "blocking" as const,
        provenance: ev.sources.map((s) => ({
          sourceType: "official" as const,
          authority: "DGFiP",
          url: s.url,
          retrievedAt: "2026-08-08",
          title: s.title,
          supports: ["applicability"]
        })),
        evidenceRefs: [] as string[],
        status: "unasked" as const,
        askedCount: 0,
        firstAskedSequence: null as number | null,
        lastAskedSequence: null as number | null,
        priorityScore: 0,
        priorityReasons: ["from_applicability"],
        choices:
          c.expectedAnswerType === "choice"
            ? ["régime réel", "micro-foncier"]
            : c.expectedAnswerType === "declarant"
              ? ["déclarant 1", "déclarant 2", "foyer"]
              : c.expectedAnswerType === "yesNo" ||
                  c.expectedAnswerType === "boolean"
                ? ["oui", "non"]
                : undefined,
        dependsOnQuestionId: null as string | null,
        maxAskedCount: 2
      });
      existing.add(c.requirementId);
    }
  }
  if (!additions.length) return session;
  return {
    ...session,
    questions: [...session.questions, ...additions].sort(
      (a, b) =>
        a.requirementId.localeCompare(b.requirementId) ||
        (a.fieldCode || "").localeCompare(b.fieldCode || "")
    )
  };
}
