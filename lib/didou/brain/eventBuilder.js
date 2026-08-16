/**
 * Didou Brain
 * Event Builder V2
 *
 * Objectifs :
 * - construire des événements métier ;
 * - relier le bon montant à la bonne date ;
 * - utiliser la proximité dans le document ;
 * - utiliser le contexte local ;
 * - tenir compte du rôle et de la confiance ;
 * - éviter les associations arbitraires.
 */

export function buildEvents(brain) {
  const events = [];

  if (
    !brain ||
    typeof brain !== "object"
  ) {
    return events;
  }

  events.push(
    ...buildRefundEvents(brain)
  );

  events.push(
    ...buildDebitEvents(brain)
  );

  events.push(
    ...buildPaymentEvents(brain)
  );

  events.push(
    ...buildMeetingEvents(brain)
  );

  return dedupeEvents(
    events
  );
}

/**
 * =====================================================
 * REMBOURSEMENTS
 * =====================================================
 */

function buildRefundEvents(brain) {
  const events = [];

  const amounts =
    getVerifiedRelevantAmounts(
      brain
    )
      .filter(
        (amount) =>
          isRefundRole(
            amount?.role
          )
      );

  const dates =
    getVerifiedRelevantDates(
      brain
    )
      .filter(
        (date) =>
          roleContains(
            date?.role,
            "refund"
          )
      );

  for (
    const amount
    of amounts
  ) {
    const dateLink =
      pickBestLinkedDate({
        amount,
        dates,
        eventType:
          "refund"
      });

    const event =
      {
        type:
          "refund",

        label:
          "Remboursement",

        amount,

        date:
          dateLink?.date ||
          null,

        linkScore:
          dateLink?.score ||
          0,

        confidence:
          calculateEventConfidence({
            amount,
            date:
              dateLink?.date ||
              null,
            linkScore:
              dateLink?.score ||
              0,
            eventType:
              "refund"
          }),

        evidence:
          buildEventEvidence({
            amount,
            date:
              dateLink?.date ||
              null
          })
      };

    events.push(
      event
    );
  }

  return events;
}

/**
 * =====================================================
 * PRÉLÈVEMENTS AUTOMATIQUES
 * =====================================================
 */

function buildDebitEvents(brain) {
  const events = [];

  const amounts =
    getVerifiedRelevantAmounts(
      brain
    )
      .filter(
        (amount) =>
          isDebitRole(
            amount?.role
          )
      );

  const dates =
    getVerifiedRelevantDates(
      brain
    )
      .filter(
        (date) =>
          roleContains(
            date?.role,
            "debit"
          )
      );

  for (
    const amount
    of amounts
  ) {
    const dateLink =
      pickBestLinkedDate({
        amount,
        dates,
        eventType:
          "automatic_debit"
      });

    events.push({
      type:
        "automatic_debit",

      label:
        "Prélèvement automatique",

      amount,

      date:
        dateLink?.date ||
        null,

      linkScore:
        dateLink?.score ||
        0,

      confidence:
        calculateEventConfidence({
          amount,
          date:
            dateLink?.date ||
            null,
          linkScore:
            dateLink?.score ||
            0,
          eventType:
            "automatic_debit"
        }),

      evidence:
        buildEventEvidence({
          amount,
          date:
            dateLink?.date ||
            null
        })
    });
  }

  return events;
}

/**
 * =====================================================
 * PAIEMENTS À EFFECTUER
 * =====================================================
 */

function buildPaymentEvents(brain) {
  const events = [];

  const amounts =
    getVerifiedRelevantAmounts(
      brain
    )
      .filter(
        (amount) =>
          isDueRole(
            amount?.role
          )
      );

  const dates =
    getVerifiedRelevantDates(
      brain
    )
      .filter(
        (date) =>
          roleContains(
            date?.role,
            "payment"
          ) ||
          roleContains(
            date?.role,
            "deadline"
          )
      );

  for (
    const amount
    of amounts
  ) {
    const dateLink =
      pickBestLinkedDate({
        amount,
        dates,
        eventType:
          "payment_due"
      });

    events.push({
      type:
        "payment_due",

      label:
        "Paiement à effectuer",

      amount,

      date:
        dateLink?.date ||
        null,

      linkScore:
        dateLink?.score ||
        0,

      confidence:
        calculateEventConfidence({
          amount,
          date:
            dateLink?.date ||
            null,
          linkScore:
            dateLink?.score ||
            0,
          eventType:
            "payment_due"
        }),

      evidence:
        buildEventEvidence({
          amount,
          date:
            dateLink?.date ||
            null
        })
    });
  }

  return events;
}

/**
 * =====================================================
 * RÉUNIONS / ASSEMBLÉES
 * =====================================================
 */

