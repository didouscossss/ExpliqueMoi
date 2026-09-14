#!/usr/bin/env node
/**
 * Non-régression : la structure documentaire (Document Structure
 * Engine) doit pouvoir influencer la centralité d'un fait, sans
 * jamais décider seule.
 *
 * Principe testé (générique, PAS spécifique à la copropriété) :
 * une information au gabarit de phrase identique pèse moins si
 * elle se trouve sur une page classée "annexe" que sur une page
 * du document principal. Le texte des deux items suit le même
 * gabarit ("Montant à régler avant le ... : X €") et ne contient
 * aucun mot-clé ("annexe", "exemple"...) — seule la page diffère
 * — pour isoler le signal structurel de tout signal lexical.
 */
import assert from "node:assert/strict";
import { buildSemanticRelevanceProfile } from "../lib/didou/brain/semanticRelevanceEngine.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}
function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

/*
 * Deux montants distincts (le moteur dé-doublonne par valeur : un
 * même montant répété sur deux pages est traité comme UNE seule
 * information, ce qui est le bon comportement par ailleurs). Le
 * gabarit de phrase reste identique des deux côtés pour que seule
 * la page fasse varier le signal structurel testé ici.
 */
const CONTEXT_TEMPLATE = (value) =>
  `Montant à régler avant le 10 mai 2026 : ${value}.`;

const documentStructure = {
  pages: [
    { page: 1, role: "primary", subDocumentType: "main-notice", confidence: 90 },
    { page: 2, role: "annex", subDocumentType: "commercial-annex", confidence: 90 }
  ]
};

try {
  // A — Montants : gabarit de phrase identique, pages différentes
  {
    const profile = buildSemanticRelevanceProfile({
      text:
        "Avis d'échéance assurance habitation. " +
        CONTEXT_TEMPLATE("120,00 €") +
        " " +
        CONTEXT_TEMPLATE("4200,00 €"),
      documentType: "Avis d'échéance d'assurance habitation",
      family: "assurance",
      documentStructure,
      amounts: [
        {
          value: "120,00 €",
          numeric: 120,
          confidence: 80,
          verified: true,
          userRelevant: true,
          context: CONTEXT_TEMPLATE("120,00 €"),
          page: 1
        },
        {
          value: "4200,00 €",
          numeric: 4200,
          confidence: 80,
          verified: true,
          userRelevant: true,
          context: CONTEXT_TEMPLATE("4200,00 €"),
          page: 2
        }
      ]
    });

    const items = profile.amounts.all;
    const primaryPageItem = items.find((i) => i.page === 1);
    const annexPageItem = items.find((i) => i.page === 2);

    assert.ok(primaryPageItem, "montant page 1 introuvable");
    assert.ok(annexPageItem, "montant page 2 introuvable");

    assert.ok(
      primaryPageItem.centrality.score > annexPageItem.centrality.score,
      `page primaire (${primaryPageItem.centrality.score}) devrait dépasser page annexe (${annexPageItem.centrality.score})`
    );

    assert.equal(
      annexPageItem.centrality.reasons.includes("structural-annex-page"),
      true,
      "le signal structurel doit apparaître dans les raisons de la page annexe"
    );

    assert.equal(
      primaryPageItem.centrality.reasons.includes("structural-primary-page"),
      true,
      "le signal structurel doit apparaître dans les raisons de la page primaire"
    );

    pass(
      "AMOUNT_STRUCTURAL_CENTRALITY",
      `primary=${primaryPageItem.centrality.score} annex=${annexPageItem.centrality.score}`
    );
  }

  // B — Aucune structure disponible → aucun signal, aucune régression
  {
    const profile = buildSemanticRelevanceProfile({
      text: "Avis d'échéance assurance habitation. " + CONTEXT_TEMPLATE("120,00 €"),
      documentType: "Avis d'échéance d'assurance habitation",
      family: "assurance",
      documentStructure: null,
      amounts: [
        {
          value: "120,00 €",
          numeric: 120,
          confidence: 80,
          verified: true,
          userRelevant: true,
          context: CONTEXT_TEMPLATE("120,00 €"),
          page: 1
        }
      ]
    });

    const item = profile.amounts.all[0];
    assert.ok(item, "montant introuvable");
    assert.equal(
      item.centrality.reasons.some((r) => r.startsWith("structural-")),
      false,
      "sans structure documentaire, aucun signal structurel ne doit apparaître"
    );

    pass("NO_STRUCTURE_NO_SIGNAL", "aucune structure -> aucun biais");
  }

  // C — Basse confiance de classification → signal ignoré
  {
    const lowConfidenceStructure = {
      pages: [
        { page: 1, role: "primary", subDocumentType: null, confidence: 40 },
        { page: 2, role: "annex", subDocumentType: null, confidence: 40 }
      ]
    };

    const profile = buildSemanticRelevanceProfile({
      text: "Avis d'échéance assurance habitation. " + CONTEXT_TEMPLATE("120,00 €"),
      documentType: "Avis d'échéance d'assurance habitation",
      family: "assurance",
      documentStructure: lowConfidenceStructure,
      amounts: [
        {
          value: "120,00 €",
          numeric: 120,
          confidence: 80,
          verified: true,
          userRelevant: true,
          context: CONTEXT_TEMPLATE("120,00 €"),
          page: 2
        }
      ]
    });

    const item = profile.amounts.all[0];
    assert.equal(
      item.centrality.reasons.some((r) => r.startsWith("structural-")),
      false,
      "une classification de page peu fiable ne doit jamais influencer la centralité"
    );

    pass("LOW_CONFIDENCE_PAGE_IGNORED", "confiance page < seuil -> ignoré");
  }

  console.log("Structural centrality tests PASSED");
} catch (error) {
  fail("UNEXPECTED", error?.stack || error?.message || String(error));
  console.log("Structural centrality tests FAILED");
}
