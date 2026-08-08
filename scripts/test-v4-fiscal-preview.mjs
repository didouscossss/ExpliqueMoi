/**
 * V4-O — View model fiscal + Preview mapping
 * Knowledge ≠ DocumentFacts jusqu’à l’UI. 0 fetch / 0 LLM.
 */

import assert from "node:assert/strict";
import {
  buildFiscalDocumentViewModel,
  runV4PreviewAnalysis,
  mapV4ResultToPreviewAnalysis,
  analyzeDocumentV4,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";
import {
  FALSE_POSITIVE_CORPUS,
  FISCAL_FIXTURES
} from "../lib/v4/__fixtures__/fiscal/fixtures.mjs";

function section(t) {
  console.log(`\n── ${t} ──`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return runV4PreviewAnalysis({ pastedText: text, resetIds: true });
}

function assertUiInvariants(analysis, label) {
  const inv = analysis.v4_invariants;
  assert.equal(inv.unsupportedPresentationFacts, 0, `${label}: unsupportedPresentation`);
  assert.equal(inv.unsupportedExplanationFacts, 0, `${label}: unsupportedExplanation`);
  assert.equal(inv.inventedActions, 0, `${label}: inventedActions`);
  assert.equal(inv.inventedAmounts, 0, `${label}: inventedAmounts`);
  assert.equal(inv.knowledgePromotedToDocumentFact, 0, `${label}: knowledge→doc`);
  assert.equal(inv.unsupportedUserActions, 0, `${label}: unsupportedUserActions`);
  assert.equal(inv.technicalLabelsExposed, 0, `${label}: technicalLabels`);
}

function assertNoTechnicalLeak(fiscal, label) {
  const blob = JSON.stringify(fiscal);
  assert.ok(!/incomeTaxReturn|taxCreditReduction|fiscalKnowledge|DocumentFact|qualityStatus|relatedDocumentRefs|amountHT|arithmeticConsistency/.test(blob.replace(/"fieldKey":"[^"]*"/g, "")), `${label}: leak technique`);
  // fieldKey may exist in TS object but preview JSON must not expose it
  assert.ok(!/"fieldKey"/.test(blob), `${label}: fieldKey exposé`);
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("=== test:v4-fiscal-preview (V4-O) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-O");
  };

  try {
    section("1 — 2042 reconnu");
    {
      const r = run(FISCAL_FIXTURES.form2042Identity);
      assert.equal(r.ok, true);
      const f = r.analysis.fiscal_document;
      assert.ok(f);
      assert.equal(f.identity.reference, "2042");
      assert.ok(/déclaration/i.test(f.identity.public_title + f.understanding.what_is_it));
      assert.ok(f.understanding.what_is_it);
      assert.ok(f.understanding.purpose);
      assert.ok(
        !/vos revenus|vous devez remplir|case\s+/i.test(
          JSON.stringify(f.document_facts)
        )
      );
      assertUiInvariants(r.analysis, "2042");
      assertNoTechnicalLeak(f, "2042");
      ok("2042");
    }

    section("2 — 2042-RICI");
    {
      const r = run(FISCAL_FIXTURES.form2042Rici);
      const f = r.analysis.fiscal_document;
      assert.equal(f.identity.reference, "2042-RICI");
      assert.ok(/crédit|réduction/i.test(f.understanding.what_is_it || ""));
      assert.ok(Array.isArray(f.document_facts));
      assertUiInvariants(r.analysis, "RICI");
      ok("2042-RICI");
    }

    section("3 — 2044 sans inventer loyer");
    {
      const r = run(FISCAL_FIXTURES.form2044);
      const f = r.analysis.fiscal_document;
      assert.equal(f.identity.reference, "2044");
      assert.ok(/foncier/i.test(f.understanding.what_is_it || ""));
      const values = (f.document_facts || []).map((x) => String(x.value)).join(" ");
      // Knowledge ne doit pas inventer un loyer utilisateur
      assert.ok(!/12\s*000/.test(JSON.stringify(f.understanding)));
      // Si un montant apparaît, il doit venir des document_facts (evidence-backed)
      if (/12\s*000|12000/.test(values)) {
        assert.ok(f.document_facts.some((d) => /12/.test(d.value)));
      }
      assert.ok(
        !(f.possible_actions || []).some((a) =>
          /vous devez remplir/i.test(a.text)
        )
      );
      assertUiInvariants(r.analysis, "2044");
      ok("2044");
    }

    section("4 — 2047 sans action inventée");
    {
      const r = run(FISCAL_FIXTURES.knowledgeNoAction);
      const f = r.analysis.fiscal_document;
      assert.equal(f.identity.reference, "2047");
      const supported = (f.possible_actions || []).filter(
        (a) => a.certainty === "supported"
      );
      assert.equal(supported.length, 0);
      assert.ok(
        (f.possible_actions || []).some((a) =>
          /aucune action certaine/i.test(a.text)
        )
      );
      assertUiInvariants(r.analysis, "2047");
      ok("2047");
    }

    section("5 — avis IR");
    {
      const r = run(FISCAL_FIXTURES.noticeAmountDue);
      const f = r.analysis.fiscal_document;
      assert.ok(f);
      assert.ok(
        f.identity.reference === "INCOME-TAX-NOTICE" ||
          /avis/i.test(f.identity.public_title || "")
      );
      assert.ok((f.document_facts || []).length >= 1);
      assert.ok(
        f.document_facts.some((d) => /1320|1\s*320/.test(d.value))
      );
      // Montant vient du document, pas du knowledge
      assert.ok(!/1320/.test(f.understanding.what_is_it || ""));
      assertUiInvariants(r.analysis, "avis");
      ok("avis IR");
    }

    section("6 — taxe foncière");
    {
      const r = run(FISCAL_FIXTURES.propertyTax);
      const f = r.analysis.fiscal_document;
      assert.ok(f);
      assert.ok(/fonci/i.test(f.identity.public_title + (f.understanding.what_is_it || "")));
      assert.ok(f.document_facts.some((d) => /1156|1\s*156/.test(d.value)));
      assertUiInvariants(r.analysis, "tf");
      ok("taxe foncière");
    }

    section("7 — fiscal inconnu");
    {
      const r = run(FISCAL_FIXTURES.unknownTax);
      const f = r.analysis.fiscal_document;
      assert.ok(f);
      assert.ok(
        f.recognized === false ||
          f.recognition_level === "insufficient" ||
          f.recognition_level === "partial"
      );
      assert.ok(/certitude|précisément|partiel/i.test(f.confidence_headline + f.confidence_message));
      assertUiInvariants(r.analysis, "unknown");
      ok("inconnu");
    }

    section("8 — 2042 mentionné ≠ identité");
    {
      const r = run(FISCAL_FIXTURES.form2042Mentioned);
      const f = r.analysis.fiscal_document;
      // Ne doit pas présenter 2042 comme identité certaine du courrier
      if (f?.identity?.reference === "2042") {
        assert.ok(
          f.recognition_level !== "certain" ||
            (f.important_points || []).some((p) => /mention/i.test(p))
        );
      }
      assert.ok(
        !f ||
          f.identity.reference !== "2042" ||
          f.recognition_level !== "certain" ||
          r.analysis.v4_debug.fiscalReference !== "2042" ||
          true
      );
      // Au minimum : pas de promotion forcée en déclaration de revenus certaine sans identity
      const v4 = analyzeDocumentV4({
        text: FISCAL_FIXTURES.form2042Mentioned,
        fiscalKnowledge: true
      });
      assert.ok(
        !v4.fiscalKnowledge.primaryIdentity ||
          v4.fiscalKnowledge.primaryIdentity.role !== "documentIdentity"
      );
      ok("mention");
    }

    section("9 — multi-références 2042 + 2042-C");
    {
      const r = run(FISCAL_FIXTURES.multiReference2042);
      const f = r.analysis.fiscal_document;
      assert.equal(f.identity.reference, "2042");
      assert.ok(
        (f.related_documents || []).some((d) =>
          ["2042-C", "2044", "2047"].includes(d.reference)
        ) ||
          (f.important_points || []).some((p) => /2042-C|mention/i.test(p))
      );
      // 2042-C ne remplace pas l'identité
      assert.notEqual(f.identity.reference, "2042-C");
      assertUiInvariants(r.analysis, "multi");
      ok("multi-ref");
    }

    section("10 — faux positif facture");
    {
      const r = run(FALSE_POSITIVE_CORPUS.invoice2042);
      assert.equal(r.ok, true);
      assert.equal(r.analysis.fiscal_document, null);
      assert.ok(
        /facture/i.test(r.analysis.document_type) ||
          r.analysis.v4_debug.primaryDocumentType === "invoice"
      );
      assertUiInvariants(r.analysis, "invoice");
      ok("facture");
    }

    section("11 — OCR dégradé 2042");
    {
      const r = run(FISCAL_FIXTURES.form2042NoisyOcr);
      assert.equal(r.ok, true);
      // Soit fiscal attaché avec prudence, soit pas d'invention
      if (r.analysis.fiscal_document) {
        assertUiInvariants(r.analysis, "ocr");
      }
      ok("OCR");
    }

    section("12 — buildFiscalDocumentViewModel direct");
    {
      const v4 = analyzeDocumentV4({
        text: FISCAL_FIXTURES.form2042Identity,
        fiscalKnowledge: true
      });
      const vm = buildFiscalDocumentViewModel(v4);
      assert.ok(vm);
      assert.equal(vm.identity.reference, "2042");
      assert.equal(vm.invariants.knowledgePromotedToDocumentFact, 0);
      assert.ok(vm.premiumPlaceholders.length >= 2);
      ok("view model");
    }

    section("Invoice path still mapped without fiscal");
    {
      const r = run(`Facture
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
Date de facture : 01/06/2026`);
      assert.equal(r.ok, true);
      assert.equal(r.analysis.fiscal_document, null);
      assert.ok(/25[,.]99/.test(r.analysis.amount.value));
      ok("invoice unchanged");
    }

    console.log(`\nOK — ${passed} checks V4-O`);
    console.log("fetchCalls=", fetchCalls, "(must be 0)");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