function buildMeetingEvents(brain) {
  const events = [];

  const dates =
    getVerifiedRelevantDates(
      brain
    )
      .filter(
        (date) =>
          roleContains(
            date?.role,
            "meeting"
          )
      );

  for (
    const date
    of dates
  ) {
    let confidence =
      Number(
        date?.confidence ||
        0
      );

    const context =
      normalizeText(
        [
          date?.context || "",
          date?.evidence?.quote || ""
        ].join(" ")
      );

    if (
      /assemblee generale|assemblee|convocation|se tiendra|reunion/.test(
        context
      )
    ) {
      confidence += 15;
    }

    if (
      /\b\d{1,2}(?:h\d{0,2}|:\d{2})\b/.test(
        context
      )
    ) {
      confidence += 10;
    }

    events.push({
      type:
        "meeting",

      label:
        "Réunion / assemblée",

      amount:
        null,

      date,

      linkScore:
        100,

      confidence:
        clamp(
          confidence,
          0,
          98
        ),

      evidence:
        buildEventEvidence({
          amount:
            null,
          date
        })
    });
  }

  return events;
}

/**
 * =====================================================
 * ASSOCIATION MONTANT ↔ DATE
 * =====================================================
 */

function pickBestLinkedDate({
  amount,
  dates,
  eventType
}) {
  if (
    !amount ||
    !Array.isArray(dates) ||
    !dates.length
  ) {
    return null;
  }

  const ranked =
    dates
      .map(
        (date) => ({
          date,
          score:
            scoreAmountDateLink({
              amount,
              date,
              eventType
            })
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  if (
    !ranked.length
  ) {
    return null;
  }

  const best =
    ranked[0];

  /*
   * Seuil volontairement prudent.
   */
  if (
    best.score < 35
  ) {
    return null;
  }

  return best;
}

/**
 * =====================================================
 * SCORE DE LIEN
 * =====================================================
 */

function scoreAmountDateLink({
  amount,
  date,
  eventType
}) {
  let score = 0;

  /*
   * -----------------------------------------------------
   * 1 — PROXIMITÉ POSITIONNELLE
   * -----------------------------------------------------
   */

  const amountIndex =
    numericOrNull(
      amount?.index
    );

  const dateIndex =
    numericOrNull(
      date?.index
    );

  if (
    amountIndex !== null &&
    dateIndex !== null
  ) {
    const distance =
      Math.abs(
        amountIndex -
        dateIndex
      );

    if (
      distance <= 80
    ) {
      score += 60;
    } else if (
      distance <= 160
    ) {
      score += 45;
    } else if (
      distance <= 300
    ) {
      score += 30;
    } else if (
      distance <= 600
    ) {
      score += 15;
    } else {
      score -= 10;
    }
  }

  /*
   * -----------------------------------------------------
   * 2 — CONTEXTE PARTAGÉ
   * -----------------------------------------------------
   */

  const amountContext =
    normalizeText(
      [
        amount?.before || "",
        amount?.line || "",
        amount?.after || "",
        amount?.context || "",
        amount?.evidence?.quote || ""
      ].join(" ")
    );

  const dateContext =
    normalizeText(
      [
        date?.context || "",
        date?.evidence?.quote || ""
      ].join(" ")
    );

  /*
   * Si le contexte de l'un contient la valeur de l'autre,
   * le lien est très fort.
   */

  const normalizedDateValue =
    normalizeComparable(
      date?.value
    );

  const normalizedAmountValue =
    normalizeComparable(
      amount?.value
    );

  if (
    normalizedDateValue &&
    normalizeComparable(
      amountContext
    ).includes(
      normalizedDateValue
    )
  ) {
    score += 35;
  }

  if (
    normalizedAmountValue &&
    normalizeComparable(
      dateContext
    ).includes(
      normalizedAmountValue
    )
  ) {
    score += 35;
  }

  /*
   * -----------------------------------------------------
   * 3 — COHÉRENCE MÉTIER
   * -----------------------------------------------------
   */

  score +=
    scoreBusinessContext({
      eventType,
      amountContext,
      dateContext
    });

  /*
   * -----------------------------------------------------
   * 4 — CONFIANCE DES DEUX FAITS
   * -----------------------------------------------------
   */

  score +=
    Math.round(
      Number(
        amount?.confidence || 0
      ) * 0.08
    );

  score +=
    Math.round(
      Number(
        date?.confidence || 0
      ) * 0.08
    );

  /*
   * -----------------------------------------------------
   * 5 — PREUVE
   * -----------------------------------------------------
   */

  if (
    amount?.evidence?.quote
  ) {
    score += 5;
  }

  if (
    date?.evidence?.quote
  ) {
    score += 5;
  }

  return clamp(
    score,
    0,
    100
  );
}

/**
 * =====================================================
 * COHÉRENCE MÉTIER
 * =====================================================
 */

function scoreBusinessContext({
  eventType,
  amountContext,
  dateContext
}) {
  const combined =
    `${amountContext} ${dateContext}`;

  let score = 0;

  if (
    eventType ===
    "refund"
  ) {
    if (
      /nous vous rembourserons|vous serez rembourse|remboursement|a vous rembourser|avoir en votre faveur|credit en votre faveur|solde crediteur/.test(
        combined
      )
    ) {
      score += 30;
    }

    if (
      /mensualite|echeancier|capital social|au capital de/.test(
        combined
      )
    ) {
      score -= 25;
    }
  }

  if (
    eventType ===
    "automatic_debit"
  ) {
    if (
      /prelevement automatique|sera preleve|sera debite|nous preleverons|montant du prelevement/.test(
        combined
      )
    ) {
      score += 30;
    }

    if (
      /rembours|avoir en votre faveur/.test(
        combined
      )
    ) {
      score -= 30;
    }
  }

  if (
    eventType ===
    "payment_due"
  ) {
    if (
      /montant a payer|net a payer|reste a payer|solde a payer|total a regler|somme a regler|date limite|echeance/.test(
        combined
      )
    ) {
      score += 30;
    }

    if (
      /prelevement automatique|sera preleve|sera debite/.test(
        combined
      )
    ) {
      score -= 20;
    }

    if (
      /rembours|avoir en votre faveur|credit en votre faveur/.test(
        combined
      )
    ) {
      score -= 35;
    }
  }

  return score;
}

/**
 * =====================================================
 * CONFIANCE ÉVÉNEMENT
 * =====================================================
 */

function calculateEventConfidence({
  amount,
  date,
  linkScore,
  eventType
}) {
  let score = 35;

  if (
    amount
  ) {
    score +=
      Number(
        amount?.confidence || 0
      ) * 0.35;
  }

  if (
    date
  ) {
    score +=
      Number(
        date?.confidence || 0
      ) * 0.2;
  }

  score +=
    Number(
      linkScore || 0
    ) * 0.25;

  /*
   * Bonus si le montant est explicitement
   * pertinent utilisateur.
   */

  if (
    amount?.userRelevant === true
  ) {
    score += 8;
  }

  /*
   * Bonus métier léger.
   */

  if (
    [
      "refund",
      "automatic_debit",
      "payment_due"
    ].includes(
      eventType
    )
  ) {
    score += 5;
  }

  return clamp(
    Math.round(score),
    0,
    98
  );
}

/**
 * =====================================================
 * SÉLECTION DES FAITS
 * =====================================================
 */

function getVerifiedRelevantAmounts(
  brain
) {
  return (
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : []
  )
    .filter(
      (amount) =>
        amount?.verified ===
          true &&
        amount?.userRelevant ===
          true
    );
}

function getVerifiedRelevantDates(
  brain
) {
  return (
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : []
  )
    .filter(
      (date) =>
        date?.verified ===
          true &&
        date?.userRelevant ===
          true
    );
}

/**
 * =====================================================
 * EVIDENCE ÉVÉNEMENT
 * =====================================================
 */

function buildEventEvidence({
  amount,
  date
}) {
  const evidence = [];

  if (
    amount?.evidence
  ) {
    evidence.push({
      kind:
        "amount",

      quote:
        amount.evidence.quote ||
        null,

      confidence:
        amount.confidence ||
        0
    });
  }

  if (
    date?.evidence
  ) {
    evidence.push({
      kind:
        "date",

      quote:
        date.evidence.quote ||
        null,

      confidence:
        date.confidence ||
        0
    });
  }

  return evidence;
}

/**
 * =====================================================
 * DÉDOUBLONNAGE
 * =====================================================
 */

function dedupeEvents(
  events
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const event
    of events
  ) {
    const key =
      [
        event?.type || "",
        event?.amount?.value || "",
        event?.date?.value || ""
      ]
        .map(
          normalizeComparable
        )
        .join("|");

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(
      event
    );
  }

  /*
   * On conserve les événements les plus fiables
   * en premier.
   */
  return result.sort(
    (a, b) =>
      Number(
        b?.confidence || 0
      ) -
      Number(
        a?.confidence || 0
      )
  );
}

/**
 * =====================================================
 * ROLES
 * =====================================================
 */

function isRefundRole(
  role
) {
  const value =
    normalizeRole(
      role
    );

  return (
    value.includes(
      "refund"
    ) ||
    value.includes(
      "rembours"
    )
  );
}

function isDebitRole(
  role
) {
  const value =
    normalizeRole(
      role
    );

  return (
    value.includes(
      "automaticdebit"
    ) ||
    value.includes(
      "debit"
    )
  );
}

function isDueRole(
  role
) {
  const value =
    normalizeRole(
      role
    );

  return (
    value.includes(
      "amountdue"
    ) ||
    value.includes(
      "paymentdue"
    ) ||
    value ===
      "due"
  );
}

function roleContains(
  role,
  keyword
) {
  return normalizeRole(
    role
  )
    .includes(
      normalizeRole(
        keyword
      )
    );
}

/**
 * =====================================================
 * OUTILS
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

function normalizeText(
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
      /[’']/g,
      "'"
    )
    .replace(
      /\s+/g,
      " "
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

function numericOrNull(
  value
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(value);

  const safe =
    Number.isFinite(
      numeric
    )
      ? numeric
      : 0;

  return Math.max(
    min,
    Math.min(
      max,
      safe
    )
  );
}
