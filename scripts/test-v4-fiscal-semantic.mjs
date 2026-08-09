/**
 * V4-N — corpus sémantique + invariants Knowledge ≠ DocumentFact
 */

import assert from "node:assert/strict";
import { analyzeDocumentV4 } from "../lib/v4/index.ts";
import {
  auditTaxKnowledgeQuality,
  checkFiscalKnowledgeSafety,
  explainTaxDocumentType,
  findByCerfa,
  findByReference,
  findRelatedDocuments,
  loadFrenchTaxRegistry,
  lookupTaxDocumentKnowledge,
  PRIORITY_SEMANTIC_PACKS,
  resetFrenchTaxRegistryCacheForTests,
  selectPrimaryIdentity
} from "../lib/v4/knowledge/index.ts";
import {
  FALSE_POSITIVE_CORPUS,
  FISCAL_FIXTURES
} from "../lib/v4/__fixtures__/fiscal/fixtures.mjs";

function section(title) {
  console.log(`\n── ${title} ──`);
}

function analyze(text) {
  return analyzeDocumentV4({ text, fiscalKnowledge: true });
}

function assertNoContamination(r, label) {
  const tx = r.fiscalKnowledge?.taxExplanation;
  assert.ok(tx, `${label}: taxExplanation manquante`);
  assert.equal(
    tx.invariants.documentFactsFromKnowledge,
    0,
    `${label}: documentFactsFromKnowledge`
  );
  assert.equal(tx.invariants.inventedTaxObligations, 0, `${label}: inventedTaxObligations`);
  assert.equal(tx.invariants.inventedTaxDates, 0, `${label}: inventedTaxDates`);
  assert.equal(tx.invariants.inventedTaxAmounts, 0, `${label}: inventedTaxAmounts`);
  for (const df of tx.importantDocumentFacts) {
    assert.equal(df.kind, "document");
    assert.ok(df.evidence?.length, `${label}: document fact sans evidence`);
  }
  for (const kf of tx.knowledgeFacts) {
    assert.equal(kf.kind, "knowledge");
  }
  const safety = checkFiscalKnowledgeSafety(r.fiscalKnowledge);
  assert.ok(safety.ok, `${label}: safety ${safety.violations.join("; ")}`);
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("=== test:v4-fiscal-semantic (V4-N) ===");
  resetFrenchTaxRegistryCacheForTests();
  const registry = loadFrenchTaxRegistry();

  section("Registry semantic enrichment");
  {
    assert.ok(registry.version.includes("v4n") || registry.version.includes("v4m"));
    const e2042 = findByReference("2042");
    assert.ok(e2042?.semantic?.plainLanguageWhat);
    assert.equal(e2042.qualityStatus, "verified");
    assert.ok(e2042.semantic.officialSources.length > 0);
    const kn = lookupTaxDocumentKnowledge("2042");
    assert.ok(kn?.plainLanguageWhat.includes("déclaration principale"));
    assert.ok(PRIORITY_SEMANTIC_PACKS.length >= 20);
    ok("priority packs loaded + 2042 verified");
  }

  section("A — 2042 identity + explanation");
  {
    const r = analyze(FISCAL_FIXTURES.form2042Identity);
    const primary = r.fiscalKnowledge.primaryIdentity;
    assert.equal(primary?.normalized, "2042");
    assert.equal(primary?.role, "documentIdentity");
    const tx = r.fiscalKnowledge.taxExplanation;
    assert.ok(tx.whatIsIt?.toLowerCase().includes("déclaration"));
    assert.ok(tx.purpose);
    assertNoContamination(r, "A");
    ok("2042 explained");
  }

  section("B — 2042 mentioned only");
  {
    const r = analyze(FISCAL_FIXTURES.form2042Mentioned);
    const ref = r.fiscalKnowledge.detectedReferences.find((x) => x.normalized === "2042");
    assert.ok(ref);
    assert.equal(ref.role, "mentionedDocument");
    assert.ok(
      !r.fiscalKnowledge.primaryIdentity ||
        r.fiscalKnowledge.primaryIdentity.normalized !== "2042" ||
        r.fiscalKnowledge.primaryIdentity.role !== "documentIdentity"
    );
    // Même si knowledge dispo, pas d'invention de montants
    assertNoContamination(r, "B");
    ok("mentioned ≠ identity");
  }

  section("C — 2042-C related to 2042");
  {
    const r = analyze(FISCAL_FIXTURES.form2042CIdentity);
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2042-C");
    const rel = findRelatedDocuments("2042-C");
    assert.ok(rel.some((x) => x.entry.normalizedReference === "2042"));
    assertNoContamination(r, "C");
    ok("2042-C related");
  }

  section("D — 2042-C-PRO");
  {
    const r = analyze(FISCAL_FIXTURES.form2042CPro);
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2042-C-PRO");
    const tx = r.fiscalKnowledge.taxExplanation;
    assert.ok(tx.whatIsIt?.toLowerCase().includes("non salari"));
    assertNoContamination(r, "D");
    ok("2042-C-PRO");
  }

  section("E — 2042-RICI");
  {
    const r = analyze(FISCAL_FIXTURES.form2042Rici);
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2042-RICI");
    assert.ok(
      r.fiscalKnowledge.taxExplanation.whatIsIt?.toLowerCase().includes("crédit")
    );
    assertNoContamination(r, "E");
    ok("2042-RICI");
  }

  section("F — 2044");
  {
    const r = analyze(FISCAL_FIXTURES.form2044);
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2044");
    assert.ok(
      r.fiscalKnowledge.taxExplanation.whatIsIt?.toLowerCase().includes("foncier")
    );
    assertNoContamination(r, "F");
    ok("2044");
  }

  section("G — 2047");
  {
    const r = analyze(FISCAL_FIXTURES.form2047);
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2047");
    assertNoContamination(r, "G");
    ok("2047");
  }

  section("H — avis IR");
  {
    const r = analyze(FISCAL_FIXTURES.noticeAmountDue);
    assert.ok(
      r.fiscalKnowledge.suggestedFamily === "incomeTaxNotice" ||
        r.classification.documentType === "incomeTaxNotice" ||
        r.fiscalKnowledge.suggestedDocumentType === "incomeTaxNotice"
    );
    const tx = r.fiscalKnowledge.taxExplanation;
    // Montants documentaires OK ; knowledge ne doit pas inventer d'autres montants
    assert.equal(tx.invariants.inventedTaxAmounts, 0);
    assertNoContamination(r, "H");
    ok("avis IR");
  }

  section("I — taxe foncière");
  {
    const r = analyze(FISCAL_FIXTURES.propertyTax);
    assert.ok(
      r.fiscalKnowledge.suggestedFamily === "propertyTax" ||
        r.classification.documentType === "propertyTax"
    );
    assertNoContamination(r, "I");
    ok("taxe foncière");
  }

  section("J — Cerfa vérifié + contexte");
  {
    const r = analyze(FISCAL_FIXTURES.cerfaVerified2042);
    const cerfa = r.fiscalKnowledge.detectedReferences.find(
      (x) => x.kind === "cerfaNumber" && x.normalized.startsWith("10330")
    );
    assert.ok(cerfa, "cerfa détecté");
    assert.ok(cerfa.confidence >= 0.75, `cerfa conf ${cerfa.confidence}`);
    assert.ok(cerfa.matchKind === "cerfa");
    const byC = findByCerfa("10330");
    assert.ok(byC?.normalizedReference === "2042");
    assertNoContamination(r, "J");
    ok("Cerfa vérifié");
  }

  section("K — faux Cerfa isolé");
  {
    const r = analyze(FISCAL_FIXTURES.falseCerfaIsolated);
    const cerfa = (r.fiscalKnowledge.detectedReferences || []).filter(
      (x) => x.kind === "cerfaNumber"
    );
    for (const c of cerfa) {
      assert.ok(
        c.confidence < 0.55 || c.matchKind === "possible" || c.role === "unknown",
        "faux cerfa ne doit pas classer"
      );
      assert.ok(c.role !== "documentIdentity" || c.confidence < 0.55);
    }
    assert.ok(!r.fiscalKnowledge.primaryIdentity?.kind || r.fiscalKnowledge.primaryIdentity.kind !== "cerfaNumber" || r.fiscalKnowledge.primaryIdentity.confidence < 0.75);
    ok("faux Cerfa");
  }

  section("L — numéro fiscal ≠ Cerfa / form");
  {
    const r = analyze(FISCAL_FIXTURES.taxpayerId13);
    const tid = r.fiscalKnowledge.detectedReferences.find(
      (x) => x.kind === "taxpayerIdentifier"
    );
    assert.ok(tid);
    assert.notEqual(tid.kind, "cerfaNumber");
    assert.notEqual(tid.kind, "formReference");
    ok("numéro fiscal");
  }

  section("M — multi-références");
  {
    const r = analyze(FISCAL_FIXTURES.multiReference2042);
    const forms = r.fiscalKnowledge.detectedReferences.filter(
      (x) => x.kind === "formReference"
    );
    assert.ok(forms.some((f) => f.normalized === "2042" && f.role === "documentIdentity"));
    assert.ok(forms.some((f) => ["2042-C", "2044", "2047"].includes(f.normalized)));
    const primary = r.fiscalKnowledge.primaryIdentity || selectPrimaryIdentity(forms);
    assert.equal(primary?.normalized, "2042");
    assertNoContamination(r, "M");
    ok("multi-références");
  }

  section("N — OCR 204Z sans correction forcée");
  {
    const r = analyze(FISCAL_FIXTURES.ocr204Z);
    const primary = r.fiscalKnowledge.primaryIdentity;
    // Ne pas corriger avec certitude sans preuve suffisante
    if (primary?.normalized === "2042") {
      assert.ok(
        primary.normalizationReason || primary.confidence < 0.9,
        "correction OCR trop affirmée"
      );
    }
    ok("OCR 204Z prudent");
  }

  section("O — année document ≠ année revenus");
  {
    const r = analyze(FISCAL_FIXTURES.yearMismatchIncomeVsDoc);
    const years = r.fiscalKnowledge.detectedReferences.filter(
      (x) => x.kind === "fiscalYear"
    );
    const roles = new Set(years.map((y) => y.yearRole).filter(Boolean));
    assert.ok(years.length >= 1);
    // Au moins un rôle distinct si contexte clair
    assert.ok(
      roles.has("incomeYear") || roles.has("documentYear") || years.length >= 2
    );
    ok("year roles");
  }

  section("P — document inconnu");
  {
    const r = analyze(FISCAL_FIXTURES.unknownTax);
    const tx = r.fiscalKnowledge.taxExplanation;
    assert.ok(tx);
    assert.ok(
      !tx.whatIsIt ||
        tx.confidence < 0.6 ||
        tx.warnings.some((w) => /incertain|limitée|partiellement/i.test(w))
    );
    assertNoContamination(r, "P");
    ok("inconnu prudent");
  }

  section("Q — non fiscal contenant 2042");
  {
    const r = analyze(FISCAL_FIXTURES.nonFiscalContains2042);
    const id = r.fiscalKnowledge.primaryIdentity;
    assert.ok(!id || id.role !== "documentIdentity" || id.confidence < 0.7);
    ok("non fiscal 2042");
  }

  section("R — facture 2042");
  {
    const r = analyze(FALSE_POSITIVE_CORPUS.invoice2042);
    const forms = (r.fiscalKnowledge.detectedReferences || []).filter(
      (x) => x.normalized === "2042" && x.role === "documentIdentity"
    );
    assert.equal(forms.length, 0);
    ok("facture ≠ 2042");
  }

  section("S — titre fiscal sans référence");
  {
    const r = analyze(FISCAL_FIXTURES.titleFiscalNoReference);
    // Pas d'identité formulaire forcée
    const primary = r.fiscalKnowledge.primaryIdentity;
    assert.ok(!primary || primary.normalized !== "2042" || primary.confidence < 0.9);
    assertNoContamination(r, "S");
    ok("titre sans ref");
  }

  section("T — contradiction titre/référence");
  {
    const r = analyze(FISCAL_FIXTURES.titleRefContradiction);
    // La référence 2044 prime sur le titre générique
    assert.equal(r.fiscalKnowledge.primaryIdentity?.normalized, "2044");
    assertNoContamination(r, "T");
    ok("titre vs ref");
  }

  section("U — knowledge sans valeur utilisateur");
  {
    const r = analyze(FISCAL_FIXTURES.knowledgeNoUserValue);
    const tx = r.fiscalKnowledge.taxExplanation;
    assert.ok(tx.whatIsIt);
    // Aucun montant inventé dans importantDocumentFacts
    for (const df of tx.importantDocumentFacts) {
      assert.ok(df.evidence?.length);
      assert.ok(!String(df.derivedFrom || []).some((d) => String(d).startsWith("kf:")));
    }
    assert.equal(tx.invariants.inventedTaxAmounts, 0);
    assertNoContamination(r, "U");
    ok("pas d'invention de valeur");
  }

  section("V — knowledge sans action documentaire");
  {
    const r = analyze(FISCAL_FIXTURES.knowledgeNoAction);
    const tx = r.fiscalKnowledge.taxExplanation;
    assert.ok(tx.possibleActions.length >= 1);
    for (const a of tx.possibleActions) {
      assert.ok(
        /général|aucune action|pas une obligation|dépend/i.test(a),
        `action trop précise: ${a}`
      );
      assert.ok(!/case\s+[0-9A-Z]/i.test(a));
      assert.ok(!/avant le 15/i.test(a));
    }
    assert.equal(tx.invariants.inventedTaxObligations, 0);
    assertNoContamination(r, "V");
    ok("pas d'invention d'action");
  }

  section("explainTaxDocumentType + lookup");
  {
    const t = explainTaxDocumentType("2042");
    assert.ok(t?.plainLanguagePurpose);
    const rel = findRelatedDocuments("2042");
    assert.ok(rel.length >= 1);
    ok("lookup APIs");
  }

  section("Quality audit");
  {
    const report = auditTaxKnowledgeQuality(registry);
    assert.ok(report.totalEntries >= 370);
    assert.ok(report.withSemanticExplanation >= 15);
    assert.ok(report.verifiedEntries >= 15);
    assert.equal(report.priorityDocumentsCoverage.missingFromRegistry.length, 0);
    assert.ok(report.priorityDocumentsCoverage.enriched >= 18);
    assert.equal(report.knowledgeWithoutProvenanceVerified.length, 0);
    assert.ok(report.ok, JSON.stringify(report.priorityDocumentsCoverage));
    ok("quality metrics");
  }

  section("Default path unchanged");
  {
    const r = analyzeDocumentV4({
      text: FISCAL_FIXTURES.form2042Identity,
      fiscalKnowledge: false
    });
    assert.ok(!r.fiscalKnowledge);
    ok("preview path");
  }

  console.log(`\nOK — ${passed} checks V4-N`);
}

main();
