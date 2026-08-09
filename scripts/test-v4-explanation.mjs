/**
 * Tests V4-G — Couche d’explication déterministe et traçable.
 * Usage: npm run test:v4-explanation
 */

import assert from "node:assert/strict";
import {
  explainDocumentText,
  explanationInvariantsHold,
  SECONDARY_SECTION_KINDS,
  DOCUMENT_TYPE_IDS,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return explainDocumentText(text);
}

function amount(ex, field) {
  return ex.amounts.find((a) => a.field === field || a.kind === field);
}

function assertProvenance(fact, label) {
  assert.ok(fact, `${label} manquant`);
  assert.ok(fact.evidence?.length > 0, `${label}: evidence vide`);
  for (const e of fact.evidence) {
    assert.ok(e.text && e.text.length > 0, `${label}: text`);
    assert.ok(typeof e.page === "number", `${label}: page`);
    assert.ok(e.blockId != null, `${label}: blockId`);
  }
}

function assertNoUnsupported(ex) {
  assert.equal(ex.unsupportedExplanationFacts, 0);
  assert.deepEqual(explanationInvariantsHold(ex), []);
}

function main() {
  console.log("=== test-v4-explanation (V4-G) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-G");
  };

  try {
    section("A — Facture normale HT+TVA=TTC");
    {
      const { explanation: ex, blocks } = run(`
Facture n° 12345
Date : 17/11/2025
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
Montant à payer : 25,99 €
`.trim());
      assert.equal(ex.documentType.primary, "invoice");
      const htVal = amount(ex, "amountHT")?.value;
      assert.ok(
        htVal === 21.66 || (Array.isArray(htVal) && htVal.includes(21.66)),
        "amountHT doit conserver 21.66"
      );
      assert.equal(amount(ex, "vatAmount")?.value, 4.33);
      assert.equal(amount(ex, "amountTTC")?.value, 25.99);
      assertProvenance(amount(ex, "amountTTC"), "amountTTC");
      const arith = amount(ex, "arithmeticConsistency");
      assert.ok(arith, "relation dérivée HT+TVA≈TTC");
      assert.equal(arith.status, "derived");
      assert.ok(arith.derivedFrom.some((d) => /arithmetic|amountHT|amountTTC/.test(d)));
      assert.ok(arith.evidence.length >= 2);
      for (const e of arith.evidence) {
        assert.ok(blocks.some((b) => b.id === e.blockId));
      }
      assert.ok(!ex.warnings.some((w) => w.kind === "arithmeticInconsistency"));
      assertNoUnsupported(ex);
      console.log(
        "  amounts=",
        ex.amounts.map((a) => `${a.field}:${a.value}:${a.status}`),
        "unsupported=",
        ex.unsupportedExplanationFacts
      );
    }

    section("B — Facture contradictoire HT+TVA≠TTC");
    {
      const { explanation: ex } = run(`
Facture
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 150,00 €
`.trim());
      assert.equal(amount(ex, "amountTTC")?.value, 150);
      const warn = ex.warnings.find((w) => w.kind === "arithmeticInconsistency");
      assert.ok(warn);
      assert.equal(warn.status, "contradictory");
      assert.ok(warn.evidence.length >= 2);
      assert.match(warn.message, /150|≠|!=|TTC/i);
      assertNoUnsupported(ex);
      console.log("  warning=", warn.message, "ttc=", amount(ex, "amountTTC")?.value);
    }

    section("C — Courrier administratif action + deadline");
    {
      const { explanation: ex } = run(`
Objet : demande de justificatif
Madame, Monsieur,
Nous vous remercions de transmettre votre justificatif de domicile
avant le 15/09/2026.
Cordialement,
`.trim());
      assert.equal(ex.documentType.primary, "administrativeLetter");
      const acts = ex.actions.filter((a) => a.status !== "noExplicitActionDetected");
      assert.ok(acts.length >= 1);
      assert.match(String(acts[0].description || ""), /justificatif|transmettre/i);
      assert.ok(acts[0].deadline);
      assert.equal(acts[0].deadline.value, "2026-09-15");
      assertProvenance(acts[0], "action");
      assertProvenance(acts[0].deadline, "deadline");
      assert.ok(!ex.amounts.some((a) => a.status === "supported" || a.status === "derived"));
      assertNoUnsupported(ex);
      console.log(
        "  action=",
        acts[0].description,
        "deadline=",
        acts[0].deadline.value
      );
    }

    section("D — Relevé bancaire transactions + soldes");
    {
      const { explanation: ex } = run(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
05/11/2025 VIREMENT SALAIRE 2000,00
Nouveau solde créditeur : 2 955,00 €
Mouvements du compte
`.trim());
      assert.equal(ex.documentType.primary, "bankStatement");
      const tx = amount(ex, "transactions");
      assert.ok(tx && Array.isArray(tx.value) && tx.value.length >= 2);
      assert.ok(!ex.amounts.some((a) => a.field === "principalAmount"));
      assert.ok(
        amount(ex, "openingBalance") || amount(ex, "closingBalance") || tx
      );
      assertNoUnsupported(ex);
      console.log("  tx=", tx.value, "open=", amount(ex, "openingBalance")?.value);
    }

    section("E — Facture + IBAN + SEPA → secondary fonctionnel ≠ bankStatement");
    {
      const { explanation: ex, classification } = run(`
Facture
Total HT : 80,00 €
TVA 20 % : 16,00 €
Total TTC : 96,00 €
Prélèvement automatique
Mandat SEPA : FR12ZZZ123456
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      assert.equal(classification.primary, "invoice");
      assert.equal(ex.documentType.primary, "invoice");
      const kinds = ex.secondaryInformation.map((s) => s.sectionKind);
      assert.ok(kinds.includes("bankingDetails") || kinds.includes("paymentInformation"));
      assert.ok(!kinds.includes("bankStatement"));
      for (const s of ex.secondaryInformation) {
        assert.ok(SECONDARY_SECTION_KINDS.includes(s.sectionKind));
        assert.ok(!DOCUMENT_TYPE_IDS.includes(s.sectionKind));
      }
      assertNoUnsupported(ex);
      console.log("  secondary=", kinds);
    }

    section("F — Ambiguïté de dates conservée");
    {
      const { explanation: ex } = run(`
Facture
SAS BETA
Date de facture : 01/06/2026
Date d'émission : 02/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
`.trim());
      const amb =
        ex.importantFacts.find((f) => f.status === "ambiguous") ||
        ex.deadlines.find((f) => f.status === "ambiguous") ||
        ex.amounts.find((f) => f.status === "ambiguous");
      assert.ok(amb, "ambiguïté conservée");
      assert.equal(amb.status, "ambiguous");
      assert.ok(
        Array.isArray(amb.value) && amb.value.length >= 2,
        "aucune sélection arbitraire — candidats conservés"
      );
      assertNoUnsupported(ex);
      console.log("  ambiguous=", amb.field, amb.value);
    }

    section("G — Document minimal anti-hallucination");
    {
      const { explanation: ex } = run(`
INFORMATION

Votre dossier a été mis à jour.
`.trim());
      assert.equal(ex.unsupportedExplanationFacts, 0);
      assert.ok(!ex.amounts.length);
      assert.ok(!ex.deadlines.length);
      assert.ok(
        ex.actions.every(
          (a) =>
            a.status === "noExplicitActionDetected" ||
            (a.description && a.evidence.length > 0)
        )
      );
      assert.ok(!ex.warnings.some((w) => w.kind === "arithmeticInconsistency"));
      assertNoUnsupported(ex);
      console.log(
        "  summary=",
        ex.summaryFacts.map((f) => f.field),
        "actions=",
        ex.actions.map((a) => a.status)
      );
    }

    assert.equal(fetchCalls, 0);
    console.log("\n✓ V4-G explanation OK — 0 fetch / 0 LLM — unsupportedExplanationFacts=0");
  } catch (err) {
    console.error("\n✗ Échec V4-G:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
