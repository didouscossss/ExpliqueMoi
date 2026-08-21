/**
 * =====================================================
 * F — Résumé utilisateur V4.1
 * =====================================================
 *
 * Objectifs :
 *
 * - utiliser brainFusion.consensus en priorité ;
 * - utiliser brainFusion.decision comme moteur secondaire ;
 * - empêcher une ancienne décision Brain de contredire
 *   un consensus corrigé par le Knowledge Reasoner ;
 * - produire une réponse naturelle et directe ;
 * - conserver l'ancien comportement comme fallback ;
 * - éviter les faux ordres et les répétitions ;
 * - prendre en charge DATE + HEURE ;
 *
 * Priorité :
 *
 * CONSENSUS
 *    ↓
 * DECISION ENGINE
 *    ↓
 * BRAIN
 *    ↓
 * LEGACY
 *
 * Situations principales :
 *
 * - remboursement
 * - prélèvement
 * - paiement
 * - réunion / convocation
 * - attestation
 * - contrat
 * - décision
 * - déclaration
 * - notification
 */

export function buildUserFacingExplanation(
  partial
) {
  /*
   * =====================================================
   * BRAIN FUSION
   * =====================================================
   */

  const brainFusion =
    partial?.brainFusion ||
    null;

  /*
   * =====================================================
   * CONSENSUS
   * =====================================================
   *
   * IMPORTANT :
   *
   * Le Consensus Engine est maintenant l'arbitre final
   * lorsqu'il a réussi à corriger ou confirmer
   * l'interprétation du document.
   */

  const consensus =
    brainFusion?.consensus ||
    null;

  /*
   * =====================================================
   * DECISION LEGACY / BRAIN
   * =====================================================
   */

  const rawDecision =
    brainFusion?.decision ||
    null;

  /*
   * =====================================================
   * DECISION EFFECTIVE
   * =====================================================
   *
   * On construit une vision cohérente.
   *
   * Le consensus peut corriger :
   *
   * - intent
   * - situation
   * - actionRequired
   * - documentType
   * - family
   *
   * Mais on conserve les données structurées utiles
   * de la Decision :
   *
   * - primaryDate
   * - primaryAmount
   * - actions
   */

  const decision =
    buildEffectiveDecision({
      rawDecision,
      consensus
    });

  /*
   * =====================================================
   * TYPE
   * =====================================================
   */

  const type =
    cleanType(
      consensus?.documentType ||
      partial?.documentType
    );

  /*
   * =====================================================
   * FAMILLE
   * =====================================================
   */

  const family =
    String(
      consensus?.family ||
      partial?.family ||
      ""
    )
      .trim();

  /*
   * =====================================================
   * NIVEAU DE COMPREHENSION
   * =====================================================
   */

  const level =
    partial?.understandingLevel ||
    "extraction";

  /*
   * =====================================================
   * INTENTION
   * =====================================================
   */

  const brainIntent =
    buildEffectiveIntent({
      consensus,
      decision,
      brainFusion
    });

  /*
   * =====================================================
   * SITUATION
   * =====================================================
   */

  const brainSituation =
    buildEffectiveSituation({
      consensus,
      decision,
      brainFusion
    });

  /*
   * =====================================================
   * CONFIANCE
   * =====================================================
   */

  const decisionConfidence =
    Math.max(
      Number(
        consensus?.confidence ||
        0
      ),
      Number(
        decision?.confidence ||
        0
      )
    );

  /*
   * =====================================================
   * DEBUG
   * =====================================================
   */

  console.log(
    "[USER SUMMARY V4.1]",
    {
      consensus,
      rawDecision,
      effectiveDecision:
        decision,
      type,
      family,
      brainIntent,
      brainSituation,
      mainDate:
        partial?.mainDate ||
        null
    }
  );

  /*
   * =====================================================
   * DOCUMENT NON COMPRIS
   * =====================================================
   */

  if (
    level === "extraction" &&
    !hasStrongDecision(
      decision
    ) &&
    !hasStrongBrainUnderstanding({
      brainIntent,
      brainSituation
    }) &&
    !hasStrongConsensus(
      consensus
    )
  ) {
    return {
      document_label:
        "Document non compris",

      one_sentence:
        "Didou n’a pas trouvé suffisamment d’informations fiables pour expliquer ce document.",

      important_points:
        []
    };
  }

  if (
    !hasUsefulInformation(
      partial
    ) &&
    !hasStrongDecision(
      decision
    ) &&
    !hasStrongBrainUnderstanding({
      brainIntent,
      brainSituation
    }) &&
    !hasStrongConsensus(
      consensus
    )
  ) {
    return {
      document_label:
        "Document non compris",

      one_sentence:
        "Didou n’a pas trouvé suffisamment d’informations fiables pour expliquer ce document.",

      important_points:
        []
    };
  }

  /*
   * =====================================================
   * LABEL
   * =====================================================
   */

  const documentLabel =
    buildDocumentLabel({
      type,
      family,
      level,
      decision,
      brainIntent,
      consensus
    });

  /*
   * =====================================================
   * PHRASE PRINCIPALE
   * =====================================================
   */

  const sentence =
    buildMainSentence({
      partial,
      type,
      family,
      level,
      decision,
      brainIntent,
      brainSituation,
      decisionConfidence,
      consensus
    });

  /*
   * =====================================================
   * POINTS IMPORTANTS
   * =====================================================
   */

  const importantPoints =
    buildImportantPoints({
      partial,
      mainSentence:
        sentence,
      decision,
      consensus
    });

  return {
    document_label:
      documentLabel,

    one_sentence:
      sentence,

    important_points:
      importantPoints
  };
}

/**
 * =====================================================
 * DECISION EFFECTIVE
 * =====================================================
 *
 * C'est une des corrections majeures de V4.1.
 *
 * Avant :
 *
 * consensus = meeting
 * decision = proof
 *
 * userSummary pouvait continuer à utiliser "proof".
 *
 * Maintenant :
 *
 * si le consensus est suffisamment fiable,
 * il devient la référence sémantique.
 */

