/**
 * =====================================================
 * CONSENSUS ENGINE V1
 * =====================================================
 *
 * Objectif :
 * décider qui a raison entre :
 *
 * - détection historique
 * - reasoner
 * - knowledge matcher
 *
 * Pour le moment :
 * - très conservateur
 * - ne corrige que les cas évidents
 */

export function buildConsensus({
  detection,
  brain,
  knowledge
}) {
  const result = {
    winner: "brain",
    confidence: 50,
    corrected: false,
    documentType:
      brain?.documentType ||
      detection?.documentType ||
      null,
    family:
      brain?.family ||
      detection?.family ||
      null,
    reason: "brain-default"
  };

  const best =
    knowledge?.best;

  if (!best) {
    return result;
  }

  const knowledgeConfidence =
    Number(
      best?.confidence || 0
    );

  const knowledgeScore =
    Number(
      best?.score || 0
    );

  const currentType =
    normalize(
      brain?.documentType ||
      detection?.documentType
    );

  const knowledgeType =
    normalize(
      best?.type
    );

  /*
   * ===================================================
   * CAS 1
   * Knowledge très fort
   * ===================================================
   */

  if (
    knowledgeScore >= 250 &&
    knowledgeConfidence >= 90 &&
    knowledgeType
  ) {
    result.winner =
      "knowledge";

    result.corrected =
      currentType !==
      knowledgeType;

    result.documentType =
      best.type;

    result.family =
      best.family;

    result.confidence =
      knowledgeConfidence;

    result.reason =
      "knowledge-strong";

    return result;
  }

  /*
   * ===================================================
   * CAS 2
   * Knowledge fort
   * ===================================================
   */

  if (
    knowledgeScore >= 180 &&
    knowledgeConfidence >= 85 &&
    knowledgeType &&
    currentType !==
      knowledgeType
  ) {
    result.winner =
      "knowledge";

    result.corrected =
      true;

    result.documentType =
      best.type;

    result.family =
      best.family;

    result.confidence =
      knowledgeConfidence;

    result.reason =
      "knowledge-probable";

    return result;
  }

  /*
   * ===================================================
   * Sinon on garde le brain
   * ===================================================
   */

  return result;
}

function normalize(
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
    .trim();
}
