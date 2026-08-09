/**
 * Tests V4-C — RelationEngine + GlobalConsistencyEngine.
 * Usage: npm run test:v4-consistency
 */

import assert from "node:assert/strict";
import {
  analyzeDocumentText,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function assignmentValue(solution, role) {
  return solution?.assignments?.find((a) => a.role === role)?.value;
}

function main() {
  console.log("=== test-v4-consistency (V4-C) ===");
  resetCandidateIdsForTests();
  resetRelationIdsForTests();

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-C");
  };

  try {
    section("Test A — facture cohérente HT+TVA=TTC");
    {
      const text = `
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim();
      const { consistency, relations } = analyzeDocumentText(text);
      const best = consistency.best;
      console.log("  status=", consistency.status);
      console.log(
        "  assignments=",
        best?.assignments?.map((a) => ({ role: a.role, value: a.value }))
      );
      const arith = relations.relations.filter((r) => r.type === "arithmetic");
      console.log(
        "  arithmetic=",
        arith.map((r) => ({
          label: r.label,
          score: r.score,
          reasons: r.reasons.map((x) => x.signal)
        }))
      );
      assert.ok(best, "solution attendue");
      assert.equal(assignmentValue(best, "amountHT"), 21.66);
      assert.equal(assignmentValue(best, "vatAmount"), 4.33);
      assert.equal(assignmentValue(best, "vatRate"), 20);
      assert.equal(assignmentValue(best, "amountTTC"), 25.99);
      assert.ok(arith.some((r) => /HT \+ TVA/i.test(r.label || "")));
      assert.ok(
        arith.some((r) =>
          r.reasons.some((x) => /HT×\(1\+taux/.test(x.signal) || /1\+taux/.test(x.signal))
        )
      );
      assert.notEqual(best.status, "contradictory");
      console.log("  OK combinaison 21.66 / 20 / 4.33 / 25.99");
    }

    section("Test B — capital social parasite");
    {
      const text = `
Capital social : 10 000 000 €
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim();
      const { consistency } = analyzeDocumentText(text);
      const best = consistency.best;
      assert.equal(assignmentValue(best, "amountTTC"), 25.99);
      assert.notEqual(assignmentValue(best, "amountTTC"), 10_000_000);
      const capitalWins = consistency.solutions.some(
        (s) =>
          assignmentValue(s, "amountTTC") === 10_000_000 &&
          s.status === "resolved" &&
          s.score > (best?.score || 0)
      );
      assert.equal(capitalWins, false);
      console.log("  OK total=25.99, capital écarté");
    }

    section("Test C — contradiction HT+TVA≠TTC");
    {
      const text = `
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 21,66 €
`.trim();
      const { consistency, relations } = analyzeDocumentText(text);
      console.log("  status=", consistency.status);
      console.log(
        "  contradictions=",
        relations.contradictions.map((c) => c.message)
      );
      assert.ok(
        relations.contradictions.length >= 1 ||
          consistency.status === "contradictory" ||
          consistency.solutions.some((s) => s.contradictions.length > 0),
        "contradiction détectée"
      );
      const hasMismatch = [
        ...relations.contradictions,
        ...(consistency.best?.contradictions || [])
      ].some((c) => /≠|mismatch/i.test(c.message + c.kind));
      assert.ok(hasMismatch, "message d’incohérence arithmétique");
      console.log("  OK contradiction");
    }

    section("Test D — ambiguïté entre deux TTC plausibles");
    {
      const text = `
Facture
Total TTC : 25,99 €
Montant TTC : 26,10 €
`.trim();
      const { consistency } = analyzeDocumentText(text);
      console.log("  status=", consistency.status);
      console.log(
        "  top solutions=",
        consistency.solutions.slice(0, 3).map((s) => ({
          status: s.status,
          score: Number(s.score.toFixed(3)),
          ttc: assignmentValue(s, "amountTTC")
        }))
      );
      const ttcValues = new Set(
        consistency.solutions
          .filter((s) => s.status !== "contradictory")
          .map((s) => assignmentValue(s, "amountTTC"))
          .filter((v) => v != null)
      );
      assert.ok(ttcValues.has(25.99) && ttcValues.has(26.1));
      assert.ok(
        consistency.status === "ambiguous" ||
          consistency.best?.status === "ambiguous" ||
          consistency.solutions.filter((s) => s.status === "ambiguous").length >=
            1,
        "status ambiguous attendu"
      );
      console.log("  OK ambiguous");
    }

    section("Test E — action ↔ deadline");
    {
      const text = `Merci de retourner ce formulaire avant le 15 septembre 2026.`;
      const { candidates, relations } = analyzeDocumentText(text);
      const actions = candidates.filter((c) => c.type === "action");
      const dates = candidates.filter((c) => c.type === "date");
      console.log(
        "  actions=",
        actions.map((a) => a.value),
        "dates=",
        dates.map((d) => d.value)
      );
      const links = relations.relations.filter((r) => r.type === "actionDeadline");
      console.log(
        "  actionDeadline=",
        links.map((r) => ({
          score: r.score,
          reasons: r.reasons.map((x) => x.signal)
        }))
      );
      assert.ok(actions.length >= 1, "action détectée");
      assert.ok(dates.some((d) => d.value === "2026-09-15"), "date 2026-09-15");
      assert.ok(links.length >= 1, "relation actionDeadline");
      console.log("  OK actionDeadline");
    }

    section("Test F — émetteur / destinataire");
    {
      const text = `
Émetteur : Société Exemple
Destinataire : Jean Dupont
`.trim();
      const { candidates, relations } = analyzeDocumentText(text);
      const orgs = candidates.filter((c) => c.type === "organization");
      const persons = candidates.filter((c) => c.type === "person");
      console.log(
        "  orgs=",
        orgs.map((o) => o.value),
        "persons=",
        persons.map((p) => p.value)
      );
      const types = new Set(relations.relations.map((r) => r.type));
      console.log("  relation types=", [...types]);
      assert.ok(
        orgs.some((o) => /société exemple/i.test(String(o.value))),
        "organisation émetteur"
      );
      assert.ok(
        persons.some((p) => /jean dupont/i.test(String(p.value))),
        "personne destinataire"
      );
      assert.ok(types.has("issuer") || types.has("sender"), "relation issuer/sender");
      assert.ok(types.has("recipient"), "relation recipient");
      assert.ok(
        types.has("organizationPerson") || types.has("ownership"),
        "lien org ↔ person"
      );
      console.log("  OK relations émetteur/destinataire");
    }

    assert.equal(fetchCalls, 0, "0 fetch");
    console.log("\n✓ V4-C consistency OK — 0 appel réseau / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-C:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
