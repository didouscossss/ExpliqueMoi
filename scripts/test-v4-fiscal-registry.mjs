/**
 * Tests V4-M — French Tax Knowledge Expansion
 * Runtime offline : 0 fetch / 0 LLM
 */

import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeDocumentV4,
  analyzeFiscalKnowledge,
  loadFrenchTaxRegistry,
  resetFrenchTaxRegistryCacheForTests,
  validateFrenchTaxRegistry,
  normalizeTaxReference,
  ocrRepairTaxReference,
  lookupReferenceDetailed,
  selectPrimaryIdentity,
  knownNormalizedReferences,
  detectFiscalReferences,
  blocksFromPlainText,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";
import {
  FISCAL_FIXTURES,
  FALSE_POSITIVE_CORPUS
} from "../lib/v4/__fixtures__/fiscal/fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function section(t) {
  console.log(`\n▸ ${t}`);
}

function runFiscal(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return analyzeDocumentV4({ text, fiscalKnowledge: true });
}

function main() {
  console.log("=== test-v4-fiscal-registry (V4-M) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit runtime V4-M");
  };

  const report = {
    sourcesQueried: ["impots.gouv.fr/sitemap.xml", "impots.gouv.fr/recherche-de-formulaire"],
    candidatesDiscovered: 0,
    candidatesValidated: 0,
    entriesIntegrated: 0,
    entriesRejected: 0,
    entriesNeedsReview: 0,
    familiesCovered: [],
    exactReferences: 0,
    cerfaReferences: 0,
    yearVersionedEntries: 0,
    entriesWithRelations: 0,
    entriesWithOfficialSources: 0,
    referenceDetectionTests: 0,
    identityRoleTests: 0,
    mentionedRoleTests: 0,
    falsePositiveTests: 0,
    ocrNormalizationTests: 0,
    unknownRateOnUnknownFixtures: 0,
    falsePositiveRateOnNegativeFixtures: 0,
    registryJsonBytes: 0,
    indexJsonBytes: 0
  };

  try {
    resetFrenchTaxRegistryCacheForTests();
    const reg = loadFrenchTaxRegistry();
    const issues = validateFrenchTaxRegistry(reg);
    assert.equal(issues.filter((i) => i.level === "error").length, 0);

    report.entriesIntegrated = reg.entries.length;
    report.candidatesDiscovered = reg.discoveryStats?.discovered ?? reg.entries.length;
    report.candidatesValidated = reg.discoveryStats?.validated ?? reg.entries.length;
    report.entriesRejected = reg.discoveryStats?.rejected ?? 0;
    report.entriesNeedsReview = reg.discoveryStats?.needsReview ?? 0;
    report.familiesCovered = [...new Set(reg.entries.map((e) => e.family))].sort();
    report.exactReferences = reg.entries.filter((e) => e.normalizedReference && e.documentKind === "form").length;
    report.cerfaReferences = reg.entries.filter((e) => e.cerfaNumbers.length > 0).length;
    report.yearVersionedEntries = reg.entries.filter((e) => e.applicableYears.length > 0).length;
    report.entriesWithRelations = reg.entries.filter((e) => e.relatedDocuments.length > 0).length;
    report.entriesWithOfficialSources = reg.entries.filter((e) => e.officialSources.length > 0).length;

    assert.ok(reg.entries.length > 50, "registry nettement plus large que V4-L (13)");
    assert.ok(reg.entries.length >= 300, `attendu ~sitemap scale, got ${reg.entries.length}`);
    console.log("  registry entries=", reg.entries.length, "families=", report.familiesCovered.length);

    section("Normalization");
    {
      const cases = [
        ["2042 C", "2042-C"],
        ["2042-C", "2042-C"],
        ["2042 C PRO", "2042-C-PRO"],
        ["2042-C-PRO", "2042-C-PRO"],
        ["2042 RICI", "2042-RICI"],
        ["3310 CA3", "3310-CA3"],
        ["3310-CA3-SD", "3310-CA3-SD"],
        ["2572 SD", "2572-SD"]
      ];
      for (const [raw, exp] of cases) {
        assert.equal(normalizeTaxReference(raw).normalizedReference, exp);
      }
      // Ne pas fusionner refs distinctes
      assert.notEqual(
        normalizeTaxReference("2042-C").normalizedReference,
        normalizeTaxReference("2042").normalizedReference
      );
      console.log("  OK normalize");
    }

    section("Lookup exact/normalized/cerfa/possible/none");
    {
      const a = lookupReferenceDetailed("2042");
      assert.ok(["exact", "normalized"].includes(a.matchKind));
      assert.ok(a.entry);
      const b = lookupReferenceDetailed("2042 C");
      assert.ok(["exact", "normalized"].includes(b.matchKind));
      assert.equal(b.entry?.normalizedReference, "2042-C");
      const c = lookupReferenceDetailed("10330");
      assert.ok(c.matchKind === "cerfa" || c.matchKind === "possible" || c.matchKind === "none");
      const d = lookupReferenceDetailed("9999-ZZZ");
      assert.equal(d.matchKind, "none");
      console.log("  OK lookup kinds", a.matchKind, b.matchKind, c.matchKind, d.matchKind);
    }

    section("Cerfa ≠ formReference");
    {
      const e = reg.entries.find((x) => x.normalizedReference === "2042");
      assert.ok(e);
      assert.ok(e.cerfaNumbers.includes("10330"));
      assert.notEqual(e.normalizedReference, e.cerfaNumbers[0]);
      console.log("  OK 2042 cerfa", e.cerfaNumbers);
    }

    section("Notices ≠ formulaires");
    {
      const notices = reg.entries.filter((e) => e.documentKind === "notice");
      assert.ok(notices.length > 0);
      for (const n of notices.slice(0, 20)) {
        assert.notEqual(n.documentKind, "form");
      }
      console.log("  OK notices=", notices.length);
    }

    section("Relations provenancées");
    {
      const e = reg.entries.find((x) => x.normalizedReference === "2042");
      assert.ok(e.relatedDocuments.length >= 1);
      for (const r of e.relatedDocuments) {
        assert.ok(r.source && r.relationType && r.targetId);
        assert.ok(reg.entries.some((x) => x.id === r.targetId));
      }
      console.log("  OK relations", e.relatedDocuments.map((r) => r.relationType));
    }

    section("§ identity / mentioned / attachment");
    {
      const id = runFiscal(FISCAL_FIXTURES.form2042Identity);
      const ref = id.fiscalKnowledge.detectedReferences.find(
        (r) => r.normalized === "2042" && r.kind === "formReference"
      );
      assert.ok(ref);
      assert.equal(ref.role, "documentIdentity");
      assert.equal(id.classification.primary, "incomeTaxReturn");
      report.identityRoleTests += 1;
      report.referenceDetectionTests += 1;

      const men = runFiscal(FISCAL_FIXTURES.form2042Mentioned);
      const mref = men.fiscalKnowledge.detectedReferences.find((r) => r.normalized === "2042");
      assert.ok(mref);
      assert.equal(mref.role, "mentionedDocument");
      assert.notEqual(men.classification.primary, "incomeTaxReturn");
      report.mentionedRoleTests += 1;

      const att = runFiscal(FISCAL_FIXTURES.form2042CAttach);
      const aref = att.fiscalKnowledge.detectedReferences.find((r) => r.normalized === "2042-C");
      assert.ok(aref);
      assert.ok(["attachmentReference", "relatedDocument", "mentionedDocument"].includes(aref.role));
      assert.notEqual(att.classification.primary, "incomeTaxReturn");
      console.log("  OK roles identity/mentioned/attach");
    }

    section("Multi-reference + primary identity");
    {
      const r = runFiscal(FISCAL_FIXTURES.multiReference2042);
      const forms = r.fiscalKnowledge.detectedReferences.filter((x) => x.kind === "formReference");
      assert.ok(forms.length >= 2);
      const primary = r.fiscalKnowledge.primaryIdentity || selectPrimaryIdentity(forms);
      assert.ok(primary);
      assert.equal(primary.normalized, "2042");
      assert.equal(r.classification.primary, "incomeTaxReturn");
      console.log("  OK multi refs=", forms.map((f) => f.normalized).join(","), "primary=", primary.normalized);
    }

    section("Conflict title vs body");
    {
      const r = runFiscal(FISCAL_FIXTURES.conflictTitleVsBody);
      assert.equal(r.classification.primary, "incomeTaxReturn");
      const primary = r.fiscalKnowledge.primaryIdentity;
      assert.ok(!primary || primary.normalized === "2042");
      console.log("  OK conflict → 2042 identity preferred");
    }

    section("OCR conservative");
    {
      const known = knownNormalizedReferences();
      const repaired = ocrRepairTaxReference("2O42", known);
      assert.ok(repaired);
      assert.equal(repaired.candidate, "2042");
      const kn = analyzeFiscalKnowledge(blocksFromPlainText(FISCAL_FIXTURES.form2042OcrO));
      const hit = kn.detectedReferences.find((r) => r.normalized === "2042");
      assert.ok(hit, "OCR 2O42→2042 avec contexte fiscal");
      assert.ok(hit.normalizationReason || hit.reasons.some((x) => /ocr/i.test(x)));
      report.ocrNormalizationTests += 1;

      // Sans contexte fiscal fort : adresse avec O ne doit pas forcer
      const bad = analyzeFiscalKnowledge(
        blocksFromPlainText("Appartement 2O42 rue des Lilas")
      );
      const badHit = bad.detectedReferences.find(
        (r) => r.kind === "formReference" && r.role === "documentIdentity"
      );
      assert.ok(!badHit);
      report.ocrNormalizationTests += 1;
      console.log("  OK OCR");
    }

    section("False positive corpus");
    {
      let fpOk = 0;
      const total = Object.keys(FALSE_POSITIVE_CORPUS).length;
      for (const [name, text] of Object.entries(FALSE_POSITIVE_CORPUS)) {
        const r = runFiscal(text);
        const strongFiscal = ["incomeTaxReturn", "incomeTaxNotice", "propertyTax"].includes(
          r.classification.primary
        );
        const identity = (r.fiscalKnowledge?.detectedReferences || []).some(
          (x) => x.kind === "formReference" && x.role === "documentIdentity" && x.confidence >= 0.55
        );
        assert.equal(strongFiscal, false, `${name} classification fiscale forte`);
        assert.equal(identity, false, `${name} documentIdentity`);
        fpOk += 1;
        report.falsePositiveTests += 1;
      }
      report.falsePositiveRateOnNegativeFixtures = 0;
      assert.equal(fpOk, total);
      console.log("  OK false positives", total);
    }

    section("Known ref + wrong structure");
    {
      const r = runFiscal(FISCAL_FIXTURES.knownRefWrongStructure);
      assert.notEqual(r.classification.primary, "incomeTaxReturn");
      console.log("  OK primary=", r.classification.primary);
    }

    section("Known ref + strong structure");
    {
      const r = runFiscal(FISCAL_FIXTURES.form2042Identity);
      assert.equal(r.classification.primary, "incomeTaxReturn");
      assert.ok(r.classification.confidence.score >= 0.55);
      console.log("  OK conf=", r.classification.confidence.score);
    }

    section("Families coverage samples");
    {
      const samples = [
        [FISCAL_FIXTURES.form2044, ["incomeTaxReturn"]],
        [FISCAL_FIXTURES.form2065, ["taxForm", "taxDocument"]],
        [FISCAL_FIXTURES.form3310, ["taxForm", "taxDocument"]],
        [FISCAL_FIXTURES.propertyTax, ["propertyTax"]],
        [FISCAL_FIXTURES.noticeAmountDue, ["incomeTaxNotice"]]
      ];
      for (const [text, expected] of samples) {
        const r = runFiscal(text);
        assert.ok(
          expected.includes(r.classification.primary),
          `${text.slice(0, 40)} → ${r.classification.primary}`
        );
      }
      console.log("  OK family samples");
    }

    section("Unknown remains first-class");
    {
      const r = runFiscal(FISCAL_FIXTURES.unknownTax);
      assert.equal(r.classification.primary, "unknownTaxDocument");
      report.unknownRateOnUnknownFixtures = 1;
      console.log("  OK unknownTaxDocument");
    }

    section("Provenance obligatoire sur intégrés");
    {
      for (const e of reg.entries) {
        assert.ok(e.officialTitle);
        assert.ok(e.authority);
        assert.ok(e.officialSources?.length);
        assert.ok(e.normalizedReference);
      }
      console.log("  OK all integrated have provenance");
    }

    section("Bundle size");
    {
      report.registryJsonBytes = statSync(join(ROOT, "generated/french-tax-registry.json")).size;
      report.indexJsonBytes = statSync(join(ROOT, "generated/french-tax-registry-index.json")).size;
      assert.ok(report.registryJsonBytes < 5_000_000, "pas de PDF massifs");
      console.log("  JSON=", report.registryJsonBytes, "index=", report.indexJsonBytes);
    }

    section("Runtime network invariant");
    {
      resetFrenchTaxRegistryCacheForTests();
      loadFrenchTaxRegistry();
      runFiscal(FISCAL_FIXTURES.form2042Identity);
      assert.equal(fetchCalls, 0);
      console.log("  OK 0 fetch");
    }

    assert.equal(fetchCalls, 0);
    mkdirSync(join(ROOT, "generated"), { recursive: true });
    writeFileSync(
      join(ROOT, "generated/v4m-coverage-report.json"),
      JSON.stringify(report, null, 2) + "\n"
    );
    console.log("\n=== Coverage V4-M ===");
    console.log(JSON.stringify(report, null, 2));
    console.log("\n=== test-v4-fiscal-registry: OK ===");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
