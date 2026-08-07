/**
 * Test unitaire + E2E mapping V3 → UI « Montant principal ».
 * Usage: npm run test:v3-front-map
 */
import assert from "node:assert/strict";
import {
  mapV3ResponseToUiAnalysis,
  selectPrincipalAmountValue
} from "../lib/v3/client/mapToUiAnalysis.js";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";

const mapped = mapV3ResponseToUiAnalysis({
  ok: true,
  localAnalysis: {
    documentType: "facture",
    documentTypeConfidence: 0.8,
    issuer: "SAS DUPONT SERVICES",
    dates: [{ raw: "12/03/2026", iso: "2026-03-12", label: "document_date" }],
    deadlines: [],
    detectedActions: ["Régler le montant dû"],
    warnings: [],
    fields: {
      companyName: "SAS DUPONT SERVICES",
      clientName: "Mme Alice Martin",
      date: "2026-03-12",
      amountHT: 100,
      amountTVA: 20,
      amountTTC: 120,
      amountToPay: null,
      netToPay: null,
      iban: null,
      siret: "73282932000074",
      invoiceNumber: "FA-2026-0142"
    }
  },
  result: {
    ok: true,
    summary: "Facture de 120 € TTC pour Alice Martin.",
    explanation: {
      documentType: "facture",
      keyPoints: ["Montant TTC : 120,00 €"],
      warnings: []
    },
    provider: "openai",
    model: "gpt-4o-mini"
  },
  meta: { provider: "openai", model: "gpt-4o-mini" }
});

assert.equal(mapped.document_type, "facture");
assert.match(mapped.plain_summary, /120/);
assert.equal(mapped.issuer, "SAS DUPONT SERVICES");
assert.equal(mapped.engine, "v3");
assert.equal(mapped.provider, "openai");
assert.ok(mapped.actions.length >= 1);
assert.equal(mapped.amount.value, "120,00 €");
assert.equal(mapped.amount.source, "amountTTC");

// ——— E2E : HT 8,33 / TVA 1,66 / TTC 9,99 → Montant principal = 9,99 € ———
const freeLikeUi = mapV3ResponseToUiAnalysis({
  ok: true,
  localAnalysis: {
    documentType: "facture",
    documentTypeConfidence: 0.9,
    fields: {
      amountHT: 8.33,
      amountTVA: 1.66,
      amountTTC: 9.99,
      amountToPay: null,
      netToPay: null
    }
  },
  result: {
    ok: true,
    summary: "Facture 9,99 € TTC.",
    explanation: {
      documentType: "facture",
      keyPoints: ["HT 8,33 €", "TVA 1,66 €", "TTC 9,99 €"],
      warnings: []
    }
  }
});
assert.equal(freeLikeUi.amount.value, "9,99 €");
assert.equal(freeLikeUi.amount.source, "amountTTC");
assert.doesNotMatch(freeLikeUi.amount.value, /^8/);

// Priorité amountToPay > amountTTC
const withToPay = mapV3ResponseToUiAnalysis({
  ok: true,
  localAnalysis: {
    documentType: "facture",
    fields: {
      amountHT: 8.33,
      amountTVA: 1.66,
      amountTTC: 9.99,
      amountToPay: 9.99,
      netToPay: null
    }
  },
  result: {
    ok: true,
    summary: "x",
    explanation: { documentType: "facture", keyPoints: [], warnings: [] }
  }
});
assert.equal(withToPay.amount.value, "9,99 €");
assert.equal(withToPay.amount.source, "amountToPay");

assert.deepEqual(
  selectPrincipalAmountValue({
    amountToPay: null,
    amountTTC: 9.99,
    netToPay: null,
    amountHT: 8.33
  }),
  { value: 9.99, source: "amountTTC" }
);

// E2E texte PDF-like (décimales point + ordre inversé) → principal 9,99
const pdfLike = `
FACTURE FREE MOBILE
Date de prélèvement : 24/11/2025
Prix HT 8.00 EUR
Total HT
8.33 EUR
TVA 20%
1.66 EUR
9.99 € TTC
`.trim();
const local = analyzeLocally(pdfLike);
assert.equal(local.fields.amountHT, 8.33);
assert.equal(local.fields.amountTVA, 1.66);
assert.equal(local.fields.amountTTC, 9.99);
const e2e = mapV3ResponseToUiAnalysis({
  ok: true,
  localAnalysis: local,
  result: {
    ok: true,
    summary: "Facture Free Mobile.",
    explanation: {
      documentType: "facture",
      keyPoints: ["HT 8,33 €", "TVA 1,66 €", "TTC 9,99 €"],
      warnings: []
    }
  }
});
assert.equal(e2e.amount.value, "9,99 €");
assert.equal(e2e.amount.source, "amountTTC");

console.log("✓ mapV3ResponseToUiAnalysis OK");
console.log("  principal E2E Free-like =", e2e.amount.value, `(source=${e2e.amount.source})`);
