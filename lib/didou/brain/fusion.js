/**
 * Didou Brain — Fusion V4
 *
 * OBJECTIF :
 *
 * La fusion n'interprète plus elle-même
 * toutes les données du Brain.
 *
 * Elle utilise en priorité :
 *
 * brain.decision
 *
 * qui contient déjà :
 * - intention principale
 * - situation principale
 * - montant principal
 * - date principale
 * - action requise ou non
 * - confiance
 * - contradictions
 *
 * Architecture :
 *
 * Legacy Adapter
 *      +
 * Brain Decision
 *      ↓
 * Fusion V4
 *      ↓
 * Résultat utilisateur
 */

export function fuseBrainAndAdapted({
  brain,
  adapted,
  detection
}) {
  /*
   * =====================================================
   * SECURITE
   * =====================================================
   */

  if (
    !adapted ||
    typeof adapted !== "object"
  ) {
    return adapted;
  }

  if (!brain) {
    return adapted;
  }

  const result = {
    ...adapted
  };

  const decision =
    brain?.decision ||
    null;

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
      : Array.isArray(
          brain?.contradictions
        )
        ? brain.contradictions
        : [];

  const hasHighContradiction =
    contradictions.some(
      (item) =>
        item?.severity ===
        "high"
    );

  /*
   * =====================================================
   * 1 — TYPE DU DOCUMENT
   * =====================================================
   */

  result.documentType =
    fuseDocumentType({
      brain,
      adapted,
      detection,
      decision
    });

  /*
   * =====================================================
   * 2 — COMPREHENSION / INTENTION
   * =====================================================
   */

  applyDecisionUnderstanding({
    result,
    brain,
    decision,
    hasHighContradiction
  });

  /*
   * =====================================================
   * 3 — EMETTEUR
   * =====================================================
   */

  result.issuer =
    fuseIssuer({
      brain,
      adapted
    });

  /*
   * =====================================================
   * 4 — MONTANT PRINCIPAL
   * =====================================================
   */

  result.mainAmount =
    fuseDecisionAmount({
      decision,
      adapted,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 5 — DATE PRINCIPALE
   * =====================================================
   */

  result.mainDate =
    fuseDecisionDate({
      decision,
      adapted,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 6 — ACTIONS
   * =====================================================
   */

  result.actions =
    fuseDecisionActions({
      brain,
      decision,
      adapted
    });

  /*
   * =====================================================
   * 7 — FAITS IMPORTANTS
   * =====================================================
   */

  result.importantFacts =
    fuseImportantFacts({
      brain,
      decision,
      adapted
    });

  /*
   * =====================================================
   * 8 — PURPOSE
   * =====================================================
   */

  result.documentPurpose =
    fuseDocumentPurpose({
      brain,
      decision,
      adapted
    });

  /*
   * =====================================================
   * 9 — WHY RECEIVED
   * =====================================================
   */

  result.whyReceived =
    fuseWhyReceived({
      brain,
      decision,
      adapted,
      documentType:
        result.documentType
    });

  /*
   * =====================================================
   * 10 — ATTENTION LEVEL
   * =====================================================
   */

  result.attentionLevel =
    determineAttentionLevel({
      decision,
      adapted,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 11 — CONFIANCE
   * =====================================================
   */

  result.confidence =
    fuseDecisionConfidence({
      brain,
      decision,
      adapted,
      detection,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 12 — WARNINGS / UNCERTAINTIES
   * =====================================================
   */

  result.warnings =
    fuseWarnings({
      adapted,
      decision,
      hasHighContradiction
    });

  result.uncertainties =
    fuseUncertainties({
      adapted,
      decision,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 13 — DIAGNOSTIC
   * =====================================================
   */

  result.brainFusion = {
    applied:
      true,

    version:
      "4.0",

    decision:
      decision ||
      null,
    
consensus:
  brain?.consensus ||
  null,
    
    intent:
      brain?.intent ||
      null,

    situation:
      brain?.situation ||
      null,

    highContradiction:
      hasHighContradiction,

    brainScore:
      brain?.score?.global ??
      null,

    decisionConfidence:
      decision?.confidence ??
      null,

    actionRequired:
      decision?.actionRequired ??
      null
  };

  return result;
}

/**
 * =====================================================
 * TYPE DOCUMENT
 * =====================================================
 */

function fuseDocumentType({
  brain,
  adapted,
  detection,
  decision
}) {
  const current =
    cleanText(
      adapted?.documentType
    );

  const detected =
    cleanText(
      detection?.documentType
    );

  const brainType =
    cleanText(
      brain?.document?.type
    );

  /*
   * Type Legacy précis :
   * on le conserve.
   */

  if (
    isUsefulDocumentType(
      current
    )
  ) {
    return current;
  }

  /*
   * Type détecté par le Brain.
   */

  if (
    isUsefulDocumentType(
      brainType
    ) &&
    Number(
      brain?.document?.confidence ||
      0
    ) >= 65
  ) {
    return brainType;
  }

  /*
   * Type du détecteur.
   */

  if (
    isUsefulDocumentType(
      detected
    )
  ) {
    return detected;
  }

  /*
   * Décision Proof.
   */

  if (
    decision?.intent?.type ===
      "proof" &&
    Number(
      decision?.intent
        ?.confidence || 0
    ) >= 85
  ) {
    return (
      "Attestation / justificatif"
    );
  }

  return (
    current ||
    brainType ||
    detected ||
    null
  );
}

/**
 * =====================================================
 * COMPREHENSION
 * =====================================================
 */

function applyDecisionUnderstanding({
  result,
  brain,
  decision,
  hasHighContradiction
}) {
  if (
    !decision ||
    hasHighContradiction
  ) {
    return;
  }

  const confidence =
    Number(
      decision?.confidence || 0
    );

  /*
   * Le Decision Engine devient la référence
   * pour le niveau de compréhension.
   */

  if (
    confidence >= 88
  ) {
    result.understandingLevel =
      "strong";
  } else if (
    confidence >= 72
  ) {
    result.understandingLevel =
      "probable";
  }

  /*
   * Intent spécifique.
   */

  const intentType =
    decision?.intent?.type ||
    brain?.intent?.type ||
    null;

  if (
    intentType === "proof"
  ) {
    result.understandingLevel =
      confidence >= 82
        ? "strong"
        : result.understandingLevel;
  }
}

/**
 * =====================================================
 * EMETTEUR
 * =====================================================
 */

function fuseIssuer({
  brain,
  adapted
}) {
  const current =
    adapted?.issuer ||
    null;

  const candidate =
    brain?.issuer ||
    null;

  /*
   * Un émetteur métier déjà présent
   * garde la priorité.
   */

  if (
    current
  ) {
    return current;
  }

  if (
    candidate &&
    brain?.issuerVerified
  ) {
    return candidate;
  }

  return current;
}

/**
 * =====================================================
 * MONTANT PRINCIPAL
 * =====================================================
 */

function fuseDecisionAmount({
  decision,
  adapted,
  hasHighContradiction
}) {
  const current =
    adapted?.mainAmount ||
    null;

  const candidate =
    decision?.primaryAmount ||
    null;

  if (
    !candidate?.value
  ) {
    return current;
  }

  if (
    hasHighContradiction
  ) {
    return current;
  }

  /*
   * Le Decision Engine doit avoir vérifié
   * le montant avant utilisation.
   */

  if (
    candidate?.verified !== true
  ) {
    return current;
  }

  const mapped =
    mapDecisionAmount(
      candidate
    );

  /*
   * Aucun montant Legacy.
   */

  if (!current) {
    return mapped;
  }

  /*
   * Même montant.
   */

  if (
    normalizeComparable(
      current?.value
    ) ===
    normalizeComparable(
      candidate?.value
    )
  ) {
    /*
     * On conserve la structure Legacy,
     * mais on peut renforcer la confiance.
     */

    return {
      ...current,

      confidence:
        Math.max(
          Number(
            current?.confidence || 0
          ),
          Number(
            candidate?.confidence || 0
          )
        )
    };
  }

  const currentConfidence =
    Number(
      current?.confidence ||
      adapted?.confidence ||
      0
    );

  const candidateConfidence =
    Number(
      candidate?.confidence ||
      0
    );

  /*
   * Le Decision Engine peut désormais corriger
   * un mauvais montant Legacy, mais seulement
   * avec un avantage net.
   */

  if (
    candidateConfidence >= 88 &&
    candidateConfidence >=
      currentConfidence + 12
  ) {
    return mapped;
  }

  return current;
}

function mapDecisionAmount(
  amount
) {
  return {
    value:
      amount?.value ||
      null,

    numeric:
      Number.isFinite(
        Number(
          amount?.numeric
        )
      )
        ? Number(
            amount.numeric
          )
        : null,

    label:
      labelAmountRole(
        amount?.role
      ),

    meaning:
      buildAmountMeaning(
        amount?.role
      ),

    role:
      amount?.role ||
      "unknown",

    confidence:
      Number(
        amount?.confidence || 0
      ),

    source:
      "didou-decision"
  };
}

/**
 * =====================================================
 * DATE PRINCIPALE
 * =====================================================
 */

function fuseDecisionDate({
  decision,
  adapted,
  hasHighContradiction
}) {
  const current =
    adapted?.mainDate ||
    null;

  const candidate =
    decision?.primaryDate ||
    null;

  if (
    !candidate?.value
  ) {
    return current;
  }

  if (
    hasHighContradiction
  ) {
    return current;
  }

  if (
    candidate?.verified !== true
  ) {
    return current;
  }

  const mapped =
    mapDecisionDate(
      candidate
    );

  if (!current) {
    return mapped;
  }

  /*
   * Même date.
   */

  if (
    normalizeComparable(
      current?.date
    ) ===
    normalizeComparable(
      candidate?.value
    )
  ) {
    return {
      ...current,

      confidence:
        Math.max(
          Number(
            current?.confidence || 0
          ),
          Number(
            candidate?.confidence || 0
          )
        )
    };
  }

  const currentConfidence =
    Number(
      current?.confidence ||
      adapted?.confidence ||
      0
    );

  const candidateConfidence =
    Number(
      candidate?.confidence ||
      0
    );

  /*
   * Une mauvaise date Legacy peut être corrigée
   * si la décision est nettement plus fiable.
   */

  if (
    candidateConfidence >= 90 &&
    candidateConfidence >=
      currentConfidence + 12
  ) {
    return mapped;
  }

  return current;
}

function mapDecisionDate(
  date
) {
  return {
    date:
      date?.value ||
      null,

    label:
      labelDateRole(
        date?.role
      ),

    meaning:
      buildDateMeaning(
        date?.role
      ),

    role:
      date?.role ||
      "unknown",

    confidence:
      Number(
        date?.confidence || 0
      ),

    source:
      "didou-decision"
  };
}

/**
 * =====================================================
 * ACTIONS
 * =====================================================
 */

function fuseDecisionActions({
  brain,
  decision,
  adapted
}) {
  const legacyActions =
    Array.isArray(
      adapted?.actions
    )
      ? adapted.actions
      : [];

  /*
   * ===================================================
   * DECISION = AUCUNE ACTION
   * ===================================================
   *
   * Très important :
   * le Decision Engine peut désormais neutraliser
   * des fausses actions Legacy.
   */

  if (
    decision?.actionRequired ===
      false &&
    Number(
      decision?.confidence || 0
    ) >= 78
  ) {
    return [];
  }

  /*
   * ===================================================
   * DECISION = ACTION REQUISE
   * ===================================================
   */

  if (
    decision?.actionRequired ===
      true
  ) {
    const decisionActions =
      Array.isArray(
        decision?.actions
      )
        ? decision.actions
        : [];

    const useful =
      decisionActions
        .filter(
          (action) =>
            isUsefulAction(
              action?.action
            )
        )
        .filter(
          (action) =>
            Number(
              action?.confidence || 0
            ) >= 70
        )
        .map(
          (action) => ({
            action:
              action.action,

            how:
              action.how ||
              "",

            confidence:
              action.confidence,

            source:
              "didou-decision"
          })
        );

    if (
      useful.length
    ) {
      return useful.slice(
        0,
        3
      );
    }

    /*
     * Pas de meilleure action Brain :
     * Legacy reste disponible.
     */

    return legacyActions.filter(
      (action) =>
        isUsefulAction(
          typeof action === "string"
            ? action
            : action?.action
        )
    );
  }

  /*
   * ===================================================
   * DECISION INCERTAINE
   * ===================================================
   */

  return legacyActions.filter(
    (action) =>
      isUsefulAction(
        typeof action === "string"
          ? action
          : action?.action
      )
  );
}

/**
 * =====================================================
 * FAITS IMPORTANTS
 * =====================================================
 */

function fuseImportantFacts({
  brain,
  decision,
  adapted
}) {
  const result =
    [];

  const seen =
    new Set();

  /*
   * ===================================================
   * 1 — TYPE LEGACY
   * ===================================================
   */

  for (
    const fact
    of Array.isArray(
      adapted?.importantFacts
    )
      ? adapted.importantFacts
      : []
  ) {
    addFact({
      result,
      seen,
      fact
    });
  }

  /*
   * ===================================================
   * 2 — INTENTION
   * ===================================================
   */

  if (
    decision?.intent?.type &&
    decision.intent.type !==
      "information" &&
    decision.intent.type !==
      "unknown"
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "intent",

        label:
          "Fonction du document",

        value:
          decision.intent.label ||
          labelIntent(
            decision.intent.type
          ),

        confidence:
          decision.intent.confidence ||
          0,

        source:
          "didou-decision"
      }
    });
  }

  /*
   * ===================================================
   * 3 — MONTANT
   * ===================================================
   */

  if (
    decision?.primaryAmount
      ?.verified &&
    decision?.primaryAmount
      ?.value
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "amount",

        label:
          labelAmountRole(
            decision.primaryAmount.role
          ),

        value:
          decision.primaryAmount.value,

        confidence:
          decision.primaryAmount
            .confidence ||
          0,

        source:
          "didou-decision"
      }
    });
  }

  /*
   * ===================================================
   * 4 — DATE
   * ===================================================
   */

  if (
    decision?.primaryDate
      ?.verified &&
    decision?.primaryDate
      ?.value
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "date",

        label:
          labelDateRole(
            decision.primaryDate.role
          ),

        value:
          decision.primaryDate.value,

        confidence:
          decision.primaryDate
            .confidence ||
          0,

        source:
          "didou-decision"
      }
    });
  }

  /*
   * ===================================================
   * 5 — EMETTEUR
   * ===================================================
   */

  if (
    brain?.issuer &&
    brain?.issuerVerified
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "issuer",

        label:
          "Émetteur",

        value:
          brain.issuer,

        confidence:
          90,

        source:
          "didou-brain"
      }
    });
  }

  return result.slice(
    0,
    6
  );
}

