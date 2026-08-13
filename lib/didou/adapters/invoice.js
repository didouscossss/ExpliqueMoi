/**
 * E — Adaptateur facture V3.1
 *
 * Principes :
 * - aucune règle spécifique à une entreprise
 * - sélection des montants par score sémantique
 * - exclusion des montants légaux / techniques
 * - distinction :
 *   - à payer
 *   - prélèvement automatique
 *   - déjà payé
 *   - remboursement attendu
 *   - remboursement effectué
 *   - situation incertaine
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  const text = String(ctx.text || "");
  const lowerText = normalizeForSearch(text);

  const amounts = Array.isArray(extraction?.amounts)
    ? extraction.amounts
    : [];

  const dates = Array.isArray(extraction?.dates)
    ? extraction.dates
    : [];

  const organizations =
    extraction?.entities?.organizations || [];

  const issuer = pickIssuer(
    organizations,
    text
  );

  /*
   * =====================================================
   * 1 — STATUT GLOBAL DU PAIEMENT
   * =====================================================
   */

  const paymentStatus =
    detectGlobalPaymentStatus(lowerText);

  /*
   * =====================================================
   * 2 — CHOIX DU MONTANT PAR SCORE
   * =====================================================
   */

  const scoredAmount =
    pickBestAmount(
      amounts,
      paymentStatus,
      lowerText
    );

  let amount =
    scoredAmount?.amount || null;

  let effectiveStatus =
    paymentStatus;

  /*
   * Si aucun statut explicite n'est trouvé,
   * on peut encore reconnaître une facture
   * classique à payer si le score est suffisamment fort.
   */
  if (
    effectiveStatus === "unknown" &&
    amount &&
    scoredAmount.score >= 65
  ) {
    effectiveStatus = "to_pay";
  }

  /*
   * Si le meilleur candidat est trop faible,
   * on préfère ne rien affirmer.
   */
  if (
    scoredAmount &&
    scoredAmount.score < 45
  ) {
    amount = null;
  }

  /*
   * =====================================================
   * 3 — DATE ASSOCIÉE
   * =====================================================
   */

  const relevantDate =
    pickRelevantDate(
      dates,
      effectiveStatus
    );

  /*
   * =====================================================
   * 4 — CONSTRUCTION DU RÉSULTAT
   * =====================================================
   */

  const actions = [];
  const importantFacts = [];
  const deadlines = [];
  const evidence = [];
  const warnings = [];
  const uncertainties = [];

  let mainAmount = null;
  let mainDate = null;

  let whyReceived =
    "Ce document présente votre situation de facturation.";

  let documentPurpose =
    "Présenter une facture et les informations liées à son règlement.";

  let attentionLevel = "uncertain";

  /*
   * =====================================================
   * À PAYER MANUELLEMENT
   * =====================================================
   */

  if (
    effectiveStatus === "to_pay" &&
    amount
  ) {
    mainAmount = {
      value: amount.value,
      label: "Montant à payer",
      meaning:
        amount.context ||
        "Montant restant à régler",
      role: "amountDue"
    };

    importantFacts.push({
      kind: "amount",
      label: "Montant à payer",
      value: amount.value,
      confidence:
        scoreToConfidence(
          scoredAmount?.score
        )
    });

    actions.push({
      action:
        `Régler ${amount.value}`,
      how:
        "Selon le moyen de paiement indiqué sur la facture",
      confidence: 85
    });

    whyReceived =
      `Cette facture indique un montant de ${amount.value} à régler.`;

    documentPurpose =
      "Demander le règlement d’une facture.";

    attentionLevel =
      relevantDate
        ? "urgent"
        : "soon";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Échéance de paiement",
        meaning:
          relevantDate.context ||
          "Date limite pour régler la facture",
        role: "deadline"
      };

      deadlines.push({
        date: relevantDate.raw,
        label: "Date limite de paiement",
        meaning:
          relevantDate.context ||
          "Date limite pour régler la facture",
        confidence:
          relevantDate.confidence || 75
      });

      importantFacts.push({
        kind: "date",
        label: "Échéance",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT AUTOMATIQUE
   * =====================================================
   */

  else if (
    effectiveStatus === "automatic_debit"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant prélevé",
        meaning:
          amount.context ||
          "Montant prévu pour le prélèvement automatique",
        role: "automaticDebitAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Prélèvement automatique",
        value: amount.value,
        confidence:
          scoreToConfidence(
            scoredAmount?.score
          )
      });

      whyReceived =
        `Cette facture indique un prélèvement de ${amount.value}.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un prélèvement automatique est prévu.";
    }

    documentPurpose =
      "Vous informer d’un règlement effectué automatiquement.";

    attentionLevel = "none";

    /*
     * Important :
     * ce n'est PAS une action de paiement.
     */
    actions.push({
      action:
        "Vérifier que le compte sera suffisamment approvisionné",
      how:
        "Le règlement doit être effectué automatiquement par prélèvement.",
      confidence: 90
    });

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du prélèvement",
        meaning:
          relevantDate.context ||
          "Date prévue du prélèvement",
        role: "debitDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du prélèvement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 80
      });
    }
  }

  /*
   * =====================================================
   * DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */

  else if (
    effectiveStatus === "already_paid"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant déjà payé",
        meaning:
          amount.context ||
          "Paiement déjà effectué",
        role: "paidAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Déjà payé",
        value: amount.value,
        confidence:
          scoreToConfidence(
            scoredAmount?.score
          )
      });

      whyReceived =
        `Cette facture indique que ${amount.value} a déjà été réglé ou prélevé.`;
    } else {
      whyReceived =
        "Cette facture indique que le paiement a déjà été effectué.";
    }

    documentPurpose =
      "Confirmer ou récapituler un paiement déjà effectué.";

    attentionLevel = "none";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du paiement",
        meaning:
          relevantDate.context ||
          "Date du paiement",
        role: "paymentDate"
      };
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT À VENIR
   * =====================================================
   */

  else if (
    effectiveStatus === "refund_expected"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Remboursement attendu",
        meaning:
          amount.context ||
          "Montant qui doit vous être remboursé",
        role: "refundAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Remboursement attendu",
        value: amount.value,
        confidence:
          scoreToConfidence(
            scoredAmount?.score
          )
      });

      whyReceived =
        `Cette facture indique qu’un remboursement de ${amount.value} est prévu en votre faveur.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un remboursement est prévu en votre faveur.";
    }

    documentPurpose =
      "Vous informer d’un remboursement ou d’un avoir.";

    attentionLevel = "none";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date prévue du remboursement",
        meaning:
          relevantDate.context ||
          "Date annoncée pour le remboursement",
        role: "refundDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du remboursement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 80
      });
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT DÉJÀ EFFECTUÉ
   * =====================================================
   */

  else if (
    effectiveStatus === "refunded"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant remboursé",
        meaning:
          amount.context ||
          "Remboursement déjà effectué",
        role: "refundedAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Montant remboursé",
        value: amount.value,
        confidence:
          scoreToConfidence(
            scoredAmount?.score
          )
      });

      whyReceived =
        `Cette facture indique que ${amount.value} vous a déjà été remboursé.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un remboursement a déjà été effectué.";
    }

    documentPurpose =
      "Confirmer un remboursement déjà effectué.";

    attentionLevel = "none";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du remboursement",
        meaning:
          relevantDate.context ||
          "Date du remboursement",
        role: "refundDate"
      };
    }
  }

  /*
   * =====================================================
   * SITUATION INCERTAINE
   * =====================================================
   */

  else {
    /*
     * On peut afficher un candidat uniquement
     * s'il n'est ni légal ni technique.
     */
    const neutral =
      scoredAmount &&
      scoredAmount.score >= 45
        ? scoredAmount.amount
        : null;

    if (neutral) {
      mainAmount = {
        value: neutral.value,
        label: "Montant détecté",
        meaning:
          "Le rôle exact de ce montant doit encore être vérifié.",
        role: "unknownAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Montant à vérifier",
        value: neutral.value,
        confidence: Math.min(
          scoreToConfidence(
            scoredAmount.score
          ),
          65
        )
      });
    }

    whyReceived =
      "Ce document semble être une facture, mais Didou n’a pas identifié avec suffisamment de certitude la situation de paiement.";

    documentPurpose =
      "Présenter votre situation de facturation.";

    attentionLevel =
      "uncertain";

    uncertainties.push(
      "Le statut exact du paiement doit être vérifié."
    );
  }

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  if (issuer) {
    importantFacts.push({
      kind: "issuer",
      label: "Émetteur",
      value: issuer,
      confidence: 70
    });
  }

  /*
   * =====================================================
   * PREUVES
   * =====================================================
   */

  if (amount) {
    evidence.push({
      page: "Page 1",
      quote:
        amount.context ||
        amount.value,
      explanation:
        getAmountExplanation(
          effectiveStatus
        )
    });
  }

  if (relevantDate) {
    evidence.push({
      page: "Page 1",
      quote:
        relevantDate.context ||
        relevantDate.raw,
      explanation:
        getDateExplanation(
          effectiveStatus
        )
    });
  }

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    family: "facture",

    documentType:
      detection?.documentType ||
      "Facture",

    understandingLevel:
      effectiveStatus === "unknown"
        ? detection?.understandingLevel ||
          "probable"
        : "strong",

    confidence:
      effectiveStatus === "unknown"
        ? Math.max(
            detection?.confidence || 0,
            60
          )
        : Math.max(
            detection?.confidence || 0,
            85
          ),

    issuer,
    recipient: null,

    mainDate,
    mainAmount,

    importantFacts,
    actions,
    deadlines,

    whyReceived,
    documentPurpose,
    attentionLevel,

    evidence,
    warnings,
    uncertainties
  };
}

/**
 * =====================================================
 * DÉTECTION DU STATUT
 * =====================================================
 */

function detectGlobalPaymentStatus(text) {
  const source =
    normalizeForSearch(text);

  /*
   * Remboursement effectué.
   */
  if (
    /vous avez ete rembourse|remboursement effectue|rembourse le|a ete rembourse/.test(
      source
    )
  ) {
    return "refunded";
  }

  /*
   * Remboursement futur / avoir.
   */
  if (
    /nous vous rembourserons|vous serez rembourse|remboursement prevu|a vous rembourser|avoir en votre faveur|credit en votre faveur|solde crediteur/.test(
      source
    )
  ) {
    return "refund_expected";
  }

  /*
   * Paiement déjà effectué.
   */
  if (
    /facture acquittee|deja paye|deja regle|paiement recu|paiement effectue|a ete preleve|deja preleve|regle le/.test(
      source
    )
  ) {
    return "already_paid";
  }

  /*
   * Prélèvement automatique.
   *
   * Formulations génériques rencontrées
   * chez les opérateurs, énergie, assurance,
   * abonnements, etc.
   */
  if (
    /sera preleve|prelevement automatique|preleve automatiquement|nous preleverons|sera debite|prelevement prevu|debit automatique|paiement par prelevement|montant preleve sur le compte|montant preleve sur votre compte|total du montant preleve|montant du prelevement/.test(
      source
    )
  ) {
    return "automatic_debit";
  }

  /*
   * Paiement manuel.
   */
  if (
    /montant a payer|net a payer|reste a payer|montant du|total a regler|somme a regler|merci de regler|a regler avant|payable avant|a acquitter/.test(
      source
    )
  ) {
    return "to_pay";
  }

  return "unknown";
}

/**
 * =====================================================
 * SÉLECTION PAR SCORE
 * =====================================================
 */

function pickBestAmount(
  amounts,
  status,
  fullText
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  if (!list.length) {
    return null;
  }

  const candidates =
    list
      .filter(
        (amount) =>
          !isAbsoluteForbiddenAmount(
            amount
          )
      )
      .map((amount) => ({
        amount,
        score:
          scoreAmount(
            amount,
            status,
            fullText
          )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return candidates[0] || null;
}

/**
 * Score général d'un montant.
 */
function scoreAmount(
  amount,
  status,
  fullText
) {
  const context =
    normalizeForSearch(
      amount?.context || ""
    );

  const role =
    String(
      amount?.role || ""
    );

  const numeric =
    Number(amount?.numeric);

  let score = 0;

  /*
   * =====================================================
   * RÔLE DONNÉ PAR roles.js
   * =====================================================
   */

  if (
    role === "amountDue"
  ) {
    score += 75;
  }

  if (
    role === "automaticDebitAmount"
  ) {
    score +=
      status === "automatic_debit"
        ? 90
        : 35;
  }

  if (
    role === "refundAmount"
  ) {
    score +=
      status === "refund_expected"
        ? 90
        : 20;
  }

  if (
    role === "refundedAmount"
  ) {
    score +=
      status === "refunded"
        ? 90
        : 20;
  }

  if (
    role === "paidAmount"
  ) {
    score +=
      status === "already_paid"
        ? 90
        : 20;
  }

  /*
   * =====================================================
   * SIGNAUX POSITIFS GÉNÉRAUX
   * =====================================================
   */

  if (
    /montant a payer|net a payer|reste a payer|total a regler|somme a regler/.test(
      context
    )
  ) {
    score += 90;
  }

  if (
    /total du montant|montant de la facture|total facture|votre facture|facture internet|facture mobile/.test(
      context
    )
  ) {
    score += 45;
  }

  if (
    /total ttc|total toutes taxes comprises/.test(
      context
    )
  ) {
    score += 40;
  }

  if (
    /total aupres|total du|total general/.test(
      context
    )
  ) {
    score += 25;
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT
   * =====================================================
   */

  if (
    status === "automatic_debit"
  ) {
    if (
      /montant preleve|total du montant preleve|prelevement|sera preleve|sera debite/.test(
        context
      )
    ) {
      score += 90;
    }

    /*
     * Le montant peut être plus loin que la phrase
     * dans le texte OCR.
     */
    score += scoreAmountAfterTrigger(
      amount,
      fullText,
      [
        "total du montant preleve",
        "montant preleve",
        "montant du prelevement",
        "sera preleve",
        "sera debite",
        "prelevement automatique"
      ]
    );
  }

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */

  if (
    status === "refund_expected"
  ) {
    score += scoreAmountAfterTrigger(
      amount,
      fullText,
      [
        "nous vous rembourserons",
        "vous serez rembourse",
        "remboursement prevu",
        "a vous rembourser",
        "avoir en votre faveur"
      ]
    );

    /*
     * Si le mot remboursement se trouve APRES
     * le montant, ce montant est probablement
     * une mensualité ou un total intermédiaire.
     */
    if (
      triggerAppearsAfterAmount(
        amount,
        context,
        /nous vous rembourserons|vous serez rembourse|remboursement/
      )
    ) {
      score -= 65;
    }
  }

  /*
   * =====================================================
   * DÉJÀ PAYÉ
   * =====================================================
   */

  if (
    status === "already_paid" &&
    /paye|regle|preleve|acquitte|paiement recu/.test(
      context
    )
  ) {
    score += 70;
  }

  /*
   * =====================================================
   * RÉCURRENCE
   * =====================================================
   *
   * Un montant principal apparaît souvent
   * plusieurs fois sur une facture.
   */

  const occurrences =
    countAmountOccurrences(
      fullText,
      amount
    );

  if (occurrences >= 2) {
    score += 12;
  }

  if (occurrences >= 3) {
    score += 10;
  }

  if (occurrences >= 5) {
    score += 8;
  }

  /*
   * =====================================================
   * PÉNALITÉS
   * =====================================================
   */

  if (
    role === "vat"
  ) {
    score -= 75;
  }

  if (
    role === "ht"
  ) {
    score -= 70;
  }

  if (
    role === "invoiceLineAmount"
  ) {
    score -= 20;
  }

  if (
    role === "installmentAmount"
  ) {
    score -= 45;
  }

  if (
    role === "ttcAmount"
  ) {
    score -= 10;
  }

  /*
   * Lignes techniques.
   */
  if (
    /prix unitaire|quantite|kwh|go|minute|sms|mms|abonnement|forfait|option|consommation|service public|contribution|taxe/.test(
      context
    )
  ) {
    score -= 25;
  }

  /*
   * TVA / HT uniquement.
   */
  if (
    /\btva\b/.test(context) &&
    !/total ttc|montant a payer|net a payer/.test(
      context
    )
  ) {
    score -= 25;
  }

  if (
    /\bht\b|\bhtva\b/.test(
      context
    ) &&
    !/total ttc|montant a payer|net a payer/.test(
      context
    )
  ) {
    score -= 25;
  }

  /*
   * Mensualités facturées :
   * information intermédiaire fréquente.
   */
  if (
    /mensualites facturees|mensualite facturee/.test(
      context
    )
  ) {
    score -= 50;
  }

  /*
   * Montants gigantesques :
   * souvent capital social ou mentions légales.
   * Ce n'est qu'une protection supplémentaire.
   */
  if (
    Number.isFinite(numeric) &&
    numeric >= 1000000
  ) {
    score -= 100;
  }

  return score;
}

/**
 * Montants totalement interdits comme mainAmount.
 */
function isAbsoluteForbiddenAmount(
  amount
) {
  const role =
    String(amount?.role || "");

  return [
    "companyLegalAmount",
    "legalInformationAmount",
    "example",
    "table_value"
  ].includes(role);
}

/**
 * =====================================================
 * PROXIMITÉ TEXTE COMPLET
 * =====================================================
 */

function scoreAmountAfterTrigger(
  amount,
  fullText,
  triggers
) {
  const source =
    normalizeForSearch(fullText);

  const amountVariants =
    buildAmountVariants(amount);

  if (
    !source ||
    !amountVariants.length
  ) {
    return 0;
  }

  let best = 0;

  for (const trigger of triggers) {
    let triggerPos =
      source.indexOf(trigger);

    while (
      triggerPos >= 0
    ) {
      for (
        const variant
        of amountVariants
      ) {
        let amountPos =
          source.indexOf(
            variant,
            triggerPos
          );

        if (
          amountPos < 0
        ) {
          continue;
        }

        const distance =
          amountPos -
          (
            triggerPos +
            trigger.length
          );

        /*
         * Le montant doit apparaître après
         * le signal.
         */
        if (
          distance < 0
        ) {
          continue;
        }

        if (distance <= 30) {
          best = Math.max(
            best,
            110
          );
        } else if (
          distance <= 80
        ) {
          best = Math.max(
            best,
            90
          );
        } else if (
          distance <= 160
        ) {
          best = Math.max(
            best,
            65
          );
        } else if (
          distance <= 300
        ) {
          best = Math.max(
            best,
            35
          );
        }
      }

      triggerPos =
        source.indexOf(
          trigger,
          triggerPos + 1
        );
    }
  }

  return best;
}

/**
 * Vérifie si un déclencheur apparaît
 * APRÈS le montant dans son contexte local.
 */
function triggerAppearsAfterAmount(
  amount,
  context,
  triggerRegex
) {
  const source =
    normalizeForSearch(context);

  const trigger =
    source.match(
      triggerRegex
    );

  if (!trigger) {
    return false;
  }

  const amountIndex =
    findAmountIndexInText(
      source,
      amount
    );

  return (
    amountIndex >= 0 &&
    trigger.index >
      amountIndex
  );
}

/**
 * =====================================================
 * DATE
 * =====================================================
 */

function pickRelevantDate(
  dates,
  status
) {
  const list =
    Array.isArray(dates)
      ? dates
      : [];

  if (!list.length) {
    return null;
  }

  if (
    status === "refund_expected" ||
    status === "refunded"
  ) {
    return (
      list.find(
        (date) =>
          date.role ===
          "refundDate"
      ) ||

      list.find((date) =>
        /rembours/.test(
          normalizeForSearch(
            date.context ||
            date.hint ||
            ""
          )
        )
      ) ||

      null
    );
  }

  if (
    status === "already_paid"
  ) {
    return (
      list.find(
        (date) =>
          date.role ===
          "paymentDate"
      ) ||
      null
    );
  }

  if (
    status === "automatic_debit"
  ) {
    return (
      list.find(
        (date) =>
          date.role ===
          "debitDate"
      ) ||

      list.find((date) =>
        /prelev|debite/.test(
          normalizeForSearch(
            date.context ||
            date.hint ||
            ""
          )
        )
      ) ||

      null
    );
  }

  if (
    status === "to_pay"
  ) {
    return (
      list.find(
        (date) =>
          date.role ===
            "deadline" &&
          date.important
      ) ||

      list.find(
        (date) =>
          date.role ===
          "deadline"
      ) ||

      null
    );
  }

  return null;
}

/**
 * =====================================================
 * ÉMETTEUR
 * =====================================================
 */

function pickIssuer(
  organizations,
  text
) {
  const list =
    (organizations || [])
      .map((value) =>
        String(
          value || ""
        ).trim()
      )
      .filter(Boolean);

  const plausible =
    list.filter((value) => {
      if (
        value.length < 4
      ) {
        return false;
      }

      if (
        /^(sa|sas|sarl|eurl|sci|sasu)$/i.test(
          value
        )
      ) {
        return false;
      }

      return true;
    });

  if (
    plausible.length
  ) {
    return plausible[0];
  }

  /*
   * Fallback :
   * nom en majuscules dans l'en-tête.
   */
  const header =
    String(text || "")
      .split(/\n/)
      .slice(0, 15)
      .join(" ");

  const acronym =
    header.match(
      /\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{4,20}\b/
    );

  return acronym
    ? acronym[0]
    : null;
}

/**
 * =====================================================
 * OUTILS MONTANTS
 * =====================================================
 */

function buildAmountVariants(
  amount
) {
  const variants =
    new Set();

  const numeric =
    Number(amount?.numeric);

  if (
    Number.isFinite(numeric)
  ) {
    const fr =
      numeric
        .toFixed(2)
        .replace(
          ".",
          ","
        );

    const dot =
      numeric
        .toFixed(2);

    variants.add(
      normalizeForSearch(
        fr
      )
    );

    variants.add(
      normalizeForSearch(
        dot
      )
    );

    /*
     * Sans espaces milliers.
     */
    variants.add(
      normalizeForSearch(
        fr.replace(
          /\s/g,
          ""
        )
      )
    );
  }

  const value =
    String(
      amount?.value || ""
    )
      .replace(
        /€/g,
        ""
      )
      .trim();

  if (value) {
    variants.add(
      normalizeForSearch(
        value
      )
    );
  }

  return [
    ...variants
  ].filter(Boolean);
}

function findAmountIndexInText(
  text,
  amount
) {
  const source =
    normalizeForSearch(text);

  const variants =
    buildAmountVariants(
      amount
    );

  for (
    const variant
    of variants
  ) {
    const index =
      source.indexOf(
        variant
      );

    if (
      index >= 0
    ) {
      return index;
    }
  }

  return -1;
}

function countAmountOccurrences(
  text,
  amount
) {
  const source =
    normalizeForSearch(text);

  const variants =
    buildAmountVariants(
      amount
    );

  let best = 0;

  for (
    const variant
    of variants
  ) {
    if (!variant) {
      continue;
    }

    let count = 0;
    let index = 0;

    while (
      (
        index =
          source.indexOf(
            variant,
            index
          )
      ) >= 0
    ) {
      count += 1;

      index +=
        Math.max(
          variant.length,
          1
        );
    }

    best =
      Math.max(
        best,
        count
      );
  }

  return best;
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function normalizeForSearch(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

/**
 * =====================================================
 * CONFIDENCE
 * =====================================================
 */

function scoreToConfidence(
  score
) {
  const number =
    Number(score);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 70;
  }

  if (number >= 140) {
    return 96;
  }

  if (number >= 100) {
    return 92;
  }

  if (number >= 75) {
    return 87;
  }

  if (number >= 55) {
    return 78;
  }

  return 65;
}

/**
 * =====================================================
 * PREUVES
 * =====================================================
 */

function getAmountExplanation(
  status
) {
  if (
    status === "refunded"
  ) {
    return "Montant déjà remboursé";
  }

  if (
    status ===
    "refund_expected"
  ) {
    return "Montant annoncé comme remboursement";
  }

  if (
    status ===
    "already_paid"
  ) {
    return "Montant déjà payé ou prélevé";
  }

  if (
    status ===
    "automatic_debit"
  ) {
    return "Montant associé au prélèvement";
  }

  if (
    status === "to_pay"
  ) {
    return "Montant à régler";
  }

  return "Montant détecté sur la facture";
}

function getDateExplanation(
  status
) {
  if (
    status === "refunded"
  ) {
    return "Date du remboursement effectué";
  }

  if (
    status ===
    "refund_expected"
  ) {
    return "Date annoncée pour le remboursement";
  }

  if (
    status ===
    "already_paid"
  ) {
    return "Date du paiement";
  }

  if (
    status ===
    "automatic_debit"
  ) {
    return "Date prévue du prélèvement";
  }

  if (
    status === "to_pay"
  ) {
    return "Date limite de paiement";
  }

  return "Date présente sur la facture";
}
