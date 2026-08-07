/**
 * Audit V3 — extraction factuelle + résumé + passages SANS OpenAI.
 * Usage: npx tsx scripts/audit-v3-no-ai.mjs
 */

import assert from "node:assert/strict";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";
import { OpenAIProvider } from "../lib/v3/providers/OpenAIProvider.js";
import { buildAIContext } from "../lib/v3/providers/buildAIContext.js";

const FREE_MOBILE_TEXT = `
FREE MOBILE
FACTURE
Facture n° FM-202511-001
Date de prélèvement : 24/11/2025

Abonnement
Prix HT 8,00 €

Total de la facture HT : 8.33 €
TVA : 1.66 € (20%)
Somme à payer TTC : 9.99 €
`.trim();

const networkLog = [];

function stubFetch(url, init = {}) {
  networkLog.push({
    url: String(url),
    method: String(init.method || "GET"),
    hasAuth: Boolean(init.headers?.Authorization || init.headers?.authorization)
  });
  return Promise.resolve(
    new Response(
      JSON.stringify({
        error: {
          message: "Incorrect API key provided: sk-audit-invalid.",
          code: "invalid_api_key"
        }
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  );
}

async function main() {
  console.log("\n======= A — Faits + résumé + evidence SANS aucun fetch =======");
  const local = analyzeLocally(FREE_MOBILE_TEXT);
  assert.equal(local.documentType, "facture");
  assert.equal(local.fields.amountHT, 8.33);
  assert.equal(local.fields.amountTVA, 1.66);
  assert.equal(local.fields.amountTTC, 9.99);
  assert.equal(local.fields.amountToPay, 9.99);
  assert.equal(local.fields.date, "2025-11-24");
  assert.match(local.factualSummary, /9[,.]99/);
  assert.match(local.factualSummary, /prélevée le 24 novembre 2025/);
  assert.ok(local.evidence.some((e) => /9\.99|9,99/.test(e.quote)));
  assert.equal(networkLog.length, 0);

  const ui = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: {
      ok: true,
      summary: local.factualSummary,
      explanation: { keyPoints: ["IA FAKE 1€"], documentType: "autre" }
    },
    meta: { ai: { available: false } }
  });
  assert.equal(ui.amount.value, "9,99 €");
  assert.equal(ui.plain_summary, local.factualSummary);
  assert.equal(ui.document_type, "facture");
  assert.ok(!ui.evidence.some((e) => /FAKE/.test(e.quote)));
  console.log("summary:", ui.plain_summary);
  console.log("amount:", ui.amount);
  console.log("evidence count:", ui.evidence.length);
  console.log("✓ LOCAL complet sans réseau");

  console.log("\n======= B — OpenAI 401 : faits toujours OK =======");
  const context = buildAIContext({
    text: FREE_MOBILE_TEXT,
    localAnalysis: local,
    ocrResult: {
      pages: [{ pageNumber: 1, text: FREE_MOBILE_TEXT, confidence: 100 }],
      fullText: FREE_MOBILE_TEXT,
      warnings: []
    }
  });
  const provider = new OpenAIProvider(
    {
      provider: "openai",
      model: "gpt-4o-mini",
      options: { apiKey: "sk-audit-invalid-key-for-test" }
    },
    { fetchImpl: stubFetch, requestId: "audit-v3-no-ai" }
  );
  const aiResult = await provider.analyze(context);
  assert.equal(aiResult.ok, false);
  assert.equal(networkLog.length, 1);
  assert.match(networkLog[0].url, /api\.openai\.com/);

  const degradedUi = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: {
      ok: true,
      summary: local.factualSummary,
      explanation: { source: "local_facts" }
    },
    meta: { ai: { available: false, error: aiResult.error } }
  });
  assert.equal(degradedUi.amount.value, "9,99 €");
  assert.equal(degradedUi.plain_summary, local.factualSummary);
  console.log("✓ OpenAI down → UI factuelle intacte");
  console.log("\n✓ Audit no-AI terminé.\n");
}

main().catch((error) => {
  console.error("✗ Audit échoué:", error);
  process.exit(1);
});
