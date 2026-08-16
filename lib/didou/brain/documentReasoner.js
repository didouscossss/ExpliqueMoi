/**
 * Didou Brain — Document Reasoner V2.3
 *
 * Architecture :
 *
 * extraction
 *    ↓
 * faits Brain
 *    ↓
 * eventBuilder
 *    ↓
 * situationBuilder
 *    ↓
 * intentBuilder
 *    ↓
 * compréhension documentaire
 */

import {
  createEmptyDocumentBrain,
  createAmount,
  createDate,
  createAction,
  createEvidence,
  createImportantFact,
  EVENT_TYPES
} from "./schema.js";

import {
  buildEvents
} from "./eventBuilder.js";

import {
  buildSituation
} from "./situationBuilder.js";

import {
  buildDocumentIntent
} from "./intentBuilder.js";

/**
 * =====================================================
 * POINT D'ENTRÉE
 * =====================================================
 */

export function runDocumentReasoner({
  text,
  extraction,
  detection
}) {
  const source =
    String(text || "");

  const brain =
    createEmptyDocumentBrain();

  /*
   * ===================================================
   * 1 — DOCUMENT
   * ===================================================
   */

  brain.document =
    buildDocumentIdentity({
      detection
    });

  /*
   * ===================================================
   * 2 — ACTEURS
   * ===================================================
   */

  brain.issuer =
    pickIssuer({
      extraction,
      text: source
    });

  brain.recipient =
    pickRecipient({
      extraction
    });

  /*
   * ===================================================
   * 3 — MONTANTS
   * ===================================================
   */

  brain.amounts =
    buildBrainAmounts(
      extraction?.amounts || []
    );

  /*
   * ===================================================
   * 4 — DATES
   * ===================================================
   */

  brain.dates =
    buildBrainDates(
      extraction?.dates || []
    );

  /*
   * ===================================================
   * 5 — ACTIONS
   * ===================================================
   */

  brain.actions =
    buildBrainActions(
      extraction?.actionPhrases || []
    );

  /*
   * ===================================================
   * 6 — ÉVÉNEMENTS
   * ===================================================
   */

  brain.events =
    buildEvents(
      brain
    );

  /*
   * ===================================================
   * 7 — SITUATION
   * ===================================================
   */

  brain.situation =
    buildSituation({
      events:
        brain.events,

      brain
    });

  /*
   * ===================================================
   * 8 — INTENTION DU DOCUMENT
   * ===================================================
   *
   * Exemples :
   *
   * proof
   * request
   * decision
   * payment
   * refund
   * meeting
   * declaration
   * contract
   * notification
   * information
   */

  brain.intent =
    buildDocumentIntent({
      text:
        source,

      brain,

      detection
    });

  /*
   * ===================================================
   * 9 — OBJECTIF
   * ===================================================
   */

  brain.purpose =
    determinePurpose({
      brain,
      detection
    });

  /*
   * ===================================================
   * 10 — FAITS IMPORTANTS
   * ===================================================
   */

  brain.importantFacts =
    buildImportantFacts({
      brain,
      detection
    });

  /*
   * ===================================================
   * 11 — CONTRADICTIONS
   * ===================================================
   */

  brain.contradictions =
    detectContradictions(
      brain
    );

  /*
   * ===================================================
   * 12 — RÉSUMÉ BRAIN
   * ===================================================
   */

  brain.summary =
    buildInitialSummary({
      brain,
      detection
    });

  /*
   * ===================================================
   * 13 — SCORES
   * ===================================================
   */

  const extractionScore =
    calculateExtractionScore({
      extraction,
      brain
    });

  const reasoningScore =
    calculateReasoningScore(
      brain
    );

  brain.score = {
    extraction:
      extractionScore,

    reasoning:
      reasoningScore,

    verification:
      0,

    global:
      Math.round(
        (
          extractionScore +
          reasoningScore
        ) / 2
      )
  };

  /*
   * ===================================================
   * 14 — META
   * ===================================================
   */

  brain.meta = {
    ...(brain.meta || {}),

    reasonerVersion:
      "2.3",

    textLength:
      source.length,

    eventCount:
      brain.events.length,

    amountCount:
      brain.amounts.length,

    dateCount:
      brain.dates.length,

    actionCount:
      brain.actions.length,

    contradictionCount:
      brain.contradictions.length,

    situationType:
      brain?.situation?.type ||
      null,

    intentType:
      brain?.intent?.type ||
      null,

    intentConfidence:
      brain?.intent?.confidence ??
      null
  };

  return brain;
}