function addFact({
  result,
  seen,
  fact
}) {
  if (
    !fact ||
    !fact?.value
  ) {
    return;
  }

  const key =
    `${normalizeComparable(
      fact?.label
    )}|${normalizeComparable(
      fact?.value
    )}`;

  if (
    seen.has(key)
  ) {
    return;
  }

  seen.add(key);

  result.push(
    fact
  );
}

/**
 * =====================================================
 * PURPOSE
 * =====================================================
 */

function fuseDocumentPurpose({
  brain,
  decision,
  adapted
}) {
  const current =
    cleanText(
      adapted?.documentPurpose
    );

  const intent =
    decision?.intent?.type ||
    brain?.intent?.type ||
    null;

  const confidence =
    Number(
      decision?.confidence || 0
    );

  /*
   * Legacy très spécifique :
   * on le garde.
   */

  if (
    isUsefulPurpose(
      current
    ) &&
    confidence < 85
  ) {
    return current;
  }

  switch (intent) {
    case "proof":
      return (
        "Certifier ou justifier une situation."
      );

    case "refund":
      return (
        "Informer d’un remboursement ou d’un avoir."
      );

    case "payment":
      return (
        "Informer d’un paiement, d’un règlement ou d’un prélèvement."
      );

    case "meeting":
      return (
        "Informer d’une réunion ou convoquer le destinataire."
      );

    case "decision":
      return (
        "Informer le destinataire d’une décision."
      );

    case "contract":
      return (
        "Définir ou confirmer une relation contractuelle."
      );

    case "declaration":
      return (
        "Permettre ou présenter une déclaration."
      );

    case "notification":
      return (
        "Informer le destinataire d’une situation ou d’un changement."
      );

    case "request":
      return (
        "Demander au destinataire d’effectuer une action."
      );

    default:
      return (
        current ||
        brain?.purpose ||
        null
      );
  }
}

