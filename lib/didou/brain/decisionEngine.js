/**
 * =====================================================
 * DIDOU BRAIN — DECISION ENGINE V2
 * =====================================================
 *
 * Compatible avec Brain Index V7.
 *
 * Deux modes :
 *
 * PASS 1
 * ------
 * Le Consensus n'existe pas encore.
 * Le moteur se comporte comme une version améliorée
 * du Decision Engine historique.
 *
 * PASS 2
 * ------
 * Le Consensus existe.
 * Le moteur recalcule la décision en tenant compte
 * du type documentaire final.
 *
 * Objectifs :
 *
 * - choisir l'intention principale ;
 * - choisir la situation principale ;
 * - choisir le montant principal ;
 * - choisir la date principale ;
 * - déterminer si une action est nécessaire ;
 * - filtrer les actions parasites ;
 * - produire une confiance finale.
 */

export function runDecisionEngine(
  brain
) {
  if (
    !brain ||
    typeof brain !== "object"
  ) {
    return createEmptyDecision();
  }

  const decision =
    createEmptyDecision();

  /*
   * =====================================================
   * 0 — CONTEXTE DOCUMENTAIRE
   * =====================================================
   */

  const context =
    buildDecisionContext(
      brain
    );

  /*
   * =====================================================
   * 1 — INTENTION
   * =====================================================
   */

  const intent =
    buildContextualIntent({
      brain,
      context
    });

  if (
    intent &&
    Number(
      intent?.confidence ||
      0
    ) >= 70
  ) {
    decision.intent = {
      type:
        intent.type ||
        "unknown",

      label:
        intent.label ||
        null,

      confidence:
        Number(
          intent.confidence ||
          0
        ),

      source:
        intent.source ||
        (
          context.final
            ? "didou-contextual-decision"
            : "didou-brain"
        )
    };
  }

  /*
   * =====================================================
   * 2 — SITUATION PRINCIPALE
   * =====================================================
   */

  const primaryEvent =
    pickPrimaryEvent({
      brain,
      context
    });

  if (
    context.final &&
    context.situation
  ) {
    decision.primarySituation = {
      type:
        normalizeSemanticType(
          context.situation
        ) ||
        context.situation,

      label:
        labelContextIntent(
          context.situation
        ),

      confidence:
        Math.max(
          Number(
            context.confidence ||
            0
          ),
          Number(
            primaryEvent
              ?.confidence ||
            0
          )
        ),

      source:
        "didou-consensus"
    };
  } else if (
    primaryEvent
  ) {
    decision.primarySituation = {
      type:
        primaryEvent.type ||
        null,

      label:
        primaryEvent.label ||
        primaryEvent.type ||
        null,

      confidence:
        Number(
          primaryEvent.confidence ||
          0
        ),

      source:
        "didou-event"
    };
  } else if (
    intent
  ) {
    decision.primarySituation = {
      type:
        intent.type ||
        null,

      label:
        intent.label ||
        null,

      confidence:
        Number(
          intent.confidence ||
          0
        ),

      source:
        intent.source ||
        "didou-intent"
    };
  }

  /*
   * =====================================================
   * 3 — MONTANT PRINCIPAL
   * =====================================================
   */

  const primaryAmount =
    pickPrimaryAmount({
      brain,
      primaryEvent,
      context
    });

  if (
    primaryAmount
  ) {
    decision.primaryAmount = {
      value:
        primaryAmount.value ||
        null,

      numeric:
        Number.isFinite(
          Number(
            primaryAmount.numeric
          )
        )
          ? Number(
              primaryAmount.numeric
            )
          : null,

      role:
        primaryAmount.role ||
        null,

      confidence:
        Number(
          primaryAmount.confidence ||
          0
        ),

      verified:
        Boolean(
          primaryAmount.verified
        ),

      source:
        context.final
          ? "didou-contextual-decision"
          : "didou-brain"
    };
  }

  /*
   * =====================================================
   * 4 — DATE PRINCIPALE
   * =====================================================
   */

  const primaryDate =
    pickPrimaryDate({
      brain,
      primaryEvent,
      context
    });

  if (
    primaryDate
  ) {
    decision.primaryDate = {
      value:
        primaryDate.value ||
        null,

      role:
        primaryDate.role ||
        primaryDate.hint ||
        null,

      confidence:
        Number(
          primaryDate.confidence ||
          0
        ),

      verified:
        Boolean(
          primaryDate.verified
        ),

      context:
        cleanText(
          primaryDate.context ||
          primaryDate?.evidence
            ?.quote
        ) ||
        null,

      source:
        context.final
          ? "didou-contextual-decision"
          : "didou-brain"
    };
  }

  /*
   * =====================================================
   * 5 — ACTION REQUISE
   * =====================================================
   */

  decision.actionRequired =
    determineActionRequired({
      brain,
      intent,
      primaryEvent,
      context
    });

  /*
   * =====================================================
   * 6 — ACTIONS
   * =====================================================
   */

  decision.actions =
    pickUsefulActions({
      brain,
      context
    });

  /*
   * =====================================================
   * 7 — CONTRADICTIONS
   * =====================================================
   */

  decision.contradictions =
    Array.isArray(
      brain?.contradictions
    )
      ? brain.contradictions
      : [];

  /*
   * =====================================================
   * 8 — CONFIANCE
   * =====================================================
   */

  decision.confidence =
    calculateDecisionConfidence({
      brain,
      decision,
      primaryEvent,
      context
    });

  /*
   * =====================================================
   * 9 — EXPLICATION INTERNE
   * =====================================================
   */

  decision.reason =
    buildDecisionReason({
      decision,
      context
    });

  /*
   * =====================================================
   * 10 — META
   * =====================================================
   */

  decision.meta = {
    version:
      "2.0",

    pass:
      context.final
        ? "final"
        : "initial",

    contextual:
      context.final,

    consensusWinner:
      context.winner,

    documentType:
      context.documentType,

    family:
      context.family
  };

  return decision;
}

