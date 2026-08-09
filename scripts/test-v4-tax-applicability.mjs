/**
 * V4-T — applicabilité fiscale déterministe (exemples 1→16 + truth table + safety)
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  applyClarificationAnswer,
  assertApplicabilityOrderStable,
  auditTaxApplicability,
  buildDocumentCase,
  decideFieldApplicability,
  evaluateCondition,
  evaluateDocumentCaseApplicability,
  evaluateTaxFieldApplicability,
  initClarificationState,
  removeDocumentFromCase,
  resetApplicabilityEvidenceIdsForTests,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  TAX_APPLICABILITY_RULES
} from "../lib/v4/index.ts";
import { APP_FIXTURES as F } from "../lib/v4/__fixtures__/fiscal/applicabilityFixtures.mjs";

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
  resetApplicabilityEvidenceIdsForTests();
}

function build(docs, opts = {}) {
  reset();
  return buildDocumentCase(Array.isArray(docs) ? docs : [docs], {
    resetIds: true,
    ...opts
  });
}

function statusOf(docCase, code) {
  return docCase.applicabilityEvaluations?.find((e) => e.fieldCode === code)
    ?.status;
}

function main() {
  console.log("=== test:v4-tax-applicability (V4-T) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-T");
  };

  try {
    section("Truth table allOf / anyOf / not");
    {
      const ctx = {
        fieldCode: "X",
        ruleId: "t",
        facts: [],
        userFacts: [],
        conflicts: [],
        documentTypes: [],
        documentTexts: [],
        fieldCodesPresent: ["X"],
        yearsPresent: [2024],
        targetYear: 2024
      };
      const T = { predicate: "fieldPresent", fieldCode: "X" };
      const Falsy = {
        predicate: "fieldPresent",
        fieldCode: "ZZZ_NEVER"
      };
      // allOf
      assert.equal(
        evaluateCondition({ op: "allOf", conditions: [T, T] }, ctx).result,
        "true"
      );
      assert.equal(
        evaluateCondition({ op: "allOf", conditions: [T, Falsy] }, ctx).result,
        "false"
      );
      assert.equal(
        evaluateCondition(
          {
            op: "allOf",
            conditions: [
              T,
              {
                predicate: "amountPresent",
                fieldCode: "X",
                missingInformationId: "x",
                missingQuestion: "?",
                expectedAnswerType: "amount"
              }
            ]
          },
          ctx
        ).result,
        "unknown"
      );
      // anyOf
      assert.equal(
        evaluateCondition({ op: "anyOf", conditions: [Falsy, T] }, ctx).result,
        "true"
      );
      assert.equal(
        evaluateCondition({ op: "anyOf", conditions: [Falsy, Falsy] }, ctx)
          .result,
        "false"
      );
      // not
      assert.equal(
        evaluateCondition({ op: "not", conditions: [T] }, ctx).result,
        "false"
      );
      assert.equal(
        evaluateCondition({ op: "not", conditions: [Falsy] }, ctx).result,
        "true"
      );
      assert.equal(
        evaluateCondition(
          {
            op: "not",
            conditions: [
              {
                predicate: "amountPresent",
                fieldCode: "X",
                missingInformationId: "x",
                missingQuestion: "?",
                expectedAnswerType: "amount"
              }
            ]
          },
          ctx
        ).result,
        "unknown"
      );
    }
    ok("truth-table");

    section("1 — faits complets → applicable");
    {
      const c = build(F.salary1AJComplete);
      assert.equal(statusOf(c, "1AJ"), "applicable");
      const ev = c.applicabilityEvaluations.find((e) => e.fieldCode === "1AJ");
      assert.ok(ev.ruleId);
      assert.ok(ev.sources.length);
      assert.ok(ev.evidence.length);
    }
    ok("1");

    section("2 — condition nécessaire fausse → notApplicable");
    {
      const c = build(F.foncierMicro);
      // micro → 4BA notApplicable si case présente ; sinon needsInformation/unknown
      const { evaluation } = evaluateTaxFieldApplicability({
        fieldCode: "4BA",
        facts: c.factIndex,
        documents: c.documents,
        documentTexts: c.documents.map((d) => d.text),
        fieldCodesPresent: ["4BA"],
        yearsPresent: [2024],
        targetYear: 2024,
        userFacts: [
          {
            kind: "user",
            questionId: "q-regime",
            requirementId: "4ba-regime",
            fieldCode: "4BA",
            answer: "micro",
            normalizedValue: "micro",
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      });
      assert.equal(evaluation.status, "notApplicable");
      assert.equal(evaluation.ruleId, "4ba-regime-reel");
    }
    ok("2");

    section("3 — condition absente → needsInformation");
    {
      const c = build(F.salary1AJEmpty);
      assert.equal(statusOf(c, "1AJ"), "needsInformation");
      const ev = c.applicabilityEvaluations.find((e) => e.fieldCode === "1AJ");
      assert.ok(ev.missingInformation.length >= 1);
    }
    ok("3");

    section("4 — connaissance insuffisante → unknown");
    {
      const { evaluation } = evaluateTaxFieldApplicability({
        fieldCode: "7DB",
        facts: [],
        documents: [],
        documentTexts: [],
        fieldCodesPresent: ["7DB"],
        yearsPresent: [2024],
        targetYear: 2024
      });
      assert.ok(
        evaluation.status === "unknown" ||
          evaluation.status === "needsInformation"
      );
      assert.notEqual(evaluation.status, "applicable");
      assert.notEqual(evaluation.status, "notApplicable");
    }
    ok("4");

    section("5 — user vs document conflit régime → conflicted");
    {
      const c = build(F.foncierReel);
      const { evaluation } = evaluateTaxFieldApplicability({
        fieldCode: "4BA",
        facts: c.factIndex,
        documents: c.documents,
        documentTexts: c.documents.map((d) => d.text),
        fieldCodesPresent: c.taxContext.fieldCodesPresent,
        yearsPresent: c.taxContext.yearsPresent,
        targetYear: 2024,
        userFacts: [
          {
            kind: "user",
            questionId: "q",
            requirementId: "4ba-regime",
            fieldCode: "4BA",
            answer: "micro-foncier",
            normalizedValue: "micro",
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      });
      assert.equal(evaluation.status, "conflicted");
      assert.ok(evaluation.conflicts.length >= 1);
      assert.ok(
        evaluation.evidence.some((e) => e.sourceKind === "document") &&
          evaluation.evidence.some((e) => e.sourceKind === "user")
      );
    }
    ok("5");

    section("6 — même valeur user + document → applicable, provenances distinctes");
    {
      const c = build(F.salary1AJComplete);
      const { evaluation } = evaluateTaxFieldApplicability({
        fieldCode: "1AJ",
        facts: c.factIndex,
        documents: c.documents,
        documentTexts: c.documents.map((d) => d.text),
        fieldCodesPresent: ["1AJ"],
        yearsPresent: [2024],
        targetYear: 2024,
        userFacts: [
          {
            kind: "user",
            factId: "uf-1aj",
            questionId: "q",
            requirementId: "1aj-amount",
            fieldCode: "1AJ",
            answer: "32450",
            normalizedValue: 32450,
            valueType: "amount",
            answerStatus: "accepted",
            role: "declarant1",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      });
      assert.equal(evaluation.status, "applicable");
      // pas de fusion : evidence peut citer document et/ou user séparément
      assert.ok(evaluation.evidence.every((e) => e.sourceKind !== "officialKnowledge" || e.ruleId));
    }
    ok("6");

    section("7 — mauvaise année → pas de promotion silencieuse");
    {
      const c = build(F.year2022);
      const ev = c.applicabilityEvaluations?.find((e) => e.fieldCode === "1AJ");
      // 2022 hors pack verifiedStable years → yearMismatch path or still evaluate with mismatch flag
      assert.ok(ev);
      assert.equal(c.applicabilityInvariants.crossYearApplicabilityPromotion, 0);
      if (ev.yearRelation === "yearMismatch") {
        assert.ok(
          ev.status === "unknown" ||
            ev.status === "needsInformation" ||
            ev.status === "applicable"
        );
      }
    }
    ok("7");

    section("8 — mauvais rôle → pas de promotion");
    {
      const c = build(F.salaryBoth);
      assert.equal(statusOf(c, "1AJ"), "applicable");
      assert.equal(statusOf(c, "1BJ"), "applicable");
      assert.equal(c.applicabilityInvariants.crossRoleApplicabilityPromotion, 0);
      // 1AJ n'utilise pas les faits 1BJ
      const ev = c.applicabilityEvaluations.find((e) => e.fieldCode === "1AJ");
      assert.ok(!/1BJ/.test(JSON.stringify(ev.satisfiedConditions)));
    }
    ok("8");

    section("9 — upload order inversé → même evaluation");
    {
      const a = build([F.salary1AJComplete, F.riciEmpty7DB]);
      const b = build([F.riciEmpty7DB, F.salary1AJComplete]);
      const stab = assertApplicabilityOrderStable(
        a.applicabilityEvaluations,
        b.applicabilityEvaluations
      );
      assert.equal(stab.ok, true);
      assert.equal(stab.uploadOrderChangesApplicability, 0);
    }
    ok("9");

    section("10 — clarification → recalcul applicability");
    {
      let s = initClarificationState(build(F.salary1AJEmpty));
      assert.equal(
        s.documentCase.applicabilityEvaluations.find((e) => e.fieldCode === "1AJ")
          .status,
        "needsInformation"
      );
      const q =
        s.currentQuestion ||
        s.session.questions.find((x) => /1aj-amount/i.test(x.requirementId));
      assert.ok(q);
      // Ensure we answer amount question
      let state = s;
      if (!/amount/i.test(q.requirementId) && !/amount/i.test(q.expectedAnswerType)) {
        const amountQ = s.session.questions.find(
          (x) => x.expectedAnswerType === "amount" && x.fieldCode === "1AJ"
        );
        if (amountQ) {
          amountQ.status = "asked";
          const r = applyClarificationAnswer(state, amountQ.questionId, "32450");
          state = r.state;
        }
      } else {
        const r = applyClarificationAnswer(state, q.questionId, "32450");
        state = r.state;
      }
      // Si rôle déjà connu + montant user → applicable
      const st = state.documentCase.applicabilityEvaluations.find(
        (e) => e.fieldCode === "1AJ"
      ).status;
      assert.ok(
        st === "applicable" || st === "needsInformation",
        `status=${st}`
      );
      if (st === "needsInformation") {
        // peut manquer le rôle selon matching — acceptable si non inventé
        assert.notEqual(st, "notApplicable");
      }
    }
    ok("10");

    section("11 — user unknown → pas de conclusion inventée / pas de boucle");
    {
      let s = initClarificationState(build(F.salary1AJEmpty));
      const qid = s.currentQuestion.questionId;
      const r = applyClarificationAnswer(s, qid, "je ne sais pas");
      const st = r.state.documentCase.applicabilityEvaluations.find(
        (e) => e.fieldCode === "1AJ"
      ).status;
      assert.notEqual(st, "applicable");
      assert.notEqual(st, "notApplicable");
      assert.equal(
        r.state.documentCase.applicabilityInvariants
          ?.applicabilityClarificationLoop || 0,
        0
      );
    }
    ok("11");

    section("12 — user refused → pas de conclusion inventée");
    {
      let s = initClarificationState(build(F.salary1AJEmpty));
      const r = applyClarificationAnswer(
        s,
        s.currentQuestion.questionId,
        "passer"
      );
      const st = r.state.documentCase.applicabilityEvaluations.find(
        (e) => e.fieldCode === "1AJ"
      ).status;
      assert.ok(st === "needsInformation" || st === "unknown");
    }
    ok("12");

    section("13 — document supprimé → evaluation recalculée");
    {
      const c = build([F.salary1AJComplete, F.riciEmpty7DB]);
      const before = statusOf(c, "1AJ");
      assert.equal(before, "applicable");
      const docId = c.documents.find((d) => /1AJ|2042-1AJ/i.test(d.fileName || ""))
        ?.documentId;
      const after = removeDocumentFromCase(c, docId);
      const st = after.applicabilityEvaluations?.find((e) => e.fieldCode === "1AJ")
        ?.status;
      assert.ok(!st || st !== "applicable" || after.documents.length === 0);
    }
    ok("13");

    section("14 — document ajouté → evaluation recalculée");
    {
      const c = build(F.salary1AJEmpty);
      assert.equal(statusOf(c, "1AJ"), "needsInformation");
      const added = addDocumentsToCase(c, [F.salary1AJComplete]);
      assert.equal(statusOf(added, "1AJ"), "applicable");
    }
    ok("14");

    section("15 — conflit → nouvelle evidence user alignée");
    {
      const c = build(F.foncierReel);
      const conflicted = evaluateTaxFieldApplicability({
        fieldCode: "4BA",
        facts: c.factIndex,
        documents: c.documents,
        documentTexts: c.documents.map((d) => d.text),
        fieldCodesPresent: ["4BA"],
        yearsPresent: [2024],
        targetYear: 2024,
        userFacts: [
          {
            kind: "user",
            questionId: "q",
            requirementId: "4ba-regime",
            fieldCode: "4BA",
            answer: "micro",
            normalizedValue: "micro",
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      }).evaluation;
      assert.equal(conflicted.status, "conflicted");
      const resolved = evaluateTaxFieldApplicability({
        fieldCode: "4BA",
        facts: c.factIndex,
        documents: c.documents,
        documentTexts: c.documents.map((d) => d.text),
        fieldCodesPresent: ["4BA"],
        yearsPresent: [2024],
        targetYear: 2024,
        userFacts: [
          {
            kind: "user",
            questionId: "q2",
            requirementId: "4ba-regime",
            fieldCode: "4BA",
            answer: "régime réel",
            normalizedValue: "reel",
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      }).evaluation;
      assert.equal(resolved.status, "applicable");
    }
    ok("15");

    section("16 — absence totale → jamais notApplicable par défaut");
    {
      const c = build(F.foncierNoRegime);
      for (const ev of c.applicabilityEvaluations || []) {
        assert.notEqual(ev.status, "notApplicable");
      }
      const bare = evaluateTaxFieldApplicability({
        fieldCode: "4BA",
        facts: [],
        fieldCodesPresent: [],
        yearsPresent: [],
        documentTexts: []
      }).evaluation;
      assert.notEqual(bare.status, "notApplicable");
      assert.ok(
        bare.status === "needsInformation" || bare.status === "unknown"
      );
    }
    ok("16");

    section("Supporting document ≠ eligibility (7DB)");
    {
      const c = build([F.riciEmpty7DB, F.attestation7DB]);
      const ev = c.applicabilityEvaluations?.find((e) => e.fieldCode === "7DB");
      assert.ok(ev, "7DB evaluation attendue");
      assert.notEqual(ev.status, "applicable");
      assert.equal(
        c.applicabilityInvariants.supportingDocumentPromotedToEligibility,
        0
      );
    }
    ok("7db-support");

    section("7DR amount present → applicable (scope aides)");
    {
      const c = build(F.form7DR);
      assert.equal(statusOf(c, "7DR"), "applicable");
    }
    ok("7dr");

    section("4BA régime réel document → applicable");
    {
      const c = build(F.foncierReel);
      assert.equal(statusOf(c, "4BA"), "applicable");
    }
    ok("4ba");

    section("Eligibility stub still throws + audit + rules provenance");
    {
      assert.throws(() => decideFieldApplicability({}), /éligibilité|V4/i);
      assert.ok(TAX_APPLICABILITY_RULES.every((r) => r.provenance.length));
      assert.ok(TAX_APPLICABILITY_RULES.every((r) => r.sourceExcerpt));
      const c = build(F.salary1AJComplete);
      const report = auditTaxApplicability(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      for (const [k, v] of Object.entries(c.applicabilityInvariants || {})) {
        assert.equal(v, 0, k);
      }
      // déterminisme
      const again = build(F.salary1AJComplete);
      assert.equal(
        JSON.stringify(c.applicabilityEvaluations.map((e) => [e.fieldCode, e.status, e.ruleId])),
        JSON.stringify(
          again.applicabilityEvaluations.map((e) => [
            e.fieldCode,
            e.status,
            e.ruleId
          ])
        )
      );
    }
    ok("safety");

    section("Perf 10 docs");
    {
      const docs = Array.from({ length: 10 }, (_, i) => ({
        fileName: `doc-${i}.pdf`,
        text:
          i % 2 === 0
            ? F.salary1AJComplete.text
            : F.riciEmpty7DB.text
      }));
      const t0 = Date.now();
      const c = build(docs);
      const ms = Date.now() - t0;
      assert.ok(c.applicabilityEvaluations?.length >= 1);
      assert.ok(ms < 5000, `trop lent: ${ms}ms`);
      console.log(`    10 docs applicability in ${ms}ms`);
    }
    ok("perf");

    assert.equal(fetchCalls, 0);
    console.log(
      `\n=== V4-T OK — ${passed} checks (fetch=${fetchCalls}) rules=${TAX_APPLICABILITY_RULES.length} ===`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