/**
 * =====================================================
 * WHY RECEIVED
 * =====================================================
 */

function fuseWhyReceived({
  brain,
  decision,
  adapted,
  documentType
}) {
  const current =
    cleanText(
      adapted?.whyReceived
    );

  /*
   * Legacy précis.
   */

  if (
    isUsefulWhyReceived(
      current
    )
  ) {
    return current;
  }

  const intent =
    decision?.intent?.type ||
    brain?.intent?.type ||
    null;

  switch (intent) {
    case "proof":
      if (
        /assurance/i.test(
          String(
            documentType || ""
          )
        )
      ) {
        return (
          "Cette attestation vous a été remise pour justifier votre situation d’assurance."
        );
      }

      return (
        "Ce document vous a été remis comme attestation ou justificatif."
      );

    case "refund":
      return (
        "Ce document vous informe d’un remboursement."
      );

    case "payment":
      return (
        decision?.actionRequired
          ? "Ce document vous informe d’un règlement à effectuer."
          : "Ce document vous informe d’un règlement ou d’un prélèvement."
      );

    case "meeting":
      return (
        "Ce document vous informe d’une réunion ou d’une convocation."
      );

    case "decision":
      return (
        "Ce document vous communique une décision."
      );

    case "request":
      return (
        "Ce document vous demande d’effectuer une démarche."
      );

    default:
      return (
        current ||
        null
      );
  }
}

