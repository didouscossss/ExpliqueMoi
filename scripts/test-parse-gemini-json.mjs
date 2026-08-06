#!/usr/bin/env node
/**
 * Unit tests for parseGeminiJson — no Gemini key required.
 */
import { parseGeminiJson } from "../lib/geminiAnalysis.js";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

const lean = {
  document_type: "Facture",
  plain_summary: "C’est une facture.",
  request: "Payer",
  confidence: 90,
  reading_quality: "full"
};

// 1. JSON propre
assert(
  parseGeminiJson(JSON.stringify(lean)).document_type === "Facture",
  "plain JSON"
);

// 2. Markdown fences
assert(
  parseGeminiJson("```json\n" + JSON.stringify(lean) + "\n```").confidence ===
    90,
  "markdown fences"
);

// 3. Texte autour
assert(
  parseGeminiJson(
    "Voici le résultat:\n" + JSON.stringify(lean) + "\nFin."
  ).reading_quality === "full",
  "text around JSON"
);

// 4. Trailing comma
assert(
  parseGeminiJson('{"document_type":"X","plain_summary":"Y","request":"Z","confidence":1,"reading_quality":"full",}').document_type ===
    "X",
  "trailing comma repair"
);

// 5. JSON tronqué (réparation)
const truncated =
  '{"document_type":"Avis","plain_summary":"C’est un avis.","request":"Répondre","confidence":70,"reading_quality":"partial","dates":[{"date":"01/01/2026","label":"échéance"';
try {
  const repaired = parseGeminiJson(truncated);
  assert(
    repaired.document_type === "Avis" && Array.isArray(repaired.dates),
    "truncated JSON repair"
  );
} catch (error) {
  assert(false, "truncated JSON repair threw: " + error.message);
}

// 6. Vide → erreur explicite
try {
  parseGeminiJson("   ");
  assert(false, "empty should throw");
} catch (error) {
  assert(/vide/i.test(error.message), "empty throws explicit error");
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log("\nAll parseGeminiJson tests passed.");
