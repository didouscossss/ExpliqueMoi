/**
 * Tests OpenAIProvider V3 — mocks uniquement (aucun appel payant).
 * Usage: npm run test:v3-openai
 */

import assert from "node:assert/strict";
import {
  OpenAIProvider,
  ProviderFactory,
  buildAIContext,
  createProviderConfig,
  createProviderConfigFromEnv,
  getAIProvider,
  toOpenAISafePayload
} from "../lib/v3/providers/index.js";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";

const SAMPLE_TEXT = `
FACTURE N° FA-2026-0142
SAS DUPONT SERVICES
SIRET: 73282932000074
Client: Mme Alice Martin
Date d'émission: 12/03/2026
Montant HT: 100,00 €
TVA 20%: 20,00 €
Montant TTC: 120,00 €
`.trim();

function section(title) {
  console.log(`\n▸ ${title}`);
}

function mockFetch(handler) {
  return async (url, init) => handler(url, init);
}

function openaiJsonResponse(obj, status = 200) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(obj) } }]
  }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function openaiHttpError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function testMissingKey() {
  section("clé absente");
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const provider = new OpenAIProvider(
    createProviderConfig({ provider: "openai", options: {} })
  );
  const local = analyzeLocally(SAMPLE_TEXT);
  const context = buildAIContext({ text: SAMPLE_TEXT, localAnalysis: local });
  const result = await provider.analyze(context);

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "MISSING_API_KEY");
  assert.equal(result.provider, "openai");
  console.log("  OK", result.error);

  if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
}

async function testUnknownProvider() {
  section("provider inconnu");
  const factory = new ProviderFactory();
  assert.throws(
    () => factory.create({ provider: "mistral" }),
    /inconnu|enregistré/i
  );
  console.log("  OK");
}

async function testAnalyzeTextMocked() {
  section("analyse texte simple (mock)");
  let sawBody = null;

  const provider = new OpenAIProvider(
    createProviderConfig({
      provider: "openai",
      model: "gpt-4o-mini",
      options: { apiKey: "sk-test-fake" }
    }),
    {
      fetchImpl: mockFetch(async (_url, init) => {
        sawBody = JSON.parse(init.body);
        return openaiJsonResponse({
          summary: "Facture de 120 € TTC pour Alice Martin.",
          documentType: "facture",
          keyPoints: ["TTC 120"],
          warnings: []
        });
      })
    }
  );

  const local = analyzeLocally(SAMPLE_TEXT);
  const context = buildAIContext({
    ocrResult: {
      pages: [{ pageNumber: 1, text: SAMPLE_TEXT, confidence: 99 }],
      fullText: SAMPLE_TEXT,
      warnings: []
    },
    localAnalysis: local
  });

  const result = await provider.analyze(context);
  assert.equal(result.ok, true);
  assert.match(String(result.summary), /120|Facture/i);
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(sawBody.model, "gpt-4o-mini");
  assert.equal(sawBody.messages.length, 2);

  const userPayload = JSON.parse(sawBody.messages[1].content);
  assert.ok(userPayload.text.includes("FACTURE"));
  assert.ok(userPayload.localAnalysis);
  assert.equal(userPayload.file, undefined);
  assert.equal(userPayload.pdf, undefined);
  assert.equal(userPayload.bytes, undefined);
  console.log("  OK summary=", result.summary);
}

async function testHttpError() {
  section("erreur HTTP simulée 429");
  const provider = new OpenAIProvider(
    createProviderConfig({
      provider: "openai",
      options: { apiKey: "sk-test-fake" }
    }),
    {
      fetchImpl: mockFetch(async () =>
        openaiHttpError(429, "Rate limit exceeded")
      )
    }
  );

  const context = buildAIContext({
    text: SAMPLE_TEXT,
    localAnalysis: analyzeLocally(SAMPLE_TEXT)
  });
  const result = await provider.analyze(context);
  assert.equal(result.ok, false);
  assert.equal(result.error?.httpStatus, 429);
  assert.equal(result.error?.code, "PROVIDER_HTTP_ERROR");
  assert.match(result.error.message, /Rate limit/i);
  console.log("  OK", result.error);
}

async function testNoRawDocumentRequired() {
  section("aucun document brut requis");
  const context = buildAIContext({
    ocrResult: {
      pages: [{ pageNumber: 1, text: SAMPLE_TEXT, confidence: 100 }],
      fullText: SAMPLE_TEXT,
      warnings: []
    },
    localAnalysis: analyzeLocally(SAMPLE_TEXT)
  });
  const safe = toOpenAISafePayload(context);
  assert.ok(safe.text);
  assert.ok(safe.localAnalysis);
  assert.equal("file" in safe, false);
  assert.equal("pdf" in safe, false);
  assert.equal("bytes" in safe, false);
  assert.equal("base64" in safe, false);
  assert.equal("images" in safe, false);

  assert.throws(
    () => buildAIContext({ text: "", ocrResult: { pages: [], fullText: "", warnings: [] } }),
    /texte exploitable|PDF brut/i
  );
  console.log("  OK payload sûr");
}

async function testEnvConfig() {
  section("createProviderConfigFromEnv");
  const prev = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  process.env.OPENAI_API_KEY = "sk-env-fake";

  const config = createProviderConfigFromEnv();
  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4o-mini");
  assert.equal(config.options.apiKey, "sk-env-fake");

  const provider = getAIProvider(config, {
    fetchImpl: mockFetch(async () =>
      openaiJsonResponse({ summary: "ok", warnings: [] })
    )
  });
  assert.equal(provider.name, "openai");

  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  console.log("  OK env branché");
}

async function main() {
  console.log("test-v3-openai — OpenAIProvider (mocks)");
  await testMissingKey();
  await testUnknownProvider();
  await testAnalyzeTextMocked();
  await testHttpError();
  await testNoRawDocumentRequired();
  await testEnvConfig();
  console.log("\n✓ Tests OpenAIProvider V3 OK (0 appel payant).\n");
}

main().catch((error) => {
  console.error("\n✗ Échec:", error);
  process.exit(1);
});
