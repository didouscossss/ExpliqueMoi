/**
 * Didou Brain — Fusion V3
 *
 * Fusion entre :
 * - Didou Legacy / adaptateurs
 * - Didou Brain
 * - intentions documentaires
 * - faits vérifiés
 *
 * OBJECTIF :
 *
 * Le Brain peut désormais améliorer :
 *
 * - niveau de compréhension
 * - finalité du document
 * - raison de réception
 * - type trop générique
 *
 * sans écraser arbitrairement les adaptateurs métier.
 */

export function fuseBrainAndAdapted({
  brain,
  adapted,
  detection
}) {
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

  const hasHighContradiction =
    (brain?.contradictions || [])
      .some(
        (item) =>
          item?.severity === "high"
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
      detection
    });

  /*
   * =====================================================
   * 2 — INTENTION DOCUMENTAIRE
   * =====================================================
   */

  applyDocumentIntent({
    result,
    brain,
    detection,
    hasHighContradiction
  });

  /*
   * =====================================================
   * 3 — ÉMETTEUR
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
    fuseMainAmount({
      brain,
      adapted,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 5 — DATE PRINCIPALE
   * =====================================================
   */

  result.mainDate =
    fuseMainDate({
      brain,
      adapted,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 6 — ACTIONS
   * =====================================================
   */

  result.actions =
    fuseActions({
      brain,
      adapted,
      intent:
        brain?.intent
    });

  /*
   * =====================================================
   * 7 — FAITS IMPORTANTS
   * =====================================================
   */

  result.importantFacts =
    fuseImportantFacts({
      brain,
      adapted
    });

  /*
   * =====================================================
   * 8 — CONFIANCE
   * =====================================================
   */

  result.confidence =
    fuseConfidence({
      brain,
      adapted:
        result,
      detection,
      hasHighContradiction
    });

  /*
   * =====================================================
   * 9 — DIAGNOSTIC
   * =====================================================
   */

  result.brainFusion = {
    applied:
      true,

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
      null
  };

  return result;
}

/**
 * =====================================================
 * TYPE DU DOCUMENT
 * =====================================================
 */

function fuseDocumentType({
  brain,
  adapted,
  detection
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
   * Si l'adaptateur possède déjà un vrai type,
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
   * Sinon type du Brain.
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
   * Sinon détection initiale.
   */

  if (
    isUsefulDocumentType(
      detected
    )
  ) {
    return detected;
  }

  /*
   * ===================================================
   * INTENTION PROOF
   * ===================================================
   *
   * On ne crée PAS automatiquement
   * "attestation d'assurance".
   *
   * On sait uniquement que le document
   * est une attestation / preuve.
   */

  if (
    brain?.intent?.type === "proof" &&
    Number(
      brain?.intent?.confidence ||
      0
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
 * INTENTION DOCUMENTAIRE
 * =====================================================
 */

function applyDocumentIntent({
  result,
  brain,
  hasHighContradiction
}) {
  const intent =
    brain?.intent ||
    null;

  if (!intent) {
    return;
  }

  const confidence =
    Number(
      intent?.confidence || 0
    );

  /*
   * Une intention faible n'a pas le droit
   * de modifier le résultat.
   */

  if (
    confidence < 75
  ) {
    return;
  }

  /*
   * Contradiction forte :
   * on reste prudent.
   */

  if (
    hasHighContradiction
  ) {
    return;
  }

  /*
   * ===================================================
   * ATTESTATION / PREUVE
   * ===================================================
   */

  if (
    intent.type === "proof"
  ) {
    /*
     * Un document peut être parfaitement compris
     * sans montant, date ou action.
     */

    result.understandingLevel =
      upgradeUnderstandingLevel(
        result.understandingLevel,
        confidence
      );

    /*
     * Ne remplace pas un objectif métier
     * déjà plus spécifique.
     */

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Certifier ou justifier une situation.";
    }

    if (
      !isUsefulWhyReceived(
        result.whyReceived
      )
    ) {
      result.whyReceived =
        "Ce document vous a été remis comme attestation ou justificatif.";
    }

    return;
  }

  /*
   * ===================================================
   * CONTRAT
   * ===================================================
   */

  if (
    intent.type === "contract"
  ) {
    result.understandingLevel =
      upgradeUnderstandingLevel(
        result.understandingLevel,
        confidence
      );

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Définir ou confirmer une relation contractuelle.";
    }

    return;
  }

  /*
   * ===================================================
   * DÉCISION
   * ===================================================
   */

  if (
    intent.type === "decision"
  ) {
    result.understandingLevel =
      upgradeUnderstandingLevel(
        result.understandingLevel,
        confidence
      );

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Informer le destinataire d’une décision.";
    }

    return;
  }

  /*
   * ===================================================
   * DÉCLARATION
   * ===================================================
   */

  if (
    intent.type === "declaration"
  ) {
    result.understandingLevel =
      upgradeUnderstandingLevel(
        result.understandingLevel,
        confidence
      );

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Permettre ou présenter une déclaration.";
    }

    return;
  }

  /*
   * ===================================================
   * NOTIFICATION
   * ===================================================
   */

  if (
    intent.type === "notification"
  ) {
    if (
      confidence >= 85
    ) {
      result.understandingLevel =
        upgradeUnderstandingLevel(
          result.understandingLevel,
          confidence
        );
    }

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Informer le destinataire d’une situation ou d’un changement.";
    }

    return;
  }

  /*
   * ===================================================
   * REMBOURSEMENT
   * ===================================================
   */

  if (
    intent.type === "refund"
  ) {
    if (
      confidence >= 80
    ) {
      result.understandingLevel =
        upgradeUnderstandingLevel(
          result.understandingLevel,
          confidence
        );
    }

    if (
      !isUsefulPurpose(
        result.documentPurpose
      )
    ) {
      result.documentPurpose =
        "Informer d’un remboursement ou d’un avoir.";
    }

    return;
  }

  /*
   * ===================================================
   * PAIEMENT
   * ===================================================
   */

  if (
    intent.type === "payment"
  ) {
    if (
      confidence >= 80
    ) {
      result.understandingLevel =
        upgradeUnderstandingLevel(
          result.understandingLevel,
          confidence
        );
    }

    return;
  }

  /*
   * ===================================================
   * RÉUNION
   * ===================================================
   */

  if (
    intent.type === "meeting"
  ) {
    if (
      confidence >= 80
    ) {
      result.understandingLevel =
        upgradeUnderstandingLevel(
          result.understandingLevel,
          confidence
        );
    }
  }
}

