/**
 * Intégration : vrai PDF Sosh → pdf.js (même chaîne que Preview) → analyse locale.
 * Usage: npm run test:v3-sosh-real-pdf
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeLocally,
  selectAmountFields
} from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";
import { extractPdfLikeBrowser } from "./extract-pdfjs-like-browser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.resolve(__dirname, "../fixtures/facture_sosh_real.pdf");

function uiOf(local) {
  return mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: { summary: local.factualSummary, explanation: {} },
    meta: { ai: { available: false } }
  });
}

async function main() {
  console.log("test-v3-sosh-real-pdf — pipeline Preview");

  const ocr = await extractPdfLikeBrowser(PDF);
  assert.ok(ocr.textLength > 200, "texte pdf.js non vide");
  assert.ok(/21[,.]66/.test(ocr.fullText), "HT présent dans OCR");
  assert.ok(/25[,.]99/.test(ocr.fullText), "TTC présent dans OCR");
  assert.ok(/Votre facture/i.test(ocr.fullText));
  assert.ok(/2009682949/.test(ocr.fullText));
  console.log("  OCR pages=", ocr.pageCount, "chars=", ocr.textLength);

  const sel = selectAmountFields(ocr.fullText);
  console.log("  selection=", {
    ht: sel.amountHT,
    tva: sel.amountTVA,
    rate: sel.vatRate,
    ttc: sel.amountTTC,
    principal: sel.principal,
    source: sel.principalSource
  });

  assert.equal(sel.amountHT, 21.66);
  assert.equal(sel.amountTTC, 25.99);
  assert.equal(sel.principal, 25.99);
  assert.equal(sel.vatRate, 20);
  assert.ok(sel.principalSource !== "amountHT");

  const local = analyzeLocally({
    pages: ocr.pages,
    fullText: ocr.fullText,
    warnings: []
  });
  const ui = uiOf(local);

  assert.equal(local.documentType, "facture");
  assert.equal(local.fields.invoiceDate, "2025-11-17");
  assert.equal(local.fields.amountHT, 21.66);
  assert.equal(local.fields.amountTTC, 25.99);
  assert.equal(local.fields.vatRate, 20);
  assert.equal(ui.amount.value, "25,99 €");

  // Issuer : pas « Votre »
  assert.ok(
    !local.fields.companyName ||
      !/^(votre|vos)$/i.test(local.fields.companyName)
  );
  assert.ok(!/Facture Votre/i.test(local.factualSummary || ""));
  // Brand prouvée par le PDF (Bienvenue chez …) ou absente — pas un déterminant
  if (local.fields.companyName) {
    assert.match(local.fields.companyName, /sosh/i);
  }
  if (local.fields.legalIssuer) {
    assert.match(local.fields.legalIssuer, /orange\s*sa/i);
  }

  // Recipient : personne, pas n° client
  assert.ok(local.fields.clientName);
  assert.ok(!/2009682949/.test(local.fields.clientName));
  assert.match(local.fields.clientName, /champion/i);
  assert.ok(!/total aupr/i.test(local.fields.clientName));
  assert.ok(!/2009682949/.test(ui.request || ""));

  assert.match(local.factualSummary || "", /25,99\s*€\s*TTC/i);
  assert.ok(!/21,66/.test(local.factualSummary || ""));

  console.log("  UI=", {
    summary: local.factualSummary,
    amount: ui.amount.value,
    issuer: local.fields.companyName,
    legal: local.fields.legalIssuer,
    client: local.fields.clientName,
    request: ui.request
  });
  console.log("\n✓ Sosh real PDF pipeline OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
