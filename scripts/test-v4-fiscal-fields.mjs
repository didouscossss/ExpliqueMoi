/**
 * V4-P — corpus cases fiscales + faux positifs
 */

import assert from "node:assert/strict";
import {
  analyzeDocumentV4,
  auditTaxFieldRegistry,
  checkFiscalKnowledgeSafety,
  detectFrenchTaxFields,
  loadFrenchTaxFieldRegistry,
  lookupTaxField,
  resetFrenchTaxFieldRegistryCacheForTests,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  runV4PreviewAnalysis,
  PRIORITY_TAX_FIELDS
} from "../lib/v4/index.ts";
import {
  FIELD_FALSE_POSITIVE_CORPUS,
  FIELD_FIXTURES
} from "../lib/v4/__fixtures__/fiscal/fieldFixtures.mjs";

function section(t) {
  console.log(`\n── ${t} ──`);
}

function analyze(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return analyzeDocumentV4({ text, fiscalKnowledge: true });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("=== test:v4-fiscal-fields (V4-P) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-P");
  };

  try {
    resetFrenchTaxFieldRegistryCacheForTests();
    const registry = loadFrenchTaxFieldRegistry();

    section("Registry quality");
    {
      assert.ok(PRIORITY_TAX_FIELDS.length >= 20);
      const report = auditTaxFieldRegistry(registry);
      assert.ok(report.ok, JSON.stringify(report));
      assert.ok(report.verified >= 15);
      assert.equal(report.missingProvenance.length, 0);
      ok("registry");
    }

    section("A — 1AJ reconnue + valeur");
    {
      const r = analyze(FIELD_FIXTURES.case1AJWithValue);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      assert.ok(f, "1AJ détectée");
      assert.equal(f.presence, "presentWithValue");
      assert.ok(f.detectedValue);
      assert.ok(/32450|32\s*450/.test(String(f.detectedValue).replace(/\s/g, "")));
      const expl = (r.fiscalKnowledge.fieldExplanations || []).find(
        (x) => x.fieldCode === "1AJ"
      );
      assert.ok(expl?.plainLanguageWhat?.toLowerCase().includes("salaire"));
      assert.ok(expl.documentValue);
      assert.equal(expl.invariants.taxFieldKnowledgePromotedToFact, 0);
      assert.ok(checkFiscalKnowledgeSafety(r.fiscalKnowledge).ok);
      ok("1AJ+valeur");
    }

    section("B — case inconnue");
    {
      const r = analyze(FIELD_FIXTURES.unknownFieldCode);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "9ZZ"
      );
      // Soit non détectée, soit sans définition registry
      if (f) {
        assert.ok(!f.registryId || f.confidence < 0.6);
      }
      ok("inconnue");
    }

    section("C — lookup année");
    {
      const exact = lookupTaxField({
        documentRef: "2042",
        fieldCode: "1AJ",
        year: 2025
      });
      assert.ok(exact.entry);
      assert.ok(["exact", "yearAgnostic"].includes(exact.matchKind));
      const mismatch = lookupTaxField({
        documentRef: "2042",
        fieldCode: "1AJ",
        year: 2010
      });
      assert.ok(
        mismatch.matchKind === "partial" ||
          mismatch.entry?.qualityStatus !== "verified" ||
          mismatch.reason.includes("year")
      );
      ok("année");
    }

    section("D — 1BJ valeur");
    {
      const r = analyze(FIELD_FIXTURES.case1BJValue);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1BJ"
      );
      assert.ok(f?.presence === "presentWithValue");
      assert.ok(f.detectedNumericValue != null);
      ok("1BJ");
    }

    section("E — valeurs ambiguës");
    {
      const r = analyze(FIELD_FIXTURES.ambiguousValues);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      assert.ok(f);
      assert.ok(
        f.presence === "ambiguous" ||
          f.presence === "valueUnknown" ||
          f.detectedValue == null
      );
      if (f.presence === "ambiguous") {
        assert.equal(f.detectedValue, null);
      }
      ok("ambigu");
    }

    section("F — case vide ≠ 0");
    {
      const r = analyze(FIELD_FIXTURES.emptyField);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      assert.ok(f);
      assert.ok(
        f.presence === "presentEmpty" ||
          f.presence === "valueUnknown" ||
          f.detectedValue == null
      );
      assert.notEqual(f.detectedNumericValue, 0);
      assert.equal(
        r.fiscalKnowledge.invariants.emptyFieldConvertedToZero || 0,
        0
      );
      ok("vide");
    }

    section("G — checkbox 8UU");
    {
      const r = analyze(FIELD_FIXTURES.checkbox8UU);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "8UU"
      );
      assert.ok(f);
      assert.ok(f.checkboxState === "checked" || f.detectedValue === "checked");
      ok("checkbox");
    }

    section("H — OCR dégradé");
    {
      const r = analyze(FIELD_FIXTURES.ocr1AJ);
      // Ne pas inventer une valeur certaine sur OCR douteux
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      if (f?.presence === "presentWithValue") {
        assert.ok(f.confidence < 0.95);
      }
      ok("OCR");
    }

    section("I/O — facture faux positif");
    {
      const r = analyze(FIELD_FIXTURES.invoiceLooksLike1AJ);
      const fields = r.fiscalKnowledge?.detectedFields || [];
      const strong = fields.filter(
        (f) => f.normalizedCode === "1AJ" && f.confidence >= 0.55
      );
      assert.equal(strong.length, 0);
      ok("facture");
    }

    section("J — mention explicative");
    {
      const r = analyze(FIELD_FIXTURES.explanatoryMention);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      if (f) {
        assert.ok(
          f.presence === "notDetected" ||
            f.detectedValue == null ||
            f.confidence < 0.55
        );
      }
      ok("explicatif");
    }

    section("K — multi cases ligne");
    {
      const r = analyze(FIELD_FIXTURES.multiFieldsLine);
      const codes = new Set(
        (r.fiscalKnowledge.detectedFields || []).map((f) => f.normalizedCode)
      );
      assert.ok(codes.has("1AJ"));
      assert.ok(codes.has("1BJ"));
      ok("multi-ligne");
    }

    section("L — multi pages");
    {
      const text = FIELD_FIXTURES.multiPageFields
        .map((p) => p.text)
        .join("\n");
      const r = analyze(text);
      const codes = new Set(
        (r.fiscalKnowledge.detectedFields || []).map((f) => f.normalizedCode)
      );
      assert.ok(codes.has("1AJ"));
      assert.ok(codes.has("4BA"));
      ok("multi-page");
    }

    section("M — multi déclarants");
    {
      const r = analyze(FIELD_FIXTURES.multiDeclarants);
      const expls = r.fiscalKnowledge.fieldExplanations || [];
      const a = expls.find((e) => e.fieldCode === "1AJ");
      const b = expls.find((e) => e.fieldCode === "1BJ");
      assert.ok(a && b);
      assert.ok(/déclarant 1/i.test(a.declarantRoleLabel || a.plainLanguageWhat || ""));
      assert.ok(/déclarant 2/i.test(b.declarantRoleLabel || b.plainLanguageWhat || ""));
      ok("multi-déclarants");
    }

    section("N — formulaire faible");
    {
      const r = analyze(FIELD_FIXTURES.unknownFormField);
      const f = (r.fiscalKnowledge.detectedFields || []).find(
        (x) => x.normalizedCode === "1AJ"
      );
      if (f) assert.ok(f.confidence < 0.85);
      ok("formulaire faible");
    }

    section("4BA / 7DB / 1AS");
    {
      for (const [code, fixture] of [
        ["4BA", FIELD_FIXTURES.case4BA],
        ["7DB", FIELD_FIXTURES.case7DB],
        ["1AS", FIELD_FIXTURES.case1AS]
      ]) {
        const r = analyze(fixture);
        const f = (r.fiscalKnowledge.detectedFields || []).find(
          (x) => x.normalizedCode === code
        );
        assert.ok(f, code);
        assert.ok(f.registryId, code + " registry");
      }
      ok("autres cases");
    }

    section("False positive corpus");
    {
      for (const [name, text] of Object.entries(FIELD_FALSE_POSITIVE_CORPUS)) {
        const r = analyze(text);
        const strong = (r.fiscalKnowledge?.detectedFields || []).filter(
          (f) => f.confidence >= 0.55 && f.registryId
        );
        assert.equal(strong.length, 0, `FP ${name}`);
      }
      ok("FP corpus");
    }

    section("Preview view-model fields");
    {
      const r = runV4PreviewAnalysis({
        pastedText: FIELD_FIXTURES.case1AJWithValue,
        resetIds: true
      });
      assert.equal(r.ok, true);
      const fields = r.analysis.fiscal_document?.tax_fields || [];
      assert.ok(fields.some((f) => f.field_code === "1AJ"));
      const one = fields.find((f) => f.field_code === "1AJ");
      assert.ok(one.explanation);
      assert.ok(one.document_value);
      assert.ok(!/vous devez|inscrire/i.test(one.explanation));
      assert.equal(
        r.analysis.v4_invariants.taxFieldKnowledgePromotedToFact,
        0
      );
      ok("preview");
    }

    section("Knowledge ≠ value");
    {
      const r = analyze(FIELD_FIXTURES.emptyField);
      const expl = (r.fiscalKnowledge.fieldExplanations || []).find(
        (x) => x.fieldCode === "1AJ"
      );
      assert.ok(expl?.plainLanguageWhat);
      assert.equal(expl.documentValue, null);
      ok("séparation");
    }

    console.log(`\nOK — ${passed} checks V4-P`);
    console.log("fetchCalls=", fetchCalls);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
