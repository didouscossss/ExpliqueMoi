/**
 * Didou Learning Engine V1
 *
 * Objectif :
 * apprendre localement des corrections
 * sans serveur ni IA distante.
 *
 * Le moteur ne modifie jamais directement
 * les résultats.
 *
 * Il fournit seulement des bonus/malus
 * que le Brain pourra utiliser.
 */

const memory = {
  documentTypes: {},
  intents: {},
  situations: {}
};

/**
 * =====================================================
 * ENREGISTREMENT
 * =====================================================
 */

export function learnFromCorrection({
  predictedType,
  correctedType,
  predictedIntent,
  correctedIntent,
  predictedSituation,
  correctedSituation
}) {
  if (
    predictedType &&
    correctedType
  ) {
    learnPair(
      memory.documentTypes,
      predictedType,
      correctedType
    );
  }

  if (
    predictedIntent &&
    correctedIntent
  ) {
    learnPair(
      memory.intents,
      predictedIntent,
      correctedIntent
    );
  }

  if (
    predictedSituation &&
    correctedSituation
  ) {
    learnPair(
      memory.situations,
      predictedSituation,
      correctedSituation
    );
  }
}

/**
 * =====================================================
 * BONUS
 * =====================================================
 */

export function getLearningBonus({
  type,
  intent,
  situation
}) {
  return {
    typeBonus:
      getBonus(
        memory.documentTypes,
        type
      ),

    intentBonus:
      getBonus(
        memory.intents,
        intent
      ),

    situationBonus:
      getBonus(
        memory.situations,
        situation
      )
  };
}

/**
 * =====================================================
 * STATS
 * =====================================================
 */

export function getLearningStats() {
  return {
    documentTypes:
      memory.documentTypes,

    intents:
      memory.intents,

    situations:
      memory.situations
  };
}

/**
 * =====================================================
 * RESET
 * =====================================================
 */

export function resetLearningMemory() {
  memory.documentTypes = {};
  memory.intents = {};
  memory.situations = {};
}

/**
 * =====================================================
 * INTERNE
 * =====================================================
 */

function learnPair(
  bucket,
  predicted,
  corrected
) {
  const key =
    normalize(
      corrected
    );

  if (!key) {
    return;
  }

  bucket[key] =
    Number(
      bucket[key] || 0
    ) + 1;
}

function getBonus(
  bucket,
  value
) {
  const key =
    normalize(
      value
    );

  if (!key) {
    return 0;
  }

  const count =
    Number(
      bucket[key] || 0
    );

  /*
   * 0 -> 0
   * 1 -> 2
   * 2 -> 4
   * 3 -> 6
   * ...
   */

  return Math.min(
    count * 2,
    20
  );
}

function normalize(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}
