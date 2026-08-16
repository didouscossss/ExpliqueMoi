/**
 * F — Résumé utilisateur V3.
 *
 * Objectifs :
 * - une phrase courte et réellement utile ;
 * - exploiter Didou Brain après Fusion ;
 * - comprendre les documents sans montant/date/action ;
 * - prendre en charge attestations, justificatifs,
 *   décisions, contrats, notifications, etc. ;
 * - éviter "ce document est un document" ;
 * - ne jamais transformer une hypothèse faible
 *   en certitude.
 */

export function buildUserFacingExplanation(
  partial
) {
  const type =
    cleanType(
      partial?.documentType
    );

  const family =
    String(
      partial?.family || ""
    );

  const level =
    partial?.understandingLevel ||
    "extraction";

  /*
   * =====================================================
   * BRAIN
   * =====================================================
   */

  const brainIntent =
    partial?.brainFusion?.intent ||
    null;

  const brainSituation =
    partial?.brainFusion?.situation ||
    null;

  /*
   * =====================================================
   * DOCUMENT NON COMPRIS
   * =====================================================
   *
   * IMPORTANT :
   *
   * Une intention Brain forte constitue maintenant
   * une information utile.
   *
   * Exemple :
   * attestation sans montant/date/action.
   */

  if (
    level === "extraction" &&
    !hasStrongBrainUnderstanding({
      brainIntent,
      brainSituation
    })
  ) {
    return {
      document_label:
        "Document non compris",

      one_sentence:
        "Didou n’a pas trouvé suffisamment d’informations fiables pour expliquer ce document.",

      important_points:
        []
    };
  }

  if (
    !hasUsefulInformation(
      partial
    ) &&
    !hasStrongBrainUnderstanding({
      brainIntent,
      brainSituation
    })
  ) {
    return {
      document_label:
        "Document non compris",

      one_sentence:
        "Didou n’a pas trouvé suffisamment d’informations fiables pour expliquer ce document.",

      important_points:
        []
    };
  }

  /*
   * =====================================================
   * LABEL
   * =====================================================
   */

  const documentLabel =
    buildDocumentLabel({
      type,
      family,
      level,
      brainIntent
    });

  /*
   * =====================================================
   * PHRASE
   * =====================================================
   */

  const sentence =
    buildMainSentence({
      partial,
      type,
      family,
      level,
      brainIntent,
      brainSituation
    });

  /*
   * =====================================================
   * POINTS IMPORTANTS
   * =====================================================
   */

  const importantPoints =
    buildImportantPoints(
      partial,
      sentence
    );

  return {
    document_label:
      documentLabel,

    one_sentence:
      sentence,

    important_points:
      importantPoints
  };
}

/**
 * =====================================================
 * PHRASE PRINCIPALE
 * =====================================================
 */