function buildEffectiveDecision({
  rawDecision,
  consensus
}) {
  if (
    !rawDecision &&
    !consensus
  ) {
    return null;
  }

  /*
   * ===================================================
   * BASE DECISION
   * ===================================================
   */

  const result = {
    ...(rawDecision || {})
  };

  /*
   * ===================================================
   * PAS DE CONSENSUS
   * ===================================================
   */

  if (
    !consensus
  ) {
    return result;
  }

  const consensusConfidence =
    Number(
      consensus?.confidence ||
      0
    );

  /*
   * ===================================================
   * CONSENSUS UTILISABLE ?
   * ===================================================
   */

  const consensusStrong =
    consensusConfidence >= 70 ||
    consensus?.winner ===
      "knowledge" ||
    consensus?.winner ===
      "consensus" ||
    consensus?.corrected ===
      true;

  if (
    !consensusStrong
  ) {
    return result;
  }

  /*
   * ===================================================
   * INTENT
   * ===================================================
   */

  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  if (
    consensusIntent
  ) {
    result.intent = {
      ...(result?.intent || {}),

      type:
        consensusIntent,

      confidence:
        Math.max(
          Number(
            result?.intent
              ?.confidence ||
            0
          ),
          consensusConfidence
        ),

      source:
        "didou-consensus"
    };
  }

  /*
   * ===================================================
   * SITUATION
   * ===================================================
   */

  const consensusSituation =
    normalizeSemanticType(
      consensus?.situation
    );

  if (
    consensusSituation
  ) {
    result.primarySituation = {
      ...(result
        ?.primarySituation ||
        {}),

      type:
        consensusSituation,

      confidence:
        Math.max(
          Number(
            result
              ?.primarySituation
              ?.confidence ||
            0
          ),
          consensusConfidence
        ),

      source:
        "didou-consensus"
    };
  } else if (
    consensusIntent ===
      "meeting"
  ) {
    /*
     * Une convocation / réunion reconnue par le
     * consensus doit être traitée comme une réunion
     * même si l'ancien Brain disait "proof".
     */

    result.primarySituation = {
      ...(result
        ?.primarySituation ||
        {}),

      type:
        "meeting",

      confidence:
        consensusConfidence,

      source:
        "didou-consensus"
    };
  }

  /*
   * ===================================================
   * ACTION REQUIRED
   * ===================================================
   *
   * On ne conserve pas aveuglément le false
   * de l'ancienne Decision si le consensus a corrigé
   * complètement le sens du document.
   */

  if (
    typeof consensus
      ?.actionRequired ===
      "boolean"
  ) {
    result.actionRequired =
      consensus.actionRequired;
  } else if (
    consensus?.corrected ===
      true &&
    consensusIntent &&
    rawDecision?.intent?.type &&
    normalizeSemanticType(
      rawDecision.intent.type
    ) !==
      consensusIntent
  ) {
    /*
     * Le sens du document a été corrigé mais le
     * consensus ne s'est pas prononcé sur l'action.
     *
     * Dans ce cas on NE réutilise PAS automatiquement
     * l'ancien false.
     */

    result.actionRequired =
      null;
  }

  /*
   * ===================================================
   * CONFIANCE
   * ===================================================
   */

  result.confidence =
    Math.max(
      Number(
        result?.confidence ||
        0
      ),
      consensusConfidence
    );

  /*
   * ===================================================
   * META
   * ===================================================
   */

  result.consensusApplied =
    true;

  result.consensusWinner =
    consensus?.winner ||
    null;

  result.consensusCorrected =
    consensus?.corrected ===
    true;

  return result;
}

/**
 * =====================================================
 * INTENTION EFFECTIVE
 * =====================================================
 */

function buildEffectiveIntent({
  consensus,
  decision,
  brainFusion
}) {
  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  if (
    consensusIntent &&
    isConsensusReliable(
      consensus
    )
  ) {
    return {
      type:
        consensusIntent,

      confidence:
        Number(
          consensus?.confidence ||
          0
        ),

      source:
        "didou-consensus"
    };
  }

  return (
    decision?.intent ||
    brainFusion?.intent ||
    null
  );
}

/**
 * =====================================================
 * SITUATION EFFECTIVE
 * =====================================================
 */

function buildEffectiveSituation({
  consensus,
  decision,
  brainFusion
}) {
  const consensusSituation =
    normalizeSemanticType(
      consensus?.situation
    );

  if (
    consensusSituation &&
    isConsensusReliable(
      consensus
    )
  ) {
    return {
      type:
        consensusSituation,

      confidence:
        Number(
          consensus?.confidence ||
          0
        ),

      source:
        "didou-consensus"
    };
  }

  /*
   * Un intent "meeting" suffisamment fiable constitue
   * lui-même une situation de réunion.
   */

  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  if (
    consensusIntent ===
      "meeting" &&
    isConsensusReliable(
      consensus
    )
  ) {
    return {
      type:
        "meeting",

      confidence:
        Number(
          consensus?.confidence ||
          0
        ),

      source:
        "didou-consensus"
    };
  }

  return (
    decision?.primarySituation ||
    brainFusion?.situation ||
    null
  );
}

/**
 * =====================================================
 * CONSENSUS FIABLE ?
 * =====================================================
 */

function isConsensusReliable(
  consensus
) {
  if (
    !consensus
  ) {
    return false;
  }

  if (
    consensus?.corrected ===
    true
  ) {
    return true;
  }

  if (
    consensus?.winner ===
      "knowledge" ||
    consensus?.winner ===
      "consensus"
  ) {
    return true;
  }

  return (
    Number(
      consensus?.confidence ||
      0
    ) >= 70
  );
}

/**
 * =====================================================
 * CONSENSUS FORT ?
 * =====================================================
 */

function hasStrongConsensus(
  consensus
) {
  if (
    !consensus
  ) {
    return false;
  }

  if (
    !cleanType(
      consensus?.documentType
    ) &&
    !normalizeSemanticType(
      consensus?.intent
    ) &&
    !normalizeSemanticType(
      consensus?.situation
    )
  ) {
    return false;
  }

  return (
    isConsensusReliable(
      consensus
    )
  );
}

/**
 * =====================================================
 * PHRASE PRINCIPALE
 * =====================================================
 */

