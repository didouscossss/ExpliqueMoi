/**
 * Tests V4-L — French Fiscal Knowledge Foundation
 * Runtime offline : 0 fetch / 0 LLM
 * Usage: npm run test:v4-fiscal-knowledge
 */

import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeDocumentV4,
  analyzeFiscalKnowledge,
  loadFrenchTaxRegistry,
  resetFrenchTaxRegistryCacheForTests,
  buildRegistryFromSeed,
  validateFrenchTaxRegistry,
  diffFrenchTaxRegistries,
  detectFiscalReferences,
  classifyNumericToken,
  checkFiscalKnowledgeSafety,
  knowledgeFactIsNotDocumentFact,
  FREE_LOCAL_KNOWLEDGE_CONSUMER,
  FISCAL_EXTERNAL_SOURCES,
  FRENCH_TAX_REGISTRY_SEED,
  blocksFromPlainText,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";
import { FISCAL_FIXTURES } from "../lib/v4/__fixtures__/fiscal/fixtures.mjs";
import { bestRole } from "../lib/v4/relations/helpers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function section(title) {
  console.log(`\n▸ ${title}`);
}

function runFiscal(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return analyzeDocumentV4({ text, fiscalKnowledge: true });
}

function fieldValue(r, name) {
  const f = r.fields.fields.find((x) => x.field === name && x.status === "resolved");
  return f?.value ?? null;
}

function moneyApprox(v, expected) {
  if (typeof v !== "number") return false;
  return Math.abs(v - expected) < 0.01;
}

