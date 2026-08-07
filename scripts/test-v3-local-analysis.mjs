/**
 * Tests unitaires analyse locale V3 — plusieurs types de documents.
 * Usage: npm run test:v3-local
 */

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { LocalAnalysisEngine } from "../lib/v3/localAnalysis/LocalAnalysisEngine.js";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";
import { extractAmounts } from "../lib/v3/localAnalysis/extractors.js";
import { mapV3ResponseToUiAnalysis } from "../lib/v3/client/mapToUiAnalysis.js";

const SIRET = "73282932000074";
const IBAN = "FR14 2004 1010 0505 0001 3M02 606";

const FIXTURES = {
  facture: `
FACTURE N° FA-2026-0142
SAS DUPONT SERVICES
SIRET: ${SIRET}
Émetteur: SAS DUPONT SERVICES
Client: Mme Alice Martin
Date d'émission: 12/03/2026
Échéance: 12/04/2026

Montant HT: 100,00 €
TVA 20%: 20,00 €
Montant TTC: 120,00 €
IBAN: ${IBAN}
Merci de régler par virement.
`.trim(),

  /** Facture type opérateur : ligne partielle HT + totaux HT/TVA/TTC + à payer. */
  factureOperateur: `
FREE MOBILE
FACTURE
Facture n° FM-998877
Date de prélèvement : 24/11/2025

Abonnement Free
Prix HT 8,00 €
Options 0,33 €

Total HT 8,33 €
TVA 20% 1,66 €
Total TTC 9,99 €
Montant à payer : 9,99 €
`.trim(),

  /** Même totaux sans libellé TTC explicite — seulement « à payer ». */
  factureAPayerSeul: `
FACTURE
Fournisseur Telecom
Prix HT 8,00 €
Total HT : 8,33 €
TVA 20% : 1,66 €
Montant à payer : 9,99 €
`.trim(),

  devis: `
DEVIS N° DV-7781
SARL BRICO PRO
Client: M. Jean Leroy
Date: 01/06/2026
Valable jusqu'au 30/06/2026
Total HT: 250,00 EUR
TVA: 50,00 EUR
Total TTC: 300,00 EUR
Proposition commerciale pour travaux.
`.trim(),

  contrat: `
CONTRAT DE PRESTATION
Entre les soussignés
SAS ALPHA TECH
et
Client: Société BETA
Article 1 - Objet
Lu et approuvé.
Fait le 05/01/2026
`.trim(),

  bulletin: `
BULLETIN DE SALAIRE
Période: janvier 2026
Salarié: Paul Durand
Salaire brut: 2 400,00 €
Net à payer: 1 870,50 €
URSSAF
Congés payés
`.trim(),

  releve: `
RELEVE DE COMPTE
Banque Populaire
IBAN: ${IBAN}
Solde créditeur au 28/02/2026: 1 250,00 €
`.trim(),

  courrier: `
Objet: Information importante
Madame, Monsieur,
Nous vous informons que votre dossier est en cours de traitement.
Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.
Cordialement,
Service client
`.trim(),

  ordonnance: `
ORDONNANCE
Docteur Camille Petit
Patient: Luc Moreau
Prescrit:
Amoxicilline 500 mg
Posologie: 1 comprimé 3 fois par jour
Pharmacie à délivrer
`.trim(),

  inconnu: `
Liste diverse
aaaa bbbb cccc
12345
`.trim()
};

function section(title) {
  console.log(`\n▸ ${title}`);
}

function testFacture() {
  section("facture");
  const result = analyzeLocally(FIXTURES.facture);
  assert.equal(result.documentType, "facture");
  assert.equal(result.fields.invoiceNumber, "FA-2026-0142");
  assert.equal(result.fields.siret, SIRET);
  assert.equal(result.fields.iban, IBAN.replace(/\s+/g, ""));
  assert.equal(result.fields.amountHT, 100);
  assert.equal(result.fields.amountTVA, 20);
  assert.equal(result.fields.amountTTC, 120);
  assert.equal(result.fields.companyName, "SAS DUPONT SERVICES");
  assert.equal(result.fields.clientName, "Mme Alice Martin");
  assert.ok(result.fields.date === "2026-03-12" || /12\/03\/2026/.test(String(result.fields.date)));
  assert.ok(result.deadlines.length >= 1);
  assert.ok(result.detectedActions.some((a) => /régler/i.test(a)));
  console.log("  OK", JSON.stringify(result.fields));
}