/**
 * =====================================================
 * IDENTITÉ DOCUMENT
 * =====================================================
 */

function buildDocumentIdentity({
  detection
}) {
  const family =
    detection?.family ||
    null;

  const type =
    detection?.documentType ||
    null;

  let confidence =
    Number(
      detection?.confidence || 0
    );

  if (
    family &&
    type
  ) {
    confidence += 5;
  }

  /*
   * "Document" seul n'est pas un vrai type.
   */
  if (
    /^document$/i.test(
      String(type || "").trim()
    )
  ) {
    confidence =
      Math.min(
        confidence,
        40
      );
  }

  return {
    family,

    type,

    confidence:
      clamp(
        confidence,
        0,
        100
      ),

    sourceHints:
      detection?.signals || []
  };
}

/**
 * =====================================================
 * MONTANTS
 * =====================================================
 */

function buildBrainAmounts(
  amounts
) {
  const result = [];

  for (
    const amount
    of Array.isArray(amounts)
      ? amounts
      : []
  ) {
    const evidence =
      buildAmountEvidence(
        amount
      );

    const created =
      createAmount({
        value:
          amount?.value ||
          null,

        numeric:
          Number.isFinite(
            Number(amount?.numeric)
          )
            ? Number(amount.numeric)
            : null,

        role:
          amount?.role ||
          "unknown",

        confidence:
          Number(
            amount?.confidence || 0
          ),

        verified:
          false,

        evidence
      });

    created.important =
      Boolean(
        amount?.important
      );

    created.hints =
      Array.isArray(
        amount?.hints
      )
        ? [...amount.hints]
        : [];

    created.index =
      Number.isFinite(
        Number(amount?.index)
      )
        ? Number(amount.index)
        : null;

    created.context =
      cleanText(
        amount?.context
      );

    created.line =
      cleanText(
        amount?.line
      );

    created.before =
      cleanText(
        amount?.before
      );

    created.after =
      cleanText(
        amount?.after
      );

    result.push(
      created
    );
  }

  return result;
}

function buildAmountEvidence(
  amount
) {
  const quote =
    chooseBestEvidenceQuote([
      amount?.line,

      amount?.context,

      buildLocalQuote(
        amount?.before,
        amount?.value,
        amount?.after
      )
    ]);

  if (!quote) {
    return null;
  }

  return createEvidence({
    quote,

    explanation:
      amount?.role
        ? `Montant détecté avec le rôle ${amount.role}`
        : "Montant détecté dans le document",

    start:
      Number.isFinite(
        Number(amount?.index)
      )
        ? Number(amount.index)
        : null,

    confidence:
      Number(
        amount?.confidence || 0
      )
  });
}

/**
 * =====================================================
 * DATES
 * =====================================================
 */

function buildBrainDates(
  dates
) {
  const result = [];

  for (
    const date
    of Array.isArray(dates)
      ? dates
      : []
  ) {
    const evidence =
      buildDateEvidence(
        date
      );

    const created =
      createDate({
        value:
          date?.raw ||
          null,

        role:
          date?.role ||
          date?.hint ||
          "unknown",

        confidence:
          Number(
            date?.confidence || 0
          ),

        verified:
          false,

        evidence
      });

    created.important =
      Boolean(
        date?.important
      );

    created.hint =
      date?.hint ||
      null;

    created.context =
      cleanText(
        date?.context
      );

    created.index =
      Number.isFinite(
        Number(date?.index)
      )
        ? Number(date.index)
        : null;

    result.push(
      created
    );
  }

  return result;
}

function buildDateEvidence(
  date
) {
  const quote =
    chooseBestEvidenceQuote([
      date?.context,
      date?.raw
    ]);

  if (!quote) {
    return null;
  }

  return createEvidence({
    quote,

    explanation:
      date?.role
        ? `Date détectée avec le rôle ${date.role}`
        : "Date détectée dans le document",

    start:
      Number.isFinite(
        Number(date?.index)
      )
        ? Number(date.index)
        : null,

    confidence:
      Number(
        date?.confidence || 0
      )
  });
}

/**
 * =====================================================
 * ACTIONS
 * =====================================================
 */

