/**
 * Test unitaire + E2E mapping V3 → UI « Montant principal » + résumé local.
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
    factualSummary: "Facture SAS DUPONT SERVICES de 120,00 € TTC, datée du 12 mars 2026.",
    evidence: [
      {
        id: "ev-1",
        quote: "Montant TTC: 120,00 €",
        field: "amountTTC",
        label: "Montant TTC",
        page: 1,
        source: "ocr"
      }
    ],
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
    summary: "Facture SAS DUPONT SERVICES de 120,00 € TTC, datée du 12 mars 2026.",
    explanation: {
      documentType: "autre",
      keyPoints: ["Montant inventé AI"],
      pedagogy: "Explication AI",
      warnings: []
    },
    provider: "openai",
    model: "gpt-4o-mini"
  },
  meta: { provider: "openai", model: "gpt-4o-mini", ai: { available: true } }
});

assert.equal(mapped.document_type, "facture"); // LOCAL, pas "autre" AI
assert.match(mapped.plain_summary, /120/);
assert.doesNotMatch(mapped.plain_summary, /inventé/);
assert.equal(mapped.issuer, "SAS DUPONT SERVICES");
assert.equal(mapped.engine, "v3");
assert.equal(mapped.amount.value, "120,00 €");
assert.equal(mapped.amount.source, "amountTTC");
assert.ok(mapped.evidence.every((e) => !/inventé/.test(e.quote)));
assert.ok(mapped.evidence.some((e) => /120/.test(e.quote)));

const freeLikeUi = mapV3ResponseToUiAnalysis({
  ok: true,
  localAnalysis: {
    documentType: "facture",
    documentTypeConfidence: 0.9,
    factualSummary: "Facture de 9,99 € TTC.",
    evidence: [
      {
        id: "ev-1",
        quote: "Somme à payer TTC : 9.99 €",
        field: "amountToPay",
        label: "Montant à payer",
        source: "ocr"
      }
    ],
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
    summary: "Facture de 9,99 € TTC.",
    explanation: { documentType: "facture", keyPoints: [], warnings: [] }
  },
  meta: { ai: { available: false } }
});
assert.equal(freeLikeUi.amount.value, "9,99 €");
assert.equal(freeLikeUi.amount.source, "amountToPay");

assert.deepEqual(
  selectPrincipalAmountValue({
    amountToPay: null,
    amountTTC: 9.99,
    netToPay: null,
    amountHT: 8.33
  }),
  { value: 9.99, source: "amountTTC" }
);

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
    summary: local.factualSummary,
    explanation: { keyPoints: ["AI fake"], documentType: "xyz" }
  },
  meta: { ai: { available: false } }
});
assert.equal(e2e.amount.value, "9,99 €");
assert.equal(e2e.document_type, "facture");
assert.equal(e2e.plain_summary, local.factualSummary);

console.log("✓ mapV3ResponseToUiAnalysis OK");
console.log("  principal E2E Free-like =", e2e.amount.value);
console.log("  summary =", e2e.plain_summary);
