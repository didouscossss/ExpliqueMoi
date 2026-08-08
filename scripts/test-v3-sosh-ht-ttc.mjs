/**
 * Régression générique HT/TTC + client≠émetteur.
 * Couvre un layout type télécom (offre 25,99 + totaux HT/TVA%/TTC)
 * et la non-régression Free-like 9,99 €.
 * Usage: npm run test:v3-sosh-ht-ttc
 */

import assert from "node:assert/strict";
import {
  analyzeLocally,
  debugAmountPipeline,
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

/** Layout type facture télécom : prix d’offre = TTC, HT + taux séparés. */
const SOSH_LIKE = `
Sosh
Facture du 17/11/2025
Vos coordonnées
M CHAMPION VALENTIN
12 RUE EXEMPLE 75001 PARIS
Forfait mobile 25,99 € 5G
Total de la facture
21,66 € HT
TVA 20 %
25,99 € TTC
Orange SA au capital de 10 640 226 208 euros
`.trim();

const SOSH_FLAT = `Sosh Facture du 17/11/2025 Vos coordonnées M CHAMPION VALENTIN Forfait mobile 25,99 € 5G Total de la facture 21,66 € HT TVA 20 % 25,99 € TTC Orange SA`;

const SOSH_COLUMNS = `
Sosh
Facture du 17/11/2025
Vos coordonnées
M CHAMPION VALENTIN
Forfait mobile 25,99 € 5G
Total de la facture HT TVA TTC 21,66 € 4,33 € 25,99 €
TVA 20 %
Orange SA
`.trim();

const FREE_LIKE = `
FREE MOBILE
FACTURE
Facture n° 2480462851
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
Total de la facture HT : 8.33 €
TVA [20.00%] 1.66 €
Somme à payer TTC : 9.99 €
16.79
`.trim();

function main() {
  console.log("test-v3-sosh-ht-ttc");

  section("Cause reproduite puis corrigée — suffixe HT/TTC + HT×taux");
  {
    const sel = selectAmountFields(SOSH_FLAT);
    const dbg = debugAmountPipeline(SOSH_FLAT);
    console.log(
      "  cands=",
      dbg.candidates.map((c) => ({
        v: c.value,
        s: c.score,
        t: c.tags,
        ctx: c.context
      }))
    );
    assert.equal(sel.amountHT, 21.66);
    assert.equal(sel.vatRate, 20);
    assert.equal(sel.amountTTC, 25.99);
    assert.equal(sel.principal, 25.99);
    assert.ok(sel.principalSource !== "amountHT");
    assert.equal(sel.arithmeticOk, true);
    console.log("  OK principal=25.99 ht=21.66 rate=20");
  }

  section("Document multiligne type Sosh");
  {
    const local = analyzeLocally(SOSH_LIKE);
    const ui = uiOf(local);
    assert.equal(local.documentType, "facture");
    assert.equal(local.fields.amountHT, 21.66);
    assert.equal(local.fields.vatRate, 20);
    assert.equal(local.fields.amountTTC, 25.99);
    assert.equal(
      local.fields.amountToPay ?? local.fields.amountTTC,
      25.99
    );
    assert.equal(ui.amount.value, "25,99 €");
    assert.equal(local.fields.invoiceDate, "2025-11-17");
    assert.equal(local.fields.clientName, "M CHAMPION VALENTIN");
    assert.ok(
      local.fields.companyName &&
        !/champion|valentin/i.test(local.fields.companyName),
      `émetteur ne doit pas être le client (got ${local.fields.companyName})`
    );
    assert.match(local.fields.companyName, /sosh/i);
    if (local.fields.legalIssuer) {
      assert.match(local.fields.legalIssuer, /orange\s*sa/i);
    }
    assert.match(local.factualSummary || "", /25,99\s*€\s*TTC/i);
    assert.match(local.factualSummary || "", /17 novembre 2025/i);
    assert.ok(!/21,66/.test(local.factualSummary || ""));
    console.log("  OK", {
      principal: ui.amount.value,
      issuer: local.fields.companyName,
      legal: local.fields.legalIssuer,
      client: local.fields.clientName,
      summary: local.factualSummary
    });
  }

  section("Colonnes HT TVA TTC");
  {
    const local = analyzeLocally(SOSH_COLUMNS);
    assert.equal(local.fields.amountHT, 21.66);
    assert.equal(local.fields.amountTVA, 4.33);
    assert.equal(local.fields.amountTTC, 25.99);
    assert.equal(local.fields.amountToPay ?? local.fields.amountTTC, 25.99);
    console.log("  OK colonnes HT/TVA/TTC");
  }

  section("Non-régression Free-like 9,99 €");
  {
    const local = analyzeLocally(FREE_LIKE);
    const ui = uiOf(local);
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.vatRate, 20);
    assert.equal(local.fields.amountTTC, 9.99);
    assert.equal(local.fields.amountToPay, 9.99);
    assert.equal(ui.amount.value, "9,99 €");
    assert.equal(local.fields.invoiceDate, "2025-11-21");
    assert.ok(!local.evidence.some((e) => e.quote.trim() === "16.79"));
    console.log("  OK Free principal=9,99 €");
  }

  console.log("\n✓ Sosh HT/TTC + Free regression OK\n");
}

main();
