/**
 * Didou Brain
 * Fact Verifier V1
 *
 * Vérifie les faits détectés.
 */

export function verifyBrainFacts(brain) {
  if (!brain) {
    return brain;
  }

  verifyAmounts(brain);
  verifyDates(brain);
  verifyIssuer(brain);

  computeGlobalScore(brain);

  return brain;
}

/**
 * =====================================================
 * MONTANTS
 * =====================================================
 */

function verifyAmounts(brain) {
  const amounts =
    Array.isArray(brain.amounts)
      ? brain.amounts
      : [];

  for (const amount of amounts) {
    amount.verified = false;

    const role =
      String(
        amount.role || ""
      ).toLowerCase();

    let confidence =
      Number(
        amount.confidence || 0
      );

    /*
     * Montants utiles.
     */

    if (
      role.includes("refund")
    ) {
      confidence += 20;
    }

    if (
      role.includes("due")
    ) {
      confidence += 20;
    }

    if (
      role.includes("debit")
    ) {
      confidence += 15;
    }

    /*
     * Montants peu utiles.
     */

    if (
      role.includes("vat")
    ) {
      confidence -= 25;
    }

    if (
      role.includes("ht")
    ) {
      confidence -= 25;
    }

    if (
      role.includes("company")
    ) {
      confidence -= 50;
    }

    amount.confidence =
      clamp(
        confidence,
        0,
        100
      );

    amount.verified =
      amount.confidence >= 70;
  }
}

/**
 * =====================================================
 * DATES
 * =====================================================
 */

function verifyDates(brain) {
  const dates =
    Array.isArray(brain.dates)
      ? brain.dates
      : [];

  for (const date of dates) {
    date.verified = false;

    let confidence =
      Number(
        date.confidence || 0
      );

    const role =
      String(
        date.role || ""
      ).toLowerCase();

    if (
      role.includes("meeting")
    ) {
      confidence += 20;
    }

    if (
      role.includes("deadline")
    ) {
      confidence += 20;
    }

    if (
      role.includes("refund")
    ) {
      confidence += 15;
    }

    if (
      role.includes("debit")
    ) {
      confidence += 15;
    }

    if (
      role.includes("legal")
    ) {
      confidence -= 60;
    }

    if (
      role.includes("historical")
    ) {
      confidence -= 60;
    }

    date.confidence =
      clamp(
        confidence,
        0,
        100
      );

    date.verified =
      date.confidence >= 70;
  }
}

/**
 * =====================================================
 * EMETTEUR
 * =====================================================
 */

function verifyIssuer(brain) {
  if (
    !brain.issuer
  ) {
    return;
  }

  brain.issuerVerified =
    String(
      brain.issuer
    ).length >= 3;
}

/**
 * =====================================================
 * SCORE GLOBAL
 * =====================================================
 */

function computeGlobalScore(brain) {
  const amounts =
    brain.amounts || [];

  const dates =
    brain.dates || [];

  const verifiedAmounts =
    amounts.filter(
      (a) =>
        a.verified
    ).length;

  const verifiedDates =
    dates.filter(
      (d) =>
        d.verified
    ).length;

  const verification =
    Math.min(
      (
        verifiedAmounts +
        verifiedDates
      ) * 10,
      100
    );

  brain.score =
    brain.score || {};

  brain.score.verification =
    verification;

  brain.score.global =
    Math.round(
      (
        (brain.score.extraction || 0) +
        verification
      ) / 2
    );
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}
