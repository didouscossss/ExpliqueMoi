/**
 * Qualité d’analyse — statut success / warning / error.
 * Un champ secondaire manquant ne doit PAS dégrader tout le document.
 */

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  if (number > 0 && number <= 1) {
    return Math.round(number * 100);
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function isPlaceholder(text) {
  return /non identifié|indisponible|non trouvée avec certitude|non trouvé|à vérifier|raison non indiquée|aucune demande|information non trouvée/i.test(
    text || ""
  );
}

/**
 * @param {object} analysis - analyse normalisée (snake_case ou camelCase)
 * @param {object} processingInfo - { failedPages, totalPages, warnings, pageErrors }
 */
export function determineAnalysisQuality(analysis = {}, processingInfo = {}) {
  const documentType = clean(
    analysis.document_type || analysis.documentType
  );
  const issuer = clean(analysis.issuer);
  const summary = clean(
    analysis.plain_summary || analysis.summary
  );
  const request = clean(analysis.request);
  const whyReceived = clean(
    analysis.why_received || analysis.whyReceived
  );

  const actions = Array.isArray(analysis.actions) ? analysis.actions : [];
  const dates = Array.isArray(analysis.dates) ? analysis.dates : [];
  const amount = analysis.amount || {};
  const amountValue = clean(amount.value);
  const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
  const tables = Array.isArray(analysis.tables) ? analysis.tables : [];

  const failedPages = uniqueNumbers(
    processingInfo.failedPages ||
      analysis.failedPages ||
      analysis.failed_pages ||
      []
  );
  const totalPages = Math.max(
    0,
    Number(processingInfo.totalPages || analysis.totalPages || 0) || 0
  );

  const confidence = normalizeConfidence(
    analysis.confidence ?? processingInfo.confidence
  );

  const hasType =
    documentType.length >= 3 && !isPlaceholder(documentType);
  const hasSummary =
    summary.length >= 28 && !isPlaceholder(summary);
  const hasRequest =
    request.length >= 8 && !isPlaceholder(request);
  const hasActions = actions.some((item) => {
    const action = clean(item?.action);
    return action.length >= 4 && !isPlaceholder(action);
  });
  const hasIssuer = issuer.length >= 2 && !isPlaceholder(issuer);
  const hasDates = dates.some(
    (item) =>
      clean(item?.raw || item?.date || item?.normalized).length >= 2
  );
  const hasAmount =
    amountValue.length >= 1 &&
    !isPlaceholder(amountValue) &&
    !/^non trouvé$/i.test(amountValue);
  const hasEvidence = evidence.some(
    (item) => clean(item?.quote).length >= 6
  );
  const hasTables = tables.length > 0;

  const mainSignals = [
    hasType,
    hasSummary,
    hasRequest,
    hasActions,
    hasIssuer && hasSummary
  ].filter(Boolean).length;

  const importantMissingFields = [];
  const reasons = [];

  if (!hasType) importantMissingFields.push("document_type");
  if (!hasSummary) importantMissingFields.push("plain_summary");
  if (!hasRequest) importantMissingFields.push("request");
  if (!hasActions) importantMissingFields.push("actions");

  // Contenu principal insuffisant → ERROR
  if (mainSignals < 2 && !hasSummary) {
    reasons.push("Aucun contenu principal fiable n’a pu être extrait.");
    return {
      status: "error",
      confidence,
      reasons,
      importantMissingFields,
      failedPages
    };
  }

  if (!hasSummary && !hasRequest && !hasActions && !hasEvidence) {
    reasons.push("Le résumé, la demande et les actions sont absents ou incertains.");
    return {
      status: "error",
      confidence,
      reasons,
      importantMissingFields,
      failedPages
    };
  }

  // Pages importantes illisibles — une page blanche isolée ne suffit pas
  // si le contenu principal est déjà fiable.
  const failedRatio =
    totalPages > 0 ? failedPages.length / totalPages : 0;

  const importantPageFailure =
    failedPages.length >= 2 ||
    failedRatio > 0.34 ||
    (failedPages.length === 1 && !hasSummary && !hasRequest);

  // Demande / actions manquantes alors que le type suggère une obligation
  const expectsAction = /mise en demeure|relance|convocation|facture|avis|sommation|rappel/i.test(
    documentType + " " + summary
  );

  if (expectsAction && !hasRequest && !hasActions) {
    importantMissingFields.push("request_or_actions");
    reasons.push(
      "La demande principale ou les actions à réaliser restent incertaines."
    );
  }

  if (importantPageFailure) {
    reasons.push(
      failedPages.length === 1
        ? `La page ${failedPages[0]} n’a pas pu être lue correctement.`
        : `Certaines pages importantes n’ont pas pu être lues : ${failedPages.join(", ")}.`
    );
  }

  if (confidence > 0 && confidence < 40 && (!hasDates || !hasAmount)) {
    reasons.push("La confiance globale est faible sur des informations essentielles.");
  }

  // WARNING uniquement si une partie IMPORTANTE est incertaine
  if (reasons.length > 0 || importantPageFailure) {
    return {
      status: "warning",
      confidence: Math.max(confidence, hasSummary ? 60 : confidence),
      reasons,
      importantMissingFields,
      failedPages
    };
  }

  // Succès : contenu principal exploitable
  // Les warnings secondaires (signature, cellule vide, page blanche, etc.)
  // ne dégradent PAS le statut.
  if (!hasDates) {
    // Absence de date ≠ échec / warning global
  }

  if (!hasTables && !hasAmount && !hasEvidence) {
    // Secondaire — ignoré pour le statut
  }

  return {
    status: "success",
    confidence: Math.max(confidence, 70),
    reasons: [],
    importantMissingFields: [],
    failedPages
  };
}

/**
 * Convertit le statut qualité en reading_quality legacy + message UI.
 */
export function qualityToReadingQuality(quality) {
  if (!quality || quality.status === "error") {
    return "failed";
  }

  if (quality.status === "warning") {
    return "partial";
  }

  return "full";
}

export function qualityUiCopy(quality) {
  if (!quality || quality.status === "error") {
    return {
      level: "low",
      face: "😕",
      title: "J’ai besoin d’un document plus lisible",
      message:
        "Je n’ai pas retrouvé assez d’informations certaines. Essayez une photo plus nette ou le PDF d’origine.",
      bannerTitle: "Échec de l’analyse",
      bannerMessage: quality?.reasons?.[0] || "Aucun contenu exploitable.",
      dots: 1
    };
  }

  if (quality.status === "warning") {
    return {
      level: "medium",
      face: "🤔",
      title: "Document compris, avec quelques réserves",
      message:
        quality.reasons?.[0] ||
        "Le document a été compris, mais certaines informations importantes restent à vérifier.",
      bannerTitle: "Analyse terminée",
      bannerMessage:
        "Le document a été compris, mais certaines informations secondaires ou importantes sont difficiles à lire.",
      dots: 3
    };
  }

  return {
    level: "excellent",
    face: "😊",
    title: "J’ai tout compris !",
    message:
      "Le document est clair. J’ai retrouvé les informations principales et les actions à réaliser.",
    bannerTitle: "Analyse terminée avec succès !",
    bannerMessage: "Votre document a été compris.",
    dots: 4
  };
}

function uniqueNumbers(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ].sort((a, b) => a - b);
}

export { normalizeConfidence as normalizeQualityConfidence };
