/**
 * Tests V4-B — CandidateExtractor + HypothesisEngine.
 * Usage: npm run test:v4-candidates
 */

import assert from "node:assert/strict";
import {
  extractAndScoreCandidates,
  parseFrenchMoney,
  parseFrenchPercentage,
  resetCandidateIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function byValue(candidates, value, type) {
  return candidates.filter(
    (c) =>
      (!type || c.type === type) &&
      (typeof value === "number"
        ? Math.abs(Number(c.value) - value) < 0.001
        : String(c.value) === String(value))
  );
}

function topRole(candidate) {
  return candidate?.hypotheses?.[0] || null;
}

function roleScore(candidate, role) {
  return candidate?.hypotheses?.find((h) => h.role === role)?.score ?? 0;
}

function main() {
  console.log("=== test-v4-candidates (V4-B) ===");
  resetCandidateIdsForTests();

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-B");
  };

  try {
    section("Formats montants / pourcentages FR");
    assert.equal(parseFrenchMoney("1 103,14 €"), 1103.14);
    assert.equal(parseFrenchMoney("1103.14 EUR"), 1103.14);
    assert.equal(parseFrenchMoney("1.103,14 €"), 1103.14);
    assert.equal(parseFrenchPercentage("20 %"), 20);
    assert.equal(parseFrenchPercentage("20,00 %"), 20);
    console.log("  OK parsers");

    section("Facture synthétique HT / TVA% / TVA€ / TTC");
    {
      const text = `
Facture
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim();
      const candidates = extractAndScoreCandidates(text);
      console.log(
        "  candidates=",
        candidates.map((c) => ({
          type: c.type,
          value: c.value,
          top: topRole(c)?.role,
          score: topRole(c)?.score,
          reasons: topRole(c)?.reasons?.slice(0, 3)
        }))
      );

      const ht = byValue(candidates, 21.66, "money")[0];
      const rate = byValue(candidates, 20, "percentage")[0];
      const vat = byValue(candidates, 4.33, "money")[0];
      const ttc = byValue(candidates, 25.99, "money")[0];

      assert.ok(ht, "21.66 MoneyCandidate");
      assert.ok(rate, "20 PercentageCandidate");
      assert.ok(vat, "4.33 MoneyCandidate");
      assert.ok(ttc, "25.99 MoneyCandidate");

      assert.equal(ht.type, "money");
      assert.equal(rate.type, "percentage");
      assert.equal(vat.type, "money");
      assert.equal(ttc.type, "money");

      assert.ok(
        roleScore(ht, "amountHT") > roleScore(ht, "amountTTC"),
        "21.66 favorise amountHT"
      );
      assert.ok(
        roleScore(ttc, "amountTTC") > roleScore(ttc, "amountHT"),
        "25.99 favorise amountTTC"
      );
      assert.ok(
        roleScore(vat, "vatAmount") >= roleScore(vat, "amountHT"),
        "4.33 favorise vatAmount"
      );
      assert.ok(
        roleScore(rate, "vatRate") > 0.4,
        "20% favorise vatRate"
      );
      // 20% ne doit pas être un money/vatAmount
      assert.equal(byValue(candidates, 20, "money").length, 0);
      console.log("  OK hypothèses HT/TVA/TTC");
    }

    section("N° client ≠ person");
    {
      const text = `N° client : 2009682949\nClient: Mme Alice Martin`;
      const candidates = extractAndScoreCandidates(text);
      const refs = byValue(candidates, "2009682949", "reference");
      const persons = candidates.filter((c) => c.type === "person");
      assert.ok(refs.length >= 1, "référence détectée");
      assert.ok(
        persons.every((p) => !String(p.value).includes("2009682949")),
        "2009682949 ne doit pas être person"
      );
      assert.ok(roleScore(refs[0], "clientNumber") > 0.4);
      console.log("  OK reference clientNumber, persons=", persons.map((p) => p.value));
    }

    section("Capital social vs Total TTC");
    {
      const text = `
SAS DEMO
Capital social : 10 000 000 €
Total TTC : 25,99 €
`.trim();
      const candidates = extractAndScoreCandidates(text);
      const capital = byValue(candidates, 10_000_000, "money")[0];
      const ttc = byValue(candidates, 25.99, "money")[0];
      assert.ok(capital && ttc);
      const capitalAsTtc = roleScore(capital, "amountTTC");
      const ttcAsTtc = roleScore(ttc, "amountTTC");
      console.log("  scores amountTTC", { capitalAsTtc, ttcAsTtc });
      assert.ok(
        ttcAsTtc > capitalAsTtc,
        "25,99 doit mieux scorer amountTTC que 10 000 000"
      );
      assert.ok(
        roleScore(capital, "capitalSocial") > capitalAsTtc,
        "10M favorise capitalSocial plutôt que total"
      );
      console.log("  OK capital pénalisé pour total");
    }

    section("Formats FR dans un même document");
    {
      const text = `
Total : 1 103,14 €
Autre : 1103.14 EUR
Encore : 1.103,14 €
Taux : 20 %
Taux bis : 20,00 %
`.trim();
      const candidates = extractAndScoreCandidates(text);
      const monies = candidates.filter(
        (c) => c.type === "money" && Math.abs(Number(c.value) - 1103.14) < 0.001
      );
      const pcts = candidates.filter(
        (c) => c.type === "percentage" && Number(c.value) === 20
      );
      assert.ok(monies.length >= 2, "plusieurs formats 1103.14");
      assert.ok(pcts.length >= 2, "20 % et 20,00 %");
      console.log("  OK money=", monies.length, "pct=", pcts.length);
    }

    assert.equal(fetchCalls, 0, "0 fetch");
    console.log("\n✓ V4-B candidates OK — 0 appel réseau");
  } catch (err) {
    console.error("\n✗ Échec V4-B:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