function testFactureHtTvaTtcEtPrincipal() {
  section("facture HT + TVA + TTC (pas de confusion ligne / total)");
  const result = analyzeLocally(FIXTURES.factureOperateur);
  assert.equal(result.documentType, "facture");
  assert.equal(result.fields.amountHT, 8.33);
  assert.equal(result.fields.amountTVA, 1.66);
  assert.equal(result.fields.amountTTC, 9.99);
  assert.equal(result.fields.amountToPay, 9.99);
  assert.notEqual(result.fields.amountHT, 8);
  assert.notEqual(result.fields.amountTVA, 20);

  const mapped = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: result,
    result: {
      ok: true,
      summary: "Facture Free Mobile 9,99 € TTC.",
      explanation: {
        documentType: "facture",
        keyPoints: ["HT 8,33 €", "TVA 1,66 €", "TTC 9,99 €"],
        warnings: []
      },
      provider: "openai",
      model: "gpt-4o-mini"
    }
  });
  assert.equal(mapped.amount.value, "9,99 €");
  assert.equal(mapped.amount.source, "amountToPay");
  assert.doesNotMatch(mapped.amount.value, /^8[,.]00/);
  console.log(
    "  OK principal=",
    mapped.amount.value,
    `(source=${mapped.amount.source})`,
    "| HT/TVA/TTC/toPay=",
    result.fields.amountHT,
    result.fields.amountTVA,
    result.fields.amountTTC,
    result.fields.amountToPay
  );
}

function testFactureMontantAPayerSansTtcLabel() {
  section("facture montant à payer sans libellé TTC");
  const result = analyzeLocally(FIXTURES.factureAPayerSeul);
  assert.equal(result.documentType, "facture");
  assert.equal(result.fields.amountHT, 8.33);
  assert.equal(result.fields.amountTVA, 1.66);
  assert.equal(result.fields.amountToPay, 9.99);
  const mapped = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: result,
    result: {
      ok: true,
      summary: "x",
      explanation: { documentType: "facture", keyPoints: [], warnings: [] }
    }
  });
  assert.equal(mapped.amount.value, "9,99 €");
  assert.equal(mapped.amount.source, "amountToPay");
  console.log("  OK à payer → amountToPay=", result.fields.amountToPay);
}

function testTvaRateNotCapturedAsAmount() {
  section("TVA : ne pas capturer le taux (%) comme montant");
  const amounts = extractAmounts("Total HT 8,33 €\nTVA 20% 1,66 €\nTotal TTC 9,99 €");
  const tva = amounts.filter((a) => a.label === "TVA");
  assert.ok(tva.some((a) => a.value === 1.66));
  assert.ok(!tva.some((a) => a.value === 20));
  assert.ok(!tva.some((a) => a.value === 8.33));
  console.log("  OK TVA amounts=", tva.map((a) => a.value));
}

function testSommeAPayerTtcRegression() {
  section("régression Somme à payer TTC : 9.99 €");
  const text = `
FREE MOBILE
FACTURE
Date de prélèvement : 24/11/2025
Total de la facture HT : 8.33 €
TVA : 1.66 € (20%)
Somme à payer TTC : 9.99 €
`.trim();
  const result = analyzeLocally(text);
  assert.equal(result.documentType, "facture");
  assert.equal(result.fields.amountHT, 8.33);
  assert.equal(result.fields.amountTVA, 1.66);
  assert.equal(result.fields.amountTTC, 9.99);
  assert.equal(result.fields.amountToPay, 9.99);
  assert.equal(result.fields.date, "2025-11-24");
  assert.match(result.factualSummary, /9[,.]99/);
  assert.match(result.factualSummary, /prélevée le 24 novembre 2025/);
  assert.ok(result.evidence.some((e) => /Somme à payer TTC/.test(e.quote)));
  for (const ev of result.evidence) {
    assert.ok(
      text.includes(ev.quote) ||
        text.replace(/\s+/g, " ").includes(ev.quote.replace(/\s+/g, " "))
    );
  }

  const mapped = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: result,
    result: {
      ok: true,
      summary: result.factualSummary,
      explanation: {
        documentType: "autre",
        keyPoints: ["Montant inventé 1 €"],
        warnings: []
      }
    },
    meta: { ai: { available: false } }
  });
  assert.equal(mapped.amount.value, "9,99 €");
  assert.equal(mapped.document_type, "facture");
  assert.equal(mapped.plain_summary, result.factualSummary);
  assert.ok(!mapped.evidence.some((e) => /inventé/.test(e.quote)));
  console.log(
    "  OK summary=",
    result.factualSummary,
    "| principal=",
    mapped.amount.value
  );
}