/**
 * =====================================================
 * CONTEXTE DOCUMENTAIRE
 * =====================================================
 */

function buildDecisionContext(
  brain
) {
  const consensus =
    brain?.consensus ||
    null;

  const consensusUsable =
    Boolean(
      consensus &&
      (
        consensus?.documentType ||
        consensus?.intent ||
        consensus?.situation
      )
    );

  return {
    final:
      consensusUsable,

    documentType:
      consensusUsable
        ? (
            consensus
              ?.documentType ||
            brain?.document
              ?.type ||
            null
          )
        : (
            brain?.document
              ?.type ||
            null
          ),

    family:
      consensusUsable
        ? (
            consensus
              ?.family ||
            brain?.document
              ?.family ||
            null
          )
        : (
            brain?.document
              ?.family ||
            null
          ),

    intent:
      consensusUsable
        ? (
            normalizeSemanticType(
              consensus?.intent
            ) ||
            consensus?.intent ||
            null
          )
        : (
            normalizeSemanticType(
              brain?.intent?.type
            ) ||
            brain?.intent?.type ||
            null
          ),

    situation:
      consensusUsable
        ? (
            normalizeSemanticType(
              consensus?.situation
            ) ||
            consensus?.situation ||
            null
          )
        : (
            normalizeSemanticType(
              brain?.situation?.type
            ) ||
            brain?.situation?.type ||
            null
          ),

    actionRequired:
      consensusUsable
        ? (
            consensus
              ?.actionRequired ??
            null
          )
        : null,

    confidence:
      consensusUsable
        ? Number(
            consensus?.confidence ||
            0
          )
        : Number(
            brain?.document
              ?.confidence ||
            brain?.intent
              ?.confidence ||
            0
          ),

    winner:
      consensusUsable
        ? (
            consensus?.winner ||
            null
          )
        : null,

    corrected:
      consensusUsable
        ? Boolean(
            consensus?.corrected
          )
        : false
  };
}

/**
 * =====================================================
 * INTENTION CONTEXTUELLE
 * =====================================================
 */

function buildContextualIntent({
  brain,
  context
}) {
  const original =
    brain?.intent ||
    null;

  /*
   * PASS 1
   */

  if (
    !context.final
  ) {
    return original;
  }

  /*
   * PASS 2
   */

  const type =
    normalizeSemanticType(
      context.intent ||
      context.situation
    );

  if (
    !type
  ) {
    return original;
  }

  return {
    type,

    label:
      labelContextIntent(
        type
      ),

    confidence:
      Math.max(
        Number(
          original?.confidence ||
          0
        ),
        Number(
          context.confidence ||
          0
        )
      ),

    actionRequired:
      context.actionRequired ??
      original?.actionRequired ??
      null,

    source:
      "didou-consensus"
  };
}

/**
 * =====================================================
 * EVENT PRINCIPAL
 * =====================================================
 */