function buildMainSentence({
  partial,
  type,
  family,
  level,
  decision,
  brainIntent,
  brainSituation,
  decisionConfidence,
  consensus
}) {
  /*
   * ===================================================
   * 0 — CONSENSUS REUNION / CONVOCATION
   * ===================================================
   *
   * PRIORITAIRE.
   *
   * Cela empêche une ancienne décision "proof"
   * de transformer une convocation en attestation.
   */

  if (
    isMeetingContext({
      consensus,
      decision,
      brainIntent,
      brainSituation,
      type
    })
  ) {
    const meetingSentence =
      buildMeetingSentence({
        partial,
        decision,
        type,
        family
      });

    if (
      meetingSentence
    ) {
      return meetingSentence;
    }
  }

  /*
   * ===================================================
   * 1 — DECISION ENGINE
   * ===================================================
   */

  if (
    decision &&
    decisionConfidence >= 70
  ) {
    const decisionSentence =
      buildDecisionSentence({
        partial,
        type,
        family,
        decision,
        consensus
      });

    if (
      decisionSentence
    ) {
      return decisionSentence;
    }
  }

  /*
   * ===================================================
   * 2 — SITUATIONS FINANCIERES
   * ===================================================
   */

  const financialSentence =
    buildFinancialSentence({
      partial,
      brainSituation
    });

  if (
    financialSentence
  ) {
    return financialSentence;
  }

  /*
   * ===================================================
   * 3 — ATTESTATION
   * ===================================================
   *
   * IMPORTANT :
   * jamais si le consensus dit réunion.
   */

  if (
    brainIntent?.type ===
      "proof" &&
    Number(
      brainIntent?.confidence ||
      0
    ) >= 75 &&
    !isMeetingContext({
      consensus,
      decision,
      brainIntent,
      brainSituation,
      type
    })
  ) {
    return buildProofSentence({
      type,
      family,
      brainIntent
    });
  }

  /*
   * ===================================================
   * 4 — DECISION
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "decision" &&
    Number(
      brainIntent?.confidence ||
      0
    ) >= 75
  ) {
    return (
      "Ce document vous informe d’une décision."
    );
  }

  /*
   * ===================================================
   * 5 — CONTRAT
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "contract" &&
    Number(
      brainIntent?.confidence ||
      0
    ) >= 75
  ) {
    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * 6 — DECLARATION
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "declaration" &&
    Number(
      brainIntent?.confidence ||
      0
    ) >= 75
  ) {
    return (
      "Ce document sert à déclarer ou présenter des informations."
    );
  }

  /*
   * ===================================================
   * 7 — WHY RECEIVED
   * ===================================================
   */

  const why =
    cleanSentence(
      partial?.whyReceived
    );

  if (
    why &&
    !isGenericExplanation(
      why
    ) &&
    !isContradictoryExplanation({
      value:
        why,
      consensus,
      type
    })
  ) {
    return why;
  }

  /*
   * ===================================================
   * 8 — PURPOSE
   * ===================================================
   */

  const purpose =
    cleanSentence(
      partial?.documentPurpose
    );

  if (
    purpose &&
    !isGenericExplanation(
      purpose
    ) &&
    !isContradictoryExplanation({
      value:
        purpose,
      consensus,
      type
    })
  ) {
    return purpose;
  }

  /*
   * ===================================================
   * 9 — ACTION
   * ===================================================
   */

  const action =
    firstAction(
      partial?.actions
    );

  if (
    action
  ) {
    return ensureSentence(
      `Ce document vous demande de ${lowerFirst(action)}`
    );
  }

  /*
   * ===================================================
   * 10 — DATE + HEURE
   * ===================================================
   */

  const dateTime =
    getMainDateTime({
      partial,
      decision
    });

  if (
    dateTime?.date
  ) {
    const label =
      String(
        partial?.mainDate
          ?.label ||
        "Date importante"
      );

    return ensureSentence(
      `${label} : ${formatDateTime(dateTime)}`
    );
  }

  /*
   * ===================================================
   * 11 — MONTANT
   * ===================================================
   */

  if (
    partial?.mainAmount?.value
  ) {
    const label =
      String(
        partial.mainAmount.label ||
        "Montant"
      );

    return ensureSentence(
      `${label} : ${partial.mainAmount.value}`
    );
  }

  /*
   * ===================================================
   * 12 — TYPE
   * ===================================================
   */

  if (
    type
  ) {
    if (
      level === "strong"
    ) {
      return ensureSentence(
        `Didou a identifié ${articleForType(type)}${type}`
      );
    }

    return ensureSentence(
      `Ce document semble être ${articleForType(type)}${type}`
    );
  }

  /*
   * ===================================================
   * 13 — FAMILLE
   * ===================================================
   */

  if (
    family &&
    family !== "autre"
  ) {
    return ensureSentence(
      `Didou a identifié un document ${familyLabel(family)}`
    );
  }

  return (
    "Didou a lu le document mais n’a pas identifié suffisamment d’informations utiles."
  );
}
/**
 * =====================================================
 * REUNION / CONVOCATION
 * =====================================================
 */

