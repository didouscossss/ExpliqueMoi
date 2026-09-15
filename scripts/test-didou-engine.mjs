#!/usr/bin/env node
/**
 * Tests Didou — moteur local (0 Gemini / 0 fetch).
 */
import assert from "node:assert/strict";
import {
  analyzeDocumentWithDidou,
  runDidouPipeline
} from "../lib/didou/index.js";
import { buildDidoutorContext } from "../lib/didoutor/index.js";
import { extractActionPhrases } from "../lib/didou/extract/actions.js";
import { extractDatesAndPeriods } from "../lib/didou/extract/dates.js";
import {
  QUITTANCE_LOYER,
  LIASSE_FISCALE_2031,
  CONVOCATION_AG,
  FACTURE_FREE,
  MISE_EN_DEMEURE,
  REJET_PRELEVEMENT,
  CONTRAT_TRAVAIL_CDI,
  NOTIFICATION_TROP_PERCU_CAF,
  DECOMPTE_CPAM,
  AVIS_IMPOT_REVENU,
  AVIS_ECHEANCE_ASSURANCE,
  CONFIRMATION_RESILIATION,
  AVIS_PASSAGE_COLIS,
  LIASSE_FISCALE_2032,
  CONVOCATION_MEDICALE,
  RELEVE_CARRIERE_CNAV,
  CONVENTION_STAGE,
  AVIS_CONTRAVENTION,
  CARTE_GRISE,
  AVIS_ECHEANCE_ENERGIE,
  ATTESTATION_EMPLOYEUR_FRANCE_TRAVAIL,
  SINISTRE_ASSURANCE,
  CONFIRMATION_SOUSCRIPTION_ENERGIE,
  NOTIFICATION_DROITS_CAF_MULTI,
  CONTROLE_TECHNIQUE,
  CHANGEMENT_RIB,
  AVIS_TAXE_HABITATION,
  RADIATION_FRANCE_TRAVAIL,
  RELANCE_FACTURE_IMPAYEE,
  VISITE_MEDECINE_TRAVAIL,
  CONVOCATION_AG_VOTE_EXPRIME,
  PV_AG_ORDINAIRE,
  CONVOCATION_AG_SANS_LIEU_LABEL,
  RUPTURE_CONVENTIONNELLE,
  CONGE_POUR_VENTE,
  AVIS_TIERS_DETENTEUR
} from "../lib/didou/__fixtures__/referenceDocs.mjs";

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  throw new Error("fetch interdit dans Didou: " + url);
};

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}
function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

