/**
 * Null vs 0 + warnings d’incohérence montants.
 * Usage: npm run test:v3-amount-coherence
 */

import assert from "node:assert/strict";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";
import { debugAmountPipeline } from "../lib/v3/localAnalysis/amountRanking.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function incoherenceWarnings(local) {
  return (local.warnings || []).filter((w) => /incoh[eé]rence/i.test(w));
}

function main() {
  console.log("=== test-v3-amount-coherence ===");

  section("Diagnostic avant logique : provenance 0 et 1444.44");
  {
    const text = `
Facture d'électricité
Numéro de facture FAC-1
Date de facture 01/11/2025
Abonnement HT 0,00 €
Total HT
TVA 1 444,44 €
Total TTC 1 708,36 €
Montant à payer 1 708,36 €
`.trim();
    const debug = debugAmountPipeline(text);
    const zero = debug.candidates.find((c) => Math.abs(c.value) < 0.001);
    const mid = debug.candidates.find((c) => Math.abs(c.value - 1444.44) < 0.01);
    console.log("  0 provenance:", {
      value: zero?.value,
      tags: zero?.tags,
      score: zero?.score,
      reasons: zero?.reasons,
      context: zero?.context?.slice(0, 100)
    });
    console.log("  1444.44 provenance:", {
      value: mid?.value,
      tags: mid?.tags,
      score: mid?.score,
      reasons: mid?.reasons,
      context: mid?.context?.slice(0, 100)
    });
    assert.ok(zero, "0,00 doit être extrait du texte");
    assert.ok(mid, "1444.44 doit être extrait du texte");
  }

  section("Facture électricité-like : pas de warning faux HT(0)+TVA");
  {
    const text = `
Facture d'électricité
Numéro de facture FAC-1
Date de facture 01/11/2025
Abonnement HT 0,00 €
Total HT
TVA 1 444,44 €
Total TTC 1 708,36 €
Montant à payer 1 708,36 €
`.trim();
    const local = analyzeLocally(text);
    console.log("  fields=", {
      amountHT: local.fields.amountHT,
      vatRate: local.fields.vatRate,
      amountTVA: local.fields.amountTVA,
      amountTTC: local.fields.amountTTC,
      amountToPay: local.fields.amountToPay,
      principalSource: local.fields.principalSource,
      warnings: incoherenceWarnings(local)
    });
    assert.equal(local.fields.amountHT, null, "0 ligne abonnement ≠ amountHT");
    assert.notEqual(local.fields.amountTVA, 1444.44, "1444.44 trop grand pour une TVA");
    assert.equal(local.fields.amountTTC, 1708.36);
    assert.equal(local.fields.amountToPay, 1708.36);
    assert.equal(incoherenceWarnings(local).length, 0);
    console.log("  OK amountHT=null, pas de warning, principal TTC/à payer");
  }

  section("Colonnes HT TVA TTC avec 0,00 en tête");
  {
    const text = `
Facture d'électricité
HT TVA TTC
0,00 1 444,44 1 708,36
Montant de facture 1 708,36 €
`.trim();
    const local = analyzeLocally(text);
    console.log("  fields=", {
      amountHT: local.fields.amountHT,
      amountTVA: local.fields.amountTVA,
      amountTTC: local.fields.amountTTC,
      warnings: incoherenceWarnings(local)
    });
    assert.equal(local.fields.amountHT, null);
    assert.equal(incoherenceWarnings(local).length, 0);
    console.log("  OK");
  }

  section("HT null + TVA + TTC → aucun warning");
  {
    const text = `
FACTURE
dont TVA 20,00 €
Montant TTC 120,00 €
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.fields.amountHT, null);
    assert.equal(local.fields.amountTVA, 20);
    assert.equal(local.fields.amountTTC, 120);
    assert.equal(incoherenceWarnings(local).length, 0);
    console.log("  OK");
  }

  section("Vraie contradiction HT+TVA≠TTC → warning");
  {
    const text = `
FACTURE
Total HT : 100,00 €
TVA : 20,00 €
Total TTC : 150,00 €
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.fields.amountHT, 100);
    assert.equal(local.fields.amountTVA, 20);
    assert.equal(local.fields.amountTTC, 150);
    assert.ok(incoherenceWarnings(local).length >= 1);
    console.log("  OK warning=", incoherenceWarnings(local)[0]);
  }

  section("Total HT 0,00 réel conservé comme zéro");
  {
    const text = `
FACTURE
Total HT : 0,00 €
TVA : 0,00 €
Total TTC : 0,00 €
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.fields.amountHT, 0);
    assert.equal(incoherenceWarnings(local).length, 0);
    console.log("  OK amountHT=0 (total explicite)");
  }

  section("Non-régression Free-like");
  {
    const text = `
FREE MOBILE
FACTURE
Facture n° FM-998877
Total HT 8,33 €
TVA 20% 1,66 €
Total TTC 9,99 €
Montant à payer : 9,99 €
`.trim();
    const local = analyzeLocally(text);
    assert.equal(local.documentType, "facture");
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.vatRate, 20);
    assert.equal(local.fields.amountTTC, 9.99);
    assert.equal(local.fields.amountToPay, 9.99);
    assert.equal(incoherenceWarnings(local).length, 0);
    console.log("  OK Free");
  }

  console.log("\nTous les tests amount-coherence OK.");
}

main();
