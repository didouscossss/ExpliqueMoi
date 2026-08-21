/**
 * =====================================================
 * F — Résumé utilisateur V4.2
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
    "[USER SUMMARY V4.2]",
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

  const result = {
    ...(rawDecision || {})
  };

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

  if (
    consensusIntent === "meeting" ||
    consensusSituation === "meeting"
  ) {
    return true;
  }

  if (
    decisionIntent === "meeting" ||
    decisionSituation === "meeting"
  ) {
    return true;
  }

  if (
    intent === "meeting" ||
    situation === "meeting"
  ) {
    return true;
  }

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
 *
 * V4.2 :
 *
 * La phrase principale doit porter l'essentiel :
 *
 * - type d'événement
 * - date
 * - heure
 * - lieu
 *
 * afin d'éviter de répéter ensuite ces informations
 * dans important_points.
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
    cleanMeetingPlace(
      partial?.mainDate?.place ||
      decision?.primaryDate?.place ||
      null
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
   * ===================================================
   * DATE + HEURE + LIEU
   * ===================================================
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
   * ===================================================
   * DATE + HEURE
   * ===================================================
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
   * ===================================================
   * DATE + LIEU
   * ===================================================
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
   * ===================================================
   * DATE
   * ===================================================
   */

  if (
    dateTime?.date
  ) {
    return ensureSentence(
      `${eventName} est prévue le ${dateTime.date}`
    );
  }

  /*
   * ===================================================
   * HEURE
   * ===================================================
   */

  if (
    dateTime?.time
  ) {
    return ensureSentence(
      `${eventName} est prévue à ${dateTime.time}`
    );
  }

  /*
   * ===================================================
   * FALLBACK CONVOCATION
   * ===================================================
   */

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

/**
 * =====================================================
 * NETTOYAGE LIEU REUNION
 * =====================================================
 *
 * Le contextual-fusion peut remonter un lieu complet.
 * On conserve l'information utile sans laisser entrer
 * un morceau d'instruction ou d'annexe.
 */

function cleanMeetingPlace(
  value
) {
  let text =
    cleanText(
      value
    );

  if (
    !text
  ) {
    return null;
  }

  text =
    text
      .replace(
        /\b(?:ordre du jour|résolution|resolution|vote exprimé|vote exprime|pouvoir|mandat|formulaire)\b.*$/i,
        ""
      )
      .replace(
        /[,;:\-–—]+$/g,
        ""
      )
      .trim();

  if (
    text.length < 3
  ) {
    return null;
  }

  if (
    text.length > 140
  ) {
    text =
      text.slice(
        0,
        140
      ).trim();
  }

  return text;
}

/**
 * =====================================================
 * DATE + HEURE PRINCIPALES
 * =====================================================
 */

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
   * HEURE DANS CONTEXTE / EVIDENCE
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

  const frenchDate =
    text.match(
      /\b([0-3]?\d\/[01]?\d\/(?:19|20)\d{2})\b/
    );

  if (
    frenchDate
  ) {
    return frenchDate[1];
  }

  const isoDate =
    text.match(
      /\b((?:19|20)\d{2}-[01]\d-[0-3]\d)\b/
    );

  if (
    isoDate
  ) {
    return isoDate[1];
  }

  const textualDate =
    text.match(
      /\b([0-3]?\d\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(?:19|20)\d{2})\b/i
    );

  if (
    textualDate
  ) {
    return textualDate[1];
  }

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

  if (
    type
  ) {
    return type;
  }

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
    case "payment_due":
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
 *
 * V4.2 :
 *
 * Une AG est un cas particulier.
 *
 * La phrase principale contient déjà :
 * - type
 * - date
 * - heure
 * - lieu
 *
 * Donc "L'essentiel" ne doit PAS répéter ces données.
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
   */

  if (
    meetingContext
  ) {
    const actions =
      getUsefulActions({
        partial,
        decision,
        meetingContext:
          true
      });

    /*
     * On ne montre au maximum que deux éléments
     * supplémentaires.
     *
     * Et uniquement s'ils apportent quelque chose
     * que la phrase principale ne dit pas déjà.
     */

    for (
      const action
      of actions
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

      if (
        points.length >= 2
      ) {
        break;
      }
    }

    /*
     * ===================================================
     * WARNINGS AG
     * ===================================================
     *
     * On n'affiche que des warnings réellement utiles.
     *
     * Les dates historiques, annexes ou dates de
     * consultation ne doivent pas créer une alerte.
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
        ) ||
        /plusieurs dates differentes apparaissent/.test(
          normalized
        ) ||
        /date.*2019/.test(
          normalized
        )
      ) {
        continue;
      }

      /*
       * Si nous avons déjà deux vrais points,
       * aucun warning secondaire n'est ajouté.
       */

      if (
        points.length >= 2
      ) {
        break;
      }

      addImportantPoint({
        points,
        seen,
        value:
          `⚠️ ${value}`,
        mainSentence
      });
    }

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
   * =====================================================
   * DATE
   * =====================================================
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
   * =====================================================
   * ACTIONS
   * =====================================================
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
        decision,
        meetingContext:
          false
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
   * =====================================================
   * WARNINGS
   * =====================================================
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
   * Maximum 3 informations pour les autres documents.
   */

  return points.slice(
    0,
    3
  );
}

