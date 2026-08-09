/**
 * Tests V4-F — Document Understanding & Evidence-grounded Synthesis.
 * Usage: npm run test:v4-understanding
 */

import assert from "node:assert/strict";
import {
  understandDocumentText,
  invariantsHold,
  isFactualClaim,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return understandDocumentText(text);
}

function fin(u, kind) {
  return u.financialFacts.find((f) => f.kind === kind);
}

function date(u, kind) {
  return u.importantDates.find((d) => d.kind === kind);
}

function assertProvenance(item, label) {
  assert.ok(item, `${label} manquant`);
  assert.ok(item.evidence?.length > 0, `${label}: evidence vide`);
  for (const e of item.evidence) {
    assert.ok(typeof e.text === "string" && e.text.length > 0, `${label}: text`);
    assert.ok(typeof e.page === "number", `${label}: page`);
    assert.ok(e.blockId != null, `${label}: blockId`);
  }
}

function assertNoUnsupported(u) {
  assert.equal(u.evidenceCoverage.unsupported, 0);
  const errs = invariantsHold(u);
  assert.deepEqual(errs, [], errs.join("; "));
  for (const item of [
    u.purpose,
    ...u.parties,
    ...u.keyFacts,
    ...u.financialFacts,
    ...u.importantDates
  ]) {
    if (isFactualClaim(item)) {
      assert.ok(item.evidence.length > 0, `claim ${item.kind} sans evidence`);
    }
  }
}

