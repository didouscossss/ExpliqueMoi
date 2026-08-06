/**
 * Tests architecture providers V3 (aucun réseau, aucun secret).
 * Usage: npm run test:v3-providers
 */

import assert from "node:assert/strict";
import {
  ProviderFactory,
  createProviderConfig,
  DEFAULT_PROVIDER_CONFIG,
  getAIProvider,
  providerFactory
} from "../lib/v3/providers/index.js";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function testConfig() {
  section("ProviderConfig");
  const config = createProviderConfig({ provider: "gemini", model: "x", timeoutMs: 12_000 });
  assert.equal(config.provider, "gemini");
  assert.equal(config.model, "x");
  assert.equal(config.timeoutMs, 12_000);
  assert.equal(DEFAULT_PROVIDER_CONFIG.provider, "none");
  console.log("  OK", config);
}

function testEmptyFactory() {
  section("ProviderFactory vide");
  const factory = new ProviderFactory();
  assert.equal(factory.list().length, 0);
  assert.equal(factory.has("gemini"), false);
  assert.throws(
    () => factory.create({ provider: "gemini" }),
    /aucun provider enregistré/i
  );
  assert.throws(() => getAIProvider({ provider: "openai" }), /aucun provider/i);
  assert.equal(providerFactory.list().length, 0);
  console.log("  OK erreurs explicites, aucun réseau");
}

function testRegisterStub() {
  section("register stub local (sans réseau)");
  const factory = new ProviderFactory();

  class StubProvider {
    name = "stub";
    constructor(config) {
      this.config = config;
    }
    async analyze() {
      return {
        ok: true,
        version: "v3",
        summary: "stub",
        localAnalysis: null,
        explanation: null,
        warnings: [],
        provider: this.name,
        model: this.config.model || null
      };
    }
    async answer() {
      return {
        ok: true,
        answer: "ok",
        provider: this.name
      };
    }
    async summarize() {
      return {
        ok: true,
        summary: "résumé stub",
        provider: this.name
      };
    }
  }

  factory.register("stub", StubProvider);
  assert.deepEqual(factory.list(), ["stub"]);
  const provider = factory.create({ provider: "STUB", model: "local-test" });
  assert.equal(provider.name, "stub");
  console.log("  OK factory opaque →", provider.name);
}

async function main() {
  console.log("test-v3-providers — architecture générique");
  testConfig();
  testEmptyFactory();
  testRegisterStub();
  console.log("\n✓ Architecture providers V3 OK (0 appel réseau).\n");
}

main().catch((error) => {
  console.error("\n✗ Échec:", error);
  process.exit(1);
});
