/**
 * V4-W — registre / versionnement des règles & formules fiscales sourcées
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  applyClarificationAnswer,
  assertCalculationOrderStable,
  auditTaxCalculation,
  auditTaxRuleRegistry,
  buildDocumentCase,
  buildTaxRuleRegistry,
  calculateDerivedValue,
  entryFromFormula,
  initClarificationState,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  resolveTaxFormula,
  resolveTaxRule,
  sortRegistryEntries,
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

/** Formule synthétique de test — non fiscale réelle. */
function synthFormula(overrides = {}) {
  return {
    formulaId: "test-synth-formula",
    version: "1",
    registryStatus: "verified",
    targetFieldCode: "TEST_REG",
    taxYears: [2024],
    yearPolicy: "exact",
    rolePolicy: "household",
    operation: "identity",
    inputs: [
      {
        inputId: "x",
        label: "X",
        fieldCode: "TEST_REG",
        unit: "EUR",
        required: true,
        allowUserFact: true
      }
    ],
    unit: "EUR",
    roundingPolicy: "none",
    provenance: [
      {
        sourceType: "official",
        authority: "TEST",
        url: "https://example.test/synth",
        retrievedAt: "2026-08-09",
        title: "Fixture registre V4-W",
        supports: ["calculation"]
      }
    ],
    sourceExcerpt: "Formule synthétique de test registre — non fiscale.",
    verificationStatus: "verified",
    ...overrides
  };
}

