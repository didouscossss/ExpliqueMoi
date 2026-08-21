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
/*
 * =====================================================
 * SEMANTIC RELEVANCE
 * =====================================================
 *
 * Disponible principalement pendant PASS 2.
 *
 * Ce profil ne remplace ni les faits vérifiés,
 * ni le Consensus.
 *
 * Il apporte une information supplémentaire :
 *
 * "Quelle importance cette information a-t-elle
 * réellement pour l'utilisateur ?"
 */

const semanticRelevance =
  brain?.semanticRelevance &&
  typeof brain.semanticRelevance === "object"
    ? brain.semanticRelevance
    : null;
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
        : false,
    semanticRelevance,

semanticAvailable:
  Boolean(
    semanticRelevance
  ),

semanticPrimaryDate:
  semanticRelevance
    ?.primary
    ?.date ||
  null,

semanticPrimaryAmount:
  semanticRelevance
    ?.primary
    ?.amount ||
  null,

semanticUserActions:
  Array.isArray(
    semanticRelevance
      ?.primary
      ?.actions
  )
    ? semanticRelevance
        .primary
        .actions
    : [],

semanticIgnoredDates:
  Array.isArray(
    semanticRelevance
      ?.dates
      ?.ignored
  )
    ? semanticRelevance
        .dates
        .ignored
    : [],

semanticIgnoredAmounts:
  Array.isArray(
    semanticRelevance
      ?.amounts
      ?.ignored
  )
    ? semanticRelevance
        .amounts
        .ignored
    : [],

semanticIgnoredActions:
  Array.isArray(
    semanticRelevance
      ?.actions
      ?.ignored
  )
    ? semanticRelevance
        .actions
        .ignored
    : []
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
  return score;
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
   * 1 — SOURCES
   * =====================================================
   */

  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  const candidates = [];
/*
 * =====================================================
 * V2.1 — GARDE SEMANTIQUE DU MONTANT PRINCIPAL
 * =====================================================
 *
 * Pendant PASS 2, si Semantic Relevance est disponible,
 * Decision Engine ne doit pas fabriquer un montant
 * principal lorsque la compréhension globale du document
 * ne démontre pas qu'un montant est réellement central.
 */

if (
  context?.final &&
  context?.semanticAvailable &&
  !hasDefensibleSemanticPrimaryAmount(
    context
  )
) {
  return null;
}
  /*
   * =====================================================
   * 2 — MONTANT DE L'EVENEMENT PRINCIPAL
   * =====================================================
   */

  if (
    primaryEvent?.amount
      ?.verified === true &&
    primaryEvent?.amount
      ?.userRelevant === true
  ) {
    candidates.push({
      amount:
        primaryEvent.amount,

      eventLinked:
        true
    });
  }

  /*
   * =====================================================
   * 3 — MONTANTS BRAIN VERIFIES
   * =====================================================
   */

  for (
    const amount
    of amounts
  ) {
    if (
      amount?.verified !== true ||
      amount?.userRelevant !== true
    ) {
      continue;
    }

    candidates.push({
      amount,

      eventLinked:
        false
    });
  }

  /*
   * =====================================================
   * 4 — AUCUN MONTANT
   * =====================================================
   */

  if (
    !candidates.length
  ) {
    return null;
  }

  /*
   * =====================================================
   * 5 — DEDUPLICATION
   * =====================================================
   */

  const unique =
    deduplicateAmountCandidates(
      candidates
    );

  /*
   * =====================================================
   * 6 — SCORING
   * =====================================================
   *
   * Le score final combine :
   *
   * - confiance extraction
   * - lien avec l'événement principal
   * - compatibilité métier
   * - pertinence sémantique
   *
   * Aucun montant concret n'est codé ici.
   */

  const ranked =
    unique
      .map(
        (candidate) => {
          const semanticInfo =
            findSemanticAmountMatch({
              amount:
                candidate.amount,

              context
            });

          const semanticScore =
            scoreSemanticAmountInfluence(
              semanticInfo
            );

          return {
            ...candidate,

            semanticInfo,

            score:
              Number(
                candidate?.amount
                  ?.confidence ||
                0
              ) +
              (
                candidate.eventLinked
                  ? 15
                  : 0
              ) +
              scoreAmountForContext({
                amount:
                  candidate.amount,

                context
              }) +
              semanticScore
          };
        }
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  /*
   * =====================================================
   * 7 — REJET SEMANTIQUE
   * =====================================================
   */

const usable =
  ranked.filter(
    (candidate) => {
      if (
        shouldRejectAmountBySemanticRelevance(
          candidate.semanticInfo
        )
      ) {
        return false;
      }

      /*
       * En PASS 2, un montant principal doit également
       * disposer d'un soutien sémantique suffisamment fort.
       */

      if (
        context?.final &&
        context?.semanticAvailable &&
        !isStrongSemanticPrimaryAmount(
          candidate.semanticInfo
        )
      ) {
        return false;
      }

      return true;
    }
  );

  const winner =
    usable[0] ||
    null;

  if (
    !winner
  ) {
    return null;
  }

  /*
   * =====================================================
   * 8 — SEUIL FINAL
   * =====================================================
   */

  if (
    context.final &&
    winner.score < 80
  ) {
    return null;
  }

  /*
   * =====================================================
   * 9 — RETOUR
   * =====================================================
   */

  return {
    ...winner.amount,

    semanticRole:
      winner?.semanticInfo
        ?.role ||
      null,

    semanticScore:
      Number(
        winner?.semanticInfo
          ?.semanticScore ||
        0
      ),

    semanticRelevance:
      winner?.semanticInfo
        ?.relevance ||
      null
  };
}
/**
 * =====================================================
 * DEDUPLICATION MONTANTS
 * =====================================================
 */
/**
 * =====================================================
 * V2.1 — EXISTE-T-IL UN VRAI MONTANT PRINCIPAL ?
 * =====================================================
 */

function hasDefensibleSemanticPrimaryAmount(
  context
) {
  if (
    !context?.semanticAvailable
  ) {
    return true;
  }

  const semanticPrimary =
    context?.semanticPrimaryAmount ||
    null;

  if (
    !semanticPrimary
  ) {
    return false;
  }

  return isStrongSemanticPrimaryAmount(
    semanticPrimary
  );
}


/**
 * =====================================================
 * V2.1 — FORCE SEMANTIQUE D'UN MONTANT PRINCIPAL
 * =====================================================
 *
 * Cette fonction ne regarde jamais la valeur du montant.
 *
 * Elle cherche :
 *
 * - est-il réellement applicable ?
 * - est-il central ?
 * - est-il conditionnel ?
 * - est-il tarifaire ?
 * - est-il explicitement exigible ?
 * - son rôle est-il cohérent avec un montant principal ?
 */

