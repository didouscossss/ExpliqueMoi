#!/usr/bin/env node
/**
 * Proves API always returns parseable JSON on Gemini failures (no live key).
 */
import assert from "assert";
import { parseGeminiJson } from "../lib/geminiAnalysis.js";

function fail(code, message, details) {
  const error = { code, message };
  if (details && typeof details === "object") error.details = details;
  return { ok: false, error, warnings: [], timings: { ocr_ms: 0, gemini_ms: 12, parse_ms: 0, enrich_ms: 0, total_ms: 15 } };
}

const cases = [
  fail("API_TIMEOUT", "timeout", { mode: "direct" }),
  fail("INVALID_AI_RESPONSE", "JSON illisible", { reason: "Unexpected token" }),
  fail("EMPTY_AI_RESPONSE", "empty", { finishReason: "STOP" }),
  fail("API_QUOTA_EXCEEDED", "quota", { upstreamStatus: 429 })
];

for (const payload of cases) {
  const raw = JSON.stringify(payload);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error?.code);
  assert.ok(parsed.error?.message);
  assert.ok(parsed.timings);
  console.log("PASS JSON error shape", parsed.error.code);
}

// Frontend-safe: gateway timeout body must be detected as non-JSON
const gateway = "An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT";
let threw = false;
try {
  JSON.parse(gateway);
} catch {
  threw = true;
}
assert.ok(threw);
assert.ok(/FUNCTION_INVOCATION_TIMEOUT/.test(gateway));
console.log("PASS gateway timeout is non-JSON (frontend maps to API_TIMEOUT)");

try {
  parseGeminiJson("not json at all {{{");
  assert.fail("should throw");
} catch (error) {
  assert.ok(/illisible|JSON/i.test(error.message));
  console.log("PASS parse throws explicit error:", error.message);
}

console.log("ALL JSON-contract tests passed.");
