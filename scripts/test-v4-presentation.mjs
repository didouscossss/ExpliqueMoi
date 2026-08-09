/**
 * Tests V4-H — Moteur de formulation utilisateur déterministe.
 * Usage: npm run test:v4-presentation
 */

import assert from "node:assert/strict";
import {
  presentDocumentText,
  presentationInvariantsHold,
  buildUserPresentation,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return presentDocumentText(text);
}

function assertClean(p, explanation) {
  assert.equal(p.unsupportedPresentationFacts, 0);
  assert.equal(p.inventedActions, 0);
  assert.equal(p.inventedDeadlines, 0);
  assert.equal(p.inventedAmounts, 0);
  assert.equal(p.inventedReasons, 0);
  assert.deepEqual(presentationInvariantsHold(p), []);
  // Chaque affirmation → sourceFacts → Explanation
  for (const item of [
    ...p.essential,
    ...p.actions,
    ...(p.reason ? [p.reason] : []),
    ...p.importantDates,
    ...p.importantAmounts,
    ...p.warnings,
    ...p.secondaryInformation
  ]) {
    assert.ok(item.sourceFacts.length > 0, `source manquante: ${item.text}`);
  }
  // V4-H ne contourne pas V4-G : rebuild depuis explanation seule
  const rebuilt = buildUserPresentation(explanation);
  assert.equal(rebuilt.documentIdentity.documentType, p.documentIdentity.documentType);
}

