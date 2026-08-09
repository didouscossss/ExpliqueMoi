/**
 * V4-AA — extraction locale photo/PDF (tests ciblés A–G)
 */

import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  extractDocumentLocally,
  extractThenAnalyzeLocally,
  resetCandidateIdsForTests,
  resetDocumentInputIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetRelationIdsForTests,
  runGenericDocumentAnalysis
} from "../lib/v4/index.ts";
import { RENEWAL_NOTICE_FULL } from "../lib/v4/__fixtures__/generic/renewalNoticeFixtures.mjs";

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

/** Texte ASCII (Helvetica) — marqueurs V4-Y conservés. */
const RENEWAL_PDF_TEXT = `
AVIS DE RENOUVELLEMENT

Organisme : Exemple Assurances
Reference contrat : AB-458921
Date du document : 12/03/2026
Montant : 486,50 EUR
Date limite : 15/04/2026

Votre contrat arrive a echeance.
Le montant indique pour la prochaine periode est de 486,50 EUR.
Pour toute question, utilisez la reference AB-458921.
`.trim();

async function makeTextPdf(text) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of String(text).split("\n")) {
    // Helvetica WinAnsi — éviter accents / € non supportés
    const t = (line.trim() || " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/€/g, "EUR")
      .replace(/[^\x20-\x7E]/g, "?");
    page.drawText(t.slice(0, 90), { x: 40, y, size: 11, font });
    y -= 16;
    if (y < 40) break;
  }
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

async function makeBlankPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

async function main() {
  console.log("=== test:v4-local-extraction (V4-AA) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-AA");
  };

  try {
    section("A — texte existant → V4-Z inchangé");
    {
      reset();
      const r = runGenericDocumentAnalysis(RENEWAL_NOTICE_FULL.text, {
        resetIds: true
      });
      assert.equal(r.status, "ready");
      assert.ok(r.understanding?.facts.length >= 5);

      const ex = await extractDocumentLocally({
        sourceType: "text",
        text: RENEWAL_NOTICE_FULL.text
      });
      assert.equal(ex.status, "extracted");
      assert.equal(ex.method, "direct-text");
      ok("A-text-passthrough");
    }

    section("B — PDF texte → extraction → DocumentInput ready");
    {
      reset();
      const bytes = await makeTextPdf(RENEWAL_PDF_TEXT);
      const pipe = await extractThenAnalyzeLocally(
        {
          sourceType: "pdf",
          mimeType: "application/pdf",
          filename: "avis-renouvellement.pdf",
          bytes
        },
        { resetIds: true }
      );
      assert.equal(pipe.extraction.status, "extracted");
      assert.equal(pipe.extraction.method, "local-pdf-text");
      assert.ok(pipe.extraction.text && pipe.extraction.text.length > 20);
      assert.ok(
        /Exemple Assurances|AB-458921|486/i.test(pipe.extraction.text)
      );
      assert.ok(Array.isArray(pipe.extraction.pages));
      assert.ok(pipe.extraction.pages.length >= 1);
      assert.equal(pipe.analysis.status, "ready");
      assert.ok(pipe.analysis.understanding);
      assert.equal(pipe.analysis.understanding.documentType, "renewalNotice");
      assert.ok(pipe.analysis.understanding.facts.some((f) => f.kind === "reference"));
      // Provenance méthode
      assert.equal(pipe.analysis.input.extraction.method, "direct-text");
      ok("B-pdf-text");
    }

    section("C — image sans extracteur → needsExtraction");
    {
      reset();
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "image",
        mimeType: "image/jpeg",
        filename: "photo.jpg"
      });
      assert.equal(pipe.extraction.status, "needsExtraction");
      assert.equal(pipe.extraction.method, "none");
      assert.equal(pipe.extraction.text, null);
      assert.equal(pipe.analysis.status, "needsExtraction");
      assert.equal(pipe.analysis.understanding, null);
      ok("C-image");
    }

    section("D — PDF scanné (sans couche texte) → needsExtraction");
    {
      reset();
      const bytes = await makeBlankPdf();
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "pdf",
        mimeType: "application/pdf",
        filename: "scan.pdf",
        bytes
      });
      assert.equal(pipe.extraction.status, "needsExtraction");
      assert.equal(pipe.extraction.text, null);
      assert.equal(pipe.analysis.understanding, null);
      assert.ok(
        pipe.analysis.status === "needsExtraction" ||
          pipe.analysis.status === "empty" ||
          pipe.analysis.status === "unsupportedInput"
      );
      ok("D-scanned-pdf");
    }

    section("E — extraction vide → aucun fait inventé");
    {
      reset();
      const ex = await extractDocumentLocally({
        sourceType: "text",
        text: "   "
      });
      assert.equal(ex.status, "empty");
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "text",
        text: ""
      });
      assert.equal(pipe.analysis.understanding, null);
      ok("E-empty");
    }

    section("F — filename date/montant ≠ contenu");
    {
      reset();
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "pdf",
        filename: "avis-486,50€-15-04-2026.pdf",
        mimeType: "application/pdf"
        // pas de bytes
      });
      assert.equal(pipe.extraction.text, null);
      assert.equal(pipe.analysis.understanding, null);
      assert.ok(
        !pipe.extraction.text ||
          !/486/.test(pipe.extraction.text)
      );
      ok("F-filename");
    }

    section("G — fetch / LLM / cloud OCR = 0");
    {
      reset();
      const bytes = await makeTextPdf("Organisme : Test\nMontant : 10,00 €");
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "pdf",
        bytes,
        filename: "x.pdf"
      });
      assert.equal(pipe.fetchCount, 0);
      assert.equal(pipe.llmCount, 0);
      assert.equal(pipe.cloudOcrCount, 0);
      assert.equal(fetchCalls, 0);
      ok("G-no-network");
    }

    assert.equal(fetchCalls, 0);
    console.log(
      `\n✅ V4-AA OK — ${passed} assertions — fetch=${fetchCalls} LLM=0 cloudOCR=0`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
