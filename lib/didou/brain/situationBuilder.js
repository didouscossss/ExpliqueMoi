/**
 * Didou Brain
 * Situation Builder V1
 *
 * Objectif :
 * transformer les événements détectés
 * en une situation documentaire principale.
 *
 * Exemples :
 * - refund
 * - automatic_debit
 * - payment_due
 * - meeting
 * - tax_declaration
 * - request
 * - information
 */

import {
  EVENT_TYPES
} from "./schema.js";

/**
 * =====================================================
 * POINT D'ENTRÉE
 * =====================================================
 */

export function buildSituation({
  events = [],
  brain = null
} = {}) {
  const list =
    Array.isArray(events)
      ? events
      : [];

  if (!list.length) {
    return buildFallbackSituation(
      brain
    );
  }

  /*
   * On classe les événements selon :
   *
   * - importance utilisateur ;
   * - vérification ;
   * - confiance ;
   * - priorité métier.
   */

  const ranked =
    list
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

  const winner =
    ranked[0];

  if (
    !winner ||
    winner.score < 45
  ) {
    return buildFallbackSituation(
      brain
    );
  }

  return {
    type:
      winner.event?.type ||
      EVENT_TYPES.UNKNOWN,

    label:
      winner.event?.label ||
      situationLabel(
        winner.event?.type
      ),

    confidence:
      clamp(
        winner.score,
        0,
        98
      ),

    verified:
      Boolean(
        winner.event?.verified
      ),

    event:
      winner.event,

    alternatives:
      ranked
        .slice(1, 4)
        .map(
          (item) => ({
            type:
              item.event?.type ||
              EVENT_TYPES.UNKNOWN,

            label:
              item.event?.label ||
              situationLabel(
                item.event?.type
              ),

            confidence:
              clamp(
                item.score,
                0,
                98
              )
          })
        )
  };
}

/**
 * =====================================================
 * SCORE ÉVÉNEMENT
 * =====================================================
 */

function scoreEvent(
  event
) {
  if (!event) {
    return 0;
  }

  let score =
    Number(
      event?.confidence || 0
    );

  const type =
    event?.type ||
    EVENT_TYPES.UNKNOWN;

  /*
   * ===================================================
   * PRIORITÉ MÉTIER
   * ===================================================
   */

  switch (type) {
    case EVENT_TYPES.REFUND:
      score += 35;
      break;

    case EVENT_TYPES.AUTOMATIC_DEBIT:
      score += 32;
      break;

    case EVENT_TYPES.PAYMENT_DUE:
      score += 30;
      break;

    case EVENT_TYPES.MEETING:
      score += 28;
      break;

    case EVENT_TYPES.DEADLINE:
      score += 25;
      break;

    case EVENT_TYPES.REQUEST:
      score += 20;
      break;

    case EVENT_TYPES.TAX_DECLARATION:
      score += 18;
      break;

    case EVENT_TYPES.DECISION:
      score += 18;
      break;

    case EVENT_TYPES.INFORMATION:
      score += 5;
      break;

    default:
      break;
  }

  /*
   * ===================================================
   * ÉVÉNEMENT VÉRIFIÉ
   * ===================================================
   */

  if (
    event?.verified === true
  ) {
    score += 20;
  }

  if (
    event?.verificationState ===
      "probable"
  ) {
    score += 8;
  }

  if (
    event?.verificationState ===
      "unverified"
  ) {
    score -= 15;
  }

  /*
   * ===================================================
   * MONTANT
   * ===================================================
   */

  if (
    event?.amount?.verified ===
      true &&
    event?.amount?.userRelevant ===
      true
  ) {
    score += 20;
  }

  if (
    event?.amount?.verificationState ===
      "contradicted"
  ) {
    score -= 45;
  }

  /*
   * ===================================================
   * DATE
   * ===================================================
   */

  if (
    event?.date?.verified ===
      true &&
    event?.date?.userRelevant ===
      true
  ) {
    score += 12;
  }

  /*
   * ===================================================
   * ACTION UTILISATEUR
   * ===================================================
   */

  if (
    event?.actionRequired === true
  ) {
    score += 8;
  }

  /*
   * Un remboursement ou prélèvement
   * n'exige généralement pas une action manuelle.
   */
  if (
    event?.actionRequired === false &&
    (
      type === EVENT_TYPES.REFUND ||
      type === EVENT_TYPES.AUTOMATIC_DEBIT
    )
  ) {
    score += 5;
  }

  return clamp(
    score,
    0,
    100
  );
}

/**
 * =====================================================
 * FALLBACK
 * =====================================================
 */

function buildFallbackSituation(
  brain
) {
  /*
   * Une action explicite existe,
   * mais aucun événement spécialisé.
   */

  const actions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : [];

  const bestAction =
    actions
      .filter(
        (action) =>
          Number(
            action?.confidence || 0
          ) >= 65
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0];

  if (bestAction) {
    return {
      type:
        EVENT_TYPES.REQUEST,

      label:
        "Action demandée",

      confidence:
        clamp(
          bestAction.confidence,
          0,
          85
        ),

      verified:
        Boolean(
          bestAction.verified
        ),

      event:
        null,

      alternatives:
        []
    };
  }

  /*
   * Document compris mais purement informatif.
   */

  if (
    brain?.document?.type ||
    brain?.document?.family
  ) {
    return {
      type:
        EVENT_TYPES.INFORMATION,

      label:
        "Information",

      confidence:
        clamp(
          brain?.document?.confidence ||
          50,
          0,
          80
        ),

      verified:
        false,

      event:
        null,

      alternatives:
        []
    };
  }

  return null;
}

/**
 * =====================================================
 * LABELS
 * =====================================================
 */

function situationLabel(
  type
) {
  switch (type) {
    case EVENT_TYPES.REFUND:
      return "Remboursement";

    case EVENT_TYPES.AUTOMATIC_DEBIT:
      return "Prélèvement automatique";

    case EVENT_TYPES.PAYMENT_DUE:
      return "Paiement à effectuer";

    case EVENT_TYPES.PAYMENT_COMPLETED:
      return "Paiement effectué";

    case EVENT_TYPES.MEETING:
      return "Réunion / assemblée";

    case EVENT_TYPES.TAX_DECLARATION:
      return "Déclaration fiscale";

    case EVENT_TYPES.DEADLINE:
      return "Échéance";

    case EVENT_TYPES.REQUEST:
      return "Action demandée";

    case EVENT_TYPES.DECISION:
      return "Décision";

    case EVENT_TYPES.INFORMATION:
      return "Information";

    default:
      return "Situation inconnue";
  }
}

/**
 * =====================================================
 * OUTIL
 * =====================================================
 */

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(value);

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
