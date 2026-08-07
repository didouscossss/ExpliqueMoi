/**
 * Test d’intégration : texte aplati façon PDF.js (1 ligne / page)
 * → ranking → LocalAnalysis → mapping UI.
 *
 * Reproduit la régression Preview où « SAS au capital de … » sur la même
 * ligne que les montants faisait disparaître 9,99 €.
 *
 * Usage: npm run test:v3-pdfjs-pipeline
 */

import assert from "node:assert/strict";
import {
  analyzeLocally,
  debugAmountPipeline,
  selectAmountFields
} from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";

/** Simule content.items.map(str).join(" ") + collapse spaces (ancien OCR PDF). */
function flattenLikePdfJs(items) {
  return items.join(" ").replace(/\s+/g, " ").trim();
}

const PDFJS_FLAT = flattenLikePdfJs([
  "OPERATEUR",
  "TELECOM",
  "SA",
  "SAS",
  "au",
  "capital",
  "de",
  "365",
  "138",
  "779",
  "Euros",
  "Facture",
  "n°",
  "F-100",
  "Date",
  "d'émission",
  ":",
  "21/11/2025",
  "Date",
  "de",
  "prélèvement",
  ":",
  "24/11/2025",
  "Total",
  "de",
  "la",
  "facture",
  "HT",
  ":",
  "8.33",
  "€",
  "TVA",
  ":",
  "1.66",
  "€",
  "Somme",
  "à",
  "payer",
  "TTC",
  ":",
  "9.99",
  "€",
  "N°",
  "de",
  "ligne",
  ":",
  "12"
]);

const MULTILINE_OCR = `
OPERATEUR TELECOM SA
SAS au capital de 365 138 779 Euros
Facture n° F-100
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
Total de la facture HT : 8.33 €
TVA : 1.66 €
Somme à payer TTC
9.99 €
`.trim();

const OCR_VARIANTS = [
  "Somme à payer TTC : 9,99 €",
  "Somme à payer TTC : 9.99 €",
  "Somme à payer TTC : 9,99€",
  "Somme à payer TTC : 9.99€",
  "Somme à payer TTC : 9\u00a099 €",
  "Somme à payer TTC : 9 99 €"
];

function section(title) {
  console.log(`\n▸ ${title}`);
}

function main() {
  console.log("test-v3-pdfjs-pipeline");

  section("A — texte PDF.js aplati (1 ligne)");
  console.log("  text:", PDFJS_FLAT.slice(0, 160) + "…");
  console.log("  lineCount would be 1; contains 9.99?", PDFJS_FLAT.includes("9.99"));

  section("B/C — candidats + scores (fenêtre locale)");
  const debug = debugAmountPipeline(PDFJS_FLAT);
  console.log("  keywordHits", debug.keywordHits);
  console.log(
    "  candidates",
    debug.candidates.map((c) => ({
      v: c.value,
      s: c.score,
      tags: c.tags,
      ctx: c.context.slice(0, 50)
    }))
  );
  assert.ok(
    debug.candidates.some((c) => c.value === 9.99),
    "9.99 doit rester candidat"
  );
  assert.ok(
    debug.candidates.some((c) => c.value === 8.33),
    "8.33 doit rester candidat"
  );
  assert.ok(
    debug.candidates.some((c) => c.value === 1.66),
    "1.66 doit rester candidat"
  );

  section("D — sélection / LocalAnalysis / UI");
  const sel = selectAmountFields(PDFJS_FLAT);
  console.log("  selection", {
    ht: sel.amountHT,
    tva: sel.amountTVA,
    ttc: sel.amountTTC,
    pay: sel.amountToPay,
    principal: sel.principal,
    source: sel.principalSource,
    reasons: sel.principalReasons
  });
  assert.equal(sel.principal, 9.99);
  assert.ok(
    sel.principalSource === "amountToPay" || sel.principalSource === "amountTTC"
  );
  assert.equal(sel.amountHT, 8.33);
  assert.equal(sel.amountTVA, 1.66);

  const local = analyzeLocally(PDFJS_FLAT);
  assert.equal(local.documentType, "facture");
  assert.equal(local.fields.amountToPay ?? local.fields.amountTTC, 9.99);
  assert.equal(local.fields.issueDate, "2025-11-21");
  assert.equal(local.fields.paymentDate, "2025-11-24");
  assert.match(local.factualSummary, /9[,.]99/);
  assert.match(local.factualSummary, /24 novembre 2025/);
  assert.doesNotMatch(local.factualSummary, /capital|365|⚠️|SIRET|Aucun montant/i);
  assert.ok(
    local.evidence.some((e) => /9\.99|9,99/.test(e.quote)),
    "evidence doit contenir le TTC"
  );
  assert.ok(
    local.evidence.some((e) => /8\.33|8,33/.test(e.quote)),
    "evidence doit contenir le HT"
  );

  const ui = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: { summary: local.factualSummary, explanation: {} },
    meta: { ai: { available: false } }
  });
  assert.equal(ui.amount.value, "9,99 €");
  assert.ok(
    ui.amount.source === "amountToPay" || ui.amount.source === "amountTTC"
  );
  console.log("  UI amount=", ui.amount.value, "summary=", ui.plain_summary);

  section("Multiligne label/montant séparés");
  {
    const localMulti = analyzeLocally(MULTILINE_OCR);
    assert.equal(localMulti.fields.amountToPay ?? localMulti.fields.amountTTC, 9.99);
    console.log("  OK multiligne principal=", localMulti.fields.amountToPay);
  }

  section("Variantes OCR 9,99 / 9.99 / NBSP / espace");
  for (const line of OCR_VARIANTS) {
    const text = `FACTURE\nTotal HT : 8.33 €\nTVA : 1.66 €\n${line}`;
    const ranked = selectAmountFields(text);
    assert.equal(
      ranked.principal,
      9.99,
      `échec variante: ${JSON.stringify(line)} → ${ranked.principal}`
    );
    console.log("  OK", JSON.stringify(line), "→", ranked.principal);
  }

  section("JSON final fixture PDF.js-like");
  console.log(
    JSON.stringify(
      {
        fields: local.fields,
        factualSummary: local.factualSummary,
        uiAmount: ui.amount,
        evidence: local.evidence.map((e) => ({
          field: e.field,
          quote: e.quote,
          reasons: e.reasons || null
        })),
        debugSelection: debug.selection
      },
      null,
      2
    )
  );

  console.log("\n✓ Pipeline PDF.js / ranking OK\n");
}

main();
