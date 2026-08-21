/**
 * Didou Brain — Fusion V4.1
 *
 * OBJECTIF :
 *
 * La fusion utilise en priorité :
 *
 * - le type documentaire final issu du Consensus Engine
 * - brain.decision
 * - les entités du Brain
 * - le Legacy Adapter uniquement comme fallback
 *
 * IMPORTANT V4.1 :
 *
 * La sélection de mainDate et mainAmount devient dépendante
 * du type documentaire final.
 *
 * Exemple :
 *
 * Convocation AG copropriété
 *
 * - priorité à la date de l'assemblée
 * - rejet des dates juridiques / arrêtés / annexes
 * - aucun montant principal par défaut
 * - les devis et travaux restent des informations contextuelles
 *
 * Architecture :
 *
 * Legacy Adapter
 *      +
 * Brain Decision
 *      +
 * Brain Consensus
 *      ↓
 * Fusion V4.1
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
   *
   * V4.1 :
   *
   * La sélection dépend maintenant du type documentaire.
   */

  result.mainAmount =
    fuseDecisionAmount({
      brain,
      decision,
      adapted,
      hasHighContradiction,
      documentType:
        result.documentType
    });

  /*
   * =====================================================
   * 5 — DATE PRINCIPALE
   * =====================================================
   *
   * V4.1 :
   *
   * Pour une convocation AG, on recherche explicitement
   * la date de l'assemblée et non simplement la date
   * ayant la meilleure confiance globale.
   */

  result.mainDate =
    fuseDecisionDate({
      brain,
      decision,
      adapted,
      hasHighContradiction,
      documentType:
        result.documentType
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
      adapted,
      documentType:
        result.documentType,
      mainAmount:
        result.mainAmount,
      mainDate:
        result.mainDate
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
    applied: true,

    version:
      "4.1-contextual",

    decision:
      decision ||
      null,

    consensus:
      brain?.consensus ||
      null,

    finalDocumentType:
      result.documentType ||
      null,

    contextualMainDate:
      result.mainDate ||
      null,

    contextualMainAmount:
      result.mainAmount ||
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
   * =====================================================
   * V4.1 — CONSENSUS PRIORITAIRE
   * =====================================================
   *
   * Le consensus représente le type documentaire final.
   *
   * Plusieurs structures sont supportées afin de garder
   * la Fusion compatible avec différentes versions
   * du Consensus Engine.
   */

  const consensusType =
    getConsensusDocumentType(
      brain?.consensus
    );

  const consensusConfidence =
    getConsensusConfidence(
      brain?.consensus
    );

  if (
    isUsefulDocumentType(
      consensusType
    ) &&
    (
      consensusConfidence === null ||
      consensusConfidence >= 60
    )
  ) {
    return consensusType;
  }

  /*
   * Type Legacy précis.
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
        ?.confidence ||
      0
    ) >= 85
  ) {
    return (
      "Attestation / justificatif"
    );
  }

  return (
    consensusType ||
    current ||
    brainType ||
    detected ||
    null
  );
}

/**
 * =====================================================
 * CONSENSUS — TYPE DOCUMENTAIRE
 * =====================================================
 */

function getConsensusDocumentType(
  consensus
) {
  if (
    !consensus ||
    typeof consensus !== "object"
  ) {
    return null;
  }

  const candidates = [
    consensus?.documentType,
    consensus?.finalDocumentType,
    consensus?.type,

    consensus?.winner
      ?.documentType,

    consensus?.winner
      ?.type,

    consensus?.selected
      ?.documentType,

    consensus?.selected
      ?.type,

    consensus?.result
      ?.documentType,

    consensus?.result
      ?.type
  ];

  for (
    const candidate
    of candidates
  ) {
    const value =
      cleanText(
        candidate
      );

    if (
      isUsefulDocumentType(
        value
      )
    ) {
      return value;
    }
  }

  return null;
}

function getConsensusConfidence(
  consensus
) {
  if (
    !consensus ||
    typeof consensus !== "object"
  ) {
    return null;
  }

  const candidates = [
    consensus?.confidence,
    consensus?.finalConfidence,
    consensus?.score,

    consensus?.winner
      ?.confidence,

    consensus?.selected
      ?.confidence,

    consensus?.result
      ?.confidence
  ];

  for (
    const candidate
    of candidates
  ) {
    const numeric =
      Number(
        candidate
      );

    if (
      Number.isFinite(
        numeric
      )
    ) {
      /*
       * Certains moteurs utilisent un score
       * supérieur à 100.
       *
       * Dans ce cas on ne l'utilise pas comme
       * pourcentage : le fait que le consensus
       * ait fourni un type utile suffit.
       */

      if (
        numeric > 100
      ) {
        return null;
      }

      return numeric;
    }
  }

  return null;
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
      decision?.confidence ||
      0
    );

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

  const intentType =
    decision?.intent?.type ||
    brain?.intent?.type ||
    null;

  if (
    intentType ===
    "proof"
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

  if (current) {
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
 * TYPE : CONVOCATION AG COPROPRIETE
 * =====================================================
 */

function isCondoGeneralMeetingDocument(
  documentType
) {
  const text =
    normalizeText(
      documentType
    );

  if (!text) {
    return false;
  }

  const hasMeeting =
    (
      text.includes(
        "assemblee generale"
      ) ||
      text.includes(
        "assemblee"
      ) ||
      /\bag\b/.test(
        text
      )
    );

  const hasConvocation =
    text.includes(
      "convocation"
    );

  const hasCondo =
    (
      text.includes(
        "copropriete"
      ) ||
      text.includes(
        "coproprietaire"
      ) ||
      text.includes(
        "syndic"
      )
    );

  /*
   * Cas précis :
   * Convocation à une AG de copropriété.
   */

  if (
    hasConvocation &&
    hasMeeting &&
    hasCondo
  ) {
    return true;
  }

  /*
   * Compatibilité avec un type plus court
   * du style "Convocation AG".
   */

  if (
    hasConvocation &&
    hasMeeting
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * MONTANT PRINCIPAL
 * =====================================================
 */

function fuseDecisionAmount({
  decision,
  adapted,
  hasHighContradiction,
  documentType
}) {
  /*
   * =====================================================
   * V4.1 — REGLE METIER AG
   * =====================================================
   *
   * Une convocation AG peut contenir :
   *
   * - devis
   * - budgets
   * - appels de fonds
   * - travaux
   * - résolutions chiffrées
   *
   * Ces montants ne représentent PAS le montant
   * principal du document.
   *
   * On neutralise donc mainAmount par défaut.
   */

  if (
    isCondoGeneralMeetingDocument(
      documentType
    )
  ) {
    return null;
  }

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

  if (
    candidate?.verified !==
    true
  ) {
    return current;
  }

  const mapped =
    mapDecisionAmount(
      candidate
    );

  if (!current) {
    return mapped;
  }

  if (
    normalizeComparable(
      current?.value
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
            current?.confidence ||
            0
          ),
          Number(
            candidate?.confidence ||
            0
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
        amount?.confidence ||
        0
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
  brain,
  decision,
  adapted,
  hasHighContradiction,
  documentType
}) {
  /*
   * =====================================================
   * V4.1 — REGLE METIER AG
   * =====================================================
   */

  if (
    isCondoGeneralMeetingDocument(
      documentType
    )
  ) {
    const meetingDate =
      pickGeneralMeetingDate({
        brain,
        decision,
        adapted
      });

    /*
     * Pour une AG, mieux vaut ne retourner aucune
     * mainDate qu'afficher une date juridique historique
     * provenant d'une annexe.
     */

    if (!meetingDate) {
      return null;
    }

    return mapContextualMeetingDate(
      meetingDate
    );
  }

  /*
   * =====================================================
   * COMPORTEMENT STANDARD
   * =====================================================
   */

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
    candidate?.verified !==
    true
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
            current?.confidence ||
            0
          ),
          Number(
            candidate?.confidence ||
            0
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

  if (
    candidateConfidence >= 90 &&
    candidateConfidence >=
      currentConfidence + 12
  ) {
    return mapped;
  }

  return current;
}

/**
 * =====================================================
 * SELECTION DATE AG
 * =====================================================
 */

function pickGeneralMeetingDate({
  brain,
  decision,
  adapted
}) {
  const candidates = [];

  /*
   * =====================================================
   * 1 — DATES BRUTES DU BRAIN
   * =====================================================
   */

  for (
    const date
    of Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : []
  ) {
    if (
      !date?.value
    ) {
      continue;
    }

    candidates.push({
      value:
        date.value,

      role:
        date.role ||
        date.hint ||
        "unknown",

      confidence:
        Number(
          date.confidence ||
          0
        ),

      verified:
        Boolean(
          date.verified
        ),

      context:
        cleanText(
          [
            date?.context,
            date?.evidence?.quote,
            date?.hint
          ]
            .filter(Boolean)
            .join(" ")
        ),

      source:
        "didou-brain-date"
    });
  }

  /*
   * =====================================================
   * 2 — EVENEMENT / SITUATION
   * =====================================================
   */

  const situationDate =
    brain?.situation
      ?.event
      ?.date ||
    null;

  if (
    situationDate?.value
  ) {
    candidates.push({
      value:
        situationDate.value,

      role:
        situationDate.role ||
        "meeting",

      confidence:
        Number(
          situationDate.confidence ||
          0
        ),

      verified:
        Boolean(
          situationDate.verified
        ),

      context:
        cleanText(
          [
            situationDate?.context,
            situationDate?.evidence
              ?.quote,
            "réunion assemblée convocation"
          ]
            .filter(Boolean)
            .join(" ")
        ),

      source:
        "didou-situation",

      situationMeeting:
        true
    });
  }

  /*
   * =====================================================
   * 3 — DECISION ENGINE
   * =====================================================
   */

  const decisionDate =
    decision?.primaryDate ||
    null;

  if (
    decisionDate?.value
  ) {
    candidates.push({
      value:
        decisionDate.value,

      role:
        decisionDate.role ||
        "unknown",

      confidence:
        Number(
          decisionDate.confidence ||
          0
        ),

      verified:
        Boolean(
          decisionDate.verified
        ),

      context:
        cleanText(
          [
            decisionDate?.context,
            decisionDate?.evidence
              ?.quote
          ]
            .filter(Boolean)
            .join(" ")
        ),

      source:
        "didou-decision"
    });
  }

  /*
   * =====================================================
   * 4 — LEGACY
   * =====================================================
   */

 if (
  adapted?.mainDate?.date
) {
  candidates.push({
    value:
      adapted.mainDate.date,

    time:
      adapted.mainDate.time ||
      null,

    place:
      adapted.mainDate.place ||
      null,

    legacyMeaning:
      adapted.mainDate.meaning ||
      null,

    role:
      adapted.mainDate.role ||
      "meetingDate",

    confidence:
      Number(
        adapted.mainDate
          ?.confidence ||
        adapted?.confidence ||
        95
      ),

    verified:
      true,

    context:
      cleanText(
        [
          adapted.mainDate
            ?.label,
          adapted.mainDate
            ?.meaning,
          adapted.mainDate
            ?.time,
          adapted.mainDate
            ?.place
        ]
          .filter(Boolean)
          .join(" ")
      ),

    source:
      "legacy-condo-meeting"
  });
}
  /*
   * =====================================================
   * SUPPRESSION DES DOUBLONS
   * =====================================================
   */

  const unique =
    deduplicateDateCandidates(
      candidates
    );

  /*
   * =====================================================
   * SCORING METIER
   * =====================================================
   */

  const ranked =
    unique
      .map(
        (candidate) => ({
          ...candidate,

          contextualScore:
            scoreGeneralMeetingDate(
              candidate
            )
        })
      )
      .sort(
        (a, b) =>
          b.contextualScore -
          a.contextualScore
      );

  const winner =
    ranked[0] ||
    null;

  /*
   * Il faut au minimum un vrai signal métier.
   *
   * Une date avec seulement confidence=95 mais
   * aucun lien avec l'assemblée ne doit pas gagner.
   */

  if (
    !winner ||
    winner.contextualScore < 130
  ) {
    return null;
  }

  return winner;
}

function scoreGeneralMeetingDate(
  candidate
) {
  let score =
    Number(
      candidate?.confidence ||
      0
    );

  const role =
    normalizeRole(
      candidate?.role
    );

  const context =
    normalizeText(
      candidate?.context
    );

  /*
   * =====================================================
   * SIGNAUX TRES FORTS
   * =====================================================
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
    ) ||
    role.includes(
      "appointment"
    )
  ) {
    score += 180;
  }

  if (
    candidate
      ?.situationMeeting
  ) {
    score += 180;
  }

  /*
   * =====================================================
   * CONTEXTE AG
   * =====================================================
   */

  if (
    context.includes(
      "assemblee generale"
    )
  ) {
    score += 180;
  }

  if (
    context.includes(
      "assemblee"
    )
  ) {
    score += 100;
  }

  if (
    context.includes(
      "convocation"
    )
  ) {
    score += 120;
  }

  if (
    context.includes(
      "reunion"
    )
  ) {
    score += 100;
  }

  if (
    context.includes(
      "se tiendra"
    ) ||
    context.includes(
      "aura lieu"
    ) ||
    context.includes(
      "est convoquee"
    ) ||
    context.includes(
      "sont convoques"
    )
  ) {
    score += 120;
  }

  /*
   * Heure à proximité :
   *
   * très bon indice qu'il s'agit d'un événement.
   */

  if (
    /\b\d{1,2}\s*h(?:\s*\d{2})?\b/.test(
      context
    ) ||
    /\b\d{1,2}:\d{2}\b/.test(
      context
    )
  ) {
    score += 50;
  }

  /*
   * =====================================================
   * ROLE DEADLINE
   * =====================================================
   *
   * Une deadline peut être importante,
   * mais ce n'est pas la date de l'AG.
   */

  if (
    role.includes(
      "deadline"
    )
  ) {
    score -= 80;
  }

  /*
   * =====================================================
   * CONTEXTES HISTORIQUES / JURIDIQUES
   * =====================================================
   *
   * Exemple réel :
   *
   * "arrêté du 16 juillet 2019"
   *
   * Cette date ne doit jamais devenir la date
   * principale d'une convocation AG.
   */

  if (
    /\barrete\b/.test(
      context
    )
  ) {
    score -= 260;
  }

  if (
    /\bdecret\b/.test(
      context
    )
  ) {
    score -= 230;
  }

  if (
    /\bloi\b/.test(
      context
    )
  ) {
    score -= 180;
  }

  if (
    /\barticle\b/.test(
      context
    )
  ) {
    score -= 120;
  }

  if (
    /\bordonnance\b/.test(
      context
    )
  ) {
    score -= 180;
  }

  /*
   * =====================================================
   * ANNEXES / DEVIS
   * =====================================================
   */

  if (
    context.includes(
      "annexe"
    )
  ) {
    score -= 120;
  }

  if (
    context.includes(
      "devis"
    )
  ) {
    score -= 130;
  }

  if (
    context.includes(
      "facture"
    )
  ) {
    score -= 100;
  }

  /*
   * =====================================================
   * VERIFICATION
   * =====================================================
   */

  if (
    candidate?.verified ===
    true
  ) {
    score += 20;
  }

  return score;
}

function deduplicateDateCandidates(
  candidates
) {
  const map =
    new Map();

  for (
    const candidate
    of candidates
  ) {
    if (
      !candidate?.value
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        candidate.value
      );

    if (!key) {
      continue;
    }

    const existing =
      map.get(
        key
      );

    if (!existing) {
      map.set(
        key,
        candidate
      );

      continue;
    }

    /*
     * Si la même date existe dans plusieurs couches,
     * on fusionne les contextes et on garde
     * la meilleure confiance.
     */

    map.set(
      key,
      {
        ...existing,

        confidence:
          Math.max(
            Number(
              existing
                ?.confidence ||
              0
            ),
            Number(
              candidate
                ?.confidence ||
              0
            )
          ),

        verified:
          Boolean(
            existing?.verified ||
            candidate?.verified
          ),

        situationMeeting:
          Boolean(
            existing
              ?.situationMeeting ||
            candidate
              ?.situationMeeting
          ),

        context:
          cleanText(
            [
              existing?.context,
              candidate?.context
            ]
              .filter(Boolean)
              .join(" ")
          ),

        role:
          isMeetingRole(
            candidate?.role
          )
            ? candidate.role
            : existing.role,

        source:
          cleanText(
            [
              existing?.source,
              candidate?.source
            ]
              .filter(Boolean)
              .join("+")
          )
      }
    );
  }

  return Array.from(
    map.values()
  );
}

function mapContextualMeetingDate(
  date
) {
  return {
    date:
      date?.value ||
      null,

    time:
      date?.time ||
      null,

    place:
      date?.place ||
      null,

    label:
      "Date de l'assemblée générale",

    meaning:
      date?.legacyMeaning ||
      buildContextualMeetingMeaning(
        date
      ),

    role:
      "meetingDate",

    confidence:
      Math.min(
        99,
        Math.max(
          Number(
            date?.confidence ||
            0
          ),
          90
        )
      ),

    source:
      "didou-contextual-fusion"
  };
}

function buildContextualMeetingMeaning(
  date
) {
  const parts = [];

  if (
    date?.time
  ) {
    parts.push(
      `à ${date.time}`
    );
  }

  if (
    date?.place
  ) {
    parts.push(
      `à ${date.place}`
    );
  }

  if (
    !parts.length
  ) {
    return (
      "Date prévue de l'assemblée générale"
    );
  }

  return (
    `Assemblée générale ${parts.join(" ")}`
  );
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
        date?.confidence ||
        0
      ),

    source:
      "didou-decision"
  };
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
        date?.confidence ||
        0
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

  if (
    decision?.actionRequired ===
      false &&
    Number(
      decision?.confidence ||
      0
    ) >= 78
  ) {
    return [];
  }

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
              action?.confidence ||
              0
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

    return legacyActions.filter(
      (action) =>
        isUsefulAction(
          typeof action ===
          "string"
            ? action
            : action?.action
        )
    );
  }

  return legacyActions.filter(
    (action) =>
      isUsefulAction(
        typeof action ===
        "string"
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
  adapted,
  documentType,
  mainAmount,
  mainDate
}) {
  const result = [];

  const seen =
    new Set();

  const isGeneralMeeting =
    isCondoGeneralMeetingDocument(
      documentType
    );

  /*
   * =====================================================
   * 1 — LEGACY
   * =====================================================
   *
   * V4.1 :
   *
   * Pour une AG :
   *
   * - on retire les anciens faits "amount"
   * - on retire les anciennes dates afin d'éviter
   *   qu'une date juridique comme 2019 réapparaisse
   */

  for (
    const fact
    of Array.isArray(
      adapted?.importantFacts
    )
      ? adapted.importantFacts
      : []
  ) {
    if (
      isGeneralMeeting &&
      isAmountFact(
        fact
      )
    ) {
      continue;
    }

    if (
      isGeneralMeeting &&
      isDateFact(
        fact
      )
    ) {
      continue;
    }

    addFact({
      result,
      seen,
      fact
    });
  }

  /*
   * =====================================================
   * 2 — INTENTION
   * =====================================================
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
   * =====================================================
   * 3 — MONTANT
   * =====================================================
   *
   * On utilise désormais le montant FINAL de Fusion,
   * et non directement decision.primaryAmount.
   */

  if (
    !isGeneralMeeting &&
    mainAmount?.value
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "amount",

        label:
          mainAmount.label ||
          labelAmountRole(
            mainAmount.role
          ),

        value:
          mainAmount.value,

        confidence:
          mainAmount.confidence ||
          0,

        source:
          mainAmount.source ||
          "didou-fusion"
      }
    });
  }

  /*
   * =====================================================
   * 4 — DATE
   * =====================================================
   *
   * On utilise la date FINALE après arbitrage contextuel.
   */

  if (
    mainDate?.date
  ) {
    addFact({
      result,
      seen,

      fact: {
        kind:
          "date",

        label:
          mainDate.label ||
          labelDateRole(
            mainDate.role
          ),

        value:
          mainDate.date,

        confidence:
          mainDate.confidence ||
          0,

        source:
          mainDate.source ||
          "didou-fusion"
      }
    });
  }

  /*
   * =====================================================
   * 5 — EMETTEUR
   * =====================================================
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

function isAmountFact(
  fact
) {
  const kind =
    normalizeText(
      fact?.kind
    );

  const label =
    normalizeText(
      fact?.label
    );

  return (
    kind === "amount" ||
    label.includes(
      "montant"
    ) ||
    label.includes(
      "somme"
    )
  );
}

function isDateFact(
  fact
) {
  const kind =
    normalizeText(
      fact?.kind
    );

  const label =
    normalizeText(
      fact?.label
    );

  return (
    kind === "date" ||
    label.includes(
      "date"
    ) ||
    label.includes(
      "echeance"
    )
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
    seen.has(
      key
    )
  ) {
    return;
  }

  seen.add(
    key
  );

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
      decision?.confidence ||
      0
    );

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
   * Pour une convocation AG, le type documentaire
   * final est suffisamment explicite pour produire
   * une explication métier précise.
   */

  if (
    isCondoGeneralMeetingDocument(
      documentType
    )
  ) {
    return (
      "Ce document vous convoque à une assemblée générale de copropriété et présente les sujets qui seront examinés ou soumis au vote."
    );
  }

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
            documentType ||
            ""
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

  if (
    decision?.actionRequired ===
      false &&
    Number(
      decision?.confidence ||
      0
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

  if (
    Number(
      decision?.confidence ||
      0
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
      type ||
      ""
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
 * ROLE MEETING ?
 * =====================================================
 */

function isMeetingRole(
  role
) {
  const text =
    normalizeRole(
      role
    );

  return (
    text.includes(
      "meeting"
    ) ||
    text.includes(
      "assembly"
    ) ||
    text.includes(
      "assemblee"
    ) ||
    text.includes(
      "appointment"
    )
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
    value ||
    ""
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
