/**
 * Audit V3 — preuve de non-utilisation / utilisation de l’IA.
 * Usage: npx tsx scripts/audit-v3-no-ai.mjs
 *
 * 1) Extraction locale seule (sans clé, sans réseau IA)
 * 2) Provider OpenAI avec clé volontairement invalide (appel réseau → échec)
 * 3) Simulation du handler /api/v3/analyze avec clé cassée
 */

import assert from "node:assert/strict";
import { analyzeLocally, enrichLocalAmountFields } from "../lib/v3/localAnalysis/index.js";
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
  const entry = {
    url: String(url),
    method: String(init.method || "GET"),
    hasAuth: Boolean(init.headers?.Authorization || init.headers?.authorization),
    bodyPreview: String(init.body || "").slice(0, 180)
  };
  networkLog.push(entry);
  // Simule un refus immédiat OpenAI (clé invalide)
  return Promise.resolve(
    new Response(
      JSON.stringify({
        error: {
          message: "Incorrect API key provided: sk-audit-invalid.",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  );
}

function section(title) {
  console.log(`\n======= ${title} =======`);
}

async function main() {
  section("A — Extraction locale seule (aucun provider, aucun fetch)");
  const local = analyzeLocally(FREE_MOBILE_TEXT);
  console.log("documentType:", local.documentType);
  console.log("fields:", JSON.stringify(local.fields, null, 2));
  console.log("detectedActions:", local.detectedActions);
  console.log("dates:", local.dates.map((d) => d.iso || d.raw));
  console.log("deadlines:", local.deadlines.map((d) => d.iso || d.raw));

  assert.equal(local.documentType, "facture");
  assert.equal(local.fields.amountHT, 8.33);
  assert.equal(local.fields.amountTVA, 1.66);
  assert.ok(
    local.fields.amountTTC === 9.99 || local.fields.amountToPay === 9.99
  );
  const hasDate =
    local.fields.date === "2025-11-24" ||
    local.dates.some((d) => d.iso === "2025-11-24" || /24\/11\/2025/.test(d.raw));
  assert.ok(hasDate, "date 24/11/2025 attendue");
  console.log("✓ LOCAL OK : facture / 24-11-2025 / HT 8.33 / TVA 1.66 / TTC|à payer 9.99");
  console.log("networkLog après LOCAL:", networkLog.length, "(doit rester 0)");

  section("B — OpenAIProvider.analyze avec clé invalide (fetch stubbé)");
  const context = buildAIContext({
    text: FREE_MOBILE_TEXT,
    ocrResult: {
      pages: [{ pageNumber: 1, text: FREE_MOBILE_TEXT, confidence: 100 }],
      fullText: FREE_MOBILE_TEXT,
      warnings: []
    },
    localAnalysis: local
  });

  // Clé volontairement invalide (via config.options.apiKey — même chemin que env OPENAI_API_KEY)
  const provider = new OpenAIProvider(
    {
      provider: "openai",
      model: "gpt-4o-mini",
      timeoutMs: 5000,
      options: { apiKey: "sk-audit-invalid-key-for-test" }
    },
    { fetchImpl: stubFetch, requestId: "audit-v3-no-ai" }
  );

  const aiResult = await provider.analyze(context);
  console.log("aiResult.ok:", aiResult.ok);
  console.log("aiResult.summary:", aiResult.summary);
  console.log("aiResult.error:", aiResult.error);
  console.log("appels réseau observés:", JSON.stringify(networkLog, null, 2));

  assert.equal(aiResult.ok, false);
  assert.equal(networkLog.length, 1);
  assert.match(networkLog[0].url, /api\.openai\.com/);
  assert.equal(networkLog[0].hasAuth, true);
  console.log("✓ Preuve : 1 appel vers api.openai.com avec Authorization (échoue 401)");

  section("C — Simulation réponse /api/v3/analyze quand OpenAI échoue");
  // Comme le handler actuel : localAnalysis existe, mais ok:false → front throw
  const apiFailureBody = {
    ok: false,
    version: "v3",
    localAnalysis: local,
    error: aiResult.error
  };
  console.log(
    "JSON API (échec) keys:",
    Object.keys(apiFailureBody),
    "| localAnalysis.fields.amountToPay=",
    apiFailureBody.localAnalysis.fields.amountToPay,
    "| amountTTC=",
    apiFailureBody.localAnalysis.fields.amountTTC
  );
  console.log(
    "Conséquence front: analyzeClient.js throw si ok===false → écran erreur, pas de rendu résumé."
  );

  section("D — Mapping UI si on forçait local-only (sans result.summary AI)");
  const uiLocalOnly = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: local,
    result: {
      ok: true,
      summary: null,
      explanation: null,
      provider: null,
      model: null
    }
  });
  console.log("plain_summary (sans AI):", JSON.stringify(uiLocalOnly.plain_summary));
  console.log("document_type (sans AI):", uiLocalOnly.document_type);
  console.log("why_received:", uiLocalOnly.why_received);
  console.log("amount:", uiLocalOnly.amount);
  console.log("evidence (passages):", uiLocalOnly.evidence);
  console.log("actions:", uiLocalOnly.actions);
  console.log("urgency:", uiLocalOnly.urgency);
  assert.equal(uiLocalOnly.plain_summary, "Résumé indisponible.");
  assert.ok(
    uiLocalOnly.evidence.every((e) => e.id === "v3-invoice"),
    "sans AI : evidence = uniquement n° facture LOCAL, pas de keyPoints"
  );
  console.log(
    "✓ Sans AI : résumé = fallback local « Résumé indisponible. » ; passages = n° facture LOCAL seulement (pas de keyPoints AI)"
  );

  section("E — Enrichissement keyPoints (si AI avait renvoyé le libellé)");
  const enriched = enrichLocalAmountFields(local, [
    "Somme à payer TTC : 9.99 €",
    "Total de la facture HT : 8.33 €",
    "TVA : 1.66 € (20%)"
  ]);
  console.log("enriched fields:", {
    HT: enriched.fields.amountHT,
    TVA: enriched.fields.amountTVA,
    TTC: enriched.fields.amountTTC,
    toPay: enriched.fields.amountToPay
  });

  section("F — Origine exacte résumé (preuve code)");
  console.log(`
ORIGINE RÉSUMÉ (« L'essentiel en quelques mots ») :
  mapToUiAnalysis.js L65-68 :
    summary = result.summary || explanation.summary || "Résumé indisponible."
  result.summary vient de OpenAIProvider.analyze() → JSON OpenAI champ "summary"
  ANALYZE_SYSTEM (OpenAIProvider.ts) demande explicitement summary + keyPoints + documentType
  → AI (OpenAI), PAS un template local
  Fallback local uniquement si AI absente : "Résumé indisponible."
`);

  section("VERDICT TABLE");
  const table = [
    ["Type document (carte)", "AI preferred (explanation.documentType) else LOCAL detectDocumentType"],
    ["Date principale", "LOCAL extractDates / fields.date"],
    ["Montant principal", "LOCAL fields amountToPay→TTC→net→HT"],
    ["HT / TVA / TTC structurés", "LOCAL extractAmounts"],
    ["N° facture", "LOCAL extractInvoiceNumber"],
    ["Passages importants", "AI explanation.keyPoints (+ n° facture LOCAL)"],
    ["L'essentiel en quelques mots", "AI result.summary (OpenAI) — sinon « Résumé indisponible. »"],
    ["Pourquoi vous l'avez reçu", "LOCAL template mapToUiAnalysis why_received"],
    ["Actions", "LOCAL detectedActions (+ fallback template si montant)"],
    ["Niveau d'attention / urgence", "LOCAL deadlines → urgency"]
  ];
  for (const [k, v] of table) {
    console.log(`- ${k}: ${v}`);
  }

  console.log("\n✓ Audit terminé — preuves ci-dessus.\n");
}

main().catch((error) => {
  console.error("✗ Audit échoué:", error);
  process.exit(1);
});