/**
 * =====================================================
 * COMPRÉHENSION
 * =====================================================
 */

function upgradeUnderstandingLevel(
  current,
  confidence
) {
  const value =
    String(
      current || ""
    );

  /*
   * Une compréhension déjà forte
   * reste forte.
   */

  if (
    value === "strong"
  ) {
    return "strong";
  }

  if (
    confidence >= 88
  ) {
    return "strong";
  }

  if (
    confidence >= 75
  ) {
    return "probable";
  }

  return (
    value ||
    "partial"
  );
}

/**
 * =====================================================
 * ÉMETTEUR
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
   * On garde l'émetteur métier existant.
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

function fuseMainAmount({
  brain,
  adapted,
  hasHighContradiction
}) {
  const current =
    adapted?.mainAmount ||
    null;

  const candidate =
    pickBestVerifiedAmount(
      brain
    );

  if (!candidate) {
    return current;
  }

  /*
   * Complément.
   */

  if (!current) {
    return mapBrainAmount(
      candidate
    );
  }

  /*
   * Pas de correction automatique
   * avec contradiction forte.
   */

  if (
    hasHighContradiction
  ) {
    return current;
  }

  const currentValue =
    normalizeComparable(
      current?.value
    );

  const candidateValue =
    normalizeComparable(
      candidate?.value
    );

  /*
   * Même montant.
   */

  if (
    currentValue &&
    currentValue ===
      candidateValue
  ) {
    return current;
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
   * Correction très prudente.
   */

  if (
    candidateConfidence >= 92 &&
    candidateConfidence >=
      currentConfidence + 18
  ) {
    return mapBrainAmount(
      candidate
    );
  }

  return current;
}

function pickBestVerifiedAmount(
  brain
) {
  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  const candidates =
    amounts
      .filter(
        (amount) =>
          amount?.verified === true &&
          amount?.userRelevant === true
      )
      .filter(
        (amount) =>
          !isForbiddenMainAmountRole(
            amount?.role
          )
      )
      .sort(
        (a, b) =>
          scoreAmountCandidate(b) -
          scoreAmountCandidate(a)
      );

  return (
    candidates[0] ||
    null
  );
}

