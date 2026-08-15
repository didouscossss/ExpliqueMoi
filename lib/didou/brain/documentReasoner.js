/**
 * Didou Brain - Document Reasoner V1
 *
 * Transforme :
 * texte + extraction + détection
 *
 * en :
 * brainResult
 */

import {
  createEmptyDocumentBrain,
  createAmount,
  createDate,
  createAction
} from "./schema.js";

export function runDocumentReasoner({
  text,
  extraction,
  detection
}) {
  const brain =
    createEmptyDocumentBrain();

  /*
   * ============================
   * DOCUMENT
   * ============================
   */

  brain.document = {
    family:
      detection?.family || null,

    type:
      detection?.documentType || null,

    confidence:
      detection?.confidence || 0
  };

  /*
   * ============================
   * EMETTEUR
   * ============================
   */

  brain.issuer =
    pickIssuer(
      extraction
    );

  brain.recipient =
    pickRecipient(
      extraction
    );

  /*
   * ============================
   * MONTANTS
   * ============================
   */

  for (
    const amount of (
      extraction?.amounts || []
    )
  ) {
    brain.amounts.push(
      createAmount({
        value:
          amount.value,

        role:
          amount.role ||
          "unknown",

        confidence:
          amount.confidence || 0
      })
    );
  }

  /*
   * ============================
   * DATES
   * ============================
   */

  for (
    const date of (
      extraction?.dates || []
    )
  ) {
    brain.dates.push(
      createDate({
        value:
          date.raw,

        role:
          date.role ||
          date.hint ||
          "unknown",

        confidence:
          date.confidence || 0
      })
    );
  }

  /*
   * ============================
   * ACTIONS
   * ============================
   */

  for (
    const action of (
      extraction?.actionPhrases || []
    )
  ) {
    brain.actions.push(
      createAction({
        action:
          action.phrase,

        confidence:
          action.confidence || 0
      })
    );
  }

  /*
   * ============================
   * FAITS IMPORTANTS
   * ============================
   */

  brain.importantFacts =
    buildImportantFacts({
      extraction,
      detection
    });

  /*
   * ============================
   * RESUME INITIAL
   * ============================
   */

  brain.summary =
    buildInitialSummary({
      detection,
      extraction
    });

  /*
   * ============================
   * SCORE
   * ============================
   */

  brain.score = {
    extraction:
      calculateExtractionScore(
        extraction
      ),

    reasoning:
      50,

    verification:
      0,

    global:
      calculateExtractionScore(
        extraction
      )
  };

  return brain;
}

/**
 * ============================
 * IMPORTANT FACTS
 * ============================
 */

function buildImportantFacts({
  extraction,
  detection
}) {
  const facts = [];

  if (
    detection?.documentType
  ) {
    facts.push({
      label:
        "Type",

      value:
        detection.documentType
    });
  }

  const importantAmount =
    (
      extraction?.amounts || []
    ).find(
      (a) =>
        a.important
    );

  if (
    importantAmount
  ) {
    facts.push({
      label:
        "Montant",

      value:
        importantAmount.value
    });
  }

  const importantDate =
    (
      extraction?.dates || []
    ).find(
      (d) =>
        d.important
    );

  if (
    importantDate
  ) {
    facts.push({
      label:
        "Date",

      value:
        importantDate.raw
    });
  }

  return facts;
}

/**
 * ============================
 * RESUME INITIAL
 * ============================
 */

function buildInitialSummary({
  detection
}) {
  if (
    detection?.documentType
  ) {
    return `Document identifié : ${detection.documentType}`;
  }

  if (
    detection?.family
  ) {
    return `Document de type ${detection.family}`;
  }

  return (
    "Document analysé"
  );
}

/**
 * ============================
 * EMETTEUR
 * ============================
 */

function pickIssuer(
  extraction
) {
  const organizations =
    extraction?.entities
      ?.organizations || [];

  if (
    !organizations.length
  ) {
    return null;
  }

  return (
    organizations[0]
  );
}

/**
 * ============================
 * DESTINATAIRE
 * ============================
 */

function pickRecipient(
  extraction
) {
  const people =
    extraction?.entities
      ?.people || [];

  if (
    !people.length
  ) {
    return null;
  }

  return people[0];
}

/**
 * ============================
 * SCORE
 * ============================
 */

function calculateExtractionScore(
  extraction
) {
  let score = 0;

  score +=
    (extraction?.dates || [])
      .length * 5;

  score +=
    (extraction?.amounts || [])
      .length * 5;

  score +=
    (extraction?.actionPhrases || [])
      .length * 5;

  return Math.min(
    score,
    100
  );
}