/**
 * =====================================================
 * NETTOYAGE ACTION AG POUR RESUME
 * =====================================================
 */

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

  /*
   * ===================================================
   * PARASITES ANNEXES / DEVIS
   * ===================================================
   */

  if (
    /vous devez vous adresser/.test(
      normalized
    ) ||
    /vous adresser a la societe/.test(
      normalized
    ) ||
    /s'adresser a la societe/.test(
      normalized
    ) ||
    /coordonnees.*recto/.test(
      normalized
    ) ||
    /sur le devis/.test(
      normalized
    ) ||
    /marque et.*coordonnees/.test(
      normalized
    ) ||
    /societe dont la marque/.test(
      normalized
    )
  ) {
    return null;
  }

  /*
   * ===================================================
   * SIGNER TOUTES LES PAGES
   * ===================================================
   *
   * Ce n'est pas une obligation générale.
   */

  if (
    /signer toutes les pages/.test(
      normalized
    ) ||
    /signature.*toutes les pages/.test(
      normalized
    )
  ) {
    return (
      "Consultez les modalités de vote par correspondance si vous souhaitez utiliser cette possibilité."
    );
  }

  /*
   * ===================================================
   * COCHER LES RESOLUTIONS
   * ===================================================
   */

  if (
    /cocher/.test(
      normalized
    ) &&
    (
      /resolution/.test(
        normalized
      ) ||
      /intention de vote/.test(
        normalized
      )
    )
  ) {
    return (
      "Consultez les modalités de vote par correspondance si vous souhaitez utiliser cette possibilité."
    );
  }

  /*
   * ===================================================
   * VOTE PAR CORRESPONDANCE
   * ===================================================
   */

  if (
    /vote par correspondance/.test(
      normalized
    ) ||
    /voter par correspondance/.test(
      normalized
    )
  ) {
    return (
      "Vous pouvez consulter les modalités de vote par correspondance prévues dans la convocation."
    );
  }

  /*
   * ===================================================
   * POUVOIR / PROCURATION
   * ===================================================
   */

  if (
    /procuration/.test(
      normalized
    ) ||
    /\bpouvoir\b/.test(
      normalized
    )
  ) {
    return (
      "Si vous ne pouvez pas participer, consultez les possibilités de pouvoir ou de procuration prévues dans la convocation."
    );
  }

  /*
   * ===================================================
   * PARTICIPATION
   * ===================================================
   */

  if (
    /participer/.test(
      normalized
    ) ||
    /assister/.test(
      normalized
    )
  ) {
    return (
      "Prenez connaissance des modalités de participation à l’assemblée."
    );
  }

  /*
   * Une action inconnue n'est pas ajoutée à l'essentiel
   * d'une AG.
   */

  return null;
}

/**
 * =====================================================
 * VALEUR DEJA PRESENTE ?
 * =====================================================
 */

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

/**
 * =====================================================
 * ACTIONS UTILISABLES PAR LE RESUME
 * =====================================================
 *
 * IMPORTANT V4.2 :
 *
 * userSummary respecte d'abord les actions finales
 * produites par Fusion.
 *
 * Il ne repêche pas directement d'anciennes actions
 * Brain rejetées plus tôt.
 */