function isMeetingContext({
  consensus,
  decision,
  brainIntent,
  brainSituation,
  type
}) {
  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  const consensusSituation =
    normalizeSemanticType(
      consensus?.situation
    );

  const decisionIntent =
    normalizeSemanticType(
      decision?.intent?.type
    );

  const decisionSituation =
    normalizeSemanticType(
      decision?.primarySituation?.type
    );

  const intent =
    normalizeSemanticType(
      brainIntent?.type
    );

  const situation =
    normalizeSemanticType(
      brainSituation?.type
    );

  const normalizedType =
    normalizeText(
      type
    );

  /*
   * ===================================================
   * CONSENSUS
   * ===================================================
   */

  if (
    consensusIntent === "meeting" ||
    consensusSituation === "meeting"
  ) {
    return true;
  }

  /*
   * ===================================================
   * DECISION
   * ===================================================
   */

  if (
    decisionIntent === "meeting" ||
    decisionSituation === "meeting"
  ) {
    return true;
  }

  /*
   * ===================================================
   * BRAIN
   * ===================================================
   */

  if (
    intent === "meeting" ||
    situation === "meeting"
  ) {
    return true;
  }

  /*
   * ===================================================
   * TYPE DOCUMENTAIRE
   * ===================================================
   */

  if (
    /convocation/.test(
      normalizedType
    ) &&
    (
      /assemblee/.test(
        normalizedType
      ) ||
      /reunion/.test(
        normalizedType
      )
    )
  ) {
    return true;
  }

  if (
    /assemblee generale/.test(
      normalizedType
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * PHRASE REUNION
 * =====================================================
 */

function buildMeetingSentence({
  partial,
  decision,
  type,
  family
}) {
  const dateTime =
    getMainDateTime({
      partial,
      decision
    });

  const place =
    cleanText(
      partial?.mainDate
        ?.place ||
      decision?.primaryDate
        ?.place
    );

  const normalizedType =
    normalizeText(
      type
    );

  let eventName =
    "Une réunion";

  if (
    /assemblee generale/.test(
      normalizedType
    ) ||
    /assemblee/.test(
      normalizedType
    )
  ) {
    eventName =
      "Une assemblée générale";
  }

  if (
    (
      /copropriet/.test(
        normalizedType
      ) ||
      normalizeText(
        family
      ).includes(
        "copropriet"
      )
    ) &&
    (
      /assemblee/.test(
        normalizedType
      ) ||
      /convocation/.test(
        normalizedType
      )
    )
  ) {
    eventName =
      "Une assemblée générale de copropriété";
  }

  /*
   * DATE + HEURE + LIEU
   */

  if (
    dateTime?.date &&
    dateTime?.time &&
    place
  ) {
    return ensureSentence(
      `${eventName} est prévue le ${dateTime.date} à ${dateTime.time}, à ${place}`
    );
  }

  /*
   * DATE + HEURE
   */

  if (
    dateTime?.date &&
    dateTime?.time
  ) {
    return ensureSentence(
      `${eventName} est prévue le ${dateTime.date} à ${dateTime.time}`
    );
  }

  /*
   * DATE + LIEU
   */

  if (
    dateTime?.date &&
    place
  ) {
    return ensureSentence(
      `${eventName} est prévue le ${dateTime.date}, à ${place}`
    );
  }

  /*
   * DATE
   */

  if (
    dateTime?.date
  ) {
    return ensureSentence(
      `${eventName} est prévue le ${dateTime.date}`
    );
  }

  /*
   * HEURE
   */

  if (
    dateTime?.time
  ) {
    return ensureSentence(
      `${eventName} est prévue à ${dateTime.time}`
    );
  }

  if (
    /convocation/.test(
      normalizedType
    )
  ) {
    return ensureSentence(
      `Ce document vous convoque à ${lowerFirst(eventName)}`
    );
  }

  return ensureSentence(
    `${eventName} est annoncée dans ce document`
  );
}
function getMainDateTime({
  partial,
  decision
}) {
  const mainDate =
    partial?.mainDate ||
    null;

  const decisionDate =
    decision?.primaryDate ||
    null;

  /*
   * ===================================================
   * DATE
   * ===================================================
   */

  const date =
    firstUsefulValue([
      mainDate?.date,
      mainDate?.value,
      decisionDate?.value,
      decisionDate?.date
    ]);

  /*
   * ===================================================
   * HEURE EXPLICITE
   * ===================================================
   */

  let time =
    firstUsefulTime([
      mainDate?.time,
      mainDate?.hour,
      mainDate?.heure,

      decisionDate?.time,
      decisionDate?.hour,
      decisionDate?.heure,

      decisionDate?.meetingTime,

      partial?.meetingTime,
      partial?.mainTime
    ]);

  /*
   * ===================================================
   * HEURE DANS STRUCTURE DATE
   * ===================================================
   *
   * Certains extracteurs peuvent stocker :
   *
   * {
   *   date: "20/07/2026",
   *   time: "17:00"
   * }
   *
   * tandis que d'autres peuvent produire :
   *
   * {
   *   value: "20/07/2026 17:00"
   * }
   */

  if (
    !time
  ) {
    time =
      extractTimeFromValue(
        mainDate?.value
      ) ||
      extractTimeFromValue(
        mainDate?.date
      ) ||
      extractTimeFromValue(
        decisionDate?.value
      ) ||
      extractTimeFromValue(
        decisionDate?.date
      );
  }

  /*
   * ===================================================
   * HEURE DANS LE CONTEXTE / EVIDENCE
   * ===================================================
   */

  if (
    !time
  ) {
    const contextualCandidates = [
      mainDate?.context,
      mainDate?.meaning,
      mainDate?.evidence?.quote,

      decisionDate?.context,
      decisionDate?.meaning,
      decisionDate?.evidence?.quote,

      decisionDate?.evidence,
      decisionDate?.sourceText
    ];

    for (
      const candidate
      of contextualCandidates
    ) {
      const extracted =
        extractTimeFromValue(
          candidate
        );

      if (
        extracted
      ) {
        time =
          extracted;

        break;
      }
    }
  }

  return {
    date:
      cleanDateValue(
        date
      ),

    time:
      normalizeTime(
        time
      )
  };
}

/**
 * =====================================================
 * PREMIERE VALEUR UTILE
 * =====================================================
 */

function firstUsefulValue(
  values
) {
  for (
    const value
    of Array.isArray(values)
      ? values
      : []
  ) {
    const cleaned =
      cleanText(
        value
      );

    if (
      cleaned
    ) {
      return cleaned;
    }
  }

  return null;
}

/**
 * =====================================================
 * PREMIERE HEURE UTILE
 * =====================================================
 */

function firstUsefulTime(
  values
) {
  for (
    const value
    of Array.isArray(values)
      ? values
      : []
  ) {
    const normalized =
      normalizeTime(
        value
      );

    if (
      normalized
    ) {
      return normalized;
    }
  }

  return null;
}

/**
 * =====================================================
 * EXTRACTION HEURE
 * =====================================================
 *
 * Formats acceptés :
 *
 * 17:00
 * 17h00
 * 17 h 00
 * 17h
 * 9:30
 * 09h30
 *
 * On évite volontairement de considérer un simple
 * nombre isolé comme une heure.
 */

function extractTimeFromValue(
  value
) {
  const text =
    cleanText(
      typeof value === "string"
        ? value
        : value?.quote ||
          value?.value ||
          ""
    );

  if (
    !text
  ) {
    return null;
  }

  /*
   * 17:00
   * 9:30
   */

  let match =
    text.match(
      /\b([01]?\d|2[0-3])\s*:\s*([0-5]\d)\b/
    );

  if (
    match
  ) {
    return formatTimeParts(
      match[1],
      match[2]
    );
  }

  /*
   * 17h00
   * 17 h 00
   * 9h30
   */

  match =
    text.match(
      /\b([01]?\d|2[0-3])\s*h\s*([0-5]\d)\b/i
    );

  if (
    match
  ) {
    return formatTimeParts(
      match[1],
      match[2]
    );
  }

  /*
   * 17h
   * 9 h
   */

  match =
    text.match(
      /\b([01]?\d|2[0-3])\s*h\b/i
    );

  if (
    match
  ) {
    return formatTimeParts(
      match[1],
      "00"
    );
  }

  return null;
}

/**
 * =====================================================
 * NORMALISER HEURE
 * =====================================================
 */

function normalizeTime(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  /*
   * ===================================================
   * OBJET
   * ===================================================
   */

  if (
    typeof value === "object"
  ) {
    if (
      Number.isFinite(
        Number(
          value?.hour
        )
      )
    ) {
      return formatTimeParts(
        value.hour,
        Number.isFinite(
          Number(
            value?.minute
          )
        )
          ? value.minute
          : 0
      );
    }

    return (
      extractTimeFromValue(
        value
      )
    );
  }

  /*
   * ===================================================
   * STRING
   * ===================================================
   */

  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return null;
  }

  return (
    extractTimeFromValue(
      text
    )
  );
}

/**
 * =====================================================
 * FORMAT HEURE
 * =====================================================
 */

function formatTimeParts(
  hour,
  minute
) {
  const numericHour =
    Number(
      hour
    );

  const numericMinute =
    Number(
      minute
    );

  if (
    !Number.isFinite(
      numericHour
    ) ||
    !Number.isFinite(
      numericMinute
    )
  ) {
    return null;
  }

  if (
    numericHour < 0 ||
    numericHour > 23 ||
    numericMinute < 0 ||
    numericMinute > 59
  ) {
    return null;
  }

  return (
    `${String(
      numericHour
    ).padStart(
      2,
      "0"
    )}:${String(
      numericMinute
    ).padStart(
      2,
      "0"
    )}`
  );
}

/**
 * =====================================================
 * NETTOYAGE DATE
 * =====================================================
 *
 * Si la valeur contient :
 *
 * 20/07/2026 17:00
 *
 * on ne veut pas afficher :
 *
 * 20/07/2026 17:00 à 17:00
 */

function cleanDateValue(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return null;
  }

  /*
   * ===================================================
   * DATE FRANCAISE
   * ===================================================
   */

  const frenchDate =
    text.match(
      /\b([0-3]?\d\/[01]?\d\/(?:19|20)\d{2})\b/
    );

  if (
    frenchDate
  ) {
    return frenchDate[1];
  }

  /*
   * ===================================================
   * DATE ISO
   * ===================================================
   */

  const isoDate =
    text.match(
      /\b((?:19|20)\d{2}-[01]\d-[0-3]\d)\b/
    );

  if (
    isoDate
  ) {
    return isoDate[1];
  }

  /*
   * ===================================================
   * DATE TEXTUELLE
   * ===================================================
   */

  const textualDate =
    text.match(
      /\b([0-3]?\d\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(?:19|20)\d{2})\b/i
    );

  if (
    textualDate
  ) {
    return textualDate[1];
  }

  /*
   * On retire simplement une heure terminale
   * si elle existe.
   */

  return text
    .replace(
      /\s+(?:à\s+)?(?:[01]?\d|2[0-3])\s*:\s*[0-5]\d\s*$/i,
      ""
    )
    .replace(
      /\s+(?:à\s+)?(?:[01]?\d|2[0-3])\s*h\s*(?:[0-5]\d)?\s*$/i,
      ""
    )
    .trim();
}

/**
 * =====================================================
 * FORMAT DATE + HEURE
 * =====================================================
 */

function formatDateTime(
  dateTime
) {
  const date =
    cleanText(
      dateTime?.date
    );

  const time =
    normalizeTime(
      dateTime?.time
    );

  if (
    date &&
    time
  ) {
    return (
      `${date} à ${time}`
    );
  }

  if (
    date
  ) {
    return date;
  }

  if (
    time
  ) {
    return (
      `à ${time}`
    );
  }

  return "";
}

/**
 * =====================================================
 * PHRASE DECISION ENGINE
 * =====================================================
 */

function buildDecisionSentence({
  partial,
  type,
  family,
  decision,
  consensus
}) {
  const intent =
    normalizeSemanticType(
      decision?.intent?.type
    );

  const situation =
    normalizeSemanticType(
      decision
        ?.primarySituation
        ?.type
    );

  /*
   * ===================================================
   * MEETING
   * ===================================================
   */

  if (
    intent === "meeting" ||
    situation === "meeting"
  ) {
    return buildMeetingSentence({
      partial,
      decision,
      type,
      family
    });
  }

  /*
   * ===================================================
   * REFUND
   * ===================================================
   */

  if (
    intent === "refund" ||
    situation === "refund"
  ) {
    const amount =
      decision?.primaryAmount
        ?.value ||
      partial?.mainAmount
        ?.value ||
      null;

    const dateTime =
      getMainDateTime({
        partial,
        decision
      });

    if (
      amount &&
      dateTime?.date
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu le ${formatDateTime(dateTime)}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est annoncé`
      );
    }

    if (
      dateTime?.date
    ) {
      return ensureSentence(
        `Un remboursement est prévu le ${formatDateTime(dateTime)}`
      );
    }

    return (
      "Ce document vous informe d’un remboursement."
    );
  }

  /*
   * ===================================================
   * PAYMENT
   * ===================================================
   */

  if (
    intent === "payment" ||
    situation === "payment_due"
  ) {
    const amount =
      decision?.primaryAmount
        ?.value ||
      partial?.mainAmount
        ?.value ||
      null;

    if (
      decision?.actionRequired ===
        true
    ) {
      if (
        amount
      ) {
        return ensureSentence(
          `Ce document indique un montant de ${amount} à régler`
        );
      }

      return (
        "Ce document vous demande d’effectuer un paiement."
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Ce document concerne un paiement de ${amount}`
      );
    }

    return (
      "Ce document concerne un paiement ou un règlement."
    );
  }

  /*
   * ===================================================
   * AUTOMATIC DEBIT
   * ===================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    const amount =
      decision?.primaryAmount
        ?.value ||
      partial?.mainAmount
        ?.value ||
      null;

    const dateTime =
      getMainDateTime({
        partial,
        decision
      });

    if (
      amount &&
      dateTime?.date
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu le ${formatDateTime(dateTime)}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu`
      );
    }

    return (
      "Ce document vous informe d’un prélèvement automatique."
    );
  }

  /*
   * ===================================================
   * PROOF
   * ===================================================
   *
   * Protection supplémentaire :
   *
   * si Consensus a corrigé le document en meeting,
   * l'ancien proof ne doit jamais gagner ici.
   */

  if (
    intent === "proof" &&
    normalizeSemanticType(
      consensus?.intent
    ) !== "meeting" &&
    normalizeSemanticType(
      consensus?.situation
    ) !== "meeting"
  ) {
    return buildProofSentence({
      type,
      family,
      brainIntent:
        decision?.intent
    });
  }

  /*
   * ===================================================
   * DECISION
   * ===================================================
   */

  if (
    intent === "decision"
  ) {
    return (
      "Ce document vous informe d’une décision."
    );
  }

  /*
   * ===================================================
   * CONTRACT
   * ===================================================
   */

  if (
    intent === "contract"
  ) {
    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * DECLARATION
   * ===================================================
   */

  if (
    intent === "declaration"
  ) {
    return (
      "Ce document sert à déclarer ou présenter des informations."
    );
  }

  /*
   * ===================================================
   * REQUEST
   * ===================================================
   */

  if (
    intent === "request"
  ) {
    const action =
      firstAction(
        decision?.actions
      ) ||
      firstAction(
        partial?.actions
      );

    if (
      action
    ) {
      return ensureSentence(
        `Ce document vous demande de ${lowerFirst(action)}`
      );
    }

    return (
      "Ce document vous demande d’effectuer une démarche."
    );
  }

  return null;
}
/**
 * =====================================================
 * PHRASE FINANCIERE
 * =====================================================
 */

function buildFinancialSentence({
  partial,
  brainSituation
}) {
  const situation =
    normalizeSemanticType(
      brainSituation?.type
    );

  const amount =
    partial?.mainAmount?.value ||
    null;

  const dateTime =
    getMainDateTime({
      partial,
      decision: null
    });

  /*
   * ===================================================
   * REMBOURSEMENT
   * ===================================================
   */

  if (
    situation === "refund"
  ) {
    if (
      amount &&
      dateTime?.date
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu le ${formatDateTime(dateTime)}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est annoncé`
      );
    }

    if (
      dateTime?.date
    ) {
      return ensureSentence(
        `Un remboursement est prévu le ${formatDateTime(dateTime)}`
      );
    }

    return (
      "Ce document vous informe d’un remboursement."
    );
  }

  /*
   * ===================================================
   * PRELEVEMENT AUTOMATIQUE
   * ===================================================
   */

  if (
    situation ===
      "automatic_debit"
  ) {
    if (
      amount &&
      dateTime?.date
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu le ${formatDateTime(dateTime)}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu`
      );
    }

    if (
      dateTime?.date
    ) {
      return ensureSentence(
        `Un prélèvement automatique est prévu le ${formatDateTime(dateTime)}`
      );
    }

    return (
      "Ce document vous informe d’un prélèvement automatique."
    );
  }

  /*
   * ===================================================
   * PAIEMENT
   * ===================================================
   */

  if (
    situation ===
      "payment_due"
  ) {
    if (
      amount
    ) {
      return ensureSentence(
        `Un paiement de ${amount} semble être demandé`
      );
    }

    return (
      "Ce document semble demander un paiement."
    );
  }

  return null;
}

