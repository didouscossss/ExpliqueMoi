/**
 * V4-Z — contrat d’entrée documentaire local (avant OCR/vision)
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeGenericDocument,
  normalizeDocumentInput,
  prepareDocumentInput,
  resetDocumentInputIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  runGenericDocumentAnalysis
} from "../lib/v4/index.ts";
import { RENEWAL_NOTICE_FULL } from "../lib/v4/__fixtures__/generic/renewalNoticeFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCIN_DIR = join(HERE, "../lib/v4/documentInput");

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
  resetGenericFactIdsForTests();
  resetGenericExplanationIdsForTests();
  resetGenericClarificationIdsForTests();
  resetDocumentInputIdsForTests();
}

function main() {
  console.log("=== test:v4-document-input (V4-Z) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-Z");
  };

  try {
    section("A — texte valide → V4-Y");
    {
      reset();
      const r = runGenericDocumentAnalysis(RENEWAL_NOTICE_FULL.text, {
        resetIds: true
      });
      assert.equal(r.status, "ready");
      assert.ok(r.understanding);
      assert.equal(r.understanding.documentType, "renewalNotice");
      assert.ok(r.understanding.facts.length >= 5);
      assert.ok(
        r.understanding.explanations.some((e) => e.importance === "primary")
      );
      assert.equal(r.input.sourceType, "text");
      assert.equal(r.input.extraction.method, "direct-text");
      assert.ok(r.input.text && r.input.text.includes("Exemple Assurances"));
      ok("A-text-to-v4y");
    }

    section("B — texte vide → aucun fait inventé");
    {
      reset();
      const r = runGenericDocumentAnalysis({ sourceType: "text", text: "" });
      assert.equal(r.status, "empty");
      assert.equal(r.understanding, null);
      const r2 = runGenericDocumentAnalysis("   \n  ");
      assert.equal(r2.status, "empty");
      assert.equal(r2.understanding, null);
      ok("B-empty-text");
    }

    section("C — image sans OCR → needsExtraction");
    {
      reset();
      const r = runGenericDocumentAnalysis({
        sourceType: "image",
        mimeType: "image/jpeg",
        filename: "photo.jpg"
      });
      assert.equal(r.status, "needsExtraction");
      assert.equal(r.understanding, null);
      assert.equal(r.input.text, null);
      assert.equal(r.input.extraction.method, "none");
      assert.ok(/image/i.test(r.input.extraction.note || r.reason));
      ok("C-image-needs-extraction");
    }

    section("D — PDF sans extraction → needsExtraction");
    {
      reset();
      const r = runGenericDocumentAnalysis({
        sourceType: "pdf",
        mimeType: "application/pdf",
        filename: "scan.pdf"
      });
      assert.equal(r.status, "needsExtraction");
      assert.equal(r.understanding, null);
      assert.equal(r.input.text, null);
      ok("D-pdf-needs-extraction");
    }

    section("E — filename montant/date ≠ faits");
    {
      reset();
      const r = runGenericDocumentAnalysis({
        sourceType: "pdf",
        filename: "avis-486,50€-15-04-2026.pdf",
        mimeType: "application/pdf"
      });
      assert.equal(r.status, "needsExtraction");
      assert.equal(r.understanding, null);
      // Même si on forçait une analyse sur filename — prepare ne le met pas dans text
      const prepared = prepareDocumentInput({
        sourceType: "image",
        filename: "facture-1200€-01-01-2026.png"
      });
      assert.ok(
        prepared.input.text == null || !String(prepared.input.text).includes("1200")
      );
      assert.notEqual(prepared.input.text, prepared.input.filename);
      // Contrôle : filename seul ne passe jamais en ready
      assert.equal(prepared.readyForAnalysis, false);
      assert.equal(r.inputSafety.filenameUsedAsContent, 0);
      ok("E-filename-not-content");
    }

    section("F — contenu ambigu → unknown / needsInformation");
    {
      reset();
      const r = runGenericDocumentAnalysis({
        sourceType: "text",
        text: "Document\n486,50 €"
      });
      assert.equal(r.status, "ready");
      assert.ok(r.understanding);
      assert.equal(r.understanding.documentType, "unknown");
      const amounts = r.understanding.facts.filter((f) => f.kind === "amount");
      assert.ok(amounts.length >= 1);
      assert.ok(amounts.every((a) => a.roleAmbiguous || !a.structuralRole));
      assert.ok(
        r.understanding.explanations.some(
          (e) =>
            e.status === "needsInformation" ||
            /trouvé/i.test(e.summary + e.details.join(" "))
        )
      );
      ok("F-ambiguous");
    }

    section("G — non-régression V4-Y (analyzeGenericDocument)");
    {
      reset();
      const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
      assert.equal(u.documentType, "renewalNotice");
      assert.ok(u.facts.some((f) => f.kind === "reference"));
      assert.ok(u.explanations.some((e) => e.domain === "administrative"));

      const viaGate = runGenericDocumentAnalysis({
        id: "gdoc-renewal-1",
        sourceType: "text",
        text: RENEWAL_NOTICE_FULL.text,
        filename: RENEWAL_NOTICE_FULL.fileName
      });
      assert.equal(viaGate.status, "ready");
      assert.equal(viaGate.understanding.documentType, "renewalNotice");
      ok("G-v4y-regression");
    }

    section("Safety + architecture");
    {
      reset();
      const img = runGenericDocumentAnalysis({
        sourceType: "image",
        filename: "x.jpg"
      });
      assert.equal(img.inputSafety.inventedImageText, 0);
      assert.equal(img.inputSafety.filenameUsedAsContent, 0);
      assert.equal(img.inputSafety.unsupportedPromotedToReady, 0);
      assert.equal(img.fetchCount, 0);
      assert.equal(img.llmCount, 0);

      // PDF + texte déjà fourni (extraction future pré-faite) → ready OK
      const pdfWithText = runGenericDocumentAnalysis({
        sourceType: "pdf",
        text: RENEWAL_NOTICE_FULL.text,
        filename: "doc.pdf"
      });
      assert.equal(pdfWithText.status, "ready");
      assert.ok(pdfWithText.understanding);

      const norm = normalizeDocumentInput("hello");
      assert.equal(norm.sourceType, "text");
      assert.equal(norm.extraction.status, "ready");

      for (const name of readdirSync(DOCIN_DIR)) {
        if (!name.endsWith(".ts")) continue;
        const src = readFileSync(join(DOCIN_DIR, name), "utf8");
        assert.ok(
          !/from\s+["'][^"']*fr\/tax[^"']*["']/.test(src),
          `${name} ne doit pas importer fr/tax`
        );
      }
      ok("safety-arch");
    }

    assert.equal(fetchCalls, 0);
    console.log(`\n✅ V4-Z OK — ${passed} assertions — fetch=${fetchCalls} LLM=0`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
