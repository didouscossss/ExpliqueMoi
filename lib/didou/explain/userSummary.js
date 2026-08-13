/**
 * F — Résumé utilisateur V2.
 *
 * Objectifs :
 * - une phrase courte et claire ;
 * - éviter les répétitions ;
 * - jamais "ce document est un document" ;
 * - ne pas prétendre avoir compris si aucune info utile n'est disponible.
 */

export function buildUserFacingExplanation(partial) {
  const type = cleanType(partial?.documentType);
  const family = String(partial?.family || "");
  const level = partial?.understandingLevel || "extraction";

  if (
    level === "extraction" ||
    !hasUsefulInformation(partial)
  ) {
    return {
      document_label: "Document non compris",
      one_sentence:
        "Didou n’a pas trouvé suffisamment d’informations fiables pour expliquer ce document.",
      important_points: []
    };
  }

  const documentLabel =
    buildDocumentLabel(type, family, level);

  const sentence =
    buildMainSentence(
      partial,
      type,
      family,
      level
    );

  const importantPoints =
    buildImportantPoints(
      partial,
      sentence
    );

  return {
    document_label: documentLabel,
    one_sentence: sentence,
    important_points: importantPoints
  };
}

/**
 * =====================================================
 * PHRASE PRINCIPALE
 * =====================================================
 */

function buildMainSentence(
  partial,
  type,
  family,
  level
) {
  const why =
    cleanSentence(
      partial?.whyReceived
    );

  if (why) {
    return why;
  }

  const purpose =
    cleanSentence(
      partial?.documentPurpose
    );

  if (purpose) {
    return purpose;
  }

  const action =
    firstAction(
      partial?.actions
    );

  if (action) {
    return ensureSentence(
      `Ce document vous demande de ${lowerFirst(action)}`
    );
  }

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

  if (
    family &&
    family !== "autre"
  ) {
    return ensureSentence(
      `Didou a identifié un document ${familyLabel(family)}`
    );
  }

  return "Didou a lu le document mais n’a pas identifié suffisamment d’informations utiles.";
}

/**
 * =====================================================
 * LABEL DOCUMENT
 * =====================================================
 */

function buildDocumentLabel(
  type,
  family,
  level
) {
  if (type) {
    if (
      level === "strong"
    ) {
      return type;
    }

    return `Probablement : ${type}`;
  }

  if (
    family &&
    family !== "autre"
  ) {
    return `Document ${familyLabel(family)}`;
  }

  return "Document analysé";
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
    normalize(mainSentence);

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
      ).trim();

    const value =
      String(
        fact?.value || ""
      ).trim();

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

    const line =
      label &&
      value
        ? `${label} : ${value}`
        : value || label;

    const key =
      normalize(line);

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

  return false;
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
    return cleanSentence(first);
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
    ).trim();

  if (!type) {
    return null;
  }

  const normalized =
    normalize(type);

  if (
    [
      "document",
      "autre",
      "document autre",
      "document administratif"
    ].includes(normalized)
  ) {
    return null;
  }

  return type;
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
    fiscal: "fiscal",
    administratif: "administratif",
    facture: "de facturation",
    bancaire: "bancaire",
    assurance: "d’assurance",
    logement: "de logement",
    copropriete: "de copropriété",
    emploi: "lié à l’emploi",
    social: "social",
    sante: "de santé",
    juridique: "juridique",
    courrier: "de correspondance",
    contrat: "contractuel",
    formulaire: "à compléter"
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
    ).toLowerCase();

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

  return ensureSentence(text);
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
    /[.!?]$/.test(text)
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
    ).trim();

  if (!text) {
    return "";
  }

  return (
    text.charAt(0)
      .toLowerCase() +
    text.slice(1)
  );
}

function normalize(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFD")
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
