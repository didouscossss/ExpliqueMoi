/**
 * E — Adaptateur facture V4.
 *
 * Objectifs :
 * - comprendre la situation réelle de paiement ;
 * - choisir le bon montant, pas simplement le plus élevé ;
 * - distinguer :
 *   - paiement manuel ;
 *   - prélèvement automatique ;
 *   - paiement déjà effectué ;
 *   - remboursement attendu ;
 *   - remboursement déjà effectué ;
 * - associer la bonne date au bon événement ;
 * - exclure capital social / TVA / HT / lignes de détail ;
 * - ne pas inventer d'action si la preuve est insuffisante.
 */

export function adaptInvoice(ctx) {
  const extraction = ctx?.extraction || {};
  const detection = ctx?.detection || {};

  const text = String(ctx?.text || "");
  const normalizedText = normalizeForSearch(text);

  const amounts = Array.isArray(extraction.amounts)
    ? extraction.amounts
    : [];

  const dates = Array.isArray(extraction.dates)
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
   * 1 — ÉVÉNEMENTS EXPLICITES DU DOCUMENT
   * =====================================================
   */

  const events = detectPaymentEvents(
    normalizedText,
    amounts
  );

  /*
   * =====================================================
   * 2 — ÉVÉNEMENT PRINCIPAL
   * =====================================================
   */

  const mainEvent = chooseMainEvent(
    events,
    amounts,
    normalizedText
  );

  let effectiveStatus =
    mainEvent?.status || "unknown";

  let amount =
    mainEvent?.amount || null;

  /*
   * =====================================================
   * 3 — FALLBACK FACTURE CLASSIQUE
   * =====================================================
   */

  if (
    effectiveStatus === "unknown"
  ) {
    const fallback =
      pickBestInvoiceTotal(
        amounts,
        normalizedText
      );

    if (
      fallback &&
      fallback.score >= 70
    ) {
      effectiveStatus =
        "to_pay";

      amount =
        fallback.amount;
    }
  }

  /*
   * =====================================================
   * 4 — DATE ASSOCIÉE
   * =====================================================
   */

  const relevantDate =
    pickRelevantDate(
      dates,
      effectiveStatus,
      mainEvent,
      normalizedText
    );

  /*
   * =====================================================
   * 5 — SORTIE
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
    "Cette facture présente votre situation de paiement.";

  let documentPurpose =
    "Présenter le montant et le mode de règlement de cette facture.";

  let attentionLevel =
    "uncertain";

  /*
   * =====================================================
   * PAIEMENT MANUEL
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
        cleanContext(amount.context) ||
        "Montant restant à régler",
      role: "amountDue"
    };

    importantFacts.push({
      kind: "amount",
      label: "Montant à payer",
      value: amount.value,
      confidence:
        confidenceForAmount(
          mainEvent,
          amount,
          88
        )
    });

    actions.push({
      action:
        `Régler ${amount.value}`,
      how:
        relevantDate
          ? `Avant le ${relevantDate.raw}, selon le moyen de paiement indiqué.`
          : "Selon le moyen de paiement indiqué sur la facture.",
      confidence: 90
    });

    whyReceived =
      relevantDate
        ? `Cette facture demande le règlement de ${amount.value} avant le ${relevantDate.raw}.`
        : `Cette facture demande le règlement de ${amount.value}.`;

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
          cleanContext(
            relevantDate.context
          ) ||
          "Date limite de paiement",
        role: "deadline"
      };

      deadlines.push({
        date: relevantDate.raw,
        label: "Date limite de paiement",
        meaning:
          cleanContext(
            relevantDate.context
          ) ||
          "Date limite pour régler la facture",
        confidence:
          relevantDate.confidence ||
          85
      });

      importantFacts.push({
        kind: "date",
        label: "Date limite",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence ||
          85
      });
    }
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT AUTOMATIQUE
   * =====================================================
   */

  else if (
    effectiveStatus ===
      "automatic_debit"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label:
          "Montant prélevé automatiquement",
        meaning:
          cleanContext(
            amount.context
          ) ||
          "Montant prévu pour le prélèvement",
        role:
          "automaticDebitAmount"
      };

      importantFacts.push({
        kind: "amount",
        label:
          "Prélèvement automatique",
        value:
          amount.value,
        confidence:
          confidenceForAmount(
            mainEvent,
            amount,
            92
          )
      });
    }

    if (relevantDate) {
      mainDate = {
        date:
          relevantDate.raw,
        label:
          "Date du prélèvement",
        meaning:
          cleanContext(
            relevantDate.context
          ) ||
          "Date prévue du prélèvement",
        role:
          "debitDate"
      };

      importantFacts.push({
        kind: "date",
        label:
          "Date du prélèvement",
        value:
          relevantDate.raw,
        confidence:
          relevantDate.confidence ||
          88
      });
    }

    whyReceived =
      amount && relevantDate
        ? `Cette facture sera réglée automatiquement par un prélèvement de ${amount.value} le ${relevantDate.raw}.`
        : amount
          ? `Cette facture sera réglée automatiquement par un prélèvement de ${amount.value}.`
          : "Cette facture sera réglée automatiquement par prélèvement.";

    documentPurpose =
      "Vous informer d’un prélèvement automatique.";

    attentionLevel =
      "none";

    actions.push({
      action:
        "Aucun paiement manuel à effectuer",
      how:
        relevantDate
          ? `Vérifiez simplement que votre compte sera suffisamment approvisionné pour le prélèvement du ${relevantDate.raw}.`
          : "Vérifiez simplement que votre compte sera suffisamment approvisionné.",
      confidence: 95
    });
  }

  /*
   * =====================================================
   * DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */

  else if (
    effectiveStatus ===
      "already_paid"
  ) {
    if (amount) {
      mainAmount = {
        value:
          amount.value,
        label:
          "Montant déjà payé",
        meaning:
          cleanContext(
            amount.context
          ) ||
          "Paiement déjà effectué",
        role:
          "paidAmount"
      };

      importantFacts.push({
        kind:
          "amount",
        label:
          "Déjà payé",
        value:
          amount.value,
        confidence:
          confidenceForAmount(
            mainEvent,
            amount,
            92
          )
      });
    }

    if (relevantDate) {
      mainDate = {
        date:
          relevantDate.raw,
        label:
          "Date du paiement",
        meaning:
          cleanContext(
            relevantDate.context
          ) ||
          "Date du paiement",
        role:
          "paymentDate"
      };
    }

    whyReceived =
      amount
        ? `Cette facture indique que ${amount.value} a déjà été réglé.`
        : "Cette facture indique que le paiement a déjà été effectué.";

    documentPurpose =
      "Confirmer un paiement déjà effectué.";

    attentionLevel =
      "none";

    actions.push({
      action:
        "Aucun paiement supplémentaire nécessaire",
      how:
        "Conservez la facture comme justificatif.",
      confidence: 95
    });
  }

  /*
   * =====================================================
   * REMBOURSEMENT ATTENDU
   * =====================================================
   */

  else if (
    effectiveStatus ===
      "refund_expected"
  ) {
    if (amount) {
      mainAmount = {
        value:
          amount.value,
        label:
          "Remboursement attendu",
        meaning:
          cleanContext(
            amount.context
          ) ||
          "Montant qui doit vous être remboursé",
        role:
          "refundAmount"
      };

      importantFacts.push({
        kind:
          "amount",
        label:
          "Remboursement attendu",
        value:
          amount.value,
        confidence:
          confidenceForAmount(
            mainEvent,
            amount,
            96
          )
      });
    }

    if (relevantDate) {
      mainDate = {
        date:
          relevantDate.raw,
        label:
          "Date prévue du remboursement",
        meaning:
          cleanContext(
            relevantDate.context
          ) ||
          "Date annoncée pour le remboursement",
        role:
          "refundDate"
      };

      importantFacts.push({
        kind:
          "date",
        label:
          "Date du remboursement",
        value:
          relevantDate.raw,
        confidence:
          relevantDate.confidence ||
          90
      });
    }

    whyReceived =
      amount && relevantDate
        ? `Cette facture annonce un remboursement de ${amount.value} prévu le ${relevantDate.raw}.`
        : amount
          ? `Cette facture annonce un remboursement de ${amount.value}.`
          : "Cette facture annonce un remboursement en votre faveur.";

    documentPurpose =
      "Vous informer d’un remboursement ou d’un avoir.";

    attentionLevel =
      "none";

    actions.push({
      action:
        "Aucun paiement à effectuer",
      how:
        relevantDate
          ? `Vérifiez simplement la réception du remboursement autour du ${relevantDate.raw}.`
          : "Surveillez simplement la réception du remboursement.",
      confidence: 95
    });
  }

  /*
   * =====================================================
   * REMBOURSEMENT DÉJÀ EFFECTUÉ
   * =====================================================
   */

  else if (
    effectiveStatus ===
      "refunded"
  ) {
    if (amount) {
      mainAmount = {
        value:
          amount.value,
        label:
          "Montant remboursé",
        meaning:
          cleanContext(
            amount.context
          ) ||
          "Remboursement déjà effectué",
        role:
          "refundedAmount"
      };

      importantFacts.push({
        kind:
          "amount",
        label:
          "Montant remboursé",
        value:
          amount.value,
        confidence:
          confidenceForAmount(
            mainEvent,
            amount,
            95
          )
      });
    }

    whyReceived =
      amount
        ? `Cette facture indique qu’un remboursement de ${amount.value} a déjà été effectué.`
        : "Cette facture confirme qu’un remboursement a déjà été effectué.";

    documentPurpose =
      "Confirmer un remboursement déjà effectué.";

    attentionLevel =
      "none";

    actions.push({
      action:
        "Aucune action nécessaire",
      how:
        "Conservez ce document comme justificatif.",
      confidence: 95
    });
  }

  /*
   * =====================================================
   * SITUATION INCERTAINE
   * =====================================================
   */

  else {
    const candidate =
      pickSafeNeutralAmount(
        amounts,
        normalizedText
      );

    /*
     * On ne montre un montant que s'il a
     * suffisamment de sens.
     */
    if (
      candidate &&
      candidate.score >= 60
    ) {
      mainAmount = {
        value:
          candidate.amount.value,
        label:
          "Montant à vérifier",
        meaning:
          "Didou a détecté ce montant mais ne peut pas confirmer son rôle.",
        role:
          "unknownAmount"
      };

      importantFacts.push({
        kind:
          "amount",
        label:
          "Montant à vérifier",
        value:
          candidate.amount.value,
        confidence:
          Math.min(
            scoreToConfidence(
              candidate.score
            ),
            65
          )
      });
    }

    whyReceived =
      "Cette facture contient des informations utiles, mais Didou ne peut pas confirmer avec assez de certitude la situation de paiement.";

    documentPurpose =
      "Présenter votre situation de facturation.";

    attentionLevel =
      "uncertain";

    uncertainties.push(
      "Vérifiez le mode de paiement et le montant avant d’agir."
    );
  }

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  if (issuer) {
    importantFacts.push({
      kind:
        "issuer",
      label:
        "Émetteur",
      value:
        issuer,
      confidence:
        75
    });
  }

  /*
   * =====================================================
   * PREUVES
   * =====================================================
   */

  if (amount) {
    evidence.push({
      page:
        "Page 1",
      quote:
        cleanContext(
          amount.context
        ) ||
        amount.value,
      explanation:
        getAmountExplanation(
          effectiveStatus
        )
    });
  }

  if (relevantDate) {
    evidence.push({
      page:
        "Page 1",
      quote:
        cleanContext(
          relevantDate.context
        ) ||
        relevantDate.raw,
      explanation:
        getDateExplanation(
          effectiveStatus
        )
    });
  }

  /*
   * =====================================================
   * COMPRÉHENSION
   * =====================================================
   */

  const strongResult =
    Boolean(
      amount &&
      effectiveStatus !==
        "unknown"
    );

  const partialButUseful =
    Boolean(
      issuer ||
      mainAmount ||
      mainDate ||
      importantFacts.length
    );

  let understandingLevel =
    "extraction";

  if (strongResult) {
    understandingLevel =
      "strong";
  } else if (partialButUseful) {
    understandingLevel =
      "probable";
  }

  return {
    family:
      "facture",

    documentType:
      detection?.documentType ||
      "Facture",

    understandingLevel,

    confidence:
      strongResult
        ? Math.max(
            detection?.confidence ||
              0,
            88
          )
        : partialButUseful
          ? Math.max(
              detection?.confidence ||
                0,
              58
            )
          : Math.min(
              detection?.confidence ||
                35,
              45
            ),

    issuer,
    recipient:
      null,

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
 * DÉTECTION DES ÉVÉNEMENTS
 * =====================================================
 */

function detectPaymentEvents(
  text,
  amounts
) {
  const source =
    normalizeForSearch(
      text
    );

  const events = [];

  /*
   * REMBOURSEMENT FUTUR
   */

  pushEventsForTriggers(
    events,
    source,
    amounts,
    "refund_expected",
    [
      "nous vous rembourserons",
      "vous serez rembourse",
      "remboursement prevu",
      "remboursement a venir",
      "a vous rembourser",
      "avoir en votre faveur",
      "credit en votre faveur",
      "solde crediteur"
    ],
    110
  );

  /*
   * REMBOURSEMENT EFFECTUÉ
   */

  pushEventsForTriggers(
    events,
    source,
    amounts,
    "refunded",
    [
      "vous avez ete rembourse",
      "remboursement effectue",
      "a ete rembourse",
      "rembourse le"
    ],
    110
  );

  /*
   * PRÉLÈVEMENT AUTOMATIQUE
   */

  pushEventsForTriggers(
    events,
    source,
    amounts,
    "automatic_debit",
    [
      "total du montant preleve",
      "montant preleve",
      "montant du prelevement",
      "sera preleve",
      "prelevement automatique",
      "preleve automatiquement",
      "nous preleverons",
      "sera debite",
      "prelevement prevu",
      "paiement par prelevement"
    ],
    95
  );

  /*
   * DÉJÀ PAYÉ
   */

  pushEventsForTriggers(
    events,
    source,
    amounts,
    "already_paid",
    [
      "facture acquittee",
      "deja paye",
      "deja regle",
      "paiement recu",
      "paiement effectue",
      "a ete preleve",
      "deja preleve"
    ],
    100
  );

  /*
   * PAIEMENT MANUEL
   */

  pushEventsForTriggers(
    events,
    source,
    amounts,
    "to_pay",
    [
      "montant a payer",
      "net a payer",
      "reste a payer",
      "total a regler",
      "somme a regler",
      "montant du",
      "merci de regler",
      "a regler avant",
      "payable avant",
      "a acquitter"
    ],
    90
  );

  return events;
}

function pushEventsForTriggers(
  events,
  source,
  amounts,
  status,
  triggers,
  baseScore
) {
  for (
    const trigger
    of triggers
  ) {
    let triggerIndex =
      source.indexOf(
        trigger
      );

    while (
      triggerIndex >= 0
    ) {
      const amountMatch =
        findBestAmountNearTrigger(
          source,
          amounts,
          triggerIndex,
          trigger
        );

      events.push({
        status,
        trigger,
        triggerIndex,
        amount:
          amountMatch?.amount ||
          null,
        distance:
          amountMatch?.distance ??
          Infinity,
        score:
          baseScore +
          (
            amountMatch?.bonus ||
            0
          )
      });

      triggerIndex =
        source.indexOf(
          trigger,
          triggerIndex + 1
        );
    }
  }
}

/**
 * =====================================================
 * CHOIX DE L'ÉVÉNEMENT PRINCIPAL
 * =====================================================
 */

function chooseMainEvent(
  events,
  amounts,
  fullText
) {
  if (!events.length) {
    return null;
  }

  const ranked =
    events
      .map(
        (event) => ({
          ...event,
          score:
            event.score +
            eventStatusPriority(
              event.status
            ) +
            (
              event.amount
                ? scoreAmountForEvent(
                    event.amount,
                    event.status,
                    fullText,
                    amounts
                  )
                : 0
            )
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    ranked[0] ||
    null
  );
}

function eventStatusPriority(
  status
) {
  switch (status) {
    case "refund_expected":
      return 30;

    case "refunded":
      return 28;

    case "already_paid":
      return 26;

    case "automatic_debit":
      return 24;

    case "to_pay":
      return 20;

    default:
      return 0;
  }
}

/**
 * =====================================================
 * MONTANT PROCHE D'UN ÉVÉNEMENT
 * =====================================================
 */

function findBestAmountNearTrigger(
  source,
  amounts,
  triggerIndex,
  trigger
) {
  let best =
    null;

  for (
    const amount
    of amounts
  ) {
    if (
      isAbsoluteForbiddenAmount(
        amount
      )
    ) {
      continue;
    }

    const variants =
      buildAmountVariants(
        amount
      );

    for (
      const variant
      of variants
    ) {
      /*
       * Cherche après le déclencheur.
       */

      const after =
        source.indexOf(
          variant,
          triggerIndex +
            trigger.length
        );

      if (after >= 0) {
        const distance =
          after -
          (
            triggerIndex +
            trigger.length
          );

        if (
          distance <= 350
        ) {
          const bonus =
            distanceBonus(
              distance
            ) +
            roleBonus(
              amount
            );

          if (
            !best ||
            bonus >
              best.bonus
          ) {
            best = {
              amount,
              distance,
              bonus
            };
          }
        }
      }

      /*
       * Cherche aussi légèrement avant,
       * utile pour "68,99 € sera prélevé".
       */

      const before =
        source.lastIndexOf(
          variant,
          triggerIndex
        );

      if (before >= 0) {
        const distance =
          triggerIndex -
          (
            before +
            variant.length
          );

        if (
          distance <= 100
        ) {
          const bonus =
            distanceBonus(
              distance
            ) -
            10 +
            roleBonus(
              amount
            );

          if (
            !best ||
            bonus >
              best.bonus
          ) {
            best = {
              amount,
              distance,
              bonus
            };
          }
        }
      }
    }
  }

  return best;
}

function distanceBonus(
  distance
) {
  if (distance <= 20) {
    return 90;
  }

  if (distance <= 50) {
    return 75;
  }

  if (distance <= 100) {
    return 55;
  }

  if (distance <= 180) {
    return 35;
  }

  if (distance <= 350) {
    return 15;
  }

  return 0;
}

function roleBonus(
  amount
) {
  const role =
    String(
      amount?.role ||
      ""
    );

  switch (role) {
    case "amountDue":
      return 45;

    case "automaticDebitAmount":
      return 55;

    case "refundAmount":
      return 60;

    case "refundedAmount":
      return 60;

    case "paidAmount":
      return 55;

    case "ttcAmount":
      return 15;

    case "installmentAmount":
      return -70;

    case "invoiceLineAmount":
      return -30;

    case "vat":
      return -100;

    case "ht":
      return -90;

    default:
      return 0;
  }
}

/**
 * =====================================================
 * SCORE D'UN MONTANT POUR UN ÉVÉNEMENT
 * =====================================================
 */

function scoreAmountForEvent(
  amount,
  status,
  fullText,
  allAmounts
) {
  const context =
    normalizeForSearch(
      amount?.context ||
      ""
    );

  const role =
    String(
      amount?.role ||
      ""
    );

  let score =
    roleBonus(amount);

  /*
   * TOTAL / FACTURE
   */

  if (
    /montant a payer|net a payer|reste a payer|total a regler/.test(
      context
    )
  ) {
    score += 80;
  }

  if (
    /total ttc|total toutes taxes comprises/.test(
      context
    )
  ) {
    score += 60;
  }

  if (
    /total de la facture|total facture|votre facture/.test(
      context
    )
  ) {
    score += 35;
  }

  /*
   * PRÉLÈVEMENT
   */

  if (
    status ===
      "automatic_debit" &&
    /prelev/.test(
      context
    )
  ) {
    score += 60;
  }

  /*
   * REMBOURSEMENT
   */

  if (
    status ===
      "refund_expected" &&
    role ===
      "refundAmount"
  ) {
    score += 90;
  }

  /*
   * DÉJÀ PAYÉ
   */

  if (
    status ===
      "already_paid" &&
    /paye|regle|preleve|acquitte/.test(
      context
    )
  ) {
    score += 70;
  }

  /*
   * RÉCONCILIATION
   */

  if (
    isReconciledTotal(
      amount,
      allAmounts
    )
  ) {
    score += 100;
  }

  /*
   * TVA / HT / BASE TVA
   */

  if (
    isTaxBaseAmount(
      amount,
      context
    )
  ) {
    score -= 140;
  }

  if (
    role === "vat"
  ) {
    score -= 110;
  }

  if (
    role === "ht"
  ) {
    score -= 100;
  }

  /*
   * MENSUALITÉ
   */

  if (
    role ===
      "installmentAmount"
  ) {
    score -= 90;
  }

  /*
   * RÉCURRENCE
   */

  const occurrences =
    countAmountOccurrences(
      fullText,
      amount
    );

  if (
    occurrences >= 2
  ) {
    score += 12;
  }

  if (
    occurrences >= 3
  ) {
    score += 12;
  }

  /*
   * MONTANT ÉNORME
   */

  if (
    Number(
      amount?.numeric
    ) >= 1000000
  ) {
    score -= 180;
  }

  return score;
}

/**
 * =====================================================
 * FALLBACK FACTURE
 * =====================================================
 */

function pickBestInvoiceTotal(
  amounts,
  fullText
) {
  const candidates =
    (amounts || [])
      .filter(
        (amount) =>
          !isAbsoluteForbiddenAmount(
            amount
          )
      )
      .map(
        (amount) => ({
          amount,
          score:
            scoreInvoiceTotal(
              amount,
              fullText,
              amounts
            )
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    candidates[0] ||
    null
  );
}

function scoreInvoiceTotal(
  amount,
  fullText,
  allAmounts
) {
  const context =
    normalizeForSearch(
      amount?.context ||
      ""
    );

  const role =
    String(
      amount?.role ||
      ""
    );

  let score = 0;

  if (
    role ===
      "amountDue"
  ) {
    score += 80;
  }

  if (
    /montant a payer|net a payer|reste a payer|total a regler/.test(
      context
    )
  ) {
    score += 100;
  }

  if (
    /total ttc|total toutes taxes comprises/.test(
      context
    )
  ) {
    score += 70;
  }

  if (
    /votre facture|total facture|total de la facture|montant de la facture/.test(
      context
    )
  ) {
    score += 45;
  }

  if (
    isReconciledTotal(
      amount,
      allAmounts
    )
  ) {
    score += 100;
  }

  if (
    role === "vat"
  ) {
    score -= 110;
  }

  if (
    role === "ht"
  ) {
    score -= 100;
  }

  if (
    role ===
      "installmentAmount"
  ) {
    score -= 80;
  }

  if (
    role ===
      "invoiceLineAmount"
  ) {
    score -= 30;
  }

  if (
    isTaxBaseAmount(
      amount,
      context
    )
  ) {
    score -= 130;
  }

  if (
    Number(
      amount?.numeric
    ) >= 1000000
  ) {
    score -= 180;
  }

  const occurrences =
    countAmountOccurrences(
      fullText,
      amount
    );

  if (
    occurrences >= 2
  ) {
    score += 15;
  }

  if (
    occurrences >= 3
  ) {
    score += 15;
  }

  return score;
}

/**
 * =====================================================
 * FALLBACK PRUDENT
 * =====================================================
 */

function pickSafeNeutralAmount(
  amounts,
  fullText
) {
  const candidates =
    (amounts || [])
      .filter(
        (amount) =>
          !isAbsoluteForbiddenAmount(
            amount
          )
      )
      .map(
        (amount) => ({
          amount,
          score:
            scoreInvoiceTotal(
              amount,
              fullText,
              amounts
            )
        })
      )
      .filter(
        (item) =>
          item.score >= 0
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    candidates[0] ||
    null
  );
}

/**
 * =====================================================
 * DATE ASSOCIÉE
 * =====================================================
 */

function pickRelevantDate(
  dates,
  status,
  event,
  fullText
) {
  const list =
    Array.isArray(dates)
      ? dates
      : [];

  if (!list.length) {
    return null;
  }

  const preferredRoles = {
    refund_expected:
      ["refundDate"],

    refunded:
      ["refundDate"],

    automatic_debit:
      ["debitDate"],

    already_paid:
      ["paymentDate"],

    to_pay:
      ["deadline"]
  };

  const roles =
    preferredRoles[status] ||
    [];

  for (
    const role
    of roles
  ) {
    const found =
      list.find(
        (date) =>
          date.role === role
      );

    if (found) {
      return found;
    }
  }

  /*
   * Fallback sémantique.
   */

  const patterns = {
    refund_expected:
      /rembours/,

    refunded:
      /rembours/,

    automatic_debit:
      /prelev|debite/,

    already_paid:
      /paye|regle|preleve/,

    to_pay:
      /echeance|date limite|avant le|a regler/
  };

  const pattern =
    patterns[status];

  if (pattern) {
    const found =
      list.find(
        (date) =>
          pattern.test(
            normalizeForSearch(
              date.context ||
              date.hint ||
              ""
            )
          )
      );

    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * =====================================================
 * BASE TVA
 * =====================================================
 */

function isTaxBaseAmount(
  amount,
  context
) {
  const source =
    normalizeForSearch(
      context
    );

  if (
    /base tva|base taxable|montant ht/.test(
      source
    )
  ) {
    return true;
  }

  if (
    /(?:5(?:[.,]5)?|10|20)\s*%\s+sur/.test(
      source
    )
  ) {
    const amountIndex =
      findAmountIndexInText(
        source,
        amount
      );

    const surIndex =
      source.indexOf(
        "sur"
      );

    const equalIndex =
      source.indexOf(
        "="
      );

    return (
      amountIndex >= 0 &&
      surIndex >= 0 &&
      amountIndex >
        surIndex &&
      (
        equalIndex < 0 ||
        amountIndex <
          equalIndex
      )
    );
  }

  return false;
}

/**
 * =====================================================
 * HT + TVA = TTC
 * =====================================================
 */

function isReconciledTotal(
  target,
  amounts
) {
  const targetValue =
    Number(
      target?.numeric
    );

  if (
    !Number.isFinite(
      targetValue
    ) ||
    targetValue <= 0
  ) {
    return false;
  }

  const list =
    (amounts || [])
      .filter(
        (item) =>
          item !== target
      )
      .map(
        (item) => ({
          amount:
            item,
          value:
            Number(
              item?.numeric
            )
        })
      )
      .filter(
        (item) =>
          Number.isFinite(
            item.value
          ) &&
          item.value > 0 &&
          item.value <
            targetValue
      );

  for (
    let i = 0;
    i < list.length;
    i += 1
  ) {
    for (
      let j = i + 1;
      j < list.length;
      j += 1
    ) {
      const a =
        list[i];

      const b =
        list[j];

      const sum =
        roundMoney(
          a.value +
          b.value
        );

      if (
        Math.abs(
          sum -
          roundMoney(
            targetValue
          )
        ) > 0.01
      ) {
        continue;
      }

      const aCtx =
        normalizeForSearch(
          a.amount?.context ||
          ""
        );

      const bCtx =
        normalizeForSearch(
          b.amount?.context ||
          ""
        );

      const taxSignal =
        a.amount?.role ===
          "vat" ||
        b.amount?.role ===
          "vat" ||
        /\btva\b|%\s+sur/.test(
          aCtx
        ) ||
        /\btva\b|%\s+sur/.test(
          bCtx
        );

      if (taxSignal) {
        return true;
      }
    }
  }

  return false;
}

function roundMoney(
  value
) {
  return (
    Math.round(
      Number(value) *
        100
    ) /
    100
  );
}

/**
 * =====================================================
 * MONTANTS ABSOLUMENT INTERDITS
 * =====================================================
 */

function isAbsoluteForbiddenAmount(
  amount
) {
  const role =
    String(
      amount?.role ||
      ""
    );

  return [
    "companyLegalAmount",
    "legalInformationAmount",
    "example",
    "table_value"
  ].includes(
    role
  );
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
      .map(
        (value) =>
          String(
            value ||
              ""
          ).trim()
      )
      .filter(Boolean);

  const plausible =
    list.filter(
      (value) => {
        if (
          value.length <
          4
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
      }
    );

  if (
    plausible.length
  ) {
    return plausible[0];
  }

  const header =
    String(text || "")
      .split(/\n/)
      .slice(0, 16)
      .join(" ");

  const acronym =
    header.match(
      /\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{4,20}\b/
    );

  return (
    acronym
      ? acronym[0]
      : null
  );
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
    Number(
      amount?.numeric
    );

  if (
    Number.isFinite(
      numeric
    )
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
  }

  const value =
    String(
      amount?.value ||
        ""
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

  return (
    [...variants]
      .filter(Boolean)
  );
}

function findAmountIndexInText(
  text,
  amount
) {
  const source =
    normalizeForSearch(
      text
    );

  for (
    const variant
    of buildAmountVariants(
      amount
    )
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
    normalizeForSearch(
      text
    );

  let best = 0;

  for (
    const variant
    of buildAmountVariants(
      amount
    )
  ) {
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
    value ||
      ""
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

function cleanContext(
  value
) {
  return String(
    value ||
      ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      220
    );
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function confidenceForAmount(
  event,
  amount,
  fallback
) {
  if (
    event?.score >=
    180
  ) {
    return 97;
  }

  if (
    event?.score >=
    130
  ) {
    return 94;
  }

  return Math.max(
    Number(
      amount?.confidence
    ) || 0,
    fallback
  );
}

function scoreToConfidence(
  score
) {
  const value =
    Number(score);

  if (
    !Number.isFinite(
      value
    )
  ) {
    return 60;
  }

  if (
    value >= 140
  ) {
    return 96;
  }

  if (
    value >= 100
  ) {
    return 91;
  }

  if (
    value >= 70
  ) {
    return 82;
  }

  if (
    value >= 50
  ) {
    return 70;
  }

  return 55;
}

/**
 * =====================================================
 * PREUVES
 * =====================================================
 */

function getAmountExplanation(
  status
) {
  switch (status) {
    case "to_pay":
      return "Montant à régler";

    case "automatic_debit":
      return "Montant associé au prélèvement automatique";

    case "already_paid":
      return "Montant déjà payé ou prélevé";

    case "refund_expected":
      return "Montant annoncé comme remboursement";

    case "refunded":
      return "Montant déjà remboursé";

    default:
      return "Montant détecté sur la facture";
  }
}

function getDateExplanation(
  status
) {
  switch (status) {
    case "to_pay":
      return "Date limite de paiement";

    case "automatic_debit":
      return "Date prévue du prélèvement";

    case "already_paid":
      return "Date du paiement";

    case "refund_expected":
      return "Date annoncée pour le remboursement";

    case "refunded":
      return "Date du remboursement";

    default:
      return "Date présente sur la facture";
  }
}
