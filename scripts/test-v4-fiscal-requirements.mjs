/**
 * V4-Q — corpus requirements / assistance / cross-document (A→T)
 */

import assert from "node:assert/strict";
import {
  analyzeDocumentV4,
  auditTaxFieldRequirementsRegistry,
  buildDocumentFactIndex,
  buildTaxAssistanceContext,
  buildTaxFieldAssistance,
  buildTaxFieldQuestions,
  checkFiscalKnowledgeSafety,
  checkTaxFieldAssistanceSafety,
  decideFieldApplicability,
  findCandidateFactsForRequirement,
  getPriorityTaxFieldRequirements,
  loadFrenchTaxFieldRequirementsRegistry,
  lookupTaxFieldRequirements,
  PRIORITY_TAX_FIELD_REQUIREMENTS,
  refuseUnsafeAggregation,
  resetCandidateIdsForTests,
  resetFrenchTaxFieldRequirementsCacheForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  runV4PreviewAnalysis,
  selectPriorityQuestions
} from "../lib/v4/index.ts";
import { REQUIREMENT_FIXTURES } from "../lib/v4/__fixtures__/fiscal/requirementFixtures.mjs";

function section(t) {
  console.log(`\n── ${t} ──`);
}

function analyze(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
  return analyzeDocumentV4({ text, fiscalKnowledge: true });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("=== test:v4-fiscal-requirements (V4-Q) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-Q");
  };

  try {
    resetFrenchTaxFieldRequirementsCacheForTests();
    const registry = loadFrenchTaxFieldRequirementsRegistry();

    section("Registry + audit");
    {
      assert.ok(PRIORITY_TAX_FIELD_REQUIREMENTS.length >= 7);
      const report = auditTaxFieldRequirementsRegistry(registry);
      assert.ok(report.ok, JSON.stringify(report));
      assert.equal(report.missingProvenance.length, 0);
      assert.equal(report.emptyRequirements.length, 0);
      assert.equal(report.unsupportedSupportingDocuments.length, 0);
      assert.equal(report.unsupportedConditions.length, 0);
      for (const code of ["1AJ", "1BJ", "4BA", "4BB", "4BC", "7DB", "7DR"]) {
        assert.ok(getPriorityTaxFieldRequirements(code), code);
      }
    }
    ok("registry-audit");

    section("A — case connue + aucune info utilisateur");
    {
      const r = analyze(REQUIREMENT_FIXTURES.knownFieldNoUserInfo);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "1AJ"
      );
      assert.ok(assist, "assistance 1AJ");
      assert.ok(assist.knowledge.plainLanguageWhat);
      assert.ok(assist.missingRequirements.length >= 1);
      assert.ok(
        ["missingInformation", "requiresVerification"].includes(
          assist.informationStatus
        )
      );
      assert.equal(assist.suggestedDeclaredAmount, null);
      assert.equal(assist.eligibilityDecision, null);
      assert.ok(
        assist.missingRequirements.every((m) =>
          /éléments analysés/i.test(m.statusLabel)
        )
      );
      assert.ok(!/vous n['’]avez pas/i.test(JSON.stringify(assist)));
      assert.ok(checkTaxFieldAssistanceSafety(assist).ok);
    }
    ok("A-no-info");

    section("B — information trouvée");
    {
      const r = analyze(REQUIREMENT_FIXTURES.knownFieldFound);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "1AJ"
      );
      assert.ok(assist);
      const amountReq = assist.evaluatedRequirements.find((e) =>
        e.requirementId.includes("amount")
      );
      assert.ok(amountReq);
      assert.equal(amountReq.status, "found");
      assert.ok(
        assist.documentFactsSummary.some((d) => /32450|32\s*450/.test(d.value))
      );
      assert.ok(checkFiscalKnowledgeSafety(r.fiscalKnowledge).ok);
    }
    ok("B-found");

    section("C — information ambiguë");
    {
      const r = analyze(REQUIREMENT_FIXTURES.ambiguousAmounts);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "1AJ"
      );
      assert.ok(assist);
      assert.ok(
        assist.informationStatus === "ambiguousInformation" ||
          assist.ambiguousRequirements.length >= 1 ||
          assist.evaluatedRequirements.some((e) => e.status === "ambiguous")
      );
      assert.equal(assist.suggestedDeclaredAmount, null);
    }
    ok("C-ambiguous");

    section("D — document justificatif candidat");
    {
      resetRequirementFactIdsForTests();
      const assist = buildTaxFieldAssistance({
        fieldCode: "7DB",
        documentRef: "2042-RICI",
        year: 2024,
        documents: [
          {
            id: "form",
            label: "2042-RICI",
            documentType: "incomeTaxReturn",
            year: 2024,
            text: REQUIREMENT_FIXTURES.multiSupportDocs.form,
            detectedFields: []
          },
          {
            id: "att",
            label: "Attestation fiscale",
            documentType: "taxCertificate",
            year: 2024,
            text: REQUIREMENT_FIXTURES.supportingAttestation
          }
        ]
      });
      const attReq = assist.evaluatedRequirements.find((e) =>
        e.requirementId.includes("attestation")
      );
      assert.ok(attReq);
      assert.ok(["found", "ambiguous"].includes(attReq.status));
      assert.ok(attReq.candidateFacts.length >= 1);
      assert.ok(attReq.evidenceLinks.every((l) => l.matchReason));
      assert.equal(assist.suggestedDeclaredAmount, null);
    }
    ok("D-supporting");

    section("E — plusieurs documents candidats");
    {
      resetRequirementFactIdsForTests();
      const assist = buildTaxFieldAssistance({
        fieldCode: "7DB",
        documentRef: "2042-RICI",
        year: 2024,
        documents: [
          {
            id: "form",
            label: "2042-RICI",
            documentType: "incomeTaxReturn",
            year: 2024,
            text: REQUIREMENT_FIXTURES.multiSupportDocs.form
          },
          {
            id: "a",
            label: "Attestation A",
            documentType: "taxCertificate",
            year: 2024,
            text: REQUIREMENT_FIXTURES.multiSupportDocs.attestationA
          },
          {
            id: "b",
            label: "Attestation B",
            documentType: "taxCertificate",
            year: 2024,
            text: REQUIREMENT_FIXTURES.multiSupportDocs.attestationB
          }
        ]
      });
      assert.ok(assist.candidateFacts.length >= 2);
      assert.equal(assist.suggestedDeclaredAmount, null);
      const amountish = assist.candidateFacts.filter((c) =>
        /\d/.test(String(c.displayValue || c.value || ""))
      );
      const refused = refuseUnsafeAggregation(amountish);
      assert.equal(refused.aggregatedValue, null);
      assert.ok(refused.refused);
    }
    ok("E-multi-docs");

    section("F — années différentes");
    {
      const lookup = lookupTaxFieldRequirements({
        documentRef: "2042",
        fieldCode: "1AJ",
        year: 2022
      });
      // année hors liste + yearStable → partial ou none, jamais silent exact
      assert.ok(lookup.matchKind !== "exact");
      const r = analyze(REQUIREMENT_FIXTURES.yearMismatch);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "1AJ"
      );
      if (assist) {
        assert.ok(["mismatch", "unknown", "partial", "stable"].includes(assist.yearMatch) || assist.yearMatch);
      }
    }
    ok("F-years");

    section("G — déclarant");
    {
      const pack = getPriorityTaxFieldRequirements("1AJ");
      const roleReq = pack.informationRequirements.find((r) =>
        r.id.includes("role")
      );
      assert.ok(roleReq);
      assert.ok(roleReq.questionTemplate.includes("déclarant 1"));
    }
    ok("G-declarant");

    section("H — mauvais type");
    {
      const r = analyze(REQUIREMENT_FIXTURES.wrongTypeNearAmount);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "7DB"
      );
      // Si détecté, ne doit pas inventer un montant
      if (assist) {
        assert.equal(assist.suggestedDeclaredAmount, null);
        const amountReq = assist.evaluatedRequirements.find((e) =>
          e.requirementId.includes("amount")
        );
        if (amountReq) {
          assert.notEqual(amountReq.aggregatedValue, 0);
          assert.equal(amountReq.aggregatedValue, null);
        }
      }
    }
    ok("H-wrong-type");

    section("I — requirement absent du Knowledge");
    {
      const lookup = lookupTaxFieldRequirements({
        fieldCode: "2TR",
        documentRef: "2042",
        year: 2024
      });
      assert.equal(lookup.entry, null);
      const r = analyze(REQUIREMENT_FIXTURES.fieldWithoutRequirements);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "2TR"
      );
      assert.ok(!assist);
    }
    ok("I-no-req");

    section("J — case inconnue");
    {
      const lookup = lookupTaxFieldRequirements({ fieldCode: "9ZZ" });
      assert.equal(lookup.entry, null);
      const r = analyze(REQUIREMENT_FIXTURES.unknownField);
      assert.ok(
        !(r.fiscalKnowledge.fieldAssistance || []).some(
          (a) => a.fieldCode === "9ZZ"
        )
      );
    }
    ok("J-unknown");

    section("K — aucune provenance (audit)");
    {
      const bad = {
        ...registry,
        entries: [
          {
            ...registry.entries[0],
            id: "bad-no-prov",
            provenance: [],
            informationRequirements: registry.entries[0].informationRequirements.map(
              (r) => ({ ...r, provenance: [] })
            )
          }
        ]
      };
      const report = auditTaxFieldRequirementsRegistry(bad);
      assert.ok(report.missingProvenance.length > 0);
      assert.equal(report.ok, false);
    }
    ok("K-no-provenance");

    section("L — condition générale");
    {
      const r = analyze(REQUIREMENT_FIXTURES.generalCondition7DB);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "7DB"
      );
      assert.ok(assist);
      assert.ok(assist.generalConditions.length >= 1);
      assert.ok(
        assist.generalConditions.every((c) => c.provenance?.length)
      );
      assert.ok(!/vous remplissez les conditions/i.test(JSON.stringify(assist)));
    }
    ok("L-conditions");

    section("M — question déterministe");
    {
      const pack = getPriorityTaxFieldRequirements("7DB");
      const evaluated = pack.informationRequirements.map((r) => ({
        requirementId: r.id,
        label: r.label,
        description: r.description,
        kind: r.kind,
        priority: r.priority,
        status: "missing",
        statusLabel: "Information non retrouvée dans les éléments analysés",
        candidateFacts: [],
        evidenceLinks: [],
        aggregatedValue: null,
        provenance: r.provenance
      }));
      const qs = buildTaxFieldQuestions(pack.informationRequirements, evaluated);
      assert.ok(qs.length >= 1);
      assert.ok(qs.every((q) => q.requirementId && q.question));
    }
    ok("M-questions");

    section("N — max 3 questions prioritaires");
    {
      const pack = getPriorityTaxFieldRequirements("1AJ");
      const evaluated = pack.informationRequirements.map((r) => ({
        requirementId: r.id,
        label: r.label,
        description: r.description,
        kind: r.kind,
        priority: r.priority,
        status: "missing",
        statusLabel: "missing",
        candidateFacts: [],
        evidenceLinks: [],
        aggregatedValue: null,
        provenance: r.provenance
      }));
      const qs = buildTaxFieldQuestions(pack.informationRequirements, evaluated);
      const top = selectPriorityQuestions(qs, 3);
      assert.ok(top.length <= 3);
      assert.ok(qs.length >= top.length);
    }
    ok("N-limit-3");

    section("O — facture non fiscale rejetée");
    {
      resetRequirementFactIdsForTests();
      const facts = buildDocumentFactIndex([
        {
          id: "inv",
          label: "Facture",
          documentType: "invoice",
          text: REQUIREMENT_FIXTURES.invoiceCandidate
        }
      ]);
      const pack = getPriorityTaxFieldRequirements("7DB");
      const amountReq = pack.informationRequirements.find((r) =>
        r.id.includes("amount")
      );
      const match = findCandidateFactsForRequirement(amountReq, facts);
      assert.equal(match.status, "missing");
    }
    ok("O-invoice");

    section("P — montant adjacent non pertinent");
    {
      const r = analyze(REQUIREMENT_FIXTURES.adjacentIrrelevant);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "1AJ"
      );
      if (assist) {
        const amountReq = assist.evaluatedRequirements.find((e) =>
          e.requirementId.includes("amount")
        );
        // 45 € frais de dossier ne doit pas devenir montant certain 1AJ
        if (amountReq?.status === "found") {
          assert.ok(
            !String(amountReq.candidateFacts[0]?.displayValue || "").includes(
              "45"
            )
          );
        }
        assert.equal(assist.suggestedDeclaredAmount, null);
      }
    }
    ok("P-adjacent");

    section("Q — agrégation refusée");
    {
      resetRequirementFactIdsForTests();
      const assist = buildTaxFieldAssistance({
        fieldCode: "7DB",
        documentRef: "2042-RICI",
        year: 2024,
        documents: [
          {
            id: "form",
            label: "2042-RICI",
            documentType: "incomeTaxReturn",
            year: 2024,
            text: REQUIREMENT_FIXTURES.multiAmountsNoAgg.form
          },
          ...REQUIREMENT_FIXTURES.multiAmountsNoAgg.docs
        ]
      });
      assert.equal(assist.suggestedDeclaredAmount, null);
      const nums = assist.candidateFacts
        .map((c) => String(c.displayValue || c.value || ""))
        .join(" ");
      assert.ok(!/2500/.test(nums.replace(/\s/g, "")));
      assert.ok(assist.invariants.automaticUnsafeAggregation === 0);
      assert.ok(
        assist.evaluatedRequirements.every((e) => e.aggregatedValue === null)
      );
    }
    ok("Q-no-agg");

    section("R — checkbox (hors requirements pack)");
    {
      const r = analyze(REQUIREMENT_FIXTURES.checkboxField);
      // 8UU n’a pas de requirements V4-Q — pas d’assistance forcée
      assert.ok(
        !(r.fiscalKnowledge.fieldAssistance || []).some(
          (a) => a.fieldCode === "8UU"
        )
      );
    }
    ok("R-checkbox");

    section("S — case vide");
    {
      const r = analyze(REQUIREMENT_FIXTURES.emptyCase);
      const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
        (a) => a.fieldCode === "4BA"
      );
      assert.ok(assist);
      assert.ok(assist.missingRequirements.length >= 1 || assist.informationStatus !== "sufficientForExplanation");
      assert.equal(assist.suggestedDeclaredAmount, null);
    }
    ok("S-empty");

    section("T — cross-document match");
    {
      resetRequirementFactIdsForTests();
      const assist = buildTaxFieldAssistance({
        fieldCode: "7DB",
        documentRef: "2042-RICI",
        year: 2024,
        documents: [
          {
            id: "form",
            label: "2042-RICI",
            documentType: "incomeTaxReturn",
            year: 2024,
            text: REQUIREMENT_FIXTURES.crossDocument.form
          },
          {
            id: "att",
            label: "Attestation fiscale",
            documentType: "taxCertificate",
            year: 2024,
            text: REQUIREMENT_FIXTURES.crossDocument.attestation
          }
        ]
      });
      assert.ok(
        assist.candidateFacts.some((c) => c.sourceDocumentId === "att")
      );
      assert.ok(
        assist.evaluatedRequirements.some((e) => e.evidenceLinks.length > 0)
      );
      assert.equal(assist.suggestedDeclaredAmount, null);
      const ctx = buildTaxAssistanceContext(assist);
      assert.ok(ctx.fieldRequirements);
      assert.ok(ctx.relevantDocumentFacts.length >= 1);
      assert.throws(() => decideFieldApplicability(ctx));
    }
    ok("T-cross");

    section("Exemples 1AJ / 7DB / 4BA");
    {
      for (const [code, text] of [
        ["1AJ", REQUIREMENT_FIXTURES.knownFieldFound],
        ["7DB", REQUIREMENT_FIXTURES.generalCondition7DB],
        ["4BA", REQUIREMENT_FIXTURES.case4BA]
      ]) {
        const r = analyze(text);
        const assist = (r.fiscalKnowledge.fieldAssistance || []).find(
          (a) => a.fieldCode === code
        );
        assert.ok(assist, code);
        assert.ok(assist.knowledge.plainLanguageWhat);
        assert.ok(assist.evaluatedRequirements.length >= 1);
        assert.equal(assist.suggestedDeclaredAmount, null);
      }
    }
    ok("examples");

    section("Preview wiring");
    {
      const preview = runV4PreviewAnalysis({
        pastedText: REQUIREMENT_FIXTURES.generalCondition7DB,
        resetIds: true
      });
      assert.ok(preview.ok, preview.message || "preview failed");
      const fiscal = preview.analysis.fiscal_document;
      assert.ok(fiscal);
      const fields = fiscal.tax_fields || [];
      const f7 = fields.find((f) => f.field_code === "7DB");
      assert.ok(f7);
      assert.ok(
        Array.isArray(f7.missing_requirements) ||
          Array.isArray(f7.supporting_documents)
      );
      assert.ok(f7.understand_cta_label);
    }
    ok("preview");

    section("Safety + runtime");
    {
      assert.equal(fetchCalls, 0);
      assert.throws(() =>
        decideFieldApplicability({
          fieldKnowledge: null,
          fieldRequirements: null,
          relevantDocumentFacts: [],
          missingRequirements: [],
          ambiguities: [],
          userAnswers: [],
          provenance: [],
          informationStatus: "missingInformation",
          questions: []
        })
      );
    }
    ok("safety-runtime");

    console.log(`\n=== V4-Q OK — ${passed} checks ===`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