function isStrongSemanticPrimaryAmount(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return false;
  }

  const role =
    normalizeRole(
      semanticInfo?.role
    );

  const relevance =
    normalizeText(
      semanticInfo?.relevance ||
      semanticInfo?.semanticRelevance
    );

  const centrality =
    normalizeRole(
      semanticInfo
        ?.centrality
        ?.level ||
      semanticInfo?.centrality
    );

  const applicability =
    normalizeRole(
      semanticInfo
        ?.applicability
        ?.level ||
      semanticInfo?.applicability
    );

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  const explicitlyDue =
    semanticInfo?.explicitlyDue ===
    true;

  const conditionalAmount =
    semanticInfo?.conditionalAmount ===
    true;

  const rateAmount =
    semanticInfo?.rateAmount ===
    true;


  /*
   * =====================================================
   * 1 — ROLES NON PRINCIPAUX
   * =====================================================
   */

  if (
    role.includes(
      "informationalamount"
    ) ||
    role.includes(
      "referenceamount"
    ) ||
    role.includes(
      "annexamount"
    )
  ) {
    return false;
  }


  /*
   * =====================================================
   * 2 — TARIF / CONDITION NON EXIGIBLE
   * =====================================================
   */

  if (
    (
      conditionalAmount ||
      rateAmount
    ) &&
    !explicitlyDue
  ) {
    return false;
  }


  /*
   * =====================================================
   * 3 — MONTANT EXPLICITEMENT DU
   * =====================================================
   *
   * C'est le signal le plus fort.
   */

  if (
    explicitlyDue &&
    semanticScore >= 65
  ) {
    return true;
  }


  /*
   * =====================================================
   * 4 — AUTRES MONTANTS CENTRAUX
   * =====================================================
   *
   * Un remboursement, une indemnité, un montant accordé,
   * etc. peuvent être centraux sans être "à payer".
   *
   * Ils doivent cependant être :
   *
   * - fortement pertinents
   * - centraux dans le document
   * - directement applicables
   */

  const strongRelevance =
    relevance === "critical" ||
    (
      relevance === "high" &&
      semanticScore >= 75
    );

  const strongCentrality =
    centrality === "core" ||
    centrality === "strong";

  const strongApplicability =
    applicability === "direct" ||
    applicability === "likely";


  if (
    strongRelevance &&
    strongCentrality &&
    strongApplicability
  ) {
    return true;
  }


  /*
   * =====================================================
   * 5 — SINON : PAS DE MONTANT PRINCIPAL DEMONTRE
   * =====================================================
   */

  return false;
}
function deduplicateAmountCandidates(
  candidates
) {
  const map =
    new Map();

  for (
    const item
    of candidates
  ) {
    const amount =
      item?.amount ||
      null;

    const rawValue =
      amount?.numeric ??
      amount?.value;

    if (
      rawValue === null ||
      rawValue === undefined
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        rawValue
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
        amount:
          chooseBetterAmount(
            existing.amount,
            amount
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
 * MEILLEURE VERSION D'UN MONTANT
 * =====================================================
 */

function chooseBetterAmount(
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
    ) +
    (
      first?.userRelevant
        ? 10
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
    ) +
    (
      second?.userRelevant
        ? 10
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
 * MATCH MONTANT <-> SEMANTIC RELEVANCE
 * =====================================================
 */

function findSemanticAmountMatch({
  amount,
  context
}) {
  if (
    !context?.semanticAvailable
  ) {
    return null;
  }

  const semanticAmounts =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.amounts
        ?.all
    )
      ? context
          .semanticRelevance
          .amounts
          .all
      : [];

  if (
    !semanticAmounts.length
  ) {
    return null;
  }

  const amountValue =
    normalizeComparable(
      amount?.numeric ??
      amount?.value
    );

  if (
    !amountValue
  ) {
    return null;
  }

  /*
   * Match prioritaire sur la valeur.
   */

  const exact =
    semanticAmounts.find(
      (item) =>
        normalizeComparable(
          item?.numeric ??
          item?.amount ??
          item?.value
        ) === amountValue
    );

  if (
    exact
  ) {
    return exact;
  }

  /*
   * Fallback contextuel.
   */

  const amountContext =
    normalizeComparable(
      [
        amount?.context,
        amount?.evidence?.quote,
        amount?.meaning,
        amount?.label
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (
    !amountContext
  ) {
    return null;
  }

  return (
    semanticAmounts.find(
      (item) => {
        const semanticContext =
          normalizeComparable(
            [
              item?.context,
              item?.sourceText,
              item?.meaning,
              item?.label
            ]
              .filter(Boolean)
              .join(" ")
          );

        if (
          !semanticContext
        ) {
          return false;
        }

        return (
          semanticContext.includes(
            amountContext
          ) ||
          amountContext.includes(
            semanticContext
          )
        );
      }
    ) ||
    null
  );
}

/**
 * =====================================================
 * SCORE INFLUENCE SEMANTIQUE MONTANT
 * =====================================================
 */

function scoreSemanticAmountInfluence(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return 0;
  }

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  const relevance =
    normalizeText(
      semanticInfo
        ?.relevance
    );

  let bonus = 0;

  if (
    semanticScore >= 85
  ) {
    bonus += 65;
  } else if (
    semanticScore >= 70
  ) {
    bonus += 40;
  } else if (
    semanticScore >= 50
  ) {
    bonus += 10;
  } else if (
    semanticScore < 30
  ) {
    bonus -= 60;
  }

  if (
    relevance ===
      "critical"
  ) {
    bonus += 30;
  } else if (
    relevance ===
      "high"
  ) {
    bonus += 20;
  } else if (
    relevance ===
      "low"
  ) {
    bonus -= 20;
  } else if (
    relevance ===
      "noise"
  ) {
    bonus -= 90;
  }

  return bonus;
}

/**
 * =====================================================
 * REJET MONTANT PAR PERTINENCE SEMANTIQUE
 * =====================================================
 */

function shouldRejectAmountBySemanticRelevance(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return false;
  }

  const role =
    normalizeRole(
      semanticInfo?.role
    );

  const relevance =
    normalizeText(
      semanticInfo?.relevance
    );

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  /*
   * Bruit explicite.
   */

  if (
    relevance === "noise"
  ) {
    return true;
  }

  /*
   * Très faible pertinence.
   */

  if (
    semanticScore > 0 &&
    semanticScore < 25
  ) {
    return true;
  }

  /*
   * Rôles génériquement secondaires.
   */

  if (
    role.includes(
      "referenceamount"
    ) ||
    role.includes(
      "annexamount"
    )
  ) {
    return true;
  }

  /*
   * Un devis n'est pas automatiquement
   * un montant dû par l'utilisateur.
   */

  if (
    role.includes(
      "quotedamount"
    ) &&
    semanticScore < 70
  ) {
    return true;
  }

  return false;
}
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
   * 1 — DATE DE L'EVENEMENT PRINCIPAL
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
   * 2 — DATES BRAIN VERIFIEES
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

  /*
   * =====================================================
   * 3 — AUCUNE DATE
   * =====================================================
   */

  if (
    !candidates.length
  ) {
    return null;
  }

  /*
   * =====================================================
   * 4 — DEDUPLICATION
   * =====================================================
   */

  const unique =
    deduplicateDateCandidates(
      candidates
    );

  /*
   * =====================================================
   * 5 — SCORING FINAL
   * =====================================================
   *
   * Le score combine :
   *
   * - confiance extraction
   * - lien avec l'événement principal
   * - compatibilité avec le contexte documentaire
   * - pertinence sémantique
   *
   * Aucun contenu concret n'est codé ici.
   */

  const ranked =
    unique
      .map(
        (candidate) => {
          const semanticInfo =
            findSemanticDateMatch({
              date:
                candidate.date,

              context
            });

          const semanticScore =
            scoreSemanticDateInfluence(
              semanticInfo
            );

          return {
            ...candidate,

            semanticInfo,

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
              }) +
              semanticScore
          };
        }
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  /*
   * =====================================================
   * 6 — REJET DES DATES SEMANTIQUEMENT IGNOREES
   * =====================================================
   *
   * Une date peut être parfaitement vraie et vérifiée,
   * mais ne pas être pertinente comme date principale.
   */

  const usable =
    ranked.filter(
      (candidate) =>
        !shouldRejectDateBySemanticRelevance(
          candidate.semanticInfo
        )
    );

  const winner =
    usable[0] ||
    null;

  if (
    !winner
  ) {
    return null;
  }

  /*
   * =====================================================
   * 7 — SEUIL FINAL
   * =====================================================
   */

  if (
    context.final &&
    winner.score < 80
  ) {
    return null;
  }

  /*
   * =====================================================
   * 8 — RETOUR
   * =====================================================
   *
   * On enrichit la date finale avec les métadonnées
   * sémantiques sans casser le format existant.
   */

  return {
    ...winner.date,

    semanticRole:
      winner?.semanticInfo
        ?.role ||
      null,

    semanticScore:
      Number(
        winner?.semanticInfo
          ?.semanticScore ||
        0
      ),

    semanticRelevance:
      winner?.semanticInfo
        ?.relevance ||
      null
  };
}
/**
 * =====================================================
 * MATCH DATE <-> SEMANTIC RELEVANCE
 * =====================================================
 */

function findSemanticDateMatch({
  date,
  context
}) {
  if (
    !context?.semanticAvailable
  ) {
    return null;
  }

  const semanticDates =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.dates
        ?.all
    )
      ? context
          .semanticRelevance
          .dates
          .all
      : [];

  if (
    !semanticDates.length
  ) {
    return null;
  }

  const dateValue =
    normalizeComparable(
      date?.value ||
      date?.date
    );

  if (
    !dateValue
  ) {
    return null;
  }

  /*
   * Match prioritaire sur la valeur de date.
   */

  const exact =
    semanticDates.find(
      (item) =>
        normalizeComparable(
          item?.value ||
          item?.date
        ) === dateValue
    );

  if (
    exact
  ) {
    return exact;
  }

  /*
   * Fallback :
   * comparaison contextuelle.
   */

  const dateContext =
    normalizeComparable(
      [
        date?.context,
        date?.evidence?.quote,
        date?.meaning,
        date?.label
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (
    !dateContext
  ) {
    return null;
  }

  return (
    semanticDates.find(
      (item) => {
        const semanticContext =
          normalizeComparable(
            [
              item?.context,
              item?.sourceText,
              item?.meaning,
              item?.label
            ]
              .filter(Boolean)
              .join(" ")
          );

        if (
          !semanticContext
        ) {
          return false;
        }

        return (
          semanticContext.includes(
            dateContext
          ) ||
          dateContext.includes(
            semanticContext
          )
        );
      }
    ) ||
    null
  );
}

/**
 * =====================================================
 * SCORE INFLUENCE SEMANTIQUE DATE
 * =====================================================
 */

function scoreSemanticDateInfluence(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return 0;
  }

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  const relevance =
    normalizeText(
      semanticInfo
        ?.relevance
    );

  let bonus = 0;

  /*
   * Score continu.
   */

  if (
    semanticScore >= 85
  ) {
    bonus += 60;
  } else if (
    semanticScore >= 70
  ) {
    bonus += 40;
  } else if (
    semanticScore >= 50
  ) {
    bonus += 10;
  } else if (
    semanticScore < 30
  ) {
    bonus -= 60;
  }

  /*
   * Classe qualitative.
   */

  if (
    relevance ===
      "critical"
  ) {
    bonus += 30;
  } else if (
    relevance ===
      "high"
  ) {
    bonus += 20;
  } else if (
    relevance ===
      "low"
  ) {
    bonus -= 20;
  } else if (
    relevance ===
      "noise"
  ) {
    bonus -= 80;
  }

  return bonus;
}

/**
 * =====================================================
 * REJET DATE PAR PERTINENCE SEMANTIQUE
 * =====================================================
 */

function shouldRejectDateBySemanticRelevance(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return false;
  }

  const role =
    normalizeRole(
      semanticInfo?.role
    );

  const relevance =
    normalizeText(
      semanticInfo?.relevance
    );

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  /*
   * =====================================================
   * BRUIT EXPLICITE
   * =====================================================
   */

  if (
    relevance === "noise"
  ) {
    return true;
  }

  /*
   * =====================================================
   * SCORE TRES FAIBLE
   * =====================================================
   */

  if (
    semanticScore > 0 &&
    semanticScore < 25
  ) {
    return true;
  }

  /*
   * =====================================================
   * ROLES QUI NE DOIVENT PAS ETRE DATE PRINCIPALE
   * =====================================================
   *
   * Important :
   * ce sont des catégories sémantiques générales,
   * pas des valeurs propres à un document.
   */

  if (
    role.includes(
      "legalreference"
    ) ||
    role.includes(
      "historical"
    ) ||
    role.includes(
      "annex"
    ) ||
    role.includes(
      "reference"
    )
  ) {
    return true;
  }

  return false;
}
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
   * 1 — CONSENSUS EXPLICITE
   * =====================================================
   *
   * Le Consensus reste prioritaire s'il a réellement
   * pris position.
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
   * 2 — SEMANTIC RELEVANCE
   * =====================================================
   */

  if (
    context?.final &&
    context?.semanticAvailable
  ) {
    const semanticActions =
      Array.isArray(
        context
          ?.semanticUserActions
      )
        ? context.semanticUserActions
        : [];

    /*
     * Action obligatoire explicite.
     */

    const required =
      semanticActions.some(
        (action) =>
          normalizeRole(
            action?.target
          ) !==
            "thirdparty" &&
          normalizeRole(
            action?.role
          ) ===
            "required" &&
          Number(
            action
              ?.semanticScore ||
            0
          ) >= 65
      );

    if (
      required
    ) {
      return true;
    }
  }

  /*
   * =====================================================
   * 3 — INTENTION
   * =====================================================
   */

  if (
    intent?.actionRequired ===
      true
  ) {
    return true;
  }

  if (
    intent?.actionRequired ===
      false
  ) {
    return false;
  }

  /*
   * =====================================================
   * 4 — EVENEMENT PRINCIPAL
   * =====================================================
   */

  if (
    primaryEvent
      ?.actionRequired ===
      true
  ) {
    return true;
  }

  if (
    primaryEvent
      ?.actionRequired ===
      false
  ) {
    return false;
  }

  /*
   * =====================================================
   * 5 — ACTIONS FINALES
   * =====================================================
   */

  const actions =
    pickUsefulActions({
      brain,
      context
    });

  /*
   * On ne considère pas automatiquement une option
   * comme une obligation.
   */

  const hasRequiredAction =
    actions.some(
      (action) => {
        const role =
          normalizeRole(
            action?.semanticRole
          );

        if (
          role === "optional"
        ) {
          return false;
        }

        if (
          role === "informational"
        ) {
          return false;
        }

        return (
          action?.required ===
            true ||
          role === "required" ||
          role === "recommended"
        );
      }
    );

  if (
    hasRequiredAction
  ) {
    return true;
  }

  /*
   * =====================================================
   * 6 — SEMANTIC RELEVANCE SANS ACTION OBLIGATOIRE
   * =====================================================
   *
   * Si le moteur sémantique a réellement analysé des
   * actions mais n'en trouve aucune obligatoire, on peut
   * conclure prudemment qu'aucune obligation principale
   * n'est démontrée.
   */

  if (
    context?.final &&
    context?.semanticAvailable
  ) {
    const allSemanticActions =
      Array.isArray(
        context
          ?.semanticRelevance
          ?.actions
          ?.all
      )
        ? context
            .semanticRelevance
            .actions
            .all
        : [];

    if (
      allSemanticActions.length
    ) {
      return false;
    }
  }

  return null;
}
  /**
 * =====================================================
 * SEMANTIC CONSISTENCY ENGINE
 * =====================================================
 *
 * Cette couche ne cherche PAS simplement :
 *
 * "Y a-t-il plusieurs valeurs différentes ?"
 *
 * Elle cherche :
 *
 * "Deux informations incompatibles prétendent-elles
 * jouer le même rôle dans le même contexte ?"
 *
 * Exemple :
 *
 * - date d'émission + date limite
 *   => pas une contradiction
 *
 * - montant total + montant remboursé
 *   => pas une contradiction
 *
 * - deux dates limites incompatibles
 *   => contradiction potentielle
 *
 * =====================================================
 */

