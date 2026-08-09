/**
 * V4-AE — régression contrat Preview ↔ /api/analyze (facade Vercel)
 *
 * Reproduit le chemin réel :
 * api/analyze.js → lib/v4PreviewAnalysis.js → runV4PreviewAnalysisAsync
 * → payload { ok, analysis, warnings } consommable par index.html
 */

import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  runV4PreviewAnalysisAsync,
  isV4EngineEnabled
} from "../lib/v4PreviewAnalysis.js";

function section(t) {
  console.log(`\n── ${t} ──`);
}
let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Mimique succeed() de api/analyze.js */
function succeed(analysis, warnings = [], pdfProcessing = null) {
  const payload = {
    ok: true,
    analysis,
    warnings: Array.isArray(warnings) ? warnings : []
  };
  if (pdfProcessing) payload.pdfProcessing = pdfProcessing;
  return payload;
}

/** Contrat minimal consommé par index.html (response.json + ok/analysis). */
function assertPreviewConsumable(payload, label) {
  let json;
  try {
    json = JSON.stringify(payload);
  } catch (e) {
    assert.fail(`${label}: JSON.stringify impossible — ${e.message}`);
  }
  assert.ok(json.length > 2, `${label}: JSON vide`);
  const data = JSON.parse(json);
  assert.equal(data.ok, true, `${label}: ok !== true`);
  assert.ok(data.analysis && typeof data.analysis === "object", `${label}: analysis manquant`);
  assert.ok(
    typeof data.analysis.document_type === "string" ||
      typeof data.analysis.plain_summary === "string" ||
      data.analysis.generic_understanding,
    `${label}: analysis sans champs Preview`
  );
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
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function main() {
  console.log("=== test:v4-preview-analyze-contract (V4-AE) ===");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    throw new Error("fetch interdit V4-AE: " + url);
  };

  // Gate flag (env)
  const prev = process.env.USE_V4_ENGINE;
  process.env.USE_V4_ENGINE = "true";
  assert.equal(isV4EngineEnabled({}), true);
  ok("flag-on");

  try {
    section("A — image avec texte");
    {
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
      const payload = succeed(
        { ...run.analysis, engine: "v4" },
        run.warnings,
        run.pdfProcessing
      );
      assertPreviewConsumable(payload, "A");
      assert.ok(payload.analysis.generic_understanding);
      ok("A-image");
    }

    section("B — PDF scanné 1 page");
    {
      const bytes = await makeScannedPdf(makeFrenchDocPng());
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
      assertPreviewConsumable(
        succeed({ ...run.analysis, engine: "v4" }, run.warnings, run.pdfProcessing),
        "B"
      );
      ok("B-scanned-pdf");
    }

    section("C — PDF couche texte");
    {
      const bytes = await makeTextPdf();
      const text = `AVIS DE RENOUVELLEMENT
Organisme : Exemple Assurances
Reference contrat : AB-458921
Montant : 486,50 EUR
Date limite : 15/04/2026`;
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
            pdfFullText: text,
            pdfPageTexts: [{ pageNumber: 1, text }]
          }
        ]
      });
      assert.equal(run.ok, true);
      const notes = (run.pdfProcessing?.diagnostics || []).map((d) => d.note);
      assert.ok(!notes.includes("local_ocr_text"), "PDF texte ne doit pas passer par OCR");
      assertPreviewConsumable(
        succeed({ ...run.analysis, engine: "v4" }, run.warnings, run.pdfProcessing),
        "C"
      );
      ok("C-pdf-text");
    }

    section("D — document texte existant (paste)");
    {
      const run = await runV4PreviewAnalysisAsync({
        resetIds: true,
        pastedText: `AVIS DE RENOUVELLEMENT
Organisme : Exemple Assurances
Reference contrat : AB-458921
Montant : 486,50 EUR
Date limite : 15/04/2026`
      });
      assert.equal(run.ok, true);
      assertPreviewConsumable(
        succeed({ ...run.analysis, engine: "v4" }, run.warnings, run.pdfProcessing),
        "D"
      );
      ok("D-text");
    }

    section("E — échec OCR propre (pas de JSON malformé)");
    {
      const canvas = createCanvas(120, 120);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 120, 120);
      const run = await runV4PreviewAnalysisAsync({
        resetIds: true,
        pages: [
          {
            name: "blank.png",
            mimeType: "image/png",
            order: 0,
            base64: canvas.toBuffer("image/png").toString("base64")
          }
        ]
      });
      // Succès honnête possible (unknown) OU ok — mais toujours JSON sérialisable
      assert.equal(typeof run.ok, "boolean");
      if (run.ok) {
        assertPreviewConsumable(
          succeed({ ...run.analysis, engine: "v4" }, run.warnings, run.pdfProcessing),
          "E"
        );
      } else {
        const failPayload = {
          ok: false,
          error: {
            code: "NO_USABLE_CONTENT",
            message: run.message || "Aucun contenu exploitable."
          }
        };
        const s = JSON.stringify(failPayload);
        assert.ok(JSON.parse(s).ok === false);
      }
      ok("E-ocr-fail-readable");
    }

    // Garantie : export manquant = la cause historique du bug
    assert.equal(typeof runV4PreviewAnalysisAsync, "function");
    ok("facade-exports-async");

    assert.equal(fetchCalls, 0);
    console.log(
      `\n✅ V4-AE OK — ${passed} assertions — fetch=${fetchCalls} LLM=0 cloudOCR=0`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prev === undefined) delete process.env.USE_V4_ENGINE;
    else process.env.USE_V4_ENGINE = prev;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