function buildBrainActions(
  actionPhrases
) {
  const result = [];

  const seen =
    new Set();

  for (
    const item
    of Array.isArray(actionPhrases)
      ? actionPhrases
      : []
  ) {
    const phrase =
      cleanText(
        item?.phrase
      );

    if (!phrase) {
      continue;
    }

    const key =
      normalizeText(
        phrase
      );

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    const action =
      createAction({
        action:
          truncate(
            phrase,
            180
          ),

        how:
          null,

        reason:
          null,

        confidence:
          Number(
            item?.confidence || 0
          ),

        verified:
          false
      });

    action.kind =
      item?.kind ||
      null;

    result.push(
      action
    );
  }

  return result.slice(
    0,
    10
  );
}

/**
 * =====================================================
 * OBJECTIF DU DOCUMENT
 * =====================================================
 */

function determinePurpose({
  brain,
  detection
}) {
  /*
   * L'intention devient prioritaire.
   */

  const intent =
    brain?.intent?.type ||
    null;

  if (
    intent === "proof"
  ) {
    return (
      "Certifier ou justifier une situation."
    );
  }

  if (
    intent === "decision"
  ) {
    return (
      "Informer le destinataire d’une décision."
    );
  }

  if (
    intent === "contract"
  ) {
    return (
      "Définir ou confirmer une relation contractuelle."
    );
  }

  if (
    intent === "declaration"
  ) {
    return (
      "Permettre ou présenter une déclaration."
    );
  }

  if (
    intent === "notification"
  ) {
    return (
      "Notifier une information au destinataire."
    );
  }

  /*
   * Sinon on utilise la situation événementielle.
   */

  const situation =
    brain?.situation?.type;

  if (
    situation ===
    EVENT_TYPES.REFUND
  ) {
    return (
      "Informer d’un remboursement ou d’un avoir."
    );
  }

  if (
    situation ===
    EVENT_TYPES.AUTOMATIC_DEBIT
  ) {
    return (
      "Informer d’un prélèvement automatique."
    );
  }

  if (
    situation ===
    EVENT_TYPES.PAYMENT_DUE
  ) {
    return (
      "Demander ou informer d’un paiement à effectuer."
    );
  }

  if (
    situation ===
    EVENT_TYPES.MEETING
  ) {
    return (
      "Informer d’une réunion ou convoquer le destinataire."
    );
  }

  if (
    situation ===
    EVENT_TYPES.TAX_DECLARATION
  ) {
    return (
      "Présenter ou permettre une déclaration fiscale."
    );
  }

  if (
    situation ===
    EVENT_TYPES.REQUEST
  ) {
    return (
      "Demander au destinataire d’effectuer une action."
    );
  }

  if (
    situation ===
    EVENT_TYPES.INFORMATION
  ) {
    return (
      "Informer le destinataire."
    );
  }

  if (
    detection?.family
  ) {
    return (
      `Document appartenant à la famille ${detection.family}.`
    );
  }

  return null;
}

/**
 * =====================================================
 * FAITS IMPORTANTS
 * =====================================================
 */

function buildImportantFacts({
  brain,
  detection
}) {
  const facts = [];

  if (
    detection?.documentType
  ) {
    facts.push(
      createImportantFact({
        kind:
          "documentType",

        label:
          "Type de document",

        value:
          detection.documentType,

        confidence:
          detection.confidence || 0,

        verified:
          false
      })
    );
  }

  /*
   * Intention documentaire.
   */

  if (
    brain?.intent?.type &&
    brain.intent.type !== "unknown" &&
    brain.intent.type !== "information"
  ) {
    facts.push(
      createImportantFact({
        kind:
          "intent",

        label:
          "Fonction du document",

        value:
          brain.intent.label ||
          brain.intent.type,

        confidence:
          brain.intent.confidence ||
          0,

        verified:
          Number(
            brain.intent.confidence || 0
          ) >= 75
      })
    );
  }

  /*
   * Montant principal potentiel.
   */

  const amount =
    pickBestUserAmount(
      brain.amounts
    );

  if (amount) {
    facts.push(
      createImportantFact({
        kind:
          "amount",

        label:
          amountLabel(
            amount.role
          ),

        value:
          amount.value,

        confidence:
          amount.confidence,

        verified:
          Boolean(
            amount.verified
          )
      })
    );
  }

  /*
   * Date principale potentielle.
   */

  const date =
    pickBestUserDate(
      brain.dates
    );

  if (date) {
    facts.push(
      createImportantFact({
        kind:
          "date",

        label:
          dateLabel(
            date.role
          ),

        value:
          date.value,

        confidence:
          date.confidence,

        verified:
          Boolean(
            date.verified
          )
      })
    );
  }

  /*
   * Émetteur.
   */

  if (
    brain.issuer
  ) {
    facts.push(
      createImportantFact({
        kind:
          "issuer",

        label:
          "Émetteur",

        value:
          brain.issuer,

        confidence:
          brain.issuerVerified
            ? 90
            : 60,

        verified:
          Boolean(
            brain.issuerVerified
          )
      })
    );
  }

  return facts.slice(
    0,
    5
  );
}

