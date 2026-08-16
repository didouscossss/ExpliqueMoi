/**
 * Didou Brain — Document Reasoner V2.1
 *
 * Objectif :
 *
 * Transformer les extractions techniques de Didou
 * en une représentation documentaire générique
 * exploitable par :
 *
 * - eventBuilder
 * - factVerifier
 * - fusion
 * - futur modèle IA local
 * - mémoire / apprentissage
 *
 * IMPORTANT :
 *
 * Ce fichier ne remplace PAS les adaptateurs métier.
 * Il constitue une seconde lecture générique du document.
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
   * 1 — IDENTIFICATION DU DOCUMENT
   * ===================================================
   */

  brain.document =
    buildDocumentIdentity({
      detection,
      text: source
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
      extraction,
      text: source
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
   *
   * NOUVEAU :
   *
   * Les événements sont maintenant construits
   * par eventBuilder.js.
   */

  brain.events =
    buildEvents(
      brain
    );

  /*
   * ===================================================
   * 7 — SITUATION PRINCIPALE
   * ===================================================
   */

  brain.situation =
    determineSituation(
      brain.events
    );

  /*
   * ===================================================
   * 8 — OBJECTIF DU DOCUMENT
   * ===================================================
   */

  brain.purpose =
    determinePurpose({
      brain,
      detection
    });

  /*
   * ===================================================
   * 9 — FAITS IMPORTANTS
   * ===================================================
   */

  brain.importantFacts =
    buildImportantFacts({
      brain,
      detection
    });

  /*
   * ===================================================
   * 10 — CONTRADICTIONS INTERNES
   * ===================================================
   */

  brain.contradictions =
    detectContradictions(
      brain
    );

  /*
   * ===================================================
   * 11 — RÉSUMÉ TECHNIQUE INITIAL
   * ===================================================
   *
   * Ce résumé n'est pas encore le résumé utilisateur
   * définitif.
   */

  brain.summary =
    buildInitialSummary({
      brain,
      detection
    });

  /*
   * ===================================================
   * 12 — SCORES
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
   * 13 — MÉTADONNÉES
   * ===================================================
   */

  brain.meta = {
    ...(brain.meta || {}),

    reasonerVersion:
      "2.1",

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
      brain.contradictions.length
  };

  return brain;
}

/**
 * =====================================================
 * IDENTITÉ DOCUMENTAIRE
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

  /*
   * Bonus léger lorsque famille + type existent.
   */
  if (
    family &&
    type
  ) {
    confidence += 5;
  }

  /*
   * Un type générique ne mérite pas
   * une forte confiance.
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

    /*
     * Informations techniques utiles au verifier
     * et au futur moteur IA.
     */

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
 * SITUATION
 * =====================================================
 */

function determineSituation(
  events
) {
  if (
    !Array.isArray(events) ||
    !events.length
  ) {
    return null;
  }

  /*
   * Ordre volontaire.
   *
   * Une situation utilisateur explicite
   * doit passer devant les événements
   * purement informatifs.
   */

  const priority = [
    EVENT_TYPES.REFUND,
    EVENT_TYPES.AUTOMATIC_DEBIT,
    EVENT_TYPES.PAYMENT_DUE,
    EVENT_TYPES.MEETING,
    EVENT_TYPES.TAX_DECLARATION,
    EVENT_TYPES.REQUEST,
    EVENT_TYPES.INFORMATION
  ];

  for (
    const type
    of priority
  ) {
    const event =
      events.find(
        (item) =>
          item?.type === type
      );

    if (event) {
      return {
        type:
          event.type,

        label:
          event.label ||
          situationLabel(
            event.type
          ),

        confidence:
          Number(
            event.confidence || 0
          )
      };
    }
  }

  /*
   * Si eventBuilder produit plus tard
   * un nouveau type encore inconnu ici,
   * on conserve tout de même le premier événement.
   */

  const first =
    events[0];

  return {
    type:
      first?.type ||
      "unknown",

    label:
      first?.label ||
      situationLabel(
        first?.type
      ),

    confidence:
      Number(
        first?.confidence || 0
      )
  };
}

/**
 * =====================================================
 * OBJECTIF
 * =====================================================
 */

function determinePurpose({
  brain,
  detection
}) {
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
   * Meilleur montant utilisateur.
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
   * Meilleure date utilisateur.
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
   * Paiement + remboursement simultanés.
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
   * Prélèvement automatique + paiement manuel.
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
        "Le document semble contenir à la fois un prélèvement automatique et un paiement manuel."
    });
  }

  /*
   * Plusieurs montants principaux concurrents.
   */

  const strongUserAmounts =
    brain.amounts.filter(
      (amount) =>
        isUserFacingAmountRole(
          amount.role
        ) &&
        Number(
          amount.confidence || 0
        ) >= 80
    );

  if (
    strongUserAmounts.length >= 3
  ) {
    contradictions.push({
      type:
        "multiple_main_amounts",

      severity:
        "low",

      message:
        "Plusieurs montants importants sont candidats ; leur rôle doit être vérifié."
    });
  }

  return contradictions;
}

