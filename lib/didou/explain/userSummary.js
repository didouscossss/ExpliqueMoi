/**
 * E — Adaptateur générique V2.
 *
 * Pour les documents non couverts par un adaptateur spécialisé.
 *
 * Objectifs :
 * - ne pas prétendre avoir compris si aucune information utile n'est trouvée ;
 * - produire une action seulement lorsqu'une demande explicite est détectée ;
 * - conserver seulement les faits réellement exploitables ;
 * - éviter les montants / dates sans rôle clair ;
 * - fournir une intention documentaire utilisable par le résumé.
 */

export function adaptGeneric(ctx) {
  const extraction =
    ctx?.extraction || {};

  const detection =
    ctx?.detection || {};

  const text =
    String(ctx?.text || "");

  const amounts =
    Array.isArray(extraction.amounts)
      ? extraction.amounts
      : [];

  const dates =
    Array.isArray(extraction.dates)
      ? extraction.dates
      : [];

  const periods =
    Array.isArray(extraction.periods)
      ? extraction.periods
      : [];

  const actionPhrases =
    Array.isArray(extraction.actionPhrases)
      ? extraction.actionPhrases
      : [];

  const entities =
    extraction.entities || {};

  /*
   * =====================================================
   * FAITS EXPLOITABLES
   * =====================================================
   */

  const mainAmount =
    pickUsefulAmount(
      amounts
    );

  const mainDate =
    pickUsefulDate(
      dates,
      periods
    );

  const issuer =
    pickUsefulOrganization(
      entities.organizations
    );

  const recipient =
    pickUsefulPerson(
      entities.people
    );

  /*
   * =====================================================
   * ACTIONS
   * =====================================================
   */

  const actions =
    buildUsefulActions(
      actionPhrases
    );

  /*
   * =====================================================
   * ÉCHÉANCES
   * =====================================================
   */

  const deadlines =
    dates
      .filter(
        (date) =>
          date.role === "deadline" &&
          date.important
      )
      .slice(
        0,
        2
      )
      .map(
        (date) => ({
          date:
            date.raw,

          label:
            "Date limite",

          meaning:
            cleanContext(
              date.context
            ) ||
            "Date limite indiquée dans le document",

          confidence:
            date.confidence ||
            75
        })
      );

  /*
   * =====================================================
   * FAITS IMPORTANTS
   * =====================================================
   */

  const importantFacts = [];

  if (
    mainAmount
  ) {
    importantFacts.push({
      kind:
        "amount",

      label:
        labelForAmount(
          mainAmount
        ),

      value:
        mainAmount.value,

      confidence:
        mainAmount.confidence ||
        60
    });
  }

  if (
    mainDate
  ) {
    importantFacts.push({
      kind:
        "date",

      label:
        labelForDate(
          mainDate
        ),

      value:
        mainDate.raw,

      confidence:
        mainDate.confidence ||
        60
    });
  }

  if (
    issuer
  ) {
    importantFacts.push({
      kind:
        "issuer",

      label:
        "Émetteur",

      value:
        issuer,

      confidence:
        65
    });
  }

  /*
   * =====================================================
   * NIVEAU RÉEL DE COMPRÉHENSION
   * =====================================================
   */

  const hasUsefulType =
    Boolean(
      detection.documentType &&
      !isGenericDocumentType(
        detection.documentType
      )
    );

  const usefulFactCount =
    [
      mainAmount,
      mainDate,
      issuer,
      actions.length
        ? true
        : null,
      deadlines.length
        ? true
        : null
    ].filter(Boolean).length;

  let understandingLevel =
    "extraction";

  /*
   * "strong" :
   * type identifiable + au moins un fait/action utile.
   */
  if (
    hasUsefulType &&
    usefulFactCount >= 2
  ) {
    understandingLevel =
      "strong";
  }

  /*
   * "probable" :
   * au moins quelque chose d'utile.
   */
  else if (
    hasUsefulType ||
    usefulFactCount >= 1
  ) {
    understandingLevel =
      "probable";
  }

  /*
   * Sinon :
   * Didou n'a réellement rien compris.
   */
  else {
    understandingLevel =
      "extraction";
  }

  /*
   * =====================================================
   * BUT DU DOCUMENT
   * =====================================================
   */

  const purpose =
    inferDocumentPurpose({
      text,
      detection,
      actions,
      deadlines,
      mainAmount,
      mainDate
    });

  /*
   * =====================================================
   * POURQUOI REÇU
   * =====================================================
   */

  const whyReceived =
    inferWhyReceived({
      detection,
      actions,
      deadlines,
      mainAmount,
      mainDate,
      purpose
    });

  /*
   * =====================================================
   * ATTENTION
   * =====================================================
   */

  let attentionLevel =
    "none";

  if (
    deadlines.length
  ) {
    attentionLevel =
      "soon";
  } else if (
    actions.length
  ) {
    attentionLevel =
      "soon";
  } else if (
    understandingLevel ===
      "extraction"
  ) {
    attentionLevel =
      "uncertain";
  }

  /*
   * =====================================================
   * INCERTITUDES
   * =====================================================
   */

  const uncertainties = [];

  if (
    understandingLevel ===
    "extraction"
  ) {
    uncertainties.push(
      "Didou n’a pas identifié suffisamment d’informations fiables pour expliquer ce document."
    );
  }

  if (
    amounts.length &&
    !mainAmount
  ) {
    uncertainties.push(
      "Des montants sont présents, mais leur rôle n’est pas suffisamment clair."
    );
  }

  if (
    dates.length &&
    !mainDate
  ) {
    uncertainties.push(
      "Des dates sont présentes, mais aucune ne peut être présentée comme importante avec assez de certitude."
    );
  }

  /*
   * =====================================================
   * PREUVES
   * =====================================================
   */

  const evidence = [];

  if (
    mainAmount
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        cleanContext(
          mainAmount.context
        ) ||
        mainAmount.value,

      explanation:
        "Montant identifié dans le document"
    });
  }

  if (
    mainDate
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        cleanContext(
          mainDate.context
        ) ||
        mainDate.raw,

      explanation:
        "Date importante identifiée dans le document"
    });
  }

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    family:
      detection.family ||
      "autre",

    documentType:
      sanitizeDocumentType(
        detection.documentType
      ),

    understandingLevel,

    confidence:
      calculateConfidence({
        detection,
        understandingLevel,
        usefulFactCount
      }),

    issuer,

    recipient,

    mainDate:
      mainDate
        ? {
            date:
              mainDate.raw,

            label:
              labelForDate(
                mainDate
              ),

            meaning:
              cleanContext(
                mainDate.context
              ),

            role:
              mainDate.role ||
              "unknown"
          }
        : null,

    mainAmount:
      mainAmount
        ? {
            value:
              mainAmount.value,

            label:
              labelForAmount(
                mainAmount
              ),

            meaning:
              cleanContext(
                mainAmount.context
              ),

            role:
              mainAmount.role ||
              "unknown"
          }
        : null,

    importantFacts:
      importantFacts.slice(
        0,
        4
      ),

    actions,

    deadlines,

    whyReceived,

    documentPurpose:
      purpose,

    attentionLevel,

    evidence,

    warnings:
      [],

    uncertainties
  };
}