/**
 * =====================================================
 * PHRASE PREUVE / ATTESTATION
 * =====================================================
 */

function buildProofSentence({
  type,
  family,
  brainIntent
}) {
  const normalizedType =
    normalizeText(
      type
    );

  const normalizedFamily =
    normalizeText(
      family
    );

  /*
   * ===================================================
   * ASSURANCE
   * ===================================================
   */

  if (
    /assurance/.test(
      normalizedType
    ) ||
    /assurance/.test(
      normalizedFamily
    )
  ) {
    return (
      "Ce document sert à justifier ou attester votre situation d’assurance."
    );
  }

  /*
   * ===================================================
   * ATTESTATION
   * ===================================================
   */

  if (
    /attestation/.test(
      normalizedType
    ) ||
    /justificatif/.test(
      normalizedType
    )
  ) {
    return (
      "Ce document sert à certifier ou justifier une situation."
    );
  }

  /*
   * ===================================================
   * LABEL INTENT
   * ===================================================
   */

  const label =
    cleanText(
      brainIntent?.label
    );

  if (
    label &&
    !isGenericExplanation(
      label
    )
  ) {
    return ensureSentence(
      `Ce document sert de ${lowerFirst(label)}`
    );
  }

  return (
    "Ce document sert à certifier ou justifier une situation."
  );
}