function scoreAmountCandidate(
  amount
) {
  let score =
    Number(
      amount?.confidence || 0
    );

  const role =
    normalizeRole(
      amount?.role
    );

  if (
    isRefundRole(role)
  ) {
    score += 30;
  }

  if (
    isAutomaticDebitRole(
      role
    )
  ) {
    score += 28;
  }

  if (
    isAmountDueRole(
      role
    )
  ) {
    score += 25;
  }

  if (
    isPaidRole(
      role
    )
  ) {
    score += 15;
  }

  if (
    amount?.evidence?.quote
  ) {
    score += 8;
  }

  return score;
}

function mapBrainAmount(
  amount
) {
  return {
    value:
      amount?.value ||
      null,

    label:
      labelAmountRole(
        amount?.role
      ),

    meaning:
      amount?.verificationReason ||
      "Montant vérifié par Didou Brain",

    role:
      amount?.role ||
      "unknown",

    confidence:
      amount?.confidence ||
      0,

    source:
      "didou-brain"
  };
}

/**
 * =====================================================
 * DATE PRINCIPALE
 * =====================================================
 */

function fuseMainDate({
  brain,
  adapted,
  hasHighContradiction
}) {
  const current =
    adapted?.mainDate ||
    null;

  const candidate =
    pickBestVerifiedDate(
      brain
    );

  if (!candidate) {
    return current;
  }

  if (!current) {
    return mapBrainDate(
      candidate
    );
  }

  if (
    hasHighContradiction
  ) {
    return current;
  }

  const currentValue =
    normalizeComparable(
      current?.date
    );

  const candidateValue =
    normalizeComparable(
      candidate?.value
    );

  if (
    currentValue &&
    currentValue ===
      candidateValue
  ) {
    return current;
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
    candidateConfidence >= 94 &&
    candidateConfidence >=
      currentConfidence + 18
  ) {
    return mapBrainDate(
      candidate
    );
  }

  return current;
}

function pickBestVerifiedDate(
  brain
) {
  const dates =
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : [];

  const candidates =
    dates
      .filter(
        (date) =>
          date?.verified === true &&
          date?.userRelevant === true
      )
      .filter(
        (date) =>
          !isForbiddenMainDateRole(
            date?.role
          )
      )
      .sort(
        (a, b) =>
          scoreDateCandidate(b) -
          scoreDateCandidate(a)
      );

  return (
    candidates[0] ||
    null
  );
}

function scoreDateCandidate(
  date
) {
  let score =
    Number(
      date?.confidence || 0
    );

  const role =
    normalizeRole(
      date?.role
    );

  if (
    role.includes(
      "meeting"
    )
  ) {
    score += 30;
  }

  if (
    role.includes(
      "deadline"
    )
  ) {
    score += 28;
  }

  if (
    role.includes(
      "refund"
    )
  ) {
    score += 25;
  }

  if (
    role.includes(
      "debit"
    )
  ) {
    score += 25;
  }

  if (
    role.includes(
      "payment"
    )
  ) {
    score += 15;
  }

  if (
    date?.evidence?.quote
  ) {
    score += 8;
  }

  return score;
}

function mapBrainDate(
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
      date?.verificationReason ||
      "Date vérifiée par Didou Brain",

    role:
      date?.role ||
      "unknown",

    confidence:
      date?.confidence ||
      0,

    source:
      "didou-brain"
  };
}

/**
 * =====================================================
 * ACTIONS
 * =====================================================
 */

function fuseActions({
  brain,
  adapted,
  intent
}) {
  const current =
    Array.isArray(
      adapted?.actions
    )
      ? adapted.actions
      : [];

  /*
   * On garde les actions métier existantes.
   */

  if (
    current.length
  ) {
    return current;
  }

  /*
   * Une attestation / justificatif ne doit
   * pas recevoir artificiellement une action.
   */

  if (
    intent?.type === "proof" &&
    intent?.actionRequired === false
  ) {
    return [];
  }

  const brainActions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : [];

  return brainActions
    .filter(
      (action) =>
        Number(
          action?.confidence || 0
        ) >= 75
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
          "didou-brain"
      })
    )
    .filter(
      (action) =>
        action.action
    )
    .slice(
      0,
      3
    );
}

/**
 * =====================================================
 * FAITS IMPORTANTS
 * =====================================================
 */

