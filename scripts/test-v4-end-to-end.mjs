/**
 * Tests V4-I — Pipeline end-to-end + corpus de validation.
 * Usage: npm run test:v4-end-to-end
 */

import assert from "node:assert/strict";
import {
  analyzeDocumentV4,
  DOCUMENT_TYPE_IDS,
  SECONDARY_SECTION_KINDS,
  resetCandidateIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function run(text) {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  return analyzeDocumentV4({ text });
}

function field(result, name) {
  return result.fields.fields.find((f) => f.field === name);
}

function amountVal(result, name) {
  const f = field(result, name);
  if (!f || f.status === "missing" || f.status === "notApplicable") return undefined;
  return f.value;
}

function assertInvariants(result, label) {
  const d = result.diagnostics;
  assert.equal(d.unsupportedExplanationFacts, 0, `${label}: unsupportedExplanationFacts`);
  assert.equal(d.unsupportedPresentationFacts, 0, `${label}: unsupportedPresentationFacts`);
  assert.equal(d.inventedActions, 0, `${label}: inventedActions`);
  assert.equal(d.inventedDeadlines, 0, `${label}: inventedDeadlines`);
  assert.equal(d.inventedAmounts, 0, `${label}: inventedAmounts`);
  assert.equal(d.inventedReasons, 0, `${label}: inventedReasons`);
  assert.equal(d.evidenceCoverage.unsupported, 0, `${label}: evidence unsupported`);
  assert.deepEqual(d.invariantErrors, [], `${label}: ${d.invariantErrors.join(";")}`);

  // secondarySections = SecondarySectionKind uniquement
  for (const s of d.secondarySections) {
    assert.ok(
      SECONDARY_SECTION_KINDS.includes(s.kind),
      `${label}: secondary kind invalide ${s.kind}`
    );
    assert.ok(
      !DOCUMENT_TYPE_IDS.includes(s.kind),
      `${label}: DocumentType dans secondary ${s.kind}`
    );
    assert.notEqual(s.kind, "bankStatement");
  }

  // Présentation : chaque item a une source
  for (const item of [
    ...result.presentation.essential,
    ...result.presentation.actions,
    ...(result.presentation.reason ? [result.presentation.reason] : []),
    ...result.presentation.importantDates,
    ...result.presentation.importantAmounts,
    ...result.presentation.warnings,
    ...result.presentation.secondaryInformation
  ]) {
    assert.ok(item.sourceFacts?.length > 0, `${label}: presentation sans source « ${item.text} »`);
  }
}

function main() {
  console.log("=== test-v4-end-to-end (V4-I) ===");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch interdit en V4-I");
  };

  let fixtures = 0;
  let assertions = 0;
  const wrap = (name, fn) => {
    section(name);
    fixtures += 1;
    const before = assertions;
    const bump = () => {
      assertions += 1;
    };
    // count via proxy on assert — simpler: increment manually in each test
    fn(bump);
    if (assertions === before) {
      // ensure at least invariants counted
    }
  };

  // Helper to count assert calls roughly
  const A = (cond, msg) => {
    assert.ok(cond, msg);
    assertions += 1;
  };
  const Eq = (a, b, msg) => {
    assert.equal(a, b, msg);
    assertions += 1;
  };

  try {
    wrap("A — Facture simple", () => {
      const r = run(`
Facture n° F-100
Date : 01/03/2026
Total HT : 40,00 €
TVA 20 % : 8,00 €
Total TTC : 48,00 €
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      A(r.presentation.documentIdentity.documentType === "invoice");
      A(!r.presentation.actions.some((a) => /payez/i.test(a.text)));
      assertInvariants(r, "A");
      assertions += 6;
      console.log("  primary=", r.diagnostics.primaryDocumentType, r.presentation.documentIdentity.text);
    });

    wrap("B — Facture HT + TVA + TTC", () => {
      const r = run(`
Facture
Montant HT : 21,66 €
TVA 20 % : 4,33 €
Total TTC : 25,99 €
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      Eq(amountVal(r, "amountHT"), 21.66);
      Eq(amountVal(r, "vatAmount"), 4.33);
      // vatRate may be resolved
      A(amountVal(r, "amountTTC") === 25.99 || r.explanation.amounts.some((a) => a.field === "amountTTC" && a.value === 25.99));
      A(r.relations.some((rel) => rel.type === "arithmetic") || r.diagnostics.relationTypes.includes("arithmetic"));
      A(/25,99|25.99/.test(r.presentation.documentIdentity.text));
      A(!r.presentation.actions.some((a) => a.kind === "userAction"));
      assertInvariants(r, "B");
      assertions += 8;
      console.log("  presentation=", r.presentation.documentIdentity.text, "arith=", r.diagnostics.relationTypes.includes("arithmetic"));
    });

    wrap("C — Facture + IBAN + SEPA / prélèvement ≠ bankStatement", () => {
      const r = run(`
Facture
Total HT : 80,00 €
TVA 20 % : 16,00 €
Total TTC : 96,00 €
Prélèvement automatique
Mandat SEPA : FR12ZZZ123456
IBAN FR76 1234 5678 9012 3456 7890 123
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      A((r.classification.scores.bankStatement || 0) < 0.2);
      const kinds = r.diagnostics.secondarySections.map((s) => s.kind);
      A(kinds.includes("bankingDetails") || kinds.includes("paymentInformation"));
      A(!kinds.includes("bankStatement"));
      A(!r.presentation.secondaryInformation.some((s) => s.kind === "bankStatement"));
      assertInvariants(r, "C");
      assertions += 8;
      console.log("  secondary=", kinds, "bankScore=", r.classification.scores.bankStatement);
    });

    wrap("D — Facture contradiction arithmétique", () => {
      const r = run(`
Facture
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 150,00 €
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      A(r.diagnostics.hasArithmeticInconsistency);
      const ttc =
        amountVal(r, "amountTTC") ??
        r.explanation.amounts.find((a) => a.field === "amountTTC")?.value;
      Eq(ttc, 150);
      A(r.presentation.warnings.some((w) => w.kind === "arithmeticInconsistency"));
      A(r.presentation.importantAmounts.some((a) => a.label.includes("TTC") && a.value === 150));
      assertInvariants(r, "D");
      assertions += 7;
      console.log("  ttc kept=", ttc, "contradictions=", r.diagnostics.contradictions.slice(0, 1));
    });

    wrap("E — Facture plusieurs montants plausibles", () => {
      const r = run(`
Facture
Ancien solde : 200,00 €
Acompte : 50,00 €
Total HT : 100,00 €
TVA 20 % : 20,00 €
Total TTC : 120,00 €
Montant restant dû : 70,00 €
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      const ttc = r.explanation.amounts.find((a) => a.field === "amountTTC");
      A(ttc && ttc.value !== 200);
      A(!r.presentation.importantAmounts.some((a) => a.value === 200 && /TTC|dû/i.test(a.label)));
      assertInvariants(r, "E");
      assertions += 5;
      console.log("  ttc=", ttc?.value, "ambiguous=", r.diagnostics.ambiguousFields);
    });

    wrap("F — Relevé bancaire réel", () => {
      const r = run(`
Relevé de compte
Solde précédent : 1 000,00 €
Date valeur Libellé Débit Crédit
02/11/2025 CARTE MAGASIN 45,00
05/11/2025 VIREMENT SALAIRE 2000,00
Nouveau solde créditeur : 2 955,00 €
Mouvements du compte
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "bankStatement");
      const tx = field(r, "transactions");
      A(tx && Array.isArray(tx.value) && tx.value.length >= 2);
      A(!r.fields.fields.some((f) => f.field === "principalAmount" && f.status === "resolved"));
      A(!r.presentation.importantAmounts.some((a) => /principalAmount/i.test(a.label)));
      assertInvariants(r, "F");
      assertions += 6;
      console.log("  tx=", tx?.value, "presentation=", r.presentation.documentIdentity.text);
    });

    wrap("G — Courrier administratif action + échéance", () => {
      const r = run(`
Objet : demande de pièce
Madame, Monsieur,
Merci de retourner ce formulaire avant le 15/09/2026.
Cordialement,
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "administrativeLetter");
      A(r.presentation.actions.some((a) => /formulaire|retourner/i.test(a.text)));
      A(
        r.presentation.actions.some((a) => /15 septembre 2026|15\/09\/2026/.test(a.text)) ||
          r.presentation.importantDates.some((d) => String(d.value).includes("2026-09-15"))
      );
      A(!r.presentation.importantAmounts.some((a) => a.status === "supported" || a.status === "derived"));
      assertInvariants(r, "G");
      assertions += 6;
      console.log("  actions=", r.presentation.actions.map((a) => a.text));
    });

    wrap("H — Courrier informatif sans action", () => {
      const r = run(`
Objet : Information
Madame, Monsieur,
Nous vous informons de la modification de nos horaires d'accueil à compter du 01/10/2026.
Cordialement,
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "administrativeLetter");
      Eq(r.diagnostics.presentationActionsCount, 0);
      A(!r.presentation.actions.some((a) => a.kind === "userAction"));
      // date éventuelle mais pas forcément deadline d'action
      A(!r.presentation.actions.some((a) => /devez|obligatoire/i.test(a.text)));
      assertInvariants(r, "H");
      assertions += 5;
      console.log("  actions=", r.presentation.actions, "dates=", r.presentation.importantDates.map((d) => d.text));
    });

    wrap("I — Contrat", () => {
      const r = run(`
Contrat de prestation
Entre SAS ALPHA et Monsieur Paul Martin
Le présent contrat prend effet le 01/01/2026.
Durée : 12 mois
Résiliation avec préavis de 30 jours avant le 01/12/2026.
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "contract");
      A(/contrat/i.test(r.presentation.documentIdentity.text));
      A(!/facture/i.test(r.presentation.documentIdentity.text));
      assertInvariants(r, "I");
      assertions += 4;
      console.log("  identity=", r.presentation.documentIdentity.text);
    });

    wrap("J — Attestation / certificat", () => {
      const r = run(`
Attestation
Je soussigné certifie que Monsieur Paul Martin réside à l'adresse indiquée.
Fait le 01/03/2026
Signature
`.trim());
      A(["certificate", "form", "administrativeLetter"].includes(r.diagnostics.primaryDocumentType));
      A(!r.presentation.importantAmounts.some((a) => a.status === "supported"));
      assertInvariants(r, "J");
      assertions += 4;
      console.log("  primary=", r.diagnostics.primaryDocumentType, r.presentation.documentIdentity.text);
    });

    wrap("K — Document fiscal simple", () => {
      const r = run(`
Avis d'impôt sur le revenu
Période fiscale 2024
Montant à payer : 642,00 €
Date limite de paiement : 20/10/2025
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "taxDocument");
      A(
        amountVal(r, "amountDue") === 642 ||
          amountVal(r, "taxAmount") === 642 ||
          r.presentation.importantAmounts.some((a) => a.value === 642)
      );
      A(!/Il s'agit d'une facture/i.test(r.presentation.documentIdentity.text));
      assertInvariants(r, "K");
      assertions += 5;
      console.log("  identity=", r.presentation.documentIdentity.text);
    });

    wrap("L — Type ambigu", () => {
      const r = run(`
Attestation
Je soussigné certifie
Nom :
Prénom :
Date de naissance :
Signature :
`.trim());
      A(
        r.diagnostics.classificationStatus === "ambiguous" ||
          ["form", "certificate"].includes(r.diagnostics.primaryDocumentType)
      );
      // Pas de fausse certitude extrême si ambiguous
      if (r.diagnostics.classificationStatus === "ambiguous") {
        A(r.diagnostics.classificationConfidence < 0.7);
      }
      assertInvariants(r, "L");
      assertions += 4;
      console.log(
        "  status=",
        r.diagnostics.classificationStatus,
        "primary=",
        r.diagnostics.primaryDocumentType,
        "conf=",
        r.diagnostics.classificationConfidence
      );
    });

    wrap("M — Texte insuffisant / unknown", () => {
      const r = run(`
INFORMATION

Votre dossier a été mis à jour.
`.trim());
      A(
        r.diagnostics.primaryDocumentType === "unknown" ||
          r.diagnostics.classificationConfidence < 0.5 ||
          r.diagnostics.primaryDocumentType === "explanatoryDocument" ||
          r.diagnostics.primaryDocumentType === "administrativeLetter" ||
          r.diagnostics.primaryDocumentType === "notice"
      );
      // Anti-hallucination stricte
      Eq(r.diagnostics.presentationActionsCount, 0);
      A(!r.presentation.importantAmounts.some((a) => a.status === "supported" || a.status === "derived"));
      A(
        r.presentation.importantDates.filter((d) => d.status === "supported" || d.status === "derived")
          .length === 0
      );
      Eq(r.presentation.reason, null);
      assertInvariants(r, "M");
      assertions += 8;
      console.log(
        "  primary=",
        r.diagnostics.primaryDocumentType,
        "amounts=",
        r.presentation.importantAmounts.length,
        "actions=",
        r.diagnostics.presentationActionsCount
      );
    });

    // Ambiguïté dates (complément corpus)
    wrap("N — Ambiguïté dates conservée", () => {
      const r = run(`
Facture
Date de facture : 01/06/2026
Date d'émission : 02/06/2026
Total HT : 50,00 €
TVA 20 % : 10,00 €
Total TTC : 60,00 €
`.trim());
      A(
        r.diagnostics.ambiguousFields.includes("invoiceDate") ||
          r.presentation.importantDates.some((d) => d.status === "ambiguous")
      );
      const amb = r.presentation.importantDates.find((d) => d.status === "ambiguous");
      if (amb) {
        A(Array.isArray(amb.value) && amb.value.length >= 2);
      }
      assertInvariants(r, "N");
      assertions += 4;
      console.log("  ambiguousFields=", r.diagnostics.ambiguousFields, amb?.value);
    });

    wrap("O — Facture énergie complexe multi-sections (V4-K.1)", () => {
      const r = run(`
Facture Energie Electricité
Période de consommation : 01/12/2025 au 31/12/2025
Votre consommation
Abonnement : 15,40 € HTVA
Consommation : 286,20 € HTVA
Acheminement : 48,50 € HTVA
Services : 21,83 € HTVA
Sous-total énergie : 350,10 € HTVA
TVA 6 % sur énergie : 21,01 €
Sous-total énergie TTC : 371,11 €
Services complémentaires
Services + 21,83 € HTVA
TVA 21 % sur services : 4,58 €
Sous-total services TTC : 26,41 €
Total général
Total HTVA : 371,93 €
Total TVA : 25,70 €
Total TTC : 397,63 €
Le montant de 397,63 € sera prélevé automatiquement le 18 janvier 2026.
Mandat SEPA actif
Des questions sur votre facture Energie Electricité 631,85 € HTVA
Sur les réseaux sociaux : = 397,63 € TTC
Support client : 0 800 00 00 00
`.trim());
      Eq(r.diagnostics.primaryDocumentType, "invoice");
      const ttc =
        amountVal(r, "amountTTC") ??
        r.explanation.amounts.find((a) => a.field === "amountTTC")?.value;
      Eq(ttc, 397.63);
      A(!r.diagnostics.hasArithmeticInconsistency, "pas de faux arithmeticInconsistency");
      A(!r.presentation.warnings.some((w) => w.kind === "arithmeticInconsistency"));
      Eq(r.diagnostics.presentationActionsCount, 0);
      A(
        r.presentation.secondaryInformation.some(
          (s) =>
            s.kind === "paymentInformation" && /pr[eé]l[eè]vement/i.test(s.text)
        ),
        "paymentInformation prélèvement"
      );
      A(
        !r.presentation.importantDates.some((d) =>
          /actionDeadline/i.test(`${d.kind} ${d.sourceFacts?.join(" ")}`)
        ),
        "paymentDate ≠ actionDeadline"
      );
      A(
        !r.presentation.evidencePassages.some((p) =>
          /r[eé]seaux?\s+sociaux|des questions sur/i.test(p.excerpt)
        ),
        "evidence sans bruit footer/support"
      );
      A(
        !r.presentation.reason ||
          !/demande de paiement/i.test(r.presentation.reason.text || "")
      );
      assertInvariants(r, "O");
      assertions += 12;
      console.log(
        "  ttc=",
        ttc,
        "arith=",
        r.diagnostics.hasArithmeticInconsistency,
        "actions=",
        r.diagnostics.presentationActionsCount,
        "evidence=",
        r.presentation.evidencePassages.map((p) => p.excerpt).slice(0, 3)
      );
    });

    wrap("P — Prélèvement vs action (cas A/B/C)", () => {
      const a = run(`
Facture
Total HT : 331,36 €
TVA 20 % : 66,27 €
Total TTC : 397,63 €
Le montant de 397,63 € sera prélevé automatiquement le 18 janvier 2026.
`.trim());
      Eq(a.diagnostics.presentationActionsCount, 0);
      A(
        a.presentation.secondaryInformation.some((s) =>
          /pr[eé]l[eè]vement/i.test(s.text)
        )
      );
      A(
        !a.presentation.importantDates.some((d) =>
          /actionDeadline/i.test(String(d.kind))
        )
      );
      const payDate = a.presentation.importantDates.find((d) =>
        /pr[eé]l[eè]vement|paymentDate/i.test(`${d.kind} ${d.label}`)
      );
      A(
        payDate == null ||
          String(payDate.value).includes("2026-01-18") ||
          /18 janvier/i.test(payDate.text || "")
      );
      assertInvariants(a, "P-A");

      const b = run(`
Facture
Total HT : 331,36 €
TVA 20 % : 66,27 €
Total TTC : 397,63 €
Merci de régler 397,63 € avant le 18 janvier 2026.
`.trim());
      A(b.diagnostics.presentationActionsCount >= 1, "cas B action paiement");
      A(
        b.presentation.importantDates.some(
          (d) =>
            String(d.value).includes("2026-01-18") ||
            /18 janvier/i.test(d.text || "")
        ),
        "cas B deadline"
      );
      assertInvariants(b, "P-B");

      const c = run(`
Facture
Total HT : 331,36 €
TVA 20 % : 66,27 €
Total TTC : 397,63 €
Retournez le mandat SEPA signé avant le 18 janvier 2026.
`.trim());
      A(c.diagnostics.presentationActionsCount >= 1, "cas C action mandat");
      A(
        c.presentation.importantDates.some(
          (d) =>
            String(d.value).includes("2026-01-18") ||
            /18 janvier/i.test(d.text || "")
        ),
        "cas C deadline"
      );
      assertInvariants(c, "P-C");
      assertions += 12;
      console.log(
        "  A actions=",
        a.diagnostics.presentationActionsCount,
        "B=",
        b.diagnostics.presentationActionsCount,
        "C=",
        c.diagnostics.presentationActionsCount
      );
    });

    Eq(fetchCalls, 0, "0 fetch");
    assertions += 1;

    console.log("\n────────────────────────────────");
    console.log(`Fixtures end-to-end : ${fixtures}`);
    console.log(`Assertions (approx) : ${assertions}`);
    console.log("Fetch calls          :", fetchCalls);
    console.log("LLM                  : 0");
    console.log("✓ V4-I end-to-end OK — 0 fetch / 0 LLM");
  } catch (err) {
    console.error("\n✗ Échec V4-I:", err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main();