/**
 * =====================================================
 * TYPE DOCUMENT
 * =====================================================
 */

function buildDocumentLabel({
  type,
  family,
  level,
  decision,
  brainIntent,
  consensus
}) {
  /*
   * ===================================================
   * CONSENSUS
   * ===================================================
   */

  const consensusType =
    cleanType(
      consensus?.documentType
    );

  if (
    consensusType &&
    isConsensusReliable(
      consensus
    )
  ) {
    return consensusType;
  }

  /*
   * ===================================================
   * TYPE FINAL
   * ===================================================
   */

  if (
    type
  ) {
    return type;
  }

  /*
   * ===================================================
   * INTENT
   * ===================================================
   */

  const intent =
    normalizeSemanticType(
      decision?.intent?.type ||
      brainIntent?.type
    );

  switch (
    intent
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
      return (
        "Document de paiement"
      );

    case "contract":
      return "Contrat";

    case "decision":
      return (
        "Notification de décision"
      );

    case "declaration":
      return (
        "Déclaration"
      );

    case "request":
      return (
        "Demande"
      );

    default:
      break;
  }

  /*
   * ===================================================
   * FAMILLE
   * ===================================================
   */

  if (
    family &&
    normalizeText(
      family
    ) !== "autre"
  ) {
    return (
      `Document ${familyLabel(family)}`
    );
  }

  if (
    level === "strong"
  ) {
    return (
      "Document analysé"
    );
  }

  return (
    "Document"
  );
}

/**
 * =====================================================
 * POINTS IMPORTANTS
 * =====================================================
 */

function buildImportantPoints({
  partial,
  mainSentence,
  decision,
  consensus
}) {
  const points = [];
  const seen = new Set();

  const meetingContext =
    isMeetingContext({
      consensus,

      decision,

      brainIntent:
        decision?.intent ||
        null,

      brainSituation:
        decision?.primarySituation ||
        null,

      type:
        consensus?.documentType ||
        partial?.documentType
    });

  /*
   * =====================================================
   * REUNION / AG
   * =====================================================
   *
   * Sur une AG :
   *
   * la phrase principale contient déjà :
   *
   * - date
   * - heure
   * - lieu
   *
   * Donc on ne les répète PAS.
   */

  if (
    meetingContext
  ) {
    const actions =
      getUsefulActions({
        partial,
        decision
      });

    for (
      const action
      of actions.slice(
        0,
        2
      )
    ) {
      const cleaned =
        cleanMeetingActionForSummary(
          action
        );

      if (
        !cleaned
      ) {
        continue;
      }

      addImportantPoint({
        points,
        seen,
        value:
          cleaned,
        mainSentence
      });
    }

    /*
     * Warnings :
     *
     * uniquement s'ils sont réellement importants.
     *
     * Pas de fausse contradiction de dates provenant
     * des annexes.
     */

    for (
      const warning
      of Array.isArray(
        partial?.warnings
      )
        ? partial.warnings
        : []
    ) {
      const value =
        cleanSentence(
          warning
        );

      if (
        !value
      ) {
        continue;
      }

      if (
        shouldRejectLegacyWarning({
          value,
          consensus
        })
      ) {
        continue;
      }

      const normalized =
        normalizeText(
          value
        );

      if (
        /plusieurs dates limites differentes/.test(
          normalized
        ) ||
        /verifiez laquelle s applique/.test(
          normalized
        )
      ) {
        continue;
      }

      addImportantPoint({
        points,
        seen,
        value:
          `⚠️ ${value}`,
        mainSentence
      });
    }

    /*
     * Maximum 2 points sur une AG.
     */

    return points.slice(
      0,
      2
    );
  }

  /*
   * =====================================================
   * AUTRES DOCUMENTS
   * =====================================================
   */

  const amount =
    partial?.mainAmount ||
    null;

  if (
    amount?.value
  ) {
    const label =
      cleanText(
        amount?.label
      ) ||
      labelAmountRole(
        amount?.role
      );

    addImportantPoint({
      points,
      seen,

      value:
        `${label} : ${amount.value}`,

      mainSentence
    });
  }

  /*
   * DATE
   */

  const dateTime =
    getMainDateTime({
      partial,
      decision
    });

  if (
    dateTime?.date ||
    dateTime?.time
  ) {
    const formatted =
      formatDateTime(
        dateTime
      );

    /*
     * On ne répète pas la date si elle apparaît
     * déjà dans la phrase principale.
     */

    if (
      formatted &&
      !containsComparableValue(
        mainSentence,
        formatted
      )
    ) {
      const dateLabel =
        cleanText(
          partial?.mainDate
            ?.label
        ) ||
        labelDateRole(
          decision
            ?.primaryDate
            ?.role ||
          partial
            ?.mainDate
            ?.role
        );

      addImportantPoint({
        points,
        seen,

        value:
          `${dateLabel} : ${formatted}`,

        mainSentence
      });
    }
  }

  /*
   * ACTIONS
   */

  const actionRequired =
    getEffectiveActionRequired({
      decision,
      consensus
    });

  if (
    actionRequired ===
      true
  ) {
    const actions =
      getUsefulActions({
        partial,
        decision
      });

    for (
      const action
      of actions.slice(
        0,
        2
      )
    ) {
      addImportantPoint({
        points,
        seen,
        value:
          action,
        mainSentence
      });
    }
  }

  /*
   * WARNINGS
   */

  for (
    const warning
    of Array.isArray(
      partial?.warnings
    )
      ? partial.warnings
      : []
  ) {
    const value =
      cleanSentence(
        warning
      );

    if (
      !value
    ) {
      continue;
    }

    addImportantPoint({
      points,
      seen,
      value:
        `⚠️ ${value}`,
      mainSentence
    });
  }

  /*
   * MAXIMUM 3 INFORMATIONS.
   */

  return points.slice(
    0,
    3
  );
}
function cleanMeetingActionForSummary(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return null;
  }

  const normalized =
    normalizeText(
      text
    );

  if (
    /vous devez vous adresser/.test(
      normalized
    ) ||
    /vous adresser a la societe/.test(
      normalized
    ) ||
    /coordonnees.*recto/.test(
      normalized
    ) ||
    /sur le devis/.test(
      normalized
    )
  ) {
    return null;
  }

  if (
    /signer toutes les pages/.test(
      normalized
    )
  ) {
    return (
      "Consultez les modalités de vote par correspondance si vous souhaitez utiliser cette possibilité."
    );
  }

  return ensureSentence(
    text
  );
}