function fuseImportantFacts({
  brain,
  adapted
}) {
  const result =
    Array.isArray(
      adapted?.importantFacts
    )
      ? [...adapted.importantFacts]
      : [];

  const brainFacts =
    Array.isArray(
      brain?.importantFacts
    )
      ? brain.importantFacts
      : [];

  for (
    const fact
    of brainFacts
  ) {
    if (
      fact?.verified !== true
    ) {
      continue;
    }

    if (
      !fact?.value
    ) {
      continue;
    }

    const exists =
      result.some(
        (currentFact) =>
          normalizeComparable(
            currentFact?.value
          ) ===
          normalizeComparable(
            fact.value
          )
      );

    if (
      exists
    ) {
      continue;
    }

    result.push({
      kind:
        fact.kind ||
        "brain",

      label:
        fact.label ||
        "Information",

      value:
        fact.value,

      confidence:
        fact.confidence ||
        0,

      source:
        "didou-brain"
    });

    if (
      result.length >= 6
    ) {
      break;
    }
  }

  return result;
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function fuseConfidence({
  brain,
  adapted,
  detection,
  hasHighContradiction
}) {
  const current =
    Number(
      adapted?.confidence ??
      detection?.confidence ??
      0
    );

  const brainScore =
    Number(
      brain?.score?.global ||
      0
    );

  const intentConfidence =
    Number(
      brain?.intent?.confidence ||
      0
    );

  if (
    hasHighContradiction
  ) {
    return Math.min(
      current,
      Math.max(
        40,
        brainScore
      )
    );
  }

  /*
   * Pour une attestation très clairement reconnue,
   * l'intention peut renforcer la confiance même
   * sans montant/date.
   */

  if (
    brain?.intent?.type === "proof" &&
    intentConfidence >= 88
  ) {
    return Math.min(
      96,
      Math.max(
        current,
        Math.round(
          intentConfidence * 0.92
        )
      )
    );
  }

  if (
    brainScore >= 80
  ) {
    return Math.min(
      98,
      Math.max(
        current,
        Math.round(
          current * 0.75 +
          brainScore * 0.25
        )
      )
    );
  }

  return current;
}

/**
 * =====================================================
 * UTILITÉ TYPE
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
    "document administratif",
    "document inconnu",
    "document autre"
  ].includes(
    text
  );
}

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

  /*
   * Les formulations génériques peuvent
   * être remplacées par le Brain.
   */

  if (
    /document appartenant a la famille|presenter votre situation|document administratif/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

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
    /document administratif|document recu|document reçu/.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

/**
 * =====================================================
 * RÔLES INTERDITS
 * =====================================================
 */

function isForbiddenMainAmountRole(
  role
) {
  const text =
    normalizeRole(
      role
    );

  return (
    text.includes(
      "companylegal"
    ) ||
    text.includes(
      "legalinformation"
    ) ||
    text.includes(
      "vat"
    ) ||
    text === "ht" ||
    text === "ttc" ||
    text.includes(
      "invoiceline"
    ) ||
    text.includes(
      "tablevalue"
    ) ||
    text.includes(
      "example"
    ) ||
    text.includes(
      "installment"
    )
  );
}

function isForbiddenMainDateRole(
  role
) {
  const text =
    normalizeRole(
      role
    );

  return (
    text.includes(
      "legal"
    ) ||
    text.includes(
      "historical"
    ) ||
    text.includes(
      "issuedate"
    ) ||
    text === "issue"
  );
}

/**
 * =====================================================
 * RÔLES
 * =====================================================
 */

function isRefundRole(
  role
) {
  return (
    role.includes(
      "refund"
    ) ||
    role.includes(
      "rembours"
    )
  );
}

function isAutomaticDebitRole(
  role
) {
  return (
    role.includes(
      "automaticdebit"
    ) ||
    role === "debit"
  );
}

function isAmountDueRole(
  role
) {
  return (
    role.includes(
      "amountdue"
    ) ||
    role.includes(
      "paymentdue"
    ) ||
    role === "due"
  );
}

function isPaidRole(
  role
) {
  return (
    role.includes(
      "paid"
    ) ||
    role.includes(
      "paymentamount"
    )
  );
}

/**
 * =====================================================
 * LABELS
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
    isRefundRole(text)
  ) {
    return "Montant remboursé";
  }

  if (
    isAutomaticDebitRole(text)
  ) {
    return "Montant prélevé";
  }

  if (
    isAmountDueRole(text)
  ) {
    return "Montant à payer";
  }

  if (
    isPaidRole(text)
  ) {
    return "Montant payé";
  }

  return "Montant";
}

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
    return "Date du rendez-vous";
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
    return "Date du remboursement";
  }

  if (
    text.includes(
      "debit"
    )
  ) {
    return "Date du prélèvement";
  }

  if (
    text.includes(
      "payment"
    )
  ) {
    return "Date du paiement";
  }

  return "Date";
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
    .toLowerCase();
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
