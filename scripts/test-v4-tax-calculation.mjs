/**
 * V4-U — calcul déterministe / formules sourcées (25+ checks)
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  applyClarificationAnswer,
  assertCalculationOrderStable,
  auditTaxCalculation,
  buildDocumentCase,
  calculateDerivedValue,
  evaluateDocumentCaseCalculations,
  evaluateTypedOperation,
  initClarificationState,
  NON_MODELED_FORMULA_NOTES,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  TAX_FORMULAS
} from "../lib/v4/index.ts";
import {
  CALC_DOCS,
  makeApplicable,
  makeFacts,
  makeTestSumFormula
} from "../lib/v4/__fixtures__/fiscal/calculationFixtures.mjs";

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
  resetDerivedIdsForTests();
}
function build(docs) {
  reset();
  return buildDocumentCase(Array.isArray(docs) ? docs : [docs], {
    resetIds: true
  });
}

function calcWith(opts) {
  return calculateDerivedValue({
    targetYear: 2024,
    documents: [],
    userFacts: [],
    ...opts,
    applicability: opts.applicability ?? makeApplicable(opts.fieldCode),
    extraFormulas: opts.extraFormulas ?? [makeTestSumFormula()]
  });
}

function main() {
  console.log("=== test:v4-tax-calculation (V4-U) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-U");
  };

  try {
    section("Pack production vide + ops typées");
    {
      assert.equal(TAX_FORMULAS.length, 0);
      assert.ok(NON_MODELED_FORMULA_NOTES.length >= 3);
      const sum = evaluateTypedOperation(
        "sum",
        [500, 800, 1200],
        "EUR",
        ["EUR", "EUR", "EUR"],
        "none"
      );
      assert.equal(sum.ok, true);
      assert.equal(sum.value, 2500);
      const bad = evaluateTypedOperation(
        "sum",
        [500, 10],
        "EUR",
        ["EUR", "percentage"],
        "none"
      );
      assert.equal(bad.ok, false);
    }
    ok("pack-ops");

    section("1 — formule + inputs complets → calculated");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 })
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 2500);
      assert.equal(result.unit, "EUR");
      assert.equal(result.formulaId, "test-fixture-sum-eur-household");
      assert.ok(result.derivedValue?.kind === "derived");
    }
    ok("1");

    section("2 — input absent → needsInformation");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800 })
      });
      assert.equal(result.status, "needsInformation");
      assert.ok(result.missingInputs.includes("c"));
    }
    ok("2");

    section("3 — input conflictuel → conflicted");
    {
      const facts = [
        ...makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 }),
        {
          factId: "tf-A-alt",
          factType: "amount",
          fieldCode: "TEST_A",
          value: 999,
          displayValue: "999",
          year: 2024,
          declarantRole: "household",
          documentType: "taxForm",
          sourceDocumentId: "doc-A2",
          sourceDocumentLabel: "alt.pdf",
          provenanceNote: "alt",
          evidence: []
        }
      ];
      const { result } = calcWith({ fieldCode: "TEST_SUM", facts });
      assert.equal(result.status, "conflicted");
    }
    ok("3");

    section("4 — applicability unknown → pas de calcul");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 }),
        applicability: { ...makeApplicable(), status: "unknown" }
      });
      assert.notEqual(result.status, "calculated");
    }
    ok("4");

    section("5 — applicability needsInformation → pas de calcul");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 }),
        applicability: {
          ...makeApplicable(),
          status: "needsInformation",
          missingInformation: [
            {
              id: "x",
              fieldCode: "TEST_SUM",
              question: "?",
              expectedAnswerType: "text",
              reason: "manque",
              ruleId: "r"
            }
          ]
        }
      });
      assert.equal(result.status, "needsInformation");
    }
    ok("5");

    section("6 — applicability notApplicable → notApplicable");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 }),
        applicability: { ...makeApplicable(), status: "notApplicable" }
      });
      assert.equal(result.status, "notApplicable");
    }
    ok("6");

    section("7 — formule absente → unsupported");
    {
      const { result } = calculateDerivedValue({
        fieldCode: "1AJ",
        facts: makeFacts({ "1AJ": 32450 }),
        applicability: makeApplicable("1AJ"),
        targetYear: 2024,
        extraFormulas: []
      });
      assert.equal(result.status, "unsupported");
    }
    ok("7");

    section("8 — provenance formule absente → unsupported");
    {
      const f = makeTestSumFormula({ provenance: [], verificationStatus: "verified" });
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 1, TEST_B: 2, TEST_C: 3 }),
        extraFormulas: [f]
      });
      assert.equal(result.status, "unsupported");
    }
    ok("8");

    section("9 — mauvaise année → pas de calcul");
    {
      const f = makeTestSumFormula({
        yearPolicy: "exact",
        taxYears: [2025]
      });
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 1, TEST_B: 2, TEST_C: 3 }),
        extraFormulas: [f],
        targetYear: 2024
      });
      assert.notEqual(result.status, "calculated");
    }
    ok("9");

    section("10 — mauvais rôle → pas de calcul / input manquant");
    {
      const f = makeTestSumFormula({
        rolePolicy: "declarant1",
        inputs: makeTestSumFormula().inputs.map((i) => ({
          ...i,
          role: "declarant1"
        }))
      });
      const facts = makeFacts({ TEST_A: 1, TEST_B: 2, TEST_C: 3 }).map((x) => ({
        ...x,
        declarantRole: "declarant2"
      }));
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts,
        extraFormulas: [f]
      });
      assert.notEqual(result.status, "calculated");
    }
    ok("10");

    section("11 — unités incompatibles → pas de calcul");
    {
      const f = makeTestSumFormula({
        inputs: [
          {
            inputId: "a",
            label: "A",
            fieldCode: "TEST_A",
            unit: "EUR",
            required: true
          },
          {
            inputId: "b",
            label: "B",
            fieldCode: "TEST_B",
            unit: "percentage",
            required: true
          }
        ],
        operation: "sum",
        unit: "EUR"
      });
      // Force resolved units mismatch via evaluateTypedOperation path:
      // resolve will tag unit from input def; evaluateTypedOperation checks mismatch
      const facts = makeFacts({ TEST_A: 100, TEST_B: 10 });
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts,
        extraFormulas: [f]
      });
      // missing c + unit issues → not calculated
      assert.notEqual(result.status, "calculated");
      const op = evaluateTypedOperation(
        "sum",
        [100, 10],
        "EUR",
        ["EUR", "percentage"],
        "none"
      );
      assert.equal(op.ok, false);
    }
    ok("11");

    section("12 — duplicate document → pas de double-count");
    {
      const c = build(CALC_DOCS.duplicatePair);
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.ok(
        (c.calculationInvariants?.duplicateAmountDoubleCount || 0) === 0
      );
      // 1AJ unsupported (no production formula) — values not summed
      const r = c.calculationResults?.find((x) => x.fieldCode === "1AJ");
      assert.ok(!r || r.status !== "calculated" || r.value === 32450);
    }
    ok("12");

    section("13 — possibleVersion → pas de sélection arbitraire");
    {
      // Engine does not auto-pick a version; conflicting values → conflicted
      const facts = [
        {
          factId: "v1",
          factType: "amount",
          fieldCode: "TEST_A",
          value: 100,
          displayValue: "100",
          year: 2024,
          declarantRole: "household",
          documentType: "taxForm",
          sourceDocumentId: "d1",
          sourceDocumentLabel: "draft",
          provenanceNote: "draft",
          evidence: []
        },
        {
          factId: "v2",
          factType: "amount",
          fieldCode: "TEST_A",
          value: 200,
          displayValue: "200",
          year: 2024,
          declarantRole: "household",
          documentType: "taxForm",
          sourceDocumentId: "d2",
          sourceDocumentLabel: "final",
          provenanceNote: "final",
          evidence: []
        },
        ...makeFacts({ TEST_B: 1, TEST_C: 1 }).filter(
          (f) => f.fieldCode !== "TEST_A"
        )
      ];
      const docs = [
        {
          documentId: "d1",
          fileName: "draft.pdf",
          contentHash: "h1",
          detectedType: "taxForm",
          detectedReference: "2042",
          fiscalYear: 2024,
          documentYear: 2024,
          confidence: 1,
          recognitionLabel: "draft",
          text: "draft",
          facts: [],
          detectedFields: [],
          fieldExplanations: [],
          duplicateOf: null,
          duplicateStatus: "possibleVersion",
          isPrimaryCopy: true,
          provenance: []
        },
        {
          documentId: "d2",
          fileName: "final.pdf",
          contentHash: "h2",
          detectedType: "taxForm",
          detectedReference: "2042",
          fiscalYear: 2024,
          documentYear: 2024,
          confidence: 1,
          recognitionLabel: "final",
          text: "final",
          facts: [],
          detectedFields: [],
          fieldExplanations: [],
          duplicateOf: null,
          duplicateStatus: "possibleVersion",
          isPrimaryCopy: true,
          provenance: []
        }
      ];
      const { result, invariants } = calcWith({
        fieldCode: "TEST_SUM",
        facts,
        documents: docs
      });
      assert.equal(result.status, "conflicted");
      assert.equal(invariants.versionAmountAutoSelected, 0);
    }
    ok("13");

    section("14 — ordre upload inversé → même résultat");
    {
      const a = build([CALC_DOCS.salary1AJ, CALC_DOCS.empty1AJ]);
      const b = build([CALC_DOCS.empty1AJ, CALC_DOCS.salary1AJ]);
      const stab = assertCalculationOrderStable(
        a.calculationResults || [],
        b.calculationResults || []
      );
      assert.equal(stab.ok, true);
    }
    ok("14");

    section("15 — document supprimé → recalcul");
    {
      const c = build([CALC_DOCS.salary1AJ, CALC_DOCS.empty1AJ]);
      const id = c.documents[0].documentId;
      const after = removeDocumentFromCase(c, id);
      assert.ok(after.calculationResults);
      assert.equal(after.suggestedDeclaredAmount, null);
    }
    ok("15");

    section("16 — document ajouté → recalcul");
    {
      const c = build(CALC_DOCS.empty1AJ);
      const after = addDocumentsToCase(c, [CALC_DOCS.salary1AJ]);
      assert.ok(after.calculationResults);
    }
    ok("16");

    section("17 — clarification fournit input → recalcul possible");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800 }),
        userFacts: [
          {
            kind: "user",
            factId: "uf-c",
            questionId: "q",
            requirementId: "c",
            fieldCode: "TEST_C",
            answer: "1200",
            normalizedValue: 1200,
            valueType: "amount",
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true,
            year: 2024,
            role: "household"
          }
        ]
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 2500);
    }
    ok("17");

    section("18 — user unknown → pas de calcul");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800 }),
        userFacts: [
          {
            kind: "user",
            questionId: "q",
            requirementId: "c",
            fieldCode: "TEST_C",
            answer: "je ne sais pas",
            answerStatus: "unknown",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      });
      assert.equal(result.status, "needsInformation");
    }
    ok("18");

    section("19 — user refused → pas de calcul");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800 }),
        userFacts: [
          {
            kind: "user",
            questionId: "q",
            requirementId: "c",
            fieldCode: "TEST_C",
            answer: "passer",
            answerStatus: "refused",
            answeredAt: null,
            source: "clarification",
            active: true
          }
        ]
      });
      assert.equal(result.status, "needsInformation");
    }
    ok("19");

    section("20 — 500+800+1200 sans formule → PAS 2500");
    {
      const c = build(CALC_DOCS.multiAmountsNoFormula);
      assert.equal(c.suggestedDeclaredAmount, null);
      for (const r of c.calculationResults || []) {
        assert.notEqual(r.value, 2500);
        assert.notEqual(r.status, "calculated");
      }
      // Direct API without formula
      const { result } = calculateDerivedValue({
        fieldCode: "NOPE",
        facts: makeFacts({ NOPE: 500 }).concat(
          makeFacts({ NOPE: 800 }),
          makeFacts({ NOPE: 1200 })
        ),
        applicability: makeApplicable("NOPE"),
        extraFormulas: []
      });
      assert.equal(result.status, "unsupported");
      assert.notEqual(result.value, 2500);
    }
    ok("20");

    section("21 — même somme avec formule fixture autorisée → 2500");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 })
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 2500);
    }
    ok("21");

    section("22 — rounding non sourcé / policy invalide → refus");
    {
      const op = evaluateTypedOperation(
        "sum",
        [1.2, 3.4],
        "EUR",
        ["EUR", "EUR"],
        /** @type {any} */ ("magicRound")
      );
      assert.equal(op.ok, false);
    }
    ok("22");

    section("23 — EUR + percentage → refus");
    {
      const op = evaluateTypedOperation(
        "sum",
        [100, 5],
        "EUR",
        ["EUR", "percentage"],
        "none"
      );
      assert.equal(op.ok, false);
    }
    ok("23");

    section("24 — conflit user/document → conflicted");
    {
      const { result } = calcWith({
        fieldCode: "TEST_SUM",
        facts: makeFacts({ TEST_A: 500, TEST_B: 800, TEST_C: 1200 }),
        userFacts: [
          {
            kind: "user",
            factId: "uf",
            questionId: "q",
            requirementId: "a",
            fieldCode: "TEST_A",
            answer: "1",
            normalizedValue: 1,
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true,
            year: 2024,
            role: "household"
          }
        ]
      });
      assert.equal(result.status, "conflicted");
    }
    ok("24");

    section("25 — deux sources identiques → une valeur, pas de double-count");
    {
      const facts = [
        ...makeFacts({ TEST_A: 500 }),
        {
          ...makeFacts({ TEST_A: 500 })[0],
          factId: "tf-A-2",
          sourceDocumentId: "doc-A-2"
        },
        ...makeFacts({ TEST_B: 800, TEST_C: 1200 })
      ];
      const { result } = calcWith({ fieldCode: "TEST_SUM", facts });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 2500);
    }
    ok("25");

    section("Boundaries + audit + clarification regression surface");
    {
      const c = build(CALC_DOCS.salary1AJ);
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.equal(c.eligibilityDecision, null);
      const aj = c.calculationResults?.find((r) => r.fieldCode === "1AJ");
      assert.ok(aj);
      assert.equal(aj.status, "unsupported"); // pas de formule identity inventée
      const report = auditTaxCalculation(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      for (const [k, v] of Object.entries(c.calculationInvariants || {})) {
        assert.equal(v, 0, k);
      }

      // clarification still works
      let s = initClarificationState(build(CALC_DOCS.empty1AJ));
      if (s.currentQuestion) {
        const r = applyClarificationAnswer(
          s,
          s.currentQuestion.questionId,
          "32450"
        );
        assert.equal(r.state.documentCase.suggestedDeclaredAmount, null);
      }
    }
    ok("boundaries");

    section("Perf 10 docs");
    {
      const docs = Array.from({ length: 10 }, (_, i) => ({
        fileName: `d${i}.pdf`,
        text: i % 2 ? CALC_DOCS.salary1AJ.text : CALC_DOCS.empty1AJ.text
      }));
      const t0 = Date.now();
      const c = build(docs);
      const ms = Date.now() - t0;
      assert.ok(c.calculationMetrics);
      assert.ok(ms < 5000);
      console.log(
        `    10 docs calc metrics=${JSON.stringify(c.calculationMetrics)} (${ms}ms)`
      );
    }
    ok("perf");

    assert.equal(fetchCalls, 0);
    console.log(`\n=== V4-U OK — ${passed} checks (fetch=${fetchCalls}) formulas_prod=${TAX_FORMULAS.length} ===`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
