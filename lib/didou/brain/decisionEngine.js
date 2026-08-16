/**
 * Didou Brain
 * Decision Engine V1
 *
 * Objectif :
 * prendre une décision générale à partir du Brain
 * et de son Knowledge Graph.
 *
 * Le moteur répond à :
 * - quelle est la situation principale ?
 * - quel est le montant principal ?
 * - quelle est la date principale ?
 * - une action est-elle réellement nécessaire ?
 * - quel est le niveau de confiance ?
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
   * 1 — INTENTION
   * =====================================================
   */

  const intent =
    brain?.intent ||
    null;

  if (
    intent &&
    Number(
      intent?.confidence || 0
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
          intent.confidence || 0
        )
    };
  }

  /*
   * =====================================================
   * 2 — SITUATION PRINCIPALE
   * =====================================================
   */

  const primaryEvent =
    pickPrimaryEvent(
      brain
    );

  if (
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
        )
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
          intent.confidence || 0
        )
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
      primaryEvent
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
        )
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
      primaryEvent
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
        null,

      confidence:
        Number(
          primaryDate.confidence ||
          0
        ),

      verified:
        Boolean(
          primaryDate.verified
        )
    };
  }

  /*
   * =====================================================
   * 5 — ACTION
   * =====================================================
   */

  decision.actionRequired =
    determineActionRequired({
      brain,
      intent,
      primaryEvent
    });

  decision.actions =
    pickUsefulActions(
      brain
    );

  /*
   * =====================================================
   * 6 — CONTRADICTIONS
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
   * 7 — CONFIANCE
   * =====================================================
   */

  decision.confidence =
    calculateDecisionConfidence({
      brain,
      decision,
      primaryEvent
    });

  /*
   * =====================================================
   * 8 — EXPLICATION INTERNE
   * =====================================================
   */

  decision.reason =
    buildDecisionReason(
      decision
    );

  return decision;
}

/**
 * =====================================================
 * EVENT PRINCIPAL
 * =====================================================
 */

function pickPrimaryEvent(
  brain
) {
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
            )
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

function scoreEvent(
  event
) {
  let score =
    Number(
      event?.confidence || 0
    );

  if (
    event?.verified === true
  ) {
    score += 20;
  }

  if (
    event?.amount?.verified ===
      true &&
    event?.amount?.userRelevant ===
      true
  ) {
    score += 15;
  }

  if (
    event?.date?.verified ===
      true &&
    event?.date?.userRelevant ===
      true
  ) {
    score += 10;
  }

  const type =
    String(
      event?.type || ""
    );

  if (
    type === "refund"
  ) {
    score += 15;
  }

  if (
    type === "automatic_debit"
  ) {
    score += 14;
  }

  if (
    type === "payment_due"
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
 * MONTANT PRINCIPAL
 * =====================================================
 */

function pickPrimaryAmount({
  brain,
  primaryEvent
}) {
  /*
   * Montant directement lié à l'événement principal.
   */

  if (
    primaryEvent?.amount?.verified ===
      true &&
    primaryEvent?.amount?.userRelevant ===
      true
  ) {
    return primaryEvent.amount;
  }

  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  return (
    amounts
      .filter(
        (amount) =>
          amount?.verified === true &&
          amount?.userRelevant === true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
}

/**
 * =====================================================
 * DATE PRINCIPALE
 * =====================================================
 */

function pickPrimaryDate({
  brain,
  primaryEvent
}) {
  if (
    primaryEvent?.date?.verified ===
      true &&
    primaryEvent?.date?.userRelevant ===
      true
  ) {
    return primaryEvent.date;
  }

  const dates =
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : [];

  return (
    dates
      .filter(
        (date) =>
          date?.verified === true &&
          date?.userRelevant === true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
}

/**
 * =====================================================
 * ACTION REQUISE ?
 * =====================================================
 */

function determineActionRequired({
  brain,
  intent,
  primaryEvent
}) {
  /*
   * Intention explicite.
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
   * Event explicite.
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
   * Actions vérifiées.
   */

  const actions =
    pickUsefulActions(
      brain
    );

  if (
    actions.length
  ) {
    return true;
  }

  /*
   * Attestation / preuve.
   */

  if (
    intent?.type ===
      "proof"
  ) {
    return false;
  }

  /*
   * Notification.
   */

  if (
    intent?.type ===
      "notification"
  ) {
    return false;
  }

  return null;
}

/**
 * =====================================================
 * ACTIONS UTILES
 * =====================================================
 */

function pickUsefulActions(
  brain
) {
  const actions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : [];

  return actions
    .filter(
      (action) =>
        Number(
          action?.confidence || 0
        ) >= 70
    )
    .filter(
      (action) =>
        isUsefulAction(
          action?.action
        )
    )
    .sort(
      (a, b) =>
        Number(
          b?.confidence || 0
        ) -
        Number(
          a?.confidence || 0
        )
    )
    .slice(
      0,
      3
    );
}

function isUsefulAction(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (!text) {
    return false;
  }

  if (
    /merci de votre confiance|merci pour votre confiance/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /ne pas tenir compte|ne pas en tenir compte/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /si vous avez besoin|si besoin|si necessaire/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateDecisionConfidence({
  brain,
  decision,
  primaryEvent
}) {
  let score =
    Number(
      brain?.score?.global ||
      0
    );

  /*
   * Intent fort.
   */

  if (
    Number(
      decision?.intent
        ?.confidence || 0
    ) >= 85
  ) {
    score += 8;
  }

  /*
   * Event fort.
   */

  if (
    Number(
      primaryEvent?.confidence ||
      0
    ) >= 85
  ) {
    score += 8;
  }

  /*
   * Montant vérifié.
   */

  if (
    decision?.primaryAmount
      ?.verified
  ) {
    score += 7;
  }

  /*
   * Date vérifiée.
   */

  if (
    decision?.primaryDate
      ?.verified
  ) {
    score += 5;
  }

  /*
   * Contradictions.
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

function buildDecisionReason(
  decision
) {
  const situation =
    decision?.primarySituation
      ?.type ||
    decision?.intent?.type ||
    null;

  if (
    situation ===
    "refund"
  ) {
    return (
      "Didou considère qu’un remboursement constitue l’information principale."
    );
  }

  if (
    situation ===
    "automatic_debit"
  ) {
    return (
      "Didou considère qu’un prélèvement automatique constitue l’information principale."
    );
  }

  if (
    situation ===
    "payment_due"
  ) {
    return (
      "Didou considère qu’un paiement à effectuer constitue l’information principale."
    );
  }

  if (
    situation ===
    "meeting"
  ) {
    return (
      "Didou considère qu’une réunion ou convocation constitue l’information principale."
    );
  }

  if (
    situation ===
    "proof"
  ) {
    return (
      "Didou considère que le document sert principalement de preuve ou d’attestation."
    );
  }

  if (
    situation ===
    "contract"
  ) {
    return (
      "Didou considère que le document définit principalement une relation contractuelle."
    );
  }

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
      null
  };
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function normalizeText(
  value
) {
  return String(
    value || ""
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
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

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
