/**
 * =====================================================
 * DIDOU CONSENSUS ENGINE V2
 * =====================================================
 *
 * Arbitre entre :
 * - Detection historique
 * - Brain / Decision Engine
 * - Knowledge Reasoner
 *
 * Objectif :
 * produire UNE conclusion documentaire centrale.
 *
 * Le Knowledge Reasoner ne gagne que lorsqu'il dispose
 * d'indices suffisamment forts.
 */

export function buildConsensus({
  detection,
  brain,
  knowledge
} = {}) {
  /*
   * =====================================================
   * VALEURS ACTUELLES
   * =====================================================
   */

  const detectionType =
    clean(
      detection?.documentType
    );

  const detectionFamily =
    clean(
      detection?.family
    );

  const brainType =
    clean(
      brain?.document?.type ||
      brain?.documentType
    );

  const brainFamily =
    clean(
      brain?.document?.family ||
      brain?.family
    );

  const decisionIntent =
    clean(
      brain?.decision?.intent?.type ||
      brain?.intent?.type
    );

  const decisionSituation =
    clean(
      brain?.decision
        ?.primarySituation?.type ||
      brain?.situation?.type
    );

  /*
   * =====================================================
   * KNOWLEDGE
   * =====================================================
   */

  const knowledgeMatched =
    knowledge?.matched === true;

  const knowledgeType =
    clean(
      knowledge?.documentType
    );

  const knowledgeFamily =
    clean(
      knowledge?.family
    );

  const knowledgeIntent =
    clean(
      knowledge?.intent
    );

  const knowledgeSituation =
    clean(
      knowledge?.situation
    );

  const knowledgeScore =
    Number(
      knowledge?.score || 0
    );

  const knowledgeConfidence =
    Number(
      knowledge?.confidence || 0
    );

  const strongSignals =
    Array.isArray(
      knowledge?.signals
    )
      ? knowledge.signals.filter(
          (signal) =>
            Number(
              signal?.weight || 0
            ) >= 20
        )
      : [];

  /*
   * =====================================================
   * SIGNAL "TYPE"/"ALIAS" ISOLÉ
   * =====================================================
   *
   * Le signal "type" (une fiche dont le nom apparaît tel
   * quel dans le texte) pèse à lui seul 60 points — plus que
   * n'importe quel autre signal — pour de bonnes raisons
   * quand ce nom est distinctif ("Confirmation de
   * résiliation"). Mais un nom de type générique ou court
   * ("Pièce d'identité", "Certificat") peut apparaître dans
   * un document sans rapport, en tant que simple vocabulaire
   * ordinaire ("...muni d'une pièce d'identité...") plutôt
   * que comme auto-désignation du document. On ne fait donc
   * confiance à ce signal seul que s'il est corroboré par au
   * moins un peu de vocabulaire/phrase/organisme propre à la
   * fiche — jamais isolé.
   */

  const corroboratingSignalWeight =
    Array.isArray(
      knowledge?.signals
    )
      ? knowledge.signals
          .filter(
            (signal) =>
              signal?.kind !== "type" &&
              signal?.kind !== "alias"
          )
          .reduce(
            (total, signal) =>
              total +
              Number(
                signal?.weight || 0
              ),
            0
          )
      : 0;

  /*
   * =====================================================
   * VALEUR PAR DEFAUT
   * =====================================================
   */

  const result = {
    winner:
      brainType
        ? "brain"
        : detectionType
          ? "detection"
          : "unknown",

    corrected:
      false,

    family:
      brainFamily ||
      detectionFamily ||
      null,

    documentType:
      brainType ||
      detectionType ||
      null,

    intent:
      decisionIntent ||
      null,

    situation:
      decisionSituation ||
      null,

    actionRequired:
      brain?.decision
        ?.actionRequired ??
      null,

    confidence:
      Number(
        brain?.decision?.confidence ||
        brain?.document?.confidence ||
        detection?.confidence ||
        0
      ),

    summary:
      null,

    reason:
      "legacy_consensus",

    knowledgeScore,
    knowledgeConfidence,

    strongSignalCount:
      strongSignals.length
  };

  /*
   * =====================================================
   * PAS DE CONNAISSANCE
   * =====================================================
   */

  if (
    !knowledgeMatched ||
    !knowledgeType
  ) {
    return result;
  }

  /*
   * =====================================================
   * AUCUNE HYPOTHÈSE CONCURRENTE
   * =====================================================
   *
   * BUG CORRIGÉ :
   *
   * Les seuils "knowledge très fort / fort" ci-dessous sont
   * conçus pour CORRIGER une hypothèse existante à laquelle
   * on fait déjà confiance (ex : "Attestation assurance"
   * -> "Convocation AG"). Ils exigeaient jusqu'ici le même
   * niveau de preuve même quand il n'y avait tout simplement
   * AUCUNE hypothèse concurrente (ancien détecteur ET Brain
   * tous deux vides) — ce qui n'est pas un désaccord, juste
   * une absence d'information à contredire. Résultat : un
   * document correctement reconnu par Knowledge (score et
   * confiance élevés) retombait quand même sur "unknown".
   *
   * Quand rien d'autre ne propose de type, Knowledge n'a
   * besoin que d'un score minimal raisonnable pour gagner —
   * pas du niveau de preuve nécessaire pour renverser un avis
   * déjà exprimé.
   */

  const hasCompetingHypothesis =
    Boolean(
      brainType ||
      detectionType
    );

  if (
    !hasCompetingHypothesis &&
    knowledgeConfidence >= 55 &&
    knowledgeScore >= 60 &&
    corroboratingSignalWeight >= 15
  ) {
    applyKnowledgeWinner({
      result,
      knowledge,
      reason:
        "knowledge_only_hypothesis"
    });

    return result;
  }

  /*
   * =====================================================
   * AUCUNE HYPOTHÈSE CONCURRENTE, ÉMETTEUR IDENTIFIÉ
   * =====================================================
   *
   * Variante plus permissive du cas ci-dessus, réservée aux
   * cas où Knowledge a reconnu l'ORGANISME ÉMETTEUR par son
   * nom (ex. "France Travail", "CAF") — un signal beaucoup
   * plus distinctif qu'un simple mot de vocabulaire, rarement
   * une coïncidence. Trouvé sur une notification de radiation
   * France Travail dont le seul mot "convocation" donnait à
   * l'ancien détecteur family="copropriete" à 30/100 — pas
   * assez pour même proposer un type de document, mais assez
   * pour empêcher le score 58/confiance 47 (sous le seuil
   * générique ci-dessus) de Knowledge de s'imposer alors qu'il
   * avait, lui, correctement reconnu l'organisme émetteur.
   */

  const hasOrganizationSignal =
    Array.isArray(
      knowledge?.signals
    ) &&
    knowledge.signals.some(
      (signal) =>
        (
          signal?.kind === "organization" ||
          signal?.kind === "known_organization_family"
        ) &&
        Number(
          signal?.weight || 0
        ) >= 15
    );

  if (
    !hasCompetingHypothesis &&
    hasOrganizationSignal &&
    knowledgeConfidence >= 40 &&
    knowledgeScore >= 45
  ) {
    applyKnowledgeWinner({
      result,
      knowledge,
      reason:
        "knowledge_only_hypothesis_organization"
    });

    return result;
  }

  /*
   * =====================================================
   * ACCORD COMPLET
   * =====================================================
   *
   * Le Brain et Knowledge disent la même chose.
   * On peut renforcer la confiance.
   */

  if (
    same(
      knowledgeType,
      result.documentType
    )
  ) {
    result.winner =
      "consensus";

    result.family =
      knowledgeFamily ||
      result.family;

    result.intent =
      knowledgeIntent ||
      result.intent;

    result.situation =
      knowledgeSituation ||
      result.situation;

    result.actionRequired =
      knowledge?.actionRequired ??
      result.actionRequired;

    result.summary =
      knowledge?.summary ||
      null;

    result.confidence =
      Math.min(
        98,
        Math.max(
          result.confidence,
          knowledgeConfidence
        )
      );

    result.reason =
      "brain_knowledge_agreement";

    return result;
  }

  /*
   * =====================================================
   * KNOWLEDGE TRES FORT
   * =====================================================
   *
   * Exemple réel :
   *
   * ancien moteur :
   * Attestation assurance
   *
   * knowledge :
   * Convocation AG
   * score 401
   *
   * Ici Knowledge doit pouvoir corriger.
   */

  const knowledgeVeryStrong =
    knowledgeScore >= 250 &&
    knowledgeConfidence >= 88 &&
    strongSignals.length >= 3;

  if (
    knowledgeVeryStrong
  ) {
    applyKnowledgeWinner({
      result,
      knowledge,
      reason:
        "knowledge_very_strong"
    });

    return result;
  }

  /*
   * =====================================================
   * KNOWLEDGE FORT
   * =====================================================
   *
   * Plus conservateur.
   */

  const knowledgeStrong =
    knowledgeScore >= 180 &&
    knowledgeConfidence >= 85 &&
    strongSignals.length >= 2 &&
    knowledge?.canInfluence === true;

  if (
    knowledgeStrong
  ) {
    applyKnowledgeWinner({
      result,
      knowledge,
      reason:
        "knowledge_strong"
    });

    return result;
  }

  /*
   * =====================================================
   * KNOWLEDGE DECLARE STRONGLY INFLUENTIAL
   * =====================================================
   */

  if (
    knowledge?.canStronglyInfluence ===
      true &&
    knowledgeConfidence >= 90 &&
    knowledgeScore >= 140
  ) {
    applyKnowledgeWinner({
      result,
      knowledge,
      reason:
        "knowledge_reasoner_strong"
    });

    return result;
  }

  /*
   * =====================================================
   * DESACCORD NON RESOLU
   * =====================================================
   */

  result.reason =
    "knowledge_disagreement_not_strong_enough";

  /*
   * On baisse légèrement la confiance
   * puisqu'il existe deux hypothèses différentes.
   */

  result.confidence =
    Math.max(
      0,
      Math.min(
        result.confidence,
        75
      )
    );

  return result;
}

