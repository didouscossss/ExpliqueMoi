/**
 * V4-Y — compréhension documentaire générique hors fiscalité (scénarios A–T)
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDocumentsToGenericSession,
  analyzeGenericDocument,
  applyGenericUserAnswer,
  assertGenericSafetyClean,
  buildDocumentCase,
  buildGenericDocumentSession,
  calculateDerivedValue,
  genericUnderstandingPreviewPayload,
  removeDocumentFromGenericSession,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetLocalExplanationIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  runV4PreviewAnalysis
} from "../lib/v4/index.ts";
import { makeApplicable } from "../lib/v4/__fixtures__/fiscal/calculationFixtures.mjs";
import {
  FIRST_FORMULA_DOCS,
  make4BEFacts,
  makeExclusionsOkUserFact
} from "../lib/v4/__fixtures__/fiscal/firstFormulaFixtures.mjs";
import {
  ISOLATED_AMOUNT,
  ISOLATED_DATE,
  RENEWAL_NOTICE_FULL,
  UNKNOWN_ADMIN
} from "../lib/v4/__fixtures__/generic/renewalNoticeFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERIC_DIR = join(HERE, "../lib/v4/generic");

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
  resetGenericFactIdsForTests();
  resetGenericExplanationIdsForTests();
  resetGenericClarificationIdsForTests();
}

const FORBIDDEN_OBLIGATION =
  /vous\s+devez|obligation|montant\s+[àa]\s+payer|montant\s+d[uû]|dette\b/i;

function main() {
  console.log("=== test:v4-generic-document (V4-Y) ===");
  const t0 = Date.now();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-Y");
  };

  try {
    section("A — document non fiscal complet");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      assert.equal(u.documentType, "renewalNotice");
      assert.ok(u.facts.length >= 5);
      assert.ok(u.importantFacts.length >= 3);
      const primary = u.explanations.find((e) => e.importance === "primary");
      assert.ok(primary);
      assert.match(primary.summary, /Exemple Assurances/);
      assert.match(primary.title, /Avis de renouvellement/i);
      ok("A-full-renewal");
    }

    section("B — montant isolé sans signification → pas d’invention");
    {
      reset();
      const u = analyzeGenericDocument(ISOLATED_AMOUNT, { resetIds: true });
      const amounts = u.facts.filter((f) => f.kind === "amount");
      assert.ok(amounts.length >= 1);
      for (const a of amounts) {
        assert.ok(a.roleAmbiguous || !a.structuralRole);
        assert.ok(!/à payer|a payer|dû|du\b/i.test(a.label));
      }
      const blob = u.explanations.map((e) => e.summary + e.details.join(" ")).join(" ");
      assert.ok(!FORBIDDEN_OBLIGATION.test(blob));
      assert.ok(/Montant trouvé/i.test(blob) || amounts[0].label.includes("trouvé"));
      ok("B-isolated-amount");
    }

    section("C — date isolée → pas de deadline inventée");
    {
      reset();
      const u = analyzeGenericDocument(ISOLATED_DATE, { resetIds: true });
      assert.equal(
        u.facts.filter((f) => f.kind === "deadline").length,
        0,
        "aucune deadline inventée"
      );
      const dates = u.facts.filter((f) => f.kind === "date");
      assert.ok(dates.length >= 1);
      assert.ok(dates.every((d) => d.roleAmbiguous || d.structuralRole == null));
      ok("C-isolated-date");
    }

    section("D — référence correctement conservée");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const ref = u.facts.find((f) => f.kind === "reference");
      assert.ok(ref);
      assert.equal(String(ref.normalizedValue || ref.rawValue), "AB-458921");
      ok("D-reference");
    }

    section("E — organisation correctement conservée");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const org = u.facts.find((f) => f.kind === "organization");
      assert.ok(org);
      assert.match(String(org.normalizedValue || org.rawValue), /Exemple Assurances/);
      ok("E-organization");
    }

    section("F — normalisation montant EUR");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const amount = u.facts.find(
        (f) => f.kind === "amount" && f.structuralRole === "indicatedAmount"
      );
      assert.ok(amount);
      assert.equal(amount.rawValue.includes("486,50") || /486/.test(amount.rawValue), true);
      assert.deepEqual(amount.normalizedValue, { amount: 486.5, currency: "EUR" });
      ok("F-amount-norm");
    }

    section("G — normalisation date française");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const docDate = u.facts.find((f) => f.structuralRole === "documentDate");
      const deadline = u.facts.find((f) => f.kind === "deadline");
      assert.ok(docDate);
      assert.equal(docDate.normalizedValue, "2026-03-12");
      assert.ok(deadline);
      assert.equal(deadline.normalizedValue, "2026-04-15");
      ok("G-date-norm");
    }

    section("H — evidence originale conservée");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const amount = u.facts.find((f) => f.kind === "amount" && !f.roleAmbiguous);
      assert.ok(amount?.evidence?.length);
      assert.ok(amount.evidence[0].text.length > 0);
      assert.ok(/486/.test(amount.rawValue));
      ok("H-evidence");
    }

    section("I — unknown documentType prudent");
    {
      reset();
      const u = analyzeGenericDocument(UNKNOWN_ADMIN, { resetIds: true });
      assert.equal(u.documentType, "unknown");
      const onlyAmount = analyzeGenericDocument(ISOLATED_AMOUNT, {
        resetIds: true
      });
      assert.equal(onlyAmount.documentType, "unknown");
      ok("I-unknown-type");
    }

    section("J — clarification produit UserFact distinct");
    {
      reset();
      let u = analyzeGenericDocument(ISOLATED_DATE, { resetIds: true });
      assert.ok(u.clarifications.length >= 1);
      const q = u.clarifications[0];
      const before = JSON.stringify(u.facts);
      u = applyGenericUserAnswer(u, q.questionId, "Date d'anniversaire");
      assert.equal(JSON.stringify(u.facts), before, "document facts inchangés");
      assert.equal(u.userFacts.length, 1);
      assert.equal(u.userFacts[0].kind, "user");
      assert.equal(u.userFacts[0].source, "clarification");
      assert.notEqual(u.userFacts[0].factId, q.relatedFactId);
      ok("J-clarification-userfact");
    }

    section("K — add/remove document → recalcul");
    {
      reset();
      let session = buildGenericDocumentSession([RENEWAL_NOTICE_FULL], {
        resetIds: true
      });
      assert.equal(session.documents.length, 1);
      const n1 = session.facts.length;
      session = addDocumentsToGenericSession(session, [ISOLATED_AMOUNT]);
      assert.equal(session.documents.length, 2);
      assert.ok(session.facts.length > n1);
      const idRemove = session.documents[1].id;
      session = removeDocumentFromGenericSession(session, idRemove);
      assert.equal(session.documents.length, 1);
      assert.equal(session.documents[0].id, RENEWAL_NOTICE_FULL.id);
      ok("K-add-remove");
    }

    section("L — ordre d’upload stable");
    {
      reset();
      const a = buildGenericDocumentSession(
        [RENEWAL_NOTICE_FULL, ISOLATED_AMOUNT],
        { resetIds: true }
      );
      reset();
      const b = buildGenericDocumentSession(
        [ISOLATED_AMOUNT, RENEWAL_NOTICE_FULL],
        { resetIds: true }
      );
      assert.equal(a.documents[0].id, RENEWAL_NOTICE_FULL.id);
      assert.equal(b.documents[0].id, ISOLATED_AMOUNT.id);
      const refsA = a.facts
        .filter((f) => f.kind === "reference")
        .map((f) => f.normalizedValue)
        .sort();
      const refsB = b.facts
        .filter((f) => f.kind === "reference")
        .map((f) => f.normalizedValue)
        .sort();
      assert.deepEqual(refsA, refsB);
      ok("L-upload-order");
    }

    section("M — aucune règle fiscale déclenchée");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      assert.equal(u.taxRulesTriggered, 0);
      ok("M-no-tax-rules");
    }

    section("N — aucune calculation fiscale");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      assert.equal(u.taxCalculations, 0);
      assert.ok(u.explanations.every((e) => !e.calculation));
      ok("N-no-tax-calc");
    }

    section("O — aucune obligation inventée");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const blob = JSON.stringify(u.explanations);
      assert.ok(!FORBIDDEN_OBLIGATION.test(blob));
      ok("O-no-obligation");
    }

    section("P — aucun montant « à payer » inventé");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const blob = [
        ...u.facts.map((f) => f.label),
        ...u.explanations.flatMap((e) => [e.summary, ...e.details])
      ].join(" ");
      assert.ok(!/montant\s+[àa]\s+payer/i.test(blob));
      ok("P-no-amount-due");
    }

    section("Q — aucune deadline inventée");
    {
      reset();
      const u = analyzeGenericDocument(ISOLATED_DATE, { resetIds: true });
      assert.equal(u.facts.filter((f) => f.kind === "deadline").length, 0);
      // Sur le doc complet, deadline uniquement via libellé explicite
      const full = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const deadlines = full.facts.filter((f) => f.kind === "deadline");
      assert.ok(deadlines.every((d) => d.structuralRole === "deadline"));
      assert.ok(deadlines.every((d) => /date\s+limite/i.test(d.evidence[0]?.text || d.label)));
      ok("Q-no-invented-deadline");
    }

    section("R — LocalExplanation correctement produit");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const primary = u.explanations.find((e) => e.importance === "primary");
      assert.ok(primary);
      assert.equal(primary.domain, "administrative");
      assert.ok(primary.details.some((d) => /486/.test(d)));
      assert.ok(primary.details.some((d) => /AB-458921/.test(d)));
      assert.ok(primary.details.some((d) => /15 avril 2026|15\/04\/2026/i.test(d)));
      ok("R-local-explanation");
    }

    section("S — provenance accessible");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      const primary = u.explanations.find((e) => e.importance === "primary");
      assert.ok(primary.sourceFacts.length >= 3);
      assert.ok(primary.why.length >= 1);
      assert.ok(u.preview.pourquoi.length >= 1);
      const payload = genericUnderstandingPreviewPayload(u);
      assert.ok(Array.isArray(payload.pourquoi));
      ok("S-provenance");
    }

    section("T — aucune dépendance réseau + safety=0");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      assert.equal(u.fetchCount, 0);
      assert.equal(u.llmCount, 0);
      assert.equal(fetchCalls, 0);
      const clean = assertGenericSafetyClean(u.safety);
      assert.equal(clean.ok, true, clean.violations.join(","));
      ok("T-network-safety");
    }

    section("4BE non-régression");
    {
      reset();
      const { result } = calculateDerivedValue({
        fieldCode: "4BE",
        facts: make4BEFacts(10000),
        userFacts: [makeExclusionsOkUserFact()],
        applicability: makeApplicable("4BE"),
        targetYear: 2024
      });
      assert.equal(result.status, "calculated");
      assert.equal(result.value, 7000);

      const c = buildDocumentCase([FIRST_FORMULA_DOCS.micro4BE_10000], {
        resetIds: true
      });
      // DocumentCase fiscal inchangé dans son principe
      assert.ok(c);
      ok("4BE-non-regression");
    }

    section("Preview generic_understanding");
    {
      reset();
      const run = runV4PreviewAnalysis({
        pastedText: RENEWAL_NOTICE_FULL.text,
        resetIds: true
      });
      assert.equal(run.ok, true);
      const g = run.analysis.generic_understanding;
      assert.ok(g);
      assert.equal(g.document_type, "renewalNotice");
      assert.ok(Array.isArray(g.a_retenir));
      assert.ok(g.a_retenir.some((x) => /486/.test(x)));
      assert.match(String(g.emis_par || ""), /Exemple Assurances/);
      assert.match(String(g.ce_document || ""), /renouvellement/i);
      ok("preview-generic");
    }

    section("Architecture — pas d’import fr/tax dans generic/");
    {
      for (const name of readdirSync(GENERIC_DIR)) {
        if (!name.endsWith(".ts")) continue;
        const src = readFileSync(join(GENERIC_DIR, name), "utf8");
        assert.ok(
          !/from\s+["'][^"']*fr\/tax[^"']*["']/.test(src),
          `${name} ne doit pas importer fr/tax`
        );
      }
      ok("arch-no-tax-import");
    }

    const elapsed = Date.now() - t0;
    console.log(`\n✅ V4-Y OK — ${passed} assertions (${elapsed} ms)`);
    console.log(`fetch=${fetchCalls} LLM=0`);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
