/**
 * Applique une réponse utilisateur et recalcule le DocumentCase — V4-S.
 * API pure : mêmes entrées → même sortie.
 */

import type {
  ClarificationAnswer,
  ClarificationChangeSet,
  ClarificationSession,
  ClarificationState,
  DocumentCase,
  FactConflict,
  RequirementEvidenceSource,
  UserProvidedFact
} from "../../../../types/knowledge.js";
import {
  buildDocumentCase,
  type BuildDocumentCaseOptions,
  type DocumentCaseInput
} from "../case/buildDocumentCase.js";
import {
  buildClarificationSession,
  emptyClarificationInvariants,
  markQuestionAsked
} from "./buildClarificationState.js";
import { explainClarificationChanges } from "./explainCaseChanges.js";
import { parseClarificationAnswer } from "./parseAnswer.js";
import { selectNextClarificationQuestion } from "./selectNextQuestion.js";
import {
  evaluateDocumentCaseApplicability,
  mergeApplicabilityQuestionsIntoSession
} from "../applicability/index.js";

export interface ApplyClarificationResult {
  state: ClarificationState;
  changeSet: ClarificationChangeSet;
  accepted: boolean;
}

function emptyChangeSet(): ClarificationChangeSet {
  return {
    factsAdded: [],
    factsSuperseded: [],
    conflictsAdded: [],
    conflictsResolved: [],
    requirementsChanged: [],
    questionsResolved: [],
    questionsAdded: [],
    documentsAffected: [],
    caseStatusChanges: [],
    explanations: []
  };
}

function caseInputsFrom(docCase: DocumentCase): DocumentCaseInput[] {
  return docCase.documents.map((d) => ({
    text: d.text,
    fileName: d.fileName
  }));
}

/**
 * Initialise une session de clarification sur un dossier existant.
 */
export function initClarificationState(
  docCase: DocumentCase,
  previous?: ClarificationSession | null
): ClarificationState {
  let session = buildClarificationSession(docCase, previous);
  // V4-T — bridge applicability → questions (sans écrire de UserProvidedFacts)
  const app = evaluateDocumentCaseApplicability({
    ...docCase,
    clarificationSession: session
  });
  session = mergeApplicabilityQuestionsIntoSession(
    session,
    app.evaluations,
    app.invariants
  );
  const next = selectNextClarificationQuestion(session, docCase);
  if (next) {
    session = {
      ...session,
      questions: session.questions.map((q) =>
        q.questionId === next.questionId
          ? {
              ...q,
              priorityScore: next.priorityScore,
              priorityReasons: next.priorityReasons
            }
          : q
      )
    };
    session = markQuestionAsked(session, next.questionId);
  }
  const withSession: DocumentCase = {
    ...docCase,
    clarificationSession: session,
    userAnswers: session.activeUserFacts,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants
  };
  return {
    session,
    documentCase: withSession,
    currentQuestion: next
      ? session.questions.find((q) => q.questionId === next.questionId) || null
      : null,
    lastChangeSet: null
  };
}

/**
 * Applique une réponse à la question courante / questionId.
 */
