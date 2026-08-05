#!/usr/bin/env node
/**
 * Unit tests without GEMINI_API_KEY — budget Gemini + limites.
 */
import assert from "assert";
import { planPdfChunks, MAX_DOCUMENT_SIZE } from "../lib/pdfChunking.js";

// Mock fetch for geminiAnalysis
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, aborted: false });
  const signal = options?.signal;
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({
        ok: false,
        status: 503,
        json: async () => ({
          error: { message: "This model is currently experiencing high demand." }
        })
      });
    }, 1200);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      calls[calls.length - 1].aborted = true;
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
};

process.env.GEMINI_API_KEY = "test-key-not-real";

const { callGeminiForAnalysis } = await import("../lib/geminiAnalysis.js");

const started = Date.now();
const result = await callGeminiForAnalysis([{ text: "hello" }], {
  retries: 1,
  maxModels: 4,
  timeoutMs: 50000,
  deadlineAt: Date.now() + 3500
});
const elapsed = Date.now() - started;

assert.equal(result.ok, false, "should fail under mock 503");
assert.ok(elapsed < 8000, `must respect budget, elapsed=${elapsed}ms`);
assert.ok(
  result.detail?.timeout ||
    result.detail?.budgetExhausted ||
    result.detail?.httpStatus === 503,
  `detail=${JSON.stringify(result.detail)}`
);

console.log("PASS budget_gemini", { elapsed, calls: calls.length, detail: result.detail });

const plan = planPdfChunks({
  pageCount: 1,
  fileSize: 800_000,
  textLength: 100,
  scanned: false
});
assert.equal(plan.mode, "direct");
console.log("PASS plan_small_pdf", plan.reason);

assert.equal(MAX_DOCUMENT_SIZE, 4 * 1024 * 1024);
console.log("PASS max_document_size");

console.log("ALL UNIT OK");