function evaluateSemanticConsistency({
  brain,
  context,
  primaryDate,
  primaryAmount,
  actions
}) {
  const contradictions = [];

  /*
   * =====================================================
   * 1 — DATES
   * =====================================================
   */

  const dateResult =
    evaluateDateConsistency({
      context,
      primaryDate
    });

  contradictions.push(
    ...dateResult.contradictions
  );

  /*
   * =====================================================
   * 2 — MONTANTS
   * =====================================================
   */

  const amountResult =
    evaluateAmountConsistency({
      context,
      primaryAmount
    });

  contradictions.push(
    ...amountResult.contradictions
  );

  /*
   * =====================================================
   * 3 — ACTIONS
   * =====================================================
   */

  const actionResult =
    evaluateActionConsistency({
      context,
      actions
    });

  contradictions.push(
    ...actionResult.contradictions
  );

  /*
   * =====================================================
   * 4 — CONTRADICTIONS EXISTANTES DU BRAIN
   * =====================================================
   *
   * On ne les copie pas aveuglément.
   *
   * On tente d'abord de déterminer si Semantic
   * Relevance explique naturellement la différence.
   */

  const brainContradictions =
    collectExistingContradictions(
      brain
    );

  for (
    const contradiction
    of brainContradictions
  ) {
    if (
      shouldKeepExistingContradiction({
        contradiction,
        context
      })
    ) {
      contradictions.push(
        normalizeSemanticContradiction(
          contradiction
        )
      );
    }
  }

  /*
   * =====================================================
   * 5 — DEDUPLICATION
   * =====================================================
   */

  const uniqueContradictions =
    deduplicateSemanticContradictions(
      contradictions
    );

  /*
   * =====================================================
   * 6 — CONFIANCE
   * =====================================================
   */

  const confidence =
    calculateSemanticConsistencyConfidence({
      context,
      primaryDate,
      primaryAmount,
      actions,
      contradictions:
        uniqueContradictions
    });

  return {
    consistent:
      !uniqueContradictions.some(
        (item) =>
          item?.severity === "high"
      ),

    confidence,

    contradictions:
      uniqueContradictions,

    dateConsistency:
      dateResult,

    amountConsistency:
      amountResult,

    actionConsistency:
      actionResult
  };
}


