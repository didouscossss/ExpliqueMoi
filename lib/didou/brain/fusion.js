/**
 * Didou Brain
 * Fusion V1
 *
 * Fusion prudente.
 *
 * Les adaptateurs gardent la priorité.
 * Le Brain ne complète que lorsqu'il est
 * suffisamment sûr.
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
   * =====================================
   * EMETTEUR
   * =====================================
   */

  if (
    !result.issuer &&
    brain.issuerVerified
  ) {
    result.issuer =
      brain.issuer;
  }

  /*
   * =====================================
   * DESTINATAIRE
   * =====================================
   */

  if (
    !result.recipient &&
    brain.recipient
  ) {
    result.recipient =
      brain.recipient;
  }

  /*
   * =====================================
   * DATE PRINCIPALE
   * =====================================
   */

  if (
    !result.mainDate
  ) {
    const verifiedDate =
      pickBestDate(
        brain
      );

    if (
      verifiedDate
    ) {
      result.mainDate = {
        date:
          verifiedDate.value,

        label:
          verifiedDate.role ||
          "Date",

        meaning:
          "Date validée par Didou Brain",

        role:
          verifiedDate.role ||
          "unknown"
      };
    }
  }

  /*
   * =====================================
   * MONTANT PRINCIPAL
   * =====================================
   */

  if (
    !result.mainAmount
  ) {
    const verifiedAmount =
      pickBestAmount(
        brain
      );

    if (
      verifiedAmount
    ) {
      result.mainAmount = {
        value:
          verifiedAmount.value,

        label:
          verifiedAmount.role ||
          "Montant",

        meaning:
          "Montant validé par Didou Brain",

        role:
          verifiedAmount.role ||
          "unknown"
      };
    }
  }

  /*
   * =====================================
   * ACTIONS
   * =====================================
   */

  if (
    (!result.actions ||
      !result.actions.length) &&
    brain.actions?.length
  ) {
    result.actions =
      brain.actions.slice(
        0,
        5
      );
  }

  /*
   * =====================================
   * FAITS IMPORTANTS
   * =====================================
   */

  if (
    (!result.importantFacts ||
      !result.importantFacts.length) &&
    brain.importantFacts?.length
  ) {
    result.importantFacts =
      brain.importantFacts;
  }

  /*
   * =====================================
   * CONFIANCE
   * =====================================
   */

  const brainScore =
    Number(
      brain?.score?.global || 0
    );

  const current =
    Number(
      result.confidence || 0
    );

  result.confidence =
    Math.max(
      current,
      Math.round(
        brainScore * 0.8
      )
    );

  return result;
}

/**
 * =====================================
 * DATE
 * =====================================
 */

function pickBestDate(
  brain
) {
  const dates =
    (brain?.dates || [])
      .filter(
        (date) =>
          date?.verified
      )
      .sort(
        (a, b) =>
          (b.confidence || 0) -
          (a.confidence || 0)
      );

  return (
    dates[0] || null
  );
}

/**
 * =====================================
 * MONTANT
 * =====================================
 */

function pickBestAmount(
  brain
) {
  const amounts =
    (brain?.amounts || [])
      .filter(
        (amount) =>
          amount?.verified
      )
      .sort(
        (a, b) =>
          (b.confidence || 0) -
          (a.confidence || 0)
      );

  return (
    amounts[0] || null
  );
}
