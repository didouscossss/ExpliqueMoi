/**
 * Classification locale du type de document.
 * Couvre le bug facture électricité (IBAN/BIC) → relevé_bancaire.
 * Usage: npm run test:v3-document-type
 */

import assert from "node:assert/strict";
import { detectDocumentType } from "../lib/v3/localAnalysis/documentType.ts";
import { analyzeLocally } from "../lib/v3/localAnalysis/index.js";

/** Texte réaliste d'une facture d'électricité avec coordonnées SEPA (sans nom de fournisseur). */
const FACTURE_ELECTRICITE = `
Facture d'électricité
Numéro de facture : FAC-2025-8841
Date de facture : 15/11/2025

Consommation électrique période du 01/10/2025 au 31/10/2025
Abonnement
Taxes et contributions

Total HT 48,52 €
TVA 20 % 9,70 €
Total TTC 58,22 €
Montant de facture : 58,22 €
Montant à payer : 58,22 €

Prélèvement automatique
Mandat SEPA
Titulaire du compte : M DUPONT JEAN
IBAN FR76 1234 5678 9012 3456 7890 123
BIC AGRIFRPP
Coordonnées bancaires pour le paiement
`.trim();

const FACTURE_FREE = `
FREE MOBILE
FACTURE
Facture n° FM-998877
Date de prélèvement : 24/11/2025
Abonnement Free
Prix HT 8,00 €
Total HT 8,33 €
TVA 20% 1,66 €
Total TTC 9,99 €
Montant à payer : 9,99 €
`.trim();

const FACTURE_SOSH = `
Bienvenue chez Sosh
Votre facture
n° client : 2009682949
Date de facture : 17/11/2025
HT TTC
total auprès d'Orange 21,66 25,99
La TVA est de 20,00%
Montant à payer : 25,99 €
`.trim();

const RELEVE_BANCAIRE = `
Relevé de compte
Banque Populaire
IBAN FR14 2004 1010 0505 0001 3M02 606
BIC AGRIFRPP
Solde précédent : 1 234,56 €
Date valeur Débit Crédit Libellé
02/11/2025 45,00 CARTE MAGASIN
Nouveau solde créditeur : 1 189,56 €
Mouvements du compte
`.trim();

const IBAN_ONLY = `
Coordonnées de paiement
IBAN FR76 1234 5678 9012 3456 7890 123
BIC AGRIFRPP
Titulaire du compte : M DUPONT
Prélèvement
`.trim();

function section(title) {
  console.log(`\n▸ ${title}`);
}

function testElectriciteScores() {
  section("facture électricité — scores & type");
  const guess = detectDocumentType(FACTURE_ELECTRICITE);
  console.log("  scores=", guess.scores);
  console.log("  facture signals=", guess.signals?.facture);
  console.log("  releve signals=", guess.signals?.releve_bancaire);
  assert.equal(guess.documentType, "facture");
  assert.ok((guess.scores?.facture || 0) > (guess.scores?.releve_bancaire || 0));
  assert.ok(
    (guess.scores?.releve_bancaire || 0) < 8,
    "relevé bancaire doit rester sous le seuil minScore (IBAN seul insuffisant)"
  );
  const local = analyzeLocally(FACTURE_ELECTRICITE);
  assert.equal(local.documentType, "facture");
  console.log("  OK type=facture score_facture=", guess.scores?.facture, "score_releve=", guess.scores?.releve_bancaire);
}

function testFree() {
  section("facture Free → facture");
  const guess = detectDocumentType(FACTURE_FREE);
  assert.equal(guess.documentType, "facture");
  assert.equal(analyzeLocally(FACTURE_FREE).documentType, "facture");
  console.log("  OK scores=", guess.scores?.facture, "vs releve", guess.scores?.releve_bancaire);
}

function testSosh() {
  section("facture Sosh → facture");
  const guess = detectDocumentType(FACTURE_SOSH);
  assert.equal(guess.documentType, "facture");
  assert.equal(analyzeLocally(FACTURE_SOSH).documentType, "facture");
  console.log("  OK scores=", guess.scores?.facture, "vs releve", guess.scores?.releve_bancaire);
}

function testReleve() {
  section("vrai relevé bancaire → releve_bancaire");
  const guess = detectDocumentType(RELEVE_BANCAIRE);
  console.log("  scores=", guess.scores);
  assert.equal(guess.documentType, "releve_bancaire");
  assert.ok((guess.scores?.releve_bancaire || 0) >= 8);
  assert.equal(analyzeLocally(RELEVE_BANCAIRE).documentType, "releve_bancaire");
  console.log("  OK type=releve_bancaire");
}

function testIbanNotEnough() {
  section("IBAN/BIC/prélèvement seuls ≠ relevé bancaire");
  const guess = detectDocumentType(IBAN_ONLY);
  console.log("  scores=", guess.scores, "type=", guess.documentType);
  assert.notEqual(guess.documentType, "releve_bancaire");
  assert.ok((guess.scores?.releve_bancaire || 0) < 8);
  console.log("  OK pas classé relevé (score=", guess.scores?.releve_bancaire, ")");
}

function main() {
  console.log("=== test-v3-document-type ===");
  testElectriciteScores();
  testFree();
  testSosh();
  testReleve();
  testIbanNotEnough();
  console.log("\nTous les tests documentType OK.");
}

main();