/**
 * =====================================================
 * RÉSUMÉ INITIAL
 * =====================================================
 */

function buildInitialSummary({
  brain,
  detection
}) {
  const type =
    detection?.documentType ||
    brain?.document?.type;

  const situation =
    brain?.situation?.type;

  if (
    situation ===
    EVENT_TYPES.REFUND
  ) {
    const event =
      brain.events.find(
        (item) =>
          item?.type ===
          EVENT_TYPES.REFUND
      );

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
    const event =
      brain.events.find(
        (item) =>
          item?.type ===
          EVENT_TYPES.AUTOMATIC_DEBIT
      );

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
    const event =
      brain.events.find(
        (item) =>
          item?.type ===
          EVENT_TYPES.PAYMENT_DUE
      );

    const amount =
      event?.amount?.value;

    const date =
      event?.date?.value;

    if (
      amount &&
      date
    ) {
      return (
        `Paiement à effectuer détecté : ${amount}, avec une date associée au ${date}.`
      );
    }

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
    const event =
      brain.events.find(
        (item) =>
          item?.type ===
          EVENT_TYPES.MEETING
      );

    if (
      event?.date?.value
    ) {
      return (
        `Réunion ou assemblée détectée le ${event.date.value}.`
      );
    }

    return (
      "Une réunion ou assemblée semble être prévue."
    );
  }

  if (
    type
  ) {
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

          const normalized =
            normalizeText(
              value
            );

          if (
            /^(sa|sas|sarl|eurl|sci|sasu|snc)$/i.test(
              value
            )
          ) {
            return null;
          }

          let score = 0;

          /*
           * Présence dans l'en-tête.
           */

          if (
            header.includes(
              normalized
            )
          ) {
            score += 70;
          }

          /*
           * Très proche du début du document.
           */

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

          /*
           * Répétition.
           */

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
 * SÉLECTION DES FAITS
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
 * ROLES MONTANTS
 * =====================================================
 */

function isRefundRole(
  role
) {
  const text =
    normalizeText(role);

  return (
    text.includes(
      "refund"
    ) ||
    text.includes(
      "rembours"
    )
  );
}

function isDebitRole(
  role
) {
  const text =
    normalizeText(role);

  return (
    text.includes(
      "automaticdebit"
    ) ||
    text.includes(
      "automatic_debit"
    ) ||
    text === "debit"
  );
}

function isDueRole(
  role
) {
  const text =
    normalizeText(role);

  return (
    text.includes(
      "amountdue"
    ) ||
    text === "due" ||
    text.includes(
      "payment_due"
    )
  );
}

function isUserFacingAmountRole(
  role
) {
  const text =
    normalizeText(role);

  return (
    isRefundRole(text) ||
    isDebitRole(text) ||
    isDueRole(text) ||
    text.includes(
      "paid"
    ) ||
    text.includes(
      "penalty"
    )
  );
}

/**
 * =====================================================
 * ROLES DATES
 * =====================================================
 */

function isUserFacingDateRole(
  role
) {
  const text =
    normalizeText(role);

  return (
    text.includes(
      "meeting"
    ) ||
    text.includes(
      "deadline"
    ) ||
    text.includes(
      "refund"
    ) ||
    text.includes(
      "debit"
    ) ||
    text.includes(
      "payment"
    ) ||
    text.includes(
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
  const text =
    normalizeText(role);

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

function situationLabel(
  type
) {
  switch (type) {
    case EVENT_TYPES.REFUND:
      return "Remboursement";

    case EVENT_TYPES.AUTOMATIC_DEBIT:
      return "Prélèvement automatique";

    case EVENT_TYPES.PAYMENT_DUE:
      return "Paiement à effectuer";

    case EVENT_TYPES.MEETING:
      return "Réunion / assemblée";

    case EVENT_TYPES.TAX_DECLARATION:
      return "Déclaration fiscale";

    case EVENT_TYPES.REQUEST:
      return "Action demandée";

    default:
      return "Information";
  }
}

/**
 * =====================================================
 * SCORE EXTRACTION
 * =====================================================
 */

function calculateExtractionScore({
  extraction,
  brain
}) {
  let score =
    0;

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
  let score =
    30;

  if (
    brain.situation
  ) {
    score += 20;
  }

  if (
    brain.events.length
  ) {
    score += 20;
  }

  if (
    brain.importantFacts.length
  ) {
    score += 15;
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
 * OUTILS PREUVES
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
 * TEXTE
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

  let count =
    0;

  let position =
    0;

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
  return Math.max(
    min,
    Math.min(
      max,
      Number(value) || 0
    )
  );
  brain.intent = buildDocumentIntent({
  text: source,
  brain,
  detection
});
}
