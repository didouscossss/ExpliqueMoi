/**
 * Didou Brain
 * Event Builder V1
 */

export function buildEvents(brain) {
  const events = [];

  if (!brain) {
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

  return events;
}

/**
 * =====================================================
 * REMBOURSEMENTS
 * =====================================================
 */

function buildRefundEvents(brain) {
  const events = [];

  const amounts =
    (brain.amounts || []).filter(
      (a) =>
        a.verified &&
        isRefundRole(a.role)
    );

  const dates =
    (brain.dates || []).filter(
      (d) =>
        d.verified &&
        roleContains(
          d.role,
          "refund"
        )
    );

  for (const amount of amounts) {
    events.push({
      type: "refund",

      amount,

      date:
        dates[0] || null,

      confidence:
        calculateEventConfidence(
          amount,
          dates[0]
        )
    });
  }

  return events;
}

/**
 * =====================================================
 * PRELEVEMENTS
 * =====================================================
 */

function buildDebitEvents(brain) {
  const events = [];

  const amounts =
    (brain.amounts || []).filter(
      (a) =>
        a.verified &&
        isDebitRole(a.role)
    );

  const dates =
    (brain.dates || []).filter(
      (d) =>
        d.verified &&
        roleContains(
          d.role,
          "debit"
        )
    );

  for (const amount of amounts) {
    events.push({
      type:
        "automatic_debit",

      amount,

      date:
        dates[0] || null,

      confidence:
        calculateEventConfidence(
          amount,
          dates[0]
        )
    });
  }

  return events;
}

/**
 * =====================================================
 * PAIEMENTS
 * =====================================================
 */

function buildPaymentEvents(brain) {
  const events = [];

  const amounts =
    (brain.amounts || []).filter(
      (a) =>
        a.verified &&
        isDueRole(a.role)
    );

  const dates =
    (brain.dates || []).filter(
      (d) =>
        d.verified &&
        roleContains(
          d.role,
          "payment"
        )
    );

  for (const amount of amounts) {
    events.push({
      type:
        "payment_due",

      amount,

      date:
        dates[0] || null,

      confidence:
        calculateEventConfidence(
          amount,
          dates[0]
        )
    });
  }

  return events;
}

/**
 * =====================================================
 * REUNIONS
 * =====================================================
 */

function buildMeetingEvents(brain) {
  const events = [];

  const dates =
    (brain.dates || []).filter(
      (d) =>
        d.verified &&
        roleContains(
          d.role,
          "meeting"
        )
    );

  for (const date of dates) {
    events.push({
      type:
        "meeting",

      amount:
        null,

      date,

      confidence:
        Math.min(
          100,
          (date.confidence || 0) + 10
        )
    });
  }

  return events;
}

/**
 * =====================================================
 * SCORE EVENEMENT
 * =====================================================
 */

function calculateEventConfidence(
  amount,
  date
) {
  let score = 50;

  if (amount) {
    score +=
      (amount.confidence || 0) *
      0.4;
  }

  if (date) {
    score +=
      (date.confidence || 0) *
      0.3;
  }

  return Math.min(
    100,
    Math.round(score)
  );
}

/**
 * =====================================================
 * ROLES
 * =====================================================
 */

function isRefundRole(role) {
  const value =
    String(role || "")
      .toLowerCase();

  return (
    value.includes(
      "refund"
    ) ||
    value.includes(
      "rembours"
    )
  );
}

function isDebitRole(role) {
  const value =
    String(role || "")
      .toLowerCase();

  return (
    value.includes(
      "debit"
    ) ||
    value.includes(
      "automatic"
    )
  );
}

function isDueRole(role) {
  const value =
    String(role || "")
      .toLowerCase();

  return (
    value.includes(
      "due"
    ) ||
    value.includes(
      "payment_due"
    )
  );
}

function roleContains(
  role,
  keyword
) {
  return String(
    role || ""
  )
    .toLowerCase()
    .includes(
      keyword
    );
}