export function applyClarificationAnswer(
  state: ClarificationState,
  questionId: string,
  rawAnswer: string
): ApplyClarificationResult {
  const changeSet = emptyChangeSet();
  let session: ClarificationSession = {
    ...state.session,
    invariants: { ...state.session.invariants },
    questions: state.session.questions.map((q) => ({ ...q })),
    answers: [...state.session.answers],
    activeUserFacts: [...state.session.activeUserFacts],
    historicalUserFacts: [...state.session.historicalUserFacts],
    changeHistory: [...state.session.changeHistory]
  };

  const question = session.questions.find((q) => q.questionId === questionId);
  if (!question) {
    changeSet.explanations.push("Question introuvable — aucune modification.");
    return {
      state,
      changeSet,
      accepted: false
    };
  }

  // Anti-loop : refused / unknown ne se reposent pas
  if (question.status === "refused") {
    session.invariants.questionRepeatedAfterRefusal += 1;
    session.invariants.clarificationLoopDetected += 1;
  }
  if (question.status === "unknown" && question.lastAskedSequence === session.sequence) {
    session.invariants.questionRepeatedAfterUnknownImmediately += 1;
  }

  const parsed = parseClarificationAnswer(rawAnswer, question.expectedAnswerType);
  const sequence = session.sequence + 1;
  const answerId = `ca-${question.questionId}-${sequence}`;

  const answer: ClarificationAnswer = {
    answerId,
    questionId: question.questionId,
    requirementId: question.requirementId,
    rawAnswer: parsed.rawAnswer,
    normalizedValue: parsed.normalizedValue,
    valueType: parsed.valueType,
    status: parsed.status,
    sequence,
    parseNotes: parsed.parseNotes
  };
  session.answers.push(answer);
  session.sequence = sequence;

  // Update question status
  session.questions = session.questions.map((q) => {
    if (q.questionId !== questionId) return q;
    let status = q.status;
    if (parsed.status === "accepted") status = "answered";
    else if (parsed.status === "unknown") status = "unknown";
    else if (parsed.status === "refused") status = "refused";
    else if (parsed.status === "invalid") status = "invalid";
    else if (parsed.status === "ambiguous") status = "ambiguous";
    else if (parsed.status === "unanswered") status = "asked";
    return { ...q, status };
  });

  if (parsed.status === "invalid") {
    // Ne pas créer de fait ; éventuellement reformulation
    changeSet.explanations.push(
      "La réponse n’a pas pu être interprétée de façon certaine. Aucune valeur n’a été enregistrée."
    );
    const next = selectNextClarificationQuestion(session, state.documentCase);
    // allow one retry on same question if askedCount < max
    session.currentQuestionId = next?.questionId || questionId;
    const docCase = {
      ...state.documentCase,
      clarificationSession: session,
      userAnswers: session.activeUserFacts
    };
    return {
      state: {
        session,
        documentCase: docCase,
        currentQuestion:
          session.questions.find((q) => q.questionId === session.currentQuestionId) ||
          null,
        lastChangeSet: changeSet
      },
      changeSet,
      accepted: false
    };
  }

  if (parsed.status === "ambiguous") {
    changeSet.explanations.push(
      "Cette réponse est ambiguë. Je peux vous demander une confirmation, sans enregistrer de valeur certaine."
    );
    // une confirmation max — askedCount already tracks
    session.currentQuestionId = questionId;
    const docCase = {
      ...state.documentCase,
      clarificationSession: session,
      userAnswers: session.activeUserFacts
    };
    return {
      state: {
        session,
        documentCase: docCase,
        currentQuestion: question,
        lastChangeSet: changeSet
      },
      changeSet,
      accepted: false
    };
  }

  if (parsed.status === "unknown") {
    changeSet.explanations.push(
      "Cette information reste inconnue. Je peux continuer avec les autres éléments disponibles."
    );
    changeSet.caseStatusChanges.push(
      `${question.requirementId}:unknown`
    );
    // Pas de UserProvidedFact montant — continuer sans re-focaliser le même champ
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }

  if (parsed.status === "refused") {
    changeSet.explanations.push(
      "Vous avez choisi de ne pas répondre à cette question. Je continue avec les autres éléments disponibles."
    );
    changeSet.caseStatusChanges.push(`${question.requirementId}:refused`);
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }

  if (parsed.status !== "accepted") {
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }

  // Accepted → UserProvidedFact
  const factId = `uf-${question.requirementId}-${sequence}`;
  const prevActive = session.activeUserFacts.find(
    (f) => f.requirementId === question.requirementId && f.active !== false
  );

  if (prevActive) {
    // user vs user — supersession explicite
    const oldVal = prevActive.normalizedValue ?? prevActive.answer;
    const newVal = parsed.normalizedValue;
    if (String(oldVal) !== String(newVal)) {
      const superseded: UserProvidedFact = {
        ...prevActive,
        active: false,
        supersededBy: factId
      };
      session.historicalUserFacts.push(superseded);
      session.activeUserFacts = session.activeUserFacts.filter(
        (f) => f.factId !== prevActive.factId
      );
      changeSet.factsSuperseded.push(prevActive.factId || prevActive.questionId);
      changeSet.explanations.push(
        `Votre réponse concernant ${question.fieldCode || question.requirementId} a été modifiée de ${oldVal} à ${newVal}.`
      );
      // conflict trace
      changeSet.conflictsAdded.push(
        `userVsUser:${question.requirementId}:${sequence}`
      );
    } else {
      // same value — keep one
      session.activeUserFacts = session.activeUserFacts.filter(
        (f) => f.requirementId !== question.requirementId
      );
    }
  }

  const userFact: UserProvidedFact = {
    kind: "user",
    factId,
    questionId: question.questionId,
    requirementId: question.requirementId,
    fieldCode: question.fieldCode,
    answer: String(parsed.normalizedValue ?? parsed.rawAnswer),
    rawAnswer: parsed.rawAnswer,
    normalizedValue: parsed.normalizedValue,
    valueType: parsed.valueType,
    answerStatus: "accepted",
    role: question.declarantRole,
    year: question.expectedAnswerType === "year"
      ? Number(parsed.normalizedValue)
      : state.documentCase.taxContext.yearsPresent[0] ?? null,
    documentRef: question.documentRef,
    answeredAt: null,
    sequence,
    active: true,
    supersededBy: null,
    source: "clarification"
  };

  // Invariants promotion
  if (userFact.kind !== "user") {
    session.invariants.userFactPromotedToDocumentFact += 1;
  }
  if (userFact.source === ("official" as never)) {
    session.invariants.userFactPromotedToOfficialKnowledge += 1;
  }

  session.activeUserFacts.push(userFact);
  changeSet.factsAdded.push(factId);
  changeSet.questionsResolved.push(question.questionId);
  changeSet.explanations.push(
    `Vous avez indiqué ${formatValue(userFact)} pour ${
      question.fieldCode || "cette information"
    }. Cette valeur provient de votre réponse et non d’un document analysé.`
  );

  return finalizeWithRecalc(
    state.documentCase,
    session,
    changeSet,
    question.fieldCode
  );
}