/**
 * =====================================================
 * CONTRADICTIONS
 * =====================================================
 */

function detectContradictions(
  brain
) {
  const contradictions = [];

  const eventTypes =
    new Set(
      (brain.events || [])
        .map(
          (event) =>
            event?.type
        )
        .filter(Boolean)
    );

  /*
   * Remboursement + paiement.
   */

  if (
    eventTypes.has(
      EVENT_TYPES.REFUND
    ) &&
    eventTypes.has(
      EVENT_TYPES.PAYMENT_DUE
    )
  ) {
    contradictions.push({
      type:
        "payment_vs_refund",

      severity:
        "medium",

      message:
        "Le document contient à la fois des signaux de paiement et de remboursement."
    });
  }

  /*
   * Prélèvement + paiement manuel.
   */

  if (
    eventTypes.has(
      EVENT_TYPES.AUTOMATIC_DEBIT
    ) &&
    eventTypes.has(
      EVENT_TYPES.PAYMENT_DUE
    )
  ) {
    contradictions.push({
      type:
        "automatic_debit_vs_manual_payment",

      severity:
        "medium",

      message:
        "Le document contient à la fois un prélèvement automatique et un paiement manuel potentiel."
    });
  }

  return contradictions;
}

/**
 * =====================================================
 * RÉSUMÉ BRAIN
 * =====================================================
 */