/**
 * =====================================================
 * CONSISTANCE DES DATES
 * =====================================================
 */

function evaluateDateConsistency({
  context,
  primaryDate
}) {
  const semanticDates =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.dates
        ?.all
    )
      ? context
          .semanticRelevance
          .dates
          .all
      : [];

  const contradictions = [];

  /*
   * Pas assez d'informations pour comparer.
   */

  if (
    semanticDates.length < 2
  ) {
    return {
      consistent: true,
      contradictions: []
    };
  }

  /*
   * On retire le bruit sémantique.
   */

  const relevantDates =
    semanticDates.filter(
      (item) =>
        !shouldRejectDateBySemanticRelevance(
          item
        )
    );

  /*
   * On groupe les dates par ROLE.
   *
   * C'est essentiel :
   *
   * deadline != issueDate
   * eventDate != legalReferenceDate
   *
   * donc elles ne doivent pas être comparées comme
   * si elles représentaient la même chose.
   */

  const groups =
    groupSemanticItemsByRole(
      relevantDates
    );

  for (
    const [role, items]
    of Object.entries(groups)
  ) {
    /*
     * UNKNOWN n'est pas assez précis pour déclarer
     * une contradiction forte.
     */

    if (
      role === "unknown"
    ) {
      continue;
    }

    if (
      items.length < 2
    ) {
      continue;
    }

    const values =
      uniqueSemanticValues(
        items,
        getDateSemanticValue
      );

    /*
     * Plusieurs occurrences de la même date :
     * aucune contradiction.
     */

    if (
      values.length <= 1
    ) {
      continue;
    }

    /*
     * Plusieurs valeurs différentes avec exactement
     * le même rôle peuvent indiquer une contradiction.
     *
     * Mais on exige également une pertinence suffisante.
     */

    const strongItems =
      items.filter(
        (item) =>
          Number(
            item?.semanticScore ||
            0
          ) >= 65
      );

    if (
      strongItems.length < 2
    ) {
      continue;
    }

    const strongValues =
      uniqueSemanticValues(
        strongItems,
        getDateSemanticValue
      );

    if (
      strongValues.length <= 1
    ) {
      continue;
    }

    contradictions.push({
      kind:
        "date",

      role,

      severity:
        determineContradictionSeverity(
          strongItems
        ),

      values:
        strongValues,

      reason:
        "multiple_values_same_semantic_role",

      confidence:
        averageSemanticConfidence(
          strongItems
        )
    });
  }

  return {
    consistent:
      contradictions.length === 0,

    primary:
      primaryDate ||
      null,

    contradictions
  };
}