function buildMainSentence({
  partial,
  type,
  family,
  level,
  brainIntent,
  brainSituation
}) {
  /*
   * ===================================================
   * 1 — SITUATIONS FINANCIÈRES
   * ===================================================
   *
   * Elles restent prioritaires :
   * remboursement, prélèvement, paiement...
   */

  const financialSentence =
    buildFinancialSentence({
      partial,
      brainSituation
    });

  if (
    financialSentence
  ) {
    return financialSentence;
  }

  /*
   * ===================================================
   * 2 — ATTESTATION / JUSTIFICATIF
   * ===================================================
   */

  if (
    brainIntent?.type === "proof" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    return buildProofSentence({
      partial,
      type,
      family,
      brainIntent
    });
  }

  /*
   * ===================================================
   * 3 — DÉCISION
   * ===================================================
   */

  if (
    brainIntent?.type === "decision" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    if (type) {
      return ensureSentence(
        `${capitalizeFirst(type)} vous informe d’une décision`
      );
    }

    return (
      "Ce document vous informe d’une décision."
    );
  }

  /*
   * ===================================================
   * 4 — CONTRAT
   * ===================================================
   */

  if (
    brainIntent?.type === "contract" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    if (type) {
      return ensureSentence(
        `${capitalizeFirst(type)} définit ou confirme une relation contractuelle`
      );
    }

    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * 5 — DÉCLARATION
   * ===================================================
   */

  if (
    brainIntent?.type === "declaration" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    const purpose =
      cleanSentence(
        partial?.documentPurpose
      );

    if (purpose) {
      return purpose;
    }

    return (
      "Ce document sert à déclarer ou présenter des informations."
    );
  }

  /*
   * ===================================================
   * 6 — RÉUNION
   * ===================================================
   */

  if (
    brainSituation?.type === "meeting"
  ) {
    if (
      partial?.mainDate?.date
    ) {
      return ensureSentence(
        `Une réunion est prévue le ${partial.mainDate.date}`
      );
    }

    return (
      "Ce document concerne une réunion ou une convocation."
    );
  }

  /*
   * ===================================================
   * 7 — WHY RECEIVED
   * ===================================================
   */

  const why =
    cleanSentence(
      partial?.whyReceived
    );

  if (
    why &&
    !isGenericExplanation(
      why
    )
  ) {
    return why;
  }

  /*
   * ===================================================
   * 8 — PURPOSE
   * ===================================================
   */

  const purpose =
    cleanSentence(
      partial?.documentPurpose
    );

  if (
    purpose &&
    !isGenericExplanation(
      purpose
    )
  ) {
    return purpose;
  }

  /*
   * ===================================================
   * 9 — ACTION
   * ===================================================
   */

  const action =
    firstAction(
      partial?.actions
    );

  if (action) {
    return ensureSentence(
      `Ce document vous demande de ${lowerFirst(action)}`
    );
  }

  /*
   * ===================================================
   * 10 — DATE
   * ===================================================
   */

  if (
    partial?.mainDate?.date
  ) {
    const label =
      String(
        partial.mainDate.label ||
        "Date importante"
      );

    return ensureSentence(
      `${label} : ${partial.mainDate.date}`
    );
  }

  /*
   * ===================================================
   * 11 — MONTANT
   * ===================================================
   */

  if (
    partial?.mainAmount?.value
  ) {
    const label =
      String(
        partial.mainAmount.label ||
        "Montant"
      );

    return ensureSentence(
      `${label} : ${partial.mainAmount.value}`
    );
  }

  /*
   * ===================================================
   * 12 — TYPE
   * ===================================================
   */

  if (type) {
    if (
      level === "strong"
    ) {
      return ensureSentence(
        `Didou a identifié ${articleForType(type)}${type}`
      );
    }

    return ensureSentence(
      `Ce document semble être ${articleForType(type)}${type}`
    );
  }

  /*
   * ===================================================
   * 13 — FAMILLE
   * ===================================================
   */

  if (
    family &&
    family !== "autre"
  ) {
    return ensureSentence(
      `Didou a identifié un document ${familyLabel(family)}`
    );
  }

  return (
    "Didou a lu le document mais n’a pas identifié suffisamment d’informations utiles."
  );
}

/**
 * =====================================================
 * ATTESTATION / JUSTIFICATIF
 * =====================================================
 */

function buildProofSentence({
  partial,
  type,
  family,
  brainIntent
}) {
  /*
   * Si on connaît précisément le type,
   * on l'utilise.
   */

  if (type) {
    /*
     * Assurance.
     *
     * On reste générique :
     * on ne prétend pas connaître une garantie
     * précise sans preuve.
     */

    if (
      family === "assurance" ||
      /assurance/i.test(
        type
      )
    ) {
      return ensureSentence(
        `Cette ${proofTypeLabel(type)} sert à justifier votre situation d’assurance`
      );
    }

    return ensureSentence(
      `${capitalizeFirst(articleForType(type).trim())} ${type} sert à certifier ou justifier une situation`
    );
  }

  /*
   * Famille assurance reconnue,
   * mais type exact encore incertain.
   */

  if (
    family === "assurance"
  ) {
    return (
      "Ce document sert à justifier une situation liée à votre assurance."
    );
  }

  /*
   * Intent fort mais type inconnu.
   */

  if (
    Number(
      brainIntent?.confidence || 0
    ) >= 85
  ) {
    return (
      "Ce document est une attestation ou un justificatif servant à certifier une situation."
    );
  }

  return (
    "Ce document semble servir d’attestation ou de justificatif."
  );
}

/**
 * =====================================================
 * SITUATIONS FINANCIÈRES
 * =====================================================
 */

function buildFinancialSentence({
  partial,
  brainSituation
}) {
  const type =
    brainSituation?.type ||
    null;

  /*
   * REMBOURSEMENT
   */

  if (
    type === "refund"
  ) {
    const amount =
      partial?.mainAmount?.value;

    const date =
      partial?.mainDate?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu le ${date}`
      );
    }

    if (amount) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu`
      );
    }

    return (
      "Ce document annonce un remboursement."
    );
  }

  /*
   * PRÉLÈVEMENT
   */

  if (
    type ===
    "automatic_debit"
  ) {
    const amount =
      partial?.mainAmount?.value;

    const date =
      partial?.mainDate?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu le ${date}`
      );
    }

    if (amount) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu`
      );
    }

    return (
      "Ce document annonce un prélèvement automatique."
    );
  }

  /*
   * PAIEMENT
   */

  if (
    type ===
    "payment_due"
  ) {
    const amount =
      partial?.mainAmount?.value;

    const date =
      partial?.mainDate?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Vous devez régler ${amount} avant ou à la date du ${date}`
      );
    }

    if (amount) {
      return ensureSentence(
        `Vous devez régler ${amount}`
      );
    }

    return (
      "Ce document indique qu’un paiement est à effectuer."
    );
  }

  return null;
}

/**
 * =====================================================
 * LABEL DOCUMENT
 * =====================================================
 */

function buildDocumentLabel({
  type,
  family,
  level,
  brainIntent
}) {
  /*
   * Type précis.
   */

  if (type) {
    if (
      level === "strong"
    ) {
      return type;
    }

    /*
     * Une intention proof très forte permet
     * d'éviter "Probablement" lorsqu'on possède
     * déjà un type cohérent.
     */

    if (
      brainIntent?.type ===
        "proof" &&
      Number(
        brainIntent?.confidence || 0
      ) >= 88
    ) {
      return type;
    }

    return (
      `Probablement : ${type}`
    );
  }

  /*
   * Proof sans type exact.
   */

  if (
    brainIntent?.type ===
      "proof" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 85
  ) {
    return (
      "Attestation / justificatif"
    );
  }

  /*
   * Famille.
   */

  if (
    family &&
    family !== "autre"
  ) {
    return (
      `Document ${familyLabel(family)}`
    );
  }

  return (
    "Document analysé"
  );
}

/**
 * =====================================================
 * POINTS IMPORTANTS
 * =====================================================
 */

function buildImportantPoints(
  partial,
  mainSentence
) {
  const normalizedSentence =
    normalize(
      mainSentence
    );

  const seen =
    new Set();

  const points =
    [];

  for (
    const fact
    of partial?.importantFacts || []
  ) {
    const label =
      String(
        fact?.label || ""
      )
        .trim();

    const value =
      String(
        fact?.value || ""
      )
        .trim();

    if (
      !label &&
      !value
    ) {
      continue;
    }

    /*
     * Ne pas répéter ce qui est déjà
     * dans la phrase principale.
     */

    if (
      value &&
      normalizedSentence.includes(
        normalize(value)
      )
    ) {
      continue;
    }

    /*
     * Le type du document est déjà visible
     * dans le titre.
     */

    if (
      fact?.kind ===
      "documentType"
    ) {
      continue;
    }

    /*
     * Ne pas afficher "Fonction du document :
     * Attestation / justificatif" si la phrase
     * l'explique déjà.
     */

    if (
      fact?.kind ===
        "intent" &&
      partial?.brainFusion?.intent
        ?.type === "proof"
    ) {
      continue;
    }

    const line =
      label &&
      value
        ? `${label} : ${value}`
        : value || label;

    const key =
      normalize(
        line
      );

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    points.push(line);

    if (
      points.length >= 3
    ) {
      break;
    }
  }

  return points;
}

/**
 * =====================================================
 * INFORMATION UTILE ?
 * =====================================================
 */

function hasUsefulInformation(
  partial
) {
  if (
    partial?.mainAmount?.value
  ) {
    return true;
  }

  if (
    partial?.mainDate?.date
  ) {
    return true;
  }

  if (
    Array.isArray(
      partial?.actions
    ) &&
    partial.actions.length
  ) {
    return true;
  }

  if (
    Array.isArray(
      partial?.deadlines
    ) &&
    partial.deadlines.length
  ) {
    return true;
  }

  if (
    partial?.issuer
  ) {
    return true;
  }

  if (
    cleanType(
      partial?.documentType
    )
  ) {
    return true;
  }

  if (
    partial?.documentPurpose
  ) {
    return true;
  }

  if (
    partial?.whyReceived
  ) {
    return true;
  }

  /*
   * NOUVEAU :
   * compréhension du Brain.
   */

  if (
    hasStrongBrainUnderstanding({
      brainIntent:
        partial?.brainFusion
          ?.intent,

      brainSituation:
        partial?.brainFusion
          ?.situation
    })
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * BRAIN SUFFISAMMENT FORT ?
 * =====================================================
 */

function hasStrongBrainUnderstanding({
  brainIntent,
  brainSituation
}) {
  if (
    brainIntent &&
    brainIntent.type !==
      "unknown" &&
    Number(
      brainIntent.confidence || 0
    ) >= 75
  ) {
    return true;
  }

  if (
    brainSituation &&
    brainSituation.type &&
    Number(
      brainSituation.confidence ||
      0
    ) >= 75
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * EXPLICATION TROP GÉNÉRIQUE ?
 * =====================================================
 */

function isGenericExplanation(
  value
) {
  const text =
    normalize(
      value
    );

  return (
    /document administratif/.test(
      text
    ) ||
    /document de type/.test(
      text
    ) ||
    /document appartenant a la famille/.test(
      text
    ) ||
    /presenter votre situation/.test(
      text
    ) ||
    /^ce document concerne/.test(
      text
    )
  );
}

/**
 * =====================================================
 * ACTION
 * =====================================================
 */

function firstAction(
  actions
) {
  const list =
    Array.isArray(actions)
      ? actions
      : [];

  const first =
    list[0];

  if (!first) {
    return null;
  }

  if (
    typeof first === "string"
  ) {
    return cleanSentence(
      first
    );
  }

  return cleanSentence(
    first.action
  );
}

/**
 * =====================================================
 * TYPE
 * =====================================================
 */

function cleanType(
  value
) {
  const type =
    String(
      value || ""
    )
      .trim();

  if (!type) {
    return null;
  }

  const normalized =
    normalize(
      type
    );

  if (
    [
      "document",
      "autre",
      "document autre",
      "document administratif",
      "document inconnu"
    ].includes(
      normalized
    )
  ) {
    return null;
  }

  return type;
}

/**
 * =====================================================
 * TYPE DE PREUVE
 * =====================================================
 */

function proofTypeLabel(
  type
) {
  const value =
    normalize(
      type
    );

  if (
    value.includes(
      "attestation"
    )
  ) {
    return (
      "attestation"
    );
  }

  if (
    value.includes(
      "certificat"
    )
  ) {
    return (
      "certificat"
    );
  }

  if (
    value.includes(
      "justificatif"
    )
  ) {
    return (
      "justificatif"
    );
  }

  return (
    "attestation"
  );
}

/**
 * =====================================================
 * FAMILLE
 * =====================================================
 */

function familyLabel(
  family
) {
  const map = {
    fiscal:
      "fiscal",

    administratif:
      "administratif",

    facture:
      "de facturation",

    bancaire:
      "bancaire",

    assurance:
      "d’assurance",

    logement:
      "de logement",

    copropriete:
      "de copropriété",

    emploi:
      "lié à l’emploi",

    social:
      "social",

    sante:
      "de santé",

    juridique:
      "juridique",

    courrier:
      "de correspondance",

    contrat:
      "contractuel",

    formulaire:
      "à compléter"
  };

  return (
    map[family] ||
    family
  );
}

/**
 * =====================================================
 * ARTICLE
 * =====================================================
 */

function articleForType(
  type
) {
  const value =
    String(
      type || ""
    )
      .toLowerCase();

  if (
    /facture|quittance|convocation|liasse|declaration|déclaration|attestation|notification|lettre|demande|mise en demeure|decision|décision/.test(
      value
    )
  ) {
    return "une ";
  }

  if (
    /^[aeiouéèêàâîôûh]/i.test(
      value
    )
  ) {
    return "une ";
  }

  return "un ";
}

/**
 * =====================================================
 * NETTOYAGE
 * =====================================================
 */

function cleanSentence(
  value
) {
  const text =
    String(
      value || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (
    !text ||
    text.length < 5
  ) {
    return null;
  }

  return ensureSentence(
    text
  );
}

function ensureSentence(
  value
) {
  const text =
    String(
      value || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!text) {
    return "";
  }

  if (
    /[.!?]$/.test(
      text
    )
  ) {
    return text;
  }

  return `${text}.`;
}

function lowerFirst(
  value
) {
  const text =
    String(
      value || ""
    )
      .trim();

  if (!text) {
    return "";
  }

  return (
    text
      .charAt(0)
      .toLowerCase() +
    text.slice(1)
  );
}

function capitalizeFirst(
  value
) {
  const text =
    String(
      value || ""
    )
      .trim();

  if (!text) {
    return "";
  }

  return (
    text
      .charAt(0)
      .toUpperCase() +
    text.slice(1)
  );
}

function normalize(
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
      " "
    )
    .trim();
}
