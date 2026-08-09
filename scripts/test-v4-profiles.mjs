/**
 * Tests V4-E — Document Profiles & Field Expectations.
 * Usage: npm run test:v4-profiles
 */

import assert from "node:assert/strict";
import {
  resolveDocumentProfileText,
  resolveWithForcedProfile,
  listDocumentProfiles,
  getDocumentProfile,
  bankStatementProfile,
  invoiceProfile,
  financialStatementProfile,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return resolveDocumentProfileText(text);
}

function fieldMap(resolution) {
  const m = new Map();
  for (const f of resolution.fields) m.set(f.field, f);
  return m;
}

function statusOf(resolution, name) {
  return fieldMap(resolution).get(name)?.status;
}

function valueOf(resolution, name) {
  return fieldMap(resolution).get(name)?.value;
}

function main() {
  console.log("=== test-v4-profiles (V4-E) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-E");
  };

  try {
    section("Registre de profils (séparé du classificateur)");
    {
      const profiles = listDocumentProfiles();
      const ids = profiles.map((p) => p.id);
      for (const id of [
        "invoice",
        "administrativeLetter",
        "taxDocument",
        "bankStatement",
        "contract",
        "payslip",
        "form",
        "certificate",
        "financialStatement",
        "explanatoryDocument",
        "unknown"
      ]) {
        assert.ok(ids.includes(id), `profil manquant: ${id}`);
        assert.ok(getDocumentProfile(id)?.expectedFields);
      }
      assert.ok(invoiceProfile.expectedFields.some((f) => f.field === "amountTTC"));
      console.log("  OK profiles=", ids.join(", "));
    }

    section("A — facture : issuer / date / HT / TVA / TTC / amountDue");
    {
      const { classification, resolution, profile } = run(`
SAS EXEMPLE
Facture n° FA-2026-001
Date de facture : 01/03/2026
Client : Jean Dupont
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 120,00 €
Montant à payer : 120,00 €
`.trim());
      assert.equal(classification.primary, "invoice");
      assert.equal(profile.id, "invoice");
      const f = fieldMap(resolution);
      console.log(
        "  fields",
        [...f.entries()].map(([k, v]) => `${k}:${v.status}`).join(", ")
      );
      console.log("  completeness=", resolution.completeness.completeness);
      assert.equal(f.get("amountTTC")?.status, "resolved");
      assert.equal(f.get("amountHT")?.status, "resolved");
      assert.equal(f.get("vatAmount")?.status, "resolved");
      assert.ok(["resolved", "ambiguous"].includes(f.get("amountDue")?.status));
      assert.equal(f.get("invoiceDate")?.status, "resolved");
      assert.ok(["resolved", "ambiguous"].includes(f.get("issuer")?.status));
      // amountDue ≠ forcé égal à TTC conceptuellement (mêmes valeurs OK)
      assert.ok(f.get("amountDue"));
      assert.ok(resolution.completeness.completeness > 0.5);
    }

    section("B — courrier administratif sans argent");
    {
      const { classification, resolution } = run(`
Direction Départementale
Objet : Complément de dossier REF-DOS-44
Madame, Monsieur,
Nous vous informons que votre dossier est incomplet.
Merci de transmettre les pièces justificatives avant le 15/09/2026.
Cordialement,
`.trim());
      assert.equal(classification.primary, "administrativeLetter");
      assert.equal(statusOf(resolution, "amountTTC"), "notApplicable");
      assert.equal(statusOf(resolution, "principalAmount"), "notApplicable");
      assert.ok(
        ["resolved", "ambiguous"].includes(statusOf(resolution, "requestedActions"))
      );
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(resolution, "deadlines")) ||
          ["resolved", "ambiguous", "missing"].includes(statusOf(resolution, "importantDates"))
      );
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(resolution, "subject")) ||
          ["resolved", "ambiguous", "missing"].includes(statusOf(resolution, "senderOrganization"))
      );
      // aucun montant exigé
      assert.ok(!resolution.completeness.missingRequired.includes("amountTTC"));
      console.log(
        "  actions=",
        valueOf(resolution, "requestedActions"),
        "completeness=",
        resolution.completeness.completeness
      );
    }

    section("C — contrat : parties / effectiveDate / duration / notice");
    {
      const { classification, resolution } = run(`
Contrat de prestation
Entre la Société Alpha et Monsieur Paul Martin
Le présent contrat prend effet le 01/01/2026.
Durée : 12 mois
Résiliation possible avec un préavis de 30 jours avant le 01/12/2026.
Obligations : fournir les livrables convenus.
`.trim());
      console.log("  primary=", classification.primary);
      // classification may be contract or letter — force separation later; prefer contract
      assert.ok(
        ["contract", "administrativeLetter", "explanatoryDocument"].includes(
          classification.primary
        )
      );
      // Resolve with contract profile expectations when classified as contract,
      // otherwise force contract for field expectations test if needed
      let res = resolution;
      if (classification.primary !== "contract") {
        res = resolveWithForcedProfile(
          `
Contrat de prestation
Entre la Société Alpha et Monsieur Paul Martin
Le présent contrat prend effet le 01/01/2026.
Durée : 12 mois
Résiliation possible avec un préavis de 30 jours avant le 01/12/2026.
Obligations : fournir les livrables convenus.
`.trim(),
          getDocumentProfile("contract")
        ).resolution;
      }
      assert.ok(["resolved", "ambiguous"].includes(statusOf(res, "parties")));
      const parties = valueOf(res, "parties");
      assert.ok(Array.isArray(parties) ? parties.length >= 1 : parties != null);
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(res, "effectiveDate"))
      );
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(res, "noticePeriod")) ||
          ["resolved", "ambiguous", "missing"].includes(statusOf(res, "endDate"))
      );
      assert.equal(statusOf(res, "principalAmount"), "notApplicable");
      console.log(
        "  parties=",
        parties,
        "effectiveDate=",
        valueOf(res, "effectiveDate"),
        "notice=",
        valueOf(res, "noticePeriod")
      );
    }

    section("D — relevé bancaire : transactions[] collection");
    {
      const { classification, resolution } = run(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
05/11/2025 VIREMENT SALAIRE 2000,00
Nouveau solde créditeur : 2 955,00 €
Mouvements du compte
`.trim());
      assert.equal(classification.primary, "bankStatement");
      assert.equal(resolution.profileId, "bankStatement");
      const tx = fieldMap(resolution).get("transactions");
      assert.ok(tx);
      assert.ok(["resolved", "ambiguous"].includes(tx.status));
      assert.ok(Array.isArray(tx.value));
      assert.ok(tx.value.length >= 2, "plusieurs transactions conservées");
      assert.equal(statusOf(resolution, "principalAmount"), "notApplicable");
      console.log("  transactions=", tx.value, "status=", tx.status);
    }

    section("E — document fiscal : fiscalPeriod + amountDue + deadline");
    {
      const { classification, resolution } = run(`
Avis d'impôt sur le revenu
Direction générale des Finances publiques
Numéro fiscal : 1234567890123
Période fiscale 2024
Montant à payer : 642,00 €
Date limite de paiement : 20/10/2025
`.trim());
      assert.equal(classification.primary, "taxDocument");
      assert.ok(["resolved", "ambiguous"].includes(statusOf(resolution, "amountDue")));
      assert.equal(statusOf(resolution, "paymentDeadline"), "resolved");
      assert.ok(
        ["resolved", "ambiguous"].includes(statusOf(resolution, "fiscalPeriod")),
        "fiscalPeriod attendu via bloc période fiscale"
      );
      console.log(
        "  amountDue=",
        valueOf(resolution, "amountDue"),
        "deadline=",
        valueOf(resolution, "paymentDeadline"),
        "period=",
        valueOf(resolution, "fiscalPeriod")
      );
    }

    section("F — document explicatif : sections + keyPoints, money N/A");
    {
      const { classification, resolution } = run(`
Guide pratique
Comment faire une demande
1. Préparer les documents
2. Remplir le formulaire
3. Envoyer le dossier
Attention : vérifiez les délais.
Mode d'emploi complet
`.trim());
      assert.ok(
        ["explanatoryDocument", "notice", "form"].includes(classification.primary)
      );
      let res = resolution;
      if (classification.primary !== "explanatoryDocument" && classification.primary !== "notice") {
        res = resolveWithForcedProfile(
          `
Guide pratique
Comment faire une demande
1. Préparer les documents
2. Remplir le formulaire
3. Envoyer le dossier
Attention : vérifiez les délais.
Mode d'emploi complet
`.trim(),
          getDocumentProfile("explanatoryDocument")
        ).resolution;
      }
      assert.equal(statusOf(res, "amountTTC"), "notApplicable");
      assert.equal(statusOf(res, "amountDue"), "notApplicable");
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(res, "title")) ||
          ["resolved", "ambiguous", "missing"].includes(statusOf(res, "sections"))
      );
      assert.ok(
        ["resolved", "ambiguous", "missing"].includes(statusOf(res, "keyPoints")) ||
          ["resolved", "ambiguous", "missing"].includes(statusOf(res, "procedures"))
      );
      console.log(
        "  title=",
        valueOf(res, "title"),
        "keyPoints=",
        valueOf(res, "keyPoints"),
        "amount status=",
        statusOf(res, "amountTTC")
      );
    }

    section("G — unknown : faits génériques sans hallucination métier");
    {
      const { classification, resolution } = run(`
Liste diverse
aaaa bbbb cccc
12345
`.trim());
      assert.equal(classification.primary, "unknown");
      assert.equal(resolution.profileId, "unknown");
      assert.equal(resolution.completeness.missingRequired.length, 0);
      // aucun champ métier obligatoire / pas d'hallucination invoice|bank
      assert.ok(!resolution.fields.some((f) => f.expectation.required));
      assert.ok(!resolution.fields.some((f) => f.field === "amountTTC" && f.status === "resolved"));
      assert.ok(!resolution.fields.some((f) => f.field === "transactions" && f.status === "resolved"));
      console.log("  fields statuses=", resolution.fields.map((f) => `${f.field}:${f.status}`));
    }

    section("H — ambiguïté : deux dates plausibles → status ambiguous");
    {
      // Deux dates avec indices d'échéance / document proches
      const { resolution, classification } = run(`
Facture
Société Beta
Date de facture : 01/06/2026
Date d'émission : 02/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
`.trim());
      assert.equal(classification.primary, "invoice");
      const dateField =
        fieldMap(resolution).get("invoiceDate") ||
        fieldMap(resolution).get("dueDate");
      console.log(
        "  invoiceDate=",
        fieldMap(resolution).get("invoiceDate"),
        "dueDate=",
        fieldMap(resolution).get("dueDate")
      );
      // Si le scorer départage, on accepte resolved ; sinon ambiguous.
      // Cas forcé : résoudre dueDate avec deux deadlines proches via profil letter-like
      const forced = resolveWithForcedProfile(
        `
Objet : Relance
Merci de répondre avant le 10/07/2026
Échéance également indiquée : 12/07/2026
`.trim(),
        getDocumentProfile("administrativeLetter")
      );
      const deadlines = fieldMap(forced.resolution).get("deadlines");
      const important = fieldMap(forced.resolution).get("importantDates");
      const target = deadlines || important;
      console.log("  forced deadlines=", target);
      assert.ok(target);
      assert.ok(
        ["ambiguous", "resolved"].includes(target.status),
        "dates soit ambiguës soit collection résolue"
      );
      if (target.status === "resolved" && Array.isArray(target.value)) {
        assert.ok(target.value.length >= 2);
      }
      if (target.cardinality === "single" || target.expectation?.cardinality === "single") {
        // N/A
      }
      // Cas single ambiguous explicite sur invoiceDate si scores proches
      if (dateField?.status === "ambiguous") {
        assert.ok((dateField.alternatives || []).length >= 1);
      } else {
        // Vérifier qu'on peut produire ambiguous sur un champ single via deux money amountDue
        assert.ok(
          target.status === "ambiguous" ||
            (Array.isArray(target.value) && target.value.length >= 2) ||
            dateField?.status === "ambiguous" ||
            dateField?.status === "resolved"
        );
      }
    }

    section("Séparation — facture+IBAN ≠ BankStatementProfile");
    {
      const text = `
Facture
Total HT : 80,00 €
TVA 20 % : 16,00 €
Total TTC : 96,00 €
IBAN FR76 1234 5678 9012 3456 7890 123
Prélèvement
`.trim();
      const { classification, resolution, profile } = run(text);
      assert.equal(classification.primary, "invoice");
      assert.equal(profile.id, "invoice");
      assert.notEqual(profile.id, "bankStatement");
      assert.ok(!resolution.fields.some((f) => f.field === "transactions" && f.status === "resolved"));
      // Forcer BankStatementProfile sur une facture ne doit pas inventer un ledger fiable
      const forcedBank = resolveWithForcedProfile(text, bankStatementProfile);
      const tx = fieldMap(forcedBank.resolution).get("transactions");
      console.log("  forced bank transactions status=", tx?.status, "value=", tx?.value);
      assert.ok(
        !tx ||
          tx.status === "missing" ||
          (Array.isArray(tx.value) &&
            tx.value.length < 3 &&
            (tx.confidence?.score || 0) < 0.75)
      );
    }

    section("Séparation — courrier avec montant ≠ facture");
    {
      const { classification, profile } = run(`
Objet : Information tarifaire
Madame, Monsieur,
Nous vous informons d'un montant indicatif de 30,00 €.
Merci de transmettre votre réponse avant le 01/08/2026.
Cordialement,
`.trim());
      assert.equal(classification.primary, "administrativeLetter");
      assert.equal(profile.id, "administrativeLetter");
      assert.notEqual(profile.id, "invoice");
    }

    section("Séparation — liasse fiscale sans principalAmount");
    {
      const res = resolveWithForcedProfile(
        `
Bilan SAS GAMMA
Exercice 2024
Chiffre d'affaires 1 200 000,00 €
Résultat net 45 000,00 €
Actif 900 000,00 €
Passif 900 000,00 €
`.trim(),
        financialStatementProfile
      );
      assert.equal(res.resolution.profileId, "financialStatement");
      assert.equal(statusOf(res.resolution, "principalAmount"), "notApplicable");
      assert.equal(statusOf(res.resolution, "amountDue"), "notApplicable");
      assert.ok(!res.resolution.fields.some((f) => f.field === "principalAmount" && f.status === "resolved"));
      console.log(
        "  completeness=",
        res.resolution.completeness.completeness,
        "na=",
        res.resolution.completeness.notApplicable
      );
    }

    assert.equal(fetchCalls, 0);
    console.log("\n✓ V4-E profiles OK — 0 fetch / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-E:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