function buildInitialSummary({
  brain,
  detection
}) {
  const type =
    detection?.documentType ||
    brain?.document?.type;

  /*
   * ===================================================
   * INTENTION DE PREUVE
   * ===================================================
   */

  if (
    brain?.intent?.type ===
    "proof"
  ) {
    if (type) {
      return (
        `${type} : ce document sert à certifier ou justifier une situation.`
      );
    }

    return (
      "Ce document sert à certifier ou justifier une situation."
    );
  }

  /*
   * ===================================================
   * CONTRAT
   * ===================================================
   */

  if (
    brain?.intent?.type ===
    "contract"
  ) {
    if (type) {
      return (
        `${type} : ce document définit ou confirme une relation contractuelle.`
      );
    }

    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * DÉCISION
   * ===================================================
   */

  if (
    brain?.intent?.type ===
    "decision"
  ) {
    return (
      "Ce document communique une décision."
    );
  }

  /*
   * ===================================================
   * SITUATION ÉVÉNEMENTIELLE
   * ===================================================
   */

  const situation =
    brain?.situation?.type;

  const event =
    brain?.situation?.event ||
    null;

  if (
    situation ===
    EVENT_TYPES.REFUND
  ) {
    const amount =
      event?.amount?.value;

    const date =
      event?.date?.value;

    if (
      amount &&
      date
    ) {
      return (
        `Remboursement détecté : ${amount}, prévu le ${date}.`
      );
    }

    if (amount) {
      return (
        `Remboursement détecté : ${amount}.`
      );
    }

    return (
      "Un remboursement semble être annoncé."
    );
  }

  if (
    situation ===
    EVENT_TYPES.AUTOMATIC_DEBIT
  ) {
    const amount =
      event?.amount?.value;

    const date =
      event?.date?.value;

    if (
      amount &&
      date
    ) {
      return (
        `Prélèvement automatique détecté : ${amount}, prévu le ${date}.`
      );
    }

    if (amount) {
      return (
        `Prélèvement automatique détecté : ${amount}.`
      );
    }

    return (
      "Un prélèvement automatique semble être prévu."
    );
  }

  if (
    situation ===
    EVENT_TYPES.PAYMENT_DUE
  ) {
    const amount =
      event?.amount?.value;

    if (amount) {
      return (
        `Paiement à effectuer détecté : ${amount}.`
      );
    }

    return (
      "Un paiement semble être demandé."
    );
  }

  if (
    situation ===
    EVENT_TYPES.MEETING
  ) {
    const date =
      event?.date?.value;

    if (date) {
      return (
        `Réunion ou assemblée détectée le ${date}.`
      );
    }

    return (
      "Une réunion ou assemblée semble être prévue."
    );
  }

  /*
   * ===================================================
   * FALLBACK TYPE
   * ===================================================
   */

  if (type) {
    return (
      `Document identifié : ${type}.`
    );
  }

  return (
    "Document analysé, type encore incertain."
  );
}

/**
 * =====================================================
 * ÉMETTEUR
 * =====================================================
 */

function pickIssuer({
  extraction,
  text
}) {
  const organizations =
    Array.isArray(
      extraction?.entities
        ?.organizations
    )
      ? extraction.entities.organizations
      : [];

  if (!organizations.length) {
    return null;
  }

  const source =
    normalizeText(
      text
    );

  const header =
    source.slice(
      0,
      1600
    );

  const candidates =
    organizations
      .map(
        (organization) => {
          const value =
            cleanText(
              organization
            );

          if (
            !value ||
            value.length < 3
          ) {
            return null;
          }

          if (
            /^(sa|sas|sarl|eurl|sci|sasu|snc)$/i.test(
              value
            )
          ) {
            return null;
          }

          const normalized =
            normalizeText(
              value
            );

          let score = 0;

          if (
            header.includes(
              normalized
            )
          ) {
            score += 70;
          }

          const firstIndex =
            source.indexOf(
              normalized
            );

          if (
            firstIndex >= 0 &&
            firstIndex < 300
          ) {
            score += 50;
          }

          const occurrences =
            countOccurrences(
              source,
              normalized
            );

          if (
            occurrences >= 2
          ) {
            score += 20;
          }

          if (
            occurrences >= 4
          ) {
            score += 15;
          }

          return {
            value,
            score
          };
        }
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    candidates[0]?.value ||
    organizations[0] ||
    null
  );
}

/**
 * =====================================================
 * DESTINATAIRE
 * =====================================================
 */

function pickRecipient({
  extraction
}) {
  const people =
    Array.isArray(
      extraction?.entities
        ?.people
    )
      ? extraction.entities.people
      : [];

  if (!people.length) {
    return null;
  }

  return (
    cleanText(
      people[0]
    ) ||
    null
  );
}

/**
 * =====================================================
 * SÉLECTION
 * =====================================================
 */

function pickBestUserAmount(
  amounts
) {
  return (
    (amounts || [])
      .filter(
        (amount) =>
          isUserFacingAmountRole(
            amount.role
          )
      )
      .sort(
        compareConfidence
      )[0] ||
    null
  );
}

function pickBestUserDate(
  dates
) {
  return (
    (dates || [])
      .filter(
        (date) =>
          isUserFacingDateRole(
            date.role
          )
      )
      .sort(
        compareConfidence
      )[0] ||
    null
  );
}

function compareConfidence(
  a,
  b
) {
  return (
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
 * RÔLES MONTANTS
 * =====================================================
 */

function isRefundRole(
  role
) {
  const value =
    normalizeText(role);

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
    normalizeText(role);

  return (
    value.includes(
      "automaticdebit"
    ) ||
    value.includes(
      "automatic_debit"
    ) ||
    value ===
      "debit"
  );
}

function isDueRole(
  role
) {
  const value =
    normalizeText(role);

  return (
    value.includes(
      "amountdue"
    ) ||
    value.includes(
      "payment_due"
    ) ||
    value ===
      "due"
  );
}

function isUserFacingAmountRole(
  role
) {
  const value =
    normalizeText(role);

  return (
    isRefundRole(value) ||
    isDebitRole(value) ||
    isDueRole(value) ||
    value.includes(
      "paid"
    ) ||
    value.includes(
      "penalty"
    )
  );
}

/**
 * =====================================================
 * RÔLES DATES
 * =====================================================
 */

function isUserFacingDateRole(
  role
) {
  const value =
    normalizeText(role);

  return (
    value.includes(
      "meeting"
    ) ||
    value.includes(
      "deadline"
    ) ||
    value.includes(
      "refund"
    ) ||
    value.includes(
      "debit"
    ) ||
    value.includes(
      "payment"
    ) ||
    value.includes(
      "coveredperiod"
    )
  );
}

/**
 * =====================================================
 * LABELS
 * =====================================================
 */

function amountLabel(
  role
) {
  if (
    isRefundRole(role)
  ) {
    return (
      "Montant remboursé"
    );
  }

  if (
    isDebitRole(role)
  ) {
    return (
      "Montant prélevé"
    );
  }

  if (
    isDueRole(role)
  ) {
    return (
      "Montant à payer"
    );
  }

  return "Montant";
}

function dateLabel(
  role
) {
  const value =
    normalizeText(role);

  if (
    value.includes(
      "meeting"
    )
  ) {
    return (
      "Date du rendez-vous"
    );
  }

  if (
    value.includes(
      "deadline"
    )
  ) {
    return (
      "Date limite"
    );
  }

  if (
    value.includes(
      "refund"
    )
  ) {
    return (
      "Date du remboursement"
    );
  }

  if (
    value.includes(
      "debit"
    )
  ) {
    return (
      "Date du prélèvement"
    );
  }

  if (
    value.includes(
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
 * SCORES
 * =====================================================
 */

function calculateExtractionScore({
  extraction,
  brain
}) {
  let score = 0;

  if (
    brain.document.type
  ) {
    score += 20;
  }

  if (
    brain.document.family
  ) {
    score += 10;
  }

  if (
    brain.issuer
  ) {
    score += 10;
  }

  if (
    (extraction?.dates || [])
      .length
  ) {
    score += 15;
  }

  if (
    (extraction?.amounts || [])
      .length
  ) {
    score += 15;
  }

  if (
    brain.events.length
  ) {
    score += 20;
  }

  if (
    brain.actions.length
  ) {
    score += 10;
  }

  return clamp(
    score,
    0,
    100
  );
}

function calculateReasoningScore(
  brain
) {
  let score = 30;

  if (
    brain.situation
  ) {
    score += 15;
  }

  if (
    brain.intent &&
    brain.intent.type !==
      "unknown"
  ) {
    score += 20;
  }

  if (
    brain.events.length
  ) {
    score += 15;
  }

  if (
    brain.importantFacts.length
  ) {
    score += 10;
  }

  if (
    brain.purpose
  ) {
    score += 10;
  }

  score -=
    brain.contradictions.length *
    10;

  return clamp(
    score,
    0,
    100
  );
}

/**
 * =====================================================
 * PREUVES
 * =====================================================
 */

function buildLocalQuote(
  before,
  value,
  after
) {
  const left =
    cleanText(
      before
    )
      .slice(-90);

  const middle =
    cleanText(
      value
    );

  const right =
    cleanText(
      after
    )
      .slice(0, 90);

  return cleanText(
    `${left} ${middle} ${right}`
  );
}

function chooseBestEvidenceQuote(
  candidates
) {
  const cleaned =
    candidates
      .map(
        cleanText
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          evidenceLengthScore(b) -
          evidenceLengthScore(a)
      );

  if (!cleaned.length) {
    return null;
  }

  return truncate(
    cleaned[0],
    260
  );
}

function evidenceLengthScore(
  text
) {
  const length =
    String(text || "")
      .length;

  if (
    length >= 25 &&
    length <= 180
  ) {
    return 100;
  }

  if (
    length > 180 &&
    length <= 300
  ) {
    return 70;
  }

  return 40;
}

/**
 * =====================================================
 * OUTILS TEXTE
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

function truncate(
  value,
  max
) {
  const text =
    cleanText(
      value
    );

  if (
    text.length <= max
  ) {
    return text;
  }

  return (
    `${text.slice(
      0,
      Math.max(
        0,
        max - 1
      )
    )}…`
  );
}

function countOccurrences(
  source,
  needle
) {
  if (
    !source ||
    !needle
  ) {
    return 0;
  }

  let count = 0;
  let position = 0;

  while (
    (
      position =
        source.indexOf(
          needle,
          position
        )
    ) >= 0
  ) {
    count += 1;

    position +=
      Math.max(
        needle.length,
        1
      );
  }

  return count;
}

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(
      value
    );

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
