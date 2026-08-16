/**
 * Didou Brain — Fusion V2
 *
 * Fusion prudente entre :
 * - résultat des adaptateurs métier ;
 * - faits vérifiés du Brain.
 *
 * Principes :
 * - l'adaptateur garde la priorité ;
 * - le Brain complète les trous ;
 * - le Brain peut corriger uniquement si :
 *   1. le fait Brain est verified ;
 *   2. userRelevant === true ;
 *   3. la confiance Brain est nettement supérieure ;
 *   4. aucune contradiction forte ne bloque la correction.
 */

export function fuseBrainAndAdapted({
  brain,
  adapted,
  detection
}) {
  if (!brain) {
    return adapted;
  }

  const result = {
    ...adapted
  };

  /*
   * =====================================================
   * CONTRADICTIONS FORTES
   * =====================================================
   */

  const hasHighContradiction =
    (brain.contradictions || [])
      .some(
        (item) =>
          item?.severity === "high"
      );

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  result.issuer =
    fuseIssuer({
      brain,
      adapted
    });

  /*
   * =====================================================
   * MONTANT PRINCIPAL
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
   * DATE PRINCIPALE
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
   * ACTIONS
   * =====================================================
   */

  result.actions =
    fuseActions({
      brain,
      adapted
    });

  /*
   * =====================================================
   * FAITS IMPORTANTS
   * =====================================================
   */

  result.importantFacts =
    fuseImportantFacts({
      brain,
      adapted
    });

  /*
   * =====================================================
   * CONFIANCE
   * =====================================================
   */

  result.confidence =
    fuseConfidence({
      brain,
      adapted,
      detection,
      hasHighContradiction
    });

  /*
   * =====================================================
   * DIAGNOSTIC INTERNE
   * =====================================================
   */

  result.brainFusion = {
    applied:
      true,

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

  /*
   * Aucun candidat Brain fiable.
   */
  if (!candidate) {
    return current;
  }

  /*
   * Rien côté adaptateur :
   * le Brain peut compléter.
   */
  if (!current) {
    return mapBrainAmount(
      candidate
    );
  }

  /*
   * Contradiction forte :
   * pas de remplacement automatique.
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
   * Même valeur :
   * on conserve la structure adaptateur.
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
   * Correction uniquement si le Brain
   * est franchement plus fiable.
   */
  if (
    candidateConfidence >= 90 &&
    candidateConfidence >=
      currentConfidence + 15
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

  /*
   * Priorité métier.
   */
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

  /*
   * Preuve directe.
   */
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

  /*
   * Une date Brain doit être très forte
   * avant de remplacer une date métier.
   */
  if (
    candidateConfidence >= 92 &&
    candidateConfidence >=
      currentConfidence + 15
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
  adapted
}) {
  const current =
    Array.isArray(
      adapted?.actions
    )
      ? adapted.actions
      : [];

  /*
   * Si l'adaptateur a déjà des actions,
   * on les garde.
   */
  if (
    current.length
  ) {
    return current;
  }

  const brainActions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : [];

  const candidates =
    brainActions
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
      );

  return candidates.slice(
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
  const current =
    Array.isArray(
      adapted?.importantFacts
    )
      ? adapted.importantFacts
      : [];

  /*
   * On conserve les faits métier existants.
   */
  const result =
    [...current];

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

  /*
   * Une contradiction forte ne doit jamais
   * augmenter artificiellement la confiance.
   */
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
   * Le Brain peut légèrement renforcer
   * la confiance mais pas la gonfler brutalement.
   */
  if (
    brainScore >= 80
  ) {
    return Math.min(
      98,
      Math.max(
        current,
        Math.round(
          (
            current * 0.75 +
            brainScore * 0.25
          )
        )
      )
    );
  }

  return current;
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
      "table_value"
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
 * RÔLES MONTANTS
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
    role.includes(
      "automatic_debit"
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
      "payment_due"
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
    isRefundRole(
      text
    )
  ) {
    return (
      "Montant remboursé"
    );
  }

  if (
    isAutomaticDebitRole(
      text
    )
  ) {
    return (
      "Montant prélevé"
    );
  }

  if (
    isAmountDueRole(
      text
    )
  ) {
    return (
      "Montant à payer"
    );
  }

  if (
    isPaidRole(
      text
    )
  ) {
    return (
      "Montant payé"
    );
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
    return (
      "Date du rendez-vous"
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

  return "Date";
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function normalizeRole(
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

function normalizeComparable(
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
      /\s+/g,
      ""
    )
    .replace(
      /,/g,
      "."
    )
    .trim();
}
