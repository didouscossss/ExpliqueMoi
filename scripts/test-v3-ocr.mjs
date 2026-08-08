/**
 * Tests unitaires OCR V3 — PDF texte vs PDF scanné.
 * Usage: npm run test:v3-ocr
 *
 * N’importe aucun module V2 métier (analyze / gemini / assist).
 */

import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { OcrEngine } from "../lib/v3/ocr/OcrEngine.js";
import { detectLanguageFromText } from "../lib/v3/ocr/languageDetection.js";

async function buildTextPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Bonjour, ceci est une facture de test.", {
    x: 50,
    y: 780,
    size: 16,
    font,
    color: rgb(0, 0, 0)
  });
  page.drawText("Montant: 42,00 EUR. Echeance: 15 septembre 2026.", {
    x: 50,
    y: 750,
    size: 14,
    font,
    color: rgb(0, 0, 0)
  });
  return Buffer.from(await pdf.save());
}

async function buildScannedPdf() {
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 900, 300);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("BONJOUR FACTURE", 40, 120);
  ctx.font = "36px sans-serif";
  ctx.fillText("MONTANT 42 EUR", 40, 200);
  const png = canvas.toBuffer("image/png");
  canvas.width = 0;
  canvas.height = 0;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([900, 300]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: 900, height: 300 });
  return Buffer.from(await pdf.save());
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

async function testTextPdfSkipsTesseract() {
  section("PDF texte → extraction pdfjs, Tesseract non lancé");
  const pdf = await buildTextPdf();
  const engine = new OcrEngine();
  try {
    assert.equal(await engine.isScannedPdf(pdf), false);

    const result = await engine.extractText(pdf);
    assert.equal(engine.didUseTesseract(), false, "Tesseract ne doit pas démarrer");
    assert.ok(result.fullText.length > 20);
    assert.match(result.fullText.toLowerCase(), /facture/);
    assert.equal(result.pages[0].confidence, 100);

    const pages = await engine.extractPages(pdf);
    assert.equal(pages.length, result.pages.length);

    const lang = await engine.languageDetection(pdf);
    assert.equal(lang.language, "fra");
    console.log("  OK texte=", JSON.stringify(result.fullText.slice(0, 80)));
    console.log("  OK lang=", lang.language, "tesseract=", engine.didUseTesseract());
  } finally {
    await engine.destroy();
  }
}

async function testScannedPdfUsesTesseract() {
  section("PDF scanné → Tesseract uniquement");
  const pdf = await buildScannedPdf();
  const engine = new OcrEngine();
  try {
    assert.equal(await engine.isScannedPdf(pdf), true);

    const result = await engine.extractText(pdf);
    assert.equal(engine.didUseTesseract(), true, "Tesseract doit démarrer");
    assert.ok(result.fullText.length > 0);
    assert.match(result.fullText.toUpperCase(), /FACTURE|BONJOUR|MONTANT|EUR/);
    assert.ok(result.pages[0].confidence > 0);
    assert.ok(result.warnings.some((w) => /scanné|Tesseract/i.test(w)));
    console.log("  OK ocr=", JSON.stringify(result.fullText.slice(0, 100)));
    console.log("  OK confidence=", result.pages[0].confidence);
  } finally {
    await engine.destroy();
  }
}

async function testLanguageHeuristic() {
  section("languageDetection heuristique FR/EN");
  const fr = detectLanguageFromText(
    "Bonjour Madame, votre facture et le montant à régler avant échéance."
  );
  const en = detectLanguageFromText(
    "Dear customer, please find your invoice and payment amount below."
  );
  assert.equal(fr.language, "fra");
  assert.equal(en.language, "eng");
  console.log("  OK fr/en", fr.confidence.toFixed(2), en.confidence.toFixed(2));
}

async function main() {
  console.log("test-v3-ocr — ExpliqueMoi V3 OCR engine");
  await testLanguageHeuristic();
  await testTextPdfSkipsTesseract();
  await testScannedPdfUsesTesseract();
  console.log("\n✓ Tous les tests OCR V3 ont réussi.\n");
}

main().catch((error) => {
  console.error("\n✗ Échec tests OCR V3:", error);
  process.exit(1);
});
