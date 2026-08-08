/**
 * Tests V4-D — DocumentSchemaRouter / classification multi-signaux.
 * Usage: npm run test:v4-classification
 */

import assert from "node:assert/strict";
import {
  classifyDocumentText,
  explainClassification,
  supportedDocumentTypes,
  listSchemaProfiles,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function classify(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return classifyDocumentText(text);
}

function main() {
  console.log("=== test-v4-classification (V4-D) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-D");
  };

  try {
    section("Types supportés + profils indépendants");
    {
      const types = supportedDocumentTypes();
      assert.ok(types.includes("invoice"));
      assert.ok(types.includes("bankStatement"));
      assert.ok(types.includes("taxDocument"));
      assert.ok(types.includes("administrativeLetter"));
      assert.ok(types.includes("unknown"));
      const profiles = listSchemaProfiles();
      assert.ok(profiles.every((p) => p.positiveSignals && p.negativeSignals));
      console.log("  OK types=", types.join(", "));
    }

    section("A — facture classique → invoice");
    {
      const { classification } = classify(`
Facture
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim());
      console.log("  primary=", classification.primary, "conf=", classification.confidence.score);
      assert.equal(classification.primary, "invoice");
      assert.notEqual(classification.status, "unknown");
      assert.ok((classification.scores.invoice || 0) > (classification.scores.bankStatement || 0));
    }

    section("B — vrai relevé bancaire → bankStatement");
    {
      const { classification } = classify(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
Nouveau solde créditeur : 955,00 €
Mouvements du compte
`.trim());
      console.log("  primary=", classification.primary, classification.confidence.score);
      assert.equal(classification.primary, "bankStatement");
      assert.ok((classification.scores.bankStatement || 0) > (classification.scores.invoice || 0));
    }

    section("C — facture + IBAN reste invoice");
    {
      const { classification } = classify(`
Facture
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 120,00 €
Prélèvement automatique
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      console.log(
        "  primary=",
        classification.primary,
        "bankScore=",
        classification.scores.bankStatement,
        "secondary=",
        classification.secondarySections
      );
      assert.equal(classification.primary, "invoice");
      assert.ok((classification.scores.bankStatement || 0) < 0.35);
      assert.ok(
        classification.secondarySections.some(
          (s) =>
            s.type === "bankStatement" &&
            s.signals.some((x) => /iban|payment/i.test(x))
        ),
        "IBAN doit apparaître comme section secondaire, pas comme primary bank"
      );
    }

    section("D — courrier administratif");
    {
      const { classification } = classify(`
Objet : Information dossier
Madame, Monsieur,
Nous vous informons que votre dossier est en cours.
Merci de transmettre les pièces avant le 15/09/2026.
Cordialement,
`.trim());
      console.log("  primary=", classification.primary);
      assert.equal(classification.primary, "administrativeLetter");
    }

    section("E — formulaire");
    {
      const { classification } = classify(`
Formulaire de demande
Nom :
Prénom :
Date de naissance :
Adresse :
[ ] Case à cocher
Signature :
`.trim());
      console.log("  primary=", classification.primary);
      assert.equal(classification.primary, "form");
    }

    section("F — document fiscal");
    {
      const { classification } = classify(`
Avis d'impôt sur le revenu
Direction générale des Finances publiques
Numéro fiscal : 1234567890123
Montant à payer : 642,00 €
Date limite de paiement : 20/10/2025
`.trim());
      console.log("  primary=", classification.primary);
      assert.equal(classification.primary, "taxDocument");
    }

    section("G — document inconnu");
    {
      const { classification } = classify(`
Liste diverse
aaaa bbbb cccc
12345
`.trim());
      console.log("  primary=", classification.primary, "status=", classification.status);
      assert.equal(classification.primary, "unknown");
      assert.equal(classification.status, "unknown");
    }

    section("H — ambiguïté réelle (deux profils proches)");
    {
      // Attestation + champs formulaire : form ≈ certificate, sans fausse certitude
      const { classification } = classify(`
Attestation
Je soussigné certifie
Nom :
Prénom :
Date de naissance :
Signature :
`.trim());
      console.log(
        "  primary=",
        classification.primary,
        "status=",
        classification.status,
        "form/cert=",
        classification.scores.form,
        classification.scores.certificate,
        "alts=",
        classification.alternatives.slice(0, 3)
      );
      assert.equal(classification.status, "ambiguous");
      assert.ok(["form", "certificate"].includes(classification.primary));
      const altTypes = classification.alternatives.map((a) => a.type);
      assert.ok(
        altTypes.includes(
          classification.primary === "form" ? "certificate" : "form"
        )
      );
      assert.ok(
        Math.abs(
          (classification.scores.form || 0) -
            (classification.scores.certificate || 0)
        ) < 0.12
      );
      assert.ok(classification.confidence.score < 0.55);
    }

    section("Régression — facture électricité synthétique ≠ relevé");
    {
      const { classification, explanation } = classify(`
Facture d'électricité
Consommation
Total hors taxes 695,19 €
Taxes et contributions 235,71 €
Total hors TVA 930,90 €
TVA 72,24 €
Total facture TTC 1 103,14 €
Montant total TTC 254,32 €
Prochain relevé de compteur
Nouvel échéancier
Prélèvement
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      console.log("  primary=", classification.primary, "status=", classification.status);
      console.log("  scores invoice/bank=", classification.scores.invoice, classification.scores.bankStatement);
      console.log("  secondary=", classification.secondarySections);
      console.log("  explanation:\n   ", explanation.slice(0, 8).join("\n    "));
      assert.equal(classification.primary, "invoice");
      assert.notEqual(classification.primary, "bankStatement");
      assert.ok(
        (classification.scores.invoice || 0) > (classification.scores.bankStatement || 0)
      );
      // IBAN/prélèvement éventuellement secondaire, jamais primary bank
      assert.ok((classification.scores.bankStatement || 0) < 0.4);
      const hasNegBank = classification.evidence.some(
        (e) =>
          e.type === "bankStatement" ||
          /noTransaction|factureLabel|invoiceTotals/i.test(e.signal)
      );
      assert.ok(
        hasNegBank ||
          (classification.scores.bankStatement || 0) <
            (classification.scores.invoice || 0) / 2
      );
    }

    assert.equal(fetchCalls, 0);
    console.log("\n✓ V4-D classification OK — 0 fetch / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-D:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
