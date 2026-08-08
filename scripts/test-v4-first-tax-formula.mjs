/**
 * V4-V — première formule fiscale réelle (micro-foncier 4BE, abattement 30 %).
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  applyClarificationAnswer,
  assertCalculationOrderStable,
  auditTaxCalculation,
  buildDocumentCase,
  calculateDerivedValue,
  getProductionFormulaById,
  initClarificationState,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  TAX_FORMULAS
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
}
function build(docs) {
  reset();
  return buildDocumentCase(Array.isArray(docs) ? docs : [docs], {
    resetIds: true
  });
}

function calc4BE(opts) {
  return calculateDerivedValue({
    fieldCode: "4BE",
    targetYear: 2024,
    documents: [],
    userFacts: [],
    applicability: makeApplicable("4BE"),
    extraFormulas: [],
    ...opts
  });
}

function main() {
  console.log("=== test:v4-first-tax-formula (V4-V) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-V");
  };

  try {
    section("Formule production unique + provenance");
    {
      assert.equal(TAX_FORMULAS.length, 1);
      const f = getProductionFormulaById("4be-micro-foncier-revenu-imposable");
      assert.ok(f);
      assert.equal(f.verificationStatus, "verified");
      assert.ok(f.provenance.length >= 1);
      assert.ok(f.sourceExcerpt.includes("30"));
      assert.ok(f.sourceExcerpt.includes("15 000"));
      assert.equal(
        f.constants.find((c) => c.constantId === "abatementPercent")?.value,
        30
      );
      assert.equal(
        f.constants.find((c) => c.constantId === "grossCeilingEur")?.value,
        15000
      );
      assert.ok(
        f.provenance.some((p) =>
          p.url.includes("simulateur-ir-ifi.impots.gouv.fr")
        )
      );
    }
    ok("formula-provenance");

    section("1 — positif : 10 000 × 70 % → 7 000 calculated");
    {
      const { result, invariants } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()]
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 7000);
      assert.equal(result.unit, "EUR");
      assert.equal(result.formulaId, "4be-micro-foncier-revenu-imposable");
      assert.ok(result.derivedValue);
      assert.equal(invariants.derivedValuePromotedToDeclaredAmount, 0);
      assert.equal(invariants.calculationPromotedToEligibility, 0);
    }
    ok("positive");

    section("2 — montant absent → needsInformation");
    {
      const { result } = calc4BE({
        facts: [],
        userFacts: [makeExclusionsOkUserFact()]
      });
      assert.equal(result.status, "needsInformation");
      assert.ok(result.missingInputs.includes("recettesBrutes"));
    }
    ok("missing-amount");

    section("3 — exclusions non confirmées → needsInformation");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: []
      });
      assert.equal(result.status, "needsInformation");
      assert.ok(result.missingInputs.includes("4be-micro-exclusions-ok"));
    }
    ok("missing-exclusions");

    section("4 — conflit document/user sur 4BE → conflicted");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [
          makeExclusionsOkUserFact(),
          {
            kind: "user",
            factId: "uf-4be-amt",
            questionId: "q-amt",
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
        ]
      });
      assert.equal(result.status, "conflicted");
    }
    ok("conflict");

    section("5 — mauvaise année → pas de calcul");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        targetYear: 2020
      });
      assert.notEqual(result.status, "calculated");
    }
    ok("bad-year");

    section("6 — mauvais rôle sur l’input → needsInformation");
    {
      const facts = make4BEFacts(10000, { declarantRole: "declarant2" });
      const { result } = calc4BE({
        facts,
        userFacts: [makeExclusionsOkUserFact()]
      });
      // rolePolicy household + input.role household → declarant2 skipped
      assert.notEqual(result.status, "calculated");
    }
    ok("bad-role");

    section("7 — plafond 15 000 dépassé → notApplicable");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(16000),
        userFacts: [makeExclusionsOkUserFact()]
      });
      assert.equal(result.status, "notApplicable");
      assert.equal(result.value, null);
    }
    ok("ceiling");

    section("8 — applicability unknown → pas de calcul");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: { ...makeApplicable("4BE"), status: "unknown" }
      });
      assert.notEqual(result.status, "calculated");
    }
    ok("app-unknown");

    section("9 — applicability notApplicable (régime réel) → notApplicable");
    {
      const { result } = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: { ...makeApplicable("4BE"), status: "notApplicable" }
      });
      assert.equal(result.status, "notApplicable");
    }
    ok("app-not-applicable");

    section("10 — dossier micro 4BE sans exclusions → needsInformation (case)");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      const r = c.calculationResults?.find((x) => x.fieldCode === "4BE");
      assert.ok(r);
      assert.equal(r.status, "needsInformation");
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.equal(c.eligibilityDecision, null);
    }
    ok("case-needs-exclusions");

    section("11 — ordre upload inversé → résultat structurel identique");
    {
      const a = build([
        FIRST_FORMULA_DOCS.micro4BE_10000,
        FIRST_FORMULA_DOCS.reel4BA
      ]);
      const b = build([
        FIRST_FORMULA_DOCS.reel4BA,
        FIRST_FORMULA_DOCS.micro4BE_10000
      ]);
      const stab = assertCalculationOrderStable(
        a.calculationResults || [],
        b.calculationResults || []
      );
      assert.equal(stab.ok, true);
    }
    ok("upload-order");

    section("12 — suppression document → recalcul");
    {
      const c = build([
        FIRST_FORMULA_DOCS.micro4BE_10000,
        FIRST_FORMULA_DOCS.micro4BE_noAmount
      ]);
      const id = c.documents[0].documentId;
      const after = removeDocumentFromCase(c, id);
      assert.ok(after.calculationResults);
      assert.equal(after.suggestedDeclaredAmount, null);
    }
    ok("remove-doc");

    section("13 — ajout document → recalcul");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_noAmount);
      const after = addDocumentsToCase(c, [FIRST_FORMULA_DOCS.micro4BE_10000]);
      const r = after.calculationResults?.find((x) => x.fieldCode === "4BE");
      assert.ok(r);
      // toujours needsInformation sans confirmation exclusions
      assert.notEqual(r.status, "calculated");
    }
    ok("add-doc");

    section("14 — clarification exclusions → recalcul possible (API)");
    {
      const before = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: []
      });
      assert.equal(before.result.status, "needsInformation");
      const after = calc4BE({
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()]
      });
      assert.equal(after.result.status, "calculated");
      assert.equal(after.result.value, 7000);
    }
    ok("clarification-recalc");

    section("15 — user unknown / refused → pas de calcul");
    {
      for (const status of ["unknown", "refused"]) {
        const { result } = calc4BE({
          facts: make4BEFacts(10000),
          userFacts: [
            makeExclusionsOkUserFact({
              answerStatus: status,
              answer: status === "unknown" ? "je ne sais pas" : "passer",
              normalizedValue: null
            })
          ]
        });
        assert.equal(result.status, "needsInformation", status);
      }
    }
    ok("user-unknown-refused");

    section("16 — frontières : pas de promotion declared/eligibility");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.equal(c.eligibilityDecision, null);
      const report = auditTaxCalculation(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      for (const [k, v] of Object.entries(c.calculationInvariants || {})) {
        assert.equal(v, 0, k);
      }
      // clarification surface still works
      let s = initClarificationState(c);
      if (s.currentQuestion) {
        const r = applyClarificationAnswer(
          s,
          s.currentQuestion.questionId,
          "oui"
        );
        assert.equal(r.state.documentCase.suggestedDeclaredAmount, null);
      }
    }
    ok("boundaries");

    section("17 — 500+800+1200 sans formule somme → toujours pas 2500");
    {
      const { result } = calculateDerivedValue({
        fieldCode: "NOPE",
        facts: [
          ...make4BEFacts(500).map((f) => ({ ...f, fieldCode: "NOPE", factId: "a" })),
          ...make4BEFacts(800).map((f) => ({ ...f, fieldCode: "NOPE", factId: "b" })),
          ...make4BEFacts(1200).map((f) => ({ ...f, fieldCode: "NOPE", factId: "c" }))
        ],
        applicability: makeApplicable("NOPE"),
        extraFormulas: []
      });
      assert.equal(result.status, "unsupported");
      assert.notEqual(result.value, 2500);
    }
    ok("no-implicit-sum");

    assert.equal(fetchCalls, 0);
    console.log(
      `\n=== V4-V OK — ${passed} checks (fetch=${fetchCalls}) formula=${TAX_FORMULAS[0]?.formulaId} ===`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
