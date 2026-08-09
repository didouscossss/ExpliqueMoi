/**
 * V4-AC — OCR local Tesseract (tests ciblés)
 */

import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import {
  extractDocumentLocally,
  extractThenAnalyzeLocally,
  getLocalOcrPaths,
  resetCandidateIdsForTests,
  resetDocumentInputIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetRelationIdsForTests
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
  const lines = [
    "AVIS DE RENOUVELLEMENT",
    "Organisme : Exemple Assurances",
    "Reference contrat : AB-458921",
    "Date du document : 12/03/2026",
    "Montant : 486,50 EUR",
    "Date limite : 15/04/2026"
  ];
  let y = 70;
  for (const line of lines) {
    ctx.fillText(line, 48, y);
    y += 70;
  }
  return canvas.toBuffer("image/png");
}

/** PDF 1 page = image embarquée, sans couche texte sélectionnable. */
async function makeScannedPdfFromPng(pngBytes) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

async function makeTextPdf() {
  // Réutilise le chemin PDF texte (Helvetica ASCII)
  const { PDFDocument: PD, StandardFonts } = await import("pdf-lib");
  const pdf = await PD.create();
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
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

async function main() {
  console.log("=== test:v4-local-ocr (V4-AC) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const fetchUrls = [];
  globalThis.fetch = async (url, ...rest) => {
    fetchCalls += 1;
    fetchUrls.push(String(url));
    throw new Error("fetch interdit V4-AC: " + url);
  };

  try {
    section("assets locaux présents");
    {
      const paths = getLocalOcrPaths();
      assert.equal(paths.ready, true, paths.missing.join(","));
      ok("assets-ready");
    }

    section("A — image FR synthétique → OCR → V4-Y");
    {
      reset();
      const png = makeFrenchDocPng();
      const pipe = await extractThenAnalyzeLocally(
        {
          sourceType: "image",
          mimeType: "image/png",
          filename: "avis.png",
          bytes: png
        },
        { resetIds: true }
      );
      assert.equal(pipe.extraction.status, "extracted");
      assert.equal(pipe.extraction.method, "local-ocr");
      assert.ok(pipe.extraction.text);
      assert.ok(/AVIS DE RENOUVELLEMENT/i.test(pipe.extraction.text));
      assert.ok(/Exemple Assurances/i.test(pipe.extraction.text));
      assert.equal(pipe.analysis.status, "ready");
      assert.ok(pipe.analysis.understanding);
      assert.equal(pipe.analysis.understanding.documentType, "renewalNotice");
      assert.ok(
        pipe.analysis.understanding.facts.some((f) => f.kind === "reference")
      );
      assert.equal(pipe.cloudOcrCount, 0);
      assert.equal(pipe.fetchCount, 0);
      ok("A-image-ocr");
    }

    section("B — PDF scanné 1 page → rendu → OCR → V4-Y");
    {
      reset();
      const png = makeFrenchDocPng();
      const bytes = await makeScannedPdfFromPng(png);
      const pipe = await extractThenAnalyzeLocally(
        {
          sourceType: "pdf",
          mimeType: "application/pdf",
          filename: "scan.pdf",
          bytes
        },
        { resetIds: true }
      );
      assert.equal(pipe.extraction.status, "extracted");
      assert.equal(pipe.extraction.method, "local-ocr");
      assert.ok(/AB-458921|486/i.test(pipe.extraction.text || ""));
      assert.equal(pipe.analysis.status, "ready");
      assert.ok(pipe.analysis.understanding?.facts.length >= 2);
      ok("B-scanned-pdf-ocr");
    }

    section("C — OCR illisible → needsExtraction");
    {
      reset();
      // Image quasi blanche — pas de texte inventé
      const canvas = createCanvas(200, 200);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 200, 200);
      const pipe = await extractThenAnalyzeLocally({
        sourceType: "image",
        mimeType: "image/png",
        bytes: canvas.toBuffer("image/png")
      });
      assert.equal(pipe.extraction.status, "needsExtraction");
      assert.equal(pipe.extraction.text, null);
      assert.equal(pipe.analysis.understanding, null);
      assert.ok(pipe.extraction.error);
      ok("C-unreadable");
    }

    section("D — PDF texte → chemin inchangé (pas OCR)");
    {
      reset();
      const bytes = await makeTextPdf();
      const ex = await extractDocumentLocally({
        sourceType: "pdf",
        mimeType: "application/pdf",
        bytes
      });
      assert.equal(ex.status, "extracted");
      assert.equal(ex.method, "local-pdf-text");
      assert.ok(/Exemple Assurances/i.test(ex.text || ""));
      ok("D-pdf-text-unchanged");
    }

    section("E — aucun asset OCR depuis Internet");
    {
      assert.equal(fetchCalls, 0, fetchUrls.join(" | "));
      assert.equal(
        fetchUrls.filter((u) => /cdn|jsdelivr|tessdata|unpkg/i.test(u)).length,
        0
      );
      ok("E-no-cdn");
    }

    console.log(
      `\n✅ V4-AC OK — ${passed} assertions — fetch=${fetchCalls} LLM=0 cloudOCR=0`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