/**
 * =====================================================
 * MONTANTS
 * =====================================================
 */

function pickUsefulAmount(
  amounts
) {
  const forbiddenRoles =
    new Set([
      "unknown",
      "example",
      "table_value",
      "companyLegalAmount",
      "legalInformationAmount",
      "invoiceLineAmount",
      "installmentAmount",
      "vat",
      "ht",
      "ttcAmount"
    ]);

  return (
    amounts.find(
      (amount) =>
        amount.important &&
        !forbiddenRoles.has(
          String(
            amount.role ||
            ""
          )
        )
    ) ||
    null
  );
}

function labelForAmount(
  amount
) {
  switch (
    amount?.role
  ) {
    case "amountDue":
      return "Montant à payer";

    case "paymentAmount":
      return "Montant payé";

    case "paidAmount":
      return "Montant déjà payé";

    case "refundAmount":
      return "Remboursement";

    case "penalty":
      return "Pénalité";

    case "deposit":
      return "Acompte";

    case "salary":
      return "Montant";

    default:
      return "Montant important";
  }
}

/**
 * =====================================================
 * DATES
 * =====================================================
 */

function pickUsefulDate(
  dates,
  periods
) {
  return (
    dates.find(
      (date) =>
        date.role ===
          "deadline" &&
        date.important
    ) ||

    dates.find(
      (date) =>
        [
          "meetingDate",
          "paymentDate",
          "refundDate",
          "debitDate"
        ].includes(
          date.role
        ) &&
        date.important
    ) ||

    periods.find(
      (period) =>
        period.important
    ) ||

    null
  );
}

function labelForDate(
  date
) {
  switch (
    date?.role
  ) {
    case "deadline":
      return "Date limite";

    case "meetingDate":
      return "Date du rendez-vous";

    case "paymentDate":
      return "Date du paiement";

    case "refundDate":
      return "Date du remboursement";

    case "debitDate":
      return "Date du prélèvement";

    case "coveredPeriod":
      return "Période concernée";

    default:
      return "Date importante";
  }
}

/**
 * =====================================================
 * ACTIONS
 * =====================================================
 */

function buildUsefulActions(
  phrases
) {
  const seen =
    new Set();

  const actions =
    [];

  for (
    const phrase
    of phrases
  ) {
    if (
      !phrase ||
      ![
        "request",
        "action"
      ].includes(
        phrase.kind
      )
    ) {
      continue;
    }

    const text =
      cleanActionPhrase(
        phrase.phrase
      );

    if (
      !text ||
      text.length < 8
    ) {
      continue;
    }

    const key =
      text.toLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    actions.push({
      action:
        text,

      how:
        "",

      confidence:
        phrase.confidence ||
        60
    });

    if (
      actions.length >=
      3
    ) {
      break;
    }
  }

  return actions;
}

