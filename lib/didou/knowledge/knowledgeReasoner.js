/**
 * Didou Knowledge Reasoner V1
 *
 * Objectif :
 * combiner la bibliothèque de connaissances
 * avec le Brain actuel.
 *
 * Le Knowledge Reasoner ne remplace pas Didou.
 * Il apporte :
 * - une hypothèse de type
 * - une hypothèse d'intention
 * - une hypothèse de situation
 * - un résumé métier
 * - une confiance
 * - des signaux explicatifs
 */

import {
  matchDocumentKnowledge
} from "./knowledgeMatcher.js";

/**
 * =====================================================
 * POINT D'ENTREE
 * =====================================================
 */

export function runKnowledgeReasoner({
  text,
  brain,
  detection,
  extraction
} = {}) {
  const match =
    matchDocumentKnowledge({
      text,
      detection,
      extraction,
      limit: 5
    });

  const best =
    match?.best ||
    null;

  /*
   * Rien de suffisamment intéressant.
   */

  if (
    !best ||
    Number(
      best?.confidence || 0
    ) < 45
  ) {
    return createEmptyKnowledgeReasoning({
      matches:
        match?.matches || []
    });
  }

  const brainType =
    cleanValue(
      brain?.document?.type
    );

  const brainIntent =
    cleanValue(
      brain?.decision?.intent?.type ||
      brain?.intent?.type
    );

  const brainSituation =
    cleanValue(
      brain?.decision
        ?.primarySituation?.type ||
      brain?.situation?.type
    );

  /*
   * =====================================================
   * ACCORD / DESACCORD
   * =====================================================
   */

  const agreements = [];
  const disagreements = [];

  compareField({
    field:
      "documentType",

    brainValue:
      brainType,

    knowledgeValue:
      best?.type,

    agreements,
    disagreements
  });

  compareField({
    field:
      "intent",

    brainValue:
      brainIntent,

    knowledgeValue:
      best?.intent,

    agreements,
    disagreements
  });

  compareField({
    field:
      "situation",

    brainValue:
      brainSituation,

    knowledgeValue:
      best?.situation,

    agreements,
    disagreements
  });

  /*
   * =====================================================
   * SCORE DE CONFIANCE FINAL
   * =====================================================
   */

  let confidence =
  Number(
    best?.confidence || 0
  );

/*
 * Accord avec le Brain.
 */

confidence +=
  agreements.length * 4;

/*
 * Désaccord.
 *
 * On reste prudent mais on évite
 * qu'un Brain erroné écrase une
 * très forte reconnaissance métier.
 */

confidence -=
  disagreements.length * 3;

/*
 * Bonus pour les très gros matchs.
 */

const score =
  Number(
    best?.score || 0
  );

if (
  score >= 300
) {
  confidence += 12;
}
else if (
  score >= 220
) {
  confidence += 8;
}
else if (
  score >= 150
) {
  confidence += 4;
}

confidence =
  clamp(
    confidence,
    0,
    98
  );

  /*
   * =====================================================
   * PEUT-ON PROPOSER UNE CORRECTION ?
   * =====================================================
   */

  const canInfluence =
  confidence >= 75;

const canStronglyInfluence =
  (
    confidence >= 88 &&
    disagreements.length <= 1
  ) ||
  (
    score >= 300 &&
    confidence >= 85
  );

  return {
    matched:
      true,

    family:
      best?.family ||
      null,

    documentType:
      best?.type ||
      null,

    intent:
      best?.intent ||
      null,

    situation:
      best?.situation ||
      null,

    actionRequired:
      best?.actionRequired ??
      null,

    summary:
      best?.summary ||
      null,

    importantFields:
      best?.importantFields ||
      [],

    ignoredFields:
      best?.ignoredFields ||
      [],

    confidence,

    score:
      best?.score || 0,

    signals:
      best?.signals || [],

    agreements,
    disagreements,

    canInfluence,
    canStronglyInfluence,

    alternatives:
      (
        match?.matches ||
        []
      )
        .slice(
          1,
          4
        )
        .map(
          (item) => ({
            family:
              item?.family ||
              null,

            documentType:
              item?.type ||
              null,

            intent:
              item?.intent ||
              null,

            situation:
              item?.situation ||
              null,

            confidence:
              item?.confidence ||
              0,

            score:
              item?.score ||
              0
          })
        )
  };
}

/**
 * =====================================================
 * COMPARAISON
 * =====================================================
 */

function compareField({
  field,
  brainValue,
  knowledgeValue,
  agreements,
  disagreements
}) {
  const brain =
    normalize(
      brainValue
    );

  const knowledge =
    normalize(
      knowledgeValue
    );

  /*
   * Pas de valeur de connaissance.
   */

  if (
    !knowledge
  ) {
    return;
  }

  /*
   * Brain ne sait pas :
   * ce n'est pas un désaccord.
   */

  if (
    !brain
  ) {
    return;
  }

  if (
    brain === knowledge
  ) {
    agreements.push({
      field,
      value:
        knowledgeValue
    });

    return;
  }

  disagreements.push({
    field,

    brain:
      brainValue,

    knowledge:
      knowledgeValue
  });
}

/**
 * =====================================================
 * RESULTAT VIDE
 * =====================================================
 */

function createEmptyKnowledgeReasoning({
  matches = []
} = {}) {
  return {
    matched:
      false,

    family:
      null,

    documentType:
      null,

    intent:
      null,

    situation:
      null,

    actionRequired:
      null,

    summary:
      null,

    importantFields:
      [],

    ignoredFields:
      [],

    confidence:
      0,

    score:
      0,

    signals:
      [],

    agreements:
      [],

    disagreements:
      [],

    canInfluence:
      false,

    canStronglyInfluence:
      false,

    alternatives:
      matches
        .slice(
          0,
          3
        )
        .map(
          (item) => ({
            family:
              item?.family ||
              null,

            documentType:
              item?.type ||
              null,

            intent:
              item?.intent ||
              null,

            situation:
              item?.situation ||
              null,

            confidence:
              item?.confidence ||
              0,

            score:
              item?.score ||
              0
          })
        )
  };
}

/**
 * =====================================================
 * NETTOYAGE
 * =====================================================
 */

function cleanValue(
  value
) {
  const text =
    String(
      value || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    text ||
    null
  );
}

function normalize(
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
      /[\s_-]+/g,
      ""
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
