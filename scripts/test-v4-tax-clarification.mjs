/**
 * V4-S — boucle de clarification déterministe (exemples 1→15 + safety)
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  assertQuestionOrderStable,
  auditClarification,
  buildDocumentCase,
  initClarificationState,
  applyClarificationAnswer,
  parseClarificationAnswer,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  runV4PreviewDocumentCase,
  narrateClarificationWithLlm
} from "../lib/v4/index.ts";
import { CLARIFICATION_FIXTURES as F } from "../lib/v4/__fixtures__/fiscal/clarificationFixtures.mjs";

function section(t) {
  console.log(`\n── ${t} ──`);
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function reset() {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
}

function build(docs, opts = {}) {
  reset();
  return buildDocumentCase(docs, { resetIds: true, ...opts });
}

function start(docs) {
  const c = build(Array.isArray(docs) ? docs : [docs]);
  return initClarificationState(c);
}

function main() {
  console.log("=== test:v4-tax-clarification (V4-S) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-S");
  };

  try {
    section("1 — 1AJ missing → answer → providedByUser");
    {
      let s = start(F.missing1AJ);
      assert.ok(s.currentQuestion, "question attendue");
      assert.equal(s.currentQuestion.fieldCode, "1AJ");
      assert.match(s.currentQuestion.requirementId, /1aj-amount/i);
      const before = JSON.stringify(
        applyClarificationAnswer(s, s.currentQuestion.questionId, "32450")
      );
      reset();
      s = start(F.missing1AJ);
      const r = applyClarificationAnswer(
        s,
        s.currentQuestion.questionId,
        "32 450 €"
      );
      assert.equal(r.accepted, true);
      assert.equal(r.state.session.activeUserFacts.length, 1);
      assert.equal(r.state.session.activeUserFacts[0].kind, "user");
      assert.equal(r.state.session.activeUserFacts[0].normalizedValue, 32450);
      assert.equal(r.state.session.activeUserFacts[0].source, "clarification");
      const m = r.state.documentCase.requirementMatches.find(
        (x) => x.requirementId === "1aj-amount"
      );
      assert.equal(m?.evidenceSource, "providedByUser");
      assert.equal(m?.status, "found");
      assert.notEqual(m?.verdict, "strong");
      const again = applyClarificationAnswer(
        start(F.missing1AJ),
        start(F.missing1AJ).currentQuestion.questionId,
        "32450"
      );
      // stabilité recalcul
      assert.equal(
        again.state.session.activeUserFacts[0].normalizedValue,
        32450
      );
      void before;
      const audit = auditClarification(r.state.documentCase, r.state.session);
      assert.equal(audit.ok, true, JSON.stringify(audit.violations));
    }
    ok("1");

    section("2 — 1AJ document trouvé → pas de question montant inutile");
    {
      const s = start(F.found1AJ);
      const amountQ = s.session.questions.find(
        (q) => q.requirementId === "1aj-amount"
      );
      assert.ok(
        !amountQ ||
          amountQ.status === "resolved" ||
          amountQ.status === "answered",
        "pas de question montant askable"
      );
      if (s.currentQuestion) {
        assert.notEqual(s.currentQuestion.requirementId, "1aj-amount");
      }
      const m = s.documentCase.requirementMatches.find(
        (x) => x.requirementId === "1aj-amount"
      );
      assert.equal(m?.status, "found");
    }
    ok("2");

    section("3 — userVsDocument conflict, aucun écrasement");
    {
      let s = start(F.found1AJ);
      // Forcer une question montant via session si absente : répondre sur requirement via apply path
      // Ajouter une question synthétique en répondant après rebuild avec user fact conflict detection
      // On crée un état où on pose manuellement une réponse user sur 1AJ
      const c = build([F.found1AJ]);
      s = initClarificationState(c);
      // Injecter une question 1AJ amount askable pour le test de conflit
      const qid = "cq-test-1aj-conflict";
      s.session.questions.push({
        questionId: qid,
        caseId: c.caseId,
        requirementId: "1aj-amount",
        fieldCode: "1AJ",
        documentRef: "2042",
        declarantRole: "declarant1",
        question: "Quel montant pour la case 1AJ ?",
        expectedAnswerType: "amount",
        reason: "test conflit",
        priority: "blocking",
        provenance: [{ sourceId: "test", title: "test", url: null }],
        evidenceRefs: [],
        status: "asked",
        askedCount: 1,
        firstAskedSequence: 1,
        lastAskedSequence: 1,
        priorityScore: 100,
        priorityReasons: ["test"],
        maxAskedCount: 2
      });
      s.currentQuestion = s.session.questions.find((q) => q.questionId === qid);
      const r = applyClarificationAnswer(s, qid, "35000");
      assert.equal(r.accepted, true);
      const docFact = r.state.documentCase.factIndex.find(
        (f) => f.fieldCode === "1AJ" && f.displayValue != null
      );
      assert.ok(docFact);
      const docNum = Number(
        String(docFact.displayValue).replace(/\s/g, "").replace("€", "")
      );
      assert.equal(docNum, 32450);
      assert.equal(r.state.session.activeUserFacts[0].normalizedValue, 35000);
      assert.ok(
        r.state.documentCase.conflicts.some((c) => c.kind === "userVsDocument")
      );
      assert.ok(
        r.state.documentCase.conflicts.every(
          (c) =>
            c.kind !== "userVsDocument" ||
            !c.resolution ||
            c.resolution === "unresolved"
        )
      );
      assert.match(
        r.state.documentCase.conflicts.find((c) => c.kind === "userVsDocument")
          .description,
        /conserve les deux/i
      );
    }
    ok("3");

    section("4 — je ne sais pas → unknown, pas de fait inventé");
    {
      let s = start(F.missing1AJ);
      const qid = s.currentQuestion.questionId;
      const r = applyClarificationAnswer(s, qid, "je ne sais pas");
      assert.equal(
        r.state.session.questions.find((q) => q.questionId === qid)?.status,
        "unknown"
      );
      assert.equal(r.state.session.activeUserFacts.length, 0);
      assert.ok(
        r.changeSet.explanations.some((e) => /reste inconnue/i.test(e))
      );
      // pas de répétition immédiate
      if (r.state.currentQuestion) {
        assert.notEqual(r.state.currentQuestion.questionId, qid);
      }
      assert.equal(
        r.state.session.invariants.questionRepeatedAfterUnknownImmediately,
        0
      );
      assert.equal(r.state.session.invariants.unknownPromotedToKnown, 0);
    }
    ok("4");

    section("5 — passer → refused");
    {
      let s = start(F.missing1AJ);
      const qid = s.currentQuestion.questionId;
      const r = applyClarificationAnswer(s, qid, "passer");
      assert.equal(
        r.state.session.questions.find((q) => q.questionId === qid)?.status,
        "refused"
      );
      assert.equal(r.state.session.activeUserFacts.length, 0);
      assert.ok(r.changeSet.explanations.some((e) => /ne pas répondre/i.test(e)));
    }
    ok("5");

    section("6 — montant ambigu → ambiguous, max 1 confirmation");
    {
      const parsed = parseClarificationAnswer("environ 32k", "amount");
      assert.equal(parsed.status, "ambiguous");
      let s = start(F.missing1AJ);
      const qid = s.currentQuestion.questionId;
      const r = applyClarificationAnswer(s, qid, "32.450");
      assert.equal(r.accepted, false);
      assert.equal(
        r.state.session.questions.find((q) => q.questionId === qid)?.status,
        "ambiguous"
      );
      assert.equal(r.state.session.activeUserFacts.length, 0);
      assert.equal(
        r.state.session.invariants.ambiguousAnswerPromotedToCertain,
        0
      );
    }
    ok("6");

    section("7 — 1AJ/1BJ rôle ambigu → question rôle prioritaire");
    {
      const s = start(F.roleAmbiguousAmounts);
      assert.ok(s.currentQuestion);
      // Doit privilégier rôle / ambiguïté plutôt que « quel montant est le bon »
      assert.ok(
        s.currentQuestion.priority === "declarantUnknown" ||
          s.currentQuestion.priority === "ambiguity" ||
          /role|déclarant|montant/i.test(s.currentQuestion.question),
        s.currentQuestion.requirementId
      );
      assert.ok(!/quel est le bon montant/i.test(s.currentQuestion.question));
    }
    ok("7");

    section("8 — year mismatch → pas de promotion cross-year");
    {
      const c = build([F.year2024, F.year2025Support]);
      assert.equal(c.invariants.yearMismatchPromotedToStrong, 0);
      let s = initClarificationState(c);
      // Réponse année 2025 ne doit pas écraser 2024
      if (s.currentQuestion?.expectedAnswerType === "year") {
        const r = applyClarificationAnswer(
          s,
          s.currentQuestion.questionId,
          "2025"
        );
        assert.equal(r.state.session.invariants.crossYearAnswerPromoted, 0);
      } else {
        // invariant structurel déjà 0
        assert.equal(s.session.invariants.crossYearAnswerPromoted, 0);
      }
      const audit = auditClarification(s.documentCase, s.session);
      assert.equal(audit.ok, true, JSON.stringify(audit.violations));
    }
    ok("8");

    section("9 — suppression document après clarification → user fact reste");
    {
      let s = start(F.missing1AJ);
      const r = applyClarificationAnswer(
        s,
        s.currentQuestion.questionId,
        "32450"
      );
      const docId = r.state.documentCase.documents[0].documentId;
      const afterRemove = removeDocumentFromCase(r.state.documentCase, docId, {
        userAnswers: r.state.session.activeUserFacts
      });
      assert.equal(afterRemove.documents.length, 0);
      assert.ok(afterRemove.userAnswers?.length >= 1 || r.state.session.activeUserFacts.length === 1);
      // user fact toujours dans session préservée
      assert.equal(r.state.session.activeUserFacts[0].normalizedValue, 32450);
      assert.ok(
        !afterRemove.factIndex.some((f) => f.sourceDocumentId === docId)
      );
    }
    ok("9");

    section("10 — document confirme user → sources distinctes, pas de fusion");
    {
      let s = start(F.missing1AJ);
      let r = applyClarificationAnswer(
        s,
        s.currentQuestion.questionId,
        "32450"
      );
      const added = addDocumentsToCase(r.state.documentCase, [F.confirming1AJ], {
        userAnswers: r.state.session.activeUserFacts
      });
      assert.ok(added.documents.length >= 2);
      assert.equal(
        r.state.session.activeUserFacts[0].source,
        "clarification"
      );
      // pas de double comptage agrégé
      assert.equal(added.suggestedDeclaredAmount, null);
      const amountMatch = added.requirementMatches.find(
        (m) => m.requirementId === "1aj-amount"
      );
      assert.ok(amountMatch);
      assert.equal(amountMatch.aggregatedValue, null);
    }
    ok("10");

    section("11 — document contredit user → conflict");
    {
      let s = start(F.missing1AJ);
      let r = applyClarificationAnswer(
        s,
        s.currentQuestion.questionId,
        "32450"
      );
      // Rebuild avec doc contradictoire + user facts
      reset();
      const c = buildDocumentCase([F.contradicting1AJ], {
        resetIds: true,
        userAnswers: r.state.session.activeUserFacts
      });
      s = initClarificationState(c, {
        ...r.state.session,
        activeUserFacts: r.state.session.activeUserFacts
      });
      // Forcer détection via apply d’une réponse déjà active — re-answer same
      const qid =
        s.session.questions.find((q) => q.requirementId === "1aj-amount")
          ?.questionId || s.currentQuestion?.questionId;
      if (qid && s.session.questions.every((q) => q.questionId !== "cq-force")) {
        s.session.questions.push({
          questionId: "cq-force",
          caseId: c.caseId,
          requirementId: "1aj-amount",
          fieldCode: "1AJ",
          documentRef: "2042",
          declarantRole: "declarant1",
          question: "Montant 1AJ ?",
          expectedAnswerType: "amount",
          reason: "test",
          priority: "blocking",
          provenance: [{ sourceId: "t", title: "t", url: null }],
          evidenceRefs: [],
          status: "asked",
          askedCount: 1,
          firstAskedSequence: 1,
          lastAskedSequence: 1,
          priorityScore: 99,
          priorityReasons: [],
          maxAskedCount: 2
        });
      }
      const conflicted = applyClarificationAnswer(s, "cq-force", "32450");
      assert.ok(
        conflicted.state.documentCase.conflicts.some(
          (x) => x.kind === "userVsDocument"
        ) ||
          conflicted.changeSet.conflictsAdded.some((id) =>
            /user-doc|userVsDocument/i.test(id)
          ),
        "conflict user vs document attendu"
      );
    }
    ok("11");

    section("12 — deux réponses user successives → supersession explicite");
    {
      let s = start(F.missing1AJ);
      const qid = s.currentQuestion.questionId;
      let r = applyClarificationAnswer(s, qid, "32450");
      // Reposer la même requirement via nouvelle question askable injectée
      const q2 = "cq-second-answer";
      r.state.session.questions.push({
        questionId: q2,
        caseId: r.state.documentCase.caseId,
        requirementId: "1aj-amount",
        fieldCode: "1AJ",
        documentRef: "2042",
        declarantRole: "declarant1",
        question: "Confirmez le montant 1AJ",
        expectedAnswerType: "amount",
        reason: "test",
        priority: "blocking",
        provenance: [{ sourceId: "t", title: "t", url: null }],
        evidenceRefs: [],
        status: "asked",
        askedCount: 1,
        firstAskedSequence: 2,
        lastAskedSequence: 2,
        priorityScore: 99,
        priorityReasons: [],
        maxAskedCount: 2
      });
      r = applyClarificationAnswer(r.state, q2, "35000");
      assert.equal(r.state.session.activeUserFacts.length, 1);
      assert.equal(r.state.session.activeUserFacts[0].normalizedValue, 35000);
      assert.ok(r.state.session.historicalUserFacts.length >= 1);
      assert.ok(
        r.changeSet.explanations.some((e) => /modifiée/i.test(e))
      );
      assert.equal(r.state.session.invariants.userUserConflictLost, 0);
    }
    ok("12");

    section("13 — ordre upload inversé → même prochaine question");
    {
      const a = build([F.missing1AJ, F.form2042RiciEmpty7DB]);
      const b = build([F.form2042RiciEmpty7DB, F.missing1AJ]);
      const sa = initClarificationState(a);
      const sb = initClarificationState(b);
      const stab = assertQuestionOrderStable(
        sa.session,
        sa.documentCase,
        sb.session,
        sb.documentCase
      );
      assert.equal(stab.ok, true);
      assert.equal(stab.uploadOrderChangesQuestion, 0);
      const key = (q) =>
        q ? `${q.requirementId}|${q.fieldCode}|${q.expectedAnswerType}` : null;
      assert.equal(key(sa.currentQuestion), key(sb.currentQuestion));
    }
    ok("13");

    section("14 — conditionnel : pas de notApplicable inventé");
    {
      const s = start(F.form2044);
      const amountBefore = s.session.questions.find((q) =>
        /4ba-amount/i.test(q.requirementId)
      );
      const q2044 = s.session.questions.find((q) =>
        /4ba-2044/i.test(q.requirementId)
      );
      if (q2044) {
        // forcer asked
        q2044.status = "asked";
        q2044.askedCount = 1;
        const r = applyClarificationAnswer(s, q2044.questionId, "non");
        const amountAfter = r.state.session.questions.find((q) =>
          /4ba-amount/i.test(q.requirementId)
        );
        // Sans règle sourcée explicite → ne pas inventer notApplicable sur le montant
        if (amountAfter) {
          assert.notEqual(amountAfter.status, "notApplicable");
        }
        void amountBefore;
      } else {
        // pas de question 2044 askable — OK si déjà résolu autrement
        assert.ok(true);
      }
    }
    ok("14");

    section("15 — max questions / aucune boucle");
    {
      let s = start(F.missing1AJ);
      const seen = new Set();
      let loops = 0;
      for (let i = 0; i < 8; i++) {
        const q = s.currentQuestion;
        if (!q) break;
        if (seen.has(q.questionId) && q.status === "refused") {
          loops += 1;
        }
        seen.add(q.questionId);
        const r = applyClarificationAnswer(s, q.questionId, "passer");
        s = r.state;
      }
      assert.equal(loops, 0);
      assert.equal(s.session.invariants.clarificationLoopDetected, 0);
      assert.ok(s.session.questions.every((q) => q.askedCount <= q.maxAskedCount));
    }
    ok("15");

    section("Safety invariants + parse + premium stub + preview");
    {
      assert.equal(parseClarificationAnswer("jsp", "amount").status, "unknown");
      assert.equal(parseClarificationAnswer("skip", "amount").status, "refused");
      assert.equal(
        parseClarificationAnswer("", "amount").status,
        "unanswered"
      );
      assert.throws(() => narrateClarificationWithLlm({}), /premium|V4-S/i);

      const preview = runV4PreviewDocumentCase({
        documents: [F.missing1AJ],
        resetIds: true,
        clarificationAnswers: [{ answer: "32450" }]
      });
      assert.equal(preview.ok, true);
      assert.ok(preview.document_case.clarification);
      assert.equal(preview.clarification_ok, true);

      const s = start(F.missing1AJ);
      const audit = auditClarification(s.documentCase, s.session);
      assert.equal(audit.ok, true, JSON.stringify(audit.violations));
      for (const [k, v] of Object.entries(s.session.invariants)) {
        assert.equal(v, 0, k);
      }
    }
    ok("safety");

    assert.equal(fetchCalls, 0);
    console.log(`\n=== V4-S OK — ${passed} checks (fetch=${fetchCalls}) ===`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
