/**
 * Tests anti-régression ranking montants / issuer / dates / résumé.
 * Usage: npm run test:v3-amount-ranking
 */

import assert from "node:assert/strict";
import {
  analyzeLocally,
  selectAmountFields
} from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";

const FIXTURES = {
  htTvaTtc: `
OPERATEUR TELECOM SA
Facture n° F-100
Date d'émission : 21/11/2025
Date de prélèvement : 24/11/2025
SAS au capital de 365 138 779 Euros
Total de la facture HT : 8.33 €
TVA : 1.66 €
Somme à payer TTC : 9.99 €
`.trim(),

  netAPayer: `
FACTURE
Entreprise Beta
Net à payer : 150,00 €
Date : 10/01/2026
`.trim(),

  totalTtc: `
FACTURE
ACME SERVICES
Total TTC : 240,00 EUR
Total HT : 200,00 EUR
TVA : 40,00 EUR
`.trim(),

  parasites: `
FACTURE
Fournisseur Gamma
Prix unitaire 12,00 €
Remise 2,00 €
Sous-total HT 100,00 €
TVA 20,00 €
Montant à payer 120,00 €
`.trim(),

  capitalSocial: `
FACTURE N° 55
Marque Commerciale XYZ
SAS au capital de 365 138 779 Euros
Montant TTC à régler : 45,00 €
`.trim(),

  sansTtc: `
FACTURE
Studio Delta
Montant HT : 80,00 €
`.trim(),

  echeanceDiff: `
FACTURE
Date d'émission : 01/03/2026
Échéance : 31/03/2026
Total TTC : 99,00 €
`.trim(),

  multilinePayable: `
FACTURE
Total de la facture HT : 8.33 €
TVA : 1.66 €
Somme à payer TTC
9.99 €
`.trim(),

  capitalOnlyNoIssuer: `
FACTURE N° 88
SAS au capital de 12 000 000 Euros
SARL au capital de 5 000 Euros
Somme à payer TTC : 19,99 €
Date de prélèvement : 15/02/2026
`.trim()
};

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
  console.log("test-v3-amount-ranking");

  section("HT+TVA+TTC + capital social + dates");
  {
    const local = analyzeLocally(FIXTURES.htTvaTtc);
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.amountToPay, 9.99);
    assert.equal(local.fields.amountTTC, 9.99);
    assert.equal(local.fields.paymentDate, "2025-11-24");
    assert.equal(local.fields.issueDate, "2025-11-21");
    assert.equal(local.fields.invoiceDate, "2025-11-21");
    assert.equal(local.fields.debitDate, "2025-11-24");
    assert.equal(local.fields.date, "2025-11-21");
    assert.ok(!/capital/i.test(String(local.fields.companyName || "")));
    assert.ok(!/365/.test(String(local.factualSummary || "")));
    assert.match(local.factualSummary, /9[,.]99/);
    assert.match(local.factualSummary, /21 novembre 2025/);
    assert.match(local.factualSummary, /24 novembre 2025/);
    assert.doesNotMatch(local.factualSummary, /SIRET|⚠️/);
    const ui = uiOf(local);
    assert.equal(ui.amount.value, "9,99 €");
    assert.ok(ui.amount.source === "amountToPay" || ui.amount.source === "amountTTC");
    assert.ok(Array.isArray(ui.amount.reasons));
    assert.ok(ui.amount.reasons.some((r) => /payer|TTC|cohérence/i.test(r)));
    console.log("  OK principal=", ui.amount.value, "summary=", ui.plain_summary);
    console.log("  reasons=", ui.amount.reasons);
  }

  section("Net à payer");
  {
    const local = analyzeLocally(FIXTURES.netAPayer);
    assert.equal(local.fields.netToPay ?? local.fields.amountToPay, 150);
    assert.equal(uiOf(local).amount.value, "150,00 €");
    console.log("  OK", uiOf(local).amount.value);
  }

  section("Total TTC");
  {
    const local = analyzeLocally(FIXTURES.totalTtc);
    assert.equal(local.fields.amountTTC, 240);
    assert.equal(uiOf(local).amount.value, "240,00 €");
    console.log("  OK", uiOf(local).amount.value);
  }

  section("Montants parasites (PU/remise)");
  {
    const local = analyzeLocally(FIXTURES.parasites);
    assert.equal(local.fields.amountToPay, 120);
    assert.equal(uiOf(local).amount.value, "120,00 €");
    assert.notEqual(uiOf(local).amount.value, "12,00 €");
    console.log("  OK", uiOf(local).amount.value);
  }

  section("Capital social ≠ émetteur / ≠ montant");
  {
    const local = analyzeLocally(FIXTURES.capitalSocial);
    assert.ok(!/capital/i.test(String(local.fields.companyName || "")));
    assert.ok(local.fields.amountToPay === 45 || local.fields.amountTTC === 45);
    assert.equal(uiOf(local).amount.value, "45,00 €");
    assert.doesNotMatch(local.factualSummary, /365|capital/i);
    assert.ok(
      local.fields.companyName == null ||
        /Marque Commerciale XYZ/i.test(String(local.fields.companyName))
    );
    console.log("  OK issuer=", local.fields.companyName, "summary=", local.factualSummary);
  }

  section("Sans TTC → HT en dernier recours");
  {
    const local = analyzeLocally(FIXTURES.sansTtc);
    assert.equal(local.fields.amountHT, 80);
    assert.equal(local.fields.amountTTC, null);
    assert.equal(uiOf(local).amount.source, "amountHT");
    console.log("  OK fallback HT", uiOf(local).amount.value);
  }

  section("Échéance ≠ émission");
  {
    const local = analyzeLocally(FIXTURES.echeanceDiff);
    assert.equal(local.fields.issueDate, "2026-03-01");
    assert.equal(local.fields.invoiceDate, "2026-03-01");
    assert.equal(local.fields.dueDate || local.fields.paymentDate, "2026-03-31");
    assert.equal(local.fields.debitDate, "2026-03-31");
    assert.equal(local.fields.date, "2026-03-01");
    console.log("  OK date principale=", local.fields.date, "debit=", local.fields.debitDate);
  }

  section("Somme à payer TTC multiligne");
  {
    const ranked = selectAmountFields(FIXTURES.multilinePayable);
    assert.equal(ranked.principal, 9.99);
    const local = analyzeLocally(FIXTURES.multilinePayable);
    assert.equal(uiOf(local).amount.value, "9,99 €");
    console.log("  OK multiligne principal=", ranked.principal, ranked.principalReasons);
  }

  section("Capital social seul → résumé neutre (pas d’émetteur inventé)");
  {
    const local = analyzeLocally(FIXTURES.capitalOnlyNoIssuer);
    assert.equal(local.fields.companyName, null);
    assert.equal(local.fields.amountToPay, 19.99);
    assert.match(local.factualSummary, /^Facture de 19[,.]99/);
    assert.doesNotMatch(local.factualSummary, /capital|SAS|SARL|12 000/i);
    assert.equal(local.fields.paymentDate, "2026-02-15");
    console.log("  OK summary=", local.factualSummary);
  }

  section("Preuve JSON fixture HT/TVA/TTC");
  {
    const local = analyzeLocally(FIXTURES.htTvaTtc);
    // Dédup : amountToPay et amountTTC partagent souvent la même citation → une seule preuve.
    const payEv =
      local.evidence.find((e) => e.field === "amountToPay") ||
      local.evidence.find((e) => e.field === "amountTTC");
    assert.ok(payEv, "preuve montant à payer / TTC attendue");
    assert.ok(
      Array.isArray(payEv.reasons) && payEv.reasons.length > 0,
      "raisons de sélection sur la preuve gagnante"
    );
    const htEv = local.evidence.find((e) => e.field === "amountHT");
    assert.ok(!htEv?.reasons?.length, "raisons ne doivent pas être sur le HT");
    const json = {
      fields: local.fields,
      factualSummary: local.factualSummary,
      evidence: local.evidence.map((e) => ({
        field: e.field,
        quote: e.quote,
        confidence: e.confidence ?? null,
        reasons: e.reasons || null
      }))
    };
    assert.equal(json.fields.amountToPay, 9.99);
    assert.equal(json.fields.principalSource, "amountToPay");
    console.log(JSON.stringify(json, null, 2));
  }

  console.log("\n✓ Ranking montants OK\n");
}

main();
