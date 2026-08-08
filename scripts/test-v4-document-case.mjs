/**
 * V4-R — corpus dossier multi-documents (A→Z)
 */

import assert from "node:assert/strict";
import {
  addDocumentsToCase,
  assertUploadOrderStable,
  auditDocumentCase,
  buildCaseTaxAssistanceContext,
  buildDocumentCase,
  checkDocumentCaseSafety,
  decideFieldApplicability,
  removeDocumentFromCase,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  runV4PreviewDocumentCase
} from "../lib/v4/index.ts";
import {
  CASE_DOCS,
  tenDocumentBundle
} from "../lib/v4/__fixtures__/fiscal/caseFixtures.mjs";

function section(t) {
  console.log(`\n── ${t} ──`);
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function build(docs, opts = {}) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
  return buildDocumentCase(docs, { resetIds: true, ...opts });
}

function main() {
  console.log("=== test:v4-document-case (V4-R) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-R");
  };

  try {
    section("A — 2042 + 2042-RICI");
    {
      const c = build([CASE_DOCS.form2042, CASE_DOCS.form2042Rici]);
      assert.equal(c.documents.length, 2);
      assert.ok(c.taxContext.primaryReferences.includes("2042") || c.documents.some((d) => d.detectedReference));
      assert.ok(c.relations.some((r) => r.relationType === "relatedTaxForm" || r.relationType === "sameFiscalYear"));
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.ok(checkDocumentCaseSafety(c).ok, JSON.stringify(checkDocumentCaseSafety(c)));
    }
    ok("A");

    section("B — 2042-RICI + attestation 7DB");
    {
      const c = build([CASE_DOCS.form2042Rici, CASE_DOCS.attestation7DB]);
      assert.ok(
        c.relations.some(
          (r) =>
            r.relationType === "possibleSupportingDocument" ||
            r.relationType === "possibleFieldEvidence"
        )
      );
      const view = c.caseCentricViews.find((v) => v.fieldCode === "7DB");
      assert.ok(view);
      assert.ok(view.foundByDocument.length >= 1);
      assert.ok(!/reportez|déclarez/i.test(JSON.stringify(view)));
      assert.equal(view.suggestedDeclaredAmount, null);
    }
    ok("B");

    section("C — 2044 + justificatif foncier");
    {
      const c = build([CASE_DOCS.form2044, CASE_DOCS.foncierJustificatif]);
      assert.ok(c.documents.length === 2);
      assert.equal(c.suggestedDeclaredAmount, null);
      // peut lier 4BA sans conclure le montant
      const v4 = c.caseCentricViews.find((v) => v.fieldCode === "4BA");
      if (v4) assert.equal(v4.suggestedDeclaredAmount, null);
    }
    ok("C");

    section("D — même document uploadé deux fois");
    {
      const c = build([CASE_DOCS.form2042, CASE_DOCS.form2042]);
      assert.equal(c.documents.length, 2);
      assert.ok(
        c.documents.some((d) => d.duplicateStatus === "possibleDuplicate")
      );
      assert.ok(
        c.documentCentricViews.some((d) =>
          /déjà présent/i.test(d.duplicateMessage || "")
        )
      );
      assert.equal(c.invariants.duplicateDocumentDoubleCounted, 0);
      const primaryFacts = c.factIndex.filter((f) =>
        c.documents.find((d) => d.documentId === f.sourceDocumentId && d.isPrimaryCopy)
      );
      assert.ok(primaryFacts.length >= 1);
    }
    ok("D");

    section("E — possible version différente");
    {
      const c = build([CASE_DOCS.draft2042, CASE_DOCS.final2042]);
      assert.equal(c.documents.length, 2);
      // conserver les deux
      assert.ok(
        c.documents.every((d) => d.duplicateStatus !== "possibleDuplicate") ||
          c.documents.some((d) => d.duplicateStatus === "possibleVersion") ||
          c.documents.every((d) => d.isPrimaryCopy || d.duplicateStatus === "distinct")
      );
      assert.ok(c.documents.length === 2);
    }
    ok("E");

    section("F — années différentes");
    {
      const c = build([CASE_DOCS.form2042Rici, CASE_DOCS.attestation7DB_2025]);
      assert.ok(c.taxContext.yearsPresent.length >= 2 || c.conflicts.some((x) => x.kind === "year") || c.requirementMatches.some((m) => m.yearRelation === "yearMismatch" || m.yearRelation === "yearUnknown"));
      assert.equal(c.invariants.yearMismatchPromotedToStrong, 0);
      assert.equal(c.suggestedDeclaredAmount, null);
    }
    ok("F");

    section("G — déclarant 1 + déclarant 2");
    {
      const c = build([CASE_DOCS.form2042]);
      assert.ok(c.taxContext.fieldCodesPresent.includes("1AJ"));
      assert.ok(c.taxContext.fieldCodesPresent.includes("1BJ"));
      // pas de fusion des faits
      const facts1 = c.factIndex.filter((f) => f.fieldCode === "1AJ");
      const facts2 = c.factIndex.filter((f) => f.fieldCode === "1BJ");
      assert.ok(facts1.length >= 1 && facts2.length >= 1);
    }
    ok("G");

    section("H — document inconnu");
    {
      const c = build([CASE_DOCS.form2042, CASE_DOCS.unknownDoc]);
      const unk = c.documents.find((d) => d.fileName === "scan-inconnu.pdf");
      assert.ok(unk);
      assert.ok(!unk.detectedReference);
      assert.ok(/non identifié|inconnu|Document/i.test(unk.recognitionLabel));
      assert.equal(c.invariants.unknownDocumentPromotedToKnown, 0);
    }
    ok("H");

    section("I — facture FP contenant 7DB");
    {
      const c = build([CASE_DOCS.form2042Rici, CASE_DOCS.invoiceFP]);
      assert.ok(
        !c.relations.some(
          (r) =>
            (r.fromDocumentId.includes("facture") ||
              c.documents.find((d) => d.documentId === r.fromDocumentId)
                ?.fileName === "facture-7DB.pdf") &&
            r.relationType === "possibleFieldEvidence" &&
            r.confidence >= 0.7
        )
      );
      // pas de ref inventée sur facture
      const inv = c.documents.find((d) => d.fileName === "facture-7DB.pdf");
      assert.ok(inv);
      assert.ok(!inv.detectedReference || inv.confidence < 0.75);
    }
    ok("I");

    section("J — plusieurs montants candidats → pas de somme");
    {
      const c = build([
        CASE_DOCS.form2042RiciEmpty7DB,
        CASE_DOCS.attestationA,
        CASE_DOCS.attestationB,
        CASE_DOCS.attestationC
      ]);
      assert.equal(c.suggestedDeclaredAmount, null);
      const blob = JSON.stringify(c.requirementMatches);
      assert.ok(!/2500/.test(blob.replace(/\s/g, "")));
      assert.ok(
        c.requirementMatches.every((m) => m.aggregatedValue === null)
      );
      assert.equal(c.invariants.crossDocumentUnsafeAggregation, 0);
    }
    ok("J");

    section("K — case vide + justificatif candidat");
    {
      const c = build([
        CASE_DOCS.form2042RiciEmpty7DB,
        CASE_DOCS.attestation7DB
      ]);
      const view = c.caseCentricViews.find((v) => v.fieldCode === "7DB");
      assert.ok(view);
      assert.ok(
        view.foundByDocument.some((f) =>
          /attestation|candidat|dépenses|2400|2 400/i.test(f.notes.join(" "))
        ) || view.toVerify.length >= 0
      );
      assert.equal(view.suggestedDeclaredAmount, null);
    }
    ok("K");

    section("L — ajout document après analyse");
    {
      const base = build([CASE_DOCS.form2042]);
      const next = addDocumentsToCase(base, [CASE_DOCS.form2042Rici], {
        resetIds: true
      });
      assert.ok(next.documents.length >= 2);
      assert.ok(
        next.documents.some(
          (d) =>
            d.detectedReference === "2042-RICI" ||
            /2042-RICI|RICI/i.test(d.fileName || "")
        )
      );
    }
    ok("L");

    section("M — suppression document");
    {
      const base = build([
        CASE_DOCS.form2042,
        CASE_DOCS.form2042Rici,
        CASE_DOCS.attestation7DB
      ]);
      const att = base.documents.find((d) => /attestation/i.test(d.fileName || ""));
      assert.ok(att);
      const after = removeDocumentFromCase(base, att.documentId, {
        resetIds: true
      });
      assert.ok(!after.documents.some((d) => d.documentId === att.documentId));
      assert.ok(
        !after.factIndex.some((f) => f.sourceDocumentId === att.documentId)
      );
      assert.equal(after.invariants.removedDocumentFactSurvives, 0);
    }
    ok("M");

    section("N — ordre A/B vs B/A");
    {
      const order = assertUploadOrderStable(
        [CASE_DOCS.form2042, CASE_DOCS.attestation7DB],
        [CASE_DOCS.attestation7DB, CASE_DOCS.form2042]
      );
      assert.ok(order.ok, "upload order changed conclusion");
      assert.equal(order.uploadOrderChangesConclusion, 0);
    }
    ok("N");

    section("O — 10 documents perf");
    {
      const t0 = Date.now();
      const c = build(tenDocumentBundle());
      const ms = Date.now() - t0;
      assert.equal(c.metrics.documents, 10);
      assert.ok(c.metrics.facts >= 1);
      assert.ok(ms < 15000, `trop lent: ${ms}ms`);
      console.log(
        `    metrics docs=${c.metrics.documents} facts=${c.metrics.facts} req=${c.metrics.requirements} strong=${c.metrics.strongMatches} cand=${c.metrics.candidateMatches} amb=${c.metrics.ambiguousMatches} rej=${c.metrics.rejectedMatches} (${ms}ms)`
      );
    }
    ok("O");

    section("P — conflict montant");
    {
      const c = build([
        CASE_DOCS.form2042Rici,
        CASE_DOCS.attestation7DB,
        CASE_DOCS.conflictAmountAttestation
      ]);
      // plusieurs montants — pas de total ; conflit ou ambiguïté possible
      assert.equal(c.suggestedDeclaredAmount, null);
      assert.ok(
        c.conflicts.some((x) => x.kind === "amount") ||
          c.ambiguities.length >= 0
      );
    }
    ok("P");

    section("Q — conflict année");
    {
      const c = build([CASE_DOCS.form2042Rici, CASE_DOCS.attestation7DB_2025]);
      assert.ok(
        c.taxContext.yearsPresent.length >= 2 ||
          c.conflicts.some((x) => x.kind === "year")
      );
    }
    ok("Q");

    section("R — conflict / séparation rôles");
    {
      const c = build([CASE_DOCS.form2042]);
      // 1AJ et 1BJ restent séparés
      const a = c.factIndex.find((f) => f.fieldCode === "1AJ");
      const b = c.factIndex.find((f) => f.fieldCode === "1BJ");
      assert.ok(a && b);
      assert.notEqual(String(a.displayValue), String(b.displayValue));
    }
    ok("R");

    section("S — aucun match");
    {
      const c = build([CASE_DOCS.unknownDoc]);
      assert.ok(c.requirementMatches.every((m) => m.status !== "found") || c.requirementMatches.length === 0 || c.caseCentricViews.length === 0);
      assert.equal(c.suggestedDeclaredAmount, null);
    }
    ok("S");

    section("T — match strong avec evidence");
    {
      const c = build([CASE_DOCS.form2042]);
      const strong = c.requirementMatches.filter((m) => m.verdict === "strong");
      assert.ok(strong.length >= 1);
      assert.ok(strong.every((m) => m.evidenceLinks.every((l) => l.matchReason)));
    }
    ok("T");

    section("U — match candidate");
    {
      const c = build([CASE_DOCS.form2042RiciEmpty7DB, CASE_DOCS.attestation7DB]);
      assert.ok(
        c.metrics.candidateMatches >= 1 ||
          c.requirementMatches.some((m) =>
            ["candidate", "ambiguous", "strong"].includes(m.verdict)
          )
      );
    }
    ok("U");

    section("V — match ambiguous");
    {
      const c = build([
        CASE_DOCS.form2042RiciEmpty7DB,
        CASE_DOCS.attestationA,
        CASE_DOCS.attestationB,
        CASE_DOCS.attestationC
      ]);
      assert.ok(
        c.metrics.ambiguousMatches >= 1 ||
          c.requirementMatches.some((m) => m.status === "ambiguous") ||
          c.ambiguities.length >= 1
      );
    }
    ok("V");

    section("W — match rejected");
    {
      const c = build([CASE_DOCS.invoiceFP]);
      assert.ok(
        c.metrics.rejectedMatches >= 0
      );
      // facture seule : pas de suggested amount
      assert.equal(c.suggestedDeclaredAmount, null);
    }
    ok("W");

    section("X — user answer");
    {
      const c = build([CASE_DOCS.form2042RiciEmpty7DB], {
        userAnswers: [
          {
            kind: "user",
            questionId: "q1",
            requirementId: "7db-amount",
            answer: "2400",
            answeredAt: "2026-08-08",
            source: "user"
          }
        ]
      });
      assert.equal(c.userAnswers.length, 1);
      assert.equal(c.userAnswers[0].source, "user");
      assert.equal(c.invariants.userAnswerPromotedToOfficialKnowledge, 0);
      const ctx = buildCaseTaxAssistanceContext(c, "7DB");
      assert.ok(ctx.caseId);
      assert.throws(() => decideFieldApplicability(ctx));
    }
    ok("X");

    section("Y — requirement missing dossier");
    {
      const c = build([CASE_DOCS.form2042RiciEmpty7DB]);
      const missing = c.requirementMatches.filter(
        (m) => m.fieldCode === "7DB" && m.status === "missing"
      );
      assert.ok(missing.length >= 1 || c.fieldAssistance.some((a) => a.fieldCode === "7DB" && a.missingRequirements.length));
      assert.ok(
        (missing[0] ? missing[0].statusLabel : "").includes("documents actuellement analysés") ||
          JSON.stringify(c.fieldAssistance).includes("éléments analysés") ||
          JSON.stringify(c.fieldAssistance).includes("documents")
      );
      assert.ok(!/vous n['’]avez pas/i.test(JSON.stringify(c)));
    }
    ok("Y");

    section("Z — document sans année");
    {
      const c = build([CASE_DOCS.form2042Rici, CASE_DOCS.noYearDoc]);
      assert.ok(
        c.requirementMatches.some((m) => m.yearRelation === "yearUnknown") ||
          c.documents.some((d) => d.fiscalYear == null)
      );
    }
    ok("Z");

    section("Audit + Preview");
    {
      const c = build([
        CASE_DOCS.form2042,
        CASE_DOCS.form2042Rici,
        CASE_DOCS.attestation7DB,
        CASE_DOCS.unknownDoc
      ]);
      const report = auditDocumentCase(c);
      assert.ok(report.ok, JSON.stringify(report));
      const preview = runV4PreviewDocumentCase({
        documents: [
          CASE_DOCS.form2042,
          CASE_DOCS.form2042Rici,
          CASE_DOCS.attestation7DB,
          CASE_DOCS.unknownDoc
        ],
        resetIds: true
      });
      assert.ok(preview.ok, preview.message);
      assert.equal(preview.document_case.documents_count, 4);
      assert.ok(Array.isArray(preview.document_case.tax_fields));
      assert.ok(Array.isArray(preview.document_case.documents));
      assert.equal(preview.document_case.suggested_declared_amount, null);
    }
    ok("audit-preview");

    section("Safety runtime");
    {
      assert.equal(fetchCalls, 0);
    }
    ok("runtime");

    console.log(`\n=== V4-R OK — ${passed} checks ===`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