function getUsefulActions({
  partial,
  decision,
  meetingContext = false
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

    /*
     * Sur une AG on applique un filtre supplémentaire.
     */

    if (
      meetingContext &&
      !isMeetingActionCandidate(
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
      !key ||
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
 * ACTION CANDIDATE AG ?
 * =====================================================
 */

function isMeetingActionCandidate(
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
   * Parasites certains.
   */

  if (
    /vous devez vous adresser/.test(
      text
    ) ||
    /vous adresser a la societe/.test(
      text
    ) ||
    /s'adresser a la societe/.test(
      text
    ) ||
    /societe dont la marque/.test(
      text
    ) ||
    /coordonnees.*recto/.test(
      text
    ) ||
    /sur le devis/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Finance parasite.
   */

  if (
    /payer|regler|prelevement|remboursement|versement/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Actions potentiellement liées à une AG.
   */

  return (
    /participer/.test(
      text
    ) ||
    /assister/.test(
      text
    ) ||
    /vote/.test(
      text
    ) ||
    /voter/.test(
      text
    ) ||
    /procuration/.test(
      text
    ) ||
    /\bpouvoir\b/.test(
      text
    ) ||
    /mandat/.test(
      text
    ) ||
    /signer toutes les pages/.test(
      text
    ) ||
    /cocher.*resolution/.test(
      text
    )
  );
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
   * Politesse.
   */

  if (
    /merci de votre confiance|merci pour votre confiance/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Phrase négative.
   */

  if (
    /ne pas tenir compte|ne pas en tenir compte/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Condition générique.
   */

  if (
    /si vous avez besoin|si besoin|si necessaire/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * Annexes / devis.
   */

  if (
    /vous devez vous adresser/.test(
      text
    ) ||
    /vous adresser a la societe/.test(
      text
    ) ||
    /societe dont la marque/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}
/**
 * =====================================================
 * ACTION REQUIRED EFFECTIF
 * =====================================================
 */

function getEffectiveActionRequired({
  decision,
  consensus
}) {
  /*
   * ===================================================
   * CONSENSUS EXPLICITE
   * ===================================================
   */

  if (
    typeof consensus
      ?.actionRequired ===
      "boolean"
  ) {
    return (
      consensus.actionRequired
    );
  }

  /*
   * ===================================================
   * CONSENSUS AYANT CORRIGE LE DOCUMENT
   * ===================================================
   *
   * Si le sens documentaire a changé,
   * on ne réutilise jamais aveuglément un ancien
   * actionRequired = false.
   */

  if (
    consensus?.corrected ===
      true
  ) {
    const consensusIntent =
      normalizeSemanticType(
        consensus?.intent
      );

    const decisionIntent =
      normalizeSemanticType(
        decision?.intent?.type
      );

    if (
      consensusIntent &&
      decisionIntent &&
      consensusIntent !==
        decisionIntent
    ) {
      return null;
    }
  }

  /*
   * ===================================================
   * DECISION FINALE
   * ===================================================
   */

  if (
    typeof decision
      ?.actionRequired ===
      "boolean"
  ) {
    return (
      decision.actionRequired
    );
  }

  return null;
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
   * AG / COPROPRIETE
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

  /*
   * Ancienne assurance.
   */

  if (
    isCondoMeeting &&
    /assurance/.test(
      factText
    )
  ) {
    return true;
  }

  /*
   * Ancienne attestation / proof.
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
   * Montant financier parasite sur une AG.
   */

  if (
    isCondoMeeting &&
    normalizeText(
      fact?.kind
    ) === "amount"
  ) {
    return true;
  }

  /*
   * Ancien type documentaire.
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
 *
 * V4.2 :
 *
 * - correction de la fonction historique ;
 * - suppression des faux warnings financiers sur AG ;
 * - suppression des faux conflits de dates issus
 *   des annexes ou textes juridiques.
 */

function shouldRejectLegacyWarning({
  value,
  consensus
}) {
  const text =
    normalizeText(
      value
    );

  if (
    !text
  ) {
    return true;
  }

  /*
   * Sans consensus fiable :
   * on ne supprime rien arbitrairement.
   */

  if (
    !isConsensusReliable(
      consensus
    )
  ) {
    return false;
  }

  const intent =
    normalizeSemanticType(
      consensus?.intent
    );

  const situation =
    normalizeSemanticType(
      consensus?.situation
    );

  const consensusType =
    normalizeText(
      consensus?.documentType
    );

  const consensusFamily =
    normalizeText(
      consensus?.family
    );

  const isGeneralMeeting =
    intent === "meeting" ||
    situation === "meeting" ||
    /assemblee generale/.test(
      consensusType
    ) ||
    /convocation/.test(
      consensusType
    ) ||
    /copropriet/.test(
      consensusFamily
    );

  /*
   * ===================================================
   * FAUX WARNING DATES SUR AG
   * ===================================================
   *
   * Exemple réel :
   *
   * 16/07/2026
   * 16 juillet 2019
   *
   * Ce ne sont pas nécessairement deux échéances
   * concurrentes pour l'utilisateur.
   */

  if (
    isGeneralMeeting &&
    (
      /plusieurs dates limites differentes/.test(
        text
      ) ||
      /plusieurs dates differentes/.test(
        text
      ) ||
      /verifiez laquelle s applique/.test(
        text
      ) ||
      /date.*2019/.test(
        text
      )
    )
  ) {
    return true;
  }

  /*
   * ===================================================
   * WARNINGS FINANCIERS PARASITES SUR AG
   * ===================================================
   */

  if (
    isGeneralMeeting &&
    (
      /mode de paiement/.test(
        text
      ) ||
      /montant avant d agir/.test(
        text
      ) ||
      /montant.*payer/.test(
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

  /*
   * ===================================================
   * ANCIENNE INTERPRETATION ASSURANCE
   * ===================================================
   */

  if (
    isGeneralMeeting &&
    (
      /assurance/.test(
        text
      ) ||
      /attestation/.test(
        text
      ) ||
      /justificatif/.test(
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
   * ===================================================
   * REPETITION EXACTE
   * ===================================================
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

  /*
   * ===================================================
   * REPETITION SEMANTIQUE SIMPLE
   * ===================================================
   *
   * Si le point est entièrement déjà contenu
   * dans la phrase principale, on ne l'affiche pas.
   */

  const cleanedComparable =
    normalizeComparable(
      cleaned
    );

  const sentenceComparable =
    normalizeComparable(
      mainSentence
    );

  if (
    cleanedComparable &&
    sentenceComparable &&
    sentenceComparable.includes(
      cleanedComparable
    )
  ) {
    return;
  }

  const key =
    cleanedComparable;

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
    partial?.mainDate
      ?.place
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
 * TYPE DOCUMENTAIRE UTILE
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
      "debit" ||
    text.includes(
      "prelevement"
    ) ||
    text.includes(
      "prelev"
    )
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
 * NORMALISATION DES ACTIONS AG
 * =====================================================
 *
 * Ce helper sert de dernière protection au niveau
 * présentation.
 *
 * Le Decision Engine V2 doit déjà filtrer les actions,
 * mais userSummary ne doit jamais transformer une
 * phrase d'annexe en ordre principal.
 */

function isClearlySecondaryMeetingInstruction(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (
    !text
  ) {
    return true;
  }

  /*
   * Annexes commerciales / devis.
   */

  if (
    /vous devez vous adresser/.test(
      text
    ) ||
    /vous adresser a la societe/.test(
      text
    ) ||
    /societe dont la marque/.test(
      text
    ) ||
    /coordonnees.*recto/.test(
      text
    ) ||
    /sur le devis/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Instructions techniques de formulaire.
   *
   * Elles peuvent être utiles mais ne sont pas
   * des obligations générales.
   */

  if (
    /signer toutes les pages/.test(
      text
    ) ||
    /cocher chaque resolution/.test(
      text
    ) ||
    /cocher.*intention de vote/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * ACTION AG SYNTHETIQUE
 * =====================================================
 *
 * Si plusieurs formulations parlent du même mécanisme,
 * on préfère une formulation simple et utilisateur.
 */

function simplifyMeetingAction(
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

  /*
   * Participation.
   */

  if (
    /participer/.test(
      normalized
    ) ||
    /assister/.test(
      normalized
    )
  ) {
    return (
      "Prenez connaissance des modalités de participation à l’assemblée."
    );
  }

  /*
   * Vote par correspondance.
   */

  if (
    /vote par correspondance/.test(
      normalized
    ) ||
    /voter par correspondance/.test(
      normalized
    ) ||
    (
      /formulaire/.test(
        normalized
      ) &&
      /vote/.test(
        normalized
      )
    )
  ) {
    return (
      "Vous pouvez consulter les modalités de vote par correspondance prévues dans la convocation."
    );
  }

  /*
   * Pouvoir / procuration.
   */

  if (
    /procuration/.test(
      normalized
    ) ||
    /\bpouvoir\b/.test(
      normalized
    ) ||
    /mandat/.test(
      normalized
    )
  ) {
    return (
      "Si vous ne pouvez pas participer, consultez les possibilités de pouvoir ou de procuration."
    );
  }

  /*
   * Instruction technique secondaire.
   */

  if (
    isClearlySecondaryMeetingInstruction(
      normalized
    )
  ) {
    return null;
  }

  return ensureSentence(
    text
  );
}

/**
 * =====================================================
 * FAIT SEMANTIQUEMENT REDONDANT ?
 * =====================================================
 *
 * Protection générale contre :
 *
 * phrase :
 * "AG le 20/07/2026 à 17:00"
 *
 * point :
 * "Heure : 17:00"
 */

function isSemanticallyRedundantPoint({
  point,
  sentence
}) {
  const normalizedPoint =
    normalizeText(
      point
    );

  const normalizedSentence =
    normalizeText(
      sentence
    );

  if (
    !normalizedPoint ||
    !normalizedSentence
  ) {
    return false;
  }

  /*
   * Heure déjà présente.
   */

  const time =
    extractTimeFromValue(
      point
    );

  if (
    time &&
    normalizedSentence.includes(
      normalizeText(
        time
      )
    )
  ) {
    if (
      /heure|date|assemblee|reunion/.test(
        normalizedPoint
      )
    ) {
      return true;
    }
  }

  /*
   * Date déjà présente.
   */

  const date =
    cleanDateValue(
      point
    );

  if (
    date &&
    normalizeComparable(
      sentence
    ).includes(
      normalizeComparable(
        date
      )
    )
  ) {
    if (
      /date|assemblee|reunion/.test(
        normalizedPoint
      )
    ) {
      return true;
    }
  }

  return false;
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