/**
 * =====================================================
 * OBJECTIF DU DOCUMENT
 * =====================================================
 */

function inferDocumentPurpose({
  detection,
  actions,
  deadlines,
  mainAmount,
  mainDate
}) {
  const type =
    String(
      detection?.documentType ||
      ""
    ).toLowerCase();

  const family =
    String(
      detection?.family ||
      ""
    ).toLowerCase();

  if (
    actions.length
  ) {
    return (
      "Vous demander d’effectuer une démarche."
    );
  }

  if (
    deadlines.length
  ) {
    return (
      "Vous informer d’une démarche à effectuer avant une date limite."
    );
  }

  if (
    /convocation|rendez-vous|audience|reunion|réunion/.test(
      type
    ) ||
    mainDate?.role ===
      "meetingDate"
  ) {
    return (
      "Vous informer d’un rendez-vous ou d’une convocation."
    );
  }

  if (
    /notification|decision|décision/.test(
      type
    )
  ) {
    return (
      "Vous notifier une décision ou une information officielle."
    );
  }

  if (
    /attestation|certificat/.test(
      type
    )
  ) {
    return (
      "Attester officiellement d’une information."
    );
  }

  if (
    /contrat/.test(
      type
    ) ||
    family ===
      "contrat"
  ) {
    return (
      "Présenter les conditions d’un contrat."
    );
  }

  if (
    family ===
      "assurance"
  ) {
    return (
      "Vous informer au sujet de votre assurance."
    );
  }

  if (
    mainAmount
  ) {
    return (
      "Vous informer d’un montant lié à ce document."
    );
  }

  return null;
}

/**
 * =====================================================
 * POURQUOI REÇU
 * =====================================================
 */

function inferWhyReceived({
  actions,
  deadlines,
  mainAmount,
  mainDate,
  purpose
}) {
  if (
    actions.length
  ) {
    return (
      "Ce document vous demande d’effectuer une démarche."
    );
  }

  if (
    deadlines.length
  ) {
    return (
      "Ce document contient une date limite à respecter."
    );
  }

  if (
    mainDate?.role ===
      "meetingDate"
  ) {
    return (
      "Ce document vous informe d’un rendez-vous ou d’une convocation."
    );
  }

  if (
    mainAmount
  ) {
    return (
      "Ce document contient un montant important à connaître."
    );
  }

  return purpose ||
    null;
}

/**
 * =====================================================
 * ENTITÉS
 * =====================================================
 */

function pickUsefulOrganization(
  organizations
) {
  const list =
    Array.isArray(
      organizations
    )
      ? organizations
      : [];

  return (
    list.find(
      (value) => {
        const text =
          String(
            value ||
            ""
          ).trim();

        return (
          text.length >= 4 &&
          !/^(sa|sas|sarl|eurl|sci|sasu)$/i.test(
            text
          )
        );
      }
    ) ||
    null
  );
}

function pickUsefulPerson(
  people
) {
  const list =
    Array.isArray(
      people
    )
      ? people
      : [];

  return (
    list.find(
      (value) =>
        String(
          value ||
          ""
        ).trim()
          .length >= 4
    ) ||
    null
  );
}

/**
 * =====================================================
 * TYPE
 * =====================================================
 */

function sanitizeDocumentType(
  value
) {
  const type =
    String(
      value ||
      ""
    ).trim();

  if (
    !type ||
    isGenericDocumentType(
      type
    )
  ) {
    return null;
  }

  return type;
}

function isGenericDocumentType(
  value
) {
  const type =
    String(
      value ||
      ""
    )
      .toLowerCase()
      .trim();

  return [
    "",
    "document",
    "autre",
    "document autre",
    "document administratif"
  ].includes(
    type
  );
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateConfidence({
  detection,
  understandingLevel,
  usefulFactCount
}) {
  const base =
    Number(
      detection?.confidence
    ) ||
    0;

  if (
    understandingLevel ===
      "strong"
  ) {
    return Math.max(
      base,
      78
    );
  }

  if (
    understandingLevel ===
      "probable"
  ) {
    return Math.max(
      Math.min(
        base,
        75
      ),
      usefulFactCount
        ? 55
        : 45
    );
  }

  return Math.min(
    base ||
      35,
    45
  );
}

/**
 * =====================================================
 * NETTOYAGE
 * =====================================================
 */

function cleanContext(
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
    .trim()
    .slice(
      0,
      200
    );
}

function cleanActionPhrase(
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
    .replace(
      /^[•\-–—]+\s*/,
      ""
    )
    .trim()
    .slice(
      0,
      150
    );
}
