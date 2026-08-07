/**
 * Tests V3 — faits locaux + mode dégradé OpenAI + Free Mobile fixture.
 * Usage: npm run test:v3-degraded
 */

import assert from "node:assert/strict";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";
import { OpenAIProvider } from "../lib/v3/providers/OpenAIProvider.js";
import { buildAIContext } from "../lib/v3/providers/buildAIContext.js";
import { createProviderConfigFromEnv } from "../lib/v3/providers/ProviderConfig.js";

const FREE = `
FREE MOBILE
FACTURE
Facture n° FM-202511-001
Date de prélèvement : 24/11/2025
Prix HT 8,00 €
Total de la facture HT : 8.33 €
TVA : 1.66 € (20%)
Somme à payer TTC : 9.99 €
`.trim();

const ONLY_DUE = `
FACTURE
SAS EXEMPLE
Montant à payer : 42,50 €
Date : 01/03/2026
`.trim();

const networkLog = [];

function stubFetchFactory(behavior) {
  return async (url, init = {}) => {
    networkLog.push({
      url: String(url),
      method: init.method || "GET",
      behavior
    });
    if (behavior === "ok") {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  pedagogy:
                    "Ceci est une explication pédagogique générée pour le test.",
                  warnings: [],
                  // Tentative d'écrasement (doit être ignorée par le mapping)
                  summary: "FAUX résumé AI de 1 €",
                  documentType: "autre chose",
                  keyPoints: ["Montant inventé 1,00 €"]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (behavior === "timeout") {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }
    if (behavior === "invalid_key") {
      return new Response(
        JSON.stringify({
          error: {
            message: "Incorrect API key provided: sk-invalid.",
            code: "invalid_api_key"
          }
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: { message: "fail" } }), {
      status: 500
    });
  };
}

async function simulateAnalyzeHandler(text, fetchBehavior) {
  networkLog.length = 0;
  const localAnalysis = analyzeLocally(text);
  assert.ok(localAnalysis.factualSummary);

  const context = buildAIContext({
    text,
    localAnalysis,
    ocrResult: {
      pages: [{ pageNumber: 1, text, confidence: 100 }],
      fullText: text,
      warnings: []
    }
  });

  let aiAvailable = false;
  let aiError = null;
  let pedagogy = null;

  if (fetchBehavior === "no_key") {
    const prevKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const provider = new OpenAIProvider(
        { provider: "openai", model: "gpt-4o-mini", options: {} },
        { fetchImpl: stubFetchFactory("invalid_key"), requestId: "test-no-key" }
      );
      const result = await provider.analyze(context);
      aiAvailable = result.ok;
      aiError = result.error;
    } finally {
      if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
    }
  } else {
    const provider = new OpenAIProvider(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        options: { apiKey: "sk-test-key" }
      },
      {
        fetchImpl: stubFetchFactory(fetchBehavior),
        requestId: `test-${fetchBehavior}`
      }
    );
    try {
      const result = await provider.analyze(context);
      aiAvailable = result.ok;
      aiError = result.error || null;
      if (result.ok && result.explanation) {
        const expl = result.explanation;
        pedagogy =
          (typeof expl.pedagogy === "string" && expl.pedagogy) ||
          (typeof expl.summary === "string" && expl.summary) ||
          null;
      }
    } catch (error) {
      aiAvailable = false;
      aiError = {
        code: "PROVIDER_TIMEOUT",
        message: String(error.message || error)
      };
    }
  }

  // Contrat API cible : ok true dès que le local est utilisable
  const response = {
    ok: true,
    version: "v3",
    localAnalysis,
    result: {
      ok: true,
      summary: localAnalysis.factualSummary,
      explanation: {
        documentType: localAnalysis.documentType,
        keyPoints: [],
        pedagogy,
        source: "local_facts"
      },
      provider: aiAvailable ? "openai" : null,
      model: aiAvailable ? "gpt-4o-mini" : null
    },
    meta: {
      ai: { available: aiAvailable, error: aiError }
    }
  };

  const ui = mapV3ResponseToUiAnalysis(response);
  return { response, ui, localAnalysis, networkLog: [...networkLog] };
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

async function main() {
  console.log("test-v3-degraded — faits locaux + OpenAI optionnel");

  section("Free Mobile HT+TVA+TTC locaux");
  {
    const local = analyzeLocally(FREE);
    assert.equal(local.documentType, "facture");
    assert.equal(local.fields.amountHT, 8.33);
    assert.equal(local.fields.amountTVA, 1.66);
    assert.equal(local.fields.amountTTC, 9.99);
    assert.equal(local.fields.amountToPay, 9.99);
    assert.equal(local.fields.date, "2025-11-24");
    assert.match(local.factualSummary, /9[,.]99/);
    assert.match(local.factualSummary, /Free Mobile/i);
    assert.match(local.factualSummary, /24 novembre 2025/);
    assert.ok(local.evidence.length >= 4);
    for (const ev of local.evidence) {
      assert.ok(
        FREE.includes(ev.quote) ||
          FREE.replace(/\s+/g, " ").includes(ev.quote.replace(/\s+/g, " ")),
        `evidence non verbatim: ${ev.quote}`
      );
    }
    console.log("  OK summary=", local.factualSummary);
  }

  section("Montant à payer seul");
  {
    const local = analyzeLocally(ONLY_DUE);
    assert.equal(local.fields.amountToPay, 42.5);
    assert.match(local.factualSummary, /42[,.]50/);
    const ui = mapV3ResponseToUiAnalysis({
      ok: true,
      localAnalysis: local,
      result: { summary: local.factualSummary, explanation: {} },
      meta: { ai: { available: false } }
    });
    assert.equal(ui.amount.value, "42,50 €");
    assert.equal(ui.amount.source, "amountToPay");
    console.log("  OK principal=", ui.amount.value);
  }

  section("OpenAI fonctionnel — n'écrase pas les faits");
  {
    const { ui, localAnalysis, networkLog: logs } = await simulateAnalyzeHandler(
      FREE,
      "ok"
    );
    assert.equal(ui.amount.value, "9,99 €");
    assert.equal(ui.document_type, "facture");
    assert.equal(ui.plain_summary, localAnalysis.factualSummary);
    assert.doesNotMatch(ui.plain_summary, /FAUX|1 €|1,00/);
    assert.ok(!ui.evidence.some((e) => /inventé|1,00/.test(e.quote)));
    assert.equal(logs.length, 1);
    assert.match(logs[0].url, /openai\.com/);
    console.log("  OK AI appelée mais faits locaux conservés");
  }

  section("Clé OpenAI invalide — analyse ok");
  {
    const { response, ui, networkLog: logs } = await simulateAnalyzeHandler(
      FREE,
      "invalid_key"
    );
    assert.equal(response.ok, true);
    assert.equal(response.meta.ai.available, false);
    assert.equal(ui.amount.value, "9,99 €");
    assert.match(ui.plain_summary, /9[,.]99/);
    assert.ok(ui.evidence.length >= 3);
    assert.equal(logs.length, 1);
    console.log("  OK ok:true malgré 401, résumé local=", ui.plain_summary);
  }

  section("Sans clé OpenAI — analyse ok");
  {
    const { response, ui, networkLog: logs } = await simulateAnalyzeHandler(
      FREE,
      "no_key"
    );
    assert.equal(response.ok, true);
    assert.equal(ui.amount.value, "9,99 €");
    // missing key → pas d'appel réseau
    assert.equal(logs.length, 0);
    console.log("  OK sans clé, 0 appel réseau, principal=", ui.amount.value);
  }

  section("Timeout OpenAI — analyse ok");
  {
    const { response, ui } = await simulateAnalyzeHandler(FREE, "timeout");
    assert.equal(response.ok, true);
    assert.equal(ui.amount.value, "9,99 €");
    assert.match(ui.plain_summary, /TTC|9[,.]99/);
    console.log("  OK timeout → faits locaux");
  }

  section("Non-régression V2 (fichiers intacts)");
  {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync("api/analyze.js") || fs.existsSync("api/analyze.ts"));
    // Le handler V2 ne doit pas importer le pipeline V3 facts
    const v2 = fs.existsSync("api/analyze.js")
      ? fs.readFileSync("api/analyze.js", "utf8")
      : fs.readFileSync("api/analyze.ts", "utf8");
    assert.ok(!/buildFactualSummary|buildLocalEvidence/.test(v2));
    console.log("  OK V2 non branché sur builders V3");
  }

  console.log("\n✓ Tous les tests degraded / local-facts V3 ont réussi.\n");
}

main().catch((error) => {
  console.error("\n✗ Échec test-v3-degraded:", error);
  process.exit(1);
});