function pickPrimaryEvent({
  brain,
  context
}) {
  const events =
    Array.isArray(
      brain?.events
    )
      ? brain.events
      : [];

  if (
    !events.length
  ) {
    return null;
  }

  const candidates =
    events
      .map(
        (event) => ({
          event,

          score:
            scoreEvent(
              event
            ) +
            scoreEventForContext({
              event,
              context
            })
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    candidates[0]?.event ||
    null
  );
}

/**
 * =====================================================
 * SCORE EVENT STANDARD
 * =====================================================
 */

function scoreEvent(
  event
) {
  let score =
    Number(
      event?.confidence ||
      0
    );

  if (
    event?.verified ===
      true
  ) {
    score += 20;
  }

  if (
    event?.amount
      ?.verified === true &&
    event?.amount
      ?.userRelevant === true
  ) {
    score += 15;
  }

  if (
    event?.date
      ?.verified === true &&
    event?.date
      ?.userRelevant === true
  ) {
    score += 10;
  }

  const type =
    normalizeSemanticType(
      event?.type
    );

  if (
    type === "refund"
  ) {
    score += 15;
  }

  if (
    type ===
      "automatic_debit"
  ) {
    score += 14;
  }

  if (
    type ===
      "payment_due"
  ) {
    score += 13;
  }

  if (
    type === "meeting"
  ) {
    score += 12;
  }
/**
 * =====================================================
 * SCORE EVENT CONTEXTUEL
 * =====================================================
 */

function scoreEventForContext({
  event,
  context
}) {
  if (
    !context.final
  ) {
    return 0;
  }

  const eventType =
    normalizeSemanticType(
      event?.type
    );

  const situation =
    normalizeSemanticType(
      context.situation
    );

  const intent =
    normalizeSemanticType(
      context.intent
    );

  let score = 0;

  /*
   * Accord direct avec le Consensus.
   */

  if (
    situation &&
    eventType === situation
  ) {
    score += 160;
  }

  if (
    intent &&
    eventType === intent
  ) {
    score += 110;
  }

  /*
   * =====================================================
   * REUNION / AG
   * =====================================================
   */

  if (
    isMeetingContext(
      context
    )
  ) {
    if (
      eventType ===
        "meeting"
    ) {
      score += 180;
    }

    if (
      [
        "refund",
        "automatic_debit",
        "payment_due"
      ].includes(
        eventType
      )
    ) {
      score -= 150;
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */

  if (
    situation === "refund"
  ) {
    if (
      eventType ===
        "refund"
    ) {
      score += 150;
    }

    if (
      eventType ===
        "payment_due"
    ) {
      score -= 100;
    }
  }

  /*
   * =====================================================
   * PRELEVEMENT
   * =====================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    if (
      eventType ===
        "automatic_debit"
    ) {
      score += 150;
    }
  }

  /*
   * =====================================================
   * PAIEMENT
   * =====================================================
   */

  if (
    situation ===
      "payment_due"
  ) {
    if (
      eventType ===
        "payment_due"
    ) {
      score += 150;
    }
  }

  return score;
}

/**
 * =====================================================
 * MONTANT PRINCIPAL
 * =====================================================
 */

function pickPrimaryAmount({
  brain,
  primaryEvent,
  context
}) {
  /*
   * =====================================================
   * DOCUMENT SANS MONTANT PRINCIPAL
   * =====================================================
   */

  if (
    shouldSuppressPrimaryAmount(
      context
    )
  ) {
    return null;
  }

  /*
   * =====================================================
   * MONTANT EVENEMENT PRINCIPAL
   * =====================================================
   */

  if (
    primaryEvent?.amount
      ?.verified === true &&
    primaryEvent?.amount
      ?.userRelevant === true
  ) {
    const eventScore =
      scoreAmountForContext({
        amount:
          primaryEvent.amount,

        context
      });

    if (
      !context.final ||
      eventScore >= 0
    ) {
      return (
        primaryEvent.amount
      );
    }
  }

  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  const ranked =
    amounts
      .filter(
        (amount) =>
          amount?.verified === true &&
          amount?.userRelevant === true
      )
      .map(
        (amount) => ({
          amount,

          score:
            Number(
              amount?.confidence ||
              0
            ) +
            scoreAmountForContext({
              amount,
              context
            })
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const winner =
    ranked[0] ||
    null;

  /*
   * PASS 2 :
   *
   * on refuse un montant qui n'a plus assez
   * de cohérence avec le type documentaire final.
   */

  if (
    context.final &&
    winner &&
    winner.score < 50
  ) {
    return null;
  }

  return (
    winner?.amount ||
    null
  );
}

/**
 * =====================================================
 * SUPPRESSION MONTANT PRINCIPAL
 * =====================================================
 */

function shouldSuppressPrimaryAmount(
  context
) {
  if (
    !context.final
  ) {
    return false;
  }

  /*
   * Une AG contient souvent :
   *
   * - budgets
   * - travaux
   * - devis
   * - honoraires
   * - charges
   *
   * mais cela ne signifie pas qu'il existe
   * un montant principal à présenter à l'utilisateur.
   */

  if (
    isMeetingContext(
      context
    )
  ) {
    return true;
  }

  const intent =
    normalizeSemanticType(
      context.intent
    );

  return [
    "proof",
    "declaration"
  ].includes(
    intent
  );
}

/**
 * =====================================================
 * SCORE MONTANT CONTEXTUEL
 * =====================================================
 */

function scoreAmountForContext({
  amount,
  context
}) {
  if (
    !context.final
  ) {
    return 0;
  }

  const role =
    normalizeRole(
      amount?.role
    );

  const situation =
    normalizeSemanticType(
      context.situation
    );

  let score = 0;

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */

  if (
    situation === "refund"
  ) {
    if (
      role.includes(
        "refund"
      ) ||
      role.includes(
        "rembours"
      )
    ) {
      score += 150;
    } else {
      score -= 50;
    }
  }

  /*
   * =====================================================
   * PRELEVEMENT
   * =====================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    if (
      role.includes(
        "debit"
      ) ||
      role.includes(
        "prelev"
      )
    ) {
      score += 150;
    } else {
      score -= 40;
    }
  }

  /*
   * =====================================================
   * PAIEMENT
   * =====================================================
   */

  if (
    situation ===
      "payment_due"
  ) {
    if (
      role.includes(
        "amountdue"
      ) ||
      role.includes(
        "paymentdue"
      ) ||
      role === "due"
    ) {
      score += 150;
    } else {
      score -= 40;
    }
  }

  return score;
}

/**
 * =====================================================
 * DATE PRINCIPALE
 * =====================================================
 */

function pickPrimaryDate({
  brain,
  primaryEvent,
  context
}) {
  const dates =
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : [];

  const candidates = [];

  /*
   * =====================================================
   * DATE DE L'EVENEMENT PRINCIPAL
   * =====================================================
   */

  if (
    primaryEvent?.date
      ?.verified === true &&
    primaryEvent?.date
      ?.userRelevant === true
  ) {
    candidates.push({
      date:
        primaryEvent.date,

      eventLinked:
        true
    });
  }

  /*
   * =====================================================
   * DATES BRAIN
   * =====================================================
   */

  for (
    const date
    of dates
  ) {
    if (
      date?.verified !== true ||
      date?.userRelevant !== true
    ) {
      continue;
    }

    candidates.push({
      date,
      eventLinked:
        false
    });
  }

  if (
    !candidates.length
  ) {
    return null;
  }

  /*
   * =====================================================
   * DEDUPLICATION
   * =====================================================
   */

  const unique =
    deduplicateDateCandidates(
      candidates
    );

  /*
   * =====================================================
   * SCORING CONTEXTUEL
   * =====================================================
   */

  const ranked =
    unique
      .map(
        (candidate) => ({
          ...candidate,

          score:
            Number(
              candidate?.date
                ?.confidence ||
              0
            ) +
            (
              candidate.eventLinked
                ? 15
                : 0
            ) +
            scoreDateForContext({
              date:
                candidate.date,

              context
            })
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const winner =
    ranked[0] ||
    null;

  if (
    !winner
  ) {
    return null;
  }

  /*
   * PASS 2 :
   *
   * une date incohérente avec le document final
   * ne gagne pas uniquement parce que sa confiance
   * brute vaut 100.
   */

  if (
    context.final &&
    winner.score < 80
  ) {
    return null;
  }

  return (
    winner.date ||
    null
  );
}

/**
 * =====================================================
 * DEDUPLICATION DATES
 * =====================================================
 */

function deduplicateDateCandidates(
  candidates
) {
  const map =
    new Map();

  for (
    const item
    of candidates
  ) {
    const date =
      item?.date ||
      null;

    if (
      !date?.value
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        date.value
      );

    if (
      !key
    ) {
      continue;
    }

    const existing =
      map.get(
        key
      );

    if (
      !existing
    ) {
      map.set(
        key,
        item
      );

      continue;
    }

    map.set(
      key,
      {
        date:
          chooseBetterDate(
            existing.date,
            date
          ),

        eventLinked:
          Boolean(
            existing.eventLinked ||
            item.eventLinked
          )
      }
    );
  }

  return Array.from(
    map.values()
  );
}

/**
 * =====================================================
 * MEILLEURE VERSION D'UNE DATE
 * =====================================================
 */

function chooseBetterDate(
  first,
  second
) {
  if (
    !first
  ) {
    return second;
  }

  if (
    !second
  ) {
    return first;
  }

  const firstScore =
    Number(
      first?.confidence ||
      0
    ) +
    (
      first?.verified
        ? 20
        : 0
    );

  const secondScore =
    Number(
      second?.confidence ||
      0
    ) +
    (
      second?.verified
        ? 20
        : 0
    );

  if (
    secondScore >
    firstScore
  ) {
    return {
      ...first,
      ...second,

      context:
        cleanText(
          [
            first?.context,
            first?.evidence
              ?.quote,
            second?.context,
            second?.evidence
              ?.quote
          ]
            .filter(Boolean)
            .join(" ")
        )
    };
  }

  return {
    ...second,
    ...first,

    context:
      cleanText(
        [
          first?.context,
          first?.evidence
            ?.quote,
          second?.context,
          second?.evidence
            ?.quote
        ]
          .filter(Boolean)
          .join(" ")
      )
  };
}
  /**
 * =====================================================
 * SCORE DATE CONTEXTUEL
 * =====================================================
 */

function scoreDateForContext({
  date,
  context
}) {
  if (
    !context.final
  ) {
    return 0;
  }

  const role =
    normalizeRole(
      date?.role ||
      date?.hint
    );

  const situation =
    normalizeSemanticType(
      context?.situation
    );

  const intent =
    normalizeSemanticType(
      context?.intent
    );

  const documentType =
    normalizeText(
      context?.documentType
    );

  const dateContext =
    normalizeText(
      [
        date?.context,
        date?.evidence?.quote
      ]
        .filter(Boolean)
        .join(" ")
    );

  let score = 0;

  /*
   * =====================================================
   * REUNION / ASSEMBLEE GENERALE
   * =====================================================
   */

  if (
    isMeetingContext(
      context
    )
  ) {
    /*
     * meetingDate est le rôle attendu.
     */

    if (
      role.includes(
        "meeting"
      ) ||
      role.includes(
        "assembly"
      ) ||
      role.includes(
        "assemblee"
      )
    ) {
      score += 220;
    }

    /*
     * Contexte textuel très fort.
     */

    if (
      /assemblee generale|assemblee des coproprietaires|convoquee le|convocation.*assemblee|reunion.*le/.test(
        dateContext
      )
    ) {
      score += 160;
    }

    /*
     * Une deadline secondaire ne doit pas devenir
     * la date principale d'une AG.
     */

    if (
      role.includes(
        "deadline"
      )
    ) {
      score -= 180;
    }

    /*
     * Une période comptable n'est pas la date de l'AG.
     */

    if (
      role.includes(
        "coveredperiod"
      )
    ) {
      score -= 160;
    }

    /*
     * Dates de budget / exercice.
     */

    if (
      /budget previsionnel|exercice clos|exercice du|comptes de l'exercice|periode du/.test(
        dateContext
      )
    ) {
      score -= 180;
    }

    /*
     * Dates de loi / décret / arrêté.
     */

    if (
      /\barrete\b|\bdecret\b|\bloi\b|\barticle\b|\bordonnance\b/.test(
        dateContext
      )
    ) {
      score -= 220;
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */

  if (
    situation === "refund" ||
    intent === "refund"
  ) {
    if (
      role.includes(
        "refund"
      ) ||
      role.includes(
        "rembours"
      )
    ) {
      score += 170;
    } else {
      score -= 30;
    }
  }

  /*
   * =====================================================
   * PRELEVEMENT AUTOMATIQUE
   * =====================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    if (
      role.includes(
        "debit"
      ) ||
      role.includes(
        "prelev"
      )
    ) {
      score += 170;
    }
  }

  /*
   * =====================================================
   * PAIEMENT
   * =====================================================
   */

  if (
    situation ===
      "payment_due"
  ) {
    if (
      role.includes(
        "deadline"
      ) ||
      role.includes(
        "payment"
      ) ||
      role.includes(
        "due"
      )
    ) {
      score += 150;
    }
  }

  /*
   * =====================================================
   * PREUVE / ATTESTATION
   * =====================================================
   */

  if (
    intent === "proof"
  ) {
    if (
      role.includes(
        "coveredperiod"
      )
    ) {
      score += 100;
    }

    if (
      role.includes(
        "deadline"
      )
    ) {
      score -= 80;
    }
  }

  /*
   * =====================================================
   * CONTRAT
   * =====================================================
   */

  if (
    intent === "contract"
  ) {
    if (
      role.includes(
        "start"
      ) ||
      role.includes(
        "end"
      ) ||
      role.includes(
        "effective"
      ) ||
      role.includes(
        "coveredperiod"
      )
    ) {
      score += 110;
    }
  }

  /*
   * =====================================================
   * TYPE AG EXPLICITE
   * =====================================================
   */

  if (
    /assemblee generale/.test(
      documentType
    ) &&
    role.includes(
      "meeting"
    )
  ) {
    score += 80;
  }

  return score;
}

/**
 * =====================================================
 * ACTION REQUISE ?
 * =====================================================
 */

function determineActionRequired({
  brain,
  intent,
  primaryEvent,
  context
}) {
  /*
   * =====================================================
   * CONSENSUS EXPLICITE
   * =====================================================
   */

  if (
    context.final &&
    typeof context
      ?.actionRequired ===
      "boolean"
  ) {
    return (
      context.actionRequired
    );
  }

  /*
   * =====================================================
   * INTENTION
   * =====================================================
   */

  if (
    intent?.actionRequired ===
      false
  ) {
    return false;
  }

  if (
    intent?.actionRequired ===
      true
  ) {
    return true;
  }

  /*
   * =====================================================
   * EVENT
   * =====================================================
   */

  if (
    primaryEvent?.actionRequired ===
      false
  ) {
    return false;
  }

  if (
    primaryEvent?.actionRequired ===
      true
  ) {
    return true;
  }

  /*
   * =====================================================
   * ACTIONS UTILES
   * =====================================================
   */

  const actions =
    pickUsefulActions({
      brain,
      context
    });

  if (
    actions.length
  ) {
    return true;
  }

  /*
   * =====================================================
   * CONVOCATION / REUNION
   * =====================================================
   *
   * Une convocation demande au minimum à l'utilisateur
   * de prendre connaissance des modalités de
   * participation ou de vote.
   */

  if (
    context.final &&
    isMeetingContext(
      context
    )
  ) {
    return true;
  }

  /*
   * =====================================================
   * PREUVE
   * =====================================================
   */

  if (
    normalizeSemanticType(
      intent?.type
    ) === "proof"
  ) {
    return false;
  }

  /*
   * =====================================================
   * NOTIFICATION
   * =====================================================
   */

  if (
    normalizeSemanticType(
      intent?.type
    ) === "notification"
  ) {
    return false;
  }

  return null;
}

/**
 * =====================================================
 * ACTIONS UTILES
 * =====================================================
 *
 * V2 :
 *
 * Les actions ne sont plus seulement triées par
 * confiance. Elles sont également interprétées
 * selon le type documentaire final.
 */

function pickUsefulActions({
  brain,
  context
}) {
  const actions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : [];

  const result = [];
  const seen = new Set();

  for (
    const action
    of actions
  ) {
    if (
      Number(
        action?.confidence ||
        0
      ) < 70
    ) {
      continue;
    }

    if (
      !isUsefulAction(
        action?.action
      )
    ) {
      continue;
    }

    const normalized =
      normalizeActionForContext({
        action,
        context
      });

    if (
      !normalized
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        normalized.action
      );

    if (
      !key ||
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      normalized
    );
  }

  return result
    .sort(
      (a, b) =>
        Number(
          b?.confidence ||
          0
        ) -
        Number(
          a?.confidence ||
          0
        )
    )
    .slice(
      0,
      2
    );
}

/**
 * =====================================================
 * NORMALISATION ACTION CONTEXTUELLE
 * =====================================================
 */

function normalizeActionForContext({
  action,
  context
}) {
  const original =
    cleanText(
      action?.action
    );

  if (
    !original
  ) {
    return null;
  }

  /*
   * PASS 1 :
   *
   * on conserve le comportement historique.
   */

  if (
    !context?.final
  ) {
    return {
      ...action,

      action:
        original
    };
  }

  /*
   * =====================================================
   * ASSEMBLEE GENERALE / REUNION
   * =====================================================
   */

  if (
    isMeetingContext(
      context
    )
  ) {
    const text =
      normalizeText(
        original
      );

    /*
     * ===================================================
     * ANNEXES / DEVIS / PRESTATAIRES
     * ===================================================
     */

    if (
      /vous devez vous adresser/.test(
        text
      ) ||
      /vous adresser a la societe/.test(
        text
      ) ||
      /s'adresser a la societe/.test(
        text
      ) ||
      /societe dont la marque/.test(
        text
      ) ||
      /marque et.*coordonnees/.test(
        text
      ) ||
      /coordonnees.*recto/.test(
        text
      ) ||
      /sur le devis/.test(
        text
      )
    ) {
      return null;
    }

    /*
     * ===================================================
     * SIGNER TOUTES LES PAGES
     * ===================================================
     *
     * Cette instruction peut appartenir au formulaire
     * de vote par correspondance.
     *
     * Ce n'est donc PAS une obligation générale
     * liée à la convocation.
     */

    if (
      /signer toutes les pages/.test(
        text
      ) ||
      /signature.*toutes les pages/.test(
        text
      )
    ) {
      return {
        ...action,

        action:
          "Consulter les modalités de vote par correspondance si vous souhaitez utiliser cette possibilité.",

        confidence:
          Math.min(
            Number(
              action?.confidence ||
              80
            ),
            90
          ),

        source:
          "didou-contextual-decision"
      };
    }

    /*
     * ===================================================
     * COCHER LES RESOLUTIONS
     * ===================================================
     */

    if (
      /cocher/.test(
        text
      ) &&
      (
        /resolution/.test(
          text
        ) ||
        /intention de vote/.test(
          text
        )
      )
    ) {
      return {
        ...action,

        action:
          "Consulter les modalités de vote par correspondance si vous souhaitez utiliser cette possibilité.",

        confidence:
          Math.min(
            Number(
              action?.confidence ||
              80
            ),
            90
          ),

        source:
          "didou-contextual-decision"
      };
    }

    /*
     * ===================================================
     * PARTICIPER / ASSISTER
     * ===================================================
     */

    if (
      /participer/.test(
        text
      ) ||
      /assister/.test(
        text
      )
    ) {
      return {
        ...action,

        action:
          "Prendre connaissance des modalités de participation à l’assemblée générale.",

        source:
          "didou-contextual-decision"
      };
    }

    /*
     * ===================================================
     * VOTE PAR CORRESPONDANCE
     * ===================================================
     */

    if (
      /vote par correspondance/.test(
        text
      ) ||
      /voter par correspondance/.test(
        text
      ) ||
      (
        /formulaire/.test(
          text
        ) &&
        /vote/.test(
          text
        )
      )
    ) {
      return {
        ...action,

        action:
          "Consulter les modalités de vote par correspondance prévues dans la convocation.",

        source:
          "didou-contextual-decision"
      };
    }

    /*
     * ===================================================
     * POUVOIR / PROCURATION
     * ===================================================
     */

    if (
      /procuration/.test(
        text
      ) ||
      /\bpouvoir\b/.test(
        text
      ) ||
      /mandat/.test(
        text
      )
    ) {
      return {
        ...action,

        action:
          "Consulter les possibilités de pouvoir ou de procuration si vous ne pouvez pas participer.",

        source:
          "didou-contextual-decision"
      };
    }

    /*
     * ===================================================
     * ACTION FINANCIERE PARASITE
     * ===================================================
     */

    if (
      /payer|regler|versement|prelevement|remboursement/.test(
        text
      )
    ) {
      return null;
    }

    /*
     * ===================================================
     * ACTION INCONNUE
     * ===================================================
     *
     * Une phrase quelconque d'une annexe ne devient
     * jamais une obligation principale de l'AG.
     */

    return null;
  }

  /*
   * =====================================================
   * AUTRES TYPES DOCUMENTAIRES
   * =====================================================
   */

  return {
    ...action,

    action:
      original
  };
}

/**
 * =====================================================
 * ACTION UTILE ?
 * =====================================================
 */

function isUsefulAction(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (
    !text
  ) {
    return false;
  }

  /*
   * Politesse.
   */

  if (
    /merci de votre confiance|merci pour votre confiance/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Phrase négative.
   */

  if (
    /ne pas tenir compte|ne pas en tenir compte/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Condition générique.
   */

  if (
    /si vous avez besoin|si besoin|si necessaire/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Parasites manifestes.
   */

  if (
    /vous devez vous adresser/.test(
      text
    ) ||
    /vous adresser a la societe/.test(
      text
    ) ||
    /societe dont la marque/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

/**
 * =====================================================
 * CONTEXTE REUNION ?
 * =====================================================
 */

function isMeetingContext(
  context
) {
  const documentType =
    normalizeText(
      context?.documentType
    );

  const family =
    normalizeText(
      context?.family
    );

  const intent =
    normalizeSemanticType(
      context?.intent
    );

  const situation =
    normalizeSemanticType(
      context?.situation
    );

  return (
    intent === "meeting" ||
    situation === "meeting" ||
    /assemblee generale/.test(
      documentType
    ) ||
    (
      /convocation/.test(
        documentType
      ) &&
      /assemblee|reunion/.test(
        documentType
      )
    ) ||
    (
      /copropriet/.test(
        family
      ) &&
      /convocation|assemblee/.test(
        documentType
      )
    )
  );
}
/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateDecisionConfidence({
  brain,
  decision,
  primaryEvent,
  context
}) {
  let score =
    Number(
      brain?.score?.global ||
      0
    );

  /*
   * =====================================================
   * CONSENSUS FINAL
   * =====================================================
   */

  if (
    context.final
  ) {
    score =
      Math.max(
        score,
        Number(
          context.confidence ||
          0
        )
      );

    /*
     * Une correction explicite du Consensus
     * renforce légèrement la décision finale.
     */

    if (
      context.corrected
    ) {
      score += 3;
    }
  }

  /*
   * =====================================================
   * INTENTION FORTE
   * =====================================================
   */

  if (
    Number(
      decision?.intent
        ?.confidence ||
      0
    ) >= 85
  ) {
    score += 8;
  }

  /*
   * =====================================================
   * EVENEMENT FORT
   * =====================================================
   */

  if (
    Number(
      primaryEvent
        ?.confidence ||
      0
    ) >= 85
  ) {
    score += 6;
  }

  /*
   * =====================================================
   * MONTANT VERIFIE
   * =====================================================
   */

  if (
    decision?.primaryAmount
      ?.verified
  ) {
    score += 5;
  }

  /*
   * =====================================================
   * DATE VERIFIEE
   * =====================================================
   */

  if (
    decision?.primaryDate
      ?.verified
  ) {
    score += 5;
  }

  /*
   * =====================================================
   * CONTRADICTIONS
   * =====================================================
   */

  const contradictions =
    Array.isArray(
      decision?.contradictions
    )
      ? decision.contradictions
      : [];

  for (
    const contradiction
    of contradictions
  ) {
    if (
      contradiction?.severity ===
        "high"
    ) {
      score -= 20;
    } else if (
      contradiction?.severity ===
        "medium"
    ) {
      score -= 8;
    } else {
      score -= 3;
    }
  }

  return clamp(
    score,
    0,
    98
  );
}

/**
 * =====================================================
 * EXPLICATION INTERNE
 * =====================================================
 */

function buildDecisionReason({
  decision,
  context
}) {
  const situation =
    normalizeSemanticType(
      decision
        ?.primarySituation
        ?.type ||
      decision
        ?.intent
        ?.type
    );

  /*
   * =====================================================
   * CONSENSUS AYANT CORRIGE LA DECISION
   * =====================================================
   */

  if (
    context.final &&
    context.corrected
  ) {
    if (
      situation ===
        "meeting"
    ) {
      return (
        "Le Consensus a corrigé l’interprétation initiale : Didou considère qu’une réunion ou convocation constitue l’information principale."
      );
    }

    return (
      "Le Consensus a corrigé l’interprétation initiale et Didou a recalculé les informations principales du document."
    );
  }

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */

  if (
    situation ===
      "refund"
  ) {
    return (
      "Didou considère qu’un remboursement constitue l’information principale."
    );
  }

  /*
   * =====================================================
   * PRELEVEMENT
   * =====================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    return (
      "Didou considère qu’un prélèvement automatique constitue l’information principale."
    );
  }

  /*
   * =====================================================
   * PAIEMENT
   * =====================================================
   */

  if (
    situation ===
      "payment_due"
  ) {
    return (
      "Didou considère qu’un paiement à effectuer constitue l’information principale."
    );
  }

  /*
   * =====================================================
   * REUNION
   * =====================================================
   */

  if (
    situation ===
      "meeting"
  ) {
    return (
      "Didou considère qu’une réunion ou convocation constitue l’information principale."
    );
  }

  /*
   * =====================================================
   * PREUVE
   * =====================================================
   */

  if (
    situation ===
      "proof"
  ) {
    return (
      "Didou considère que le document sert principalement de preuve ou d’attestation."
    );
  }

  /*
   * =====================================================
   * CONTRAT
   * =====================================================
   */

  if (
    situation ===
      "contract"
  ) {
    return (
      "Didou considère que le document définit principalement une relation contractuelle."
    );
  }

  /*
   * =====================================================
   * ACTION
   * =====================================================
   */

  if (
    decision?.actionRequired ===
      true
  ) {
    return (
      "Didou considère qu’une action de l’utilisateur est nécessaire."
    );
  }

  if (
    decision?.actionRequired ===
      false
  ) {
    return (
      "Didou ne détecte pas d’action obligatoire pour l’utilisateur."
    );
  }

  return (
    "Didou a identifié les informations principales du document."
  );
}

/**
 * =====================================================
 * NORMALISATION SEMANTIQUE
 * =====================================================
 */

function normalizeSemanticType(
  value
) {
  const text =
    normalizeRole(
      value
    );

  if (
    !text
  ) {
    return null;
  }

  /*
   * =====================================================
   * MEETING
   * =====================================================
   */

  if (
    text.includes(
      "meeting"
    ) ||
    text.includes(
      "assemblee"
    ) ||
    text.includes(
      "assembly"
    ) ||
    text.includes(
      "convocation"
    ) ||
    text.includes(
      "reunion"
    )
  ) {
    return "meeting";
  }

  /*
   * =====================================================
   * REFUND
   * =====================================================
   */

  if (
    text.includes(
      "refund"
    ) ||
    text.includes(
      "rembours"
    )
  ) {
    return "refund";
  }

  /*
   * =====================================================
   * AUTOMATIC DEBIT
   * =====================================================
   */

  if (
    text.includes(
      "automaticdebit"
    ) ||
    text ===
      "debit" ||
    text.includes(
      "prelevement"
    ) ||
    text.includes(
      "prelev"
    )
  ) {
    return (
      "automatic_debit"
    );
  }

  /*
   * =====================================================
   * PAYMENT DUE
   * =====================================================
   */

  if (
    text.includes(
      "paymentdue"
    ) ||
    text.includes(
      "amountdue"
    )
  ) {
    return (
      "payment_due"
    );
  }

  /*
   * =====================================================
   * PAYMENT
   * =====================================================
   */

  if (
    text.includes(
      "payment"
    ) ||
    text.includes(
      "paiement"
    ) ||
    text.includes(
      "reglement"
    )
  ) {
    return "payment";
  }

  /*
   * =====================================================
   * PROOF
   * =====================================================
   */

  if (
    text.includes(
      "proof"
    ) ||
    text.includes(
      "attestation"
    ) ||
    text.includes(
      "justificatif"
    )
  ) {
    return "proof";
  }

  /*
   * =====================================================
   * CONTRACT
   * =====================================================
   */

  if (
    text.includes(
      "contract"
    ) ||
    text.includes(
      "contrat"
    )
  ) {
    return "contract";
  }

  /*
   * =====================================================
   * DECISION
   * =====================================================
   */

  if (
    text.includes(
      "decision"
    )
  ) {
    return "decision";
  }

  /*
   * =====================================================
   * DECLARATION
   * =====================================================
   */

  if (
    text.includes(
      "declaration"
    )
  ) {
    return (
      "declaration"
    );
  }

  /*
   * =====================================================
   * NOTIFICATION
   * =====================================================
   */

  if (
    text.includes(
      "notification"
    )
  ) {
    return (
      "notification"
    );
  }

  /*
   * =====================================================
   * REQUEST
   * =====================================================
   */

  if (
    text.includes(
      "request"
    ) ||
    text.includes(
      "demande"
    )
  ) {
    return "request";
  }

  /*
   * =====================================================
   * INFORMATION
   * =====================================================
   */

  if (
    text.includes(
      "information"
    )
  ) {
    return (
      "information"
    );
  }

  return (
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase()
  );
}

/**
 * =====================================================
 * LABEL CONTEXTE
 * =====================================================
 */

function labelContextIntent(
  type
) {
  switch (
    normalizeSemanticType(
      type
    )
  ) {
    case "meeting":
      return (
        "Convocation / réunion"
      );

    case "proof":
      return (
        "Attestation / justificatif"
      );

    case "refund":
      return (
        "Remboursement"
      );

    case "payment":
    case "payment_due":
      return (
        "Paiement / règlement"
      );

    case "decision":
      return (
        "Décision"
      );

    case "contract":
      return (
        "Contrat"
      );

    case "declaration":
      return (
        "Déclaration"
      );

    case "notification":
      return (
        "Notification"
      );

    case "request":
      return (
        "Action demandée"
      );

    default:
      return (
        "Information"
      );
  }
}

/**
 * =====================================================
 * DECISION VIDE
 * =====================================================
 */

function createEmptyDecision() {
  return {
    intent:
      null,

    primarySituation:
      null,

    primaryAmount:
      null,

    primaryDate:
      null,

    actionRequired:
      null,

    actions:
      [],

    contradictions:
      [],

    confidence:
      0,

    reason:
      null,

    meta: {
      version:
        "2.0",

      pass:
        "unknown",

      contextual:
        false
    }
  };
}

/**
 * =====================================================
 * CLEAN TEXT
 * =====================================================
 */

function cleanText(
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
    .trim();
}

/**
 * =====================================================
 * NORMALISATION TEXTE
 * =====================================================
 */

function normalizeText(
  value
) {
  return cleanText(
    value
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[’']/g,
      "'"
    );
}

/**
 * =====================================================
 * NORMALISATION ROLE
 * =====================================================
 */

function normalizeRole(
  value
) {
  return normalizeText(
    value
  )
    .replace(
      /[\s_-]+/g,
      ""
    );
}

/**
 * =====================================================
 * NORMALISATION COMPARABLE
 * =====================================================
 */

function normalizeComparable(
  value
) {
  return normalizeText(
    value
  )
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /,/g,
      "."
    )
    .replace(
      /[.!?]+$/g,
      ""
    );
}

/**
 * =====================================================
 * CLAMP
 * =====================================================
 */

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(
      value
    );

  const safe =
    Number.isFinite(
      numeric
    )
      ? numeric
      : 0;

  return Math.max(
    min,
    Math.min(
      max,
      safe
    )
  );
}  
  return score;
}