function main() {
  console.log("=== test-v4-presentation (V4-H) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-H");
  };

  try {
    section("A — Facture normale");
    {
      const { presentation: p, explanation } = run(`
Facture n° 12345
Date : 17/11/2025
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
Montant à payer : 25,99 €
`.trim());
      assert.equal(p.documentIdentity.documentType, "invoice");
      assert.match(p.documentIdentity.text, /25,99|25.99/);
      assert.match(p.documentIdentity.text, /17 novembre 2025|17\/11\/2025/);
      assert.ok(p.importantAmounts.some((a) => a.label.includes("TTC")));
      assert.ok(!p.warnings.some((w) => w.kind === "arithmeticInconsistency"));
      assertClean(p, explanation);
      console.log("  identity=", p.documentIdentity.text);
    }

    section("B — Facture sans action → actions=[]");
    {
      const { presentation: p, explanation } = run(`
Facture
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim());
      assert.equal(p.documentIdentity.documentType, "invoice");
      // Pas d'instruction « payez »
      assert.ok(!p.actions.some((a) => /payez|régler|paiement manuel/i.test(a.text)));
      // Sans prélèvement ni action explicite → vide
      assert.equal(p.actions.length, 0);
      assert.ok(p.actions.every((a) => a.kind === "userAction"));
      assertClean(p, explanation);
      console.log("  actions=", p.actions.map((a) => a.text));
    }

    section("C — Facture avec prélèvement automatique");
    {
      const { presentation: p, explanation } = run(`
Facture
Total HT : 80,00 €
TVA 20 % : 16,00 €
Total TTC : 96,00 €
Montant à payer : 96,00 €
Prélèvement automatique
Mandat SEPA
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      assert.equal(p.documentIdentity.documentType, "invoice");
      assert.equal(p.actions.length, 0, "prélèvement ≠ action utilisateur");
      assert.ok(!p.actions.some((a) => /^Payez/i.test(a.text)));
      const payInfo = p.secondaryInformation.filter((s) =>
        ["bankingDetails", "paymentInformation"].includes(s.kind)
      );
      assert.ok(payInfo.length >= 1, "info prélèvement en secondary");
      assert.ok(
        payInfo.some((s) => /pr[eé]l[eè]vement/i.test(s.text)),
        "texte prélèvement"
      );
      assertClean(p, explanation);
      console.log("  payment secondary=", payInfo.map((a) => a.text));
    }

    section("D — Facture contradictoire");
    {
      const { presentation: p, explanation } = run(`
Facture
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 150,00 €
`.trim());
      const ttc = p.importantAmounts.find((a) => a.label.includes("TTC"));
      assert.ok(ttc);
      assert.equal(ttc.value, 150);
      const warn = p.warnings.find((w) => w.kind === "arithmeticInconsistency");
      assert.ok(warn);
      assert.match(warn.text, /incohérents|correspondent pas/i);
      assertClean(p, explanation);
      console.log("  warn=", warn.text, "ttc=", ttc.value);
    }

    section("E — Courrier administratif action + deadline");
    {
      const { presentation: p, explanation } = run(`
Objet : demande de justificatif
Madame, Monsieur,
Nous vous remercions de transmettre votre justificatif de domicile
avant le 15/09/2026.
Cordialement,
`.trim());
      assert.equal(p.documentIdentity.documentType, "administrativeLetter");
      assert.ok(p.actions.some((a) => /justificatif|transmettre/i.test(a.text)));
      assert.ok(
        p.actions.some((a) => /15 septembre 2026|15\/09\/2026/.test(a.text)) ||
          p.importantDates.some((d) => /2026-09-15|15 septembre/.test(String(d.value) + d.text))
      );
      assert.ok(!p.importantAmounts.some((a) => a.kind === "amount" && a.status === "supported"));
      assertClean(p, explanation);
      console.log("  actions=", p.actions.map((a) => a.text));
    }

    section("F — Contrat");
    {
      const { presentation: p, explanation } = run(`
Contrat de prestation
Entre SAS ALPHA et Monsieur Paul Martin
Le présent contrat prend effet le 01/01/2026.
Durée : 12 mois
Résiliation avec préavis de 30 jours avant le 01/12/2026.
`.trim());
      assert.equal(p.documentIdentity.documentType, "contract");
      assert.match(p.documentIdentity.text, /contrat/i);
      assert.ok(!/facture/i.test(p.documentIdentity.text));
      assert.ok(!p.importantAmounts.some((a) => a.field === "principalAmount"));
      assertClean(p, explanation);
      console.log("  identity=", p.documentIdentity.text, "essential=", p.essential.map((e) => e.text));
    }

    section("G — Relevé bancaire");
    {
      const { presentation: p, explanation } = run(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
05/11/2025 VIREMENT SALAIRE 2000,00
Nouveau solde créditeur : 2 955,00 €
Mouvements du compte
`.trim());
      assert.equal(p.documentIdentity.documentType, "bankStatement");
      assert.match(p.documentIdentity.text, /relevé/i);
      assert.ok(
        p.importantAmounts.some((a) => a.kind === "transactions") ||
          p.essential.some((e) => e.kind === "essentialTransactions")
      );
      assert.ok(!p.importantAmounts.some((a) => /principalAmount/i.test(a.label)));
      assertClean(p, explanation);
      console.log("  identity=", p.documentIdentity.text);
    }

    section("H — Facture + IBAN + SEPA ≠ bankStatement");
    {
      const { presentation: p, explanation } = run(`
Facture
Total HT : 80,00 €
TVA 20 % : 16,00 €
Total TTC : 96,00 €
Prélèvement automatique
Mandat SEPA : FR12ZZZ123456
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      assert.equal(p.documentIdentity.documentType, "invoice");
      assert.ok(
        p.secondaryInformation.some((s) =>
          ["bankingDetails", "paymentInformation"].includes(s.kind)
        )
      );
      assert.ok(!p.secondaryInformation.some((s) => s.kind === "bankStatement"));
      assertClean(p, explanation);
      console.log("  secondary=", p.secondaryInformation.map((s) => s.kind));
    }

    section("I — Ambiguïté dates");
    {
      const { presentation: p, explanation } = run(`
Facture
SAS BETA
Date de facture : 01/06/2026
Date d'émission : 02/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
`.trim());
      const amb = p.importantDates.find((d) => d.status === "ambiguous");
      assert.ok(amb, "ambiguïté visible");
      assert.ok(Array.isArray(amb.value) && amb.value.length >= 2);
      assert.match(amb.text, /pas certaine|certain/i);
      assertClean(p, explanation);
      console.log("  amb=", amb.text, amb.value);
    }

    section("J — Document minimal anti-hallucination");
    {
      const { presentation: p, explanation } = run(`
INFORMATION

Votre dossier a été mis à jour.
`.trim());
      assert.equal(p.actions.filter((a) => a.kind === "userAction").length, 0);
      assert.equal(p.importantDates.filter((d) => d.status === "supported" || d.status === "derived").length, 0);
      assert.equal(p.importantAmounts.filter((a) => a.status === "supported" || a.status === "derived").length, 0);
      assert.equal(p.reason, null);
      assertClean(p, explanation);
      console.log("  identity=", p.documentIdentity.text, "reason=", p.reason);
    }

    section("K — Document fiscal sans structure facture imposée");
    {
      const { presentation: p, explanation } = run(`
Avis d'impôt sur le revenu
Période fiscale 2024
Référence : REF-TAX-9
Montant à payer : 642,00 €
Date limite de paiement : 20/10/2025
`.trim());
      assert.equal(p.documentIdentity.documentType, "taxDocument");
      assert.match(p.documentIdentity.text, /fiscal/i);
      assert.ok(!/Il s'agit d'une facture/i.test(p.documentIdentity.text));
      assert.ok(
        p.importantAmounts.some((a) => Number(a.value) === 642) ||
          p.essential.some((e) => /642/.test(e.text))
      );
      assert.ok(!/interprétation|pénalité fiscale invent/i.test(JSON.stringify(p)));
      assertClean(p, explanation);
      console.log("  identity=", p.documentIdentity.text, "amounts=", p.importantAmounts.map((a) => a.text));
    }

    section("Invariants + pas de lecture PDF/OCR directe");
    {
      // buildUserPresentation n'accepte que DocumentExplanation
      assert.equal(typeof buildUserPresentation, "function");
      assert.equal(fetchCalls, 0);
      console.log("  OK unsupportedPresentationFacts=0, 0 fetch, formulation seule");
    }

    console.log("\n✓ V4-H presentation OK — 0 fetch / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-H:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
