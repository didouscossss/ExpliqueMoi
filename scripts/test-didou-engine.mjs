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
  CONVOCATION_MEDICALE
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
