/**
 * F — Résumé utilisateur V4
 *
 * Objectifs :
 * - utiliser brainFusion.decision en priorité ;
 * - produire une réponse plus naturelle et plus directe ;
 * - garder l'ancien comportement comme fallback ;
 * - éviter les faux ordres et les répétitions ;
 * - distinguer :
 *   remboursement
 *   prélèvement
 *   paiement
 *   réunion
 *   attestation
 *   contrat
 *   décision
 *   déclaration
 *   notification
 */

export function buildUserFacingExplanation(
  partial
) {
 const consensus =
  partial?.brainFusion
    ?.consensus ||
  null;
console.log(
  "[USER SUMMARY CONSENSUS]",
  consensus
);
const type =
  cleanType(
    consensus?.documentType ||
    partial?.documentType
  );

const family =
  String(
    consensus?.family ||
    partial?.family ||
    ""
  );

  const level =
    partial?.understandingLevel ||
    "extraction";

  /*
   * =====================================================
   * BRAIN
   * =====================================================
   */

  const brainFusion =
    partial?.brainFusion ||
    null;

  const decision =
    brainFusion?.decision ||
    null;

  const brainIntent =
    decision?.intent ||
    brainFusion?.intent ||
    null;

  const brainSituation =
    decision?.primarySituation ||
    brainFusion?.situation ||
    null;

  const decisionConfidence =
    Number(
      decision?.confidence || 0
    );

  /*
   * =====================================================
   * DOCUMENT NON COMPRIS
   * =====================================================
   */

  if (
    level === "extraction" &&
    !hasStrongDecision(
      decision
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

  if (
    !hasUsefulInformation(
      partial
    ) &&
    !hasStrongDecision(
      decision
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
      decision,
      brainIntent
    });

  /*
   * =====================================================
   * PHRASE PRINCIPALE
   * =====================================================
   */

  const sentence =
    buildMainSentence({
      partial,
      type,
      family,
      level,
      decision,
      brainIntent,
      brainSituation,
      decisionConfidence
    });

  /*
   * =====================================================
   * POINTS IMPORTANTS
   * =====================================================
   */

  const importantPoints =
    buildImportantPoints({
      partial,
      mainSentence:
        sentence,
      decision
    });

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
  decision,
  brainIntent,
  brainSituation,
  decisionConfidence
}) {
  /*
   * ===================================================
   * 1 — DECISION ENGINE
   * ===================================================
   */

  if (
    decision &&
    decisionConfidence >= 70
  ) {
    const decisionSentence =
      buildDecisionSentence({
        partial,
        type,
        family,
        decision
      });

    if (
      decisionSentence
    ) {
      return decisionSentence;
    }
  }

  /*
   * ===================================================
   * 2 — SITUATIONS FINANCIERES LEGACY/BRAIN
   * ===================================================
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
   * 3 — ATTESTATION
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "proof" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    return buildProofSentence({
      type,
      family,
      brainIntent
    });
  }

  /*
   * ===================================================
   * 4 — DECISION
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "decision" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    return (
      "Ce document vous informe d’une décision."
    );
  }

  /*
   * ===================================================
   * 5 — CONTRAT
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "contract" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * 6 — DECLARATION
   * ===================================================
   */

  if (
    brainIntent?.type ===
      "declaration" &&
    Number(
      brainIntent?.confidence || 0
    ) >= 75
  ) {
    return (
      "Ce document sert à déclarer ou présenter des informations."
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

  if (
    action
  ) {
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

  if (
    type
  ) {
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
 * DECISION ENGINE → PHRASE
 * =====================================================
 */

function buildDecisionSentence({
  partial,
  type,
  family,
  decision
}) {
  const situation =
    decision?.primarySituation
      ?.type ||
    decision?.intent?.type ||
    null;

  const amount =
    decision?.primaryAmount
      ?.value ||
    partial?.mainAmount
      ?.value ||
    null;

  const date =
    decision?.primaryDate
      ?.value ||
    partial?.mainDate
      ?.date ||
    null;

  const actionRequired =
    decision?.actionRequired;

  /*
   * ===================================================
   * REMBOURSEMENT
   * ===================================================
   */

  if (
    situation === "refund"
  ) {
    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu le ${date}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu`
      );
    }

    if (
      date
    ) {
      return ensureSentence(
        `Un remboursement est prévu le ${date}`
      );
    }

    return (
      "Ce document annonce un remboursement."
    );
  }

  /*
   * ===================================================
   * PRELEVEMENT AUTOMATIQUE
   * ===================================================
   */

  if (
    situation ===
    "automatic_debit"
  ) {
    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu le ${date}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu`
      );
    }

    return (
      "Ce document annonce un prélèvement automatique."
    );
  }

  /*
   * ===================================================
   * PAIEMENT A EFFECTUER
   * ===================================================
   */

  if (
    situation ===
    "payment_due"
  ) {
    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Vous devez régler ${amount} avant ou à la date du ${date}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Vous devez régler ${amount}`
      );
    }

    if (
      date
    ) {
      return ensureSentence(
        `Un paiement doit être effectué avant ou à la date du ${date}`
      );
    }

    return (
      "Ce document indique qu’un paiement est à effectuer."
    );
  }

  /*
   * ===================================================
   * ATTESTATION / PREUVE
   * ===================================================
   */

  if (
    situation === "proof"
  ) {
    if (
      family === "assurance" ||
      /assurance/i.test(
        String(
          type || ""
        )
      )
    ) {
      return (
        "Cette attestation sert à justifier votre situation d’assurance."
      );
    }

    if (
      type
    ) {
      return ensureSentence(
        `${capitalizeFirst(type)} sert à certifier ou justifier une situation`
      );
    }

    return (
      "Ce document sert d’attestation ou de justificatif."
    );
  }

  /*
   * ===================================================
   * REUNION
   * ===================================================
   */

  if (
    situation === "meeting"
  ) {
    if (
      date
    ) {
      return ensureSentence(
        `Une réunion ou assemblée est prévue le ${date}`
      );
    }

    return (
      "Ce document vous informe d’une réunion ou d’une convocation."
    );
  }

  /*
   * ===================================================
   * CONTRAT
   * ===================================================
   */

  if (
    situation === "contract"
  ) {
    return (
      "Ce document définit ou confirme une relation contractuelle."
    );
  }

  /*
   * ===================================================
   * DECISION
   * ===================================================
   */

  if (
    situation === "decision"
  ) {
    return (
      "Ce document vous informe d’une décision."
    );
  }

  /*
   * ===================================================
   * DECLARATION
   * ===================================================
   */

  if (
    situation === "declaration"
  ) {
    return (
      "Ce document sert à déclarer ou présenter des informations."
    );
  }

  /*
   * ===================================================
   * NOTIFICATION
   * ===================================================
   */

  if (
    situation === "notification"
  ) {
    return (
      "Ce document vous informe d’une situation ou d’un changement."
    );
  }

  /*
   * ===================================================
   * REQUEST
   * ===================================================
   */

  if (
    situation === "request" ||
    actionRequired === true
  ) {
    const action =
      firstAction(
        decision?.actions
      ) ||
      firstAction(
        partial?.actions
      );

    if (
      action
    ) {
      return ensureSentence(
        `Ce document vous demande de ${lowerFirst(action)}`
      );
    }

    return (
      "Ce document vous demande d’effectuer une démarche."
    );
  }

  /*
   * ===================================================
   * AUCUNE ACTION
   * ===================================================
   */

  if (
    actionRequired === false
  ) {
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
  }

  return null;
}

/**
 * =====================================================
 * ATTESTATION / JUSTIFICATIF
 * =====================================================
 */

function buildProofSentence({
  type,
  family,
  brainIntent
}) {
  if (
    type
  ) {
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
      `${capitalizeFirst(type)} sert à certifier ou justifier une situation`
    );
  }

  if (
    family === "assurance"
  ) {
    return (
      "Ce document sert à justifier une situation liée à votre assurance."
    );
  }

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
 * SITUATIONS FINANCIERES
 * =====================================================
 */

function buildFinancialSentence({
  partial,
  brainSituation
}) {
  const type =
    brainSituation?.type ||
    null;

  if (
    type === "refund"
  ) {
    const amount =
      partial?.mainAmount
        ?.value;

    const date =
      partial?.mainDate
        ?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu le ${date}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un remboursement de ${amount} est prévu`
      );
    }

    return (
      "Ce document annonce un remboursement."
    );
  }

  if (
    type ===
    "automatic_debit"
  ) {
    const amount =
      partial?.mainAmount
        ?.value;

    const date =
      partial?.mainDate
        ?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu le ${date}`
      );
    }

    if (
      amount
    ) {
      return ensureSentence(
        `Un prélèvement automatique de ${amount} est prévu`
      );
    }

    return (
      "Ce document annonce un prélèvement automatique."
    );
  }

  if (
    type ===
    "payment_due"
  ) {
    const amount =
      partial?.mainAmount
        ?.value;

    const date =
      partial?.mainDate
        ?.date;

    if (
      amount &&
      date
    ) {
      return ensureSentence(
        `Vous devez régler ${amount} avant ou à la date du ${date}`
      );
    }

    if (
      amount
    ) {
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
  decision,
  brainIntent
}) {
  if (
    type
  ) {
    if (
      level === "strong"
    ) {
      return type;
    }

    if (
      Number(
        decision?.confidence ||
        0
      ) >= 85
    ) {
      return type;
    }

    if (
      brainIntent?.type ===
        "proof" &&
      Number(
        brainIntent?.confidence ||
        0
      ) >= 88
    ) {
      return type;
    }

    return (
      `Probablement : ${type}`
    );
  }

  if (
    decision?.intent?.type ===
      "proof" &&
    Number(
      decision?.confidence || 0
    ) >= 80
  ) {
    return (
      "Attestation / justificatif"
    );
  }

  if (
    brainIntent?.type ===
      "proof" &&
    Number(
      brainIntent?.confidence ||
      0
    ) >= 85
  ) {
    return (
      "Attestation / justificatif"
    );
  }

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

function buildImportantPoints({
  partial,
  mainSentence,
  decision
}) {
  const normalizedSentence =
    normalize(
      mainSentence
    );

  const seen =
    new Set();

  const points =
    [];

  /*
   * ===================================================
   * ACTION REQUISE ?
   * ===================================================
   */

  if (
    decision?.actionRequired ===
      false &&
    Number(
      decision?.confidence || 0
    ) >= 75
  ) {
    addPoint(
      points,
      seen,
      "Aucune action particulière n’est nécessaire."
    );
  }

  /*
   * ===================================================
   * FACTS
   * ===================================================
   */

  for (
    const fact
    of partial?.importantFacts ||
    []
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

    if (
      value &&
      normalizedSentence.includes(
        normalize(value)
      )
    ) {
      continue;
    }

    /*
     * Type déjà dans le titre.
     */

    if (
      fact?.kind ===
      "documentType"
    ) {
      continue;
    }

    /*
     * Éviter la répétition
     * "Fonction du document : ..."
     * si la phrase principale l'explique déjà.
     */

    if (
      fact?.kind ===
        "intent" &&
      decision?.intent?.type ===
        "proof"
    ) {
      continue;
    }

    const line =
      label &&
      value
        ? `${label} : ${value}`
        : value || label;

    addPoint(
      points,
      seen,
      line
    );

    if (
      points.length >= 3
    ) {
      break;
    }
  }

  return points.slice(
    0,
    3
  );
}

function addPoint(
  points,
  seen,
  value
) {
  const text =
    cleanSentence(
      value
    );

  if (
    !text
  ) {
    return;
  }

  const key =
    normalize(
      text
    );

  if (
    !key ||
    seen.has(key)
  ) {
    return;
  }

  seen.add(
    key
  );

  points.push(
    text
  );
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
    partial?.mainAmount
      ?.value
  ) {
    return true;
  }

  if (
    partial?.mainDate
      ?.date
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

  if (
    hasStrongDecision(
      partial?.brainFusion
        ?.decision
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * DECISION FORTE ?
 * =====================================================
 */

function hasStrongDecision(
  decision
) {
  if (
    !decision
  ) {
    return false;
  }

  if (
    Number(
      decision?.confidence || 0
    ) < 70
  ) {
    return false;
  }

  if (
    decision?.primarySituation
      ?.type
  ) {
    return true;
  }

  if (
    decision?.intent?.type &&
    decision.intent.type !==
      "unknown"
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * BRAIN FORT ?
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
      brainIntent.confidence ||
      0
    ) >= 75
  ) {
    return true;
  }

  if (
    brainSituation &&
    brainSituation.type &&
    Number(
      brainSituation
        .confidence ||
      0
    ) >= 75
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * EXPLICATION GENERIQUE ?
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
    Array.isArray(
      actions
    )
      ? actions
      : [];

  for (
    const item
    of list
  ) {
    const value =
      typeof item ===
        "string"
        ? item
        : item?.action;

    const action =
      cleanSentence(
        value
      );

    if (
      !action
    ) {
      continue;
    }

    if (
      !isUsefulAction(
        action
      )
    ) {
      continue;
    }

    return action;
  }

  return null;
}

function isUsefulAction(
  value
) {
  const text =
    normalize(
      value
    );

  if (
    !text
  ) {
    return false;
  }

  if (
    /merci de votre confiance|merci pour votre confiance/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /ne pas tenir compte|ne pas en tenir compte/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /si vous avez besoin|si besoin|si necessaire/.test(
      text
    )
  ) {
    return false;
  }

  return true;
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

  if (
    !type
  ) {
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
    return "attestation";
  }

  if (
    value.includes(
      "certificat"
    )
  ) {
    return "certificat";
  }

  if (
    value.includes(
      "justificatif"
    )
  ) {
    return "justificatif";
  }

  return "attestation";
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
    text.length < 3
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

  if (
    !text
  ) {
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

  if (
    !text
  ) {
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

  if (
    !text
  ) {
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
      /[’']/g,
      "'"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