/**
 * =====================================================
 * CONSISTANCE DES MONTANTS
 * =====================================================
 */

function evaluateAmountConsistency({
  context,
  primaryAmount
}) {
  const semanticAmounts =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.amounts
        ?.all
    )
      ? context
          .semanticRelevance
          .amounts
          .all
      : [];

  const contradictions = [];

  if (
    semanticAmounts.length < 2
  ) {
    return {
      consistent: true,
      contradictions: []
    };
  }

  const relevantAmounts =
    semanticAmounts.filter(
      (item) =>
        !shouldRejectAmountBySemanticRelevance(
          item
        )
    );

  const groups =
    groupSemanticItemsByRole(
      relevantAmounts
    );

  for (
    const [role, items]
    of Object.entries(groups)
  ) {
    if (
      role === "unknown"
    ) {
      continue;
    }

    if (
      items.length < 2
    ) {
      continue;
    }

    const strongItems =
      items.filter(
        (item) =>
          Number(
            item?.semanticScore ||
            0
          ) >= 65
      );

    if (
      strongItems.length < 2
    ) {
      continue;
    }

    const values =
      uniqueSemanticValues(
        strongItems,
        getAmountSemanticValue
      );

    if (
      values.length <= 1
    ) {
      continue;
    }

    contradictions.push({
      kind:
        "amount",

      role,

      severity:
        determineContradictionSeverity(
          strongItems
        ),

      values,

      reason:
        "multiple_values_same_semantic_role",

      confidence:
        averageSemanticConfidence(
          strongItems
        )
    });
  }

  return {
    consistent:
      contradictions.length === 0,

    primary:
      primaryAmount ||
      null,

    contradictions
  };
}


/**
 * =====================================================
 * CONSISTANCE DES ACTIONS
 * =====================================================
 */

function evaluateActionConsistency({
  context,
  actions
}) {
  const semanticActions =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.actions
        ?.all
    )
      ? context
          .semanticRelevance
          .actions
          .all
      : [];

  const contradictions = [];

  /*
   * Ici on ne considère PAS plusieurs actions
   * différentes comme contradictoires.
   *
   * Un document peut parfaitement demander :
   *
   * - envoyer un document
   * - effectuer un paiement
   * - se présenter à un rendez-vous
   *
   * simultanément.
   */

  const userActions =
    semanticActions.filter(
      (item) =>
        normalizeRole(
          item?.target
        ) === "user" &&
        !shouldRejectActionBySemanticRelevance(
          item
        )
    );

  /*
   * On recherche seulement les cas où une même action
   * semble à la fois obligatoire et facultative.
   */

  for (
    let i = 0;
    i < userActions.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < userActions.length;
      j++
    ) {
      const first =
        userActions[i];

      const second =
        userActions[j];

      if (
        !areActionsSemanticallyEquivalent(
          first,
          second
        )
      ) {
        continue;
      }

      const firstRole =
        normalizeRole(
          first?.role
        );

      const secondRole =
        normalizeRole(
          second?.role
        );

      if (
        areActionRolesInConflict(
          firstRole,
          secondRole
        )
      ) {
        contradictions.push({
          kind:
            "action",

          role:
            "userAction",

          severity:
            "medium",

          values: [
            cleanText(
              first?.text ||
              first?.action
            ),

            cleanText(
              second?.text ||
              second?.action
            )
          ],

          reason:
            "conflicting_action_requirement",

          confidence:
            Math.round(
              (
                Number(
                  first?.semanticScore ||
                  0
                ) +
                Number(
                  second?.semanticScore ||
                  0
                )
              ) /
              2
            )
        });
      }
    }
  }

  return {
    consistent:
      contradictions.length === 0,

    actions:
      Array.isArray(actions)
        ? actions
        : [],

    contradictions
  };
}


/**
 * =====================================================
 * GROUPER PAR ROLE SEMANTIQUE
 * =====================================================
 */

function groupSemanticItemsByRole(
  items
) {
  const groups = {};

  for (
    const item
    of items
  ) {
    const role =
      normalizeRole(
        item?.role
      ) ||
      "unknown";

    if (
      !groups[role]
    ) {
      groups[role] = [];
    }

    groups[role].push(
      item
    );
  }

  return groups;
}


/**
 * =====================================================
 * VALEUR SEMANTIQUE DATE
 * =====================================================
 */

function getDateSemanticValue(
  item
) {
  return cleanText(
    item?.value ||
    item?.date
  );
}


/**
 * =====================================================
 * VALEUR SEMANTIQUE MONTANT
 * =====================================================
 */

function getAmountSemanticValue(
  item
) {
  const value =
    item?.numeric ??
    item?.amount ??
    item?.value;

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return cleanText(
    value
  );
}


/**
 * =====================================================
 * VALEURS UNIQUES
 * =====================================================
 */

function uniqueSemanticValues(
  items,
  valueGetter
) {
  const map =
    new Map();

  for (
    const item
    of items
  ) {
    const value =
      valueGetter(
        item
      );

    const key =
      normalizeComparable(
        value
      );

    if (
      !key
    ) {
      continue;
    }

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        value
      );
    }
  }

  return Array.from(
    map.values()
  );
}


/**
 * =====================================================
 * SEVERITE D'UNE CONTRADICTION
 * =====================================================
 */

function determineContradictionSeverity(
  items
) {
  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    return "low";
  }

  const strong =
    items.filter(
      (item) =>
        Number(
          item?.semanticScore ||
          0
        ) >= 80 &&
        (
          normalizeText(
            item?.relevance
          ) === "critical" ||
          normalizeText(
            item?.relevance
          ) === "high"
        )
    );

  if (
    strong.length >= 2
  ) {
    return "high";
  }

  const medium =
    items.filter(
      (item) =>
        Number(
          item?.semanticScore ||
          0
        ) >= 65
    );

  if (
    medium.length >= 2
  ) {
    return "medium";
  }

  return "low";
}


/**
 * =====================================================
 * CONFIANCE MOYENNE
 * =====================================================
 */

