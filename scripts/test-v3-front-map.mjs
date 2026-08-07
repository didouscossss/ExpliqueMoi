/**
 * Test unitaire mapping V3 → UI (sans navigateur).
 */
import assert from "node:assert/strict";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";

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
console.log("✓ mapV3ResponseToUiAnalysis OK");