try {
  // A — Quittance
  {
    const { didou, preview } = analyzeDocumentWithDidou({
      pastedText: QUITTANCE_LOYER
    });
    assert.equal(didou.family, "logement");
    assert.match(String(didou.documentType), /quittance/i);
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /370/);
    assert.ok(
      /payé|quittanc|loyer/i.test(
        `${didou.mainAmount.label} ${didou.mainAmount.meaning} ${didou.mainAmount.role}`
      )
    );
    assert.ok(didou.mainDate?.date);
    assert.match(String(didou.mainDate.date), /juillet|2026/i);
    assert.ok(
      didou.importantFacts.some((f) =>
        /preuve|paiement|payé|quittanc/i.test(`${f.label} ${f.value}`)
      )
    );
    // Pas de dump de dates parasites
    assert.ok((preview.dates || []).length <= 3);
    assert.ok(!/non identifié/i.test(preview.document_type));
    pass(
      "QUITTANCE",
      `${didou.documentType} | ${didou.mainAmount.value} | ${didou.mainDate.date}`
    );
  }

  // B — Liasse fiscale (pas de timeout Gemini, pas de dump)
  {
    const started = Date.now();
    const { didou, preview } = analyzeDocumentWithDidou({
      pastedText: LIASSE_FISCALE_2031
    });
    const ms = Date.now() - started;
    assert.ok(ms < 2000, `trop lent: ${ms}ms`);
    assert.equal(didou.family, "fiscal");
    assert.match(String(didou.documentType), /liasse|2031|déclaration/i);
    assert.ok(!/^bénéfices professionnels$/i.test(didou.documentType || ""));
    // Pas de liste interminable
    assert.ok((preview.amounts_detail || []).length <= 3);
    assert.ok((preview.dates || []).length <= 3);
    assert.ok(
      !didou.mainAmount ||
        !/table_value|unknown/i.test(didou.mainAmount.role || "")
    );
    pass(
      "LIASSE",
      `${didou.documentType} | ${ms}ms | amounts_detail=${(preview.amounts_detail || []).length}`
    );
  }

  // C — Convocation AG
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_AG
    });
    assert.equal(didou.family, "copropriete");
    assert.match(String(didou.documentType), /convocation|assemblée|copropriété/i);
    assert.ok(didou.mainDate?.date);
    assert.match(didou.mainDate.date, /12\/09\/2026/);
    assert.ok(
      didou.importantFacts.some((f) => /heure|18/i.test(`${f.label} ${f.value}`)) ||
        /18/i.test(didou.mainDate.meaning || "")
    );
    assert.ok(
      didou.actions.length >= 1 ||
        didou.importantFacts.some((f) => /ordre du jour|procuration/i.test(`${f.label} ${f.value}`))
    );
    pass(
      "AG",
      `${didou.documentType} | ${didou.mainDate.date} | actions=${didou.actions.length}`
    );
  }

  // C2 — Procès-verbal d'AG (non-régression, cas réel signalé)
  //
  // Contrairement à une convocation, un PV est rédigé APRÈS la
  // réunion : phrase d'ouverture au format légal ("L'an deux mille
  // vingt-six, le vingt juillet à 17h00... se sont réunis..."),
  // titre "ASSEMBLÉE GÉNÉRALE ORDINAIRE DU" (qualificatif entre
  // "générale" et "du"), et lieu introduit par "réunis... à" (pas
  // "se tiendra"/"Lieu :"). Un vrai document de ce type faisait
  // ressortir une date de budget (01/01/2027, présente près du mot
  // "convocation" et de "l'Assemblée Générale approuve...", répété
  // devant chaque résolution d'un PV) au lieu de la vraie date de
  // réunion, et ne détectait aucun lieu.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: PV_AG_ORDINAIRE
    });
    assert.equal(didou.family, "copropriete");
    assert.ok(didou.mainDate?.date);
    assert.match(
      didou.mainDate.date,
      /20\/07\/2026/,
      "la vraie date de réunion doit gagner sur la date de budget (01/01/2027)"
    );
    assert.equal(
      didou.mainDate.time,
      "17:00",
      "l'heure de la phrase d'ouverture doit être détectée"
    );
    assert.match(
      didou.mainDate.place || "",
      /^Agence Square Habitat/,
      "le lieu réel (après \"réunis... à\") doit être détecté"
    );
    assert.doesNotMatch(
      didou.mainDate.place || "",
      /initialement|ACROPOLYA/i,
      "le lieu initialement prévu (entre parenthèses) ne doit pas polluer le lieu réel"
    );
    pass(
      "PV_AG_ORDINAIRE",
      `${didou.mainDate.date} ${didou.mainDate.time} | ${didou.mainDate.place}`
    );
  }

  // C3 — Convocation AG sans "Lieu :" ni "se tiendra" (non-régression)
  //
  // Cas réaliste construit pour stress-tester la détection : date
  // au format verbal ("14 octobre 2026", pas de forme chiffrée
  // disponible), heure et lieu donnés sans préposition/label
  // introductifs (juste des lignes qui suivent), et plusieurs dates
  // de résolutions (exercices comptables, mandat de syndic) qui
  // auraient pu happer la date de réunion. Trois bugs trouvés et
  // corrigés en même temps : la date verbale n'était pas convertie
  // au format chiffré habituel ; le lieu capturait "18h30," au lieu
  // de s'arrêter avant ; et il continuait sur le paragraphe suivant
  // ("... 86000 Poitiers, L'" — début de "L'ordre du jour...").
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_AG_SANS_LIEU_LABEL
    });
    assert.match(
      didou.mainDate?.date || "",
      /^14\/10\/2026$/,
      "une date verbale (\"14 octobre 2026\") doit être convertie au format chiffré habituel"
    );
    assert.equal(
      didou.mainDate.time,
      "18:30"
    );
    assert.equal(
      didou.mainDate.place,
      "Salle des fêtes, 2 rue de la Mairie, 86000 Poitiers",
      "le lieu ne doit ni inclure l'heure ni déborder sur le paragraphe suivant"
    );
    pass(
      "CONVOCATION_SANS_LIEU_LABEL",
      `${didou.mainDate.date} ${didou.mainDate.time} | ${didou.mainDate.place}`
    );
  }

  // C4 — Rupture conventionnelle (non-régression, faux positif grave)
  //
  // Absente du catalogue, ce document partageait du vocabulaire
  // ("employeur", "salarié", "le contrat de travail prendra fin...")
  // avec la fiche "Contrat de travail" et était classé comme tel —
  // avec un résumé INVENTÉ ("définit le poste, la rémunération...")
  // qui ne correspond à rien dans le document réel. Violation directe
  // du principe "ne jamais inventer". Root cause secondaire trouvée
  // en creusant : isGenericExplanation() rejetait TOUJOURS tout
  // résumé de fiche catalogue commençant par "Ce document concerne"
  // (RSA, prime d'activité, procédure judiciaire étaient déjà
  // silencieusement affectés), au profit d'un residu bien plus vague.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: RUPTURE_CONVENTIONNELLE
    });
    assert.equal(didou.family, "emploi");
    assert.match(
      String(didou.documentType),
      /rupture conventionnelle/i,
      "ne doit pas être classé comme \"Contrat de travail\""
    );
    assert.match(
      didou.userSummary?.one_sentence || "",
      /rupture conventionnelle/i,
      "le résumé doit refléter le contenu réel, pas un texte de contrat de travail inventé"
    );
    assert.doesNotMatch(
      didou.userSummary?.one_sentence || "",
      /rémunération|poste, la|durée du travail/i,
      "le résumé ne doit pas inventer des clauses de contrat de travail absentes du document"
    );
    pass(
      "RUPTURE_CONVENTIONNELLE",
      `${didou.documentType} | ${didou.userSummary.one_sentence}`
    );
  }

  // C5 — Congé pour vente (non-régression, faux positif dangereux)
  //
  // Deux bugs graves trouvés sur ce document, potentiellement
  // nuisibles pour un vrai locataire :
  // (a) classé comme "Contrat de location" (un simple bail !) au
  //     lieu d'un préavis de départ — le catalogue "Congé du bail"
  //     existait mais son vocabulaire était trop étroit pour
  //     reconnaître les vraies formulations d'un congé pour vente
  //     ("ne sera pas reconduit", "droit de préemption",
  //     "libération des lieux"...).
  // (b) date principale = 01/04/2020 (la signature du bail
  //     D'ORIGINE, déjà passée) étiquetée "Date limite" au lieu du
  //     31/03/2026 (la vraie échéance) — le mot "échéance", qui
  //     décrit en réalité la date SUIVANTE dans la même phrase
  //     ("signé le 01/04/2020, arrivant à échéance le 31/03/2026"),
  //     déteignait sur la date qui le précède. Root cause trouvée
  //     dans TROIS endroits différents du code qui réimplémentaient
  //     chacun la même détection sans le même garde-fou
  //     (extract/dates.js, interpret/roles.js).
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONGE_POUR_VENTE
    });
    assert.equal(didou.family, "logement");
    assert.match(
      String(didou.documentType),
      /congé/i,
      "ne doit pas être classé comme \"Contrat de location\""
    );
    assert.match(
      didou.mainDate?.date || "",
      /^31\/03\/2026$/,
      "la vraie échéance (2026) doit gagner sur la date de signature du bail d'origine (2020, déjà passée)"
    );
    pass(
      "CONGE_POUR_VENTE",
      `${didou.documentType} | ${didou.mainDate.date}`
    );
  }

  // C6 — Avis à tiers détenteur (non-régression, ambiguïté de destinataire)
  //
  // Absent du catalogue, tombait sur "Mise en demeure fiscale" par
  // recouvrement de vocabulaire ("payer", "recouvrement", "délai"),
  // avec un résumé qui donne à croire au destinataire QU'IL doit la
  // somme — alors qu'un avis à tiers détenteur s'adresse à un TIERS
  // qui détient des fonds pour le compte du vrai débiteur (employeur,
  // banque...), une confusion potentiellement dommageable dans les
  // deux sens. Montant absent également : "la somme de X" (formule
  // juridique/administrative très courante) n'était reconnu par
  // aucun déclencheur de rôle "amountDue".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_TIERS_DETENTEUR
    });
    assert.equal(didou.family, "fiscal");
    assert.match(
      String(didou.documentType),
      /tiers détenteur/i,
      "ne doit pas être confondu avec une mise en demeure fiscale classique"
    );
    assert.match(
      didou.mainAmount?.value || "",
      /3\s?240,00\s?€/,
      "le montant (\"la somme de X\") doit être détecté malgré l'absence de \"à payer\"/\"à régler\""
    );
    assert.match(
      didou.userSummary?.one_sentence || "",
      /pas le débiteur/i,
      "le résumé doit clarifier que le destinataire n'est pas lui-même le débiteur"
    );
    pass(
      "AVIS_TIERS_DETENTEUR",
      `${didou.documentType} | ${didou.mainAmount?.value}`
    );
  }

  // D — Facture (non-régression)
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: FACTURE_FREE
    });
    assert.equal(didou.family, "facture");
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /14,99|14.99/);
    assert.ok(didou.mainDate?.date);
    pass("FACTURE", `${didou.mainAmount.value} | ${didou.mainDate.date}`);
  }

  // D2 — Mise en demeure (juridique) : famille + action réellement requise
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: MISE_EN_DEMEURE
    });
    assert.equal(didou.family, "juridique");
    assert.match(String(didou.documentType), /mise en demeure/i);
    assert.equal(didou.brain?.decision?.actionRequired, true);
    assert.ok(didou.actions.length >= 1, "une mise en demeure doit produire une action");
    assert.ok(
      didou.actions.some((a) => /r[ée]gler|payer/i.test(a.action)),
      "l'action doit porter sur le règlement de la somme due"
    );
    pass(
      "MISE_EN_DEMEURE",
      `${didou.family} | ${didou.documentType} | actions=${didou.actions.length}`
    );
  }

  // D3 — Rejet de prélèvement (bancaire) : reconnu même sans hypothèse concurrente
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: REJET_PRELEVEMENT
    });
    assert.equal(didou.family, "bancaire");
    assert.match(String(didou.documentType), /rejet.*pr[ée]l|pr[ée]l.*rejet/i);
    assert.equal(didou.brain?.decision?.actionRequired, true);
    assert.ok(didou.actions.length >= 1);
    pass(
      "REJET_PRELEVEMENT",
      `${didou.family} | ${didou.documentType} | actions=${didou.actions.length}`
    );
  }

  // D4 — Contrat de travail : pas d'action fabriquée, pas de dump de contexte brut
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONTRAT_TRAVAIL_CDI
    });
    assert.equal(didou.family, "emploi");
    assert.match(String(didou.documentType), /contrat de travail/i);
    assert.ok(didou.mainDate?.date);
    assert.equal(
      didou.mainDate.role,
      "startDate",
      "la date d'entrée en fonction ('à compter du') doit être reconnue comme date de début, pas comme période couverte par accident"
    );
    assert.ok(
      didou.mainDate.meaning.length < 100,
      `meaning ne doit pas être un dump de contexte brut : "${didou.mainDate.meaning}"`
    );
    pass(
      "CONTRAT_TRAVAIL",
      `${didou.family} | ${didou.documentType} | ${didou.mainDate.date} (${didou.mainDate.role})`
    );
  }

  // D5 — Notification de trop-perçu CAF : famille sociale + action de remboursement
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: NOTIFICATION_TROP_PERCU_CAF
    });
    assert.equal(didou.family, "social");
    assert.match(String(didou.documentType), /trop.per[cç]u/i);
    assert.equal(didou.brain?.decision?.actionRequired, true);
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /340/);
    pass(
      "NOTIFICATION_TROP_PERCU",
      `${didou.family} | ${didou.documentType} | ${didou.mainAmount.value}`
    );
  }

  // D6 — Décompte CPAM : le montant REMBOURSÉ, pas la base de calcul
  //
  // Régression réelle : "Montant payé : 26,00 €" et "Base de
  // remboursement : 26,00 €" (même valeur, deux étiquettes
  // différentes) précédaient "Montant remboursé : 18,20 €". Le
  // contexte utilisé pour classer le RÔLE de chaque montant
  // pouvait déborder sur l'étiquette du montant suivant et faire
  // gagner le mauvais montant (26,00 € au lieu de 18,20 €).
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: DECOMPTE_CPAM
    });
    assert.equal(didou.family, "sante");
    assert.match(String(didou.documentType), /remboursement.*assurance maladie/i);
    assert.ok(didou.mainAmount?.value);
    assert.match(
      didou.mainAmount.value,
      /18,20/,
      `le montant principal doit être le montant REMBOURSÉ (18,20 €), pas la base de calcul : reçu "${didou.mainAmount.value}"`
    );
    assert.equal(didou.mainAmount.role, "refundAmount");
    pass("DECOMPTE_CPAM", `${didou.family} | ${didou.mainAmount.value}`);
  }

  // D7 — Avis d'impôt : plusieurs montants rapprochés, aucune contamination
  //
  // Régression réelle : "Revenu fiscal de référence : 32 400 €"
  // (une référence, pas un montant payé) récupérait le rôle
  // "paidAmount" à cause d'une étiquette "Montant déjà prélevé à
  // la source" appartenant à un AUTRE montant, plus loin dans le
  // même paragraphe.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_IMPOT_REVENU
    });
    assert.equal(didou.family, "fiscal");
    assert.match(String(didou.documentType), /imp[oô]t sur le revenu/i);
    assert.ok(didou.mainAmount?.value);
    assert.ok(
      !/32.400|32 400/.test(didou.mainAmount.value),
      `le revenu fiscal de référence n'est pas un montant payé : reçu "${didou.mainAmount.value}"`
    );
    pass(
      "AVIS_IMPOT_REVENU",
      `${didou.family} | ${didou.mainAmount.value} (${didou.mainAmount.role})`
    );
  }

  // D8 — Avis d'échéance assurance : cotisation prélevée automatiquement
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_ECHEANCE_ASSURANCE
    });
    assert.equal(didou.family, "assurance");
    assert.match(String(didou.documentType), /[ée]ch[ée]ance/i);
    assert.ok(didou.mainAmount?.value);
    assert.match(didou.mainAmount.value, /187,40/);
    assert.equal(didou.mainAmount.role, "automaticDebitAmount");
    assert.ok(didou.mainDate?.date);
    assert.match(didou.mainDate.date, /15\/07\/2026/);
    pass(
      "AVIS_ECHEANCE_ASSURANCE",
      `${didou.family} | ${didou.mainAmount.value} | ${didou.mainDate.date}`
    );
  }

  // D9 — Confirmation de résiliation : AUCUN type dans le catalogue
  // Knowledge ne couvre ce cas (pas de fiche "résiliation télécom") —
  // c'est un test de raisonnement générique, pas de correspondance
  // catalogue. Régression réelle : le signal "prélèvement du dernier
  // mois" (secondaire) l'emportait sur le vrai sujet de la lettre
  // (confirmer une résiliation), donnant "Avis de prélèvement".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONFIRMATION_RESILIATION
    });
    assert.match(
      String(didou.documentType),
      /r[ée]siliation/i,
      `le sujet réel de la lettre (résiliation) doit primer sur le détail secondaire (prélèvement) : reçu "${didou.documentType}"`
    );
    assert.equal(didou.brain?.consensus?.intent, "decision");
    assert.match(didou.whyReceived, /r[ée]siliation|annulation/i);
    // L'action "annuler la résiliation avant le 25/06" doit survivre,
    // même optionnelle (actionRequired peut rester false).
    assert.ok(
      didou.actions.some((a) => /annuler/i.test(a.action)),
      "la possibilité d'annuler la résiliation doit rester visible"
    );
    pass(
      "CONFIRMATION_RESILIATION",
      `${didou.documentType} | ${didou.actions.length} action(s)`
    );
  }

  // D10 — Avis de passage colis : aucune fiche Knowledge, échéance
  // coupée par un retour à la ligne dans le texte source
  //
  // Régression réelle (introduite par mon propre correctif de
  // contamination de contexte entre dates) : "avant le\n26/06/2026"
  // — un simple retour à la ligne dû à l'habillage du texte —
  // était traité comme une fin de phrase, coupant "avant le" de sa
  // propre date. Résultat : mainDate = null et un fragment
  // d'action tronqué et absurde ("avant le" tout seul), alors que
  // "Document non compris" était affiché malgré une échéance
  // parfaitement claire dans le texte.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_PASSAGE_COLIS
    });
    assert.ok(
      didou.mainDate?.date,
      "l'échéance de retrait doit être trouvée malgré le retour à la ligne dans le texte source"
    );
    assert.match(didou.mainDate.date, /26\/06\/2026/);
    assert.equal(didou.mainDate.role, "deadline");
    // Régression réelle (introduite par l'ajout du catalogue
    // administratif) : la phrase "muni d'une pièce d'identité" (une
    // simple EXIGENCE pour retirer le colis) faisait gagner la fiche
    // Knowledge "Pièce d'identité" via son signal "type" — un nom de
    // fiche qui apparaît tel quel dans le texte, mais pas comme
    // auto-désignation du document. Corrigé en exigeant un minimum
    // de corroboration (vocabulaire/phrase/organisme) en plus du
    // simple nom de type avant de laisser Knowledge trancher seul.
    assert.notEqual(
      didou.documentType,
      "Pièce d'identité",
      "une simple mention de \"pièce d'identité\" comme exigence ne doit pas faire passer ce document pour une pièce d'identité elle-même"
    );
    assert.ok(
      !didou.actions.some((a) => a.action.trim() === "avant le"),
      "aucun fragment d'action tronqué et absurde ne doit apparaître"
    );
    assert.notEqual(
      didou.userSummary?.document_label,
      "Document non compris",
      "un fait concret et fiable (l'échéance) suffit à ne pas déclarer forfait"
    );
    // Deux voies indépendantes (extraction par mots-clés et
    // Semantic Relevance) capturaient la même instruction avec un
    // texte différent (l'une contenant l'autre) -> même action
    // affichée deux fois dans la liste.
    assert.equal(
      didou.actions.length,
      1,
      `une seule action attendue (pas de quasi-doublon) : reçu ${JSON.stringify(didou.actions.map((a) => a.action))}`
    );
    pass(
      "AVIS_PASSAGE_COLIS",
      `mainDate=${didou.mainDate.date} | label="${didou.userSummary?.document_label}" | actions=${didou.actions.length}`
    );
  }

  // D11 — Liasse fiscale, annexe 2032 : ne doit pas être confondue
  // avec le 2031-SD (vocabulaire partagé "liasse"/"résultat
  // fiscal"/"bénéfices"), doit retenir le résultat FINAL de
  // l'exercice comme montant principal (pas un résultat
  // intermédiaire "avant impôt", ni une valeur de tableau
  // générique), et doit reconnaître l'échéance de transmission
  // même formulée à la voix passive ("doit être transmis").
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: LIASSE_FISCALE_2032
    });
    assert.equal(didou.family, "fiscal");
    assert.doesNotMatch(
      didou.documentType || "",
      /2031/,
      "un formulaire 2032 ne doit pas être présenté comme le 2031-SD"
    );
    assert.match(didou.documentType || "", /2032|annexe/i);
    assert.ok(didou.mainAmount, "un montant principal doit être retenu");
    assert.match(didou.mainAmount.value, /87[\s  ]450,00[\s  ]€/);
    assert.doesNotMatch(
      didou.mainAmount.value,
      /84[\s  ]500,00[\s  ]€/,
      "le résultat intermédiaire \"avant impôt\" ne doit pas l'emporter sur le résultat final de l'exercice"
    );
    assert.ok(
      !/table_value|unknown/i.test(didou.mainAmount.role || ""),
      "le résultat de l'exercice ne doit pas rester classé comme valeur de tableau générique"
    );
    assert.ok(didou.mainDate?.date, "l'échéance de transmission doit être trouvée");
    assert.match(didou.mainDate.date, /20\/05\/2026/);
    assert.ok(
      didou.actions.length >= 1,
      "l'obligation de transmission formulée à la voix passive doit devenir une action visible"
    );
    pass(
      "LIASSE_2032",
      `${didou.documentType} | ${didou.mainAmount.value} | ${didou.mainDate.date} | actions=${didou.actions.length}`
    );
  }

  // D12 — Convocation médicale : date de convocation formulée avec
  // un verbe ("vous êtes convoqué ... le") plutôt qu'un mot-clé
  // isolé ("convocation") — doit tout de même être reconnue comme
  // meetingDate, avec une action de rappel synthétisée à partir de
  // faits déjà vérifiés (aucune fiche Knowledge ne couvre ce cas
  // précis : généralisation du pipeline, pas une règle ad hoc).
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_MEDICALE
    });
    assert.equal(didou.family, "sante");
    assert.ok(didou.mainDate?.date, "la date du rendez-vous doit être trouvée");
    assert.match(didou.mainDate.date, /15\/11\/2026/);
    assert.equal(didou.mainDate.role, "meetingDate");
    assert.ok(
      didou.actions.length >= 1,
      "une échéance vérifiée doit se traduire par une action visible pour l'utilisateur"
    );
    pass(
      "CONVOCATION_MEDICALE",
      `${didou.mainDate.date} (${didou.mainDate.role}) | actions=${didou.actions.length}`
    );
  }

  // D13 — Relevé de carrière CNAV : "assurance vieillesse" est le
  // nom légal de la branche retraite de la Sécurité sociale, pas de
  // l'assurance privée — ne doit pas être classé "assurance".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: RELEVE_CARRIERE_CNAV
    });
    assert.equal(didou.family, "retraite");
    assert.match(didou.documentType || "", /carrière|carriere/i);
    assert.notEqual(
      didou.family,
      "assurance",
      "un relevé de carrière CNAV ne doit pas être confondu avec un document d'assurance privée"
    );
    assert.ok(
      didou.whyReceived && /carrière|carriere|retraite/i.test(didou.whyReceived),
      `une explication spécifique doit être donnée, pas null ni une phrase générique (reçu ${JSON.stringify(didou.whyReceived)})`
    );
    pass("RELEVE_CARRIERE_CNAV", `${didou.family} | ${didou.documentType}`);
  }

  // D14 — Convention de stage : type de document totalement hors
  // catalogue, mais avec une échéance et une action clairement
  // extraites — la confiance ne doit pas rester à un niveau
  // ridiculement bas au point de contredire ces faits fiables.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONVENTION_STAGE
    });
    assert.ok(didou.mainDate?.date, "l'échéance doit être trouvée malgré l'absence de fiche Knowledge");
    assert.ok(didou.actions.length >= 1, "l'action doit être trouvée malgré l'absence de fiche Knowledge");
    assert.ok(
      didou.confidence > 15,
      `la confiance ne doit pas rester proche de zéro quand une échéance et une action fiables existent (reçu ${didou.confidence})`
    );
    pass(
      "CONVENTION_STAGE",
      `confidence=${didou.confidence} | mainDate=${didou.mainDate.date} | actions=${didou.actions.length}`
    );
  }

  // D15 — Avis de contravention : "forfaitaire" ne doit pas être
  // confondu avec "forfait" (ligne de détail de facture — abonnement
  // téléphonique, forfait mobile...), et le montant de base dû
  // (35 €) doit l'emporter sur le montant majoré conditionnel
  // ("si paiement tardif", 75 €) qui ne s'applique pas encore.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_CONTRAVENTION
    });
    assert.equal(didou.family, "juridique");
    assert.match(didou.documentType || "", /contravention/i);
    assert.ok(didou.mainAmount, "un montant principal doit être retenu");
    assert.match(didou.mainAmount.value, /35,00[\s  ]€/);
    assert.notEqual(
      didou.mainAmount.role,
      "invoiceLineAmount",
      "\"amende forfaitaire\" ne doit pas être confondue avec une ligne de détail de facture (\"forfait\")"
    );
    assert.doesNotMatch(
      didou.mainAmount.value,
      /75,00[\s  ]€/,
      "le montant majoré conditionnel ne doit pas l'emporter sur le montant de base actuellement dû"
    );
    pass(
      "AVIS_CONTRAVENTION",
      `${didou.documentType} | ${didou.mainAmount.value} (${didou.mainAmount.role})`
    );
  }

  // D16 — Carte grise : document administratif extrêmement courant,
  // jusqu'ici absent du catalogue et réduit à un libellé générique
  // "Certificat" sans aucune explication.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CARTE_GRISE
    });
    assert.equal(didou.family, "administratif");
    assert.match(didou.documentType || "", /immatriculation/i);
    assert.ok(
      didou.whyReceived && /véhicule|vehicule/i.test(didou.whyReceived),
      `une explication spécifique doit être donnée (reçu ${JSON.stringify(didou.whyReceived)})`
    );
    pass("CARTE_GRISE", `${didou.family} | ${didou.documentType}`);
  }

  // D17 — Avis d'échéance énergie : une phrase précédente sans
  // rapport mentionnant "pénalité" ne doit pas faire passer le
  // montant normal qui suit pour une pénalité elle-même — et
  // "montant à régler" (aussi courant que "montant à payer") doit
  // être reconnu comme montant dû.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_ECHEANCE_ENERGIE
    });
    assert.ok(didou.mainAmount, "le montant à régler doit être retenu");
    assert.match(didou.mainAmount.value, /89,50[\s  ]€/);
    assert.equal(
      didou.mainAmount.role,
      "amountDue",
      "un montant normal précédé d'une phrase mentionnant \"pénalité\" ne doit pas devenir lui-même une pénalité"
    );
    pass(
      "AVIS_ECHEANCE_ENERGIE",
      `${didou.mainAmount.value} (${didou.mainAmount.role})`
    );
  }

  // D18 — Attestation employeur : l'obligation passive au féminin
  // ("cette attestation doit être transmise") doit être reconnue au
  // même titre que sa forme masculine ("ce document doit être
  // transmis") déjà couverte.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: ATTESTATION_EMPLOYEUR_FRANCE_TRAVAIL
    });
    assert.ok(
      didou.actions.length >= 1,
      "l'obligation de transmission au féminin (\"doit être transmise\") doit être reconnue comme action"
    );
    pass("ATTESTATION_EMPLOYEUR", `actions=${didou.actions.length}`);
  }

  // D19 — Déclaration de sinistre assurance : le mot "devis" mentionné
  // en passant ("transmettre les devis de réparation") ne doit pas
  // faire gagner la fiche Knowledge "Devis" (facture) via son seul
  // signal "type" au détriment de la vraie famille "assurance".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: SINISTRE_ASSURANCE
    });
    assert.equal(didou.family, "assurance");
    assert.notEqual(
      didou.documentType,
      "Devis",
      "une mention en passant de \"devis\" ne doit pas faire classer tout le document comme un devis"
    );
    assert.ok(didou.mainAmount, "le montant d'indemnisation doit être retenu");
    assert.match(didou.mainAmount.value, /3[\s  ]200,00[\s  ]€/);
    assert.ok(didou.actions.length >= 1, "la demande de devis de réparation doit rester une action");
    pass(
      "SINISTRE_ASSURANCE",
      `${didou.family} | ${didou.documentType} | ${didou.mainAmount.value}`
    );
  }

  // D20 — Confirmation de souscription énergie : "le contrat ENTRE
  // en vigueur le..." (verbe) doit être reconnu au même titre que
  // "date d'ENTRÉE en vigueur" (nom, déjà couvert) ; "jusqu'au X"
  // doit être reconnu comme une échéance au même titre que
  // "avant le X".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONFIRMATION_SOUSCRIPTION_ENERGIE
    });
    assert.ok(didou.mainDate?.date, "une date doit être retenue");
    assert.match(didou.mainDate.date, /01\/04\/2026/);
    assert.equal(didou.mainDate.role, "startDate");
    pass(
      "CONFIRMATION_SOUSCRIPTION",
      `${didou.mainDate.date} (${didou.mainDate.role})`
    );
  }

  // D21 — Notification de droits CAF (multi-prestations) : "le
  // versement ... sera effectué le X" (futur, annonce d'un paiement
  // à venir) doit être reconnu comme paymentDate, au même titre que
  // "payé le X" (passé/constaté), déjà couvert.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: NOTIFICATION_DROITS_CAF_MULTI
    });
    const paymentDate = (didou.brain?.dates || []).find(
      (d) => d.value === "05/02/2026"
    );
    assert.ok(paymentDate, "la date de versement doit être extraite");
    assert.equal(paymentDate.role, "paymentDate");
    assert.equal(paymentDate.verified, true);
    pass("NOTIFICATION_DROITS_CAF_MULTI", `05/02/2026 (${paymentDate.role})`);
  }

  // D22 — Contrôle technique : "doit être présenté" (voix passive,
  // verbe "présenter" pas encore couvert) doit devenir une action
  // au même titre que "doit être transmis" déjà couvert.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CONTROLE_TECHNIQUE
    });
    assert.ok(didou.mainDate?.date, "la date de contre-visite doit être trouvée");
    assert.match(didou.mainDate.date, /15\/04\/2026/);
    assert.ok(
      didou.actions.length >= 1,
      "l'obligation de représenter le véhicule (\"doit être présenté\") doit devenir une action"
    );
    pass("CONTROLE_TECHNIQUE", `mainDate=${didou.mainDate.date} | actions=${didou.actions.length}`);
  }

  // D23 — Changement de RIB : ce document ANNONCE un changement de
  // RIB, il n'EST pas un RIB — l'alias très court "rib" (3 lettres)
  // ne doit pas suffire à le faire classer comme "Relevé d'identité
  // bancaire".
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: CHANGEMENT_RIB
    });
    assert.equal(didou.family, "bancaire");
    assert.notEqual(
      didou.documentType,
      "Relevé d'identité bancaire",
      "une confirmation de changement de RIB n'est pas un RIB elle-même"
    );
    pass("CHANGEMENT_RIB", `${didou.family} | ${didou.documentType}`);
  }

  // D24 — Avis de taxe d'habitation : absente du catalogue jusqu'ici
  // (seule la taxe foncière existait) ; le montant de base dû doit
  // l'emporter sur le montant majoré conditionnel, comme pour
  // l'avis de contravention plus tôt dans la session.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: AVIS_TAXE_HABITATION
    });
    assert.equal(didou.family, "fiscal");
    assert.match(didou.documentType || "", /taxe d'habitation|taxe d habitation/i);
    assert.ok(didou.mainAmount, "un montant principal doit être retenu");
    assert.match(didou.mainAmount.value, /1[\s  ]240,00[\s  ]€/);
    assert.doesNotMatch(
      didou.mainAmount.value,
      /1[\s  ]364,00[\s  ]€/,
      "le montant majoré conditionnel ne doit pas l'emporter sur le montant de base dû"
    );
    pass("AVIS_TAXE_HABITATION", `${didou.documentType} | ${didou.mainAmount.value}`);
  }

  // D25 — Notification de radiation France Travail : un seul mot
  // ("convocation", en référence à une convocation PASSÉE et
  // manquée) ne doit pas router vers l'adaptateur spécialisé AG
  // copropriété ni faire perdre la vraie identification (une
  // notification de radiation, pas une convocation à venir).
  // Régression réelle : avec confiance 30/100, family="copropriete"
  // routait vers adaptCondoMeeting qui affichait "Convocation à une
  // assemblée générale de copropriété" avec une action absurde.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: RADIATION_FRANCE_TRAVAIL
    });
    assert.notEqual(
      didou.documentType,
      "Convocation à une assemblée générale de copropriété",
      "un mot \"convocation\" isolé ne doit pas faire passer ce document pour une AG de copropriété"
    );
    assert.equal(didou.family, "social");
    assert.match(didou.documentType || "", /radiation/i);
    pass("RADIATION_FRANCE_TRAVAIL", `${didou.family} | ${didou.documentType}`);
  }

  // D26 — Relance de facture impayée : une phrase sans rapport plus
  // loin dans le document ("sans régularisation sous 8 jours")
  // ne doit pas faire passer le montant impayé pour une simple
  // ligne de détail de facture (abonnement, etc.) ; "demeure
  // impayée" doit être reconnu comme montant dû.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: RELANCE_FACTURE_IMPAYEE
    });
    assert.equal(didou.family, "facture");
    assert.ok(didou.mainAmount, "le montant impayé doit être retenu");
    assert.match(didou.mainAmount.value, /45,90[\s  ]€/);
    assert.equal(
      didou.mainAmount.role,
      "amountDue",
      "un montant explicitement impayé ne doit pas rester classé comme simple ligne de détail de facture"
    );
    pass("RELANCE_FACTURE_IMPAYEE", `${didou.documentType} | ${didou.mainAmount.value}`);
  }

  // D27 — Convocation à une visite médicale du travail : régression
  // critique du même type que RADIATION_FRANCE_TRAVAIL, mais côté
  // catalogue cette fois. La fiche "Convocation à une assemblée
  // générale de copropriété" contenait la phrase générique "vous
  // êtes convoqué" (sans "assemblée" dans la phrase elle-même) —
  // identique à trois autres fiches de convocation (médicale,
  // France Travail, judiciaire). N'importe quelle convocation
  // pouvait ainsi gagner des points AG copropriété rien qu'en
  // employant cette formule pourtant on ne peut plus généraliste.
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: VISITE_MEDECINE_TRAVAIL
    });
    assert.notEqual(
      didou.documentType,
      "Convocation à une assemblée générale de copropriété",
      "\"vous êtes convoqué\" seul ne doit pas faire gagner la fiche AG copropriété"
    );
    assert.equal(didou.family, "sante");
    assert.match(didou.documentType || "", /médicale|medicale/i);
    assert.match(didou.mainDate?.date || "", /22\/04\/2026/);
    pass("VISITE_MEDECINE_TRAVAIL", `${didou.family} | ${didou.documentType}`);
  }

  // D28 — Clarté de la réponse finale : plusieurs corrections de
  // présentation regroupées, trouvées en auditant le texte affiché
  // à l'utilisateur pour chaque type de document déjà couvert.
  {
    // (a) Une obligation passive sans sujet ("doit être transmis...")
    // doit devenir une phrase complète avec sujet et accord correct
    // à l'affichage, pas un fragment tronqué à la voix passive.
    const controle = analyzeDocumentWithDidou({
      pastedText: CONTROLE_TECHNIQUE
    }).didou;
    assert.match(
      controle.actions[0]?.action || "",
      /^Ce document doit être présenté/,
      "l'action doit être une phrase complète avec sujet, pas un fragment"
    );

    const energie = analyzeDocumentWithDidou({
      pastedText: AVIS_ECHEANCE_ENERGIE
    }).didou;
    assert.match(
      energie.actions[0]?.action || "",
      /^Ce document doit être réglé avant/,
      "l'accord du participe doit rester correct (masculin avec \"Ce document\"), pas \"réglée\""
    );

    // (b) Une action déjà complète ("Nous vous mettons en demeure
    // de...") ne doit pas être re-préfixée par "Ce document vous
    // demande de..." — régression réelle trouvée en auditant :
    // "Ce document vous demande de nous vous mettons en demeure de
    // régler..." était grammaticalement absurde.
    const mise = analyzeDocumentWithDidou({
      pastedText: MISE_EN_DEMEURE
    }).didou;
    assert.doesNotMatch(
      mise.userSummary?.one_sentence || "",
      /vous demande de nous vous mettons/i,
      "une phrase déjà complète ne doit pas être re-préfixée"
    );
    assert.match(
      mise.userSummary?.one_sentence || "",
      /^Nous vous mettons en demeure/,
      "la phrase déjà complète doit être utilisée telle quelle"
    );

    // (c) Élision : "sert de attestation" est une faute, doit être
    // "sert d'attestation".
    const carteGrise = analyzeDocumentWithDidou({
      pastedText: CARTE_GRISE
    }).didou;
    assert.doesNotMatch(
      carteGrise.userSummary?.one_sentence || "",
      /sert de [aeiouyh]/i,
      "\"sert de\" doit s'élider en \"sert d'\" devant une voyelle"
    );

    // (d) Un rendez-vous médical n'est pas une "réunion" — et
    // l'accord du participe doit suivre le genre du nom choisi
    // ("Un rendez-vous... prévu", pas "prévue").
    const convocMed = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_MEDICALE
    }).didou;
    assert.match(
      convocMed.userSummary?.one_sentence || "",
      /^Un rendez-vous médical est prévu\b/,
      "un rendez-vous médical doit être nommé comme tel, avec l'accord masculin correct"
    );

    // (e) Même bug \b-après-accent, trouvé lors de l'audit : dans
    // cleanMeetingPlace, l'alternative "vote exprimé" ne pouvait
    // jamais déclencher la troncature du lieu, qui restait pollué
    // par la suite du texte du document.
    const agVoteExprime = analyzeDocumentWithDidou({
      pastedText: CONVOCATION_AG_VOTE_EXPRIME
    }).didou;
    assert.doesNotMatch(
      agVoteExprime.userSummary?.one_sentence || "",
      /vote exprim/i,
      "le lieu de réunion ne doit pas inclure le texte de filtrage \"vote exprimé\""
    );

    pass("RESPONSE_CLARITY", "actions et phrases complètes, accordées, sans faute");
  }

  // E — Texte vide → partiel, pas d’invention
  {
    const didou = runDidouPipeline({ text: "" });
    assert.equal(didou.understandingLevel, "extraction");
    assert.equal(didou.mainAmount, null);
    assert.ok(didou.warnings.length || didou.uncertainties.length);
    pass("EMPTY", didou.understandingLevel);
  }

  // F — Frontière Didoutor
  {
    const { didou } = analyzeDocumentWithDidou({
      pastedText: QUITTANCE_LOYER
    });
    const ctx = buildDidoutorContext(didou);
    assert.equal(ctx.didouHints.sourceEngine, "didou");
    assert.ok(ctx.didouHints.userSummary);
    assert.ok(!("extraction" in ctx));
    assert.ok(!("extraction" in ctx.didouHints));
    pass("DIDOUTOR_CONTEXT", "frontière propre sans extraction brute");
  }

  // G — Contexte de phrase préservé pour les actions (non-régression)
  //
  // Régression réelle observée : le regex d'extraction capture la
  // phrase à partir du verbe et perd le sujet/modal qui précède
  // ("Vous pouvez", "Vous êtes invité à"...). Sans ce contexte,
  // Semantic Relevance ne peut pas déterminer la cible réelle et
  // rejette l'action -> actions = [] alors qu'une vraie action
  // existe. Testé ici indépendamment de tout document précis
  // (copropriété ou non) pour rester générique.
  {
    const genericAdminLetter = `
Vous êtes invité à signer le formulaire ci-joint avant le 10/05/2026.
`.trim();

    const phrases = extractActionPhrases(genericAdminLetter);
    const signAction = phrases.find((item) => /^signer/i.test(item.phrase));

    assert.ok(signAction, "le verbe d'action doit être détecté");
    assert.ok(
      signAction.sentence && signAction.sentence !== signAction.phrase,
      "la phrase englobante doit être distincte du fragment capturé"
    );
    assert.match(
      signAction.sentence,
      /vous êtes invité/i,
      "le sujet/modal qui précède le verbe doit rester dans le contexte"
    );

    const agPhrases = extractActionPhrases(CONVOCATION_AG);
    const participateAction = agPhrases.find((item) =>
      /^participer/i.test(item.phrase)
    );

    assert.ok(participateAction);
    assert.match(
      participateAction.sentence,
      /vous pouvez/i,
      "le contexte AG doit lui aussi conserver le sujet précédent"
    );

    pass(
      "ACTION_SENTENCE_CONTEXT",
      `"${signAction.phrase}" ⊂ "${signAction.sentence}"`
    );
  }

  // G2 — Même bug \b/accent que plus haut, mais en tête de motif
  // cette fois (trouvé lors de l'audit demandé après la
  // clarification de la réponse) : `\b(?:à retourner|a retourner|...)`
  // ne peut jamais matcher "à retourner"/"à payer" (la forme
  // réellement écrite en français) car "à" n'est pas un caractère
  // de mot pour `\b` — seule la variante sans accent, quasi absente
  // d'un vrai document, passait.
  {
    const accentedOnly = extractActionPhrases(
      "Montant à payer : 45,90 €. Merci de votre confiance."
    );

    assert.ok(
      accentedOnly.some((item) => /^à payer/i.test(item.phrase)),
      "\"à payer\" (accentué) doit être détecté comme action, pas seulement \"a payer\""
    );

    const accentedReturn = extractActionPhrases(
      "Coupon à retourner sans délai."
    );

    assert.ok(
      accentedReturn.some((item) => /^à retourner/i.test(item.phrase)),
      "\"à retourner\" (accentué) doit être détecté comme action"
    );

    pass(
      "ACTION_LEADING_BOUNDARY_ACCENT",
      "\"à payer\"/\"à retourner\" accentués détectés"
    );
  }

  // H — Contexte de dates rapprochées non contaminé (non-régression)
  //
  // Régression réelle : dans "Contrat émis le 10/06/2026. Vous
  // devez régler avant le 20/07/2026.", la date d'émission
  // récupérait le rôle "deadline" à cause de la phrase suivante,
  // présente dans son rayon de contexte de 120 caractères.
  {
    const text = [
      "AVIS D'ECHEANCE ASSURANCE HABITATION",
      "",
      "Contrat emis le 10/06/2026.",
      "Vous devez regler votre cotisation avant le 20/07/2026, sous peine de resiliation."
    ].join("\n");

    const { dates } = extractDatesAndPeriods(text);
    const issueDate = dates.find((d) => d.raw === "10/06/2026");
    const deadlineDate = dates.find((d) => d.raw === "20/07/2026");

    assert.ok(issueDate);
    assert.ok(deadlineDate);
    assert.equal(
      issueDate.hint,
      "issueDate",
      `la date d'émission ne doit pas hériter du rôle de la phrase suivante : reçu "${issueDate.hint}"`
    );
    assert.equal(deadlineDate.hint, "deadline");

    pass(
      "DATE_CONTEXT_NOT_CONTAMINATED",
      `10/06=${issueDate.hint} | 20/07=${deadlineDate.hint}`
    );
  }

  assert.equal(fetchCalls, 0);
  pass("NO_NETWORK", `fetch=${fetchCalls}`);
} catch (error) {
  fail("UNEXPECTED", error?.stack || error?.message || String(error));
} finally {
  globalThis.fetch = originalFetch;
}

if (process.exitCode) {
  console.error("Didou engine tests FAILED");
  process.exit(1);
}

console.log("Didou engine tests PASSED");