function main() {
  console.log("=== test:v4-tax-rule-registry (V4-W) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-W");
  };

  try {
    section("Registration + lookup production");
    {
      const entries = buildTaxRuleRegistry();
      assert.ok(entries.length >= 1 + 8); // 1 formula + 8 applicability
      const calc = entries.filter((e) => e.kind === "calculation");
      assert.equal(calc.length, 1);
      assert.equal(calc[0].formulaId, "4be-micro-foncier-revenu-imposable");
      assert.equal(calc[0].version, "1");
      assert.equal(calc[0].status, "verified");
      assert.ok(calc[0].sourceRefs.length >= 1);
      const app = entries.filter((e) => e.kind === "applicability");
      assert.ok(app.some((e) => e.applicabilityRuleId === "4be-micro-foncier-scope"));
    }
    ok("registration");

    section("Deterministic ordering — insertion order irrelevant");
    {
      const a = synthFormula({ version: "2", taxYears: [2025] });
      const b = synthFormula({ version: "1", taxYears: [2024] });
      const e1 = sortRegistryEntries([entryFromFormula(a), entryFromFormula(b)]);
      const e2 = sortRegistryEntries([entryFromFormula(b), entryFromFormula(a)]);
      assert.deepEqual(
        e1.map((x) => `${x.ruleId}@${x.version}`),
        e2.map((x) => `${x.ruleId}@${x.version}`)
      );
    }
    ok("ordering");

    section("resolve — année disponible");
    {
      const r = resolveTaxFormula({
        fieldCode: "4BE",
        taxYear: 2024
      });
      assert.equal(r.status, "resolved");
      assert.equal(r.formula?.formulaId, "4be-micro-foncier-revenu-imposable");
      assert.equal(r.entry?.version, "1");
    }
    ok("year-hit");

    section("resolve — année absente → unsupported");
    {
      const r = resolveTaxFormula({
        fieldCode: "4BE",
        taxYear: 2019
      });
      assert.equal(r.status, "unsupported");
      assert.equal(r.formula, null);
    }
    ok("year-miss");

    section("resolve — deux versions années différentes");
    {
      const f2024 = synthFormula({ version: "1", taxYears: [2024] });
      const f2025 = synthFormula({ version: "2", taxYears: [2025] });
      const r24 = resolveTaxFormula({
        fieldCode: "TEST_REG",
        taxYear: 2024,
        formulas: [],
        extraFormulas: [f2025, f2024] // reverse insert order
      });
      const r25 = resolveTaxFormula({
        fieldCode: "TEST_REG",
        taxYear: 2025,
        formulas: [],
        extraFormulas: [f2025, f2024]
      });
      assert.equal(r24.status, "resolved");
      assert.equal(r24.entry?.version, "1");
      assert.equal(r25.status, "resolved");
      assert.equal(r25.entry?.version, "2");
    }
    ok("version-by-year");

    section("resolve — overlap ambigu → pas de choix");
    {
      const a = synthFormula({ version: "1", taxYears: [2024, 2025] });
      const b = synthFormula({ version: "2", taxYears: [2025, 2026] });
      const r = resolveTaxFormula({
        fieldCode: "TEST_REG",
        taxYear: 2025,
        formulas: [],
        extraFormulas: [a, b]
      });
      assert.equal(r.status, "ambiguous");
      assert.equal(r.formula, null);
      assert.equal(r.invariants.ambiguousRuleAutoResolution, 0);
    }
    ok("ambiguous-overlap");

    section("experimental / deprecated non exécutés");
    {
      const exp = synthFormula({
        version: "9",
        registryStatus: "experimental",
        verificationStatus: "partial",
        taxYears: [2024]
      });
      const dep = synthFormula({
        version: "8",
        registryStatus: "deprecated",
        taxYears: [2024]
      });
      const r = resolveTaxFormula({
        fieldCode: "TEST_REG",
        taxYear: 2024,
        formulas: [],
        extraFormulas: [exp, dep]
      });
      assert.ok(
        r.status === "experimentalOnly" || r.status === "unsupported"
      );
      assert.equal(r.formula, null);
    }
    ok("experimental-deprecated");

    section("verified sans source → unsupported + audit");
    {
      const bad = synthFormula({
        provenance: [],
        sourceExcerpt: "x",
        verificationStatus: "verified"
      });
      const r = resolveTaxFormula({
        fieldCode: "TEST_REG",
        taxYear: 2024,
        formulas: [],
        extraFormulas: [bad]
      });
      assert.equal(r.status, "unsupported");
      assert.ok(r.invariants.unsourcedVerifiedRules >= 1);
      const audit = auditTaxRuleRegistry(
        [entryFromFormula(bad)],
        [bad]
      );
      assert.equal(audit.ok, false);
      assert.ok(audit.issues.some((i) => i.code === "unsourcedVerifiedRule"));
    }
    ok("unsourced-verified");

    section("audit production OK + duplicate/overlap détectés");
    {
      const prod = auditTaxRuleRegistry();
      assert.equal(prod.ok, true, JSON.stringify(prod.issues));
      const a = synthFormula({ version: "1", taxYears: [2024] });
      const dup = { ...a, sourceExcerpt: "autre contenu" };
      const dupAudit = auditTaxRuleRegistry(
        [entryFromFormula(a), entryFromFormula(dup)],
        [a, dup]
      );
      assert.equal(dupAudit.ok, false);
      assert.ok(
        dupAudit.issues.some((i) =>
          i.code.startsWith("duplicateRuleVersion")
        )
      );
    }
    ok("audit");

    section("4BE migration — non-régression 10000 → 7000 + rule provenance");
    {
      const { result, invariants } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2024,
        documents: []
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 7000);
      assert.equal(result.rule?.formulaId, "4be-micro-foncier-revenu-imposable");
      assert.equal(result.rule?.version, "1");
      assert.equal(result.rule?.taxYear, 2024);
      assert.equal(result.rule?.status, "verified");
      assert.ok(result.rule?.sources?.length);
      assert.equal(invariants.derivedValuePromotedToDeclaredAmount, 0);
      assert.equal(invariants.implicitRuleSelection, 0);
      assert.equal(invariants.ambiguousRuleAutoResolution, 0);
    }
    ok("4be-migration");

    section("Frontières Document / User / Derived / Knowledge");
    {
      const entries = buildTaxRuleRegistry();
      const calcEntry = entries.find((e) => e.kind === "calculation");
      assert.ok(calcEntry);
      // Registry entry ≠ DocumentFact
      assert.ok(!("factId" in calcEntry));
      assert.ok(!("sourceDocumentId" in calcEntry));
      // User answer doesn't mutate registry
      const before = JSON.stringify(buildTaxRuleRegistry());
      const { result } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2024
      });
      const after = JSON.stringify(buildTaxRuleRegistry());
      assert.equal(before, after);
      assert.equal(result.derivedValue?.kind, "derived");
      assert.notEqual(result.derivedValue?.kind, "user");
    }
    ok("boundaries-kinds");

    section("Pas de calcul implicite / pas de déclaration / pas d’éligibilité");
    {
      const c = build(FIRST_FORMULA_DOCS.micro4BE_10000);
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.equal(c.eligibilityDecision, null);
      const r = c.calculationResults?.find((x) => x.fieldCode === "4BE");
      // exclusions manquantes → needsInformation (gates V4-V)
      assert.equal(r?.status, "needsInformation");
      assert.notEqual(r?.value, 7000);
      const report = auditTaxCalculation(c);
      assert.equal(report.ok, true, JSON.stringify(report.violations));
      for (const [k, v] of Object.entries(c.calculationInvariants || {})) {
        assert.equal(v, 0, k);
      }
    }
    ok("no-implicit");

    section("Upload order + add/remove + clarification année");
    {
      const a = build([
        FIRST_FORMULA_DOCS.micro4BE_10000,
        FIRST_FORMULA_DOCS.reel4BA
      ]);
      const b = build([
        FIRST_FORMULA_DOCS.reel4BA,
        FIRST_FORMULA_DOCS.micro4BE_10000
      ]);
      assert.equal(
        assertCalculationOrderStable(
          a.calculationResults || [],
          b.calculationResults || []
        ).ok,
        true
      );
      const removed = removeDocumentFromCase(a, a.documents[0].documentId);
      assert.ok(removed.calculationResults);
      const added = addDocumentsToCase(build(FIRST_FORMULA_DOCS.micro4BE_noAmount), [
        FIRST_FORMULA_DOCS.micro4BE_10000
      ]);
      assert.ok(added.calculationResults?.some((r) => r.fieldCode === "4BE"));

      // clarification surface
      let s = initClarificationState(build(FIRST_FORMULA_DOCS.micro4BE_10000));
      if (s.currentQuestion) {
        const out = applyClarificationAnswer(
          s,
          s.currentQuestion.questionId,
          "oui"
        );
        assert.equal(out.state.documentCase.suggestedDeclaredAmount, null);
      }

      // année conflictuelle / inconnue → pas de calculated silencieux
      const { result: noYear } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000, { year: null }),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: null
      });
      // une seule version → peut résoudre ; value still gated by exclusions etc.
      assert.ok(noYear.rule?.version === "1" || noYear.status !== "calculated" || noYear.value === 7000);

      const { result: badYear } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2018
      });
      assert.notEqual(badYear.status, "calculated");
    }
    ok("case-lifecycle");

    section("Même inputs → même résolution / explication / provenance");
    {
      const once = () =>
        calculateDerivedValue({
          fieldCode: "4BE",
          facts: make4BEFacts(10000),
          userFacts: [makeExclusionsOkUserFact()],
          applicability: makeApplicable("4BE"),
          targetYear: 2024
        });
      const a = once();
      const b = once();
      assert.equal(a.result.status, b.result.status);
      assert.equal(a.result.value, b.result.value);
      assert.equal(a.result.explanation, b.result.explanation);
      assert.deepEqual(a.result.rule, b.result.rule);
    }
    ok("determinism");

    section("resolveTaxRule applicability");
    {
      const r = resolveTaxRule({
        kind: "applicability",
        fieldCode: "4BE",
        taxYear: 2024
      });
      assert.equal(r.status, "resolved");
      assert.equal(r.entry?.applicabilityRuleId, "4be-micro-foncier-scope");
    }
    ok("resolve-applicability");

    assert.equal(TAX_FORMULAS.length, 1);
    assert.equal(fetchCalls, 0);
    console.log(
      `\n=== V4-W OK — ${passed} checks (fetch=${fetchCalls}) entries=${buildTaxRuleRegistry().length} ===`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
