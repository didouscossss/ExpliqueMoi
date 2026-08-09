/**
 * V4-AD — Preview branché sur OCR local (tests ciblés uniquement)
 */

import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  runV4PreviewAnalysisAsync,
  resetCandidateIdsForTests,
  resetDocumentInputIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests
} from "../lib/v4/index.ts";

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
  resetGenericFactIdsForTests();
  resetGenericExplanationIdsForTests();
  resetGenericClarificationIdsForTests();
  resetDocumentInputIdsForTests();
}

function makeFrenchDocPng() {
  const canvas = createCanvas(1000, 560);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1000, 560);
  ctx.fillStyle = "#000000";
  ctx.font = "34px DejaVu Sans, sans-serif";
  let y = 70;
  for (const line of [
    "AVIS DE RENOUVELLEMENT",
    "Organisme : Exemple Assurances",
    "Reference contrat : AB-458921",
    "Date du document : 12/03/2026",
    "Montant : 486,50 EUR",
    "Date limite : 15/04/2026"
  ]) {
    ctx.fillText(line, 48, y);
    y += 70;
  }
  return canvas.toBuffer("image/png");
}

async function makeScannedPdf(pngBytes) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function makeTextPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("AVIS DE RENOUVELLEMENT", { x: 40, y: 780, size: 14, font });
  page.drawText("Organisme : Exemple Assurances", {
    x: 40,
    y: 750,
    size: 12,
    font
  });
  page.drawText("Reference contrat : AB-458921", {
    x: 40,
    y: 720,
    size: 12,
    font
  });
  page.drawText("Montant : 486,50 EUR", { x: 40, y: 690, size: 12, font });
  page.drawText("Date limite : 15/04/2026", { x: 40, y: 660, size: 12, font });
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return bytes;
}

async function main() {
  console.log("=== test:v4-preview-ocr (V4-AD) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-AD: " + url);
  };

  try {
    section("1 — Preview image → OCR → V4-Y");
    {
      reset();
      const png = makeFrenchDocPng();
      const run = await runV4PreviewAnalysisAsync({
        resetIds: true,
        pages: [
          {
            name: "avis.png",
            mimeType: "image/png",
            order: 0,
            base64: png.toString("base64")
          }
        ]
      });
      assert.equal(run.ok, true);
      assert.ok(run.analysis.generic_understanding);
      assert.equal(
        run.analysis.generic_understanding.document_type,
        "renewalNotice"
      );
      assert.ok(
        run.analysis.generic_understanding.a_retenir?.some((x) =>
          /486|AB-458921/i.test(x)
        )
      );
      const diag = run.pdfProcessing.diagnostics || [];
      assert.ok(
        diag.some(
          (d) =>
            d.note === "local_ocr_text" ||
            d.step === "generic_understanding"
        )
      );
      ok("image-preview");
    }

    section("2 — Preview PDF scanné 1 page → OCR → V4-Y");
    {
      reset();
      const png = makeFrenchDocPng();
      const bytes = await makeScannedPdf(png);
      const run = await runV4PreviewAnalysisAsync({
        resetIds: true,
        pages: [
          {
            name: "scan.pdf",
            mimeType: "application/pdf",
            order: 0,
            bytes,
            base64: bytes.toString("base64"),
            pdfHasText: false,
            pdfScanned: true,
            pdfPageCount: 1,
            pdfFullText: "",
            pdfPageTexts: []
          }
        ]
      });
      assert.equal(run.ok, true);
      assert.ok(run.analysis.generic_understanding);
      assert.equal(
        run.analysis.generic_understanding.document_type,
        "renewalNotice"
      );
      ok("scanned-pdf-preview");
    }

    section("3 — non-régression PDF texte (pas OCR)");
    {
      reset();
      const bytes = await makeTextPdf();
      const run = await runV4PreviewAnalysisAsync({
        resetIds: true,
        pages: [
          {
            name: "texte.pdf",
            mimeType: "application/pdf",
            order: 0,
            bytes,
            pdfHasText: true,
            pdfScanned: false,
            pdfPageCount: 1,
            pdfFullText: `
AVIS DE RENOUVELLEMENT
Organisme : Exemple Assurances
Reference contrat : AB-458921
Montant : 486,50 EUR
Date limite : 15/04/2026
`.trim(),
            pdfPageTexts: [
              {
                pageNumber: 1,
                text: `AVIS DE RENOUVELLEMENT
Organisme : Exemple Assurances
Reference contrat : AB-458921
Montant : 486,50 EUR
Date limite : 15/04/2026`
              }
            ]
          }
        ]
      });
      assert.equal(run.ok, true);
      // Chemin pdfjs (pas ocr) pour couche texte
      const notes = (run.pdfProcessing.diagnostics || []).map((d) => d.note);
      assert.ok(!notes.includes("local_ocr_text"));
      assert.ok(run.adapted.source === "pdfjs" || run.adapted.blocks.length > 0);
      assert.ok(run.analysis.generic_understanding);
      assert.equal(
        run.analysis.generic_understanding.document_type,
        "renewalNotice"
      );
      ok("pdf-text-no-ocr");
    }

    assert.equal(fetchCalls, 0);
    console.log(
      `\n✅ V4-AD OK — ${passed} assertions — fetch=${fetchCalls} LLM=0 cloudOCR=0`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
