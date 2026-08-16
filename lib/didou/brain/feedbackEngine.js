/**
 * Didou Brain
 * Feedback Engine V1
 *
 * Objectif :
 * transformer une correction utilisateur
 * en signal d'apprentissage.
 *
 * Exemple :
 *
 * Didou :
 *   type = Contrat
 *   intent = contract
 *
 * Utilisateur :
 *   type = Attestation d'assurance
 *   intent = proof
 *
 * Le Feedback Engine :
 * - nettoie les valeurs
 * - vérifie que la correction est utile
 * - appelle le Learning Engine
 * - renvoie un diagnostic
 */

import {
  learnFromCorrection
} from "./learningEngine.js";

/**
 * =====================================================
 * POINT D'ENTREE
 * =====================================================
 */

export function processUserFeedback({
  brain,
  correction
} = {}) {
  if (
    !brain ||
    !correction ||
    typeof correction !== "object"
  ) {
    return createFeedbackResult({
      accepted: false,
      reason:
        "Feedback incomplet."
    });
  }

  /*
   * =====================================================
   * PREDICTIONS ACTUELLES
   * =====================================================
   */

  const predictedType =
    cleanValue(
      brain?.document?.type
    );

  const predictedIntent =
    cleanValue(
      brain?.decision?.intent?.type ||
      brain?.intent?.type
    );

  const predictedSituation =
    cleanValue(
      brain?.decision
        ?.primarySituation?.type ||
      brain?.situation?.type
    );

  /*
   * =====================================================
   * CORRECTIONS UTILISATEUR
   * =====================================================
   */

  const correctedType =
    cleanValue(
      correction?.documentType
    );

  const correctedIntent =
    cleanValue(
      correction?.intent
    );

  const correctedSituation =
    cleanValue(
      correction?.situation
    );

  /*
   * =====================================================
   * RIEN A APPRENDRE
   * =====================================================
   */

  const changes = [];

  if (
    correctedType &&
    normalize(predictedType) !==
      normalize(correctedType)
  ) {
    changes.push({
      field:
        "documentType",

      predicted:
        predictedType,

      corrected:
        correctedType
    });
  }

  if (
    correctedIntent &&
    normalize(predictedIntent) !==
      normalize(correctedIntent)
  ) {
    changes.push({
      field:
        "intent",

      predicted:
        predictedIntent,

      corrected:
        correctedIntent
    });
  }

  if (
    correctedSituation &&
    normalize(predictedSituation) !==
      normalize(correctedSituation)
  ) {
    changes.push({
      field:
        "situation",

      predicted:
        predictedSituation,

      corrected:
        correctedSituation
    });
  }

  if (
    !changes.length
  ) {
    return createFeedbackResult({
      accepted: false,

      reason:
        "La correction ne modifie aucune décision de Didou.",

      predicted: {
        documentType:
          predictedType,

        intent:
          predictedIntent,

        situation:
          predictedSituation
      },

      correction: {
        documentType:
          correctedType,

        intent:
          correctedIntent,

        situation:
          correctedSituation
      }
    });
  }

  /*
   * =====================================================
   * APPRENTISSAGE
   * =====================================================
   */

  learnFromCorrection({
    predictedType,
    correctedType,

    predictedIntent,
    correctedIntent,

    predictedSituation,
    correctedSituation
  });

  return createFeedbackResult({
    accepted: true,

    reason:
      "Correction enregistrée dans la mémoire d’apprentissage locale.",

    predicted: {
      documentType:
        predictedType,

      intent:
        predictedIntent,

      situation:
        predictedSituation
    },

    correction: {
      documentType:
        correctedType,

      intent:
        correctedIntent,

      situation:
        correctedSituation
    },

    changes
  });
}

/**
 * =====================================================
 * FEEDBACK RAPIDE TYPE
 * =====================================================
 */

export function correctDocumentType({
  brain,
  documentType,
  intent = null,
  situation = null
} = {}) {
  return processUserFeedback({
    brain,

    correction: {
      documentType,
      intent,
      situation
    }
  });
}

/**
 * =====================================================
 * FEEDBACK RAPIDE INTENT
 * =====================================================
 */

export function correctDocumentIntent({
  brain,
  intent
} = {}) {
  return processUserFeedback({
    brain,

    correction: {
      intent
    }
  });
}

/**
 * =====================================================
 * FEEDBACK RAPIDE SITUATION
 * =====================================================
 */

export function correctDocumentSituation({
  brain,
  situation
} = {}) {
  return processUserFeedback({
    brain,

    correction: {
      situation
    }
  });
}

/**
 * =====================================================
 * RESULTAT
 * =====================================================
 */

function createFeedbackResult({
  accepted = false,
  reason = null,
  predicted = null,
  correction = null,
  changes = []
} = {}) {
  return {
    accepted,
    reason,
    predicted,
    correction,
    changes,

    learned:
      accepted === true
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