function containsComparableValue(
  source,
  value
) {
  const sourceText =
    normalizeComparable(
      source
    );

  const valueText =
    normalizeComparable(
      value
    );

  if (
    !sourceText ||
    !valueText
  ) {
    return false;
  }

  return sourceText.includes(
    valueText
  );
}
function getUsefulActions({
  partial,
  decision
}) {
  const result = [];
  const seen = new Set();

 const sources =
  Array.isArray(
    partial?.actions
  )
    ? partial.actions
    : [];

  for (
    const item
    of sources
  ) {
    const action =
      cleanText(
        typeof item === "string"
          ? item
          : item?.action
      );

    if (
      !action
    ) {
      continue;
    }

    if (
      !isUsefulActionText(
        action
      )
    ) {
      continue;
    }

    const key =
      normalizeComparable(
        action
      );

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
      action
    );
  }

  return result;
}

/**
 * =====================================================
 * PREMIERE ACTION
 * =====================================================
 */

function firstAction(
  actions
) {
  for (
    const item
    of Array.isArray(actions)
      ? actions
      : []
  ) {
    const action =
      cleanText(
        typeof item === "string"
          ? item
          : item?.action
      );

    if (
      action &&
      isUsefulActionText(
        action
      )
    ) {
      return action;
    }
  }

  return null;
}

/**
 * =====================================================
 * ACTION TEXTE UTILE ?
 * =====================================================
 */

