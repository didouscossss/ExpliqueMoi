/**
 * Tests architecture providers V3.
 * Usage: npm run test:v3-providers
 */

import assert from "node:assert/strict";
import {
  ProviderFactory,
  createProviderConfig,
  DEFAULT_PROVIDER_CONFIG,
  providerFactory
} from "../lib/v3/providers/index.js";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function testConfig() {
  section("ProviderConfig");
  const config = createProviderConfig({
    provider: "openai",
    model: "gpt-4o-mini",
    timeoutMs: 12_000
  });
  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4o-mini");
  assert.equal(config.timeoutMs, 12_000);
  assert.equal(DEFAULT_PROVIDER_CONFIG.provider, "openai");
  console.log("  OK", config);
}

function testFactoryDefaults() {
  section("ProviderFactory — OpenAI enregistré");
  assert.equal(providerFactory.has("openai"), true);
  assert.deepEqual(providerFactory.list(), ["openai"]);
  assert.equal(providerFactory.has("mistral"), false);
  console.log("  OK list=", providerFactory.list());
}

function testUnknown() {
  section("provider inconnu");
  const factory = new ProviderFactory();
  assert.throws(() => factory.create({ provider: "nope" }), /inconnu/i);
  console.log("  OK");
}

async function main() {
  console.log("test-v3-providers — architecture + OpenAI branché");
  testConfig();
  testFactoryDefaults();
  testUnknown();
  console.log("\n✓ Architecture providers V3 OK.\n");
}

main().catch((error) => {
  console.error("\n✗ Échec:", error);
  process.exit(1);
});
