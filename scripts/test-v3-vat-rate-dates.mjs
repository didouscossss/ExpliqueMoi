/**
 * Tests : séparation taux TVA / montant TVA + dates invoice vs débit.
 * Usage: npm run test:v3-vat-rate-dates
 */

import assert from "node:assert/strict";
import {
  analyzeLocally,
  extractVatRates,
  selectAmountFields
} from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function uiOf(local) {
  return mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: { summary: local.factualSummary, explanation: {} },
    meta: { ai: { available: false } }
  });
}

function main() {
  console.log("test-v3-vat-rate-dates");

  section("TVA 20% : 1,66 €");
  {
    const text = `
FACTURE
Total HT : 8,33 €
TVA 20% : 1,66 €
Somme à payer TTC : 9,99 €
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
Facture n° 2480462851
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.vatRate, 20);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.amountTTC, 9.99);
    assert.equal(local.fields.amountToPay, 9.99);
    assert.equal(local.fields.invoiceDate, "2025-11-21");
    assert.equal(local.fields.debitDate, "2025-11-24");
    assert.equal(local.fields.date, "2025-11-21");
    assert.equal(local.fields.invoiceNumber, "2480462851");
    assert.ok(!local.warnings.some((w) => /incoh[eé]rence/i.test(w)));
    assert.match(
      local.factualSummary,
      /datée du 21 novembre 2025 et prélevée le 24 novembre 2025/
    );
    const ui = uiOf(local);
    assert.equal(ui.amount.value, "9,99 €");
    assert.equal(ui.main_date.date, "2025-11-21");
    assert.equal(ui.vat_rate, 20);
    const payQuotes = ui.evidence.filter((e) =>
      /^\s*somme\s+[àa]\s+payer\s+ttc/i.test(e.quote.trim())
    );
    assert.ok(
      payQuotes.length <= 1,
      `pas de doublon Somme à payer TTC (got ${payQuotes.length})`
    );
    console.log("  OK", {
      principal: ui.amount.value,
      vatRate: local.fields.vatRate,
      vatAmount: local.fields.amountTVA,
      mainDate: ui.main_date.date,
      summary: local.factualSummary
    });
  }

  section("TVA [20.00%] 1.66 €");
  {
    const text = `
FACTURE
Total de la facture HT 8.33 e
TVA [20.00%] 1.66 e
Somme à payer TTC 9.99 e
`.trim();
    const ranked = selectAmountFields(text);
    assert.equal(ranked.vatRate, 20);
    assert.equal(ranked.amountTVA, 1.66);
    assert.equal(ranked.amountHT, 8.33);
    assert.equal(ranked.principal, 9.99);
    assert.notEqual(ranked.amountTVA, 20);
    assert.ok(ranked.arithmeticOk === true);
    console.log("  OK vatRate=", ranked.vatRate, "vatAmount=", ranked.amountTVA);
  }

  section("TVA 5,5 % 2,75 €");
  {
    const text = `FACTURE\nHT 50,00 €\nTVA 5,5 % 2,75 €\nTTC 52,75 €`;
    const local = analyzeLocally(text);
    assert.equal(local.fields.vatRate, 5.5);
    assert.equal(local.fields.amountTVA, 2.75);
    assert.equal(local.fields.amountTTC, 52.75);
    assert.ok(!local.warnings.some((w) => /incoh/i.test(w)));
    console.log("  OK", local.fields.vatRate, local.fields.amountTVA);
  }

  section("Taux TVA : 10 % — montant TVA : 4,20 €");
  {
    const text = `
FACTURE
Taux TVA : 10 % — montant TVA : 4,20 €
Total HT : 42,00 €
Total TTC : 46,20 €
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.fields.vatRate, 10);
    assert.equal(local.fields.amountTVA, 4.2);
    assert.equal(local.fields.amountHT, 42);
    assert.equal(local.fields.amountTTC, 46.2);
    assert.deepEqual(extractVatRates(text), [10]);
    console.log("  OK taux/montant séparés");
  }

  section("JSON final document type Preview");
  {
    const text = `
OPERATEUR TELECOM SA
SAS au capital de 365 138 779 Euros
Facture n° 2480462851
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
Total de la facture HT : 8.33 €
TVA [20.00%] 1.66 €
Somme à payer TTC : 9.99 €
`.trim();
    const local = analyzeLocally(text);
    const ui = uiOf(local);
    const json = {
      principalAmount: local.fields.amountToPay ?? local.fields.amountTTC,
      htAmount: local.fields.amountHT,
      vatRate: local.fields.vatRate,
      vatAmount: local.fields.amountTVA,
      ttcAmount: local.fields.amountTTC,
      invoiceDate: local.fields.invoiceDate,
      debitDate: local.fields.debitDate,
      mainDate: local.fields.date,
      invoiceNumber: local.fields.invoiceNumber,
      warnings: local.warnings.filter((w) => /incoh/i.test(w)),
      keyPoints: ui.evidence.map((e) => e.quote),
      factualSummary: local.factualSummary
    };
    assert.equal(json.principalAmount, 9.99);
    assert.equal(json.htAmount, 8.33);
    assert.equal(json.vatRate, 20);
    assert.equal(json.vatAmount, 1.66);
    assert.equal(json.ttcAmount, 9.99);
    assert.equal(json.invoiceDate, "2025-11-21");
    assert.equal(json.debitDate, "2025-11-24");
    assert.equal(json.mainDate, "2025-11-21");
    assert.equal(json.invoiceNumber, "2480462851");
    assert.equal(json.warnings.length, 0);
    const normCounts = new Map();
    for (const q of json.keyPoints) {
      const n = q
        .toLowerCase()
        .replace(/€|eur|euros?/g, "e")
        .replace(/\s+/g, " ")
        .trim();
      normCounts.set(n, (normCounts.get(n) || 0) + 1);
    }
    for (const [k, n] of normCounts) {
      assert.equal(n, 1, `doublon evidence: ${k}`);
    }
    console.log(JSON.stringify(json, null, 2));
  }

  console.log("\n✓ TVA rate/amount + dates OK\n");
}

main();
