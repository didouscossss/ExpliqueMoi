#!/usr/bin/env node
/**
 * Non-régression : PDF majoritairement textuel contenant une page
 * scannée (ex : annexe collée dans une convocation).
 *
 * Bug réel corrigé : le gate OCR de preparePages.js décidait
 * "pdfHasText / pas d'OCR" au niveau du FICHIER entier. Une page
 * scannée à l'intérieur d'un PDF par ailleurs textuel ne recevait
 * donc jamais d'OCR et disparaissait silencieusement du pipeline
 * (buildPagesFromAnalyzeInput ne garde que les pages avec du
 * texte). C'est la cause du décalage observé entre le nombre de
 * pages annoncé par Document Structure Engine et les numéros de
 * page réellement utilisés dans ses segments.
 *
 * Ce test construit un vrai PDF à 2 pages (page 1 texte
 * sélectionnable, page 2 image scannée) et vérifie que la page 2
 * est désormais récupérée par un OCR ciblé, sans jamais OCRiser
 * la page 1 (déjà exploitable).
 */
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { inspectPdf } from "../lib/pdfProcessing.js";
import { preparePagesWithLocalOcr } from "../lib/didou/ocr/index.js";

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

function makeScannedAnnexPng() {
  const canvas = createCanvas(1000, 560);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1000, 560);
  ctx.fillStyle = "#000000";
  ctx.font = "34px DejaVu Sans, sans-serif";
  let y = 70;
  for (const line of [
    "ANNEXE COMMERCIALE",
    "Devis n. 2026-118",
    "Total TTC : 4200,00 EUR",
    "Bon pour accord"
  ]) {
    ctx.fillText(line, 48, y);
    y += 70;
  }
  return canvas.toBuffer("image/png");
}

async function makeMixedPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Page 1 : texte numérique sélectionnable
  const textPage = pdf.addPage([595, 842]);
  const lines = [
    "CONVOCATION A L'ASSEMBLEE GENERALE",
    "Syndic : Habitat Plus Syndic",
    "Reunion le 12/09/2026 a 18h30"
  ];
  let y = 780;
  for (const line of lines) {
    textPage.drawText(line, { x: 40, y, size: 14, font });
    y -= 20;
  }

  // Page 2 : annexe scannée, aucun texte sélectionnable
  const png = makeScannedAnnexPng();
  const image = await pdf.embedPng(png);
  const scannedPage = pdf.addPage([image.width, image.height]);
  scannedPage.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

try {
  const bytes = await makeMixedPdf();

  // Inspection réaliste (identique à celle faite par api/analyze.js)
  const meta = await inspectPdf(bytes);
  assert.equal(meta.ok, true);
  assert.equal(meta.pageCount, 2);
  assert.equal(meta.hasText, true, "le document doit être détecté comme ayant du texte");

  const page2Text = meta.pageTexts.find((p) => p.pageNumber === 2)?.text || "";
  assert.equal(
    page2Text.trim(),
    "",
    "pdf.js ne doit trouver aucun texte sélectionnable sur la page scannée"
  );

  const page = {
    name: "convocation-mixte.pdf",
    mimeType: "application/pdf",
    order: 0,
    bytes,
    base64: bytes.toString("base64"),
    pdfHasText: meta.hasText,
    pdfScanned: meta.scanned,
    pdfPageCount: meta.pageCount,
    pdfFullText: meta.fullText,
    pdfPageTexts: meta.pageTexts
  };

  const prepared = await preparePagesWithLocalOcr([page]);
  const result = prepared.pages[0];

  // La page scannée doit maintenant avoir du texte récupéré.
  const recoveredPage2 = (result.pdfPageTexts || []).find(
    (p) => p.pageNumber === 2
  );
  assert.ok(recoveredPage2, "la page 2 doit être présente dans pdfPageTexts");
  assert.ok(
    recoveredPage2.text.replace(/\s+/g, "").length >= 20,
    `texte OCR insuffisant sur la page 2 : "${recoveredPage2.text}"`
  );
  assert.match(
    recoveredPage2.text,
    /devis|annexe|accord|ttc/i,
    "le texte OCR de la page 2 doit correspondre au contenu réel de l'annexe"
  );

  // La page 1 (déjà textuelle) ne doit pas avoir été altérée.
  const page1 = (result.pdfPageTexts || []).find((p) => p.pageNumber === 1);
  assert.ok(page1?.text.includes("CONVOCATION"));

  // L'OCR ne doit pas avoir été sauté pour tout le document : on
  // doit voir un traitement "partiel" ciblé, pas juste "skip global".
  assert.ok(
    prepared.diagnostics.some(
      (d) => d.step === "pdf_partial_text_layer" && d.ocrSkipped === false
    ),
    "un OCR ciblé sur la page faible doit apparaître dans les diagnostics"
  );
  assert.ok(
    !prepared.diagnostics.some(
      (d) => d.step === "pdf_text_layer" && d.ocrSkipped === true
    ),
    "l'OCR ne doit pas avoir été sauté globalement (il y avait une page faible)"
  );

  assert.equal(
    result.localExtraction?.method,
    "local-pdf-text+local-ocr",
    "la méthode doit refléter un texte hybride (couche texte + OCR ciblé)"
  );

  pass(
    "MIXED_PDF_WEAK_PAGE_RECOVERED",
    `page2="${recoveredPage2.text.slice(0, 60)}..."`
  );

  assert.equal(fetchCalls, 0);
  pass("NO_NETWORK", `fetch=${fetchCalls}`);
} catch (error) {
  fail("UNEXPECTED", error?.stack || error?.message || String(error));
} finally {
  globalThis.fetch = originalFetch;
}

if (process.exitCode) {
  console.log("Mixed-PDF weak-page tests FAILED");
} else {
  console.log("Mixed-PDF weak-page tests PASSED");
}