function isUsefulActionText(
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
   * Politesse
   */

  if (
    /merci de votre confiance|merci pour votre confiance/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Phrase négative
   */

  if (
    /ne pas tenir compte|ne pas en tenir compte/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Condition générique
   */

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
 * FAIT -> TEXTE
 * =====================================================
 */

function buildFactText(
  fact
) {
  if (
    !fact
  ) {
    return null;
  }

  if (
    typeof fact === "string"
  ) {
    return cleanSentence(
      fact
    );
  }

  const label =
    cleanText(
      fact?.label
    );

  const value =
    cleanText(
      fact?.value
    );

  if (
    !value
  ) {
    return null;
  }

  if (
    label
  ) {
    return ensureSentence(
      `${label} : ${value}`
    );
  }

  return ensureSentence(
    value
  );
}

/**
 * =====================================================
 * REJETER ANCIEN FAIT CONTRADICTOIRE
 * =====================================================
 */

function shouldRejectLegacyFact({
  fact,
  value,
  consensus
}) {
  if (
    !isConsensusReliable(
      consensus
    )
  ) {
    return false;
  }

  const consensusType =
    normalizeText(
      consensus?.documentType
    );

  const consensusFamily =
    normalizeText(
      consensus?.family
    );

  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  const factText =
    normalizeText(
      `${fact?.kind || ""} ${fact?.label || ""} ${value || ""}`
    );

  /*
   * ===================================================
   * AG / COPROPRIETE VS ASSURANCE
   * ===================================================
   */

  const isCondoMeeting =
    consensusIntent ===
      "meeting" ||
    /assemblee generale/.test(
      consensusType
    ) ||
    /copropriet/.test(
      consensusType
    ) ||
    /copropriet/.test(
      consensusFamily
    );

  if (
    isCondoMeeting &&
    /assurance/.test(
      factText
    )
  ) {
    return true;
  }

  /*
   * ===================================================
   * MEETING VS PROOF
   * ===================================================
   */

  if (
    isCondoMeeting &&
    (
      /attestation/.test(
        factText
      ) ||
      /justificatif/.test(
        factText
      ) ||
      /certifier/.test(
        factText
      )
    )
  ) {
    return true;
  }

  /*
   * ===================================================
   * ANCIEN TYPE DOCUMENT
   * ===================================================
   */

  if (
    consensus?.corrected ===
      true &&
    normalizeText(
      fact?.kind
    ) === "documenttype"
  ) {
    const factValue =
      normalizeText(
        fact?.value
      );

    if (
      factValue &&
      consensusType &&
      factValue !==
        consensusType
    ) {
      return true;
    }
  }

  return false;
}

/**
 * =====================================================
 * REJETER WARNING LEGACY
 * =====================================================
 */

function shouldRejectLegacyWarning({
  value,
  consensus
}) {
  if (
    !isConsensusReliable(
      consensus
    )
  ) {
   const consensusType =
  normalizeText(
    consensus?.documentType
  );

const isGeneralMeeting =
  intent === "meeting" ||
  /assemblee generale/.test(
    consensusType
  ) ||
  /convocation/.test(
    consensusType
  );

if (
  isGeneralMeeting &&
  (
    /plusieurs dates limites differentes/.test(
      text
    ) ||
    /verifiez laquelle s applique/.test(
      text
    )
  )
) {
  return true;
}
    return false;
  }

  const text =
    normalizeText(
      value
    );

  const intent =
    normalizeSemanticType(
      consensus?.intent
    );

  /*
   * Si le consensus dit réunion, on supprime les
   * warnings génériques provenant d'une ancienne
   * interprétation financière.
   */

  if (
    intent === "meeting" &&
    (
      /mode de paiement/.test(
        text
      ) ||
      /montant avant d agir/.test(
        text
      ) ||
      /remboursement/.test(
        text
      ) ||
      /prelevement/.test(
        text
      )
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * AJOUTER POINT IMPORTANT
 * =====================================================
 */

function addImportantPoint({
  points,
  seen,
  value,
  mainSentence
}) {
  const cleaned =
    cleanSentence(
      value
    );

  if (
    !cleaned
  ) {
    return;
  }

  /*
   * Eviter de répéter exactement la phrase principale.
   */

  if (
    normalizeComparable(
      cleaned
    ) ===
    normalizeComparable(
      mainSentence
    )
  ) {
    return;
  }

  const key =
    normalizeComparable(
      cleaned
    );

  if (
    !key ||
    seen.has(
      key
    )
  ) {
    return;
  }

  seen.add(
    key
  );

  points.push(
    cleaned
  );
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
      "Date de l’assemblée générale"
    );
  }

  if (
    text.includes(
      "deadline"
    )
  ) {
    return (
      "Date limite"
    );
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

  return (
    "Date importante"
  );
}
/**
 * =====================================================
 * INFORMATION UTILE ?
 * =====================================================
 */

function hasUsefulInformation(
  partial
) {
  if (
    partial?.mainAmount
      ?.value
  ) {
    return true;
  }

  if (
    partial?.mainDate
      ?.date
  ) {
    return true;
  }

  if (
    partial?.mainDate
      ?.time
  ) {
    return true;
  }

  if (
    Array.isArray(
      partial?.actions
    ) &&
    partial.actions.length
  ) {
    return true;
  }

  if (
    Array.isArray(
      partial?.deadlines
    ) &&
    partial.deadlines.length
  ) {
    return true;
  }

  if (
    partial?.issuer
  ) {
    return true;
  }

  if (
    cleanType(
      partial?.documentType
    )
  ) {
    return true;
  }

  if (
    partial?.documentPurpose
  ) {
    return true;
  }

  if (
    partial?.whyReceived
  ) {
    return true;
  }

  if (
    hasStrongDecision(
      partial?.brainFusion
        ?.decision
    )
  ) {
    return true;
  }

  if (
    hasStrongConsensus(
      partial?.brainFusion
        ?.consensus
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * DECISION FORTE ?
 * =====================================================
 */

function hasStrongDecision(
  decision
) {
  if (
    !decision
  ) {
    return false;
  }

  if (
    Number(
      decision?.confidence ||
      0
    ) < 70
  ) {
    return false;
  }

  if (
    decision?.primarySituation
      ?.type
  ) {
    return true;
  }

  if (
    decision?.intent?.type &&
    decision.intent.type !==
      "unknown"
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * BRAIN FORT ?
 * =====================================================
 */

function hasStrongBrainUnderstanding({
  brainIntent,
  brainSituation
}) {
  if (
    brainIntent &&
    brainIntent.type !==
      "unknown" &&
    Number(
      brainIntent.confidence ||
      0
    ) >= 75
  ) {
    return true;
  }

  if (
    brainSituation &&
    brainSituation.type &&
    Number(
      brainSituation
        .confidence ||
      0
    ) >= 75
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * EXPLICATION GENERIQUE ?
 * =====================================================
 */

function isGenericExplanation(
  value
) {
  const text =
    normalizeText(
      value
    );

  return (
    /document administratif/.test(
      text
    ) ||
    /document de type/.test(
      text
    ) ||
    /document appartenant a la famille/.test(
      text
    ) ||
    /presenter votre situation/.test(
      text
    ) ||
    /^ce document concerne/.test(
      text
    )
  );
}

/**
 * =====================================================
 * EXPLICATION CONTRADICTOIRE ?
 * =====================================================
 */

function isContradictoryExplanation({
  value,
  consensus,
  type
}) {
  if (
    !value ||
    !isConsensusReliable(
      consensus
    )
  ) {
    return false;
  }

  const text =
    normalizeText(
      value
    );

  const consensusType =
    normalizeText(
      consensus?.documentType ||
      type
    );

  const consensusFamily =
    normalizeText(
      consensus?.family
    );

  const consensusIntent =
    normalizeSemanticType(
      consensus?.intent
    );

  const isCondoMeeting =
    consensusIntent ===
      "meeting" ||
    /assemblee generale/.test(
      consensusType
    ) ||
    /copropriet/.test(
      consensusType
    ) ||
    /copropriet/.test(
      consensusFamily
    );

  if (
    isCondoMeeting &&
    (
      /assurance/.test(
        text
      ) ||
      /attestation/.test(
        text
      ) ||
      /justificatif/.test(
        text
      ) ||
      /certifier/.test(
        text
      )
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * TYPE
 * =====================================================
 */

function cleanType(
  value
) {
  const type =
    String(
      value ||
      ""
    )
      .trim();

  if (
    !type
  ) {
    return null;
  }

  const normalized =
    normalizeText(
      type
    );

  if (
    [
      "document",
      "autre",
      "document autre",
      "document administratif",
      "document inconnu"
    ].includes(
      normalized
    )
  ) {
    return null;
  }

  return type;
}

/**
 * =====================================================
 * NORMALISATION SEMANTIQUE
 * =====================================================
 *
 * Permet d'accepter différents noms provenant
 * des différentes générations de Didou.
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
   * ===================================================
   * MEETING
   * ===================================================
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
   * ===================================================
   * REFUND
   * ===================================================
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
   * ===================================================
   * AUTOMATIC DEBIT
   * ===================================================
   */

  if (
    text.includes(
      "automaticdebit"
    ) ||
    text ===
      "debit"
  ) {
    return (
      "automatic_debit"
    );
  }

  /*
   * ===================================================
   * PAYMENT DUE
   * ===================================================
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
   * ===================================================
   * PAYMENT
   * ===================================================
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
   * ===================================================
   * PROOF
   * ===================================================
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
   * ===================================================
   * CONTRACT
   * ===================================================
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
   * ===================================================
   * DECISION
   * ===================================================
   */

  if (
    text.includes(
      "decision"
    )
  ) {
    return "decision";
  }

  /*
   * ===================================================
   * DECLARATION
   * ===================================================
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
   * ===================================================
   * NOTIFICATION
   * ===================================================
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
   * ===================================================
   * REQUEST
   * ===================================================
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
   * ===================================================
   * INFORMATION
   * ===================================================
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
 * FAMILLE
 * =====================================================
 */

function familyLabel(
  family
) {
  const normalized =
    normalizeText(
      family
    );

  const map = {
    fiscal:
      "fiscal",

    administratif:
      "administratif",

    facture:
      "de facturation",

    bancaire:
      "bancaire",

    assurance:
      "d’assurance",

    logement:
      "de logement",

    copropriete:
      "de copropriété",

    emploi:
      "lié à l’emploi",

    social:
      "social",

    sante:
      "de santé",

    juridique:
      "juridique",

    courrier:
      "de correspondance",

    contrat:
      "contractuel",

    formulaire:
      "à compléter"
  };

  return (
    map[normalized] ||
    family
  );
}

/**
 * =====================================================
 * ARTICLE
 * =====================================================
 */

function articleForType(
  type
) {
  const value =
    normalizeText(
      type
    );

  if (
    /facture|quittance|convocation|liasse|declaration|attestation|notification|lettre|demande|mise en demeure|decision/.test(
      value
    )
  ) {
    return "une ";
  }

  if (
    /^[aeiouh]/i.test(
      value
    )
  ) {
    return "une ";
  }

  return "un ";
}

/**
 * =====================================================
 * NETTOYAGE PHRASE
 * =====================================================
 */

function cleanSentence(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text ||
    text.length < 3
  ) {
    return null;
  }

  return ensureSentence(
    text
  );
}

/**
 * =====================================================
 * AJOUT POINT FINAL
 * =====================================================
 */

function ensureSentence(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return "";
  }

  if (
    /[.!?]$/.test(
      text
    )
  ) {
    return text;
  }

  return `${text}.`;
}

/**
 * =====================================================
 * LOWER FIRST
 * =====================================================
 */

function lowerFirst(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return "";
  }

  return (
    text
      .charAt(0)
      .toLowerCase() +
    text.slice(1)
  );
}

/**
 * =====================================================
 * CAPITALIZE FIRST
 * =====================================================
 */

function capitalizeFirst(
  value
) {
  const text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return "";
  }

  return (
    text
      .charAt(0)
      .toUpperCase() +
    text.slice(1)
  );
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