function formatValue(f: UserProvidedFact): string {
  if (typeof f.normalizedValue === "number") {
    return f.valueType === "amount"
      ? `${f.normalizedValue} €`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
      : String(f.normalizedValue);
  }
  return String(f.normalizedValue ?? f.answer);
}

function finalizeWithRecalc(
  previousCase: DocumentCase,
  session: ClarificationSession,
  changeSet: ClarificationChangeSet,
  focusField: string | null
): ApplyClarificationResult {
  const beforeMatches = new Map(
    previousCase.requirementMatches.map((m) => [
      m.requirementId,
      { status: m.status, source: m.evidenceSource }
    ])
  );

  const rebuilt = rebuildCaseWithUserFacts(previousCase, session);
  let nextSession = buildClarificationSession(rebuilt, session);

  // Propagate invariants from apply
  nextSession = {
    ...nextSession,
    invariants: mergeInvariants(session.invariants, nextSession.invariants),
    answers: session.answers,
    activeUserFacts: session.activeUserFacts,
    historicalUserFacts: session.historicalUserFacts,
    changeHistory: session.changeHistory,
    sequence: session.sequence
  };

  // Detect user vs document conflicts
  const { conflicts, conflictIds, invDelta } = detectUserDocumentConflicts(
    rebuilt,
    nextSession.activeUserFacts
  );
  nextSession.invariants = mergeInvariants(nextSession.invariants, invDelta);

  const mergedConflicts = mergeConflicts(rebuilt.conflicts, conflicts);
  changeSet.conflictsAdded.push(...conflictIds);

  // Requirement status changes
  for (const m of rebuilt.requirementMatches) {
    const prev = beforeMatches.get(m.requirementId);
    const source = deriveEvidenceSource(m.requirementId, m, nextSession);
    m.evidenceSource = source;
    if (source === "providedByUser") {
      m.statusLabel =
        "Information indiquée par vous (non issue d’un document analysé)";
    }
    if (prev && (prev.status !== m.status || prev.source !== source)) {
      changeSet.requirementsChanged.push({
        requirementId: m.requirementId,
        from: `${prev.status}/${prev.source || "?"}`,
        to: `${m.status}/${source}`,
        evidenceSource: source
      });
    }
  }

  // Mark unknown/refused evidence sources from answers
  for (const q of nextSession.questions) {
    const last = [...session.answers]
      .filter((a) => a.questionId === q.questionId)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (!last) continue;
    const match = rebuilt.requirementMatches.find(
      (m) => m.requirementId === q.requirementId
    );
    if (!match) continue;
    if (last.status === "unknown") {
      match.evidenceSource = "unknown";
      match.statusLabel =
        "Information restée inconnue après votre réponse";
    }
    if (last.status === "refused") {
      match.evidenceSource = "refused";
      match.statusLabel = "Vous avez choisi de ne pas répondre";
    }
  }

  const nextQ = selectNextClarificationQuestion(nextSession, rebuilt, {
    focusFieldCode: focusField
  });
  if (nextQ) {
    nextSession = markQuestionAsked(nextSession, nextQ.questionId);
    // loop check
    const asked = nextSession.questions.find(
      (q) => q.questionId === nextQ.questionId
    );
    if (asked && asked.askedCount > asked.maxAskedCount) {
      nextSession.invariants.clarificationLoopDetected += 1;
    }
  } else {
    nextSession.currentQuestionId = null;
  }

  changeSet.explanations = explainClarificationChanges(changeSet);
  nextSession.changeHistory = [...nextSession.changeHistory, changeSet];

  // V4-T — recalcul applicabilité après réponse
  const app = evaluateDocumentCaseApplicability({
    ...rebuilt,
    conflicts: mergedConflicts,
    clarificationSession: nextSession,
    userAnswers: nextSession.activeUserFacts
  });
  nextSession = mergeApplicabilityQuestionsIntoSession(
    nextSession,
    app.evaluations,
    app.invariants
  );

  const documentCase: DocumentCase = {
    ...rebuilt,
    conflicts: mergedConflicts,
    clarificationSession: nextSession,
    userAnswers: nextSession.activeUserFacts,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants,
    caseCentricViews: rebuilt.caseCentricViews.map((v) => ({
      ...v,
      applicability:
        app.evaluations.find((e) => e.fieldCode === v.fieldCode) || null
    })),
    suggestedDeclaredAmount: null,
    eligibilityDecision: null
  };

  // Safety: no aggregation from user facts
  if (documentCase.suggestedDeclaredAmount != null) {
    nextSession.invariants.automaticUnsafeAggregation += 1;
  }

  return {
    accepted: true,
    changeSet,
    state: {
      session: nextSession,
      documentCase,
      currentQuestion: nextQ
        ? nextSession.questions.find((q) => q.questionId === nextQ.questionId) ||
          null
        : null,
      lastChangeSet: changeSet
    }
  };
}