function averageSemanticConfidence(
  items
) {
  if (
    !Array.isArray(items) ||
    !items.length
  ) {
    return 0;
  }

  const values =
    items
      .map(
        (item) =>
          Number(
            item?.semanticScore ||
            item?.confidence ||
            0
          )
      )
      .filter(
        Number.isFinite
      );

  if (
    !values.length
  ) {
    return 0;
  }

  return Math.round(
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}


/**
 * =====================================================
 * EQUIVALENCE APPROXIMATIVE ENTRE ACTIONS
 * =====================================================
 */

function areActionsSemanticallyEquivalent(
  first,
  second
) {
  const firstText =
    normalizeComparable(
      first?.text ||
      first?.action
    );

  const secondText =
    normalizeComparable(
      second?.text ||
      second?.action
    );

  if (
    !firstText ||
    !secondText
  ) {
    return false;
  }

  if (
    firstText ===
    secondText
  ) {
    return true;
  }

  /*
   * Inclusion uniquement sur des textes suffisamment
   * longs pour limiter les faux positifs.
   */

  if (
    firstText.length >= 20 &&
    secondText.length >= 20
  ) {
    return (
      firstText.includes(
        secondText
      ) ||
      secondText.includes(
        firstText
      )
    );
  }

  return false;
}


/**
 * =====================================================
 * CONFLIT ENTRE ROLES D'ACTION
 * =====================================================
 */

function areActionRolesInConflict(
  firstRole,
  secondRole
) {
  const pair =
    new Set([
      firstRole,
      secondRole
    ]);

  /*
   * Une même action ne devrait normalement pas être
   * simultanément obligatoire et facultative.
   */

  if (
    pair.has("required") &&
    pair.has("optional")
  ) {
    return true;
  }

  return false;
}


/**
 * =====================================================
 * CONTRADICTIONS EXISTANTES
 * =====================================================
 */

function collectExistingContradictions(
  brain
) {
  const result = [];

  const sources = [
    brain?.contradictions,
    brain?.verification
      ?.contradictions,
    brain?.consensus
      ?.contradictions
  ];

  for (
    const source
    of sources
  ) {
    if (
      Array.isArray(source)
    ) {
      result.push(
        ...source
      );
    }
  }

  return result;
}


/**
 * =====================================================
 * FAUT-IL CONSERVER UNE ANCIENNE CONTRADICTION ?
 * =====================================================
 */

function shouldKeepExistingContradiction({
  contradiction,
  context
}) {
  if (
    !contradiction
  ) {
    return false;
  }

  /*
   * Sans Semantic Relevance, on ne prétend pas
   * pouvoir réinterpréter l'ancienne contradiction.
   */

  if (
    !context?.semanticAvailable
  ) {
    return true;
  }

  const kind =
    normalizeRole(
      contradiction?.kind ||
      contradiction?.type
    );

  /*
   * =====================================================
   * CONTRADICTION DE DATES
   * =====================================================
   */

  if (
    kind.includes("date")
  ) {
    const semanticDates =
      Array.isArray(
        context
          ?.semanticRelevance
          ?.dates
          ?.all
      )
        ? context
            .semanticRelevance
            .dates
            .all
        : [];

    if (
      semanticDates.length >= 2 &&
      semanticDatesExplainDifferences(
        semanticDates
      )
    ) {
      return false;
    }
  }

  /*
   * =====================================================
   * CONTRADICTION DE MONTANTS
   * =====================================================
   */

  if (
    kind.includes("amount") ||
    kind.includes("montant")
  ) {
    const semanticAmounts =
      Array.isArray(
        context
          ?.semanticRelevance
          ?.amounts
          ?.all
      )
        ? context
            .semanticRelevance
            .amounts
            .all
        : [];

    if (
      semanticAmounts.length >= 2 &&
      semanticAmountsExplainDifferences(
        semanticAmounts
      )
    ) {
      return false;
    }
  }

  return true;
}


/**
 * =====================================================
 * LES ROLES EXPLIQUENT-ILS LES DIFFERENTES DATES ?
 * =====================================================
 */

function semanticDatesExplainDifferences(
  dates
) {
  const relevant =
    dates.filter(
      (item) =>
        !shouldRejectDateBySemanticRelevance(
          item
        )
    );

  if (
    relevant.length < 2
  ) {
    /*
     * Si toutes les autres dates sont du bruit,
     * il n'y a pas de contradiction utile.
     */
    return true;
  }

  const roles =
    new Set(
      relevant
        .map(
          (item) =>
            normalizeRole(
              item?.role
            )
        )
        .filter(
          (role) =>
            role &&
            role !== "unknown"
        )
    );

  /*
   * Plusieurs rôles distincts expliquent naturellement
   * la présence de plusieurs dates.
   */

  return (
    roles.size >= 2
  );
}


/**
 * =====================================================
 * LES ROLES EXPLIQUENT-ILS LES DIFFERENTS MONTANTS ?
 * =====================================================
 */

function semanticAmountsExplainDifferences(
  amounts
) {
  const relevant =
    amounts.filter(
      (item) =>
        !shouldRejectAmountBySemanticRelevance(
          item
        )
    );

  if (
    relevant.length < 2
  ) {
    return true;
  }

  const roles =
    new Set(
      relevant
        .map(
          (item) =>
            normalizeRole(
              item?.role
            )
        )
        .filter(
          (role) =>
            role &&
            role !== "unknown"
        )
    );

  return (
    roles.size >= 2
  );
}


/**
 * =====================================================
 * NORMALISATION CONTRADICTION
 * =====================================================
 */

function normalizeSemanticContradiction(
  contradiction
) {
  if (
    typeof contradiction ===
    "string"
  ) {
    return {
      kind:
        "unknown",

      role:
        "unknown",

      severity:
        "medium",

      values:
        [],

      reason:
        cleanText(
          contradiction
        ),

      confidence:
        50,

      source:
        "legacy"
    };
  }

  return {
    kind:
      contradiction?.kind ||
      contradiction?.type ||
      "unknown",

    role:
      contradiction?.role ||
      "unknown",

    severity:
      contradiction?.severity ||
      "medium",

    values:
      Array.isArray(
        contradiction?.values
      )
        ? contradiction.values
        : [],

    reason:
      cleanText(
        contradiction?.reason ||
        contradiction?.message
      ),

    confidence:
      Number(
        contradiction?.confidence ||
        50
      ),

    source:
      contradiction?.source ||
      "legacy"
  };
}


/**
 * =====================================================
 * DEDUPLICATION CONTRADICTIONS
 * =====================================================
 */

function deduplicateSemanticContradictions(
  contradictions
) {
  const seen =
    new Set();

  const result = [];

  for (
    const item
    of contradictions
  ) {
    const normalized =
      normalizeSemanticContradiction(
        item
      );

    const values =
      Array.isArray(
        normalized?.values
      )
        ? normalized.values
            .map(
              normalizeComparable
            )
            .sort()
            .join("|")
        : "";

    const key =
      [
        normalizeRole(
          normalized?.kind
        ),

        normalizeRole(
          normalized?.role
        ),

        normalizeComparable(
          normalized?.reason
        ),

        values
      ].join("::");

    if (
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

  return result;
}


/**
 * =====================================================
 * CONFIANCE SEMANTIQUE FINALE
 * =====================================================
 */

function calculateSemanticConsistencyConfidence({
  context,
  primaryDate,
  primaryAmount,
  actions,
  contradictions
}) {
  /*
   * Base neutre.
   */

  let score = 70;

  /*
   * Semantic Relevance disponible.
   */

  if (
    context?.semanticAvailable
  ) {
    score += 5;
  }

  /*
   * Les informations principales sont soutenues
   * sémantiquement.
   */

  if (
    Number(
      primaryDate?.semanticScore ||
      0
    ) >= 70
  ) {
    score += 5;
  }

  if (
    Number(
      primaryAmount?.semanticScore ||
      0
    ) >= 70
  ) {
    score += 5;
  }

  const strongActions =
    Array.isArray(actions)
      ? actions.filter(
          (action) =>
            Number(
              action?.semanticScore ||
              0
            ) >= 70
        )
      : [];

  if (
    strongActions.length
  ) {
    score += 5;
  }

  /*
   * Les contradictions diminuent la confiance
   * proportionnellement à leur gravité.
   */

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
      score -= 10;
    } else {
      score -= 3;
    }
  }

  return clampDecisionScore(
    score
  );
}


/**
 * =====================================================
 * CLAMP LOCAL
 * =====================================================
 */

function clampDecisionScore(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(number)
    )
  );
}
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

  /*
   * =====================================================
   * PASS 1
   * =====================================================
   *
   * Semantic Relevance n'existe pas encore.
   *
   * On reste volontairement conservateur et
   * on conserve le comportement historique simple.
   */

  if (
    !context?.final ||
    !context?.semanticAvailable
  ) {
    for (
      const action
      of actions
    ) {
      const text =
        cleanText(
          action?.action
        );

      if (
        !text ||
        Number(
          action?.confidence ||
          0
        ) < 70 ||
        !isUsefulAction(
          text
        )
      ) {
        continue;
      }

      const key =
        normalizeComparable(
          text
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

      result.push({
        ...action,

        action:
          text,

        source:
          action?.source ||
          "didou-brain"
      });
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
        3
      );
  }

  /*
   * =====================================================
   * PASS 2
   * =====================================================
   *
   * On confronte chaque action Brain
   * à Semantic Relevance.
   */

  for (
    const action
    of actions
  ) {
    const original =
      cleanText(
        action?.action
      );

    if (
      !original
    ) {
      continue;
    }

    /*
     * Une mauvaise extraction ne devient pas
     * une bonne action uniquement grâce au moteur
     * sémantique.
     */

    if (
      Number(
        action?.confidence ||
        0
      ) < 60
    ) {
      continue;
    }

    if (
      !isUsefulAction(
        original
      )
    ) {
      continue;
    }

    const semanticInfo =
      findSemanticActionMatch({
        action,
        context
      });

    /*
     * Si Semantic Relevance connaît cette action,
     * il devient un signal important de sélection.
     */

    if (
      semanticInfo &&
      shouldRejectActionBySemanticRelevance(
        semanticInfo
      )
    ) {
      continue;
    }

    const semanticInfluence =
      scoreSemanticActionInfluence(
        semanticInfo
      );

    const finalScore =
      Number(
        action?.confidence ||
        0
      ) +
      semanticInfluence;

    /*
     * Une action peu convaincante n'est pas présentée
     * comme action utilisateur principale.
     */

    if (
      finalScore < 75
    ) {
      continue;
    }

    const normalized =
      buildSemanticDecisionAction({
        action,
        semanticInfo,
        finalScore
      });

    if (
      !normalized?.action
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

  /*
   * =====================================================
   * ACTIONS SEMANTIQUES NON RETROUVEES DANS BRAIN
   * =====================================================
   *
   * Cela permet à Semantic Relevance de conserver
   * une action pertinente issue d'une autre source
   * analysée, sans inventer d'action.
   */

  const semanticUserActions =
    Array.isArray(
      context
        ?.semanticUserActions
    )
      ? context.semanticUserActions
      : [];

  for (
    const semanticAction
    of semanticUserActions
  ) {
    if (
      shouldRejectActionBySemanticRelevance(
        semanticAction
      )
    ) {
      continue;
    }

    const text =
      cleanText(
        semanticAction?.text ||
        semanticAction?.action
      );

    if (
      !text
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        text
      );

    if (
      !key ||
      seen.has(
        key
      )
    ) {
      continue;
    }

    const score =
      Number(
        semanticAction
          ?.semanticScore ||
        0
      );

    if (
      score < 65
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push({
      action:
        text,

      how:
        cleanText(
          semanticAction?.how
        ),

      confidence:
        Math.min(
          98,
          Math.max(
            Number(
              semanticAction
                ?.confidence ||
              0
            ),
            score
          )
        ),

      semanticRole:
        semanticAction?.role ||
        null,

      semanticTarget:
        semanticAction?.target ||
        null,

      semanticScore:
        score,

      semanticRelevance:
        semanticAction
          ?.relevance ||
        null,

      required:
        normalizeRole(
          semanticAction?.role
        ) === "required",

      source:
        "didou-semantic-relevance"
    });
  }

  return result
    .sort(
      compareDecisionActions
    )
    .slice(
      0,
      3
    );
}
/**
 * =====================================================
 * MATCH ACTION <-> SEMANTIC RELEVANCE
 * =====================================================
 */

function findSemanticActionMatch({
  action,
  context
}) {
  if (
    !context?.semanticAvailable
  ) {
    return null;
  }

  const semanticActions =
    Array.isArray(
      context
        ?.semanticRelevance
        ?.actions
        ?.all
    )
      ? context
          .semanticRelevance
          .actions
          .all
      : [];

  if (
    !semanticActions.length
  ) {
    return null;
  }

  const actionText =
    normalizeComparable(
      action?.action
    );

  if (
    !actionText
  ) {
    return null;
  }

  /*
   * =====================================================
   * MATCH EXACT
   * =====================================================
   */

  const exact =
    semanticActions.find(
      (item) =>
        normalizeComparable(
          item?.text ||
          item?.action
        ) === actionText
    );

  if (
    exact
  ) {
    return exact;
  }

  /*
   * =====================================================
   * MATCH TEXTUEL APPROXIMATIF
   * =====================================================
   *
   * On exige une longueur minimale pour éviter
   * qu'un mot très court provoque un faux match.
   */

  if (
    actionText.length >= 20
  ) {
    const similar =
      semanticActions.find(
        (item) => {
          const semanticText =
            normalizeComparable(
              item?.text ||
              item?.action
            );

          if (
            !semanticText ||
            semanticText.length < 20
          ) {
            return false;
          }

          return (
            semanticText.includes(
              actionText
            ) ||
            actionText.includes(
              semanticText
            )
          );
        }
      );

    if (
      similar
    ) {
      return similar;
    }
  }

  /*
   * =====================================================
   * MATCH CONTEXTUEL
   * =====================================================
   */

  const actionContext =
    normalizeComparable(
      [
        action?.context,
        action?.meaning,
        action?.evidence?.quote
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (
    !actionContext
  ) {
    return null;
  }

  return (
    semanticActions.find(
      (item) => {
        const semanticContext =
          normalizeComparable(
            [
              item?.context,
              item?.meaning,
              item?.sourceText
            ]
              .filter(Boolean)
              .join(" ")
          );

        if (
          !semanticContext
        ) {
          return false;
        }

        return (
          semanticContext.includes(
            actionContext
          ) ||
          actionContext.includes(
            semanticContext
          )
        );
      }
    ) ||
    null
  );
}

/**
 * =====================================================
 * SCORE SEMANTIQUE ACTION
 * =====================================================
 */

function scoreSemanticActionInfluence(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return 0;
  }

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  const relevance =
    normalizeText(
      semanticInfo?.relevance
    );

  const role =
    normalizeRole(
      semanticInfo?.role
    );

  const target =
    normalizeRole(
      semanticInfo?.target
    );

  const flags =
    semanticInfo
      ?.contextFlags ||
    {};

  let bonus = 0;

  /*
   * =====================================================
   * SCORE CONTINU
   * =====================================================
   */

  if (
    semanticScore >= 85
  ) {
    bonus += 55;
  } else if (
    semanticScore >= 70
  ) {
    bonus += 35;
  } else if (
    semanticScore >= 50
  ) {
    bonus += 5;
  } else if (
    semanticScore < 30
  ) {
    bonus -= 55;
  }

  /*
   * =====================================================
   * PERTINENCE
   * =====================================================
   */

  if (
    relevance === "critical"
  ) {
    bonus += 25;
  } else if (
    relevance === "high"
  ) {
    bonus += 15;
  } else if (
    relevance === "low"
  ) {
    bonus -= 20;
  } else if (
    relevance === "noise"
  ) {
    bonus -= 100;
  }

  /*
   * =====================================================
   * CIBLE
   * =====================================================
   */

  if (
    target === "user"
  ) {
    bonus += 20;
  }

  if (
    target === "thirdparty"
  ) {
    bonus -= 100;
  }

  /*
   * =====================================================
   * ROLE
   * =====================================================
   */

  if (
    role === "required"
  ) {
    bonus += 20;
  }

  if (
    role === "recommended"
  ) {
    bonus += 10;
  }

  if (
    role === "optional"
  ) {
    bonus -= 5;
  }

  if (
    role === "informational"
  ) {
    bonus -= 35;
  }

  /*
   * =====================================================
   * CONTEXTE SECONDAIRE
   * =====================================================
   *
   * Une annexe n'est pas automatiquement ignorée :
   * certaines annexes contiennent de vraies obligations.
   *
   * On applique seulement une pénalité.
   */

  if (
    flags?.annex === true
  ) {
    bonus -= 20;
  }

  if (
    flags?.reference === true
  ) {
    bonus -= 20;
  }

  return bonus;
}

/**
 * =====================================================
 * REJET SEMANTIQUE ACTION
 * =====================================================
 */

function shouldRejectActionBySemanticRelevance(
  semanticInfo
) {
  if (
    !semanticInfo
  ) {
    return false;
  }

  const relevance =
    normalizeText(
      semanticInfo?.relevance
    );

  const target =
    normalizeRole(
      semanticInfo?.target
    );

  const role =
    normalizeRole(
      semanticInfo?.role
    );

  const semanticScore =
    Number(
      semanticInfo
        ?.semanticScore ||
      0
    );

  /*
   * =====================================================
   * ACTION DESTINEE A UN TIERS
   * =====================================================
   */

  if (
    target === "thirdparty"
  ) {
    return true;
  }

  /*
   * =====================================================
   * BRUIT
   * =====================================================
   */

  if (
    relevance === "noise"
  ) {
    return true;
  }

  /*
   * =====================================================
   * INFORMATION, PAS ACTION
   * =====================================================
   */

  if (
    role === "informational"
  ) {
    return true;
  }

  /*
   * =====================================================
   * SCORE EXTREMEMENT FAIBLE
   * =====================================================
   */

  if (
    semanticScore > 0 &&
    semanticScore < 25
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * CONSTRUCTION ACTION DECISION
 * =====================================================
 */

function buildSemanticDecisionAction({
  action,
  semanticInfo,
  finalScore
}) {
  const text =
    cleanText(
      action?.action
    );

  if (
    !text
  ) {
    return null;
  }

  const semanticRole =
    semanticInfo?.role ||
    null;

  const semanticTarget =
    semanticInfo?.target ||
    null;

  return {
    action:
      text,

    how:
      cleanText(
        action?.how
      ),

    confidence:
      Math.min(
        98,
        Math.max(
          Number(
            action?.confidence ||
            0
          ),
          Number(
            semanticInfo
              ?.semanticScore ||
            0
          ),
          Math.min(
            98,
            finalScore
          )
        )
      ),

    semanticRole,

    semanticTarget,

    semanticScore:
      Number(
        semanticInfo
          ?.semanticScore ||
        0
      ),

    semanticRelevance:
      semanticInfo
        ?.relevance ||
      null,

    required:
      normalizeRole(
        semanticRole
      ) === "required",

    source:
      semanticInfo
        ? "didou-semantic-decision"
        : (
            action?.source ||
            "didou-brain"
          )
  };
}

/**
 * =====================================================
 * TRI ACTIONS
 * =====================================================
 */

function compareDecisionActions(
  first,
  second
) {
  const firstRole =
    normalizeRole(
      first?.semanticRole
    );

  const secondRole =
    normalizeRole(
      second?.semanticRole
    );

  const priority = {
    required:
      4,

    recommended:
      3,

    conditional:
      2,

    optional:
      1,

    unknown:
      0
  };

  const firstPriority =
    priority[firstRole] ??
    0;

  const secondPriority =
    priority[secondRole] ??
    0;

  if (
    firstPriority !==
    secondPriority
  ) {
    return (
      secondPriority -
      firstPriority
    );
  }

  const firstSemantic =
    Number(
      first?.semanticScore ||
      0
    );

  const secondSemantic =
    Number(
      second?.semanticScore ||
      0
    );

  if (
    firstSemantic !==
    secondSemantic
  ) {
    return (
      secondSemantic -
      firstSemantic
    );
  }

  return (
    Number(
      second?.confidence ||
      0
    ) -
    Number(
      first?.confidence ||
      0
    )
  );
}
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