/**
 * =====================================================
 * ATTENTION
 * =====================================================
 */

function determineAttentionLevel({
  decision,
  adapted,
  hasHighContradiction
}) {
  if (
    hasHighContradiction
  ) {
    return "uncertain";
  }

  if (
    decision?.actionRequired ===
      true
  ) {
    /*
     * Une date peut indiquer une échéance,
     * mais on ne calcule pas encore ici
     * si elle est proche ou lointaine.
     */

    if (
      decision?.primaryDate
        ?.value
    ) {
      return "soon";
    }

    return "attention";
  }

  if (
    decision?.actionRequired ===
      false
  ) {
    return "none";
  }

  return (
    adapted?.attentionLevel ||
    "uncertain"
  );
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function fuseDecisionConfidence({
  brain,
  decision,
  adapted,
  detection,
  hasHighContradiction
}) {
  const legacyConfidence =
    Number(
      adapted?.confidence ??
      detection?.confidence ??
      0
    );

  const decisionConfidence =
    Number(
      decision?.confidence ||
      0
    );

  const brainConfidence =
    Number(
      brain?.score?.global ||
      0
    );

  /*
   * Contradiction forte.
   */

  if (
    hasHighContradiction
  ) {
    return Math.max(
      25,
      Math.min(
        legacyConfidence,
        decisionConfidence ||
        brainConfidence ||
        legacyConfidence
      )
    );
  }

  /*
   * Decision Engine fort.
   */

  if (
    decisionConfidence >= 85
  ) {
    return Math.min(
      97,
      Math.max(
        legacyConfidence,
        Math.round(
          legacyConfidence * 0.35 +
          decisionConfidence * 0.65
        )
      )
    );
  }

  /*
   * Decision Engine moyen.
   */

  if (
    decisionConfidence >= 70
  ) {
    return Math.min(
      92,
      Math.max(
        legacyConfidence,
        Math.round(
          legacyConfidence * 0.60 +
          decisionConfidence * 0.40
        )
      )
    );
  }

  /*
   * Sinon Legacy garde la main.
   */

  return legacyConfidence;
}

/**
 * =====================================================
 * WARNINGS
 * =====================================================
 */

function fuseWarnings({
  adapted,
  decision,
  hasHighContradiction
}) {
  const warnings =
    Array.isArray(
      adapted?.warnings
    )
      ? [...adapted.warnings]
      : [];

  /*
   * Une décision claire sans action
   * permet de retirer les avertissements
   * génériques liés au paiement/action.
   */

  if (
    decision?.actionRequired ===
      false &&
    Number(
      decision?.confidence || 0
    ) >= 80
  ) {
    return warnings.filter(
      (warning) =>
        !isGenericActionWarning(
          warning
        )
    );
  }

  if (
    hasHighContradiction
  ) {
    const message =
      "Didou a détecté des informations contradictoires : vérifiez le document avant d’agir.";

    if (
      !warnings.some(
        (item) =>
          normalizeComparable(
            item
          ) ===
          normalizeComparable(
            message
          )
      )
    ) {
      warnings.push(
        message
      );
    }
  }

  return warnings;
}

/**
 * =====================================================
 * UNCERTAINTIES
 * =====================================================
 */

function fuseUncertainties({
  adapted,
  decision,
  hasHighContradiction
}) {
  const uncertainties =
    Array.isArray(
      adapted?.uncertainties
    )
      ? [...adapted.uncertainties]
      : [];

  /*
   * Une décision forte peut supprimer les incertitudes
   * purement génériques, mais jamais une vraie
   * information métier manquante.
   */

  if (
    Number(
      decision?.confidence || 0
    ) >= 88 &&
    !hasHighContradiction
  ) {
    return uncertainties.filter(
      (uncertainty) =>
        !isGenericUnderstandingUncertainty(
          uncertainty
        )
    );
  }

  return uncertainties;
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
 * WARNINGS GENERIQUES
 * =====================================================
 */

function isGenericActionWarning(
  value
) {
  const text =
    normalizeText(
      value
    );

  return (
    /verifier le mode de paiement/.test(
      text
    ) ||
    /verifiez le mode de paiement/.test(
      text
    ) ||
    /verifier le montant avant d agir/.test(
      text
    ) ||
    /verifiez le montant avant d agir/.test(
      text
    )
  );
}

/**
 * =====================================================
 * INCERTITUDES GENERIQUES
 * =====================================================
 */

function isGenericUnderstandingUncertainty(
  value
) {
  const text =
    normalizeText(
      value
    );

  return (
    /pas pu etre confirme avec certitude/.test(
      text
    ) ||
    /pas suffisamment fiable/.test(
      text
    ) ||
    /type exact.*incertain/.test(
      text
    ) ||
    /document.*pas ete identifie avec certitude/.test(
      text
    )
  );
}

/**
 * =====================================================
 * TYPE UTILE ?
 * =====================================================
 */

function isUsefulDocumentType(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (!text) {
    return false;
  }

  return ![
    "document",
    "autre",
    "document autre",
    "document administratif",
    "document inconnu"
  ].includes(
    text
  );
}

/**
 * =====================================================
 * PURPOSE UTILE ?
 * =====================================================
 */

function isUsefulPurpose(
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
    /document appartenant a la famille/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /document administratif/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /presenter votre situation/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

/**
 * =====================================================
 * WHY RECEIVED UTILE ?
 * =====================================================
 */

function isUsefulWhyReceived(
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
    /document administratif/.test(
      text
    ) ||
    /document recu/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

/**
 * =====================================================
 * LABEL INTENT
 * =====================================================
 */

function labelIntent(
  type
) {
  switch (
    String(
      type || ""
    )
  ) {
    case "proof":
      return (
        "Attestation / justificatif"
      );

    case "refund":
      return "Remboursement";

    case "payment":
      return (
        "Paiement / règlement"
      );

    case "meeting":
      return (
        "Convocation / réunion"
      );

    case "decision":
      return "Décision";

    case "contract":
      return "Contrat";

    case "declaration":
      return "Déclaration";

    case "notification":
      return "Notification";

    case "request":
      return "Action demandée";

    default:
      return "Information";
  }
}

/**
 * =====================================================
 * LABEL MONTANT
 * =====================================================
 */

function labelAmountRole(
  role
) {
  const text =
    normalizeRole(
      role
    );

  if (
    text.includes(
      "refund"
    ) ||
    text.includes(
      "rembours"
    )
  ) {
    return (
      "Montant du remboursement"
    );
  }

  if (
    text.includes(
      "automaticdebit"
    ) ||
    text === "debit"
  ) {
    return (
      "Montant du prélèvement"
    );
  }

  if (
    text.includes(
      "amountdue"
    ) ||
    text.includes(
      "paymentdue"
    ) ||
    text === "due"
  ) {
    return (
      "Montant à payer"
    );
  }

  if (
    text.includes(
      "paid"
    )
  ) {
    return (
      "Montant payé"
    );
  }

  return "Montant";
}

/**
 * =====================================================
 * MEANING MONTANT
 * =====================================================
 */

function buildAmountMeaning(
  role
) {
  const text =
    normalizeRole(
      role
    );

  if (
    text.includes(
      "refund"
    )
  ) {
    return (
      "Somme qui doit vous être remboursée"
    );
  }

  if (
    text.includes(
      "automaticdebit"
    ) ||
    text === "debit"
  ) {
    return (
      "Somme prévue en prélèvement automatique"
    );
  }

  if (
    text.includes(
      "amountdue"
    ) ||
    text.includes(
      "paymentdue"
    )
  ) {
    return (
      "Somme restant à régler"
    );
  }

  return (
    "Montant principal retenu par Didou"
  );
}

/**
 * =====================================================
 * LABEL DATE
 * =====================================================
 */

function labelDateRole(
  role
) {
  const text =
    normalizeRole(
      role
    );

  if (
    text.includes(
      "meeting"
    )
  ) {
    return (
      "Date du rendez-vous"
    );
  }

  if (
    text.includes(
      "deadline"
    )
  ) {
    return "Date limite";
  }

  if (
    text.includes(
      "refund"
    )
  ) {
    return (
      "Date du remboursement"
    );
  }

  if (
    text.includes(
      "debit"
    )
  ) {
    return (
      "Date du prélèvement"
    );
  }

  if (
    text.includes(
      "payment"
    )
  ) {
    return (
      "Date du paiement"
    );
  }

  if (
    text.includes(
      "coveredperiod"
    )
  ) {
    return (
      "Période concernée"
    );
  }

  return "Date";
}

/**
 * =====================================================
 * MEANING DATE
 * =====================================================
 */

function buildDateMeaning(
  role
) {
  const text =
    normalizeRole(
      role
    );

  if (
    text.includes(
      "meeting"
    )
  ) {
    return (
      "Date de la réunion ou du rendez-vous"
    );
  }

  if (
    text.includes(
      "deadline"
    )
  ) {
    return (
      "Date avant laquelle une action peut être nécessaire"
    );
  }

  if (
    text.includes(
      "refund"
    )
  ) {
    return (
      "Date prévue du remboursement"
    );
  }

  if (
    text.includes(
      "debit"
    )
  ) {
    return (
      "Date prévue du prélèvement"
    );
  }

  return (
    "Date principale retenue par Didou"
  );
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function cleanText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

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
    );
}
