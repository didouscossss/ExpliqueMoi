#!/usr/bin/env node
/**
 * Tests Didou — moteur local (0 Gemini / 0 fetch).
 */
import assert from "node:assert/strict";
import {
  analyzeDocumentWithDidou,
  runDidouPipeline
} from "../lib/didou/index.js";
import { buildDidoutorContext } from "../lib/didoutor/index.js";
import {
  QUITTANCE_LOYER,
  LIASSE_FISCALE_2031,
  CONVOCATION_AG,
  FACTURE_FREE
} from "../lib/didou/__fixtures__/referenceDocs.mjs";

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  throw new Error("fetch interdit dans Didou: " + url);
};

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}
function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

try {
  // A — Quittance
  {
    const { didou, preview } = analyzeDocumentWithDidou({
      pastedText: QUITTANCE_LOYER
    });
    assert.equal(didou.family, "logement");
    assert.match(String(didou.documentType), /quittance/i);
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /370/);
    assert.ok(
      /payé|quittanc|loyer/i.test(
        `${didou.mainAmount.label} ${didou.mainAmount.meaning} ${didou.mainAmount.role}`
      )
    );
    assert.ok(didou.mainDate?.date);
    assert.match(String(didou.mainDate.date), /juillet|2026/i);
    assert.ok(
      didou.importantFacts.some((f) =>
        /preuve|paiement|payé|quittanc/i.test(`${f.label} ${f.value}`)
      )
    );
    // Pas de dump de dates parasites
    assert.ok((preview.dates || []).length <= 3);
    assert.ok(!/non identifié/i.test(preview.document_type));
    pass(
      "QUITTANCE",
      `${didou.documentType} | ${didou.mainAmount.value} | ${didou.mainDate.date}`
    );
  }

  // B — Liasse fiscale (pas de timeout Gemini, pas de dump)
  {
    const started = Date.now();
    const { didou, preview } = analyzeDocumentWithDidou({
      pastedText: LIASSE_FISCALE_2031
    });
    const ms = Date.now() - started;
    assert.ok(ms < 2000, `trop lent: ${ms}ms`);
    assert.equal(didou.family, "fiscal");
    assert.match(String(didou.documentType), /liasse|2031|déclaration/i);
    assert.ok(!/^bénéfices professionnels$/i.test(didou.documentType || ""));
    // Pas de liste interminable
    assert.ok((preview.amounts_detail || []).length <= 3);
    assert.ok((preview.dates || []).length <= 3);
    assert.ok(
      !didou.mainAmount ||
        !/table_value|unknown/i.test(didou.mainAmount.role || "")
    );
    pass(
      "LIASSE",
      `${didou.documentType} | ${ms}ms | amounts_detail=${(preview.amounts_detail || []).length}`
    );
  }

  // C — Convocation AG
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_AG
    });
    assert.equal(didou.family, "copropriete");
    assert.match(String(didou.documentType), /convocation|assemblée|copropriété/i);
    assert.ok(didou.mainDate?.date);
    assert.match(didou.mainDate.date, /12\/09\/2026/);
    assert.ok(
      didou.importantFacts.some((f) => /heure|18/i.test(`${f.label} ${f.value}`)) ||
        /18/i.test(didou.mainDate.meaning || "")
    );
    assert.ok(
      didou.actions.length >= 1 ||
        didou.importantFacts.some((f) => /ordre du jour|procuration/i.test(`${f.label} ${f.value}`))
    );
    pass(
      "AG",
      `${didou.documentType} | ${didou.mainDate.date} | actions=${didou.actions.length}`
    );
  }

  // D — Facture (non-régression)
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: FACTURE_FREE
    });
    assert.equal(didou.family, "facture");
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /14,99|14.99/);
    assert.ok(didou.mainDate?.date);
    pass("FACTURE", `${didou.mainAmount.value} | ${didou.mainDate.date}`);
  }

  // E — Texte vide → partiel, pas d’invention
  {
    const didou = runDidouPipeline({ text: "" });
    assert.equal(didou.understandingLevel, "extraction");
    assert.equal(didou.mainAmount, null);
    assert.ok(didou.warnings.length || didou.uncertainties.length);
    pass("EMPTY", didou.understandingLevel);
  }

  // F — Frontière Didoutor
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: QUITTANCE_LOYER
    });
    const ctx = buildDidoutorContext(didou);
    assert.equal(ctx.sourceEngine, "didou");
    assert.ok(ctx.userSummary);
    assert.ok(!("extraction" in ctx));
    pass("DIDOUTOR_CONTEXT", "frontière propre sans extraction brute");
  }

  assert.equal(fetchCalls, 0);
  pass("NO_NETWORK", `fetch=${fetchCalls}`);
} catch (error) {
  fail("UNEXPECTED", error?.stack || error?.message || String(error));
} finally {
  globalThis.fetch = originalFetch;
}

if (process.exitCode) {
  console.error("Didou engine tests FAILED");
  process.exit(1);
}

console.log("Didou engine tests PASSED");
