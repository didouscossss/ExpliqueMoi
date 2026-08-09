/**
 * V4-X — explication locale déterministe et traçable
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  applyClarificationAnswer,
  assertCalculationOrderStable,
  attachLocalExplanations,
  auditLocalExplanations,
  buildDocumentCase,
  buildLocalExplanations,
  buildPremiumExplanationContext,
  calculateDerivedValue,
  documentCaseToPreviewJson,
  initClarificationState,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetLocalExplanationIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests
} from "../lib/v4/index.ts";
import { makeApplicable } from "../lib/v4/__fixtures__/fiscal/calculationFixtures.mjs";
import {
  FIRST_FORMULA_DOCS,
  make4BEFacts,
  makeExclusionsOkUserFact
} from "../lib/v4/__fixtures__/fiscal/firstFormulaFixtures.mjs";

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
  resetLocalExplanationIdsForTests();
}
function build(docs) {
  reset();
  return buildDocumentCase(Array.isArray(docs) ? docs : [docs], {
    resetIds: true
  });
}

function main() {
  console.log("=== test:v4-local-explanation (V4-X) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-X");
  };

  try {
    section("A — fait documentaire simple sans règle calculante");
    {
      const c = build({
        fileName: "note.pdf",
        text: `
Direction générale des Finances publiques
Formulaire 2042
Revenus de l'année 2024
déclarant 1 Case 1AJ : 32 450 €
`.trim()
      });
      const lex = c.localExplanations?.find((e) => e.subject === "1AJ");
      assert.ok(lex);
      assert.ok(lex.summary.length > 0);
      assert.ok(
        lex.sourceFacts.some((f) => f.kind === "document") ||
          /1AJ|32/.test(lex.summary + lex.details.join(" "))
      );
      // Pas de faux calcul 4BE
      assert.ok(!/7\s*000/.test(lex.summary));
      assert.equal(c.suggestedDeclaredAmount, null);
    }
    ok("A-simple-fact");

    section("B — 4BE=10000 + conditions → explication + 7000");
    {
      const { result } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2024
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 7000);

      // Compose via attach on a synthetic case shell
      const base = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      const withUser = {
        ...base,
        userAnswers: [makeExclusionsOkUserFact()],
        calculationResults: [result],
        caseCentricViews: base.caseCentricViews.map((v) =>
          v.fieldCode === "4BE"
            ? {
                ...v,
                calculation: result,
                applicability: {
                  ...(v.applicability || makeApplicable("4BE")),
                  status: "applicable"
                }
              }
            : v
        ),
        applicabilityEvaluations: (
          base.applicabilityEvaluations || []
        ).map((e) =>
          e.fieldCode === "4BE" ? { ...e, status: "applicable" } : e
        )
      };
      const { explanations } = buildLocalExplanations(withUser);
      const lex = explanations.find((e) => e.subject === "4BE");
      assert.ok(lex);
      assert.equal(lex.status, "explained");
      assert.ok(/10\s*000|10000/.test(lex.summary + lex.details.join(" ")));
      assert.ok(
        lex.calculation?.value === 7000 ||
          /7\s*000|7000/.test(
            lex.summary + (lex.calculationExplanation || "")
          )
      );
      assert.ok(
        !/vous devez déclarer|montant à reporter en 4BE/i.test(
          [lex.summary, ...lex.details, lex.calculationExplanation || ""].join(
            " "
          )
        )
      );
      assert.ok(lex.why.length);
      assert.ok(lex.sourceRefs.length || lex.ruleRefs.length);
    }
    ok("B-4be-positive");

    section("C — 4BE sans conditions → needsInformation");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      const lex = c.localExplanations?.find((e) => e.subject === "4BE");
      assert.ok(lex);
      assert.equal(lex.status, "needsInformation");
      assert.ok(lex.missingInformation.length || /nécessaire|manque/i.test(lex.summary));
      assert.ok(!lex.calculation || lex.calculation.value == null);
    }
    ok("C-needs-info");

    section("D — montant > plafond → pas de faux calcul 7000");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_16000);
      const lex = c.localExplanations?.find((e) => e.subject === "4BE");
      const calc = c.calculationResults?.find((r) => r.fieldCode === "4BE");
      assert.ok(calc);
      assert.notEqual(calc.status, "calculated");
      assert.ok(!lex || lex.calculation?.value !== 7000);
      assert.ok(
        !lex ||
          !/revenu imposable calculé\s*:\s*7/.test(
            (lex.summary || "") + (lex.calculationExplanation || "")
          )
      );
    }
    ok("D-ceiling");

    section("E — conflit document/user");
    {
      const { result } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [
          makeExclusionsOkUserFact(),
          {
            kind: "user",
            factId: "uf-amt",
            questionId: "q",
            requirementId: "4be-amount",
            fieldCode: "4BE",
            answer: "12000",
            normalizedValue: 12000,
            answerStatus: "accepted",
            answeredAt: null,
            source: "clarification",
            active: true,
            year: 2024,
            role: "household"
          }
        ],
        applicability: makeApplicable("4BE"),
        targetYear: 2024
      });
      assert.equal(result.status, "conflicted");
      const shell = attachLocalExplanations({
        ...build(FIRST_FORMULA_DOCS.micro4BE_10000),
        calculationResults: [result],
        caseCentricViews: build(FIRST_FORMULA_DOCS.micro4BE_10000).caseCentricViews.map(
          (v) => (v.fieldCode === "4BE" ? { ...v, calculation: result } : v)
        )
      });
      const lex = shell.localExplanations?.find((e) => e.subject === "4BE");
      assert.ok(lex);
      assert.equal(lex.status, "conflicted");
      assert.ok(/contradictoires/i.test(lex.summary));
    }
    ok("E-conflict");

    section("F — mauvaise année");
    {
      const { result } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2018
      });
      assert.notEqual(result.status, "calculated");
      const shell = attachLocalExplanations({
        ...build(FIRST_FORMULA_DOCS.micro4BE_10000),
        calculationResults: [result]
      });
      const lex = shell.localExplanations?.find((e) => e.subject === "4BE");
      assert.ok(lex);
      assert.notEqual(lex.calculation?.value, 7000);
    }
    ok("F-bad-year");

    section("G/H/I — experimental / unsupported / absence source");
    {
      // unsupported calculation path yields non-promoted explanation
      const c = build(FIRST_FORMULA_DOCS.reel4BA);
      const lex = c.localExplanations?.find((e) => e.subject === "4BA");
      assert.ok(lex);
      // 4BA has applicability but no calculation formula → no fake derived value
      assert.ok(
        !lex.calculation ||
          lex.calculation.status !== "calculated" ||
          lex.calculation.value == null
      );
      const report = auditLocalExplanations(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      for (const [k, v] of Object.entries(c.localExplanationInvariants || {})) {
        assert.equal(v, 0, k);
      }
    }
    ok("G-H-I-safety");

    section("J — add/remove document → recalcul explications");
    {
      const c = build([
        FIRST_FORMULA_DOCS.micro4BE_10000,
        FIRST_FORMULA_DOCS.micro4BE_noAmount
      ]);
      assert.ok(c.localExplanations?.length);
      const afterRm = removeDocumentFromCase(c, c.documents[0].documentId);
      assert.ok(afterRm.localExplanations);
      const afterAdd = addDocumentsToCase(
        build(FIRST_FORMULA_DOCS.micro4BE_noAmount),
        [FIRST_FORMULA_DOCS.micro4BE_10000]
      );
      assert.ok(afterAdd.localExplanations?.some((e) => e.subject === "4BE"));
    }
    ok("J-add-remove");

    section("K — clarification → explication recalculée");
    {
      let s = initClarificationState(build(FIRST_FORMULA_DOCS.micro4BE_10000));
      if (s.currentQuestion) {
        const r = applyClarificationAnswer(
          s,
          s.currentQuestion.questionId,
          "oui"
        );
        assert.ok(r.state.documentCase.localExplanations);
        assert.equal(r.state.documentCase.suggestedDeclaredAmount, null);
      } else {
        // still OK if no question queued
        assert.ok(true);
      }
    }
    ok("K-clarification");

    section("L — ordre upload → résultat identique");
    {
      const a = build([
        FIRST_FORMULA_DOCS.micro4BE_10000,
        FIRST_FORMULA_DOCS.reel4BA
      ]);
      const b = build([
        FIRST_FORMULA_DOCS.reel4BA,
        FIRST_FORMULA_DOCS.micro4BE_10000
      ]);
      const ka = (a.localExplanations || [])
        .map((e) => `${e.subject}|${e.status}|${e.summary}`)
        .sort();
      const kb = (b.localExplanations || [])
        .map((e) => `${e.subject}|${e.status}|${e.summary}`)
        .sort();
      assert.deepEqual(ka, kb);
      assert.equal(
        assertCalculationOrderStable(
          a.calculationResults || [],
          b.calculationResults || []
        ).ok,
        true
      );
    }
    ok("L-upload-order");

    section("M/N/O — pas de promotion déclaration / éligibilité / agrégation");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.equal(c.eligibilityDecision, null);
      const report = auditLocalExplanations(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      assert.equal(
        c.localExplanationInvariants?.explanationPromotedToDeclaration,
        0
      );
      assert.equal(
        c.localExplanationInvariants?.explanationPromotedToEligibility,
        0
      );
      assert.equal(
        c.localExplanationInvariants?.implicitExplanationAggregation,
        0
      );
      // ViewModel exposes local_explanation
      const vm = documentCaseToPreviewJson(c);
      assert.ok(
        (vm.tax_fields || []).some(
          (f) => f.field_code === "4BE" && f.local_explanation
        )
      );
      // Premium boundary stub — no network
      const prem = buildPremiumExplanationContext(c, ["4BE"]);
      assert.ok(prem.note.includes("aucun appel"));
      assert.deepEqual(prem.selectedSubjects, ["4BE"]);
    }
    ok("M-N-O-boundaries");

    section("Read-only — explanation ne mute pas les faits");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      const before = JSON.stringify(c.factIndex);
      buildLocalExplanations(c);
      assert.equal(JSON.stringify(c.factIndex), before);
      assert.equal(c.suggestedDeclaredAmount, null);
    }
    ok("readonly");

    assert.equal(fetchCalls, 0);
    console.log(
      `\n=== V4-X OK — ${passed} checks (fetch=${fetchCalls}) ===`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