function rebuildCaseWithUserFacts(
  previousCase: DocumentCase,
  session: ClarificationSession
): DocumentCase {
  const opts: BuildDocumentCaseOptions = {
    resetIds: true,
    userAnswers: session.activeUserFacts
  };
  const rebuilt = buildDocumentCase(caseInputsFrom(previousCase), opts);

  // Annotate matches satisfied by user
  for (const m of rebuilt.requirementMatches) {
    const uf = session.activeUserFacts.find(
      (f) => f.requirementId === m.requirementId && f.active !== false
    );
    const hasDoc =
      m.verdict === "strong" &&
      m.candidateFacts.some((f) => f.sourceDocumentId);

    if (uf && uf.answerStatus === "accepted") {
      if (hasDoc) {
        // both present — leave match, conflict detection séparée
        m.evidenceSource = m.status === "ambiguous" ? "ambiguous" : "foundInDocument";
      } else if (m.status === "missing" || m.candidateFacts.length === 0) {
        // User fills gap — not a document find
        m.status = "found";
        m.evidenceSource = "providedByUser";
        m.statusLabel =
          "Information indiquée par vous (non issue d’un document analysé)";
        m.verdict = "candidate"; // jamais strong documentaire
      } else {
        m.evidenceSource = "providedByUser";
        m.statusLabel =
          "Information indiquée par vous (non issue d’un document analysé)";
      }
    } else if (hasDoc) {
      m.evidenceSource = "foundInDocument";
    } else if (m.status === "missing") {
      m.evidenceSource = "missing";
    } else if (m.status === "ambiguous") {
      m.evidenceSource = "ambiguous";
    }
  }

  return rebuilt;
}

