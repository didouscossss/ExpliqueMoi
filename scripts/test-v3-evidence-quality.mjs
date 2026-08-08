/**
 * Qualité des passages importants : pas de nombres isolés, preuves liées aux champs.
 * Usage: npm run test:v3-evidence-quality
 */

import assert from "node:assert/strict";
import {
  analyzeLocally,
  isIsolatedNumericQuote,
  findBestSourceLine
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

const DOC = `
OPERATEUR TELECOM SA
SAS au capital de 365 138 779 Euros
Facture n° 2480462851
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
Total de la facture HT : 8.33 €
TVA [20.00%] 1.66 €
Somme à payer TTC : 9.99 €
16.79
20.00
9.99
`.trim();

function main() {
  console.log("test-v3-evidence-quality");

  section("isIsolatedNumericQuote");
  assert.equal(isIsolatedNumericQuote("16.79", "amountOther"), true);
  assert.equal(isIsolatedNumericQuote("9.99", "amountTTC"), true);
  assert.equal(isIsolatedNumericQuote("9.99 €", "amountTTC"), true);
  assert.equal(isIsolatedNumericQuote("20.00%", "amountTVA"), true);
  assert.equal(isIsolatedNumericQuote("[20.00%]", "amountTVA"), true);
  assert.equal(
    isIsolatedNumericQuote("Somme à payer TTC : 9.99 €", "amountTTC"),
    false
  );
  assert.equal(
    isIsolatedNumericQuote("21 novembre 2025", "invoiceDate"),
    false
  );
  assert.equal(
    isIsolatedNumericQuote("Facture n° 2480462851", "invoiceNumber"),
    false
  );
  console.log("  OK filtres nombres isolés");

  section("findBestSourceLine préfère le contexte");
  {
    const line = findBestSourceLine(
      DOC,
      ["9.99", "9.99 €"],
      /ttc|payer|somme/i
    );
    assert.ok(line);
    assert.match(line, /Somme à payer TTC/i);
    assert.doesNotMatch(line, /^9\.99/);
    console.log("  OK", line);
  }

  section("Document avec orphelin 16.79 → exclu");
  {
    const local = analyzeLocally(DOC);
    const ui = uiOf(local);

    // Non-régression faits principaux
    assert.equal(local.fields.amountToPay ?? local.fields.amountTTC, 9.99);
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.vatRate, 20);
    assert.equal(local.fields.invoiceDate, "2025-11-21");
    assert.equal(local.fields.debitDate, "2025-11-24");
    assert.equal(local.fields.invoiceNumber, "2480462851");
    assert.ok(!local.warnings.some((w) => /incoh/i.test(w)));

    const quotes = local.evidence.map((e) => e.quote);
    const uiQuotes = ui.evidence.map((e) => e.quote);
    console.log("  evidence=", quotes);

    assert.ok(
      !quotes.some((q) => isIsolatedNumericQuote(q, "amountOther")),
      "aucune preuve numérique isolée"
    );
    assert.ok(!quotes.some((q) => /^16\.79$/.test(q.trim())));
    assert.ok(!quotes.some((q) => /^20\.00%?$/.test(q.trim())));
    assert.ok(!quotes.some((q) => /^9\.99\s*€?$/.test(q.trim())));
    assert.ok(!uiQuotes.some((q) => q.trim() === "16.79"));

    assert.ok(
      local.evidence.some((e) => e.field === "invoiceNumber"),
      "preuve n° facture"
    );
    assert.ok(
      local.evidence.some((e) => e.field === "invoiceDate"),
      "preuve date facture"
    );
    assert.ok(
      local.evidence.some((e) => e.field === "debitDate"),
      "preuve prélèvement"
    );
    assert.ok(local.evidence.some((e) => e.field === "amountHT"));
    assert.ok(local.evidence.some((e) => e.field === "amountTVA"));
    assert.ok(
      local.evidence.some(
        (e) => e.field === "amountTTC" || e.field === "amountToPay"
      )
    );

    for (const ev of local.evidence) {
      assert.ok(ev.field, "chaque preuve a un field");
      assert.ok(ev.quote && ev.quote.length >= 3);
      assert.ok(
        DOC.includes(ev.quote) ||
          DOC.replace(/\s+/g, " ").includes(ev.quote.replace(/\s+/g, " "))
      );
    }

    // Pas de résumé construit dans les preuves
    assert.ok(
      !quotes.some((q) => /datée du 21 novembre 2025 et prélevée/i.test(q))
    );

    const json = {
      evidence: local.evidence.map((e) => ({
        field: e.field,
        text: e.quote,
        page: e.page ?? null,
        confidence: e.confidence ?? null
      })),
      fields: {
        principalAmount: local.fields.amountToPay,
        htAmount: local.fields.amountHT,
        vatAmount: local.fields.amountTVA,
        vatRate: local.fields.vatRate,
        ttcAmount: local.fields.amountTTC,
        invoiceDate: local.fields.invoiceDate,
        debitDate: local.fields.debitDate,
        invoiceNumber: local.fields.invoiceNumber
      }
    };
    console.log(JSON.stringify(json, null, 2));
  }

  section("PDF.js aplati avec 16.79 orphelin");
  {
    const flat = DOC.split("\n").join(" ").replace(/\s+/g, " ");
    const local = analyzeLocally(flat);
    assert.equal(local.fields.amountToPay ?? local.fields.amountTTC, 9.99);
    assert.ok(!local.evidence.some((e) => e.quote.trim() === "16.79"));
    assert.ok(
      !local.evidence.some((e) => isIsolatedNumericQuote(e.quote, e.field)),
      "aucune preuve isolée en OCR aplati"
    );
    assert.ok(
      local.evidence.some((e) =>
        /somme à payer ttc/i.test(e.quote.replace(/\s+/g, " "))
      ),
      "TTC doit garder le libellé OCR complet (pas seulement « TTC : 9.99 »)"
    );
    assert.ok(
      local.evidence.some((e) =>
        /total de la facture ht/i.test(e.quote.replace(/\s+/g, " "))
      ),
      "HT doit garder le libellé OCR complet"
    );
    const tvaEv = local.evidence.find((e) => e.field === "amountTVA");
    assert.ok(tvaEv && /tva/i.test(tvaEv.quote));
    assert.ok(
      tvaEv && !/8\.33/.test(tvaEv.quote),
      "preuve TVA ne doit pas englober le total HT"
    );
    assert.ok(
      local.evidence.some((e) =>
        /date d['']émission/i.test(e.quote.replace(/\s+/g, " "))
      )
    );
    assert.ok(
      !local.evidence.some(
        (e) =>
          /date d['']émission/i.test(e.quote) &&
          /pr[eé]l[eè]vement/i.test(e.quote)
      ),
      "une preuve date ne doit pas mélanger émission et prélèvement"
    );
    console.log(
      "  OK flat evidence=",
      local.evidence.map((e) => e.quote)
    );
  }

  console.log("\n✓ Evidence quality OK\n");
}

main();