function testDevis() {
  section("devis");
  const result = analyzeLocally(FIXTURES.devis);
  assert.equal(result.documentType, "devis");
  assert.equal(result.fields.invoiceNumber, "DV-7781");
  assert.equal(result.fields.amountTTC, 300);
  assert.equal(result.fields.clientName, "M. Jean Leroy");
  console.log("  OK type=devis TTC=", result.fields.amountTTC);
}

function testContrat() {
  section("contrat");
  const result = analyzeLocally(FIXTURES.contrat);
  assert.equal(result.documentType, "contrat");
  assert.ok(result.issuer || result.fields.companyName);
  console.log("  OK company=", result.fields.companyName);
}

function testBulletin() {
  section("bulletin de salaire");
  const result = analyzeLocally(FIXTURES.bulletin);
  assert.equal(result.documentType, "bulletin_de_salaire");
  assert.equal(result.fields.netToPay, 1870.5);
  const mapped = mapV3ResponseToUiAnalysis({
    ok: true,
    localAnalysis: result,
    result: {
      ok: true,
      summary: "Bulletin.",
      explanation: {
        documentType: "bulletin de salaire",
        keyPoints: [],
        warnings: []
      }
    }
  });
  assert.match(mapped.amount.value, /1.?870,50/);
  console.log("  OK net=", result.fields.netToPay, "principal=", mapped.amount.value);
}

function testReleve() {
  section("relevé bancaire");
  const result = analyzeLocally(FIXTURES.releve);
  assert.equal(result.documentType, "releve_bancaire");
  assert.equal(result.fields.iban, IBAN.replace(/\s+/g, ""));
  console.log("  OK iban=", result.fields.iban);
}

function testCourrier() {
  section("courrier");
  const result = analyzeLocally(FIXTURES.courrier);
  assert.equal(result.documentType, "courrier");
  console.log("  OK confidence=", result.documentTypeConfidence);
}

function testOrdonnance() {
  section("ordonnance");
  const result = analyzeLocally(FIXTURES.ordonnance);
  assert.equal(result.documentType, "ordonnance");
  assert.equal(result.fields.clientName, "Luc Moreau");
  console.log("  OK patient=", result.fields.clientName);
}

function testInconnu() {
  section("document inconnu");
  const result = analyzeLocally(FIXTURES.inconnu);
  assert.equal(result.documentType, "document_inconnu");
  console.log("  OK warnings=", result.warnings.length);
}

function testOcrResultShape() {
  section("entrée OCRResult");
  const engine = new LocalAnalysisEngine();
  const result = engine.analyzeOcr({
    pages: [{ pageNumber: 1, text: FIXTURES.facture, confidence: 98 }],
    fullText: FIXTURES.facture,
    warnings: []
  });
  assert.equal(result.documentType, "facture");
  assert.equal(result.fields.amountTTC, 120);
  console.log("  OK via OCRResult");
}

function testPerformance() {
  section("performance");
  const engine = new LocalAnalysisEngine();
  const samples = Object.values(FIXTURES);
  const warmup = 20;
  const iterations = 200;

  for (let i = 0; i < warmup; i += 1) {
    engine.analyze(samples[i % samples.length]);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    engine.analyze(samples[i % samples.length]);
  }
  const elapsed = performance.now() - start;
  const perDoc = elapsed / iterations;
  assert.ok(perDoc < 20, `trop lent: ${perDoc.toFixed(3)} ms/doc`);
  console.log(
    `  OK ${iterations} analyses en ${elapsed.toFixed(1)} ms → ${perDoc.toFixed(3)} ms/doc`
  );
  return { elapsed, perDoc, iterations };
}

async function main() {
  console.log("test-v3-local-analysis — ExpliqueMoi V3");
  testFacture();
  testFactureHtTvaTtcEtPrincipal();
  testFactureMontantAPayerSansTtcLabel();
  testTvaRateNotCapturedAsAmount();
  testSommeAPayerTtcRegression();
  testDevis();
  testContrat();
  testBulletin();
  testReleve();
  testCourrier();
  testOrdonnance();
  testInconnu();
  testOcrResultShape();
  const perf = testPerformance();
  console.log("\n✓ Tous les tests d’analyse locale V3 ont réussi.");
  console.log(
    `Perf: ${perf.perDoc.toFixed(3)} ms/doc (moyenne sur ${perf.iterations} runs)\n`
  );
}

main().catch((error) => {
  console.error("\n✗ Échec tests localAnalysis V3:", error);
  process.exit(1);
});