function main() {
  console.log("=== test-v4-understanding (V4-F) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-F");
  };

  try {
    section("A — facture HT/TVA/TTC/due + arithmetic");
    {
      const { understanding: u, classification } = run(`
Facture n° 12345
Date : 17/11/2025
Total HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
Montant à payer : 25,99 €
`.trim());
      console.log(
        "  type=",
        classification.primary,
        "purpose=",
        u.purpose.value,
        "coverage=",
        u.evidenceCoverage
      );
      assert.equal(classification.primary, "invoice");
      assert.equal(fin(u, "amountHT")?.value, 21.66);
      assert.equal(fin(u, "vatAmount")?.value, 4.33);
      assert.equal(fin(u, "amountTTC")?.value, 25.99);
      assert.equal(fin(u, "amountDue")?.value, 25.99);
      const arith = fin(u, "arithmeticConsistency");
      assert.ok(arith, "relation arithmétique dérivée");
      assert.ok(arith.derivedFrom.some((d) => /arithmetic|amountHT|amountTTC/.test(d)));
      assertProvenance(arith, "arithmetic");
      assertNoUnsupported(u);
      assert.ok(u.structuredSummary.amounts.some((a) => a.kind === "amountTTC"));
    }

    section("B — facture multi-montants : rôles conservés");
    {
      const { understanding: u } = run(`
Facture
Ancien solde : 200,00 €
Acompte : 50,00 €
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 120,00 €
Montant restant dû : 70,00 €
`.trim());
      assert.equal(u.documentType.primary, "invoice");
      const ttc = fin(u, "amountTTC");
      const due = fin(u, "amountDue");
      assert.ok(ttc);
      assert.ok(due);
      // Ne pas choisir simplement le plus gros (200)
      assert.notEqual(ttc.value, 200);
      assert.notEqual(due.value, 200);
      assert.ok([70, 120].includes(Number(due.value)));
      assertNoUnsupported(u);
      console.log("  TTC=", ttc.value, "due=", due.value, "HT=", fin(u, "amountHT")?.value);
    }

    section("C — courrier administratif action+deadline");
    {
      const { understanding: u, classification } = run(`
Objet : demande de justificatif
Madame, Monsieur,
Nous vous remercions de transmettre votre justificatif de domicile
avant le 15/09/2026.
Cordialement,
`.trim());
      assert.equal(classification.primary, "administrativeLetter");
      assert.ok(
        ["informationRequest", "information"].includes(String(u.purpose.value))
      );
      const explicit = u.actions.filter((a) => a.status !== "noExplicitActionDetected");
      assert.ok(explicit.length >= 1);
      assert.match(String(explicit[0].description || ""), /justificatif|transmettre/i);
      const withDeadline = explicit.find((a) => a.deadline);
      assert.ok(withDeadline, "action↔deadline");
      assert.equal(withDeadline.deadline.value, "2026-09-15");
      assert.ok(!fin(u, "amountTTC") || fin(u, "amountTTC").status === "notApplicable");
      assertNoUnsupported(u);
      console.log(
        "  purpose=",
        u.purpose.value,
        "action=",
        explicit[0].description,
        "deadline=",
        withDeadline.deadline.value
      );
    }

    section("D — courrier informatif : noExplicitActionDetected ≠ nothingToDo");
    {
      const { understanding: u } = run(`
Objet : Information
Madame, Monsieur,
Nous vous informons que votre dossier a été mis à jour.
Aucune démarche n'est demandée dans ce courrier.
Cordialement,
`.trim());
      assert.equal(u.documentType.primary, "administrativeLetter");
      assert.ok(
        u.actions.some((a) => a.status === "noExplicitActionDetected")
      );
      assert.ok(!u.actions.some((a) => /nothingToDo|aucune action nécessaire/i.test(a.actionType)));
      assert.ok(!u.structuredSummary.actions.some((a) => a.actionType === "nothingToDo"));
      assertNoUnsupported(u);
      console.log("  actions=", u.actions.map((a) => a.status));
    }

    section("E — contrat : parties/effet/préavis > IBAN");
    {
      const { understanding: u, classification } = run(`
Contrat de prestation
Entre SAS ALPHA et Monsieur Paul Martin
Le présent contrat prend effet le 01/01/2026.
Durée : 12 mois
Renouvellement tacite
Résiliation avec préavis de 30 jours avant le 01/12/2026.
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      assert.ok(["contract", "administrativeLetter"].includes(classification.primary));
      // Importance : parties/notice dans keyFacts ou parties
      const partyOrNotice =
        u.parties.length > 0 ||
        u.keyFacts.some((k) =>
          ["parties", "noticePeriod", "effectiveDate", "contractTitle"].includes(k.kind)
        ) ||
        u.importantDates.some((d) =>
          ["effectiveDate", "noticePeriod", "endDate"].includes(d.kind)
        );
      assert.ok(partyOrNotice);
      const ibanImportance = u.keyFacts.find((k) => /iban|payment/i.test(k.kind));
      assert.ok(!ibanImportance || ibanImportance.importance === "low");
      assertNoUnsupported(u);
      console.log(
        "  purpose=",
        u.purpose.value,
        "parties=",
        u.parties.map((p) => p.value),
        "key=",
        u.keyFacts.map((k) => k.kind)
      );
    }

    section("F — document fiscal");
    {
      const { understanding: u, classification } = run(`
Avis d'impôt sur le revenu
Période fiscale 2024
Référence : REF-TAX-9
Montant à payer : 642,00 €
Date limite de paiement : 20/10/2025
Merci de procéder au paiement avant cette date.
`.trim());
      assert.equal(classification.primary, "taxDocument");
      assert.ok(fin(u, "amountDue")?.value === 642 || fin(u, "taxAmount")?.value === 642);
      assertProvenance(fin(u, "amountDue") || fin(u, "taxAmount"), "tax amount");
      const deadline =
        date(u, "paymentDeadline") ||
        u.actions.map((a) => a.deadline).find(Boolean);
      assert.ok(deadline);
      assertNoUnsupported(u);
      console.log("  due=", fin(u, "amountDue")?.value, "deadline=", deadline?.value);
    }

    section("G — relevé bancaire : transactions[] sans principalAmount");
    {
      const { understanding: u, classification } = run(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
05/11/2025 VIREMENT SALAIRE 2000,00
Nouveau solde créditeur : 2 955,00 €
Mouvements du compte
`.trim());
      assert.equal(classification.primary, "bankStatement");
      const tx = fin(u, "transactions");
      assert.ok(tx && Array.isArray(tx.value) && tx.value.length >= 2);
      assert.ok(!u.financialFacts.some((f) => f.kind === "principalAmount" && f.status === "resolved"));
      assert.ok(
        fin(u, "openingBalance") || fin(u, "closingBalance") || tx
      );
      assertNoUnsupported(u);
      console.log("  tx=", tx.value, "open=", fin(u, "openingBalance")?.value);
    }

    section("H — document explicatif : sections/keyPoints");
    {
      const { understanding: u } = run(`
Guide pratique
Comment faire une demande
1. Préparer les documents
2. Remplir le formulaire
3. Envoyer le dossier
Attention : vérifiez les délais.
Mode d'emploi
`.trim());
      assert.ok(
        ["explanatoryDocument", "notice", "form"].includes(u.documentType.primary)
      );
      assert.ok(
        u.sections.length > 0 ||
          u.keyFacts.some((k) =>
            ["title", "sections", "keyPoints", "procedures"].includes(k.kind)
          )
      );
      assert.ok(!fin(u, "amountTTC") || fin(u, "amountTTC").status === "notApplicable");
      assertNoUnsupported(u);
      console.log(
        "  sections=",
        u.sections.map((s) => s.kind),
        "purpose=",
        u.purpose.value
      );
    }

    section("I — contradiction arithmétique HT+TVA≠TTC");
    {
      const { understanding: u, consistency } = run(`
Facture
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 150,00 €
`.trim());
      assert.equal(u.documentType.primary, "invoice");
      const warn = u.warnings.find((w) => w.kind === "arithmeticContradiction");
      assert.ok(warn, "arithmeticContradiction attendue");
      assert.ok(warn.evidence.length >= 2);
      assert.match(warn.message, /150|≠|!=|TTC/i);
      // Ne corrige PAS le TTC
      assert.equal(fin(u, "amountTTC")?.value, 150);
      assert.ok(consistency.status === "contradictory" || warn);
      assertNoUnsupported(u);
      console.log("  warning=", warn.message, "ttc kept=", fin(u, "amountTTC")?.value);
    }

    section("J — ambiguïté amountDue / dates conservée");
    {
      const { understanding: u } = run(`
Facture
SAS BETA
Date de facture : 01/06/2026
Date d'émission : 02/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
Montant à payer : 60,00 €
Net à payer : 59,00 €
`.trim());
      const amb =
        u.uncertainties.find((x) => x.kind === "amountDue") ||
        u.uncertainties.find((x) => x.kind === "invoiceDate") ||
        u.financialFacts.find((f) => f.status === "ambiguous") ||
        u.importantDates.find((d) => d.status === "ambiguous");
      assert.ok(amb, "ambiguïté conservée");
      if (amb.candidates) {
        assert.ok(amb.candidates.length >= 2 || amb.status === "ambiguous");
      }
      // StructuredSummary conserve l'ambiguïté
      assert.ok(
        u.structuredSummary.uncertainties.length > 0 ||
          u.structuredSummary.amounts.some((a) => a.status === "ambiguous") ||
          u.structuredSummary.warnings.some((w) => w.kind === "ambiguousField")
      );
      assertNoUnsupported(u);
      console.log(
        "  uncertainties=",
        u.uncertainties.map((x) => x.kind),
        "ambAmounts=",
        u.structuredSummary.amounts.filter((a) => a.status === "ambiguous").map((a) => a.kind)
      );
    }

    section("K — anti-hallucination document minimal");
    {
      const { understanding: u } = run(`
INFORMATION

Votre dossier a été mis à jour.
`.trim());
      assert.equal(u.evidenceCoverage.unsupported, 0);
      assert.ok(!u.financialFacts.some((f) => f.status === "resolved"));
      assert.ok(!u.importantDates.some((d) => d.status === "resolved"));
      assert.ok(
        u.actions.every(
          (a) =>
            a.status === "noExplicitActionDetected" ||
            (a.evidence.length > 0 && a.description)
        )
      );
      // pas d'organisme inventé
      assert.ok(u.parties.length === 0 || u.parties.every((p) => p.evidence.length > 0));
      assertNoUnsupported(u);
      console.log(
        "  purpose=",
        u.purpose.value,
        "facts=",
        u.keyFacts.length,
        "actions=",
        u.actions.map((a) => a.status)
      );
    }

    section("L — provenance claim → evidence → TextBlock");
    {
      const { understanding: u, blocks } = run(`
Facture n° 999
Total HT : 10,00 €
TVA 20 % : 2,00 €
Total TTC : 12,00 €
Montant à payer : 12,00 €
`.trim());
      const ttc = fin(u, "amountTTC");
      assertProvenance(ttc, "amountTTC");
      const block = blocks.find((b) => b.id === ttc.evidence[0].blockId);
      assert.ok(block, "TextBlock traçable");
      assert.match(block.text, /12/);
      const arith = fin(u, "arithmeticConsistency");
      if (arith) {
        assert.ok(arith.derivedFrom.length > 0);
        assert.ok(arith.evidence.length >= 2);
        for (const e of arith.evidence) {
          assert.ok(blocks.some((b) => b.id === e.blockId));
        }
      }
      assertNoUnsupported(u);
      console.log(
        "  ttc evidence ←",
        ttc.evidence[0].text,
        "block=",
        block.id,
        "page=",
        block.page
      );
    }

    section("Invariants globaux");
    {
      assert.equal(fetchCalls, 0);
      console.log("  OK unsupported=0, provenance, 0 fetch");
    }

    console.log("\n✓ V4-F understanding OK — 0 fetch / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-F:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
