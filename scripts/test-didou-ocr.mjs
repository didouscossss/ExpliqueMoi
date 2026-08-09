#!/usr/bin/env node
/**
 * Tests OCR local Didou — 0 Gemini / 0 OpenAI / 0 CDN.
 */
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  preparePagesWithLocalOcr,
  ocrImageLocally,
  getLocalOcrPaths,
  MAX_OCR_PAGES
} from "../lib/didou/ocr/index.js";
import { analyzeDocumentWithDidouAsync } from "../lib/didou/index.js";

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  throw new Error("fetch interdit OCR/Didou: " + url);
};

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}
function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

function makeFrenchDocPng(lines) {
  const canvas = createCanvas(1000, 560);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1000, 560);
  ctx.fillStyle = "#000000";
  ctx.font = "34px DejaVu Sans, sans-serif";
  let y = 70;
  for (const line of lines) {
    ctx.fillText(line, 48, y);
    y += 70;
  }
  return canvas.toBuffer("image/png");
}

async function makeTextPdf(text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = String(text).split("\n");
  let y = 780;
  for (const line of lines) {
    page.drawText(line.slice(0, 90), { x: 40, y, size: 12, font });
    y -= 18;
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function makeScannedPdfFromPng(pngBytes, pageCount = 1) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  for (let i = 0; i < pageCount; i += 1) {
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

const QUITTANCE_LINES = [
  "QUITTANCE DE LOYER",
  "Bailleur : SCI Les Lilas",
  "Locataire : Camille Dupont",
  "Periode : juillet 2026",
  "Montant : 370,97 EUR"
];

try {
  // 0 — assets locaux
  {
    const paths = getLocalOcrPaths();
    assert.equal(paths.ready, true, `assets missing: ${paths.missing}`);
    pass("ASSETS", "tesseract core+fra locaux");
  }

  // A — PDF texte : pas d’OCR
  {
    const bytes = await makeTextPdf(`FACTURE Free
Total TTC : 14,99 EUR
Date limite : 20/04/2026`);
    const pages = [
      {
        name: "facture.pdf",
        mimeType: "application/pdf",
        order: 0,
        bytes,
        base64: bytes.toString("base64"),
        pdfHasText: true,
        pdfScanned: false,
        pdfPageCount: 1,
        pdfFullText: `FACTURE Free\nTotal TTC : 14,99 EUR\nDate limite : 20/04/2026`,
        pdfPageTexts: [
          {
            pageNumber: 1,
            text: `FACTURE Free\nTotal TTC : 14,99 EUR\nDate limite : 20/04/2026`
          }
        ]
      }
    ];
    const prepared = await preparePagesWithLocalOcr(pages);
    assert.equal(prepared.pages[0].localExtraction?.method, "local-pdf-text");
    assert.ok(
      prepared.diagnostics.some((d) => d.ocrSkipped === true),
      "OCR aurait dû être sauté"
    );
    pass("PDF_TEXT", "couche texte conservée, OCR skip");
  }

  // B — PDF scanné 1 page → OCR
  {
    const png = makeFrenchDocPng(QUITTANCE_LINES);
    const bytes = await makeScannedPdfFromPng(png, 1);
    const pages = [
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
    ];
    const prepared = await preparePagesWithLocalOcr(pages);
    assert.equal(prepared.pages[0].localExtraction?.method, "local-ocr");
    assert.ok(prepared.pages[0].ocrText || prepared.pages[0].pdfFullText);
    const text = String(
      prepared.pages[0].ocrText || prepared.pages[0].pdfFullText || ""
    );
    assert.match(text, /quittance|loyer|370/i);
    pass("PDF_SCAN", `chars=${text.replace(/\s+/g, "").length}`);
  }

  // C — Photo / image → OCR
  {
    const png = makeFrenchDocPng(QUITTANCE_LINES);
    const ocr = await ocrImageLocally(png);
    assert.equal(ocr.ok, true);
    assert.equal(ocr.fetchCount, 0);
    assert.match(ocr.text || "", /quittance|loyer|370/i);

    const prepared = await preparePagesWithLocalOcr([
      {
        name: "photo.png",
        mimeType: "image/png",
        order: 0,
        base64: png.toString("base64")
      }
    ]);
    assert.equal(prepared.pages[0].localExtraction?.method, "local-ocr");
    assert.ok(prepared.pages[0].ocrText);
    pass("IMAGE", `conf=${ocr.confidence}`);
  }

  // D — Multipage scanné
  {
    const png = makeFrenchDocPng([
      "CONVOCATION ASSEMBLEE GENERALE",
      "Copropriete Les Pins",
      "Date : 12/09/2026",
      "Heure : 18h30",
      "Syndic Habitat Plus"
    ]);
    const bytes = await makeScannedPdfFromPng(png, 2);
    const prepared = await preparePagesWithLocalOcr([
      {
        name: "ag.pdf",
        mimeType: "application/pdf",
        order: 0,
        bytes,
        base64: bytes.toString("base64"),
        pdfHasText: false,
        pdfScanned: true,
        pdfPageCount: 2,
        pdfFullText: "",
        pdfPageTexts: []
      }
    ]);
    const pageTexts = prepared.pages[0].pdfPageTexts || [];
    assert.ok(pageTexts.length >= 1, "au moins 1 page OCR");
    assert.ok(
      pageTexts.every((p) => Number(p.pageNumber) >= 1),
      "numéros de page présents"
    );
    assert.ok(pageTexts.length <= MAX_OCR_PAGES);
    pass("MULTIPAGE", `ocrPages=${pageTexts.length}`);
  }

  // E — OCR vide / faible
  {
    const blank = createCanvas(120, 120);
    const ctx = blank.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 120, 120);
    const ocr = await ocrImageLocally(blank.toBuffer("image/png"));
    assert.equal(ocr.ok, false);
    assert.ok(
      /insufficient|low_confidence|failed/i.test(ocr.error || "") ||
        ocr.text == null
    );

    const prepared = await preparePagesWithLocalOcr([
      {
        name: "blank.png",
        mimeType: "image/png",
        order: 0,
        base64: blank.toBuffer("image/png").toString("base64")
      }
    ]);
    assert.equal(prepared.pages[0].localExtraction?.status, "needsExtraction");
    pass("OCR_WEAK", ocr.error || "needsExtraction");
  }

  // F — Didou après OCR (quittance image)
  {
    const png = makeFrenchDocPng(QUITTANCE_LINES);
    const run = await analyzeDocumentWithDidouAsync({
      pages: [
        {
          name: "quittance.png",
          mimeType: "image/png",
          order: 0,
          base64: png.toString("base64")
        }
      ]
    });
    assert.equal(run.engine, "didou");
    assert.equal(run.didou.family, "logement");
    assert.match(String(run.didou.documentType || ""), /quittance/i);
    assert.ok(run.didou.mainAmount?.value || run.didou.mainDate?.date);
    assert.ok(
      (run.didou.meta?.extractionMethods || []).includes("local-ocr")
    );
    pass(
      "DIDOU_AFTER_OCR",
      `${run.didou.documentType} | ${run.didou.mainAmount?.value || "no-amount"}`
    );
  }

  // G — Pas de Gemini / OpenAI / fetch
  {
    assert.equal(fetchCalls, 0);
    // Garantie structurelle : analyze n’importe plus callGemini
    const analyzeSrc = await import("node:fs").then((fs) =>
      fs.promises.readFile(new URL("../api/analyze.js", import.meta.url), "utf8")
    );
    assert.ok(!/callGeminiForAnalysis/.test(analyzeSrc));
    assert.ok(!/openai/i.test(analyzeSrc));
    assert.ok(/analyzeDocumentWithDidouAsync/.test(analyzeSrc));
    pass("NO_AI_PROVIDER", `fetch=${fetchCalls}`);
  }
} catch (error) {
  fail("UNEXPECTED", error?.stack || error?.message || String(error));
} finally {
  globalThis.fetch = originalFetch;
}

if (process.exitCode) {
  console.error("Didou OCR tests FAILED");
  process.exit(1);
}

console.log("Didou OCR tests PASSED");