/**
 * =====================================================
 * APPLIQUER KNOWLEDGE
 * =====================================================
 */

function applyKnowledgeWinner({
  result,
  knowledge,
  reason
}) {
  const previousType =
    result.documentType;

  result.winner =
    "knowledge";

  result.corrected =
    !same(
      previousType,
      knowledge?.documentType
    );

  result.previousDocumentType =
    previousType ||
    null;

  result.family =
    clean(
      knowledge?.family
    ) ||
    result.family;

  result.documentType =
    clean(
      knowledge?.documentType
    ) ||
    result.documentType;

  result.intent =
    clean(
      knowledge?.intent
    ) ||
    result.intent;

  result.situation =
    clean(
      knowledge?.situation
    ) ||
    result.situation;

  result.actionRequired =
    knowledge?.actionRequired ??
    result.actionRequired;

  result.summary =
    clean(
      knowledge?.summary
    ) ||
    null;

  result.confidence =
    Math.min(
      98,
      Number(
        knowledge?.confidence || 0
      )
    );

  result.reason =
    reason;
}

/**
 * =====================================================
 * COMPARAISON
 * =====================================================
 */

function same(
  a,
  b
) {
  const first =
    normalize(
      a
    );

  const second =
    normalize(
      b
    );

  return (
    Boolean(
      first &&
      second
    ) &&
    first === second
  );
}

/**
 * =====================================================
 * NETTOYAGE
 * =====================================================
 */

function clean(
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