function deriveEvidenceSource(
  requirementId: string,
  match: DocumentCase["requirementMatches"][number],
  session: ClarificationSession
): RequirementEvidenceSource {
  if (match.evidenceSource) return match.evidenceSource;
  const uf = session.activeUserFacts.find(
    (f) => f.requirementId === requirementId && f.active !== false
  );
  if (uf) return "providedByUser";
  if (match.status === "found") return "foundInDocument";
  if (match.status === "ambiguous") return "ambiguous";
  if (match.status === "missing") return "missing";
  return "missing";
}

function detectUserDocumentConflicts(
  docCase: DocumentCase,
  userFacts: UserProvidedFact[]
): {
  conflicts: FactConflict[];
  conflictIds: string[];
  invDelta: ReturnType<typeof emptyClarificationInvariants>;
} {
  const conflicts: FactConflict[] = [];
  const conflictIds: string[] = [];
  const invDelta = emptyClarificationInvariants();

  for (const uf of userFacts) {
    if (uf.active === false) continue;
    if (uf.normalizedValue == null && !uf.answer) continue;
    if (!uf.fieldCode) continue;

    const docFacts = docCase.factIndex.filter(
      (f) =>
        f.fieldCode === uf.fieldCode &&
        (f.factType === "fieldValue" || f.factType === "amount") &&
        f.displayValue != null
    );
    for (const df of docFacts) {
      const docNum = normalizeNum(df.displayValue ?? df.value);
      const userNum = normalizeNum(uf.normalizedValue ?? uf.answer);
      if (docNum != null && userNum != null && docNum !== userNum) {
        // year / role guards
        if (
          uf.year != null &&
          df.year != null &&
          uf.year !== df.year
        ) {
          invDelta.crossYearAnswerPromoted += 0; // not promoted — conflict only if same year intent
          continue;
        }
        if (
          uf.role &&
          df.declarantRole &&
          uf.role !== "household" &&
          df.declarantRole !== "household" &&
          uf.role !== df.declarantRole
        ) {
          continue;
        }
        const id = `conflict-user-doc-${uf.fieldCode}-${uf.factId}-${df.factId}`;
        conflicts.push({
          conflictId: id,
          kind: "userVsDocument",
          documentIds: df.sourceDocumentId ? [df.sourceDocumentId] : [],
          factIds: [df.factId],
          userFactIds: uf.factId ? [uf.factId] : [],
          description: `Le document indique ${df.displayValue}, tandis que vous avez indiqué ${uf.normalizedValue ?? uf.answer}. Je conserve les deux informations séparément.`,
          evidence: df.evidence || [],
          resolution: "unresolved"
        });
        conflictIds.push(id);
        // NEVER auto-resolve
      }
    }
  }

  return { conflicts, conflictIds, invDelta };
}

function normalizeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(
    v.replace(/\s/g, "").replace(/€/g, "").replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}

function mergeConflicts(
  existing: FactConflict[],
  extra: FactConflict[]
): FactConflict[] {
  const map = new Map<string, FactConflict>();
  for (const c of [...existing, ...extra]) map.set(c.conflictId, c);
  return [...map.values()];
}

function mergeInvariants(
  a: ClarificationSession["invariants"],
  b: ClarificationSession["invariants"]
): ClarificationSession["invariants"] {
  const out = { ...a };
  for (const key of Object.keys(b) as (keyof typeof b)[]) {
    out[key] = (out[key] || 0) + (b[key] || 0);
  }
  return out;
}