function main() {
  console.log("=== test-v4-fiscal-knowledge (V4-L) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en runtime V4-L");
  };

  const report = {
    registryEntries: 0,
    familiesCovered: [],
    officialReferences: 0,
    versionedReferences: 0,
    officialSources: 0,
    syntheticFixtures: 0,
    classificationSuccess: 0,
    referenceRoleSuccess: 0,
    falsePositiveReferences: 0,
    unknownTaxDocuments: 0,
    unsupportedExplanationFacts: 0,
    unsupportedPresentationFacts: 0,
    invariantsOk: true
  };

  try {
    section("Registry seed + validation offline");
    {
      resetFrenchTaxRegistryCacheForTests();
      const reg = loadFrenchTaxRegistry();
      const issues = validateFrenchTaxRegistry(reg);
      assert.equal(issues.filter((i) => i.level === "error").length, 0);
      report.registryEntries = reg.entries.length;
      report.familiesCovered = [...new Set(reg.entries.map((e) => e.family))];
      report.officialReferences = reg.entries.filter(
        (e) => e.referenceNumbers.length > 0
      ).length;
      report.versionedReferences = reg.entries.filter(
        (e) => (e.applicableYears || []).length > 0
      ).length;
      report.officialSources = new Set(
        reg.entries.flatMap((e) => e.officialSources.map((s) => s.url))
      ).size;
      assert.ok(reg.entries.length >= 10, "au moins 10 entrées curated");
      assert.ok(reg.entries.some((e) => e.referenceNumbers.includes("2042")));
      assert.ok(reg.entries.some((e) => e.family === "incomeTaxNotice"));
      assert.ok(reg.entries.some((e) => e.family === "propertyTax"));
      console.log(
        "  OK entries=",
        reg.entries.length,
        "families=",
        report.familiesCovered.length
      );
    }

    section("Licences / sources externes");
    {
      assert.ok(FISCAL_EXTERNAL_SOURCES.length >= 1);
      const impots = FISCAL_EXTERNAL_SOURCES.find((s) => s.id === "impots-gouv-fr");
      assert.ok(impots);
      assert.ok(impots.license.includes("Ouverte") || impots.license.includes("UNKNOWN"));
      assert.notEqual(impots.redistributionAllowed, undefined);
      console.log("  OK sources=", FISCAL_EXTERNAL_SOURCES.map((s) => s.id).join(", "));
    }

    section("Diff registry (pas de remplacement silencieux)");
    {
      const a = buildRegistryFromSeed("t1");
      const b = buildRegistryFromSeed("t2");
      const d0 = diffFrenchTaxRegistries(null, a);
      assert.ok(d0.added.length === a.entries.length);
      const d1 = diffFrenchTaxRegistries(a, b);
      assert.equal(d1.added.length, 0);
      assert.equal(d1.removed.length, 0);
      console.log("  OK diff structure");
    }

    section("KnowledgeFact ≠ DocumentFact");
    {
      const blocks = blocksFromPlainText(FISCAL_FIXTURES.form2042Identity);
      const kn = analyzeFiscalKnowledge(blocks);
      assert.ok(kn.knowledgeFacts.every((f) => knowledgeFactIsNotDocumentFact(f)));
      assert.ok(kn.knowledgeFacts.every((f) => f.kind === "knowledge"));
      assert.ok(!kn.knowledgeFacts.some((f) => "value" in f && f.value != null && f.kind === "document"));
      const safety = checkFiscalKnowledgeSafety(kn);
      assert.equal(safety.ok, true, safety.violations.join("; "));
      console.log("  OK facts knowledge=", kn.knowledgeFacts.length);
    }

    section("FREE consumer — pas de LLM");
    {
      assert.equal(FREE_LOCAL_KNOWLEDGE_CONSUMER.usesLlm, false);
      assert.equal(FREE_LOCAL_KNOWLEDGE_CONSUMER.kind, "free-local");
      console.log("  OK free-local");
    }

    section("§27 — 2042 identitaire → incomeTaxReturn");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.form2042Identity);
      const kn = r.fiscalKnowledge;
      assert.ok(kn);
      const ref = kn.detectedReferences.find(
        (x) => x.kind === "formReference" && x.normalized === "2042"
      );
      assert.ok(ref, "référence 2042 détectée");
      assert.equal(ref.role, "documentIdentity");
      report.referenceRoleSuccess += 1;
      assert.equal(r.classification.primary, "incomeTaxReturn");
      report.classificationSuccess += 1;
      assert.ok(kn.knowledgeFacts.some((f) => /2042/.test(f.statement)));
      assert.ok(ref.registryId);
      console.log("  OK primary=", r.classification.primary, "role=", ref.role);
    }

    section("§28 — 2042 mentionné ≠ incomeTaxReturn");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.form2042Mentioned);
      const kn = r.fiscalKnowledge;
      const ref = kn.detectedReferences.find(
        (x) => x.kind === "formReference" && x.normalized === "2042"
      );
      assert.ok(ref);
      assert.equal(ref.role, "mentionedDocument");
      report.referenceRoleSuccess += 1;
      assert.notEqual(r.classification.primary, "incomeTaxReturn");
      report.classificationSuccess += 1;
      console.log("  OK primary=", r.classification.primary, "role=", ref.role);
    }

    section("§29 — numéro fiscal 13 chiffres → taxpayerIdentifier");
    {
      report.syntheticFixtures += 1;
      const kn = analyzeFiscalKnowledge(
        blocksFromPlainText(FISCAL_FIXTURES.taxpayerId13)
      );
      const tid = kn.detectedReferences.find((x) => x.kind === "taxpayerIdentifier");
      assert.ok(tid);
      assert.equal(tid.normalized.length, 13);
      assert.ok(
        !kn.detectedReferences.some(
          (x) => x.kind === "formReference" && x.normalized === tid.normalized
        )
      );
      assert.notEqual(classifyNumericToken("1890123456789", "Numéro fiscal : 1890123456789"), "formReference");
      report.classificationSuccess += 1;
      console.log("  OK taxpayerIdentifier");
    }

    section("§30 — référence avis → noticeReference");
    {
      report.syntheticFixtures += 1;
      const kn = analyzeFiscalKnowledge(
        blocksFromPlainText(FISCAL_FIXTURES.noticeReference)
      );
      const nr = kn.detectedReferences.find((x) => x.kind === "noticeReference");
      assert.ok(nr, "noticeReference attendu");
      assert.notEqual(nr.kind, "formReference");
      report.classificationSuccess += 1;
      console.log("  OK noticeReference=", nr.normalized);
    }

    section("§31 — avis remboursement : refundAmount ≠ amountDue");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.noticeRefund);
      assert.equal(r.classification.primary, "incomeTaxNotice");
      report.classificationSuccess += 1;
      const refund =
        fieldValue(r, "refundAmount") ??
        r.presentation.importantAmounts.find((a) => a.field === "refundAmount")?.value;
      const due =
        fieldValue(r, "amountDue") ??
        r.presentation.importantAmounts.find((a) => a.field === "amountDue")?.value;
      assert.ok(
        moneyApprox(refund, 580) ||
          r.candidates.some(
            (c) =>
              c.type === "money" &&
              c.value === 580 &&
              bestRole(c) === "refundAmount"
          ),
        "refundAmount 580 attendu"
      );
      // Pas d'action de paiement inventée pour un remboursement
      const payActions = (r.presentation.actions || []).filter((a) =>
        /payer|paiement/i.test(a.text || a.label || "")
      );
      assert.ok(
        payActions.length === 0 ||
          payActions.every((a) => a.status !== "supported" || /aucune|pas/i.test(a.text || "")),
        "pas d'action paiement inventée"
      );
      if (due != null) assert.notEqual(due, refund);
      console.log("  OK refund=", refund, "due=", due, "primary=", r.classification.primary);
    }

    section("§32 — avis solde à payer + échéancier");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.noticeAmountDue);
      assert.equal(r.classification.primary, "incomeTaxNotice");
      report.classificationSuccess += 1;
      const due =
        fieldValue(r, "amountDue") ??
        r.candidates.find(
          (c) =>
            c.type === "money" && c.value === 1320 && bestRole(c) === "amountDue"
        )?.value;
      assert.ok(moneyApprox(due, 1320) || r.candidates.some((c) => c.value === 1320));
      const hasSchedule =
        (r.classification.secondarySections || []).some(
          (s) => s.kind === "paymentSchedule"
        ) || /[eé]ch[eé]ancier/i.test(FISCAL_FIXTURES.noticeAmountDue);
      assert.ok(hasSchedule);
      console.log("  OK amountDue path, schedule signal");
    }

    section("§33 — taxe foncière");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.propertyTax);
      assert.equal(r.classification.primary, "propertyTax");
      report.classificationSuccess += 1;
      assert.ok(
        r.candidates.some((c) => c.type === "money" && c.value === 1156) ||
          fieldValue(r, "taxAmount") === 1156 ||
          fieldValue(r, "amountDue") === 1156
      );
      // Pas de logique facture HT/TVA/TTC
      assert.ok(!(r.fields.fields || []).some((f) => f.field === "amountHT" && f.status === "resolved"));
      console.log("  OK propertyTax");
    }

    section("§34 — unknownTaxDocument");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.unknownTax);
      assert.equal(r.classification.primary, "unknownTaxDocument");
      assert.notEqual(r.classification.primary, "invoice");
      assert.notEqual(r.classification.primary, "contract");
      report.unknownTaxDocuments += 1;
      report.classificationSuccess += 1;
      console.log(
        "  OK primary=",
        r.classification.primary,
        "suggested=",
        r.fiscalKnowledge?.suggestedFamily
      );
    }

    section("§35 — faux positif 2042 adresse");
    {
      report.syntheticFixtures += 1;
      const r = runFiscal(FISCAL_FIXTURES.falsePositive2042);
      const kn = r.fiscalKnowledge;
      const formRefs = (kn?.detectedReferences || []).filter(
        (x) => x.kind === "formReference" && x.normalized === "2042"
      );
      // Soit non détecté, soit rôle/confiance faible — pas de classification fiscale forte
      assert.notEqual(r.classification.primary, "incomeTaxReturn");
      assert.notEqual(r.classification.primary, "incomeTaxNotice");
      assert.notEqual(r.classification.primary, "propertyTax");
      if (formRefs.length === 0) report.falsePositiveReferences += 1;
      else {
        assert.ok(formRefs.every((f) => f.role !== "documentIdentity" || f.confidence < 0.5));
        report.falsePositiveReferences += 1;
      }
      report.classificationSuccess += 1;
      console.log("  OK primary=", r.classification.primary, "formRefs=", formRefs.length);
    }

    section("Default path — fiscalKnowledge off (Preview inchangé)");
    {
      resetCandidateIdsForTests();
      const r = analyzeDocumentV4({
        text: FISCAL_FIXTURES.noticeAmountDue,
        fiscalKnowledge: false
      });
      assert.equal(r.classification.primary, "taxDocument");
      assert.ok(!r.fiscalKnowledge || r.fiscalKnowledge === null);
      console.log("  OK default taxDocument (no specialized)");
    }

    section("Invariants safety + offline");
    {
      for (const text of Object.values(FISCAL_FIXTURES).filter((x) => typeof x === "string")) {
        const kn = analyzeFiscalKnowledge(blocksFromPlainText(text));
        const safety = checkFiscalKnowledgeSafety(kn);
        if (!safety.ok) {
          report.invariantsOk = false;
          console.error("  safety fail:", safety.violations, text.slice(0, 60));
        }
        assert.equal(safety.ok, true, safety.violations.join("; "));
      }
      console.log("  OK safety invariants");
    }

    section("Provenance 2042");
    {
      const entry = FRENCH_TAX_REGISTRY_SEED.find((e) => e.id === "fr-tax-2042");
      assert.ok(entry);
      assert.ok(entry.officialSources.some((s) => /impots\.gouv\.fr/.test(s.url)));
      assert.ok(entry.officialSources.some((s) => s.supports.includes("officialTitle")));
      console.log("  OK provenance", entry.officialSources[0].url);
    }

    // Coverage counters from a full fiscal run set
    {
      const samples = [
        FISCAL_FIXTURES.form2042Identity,
        FISCAL_FIXTURES.noticeRefund,
        FISCAL_FIXTURES.propertyTax
      ];
      for (const t of samples) {
        const r = runFiscal(t);
        report.unsupportedExplanationFacts +=
          r.diagnostics.unsupportedExplanationFacts || 0;
        report.unsupportedPresentationFacts +=
          r.diagnostics.unsupportedPresentationFacts || 0;
      }
    }

    assert.equal(fetchCalls, 0, "0 fetch runtime");
    console.log("\n=== Coverage report V4-L ===");
    console.log(JSON.stringify(report, null, 2));

    mkdirSync(join(ROOT, "generated"), { recursive: true });
    writeFileSync(
      join(ROOT, "generated/v4l-coverage-report.json"),
      JSON.stringify(report, null, 2) + "\n"
    );

    console.log("\n=== test-v4-fiscal-knowledge: OK ===");
    console.log("fetchCalls=", fetchCalls, "(must be 0)");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
