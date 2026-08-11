/**
 * E — Analyseur générique (documents inconnus ou partiels).
 */

export function adaptGeneric(ctx) {
  const { extraction, detection } = ctx;

  const mainAmount =
    extraction.amounts.find((a) => a.important) || null;
  const mainDate =
    extraction.dates.find((d) => d.important) ||
    extraction.periods[0] ||
    null;

  const actions = (extraction.actionPhrases || [])
    .filter((p) => p.kind === "request" || p.kind === "action")
    .slice(0, 3)
    .map((p) => ({
      action: p.phrase.slice(0, 140),
      how: "",
      confidence: p.confidence
    }));

  const deadlines = extraction.dates
    .filter((d) => d.role === "deadline")
    .slice(0, 3)
    .map((d) => ({
      date: d.raw,
      label: "Échéance",
      meaning: d.context,
      confidence: d.confidence
    }));

  const importantFacts = [];
  if (detection.family && detection.family !== "autre") {
    importantFacts.push({
      kind: "family",
      label: "Famille documentaire",
      value: detection.family,
      confidence: detection.confidence
    });
  }
  if (mainDate) {
    importantFacts.push({
      kind: "date",
      label: mainDate.role === "coveredPeriod" ? "Période" : "Date",
      value: mainDate.raw,
      confidence: mainDate.confidence
    });
  }
  if (mainAmount) {
    importantFacts.push({
      kind: "amount",
      label: "Montant",
      value: mainAmount.value,
      confidence: mainAmount.confidence
    });
  }

  const issuer = extraction.entities.organizations[0] || null;

  return {
    family: detection.family || "autre",
    documentType: detection.documentType,
    understandingLevel: detection.understandingLevel || "partial",
    confidence: detection.confidence || 30,
    issuer,
    recipient: extraction.entities.people[0] || null,
    mainDate: mainDate
      ? {
          date: mainDate.raw,
          label: mainDate.role || "Date",
          meaning: mainDate.context || "",
          role: mainDate.role || "unknown"
        }
      : null,
    mainAmount: mainAmount
      ? {
          value: mainAmount.value,
          label: mainAmount.role || "Montant",
          meaning: mainAmount.context || "",
          role: mainAmount.role || "unknown"
        }
      : null,
    importantFacts: importantFacts.slice(0, 5),
    actions,
    deadlines,
    whyReceived: null,
    documentPurpose: null,
    attentionLevel: deadlines.length ? "soon" : actions.length ? "uncertain" : "none",
    evidence: [
      mainAmount && {
        page: "Page 1",
        quote: mainAmount.context || mainAmount.value,
        explanation: "Montant contextualisé"
      },
      mainDate && {
        page: "Page 1",
        quote: mainDate.context || mainDate.raw,
        explanation: "Date contextualisée"
      }
    ].filter(Boolean),
    warnings: [],
    uncertainties: [
      !detection.documentType &&
        "Le type précis du document n’a pas pu être déterminé.",
      !mainAmount &&
        extraction.amounts.length > 0 &&
        "Des montants ont été vus mais leur rôle n’est pas assez clair pour les afficher comme principaux.",
      !mainDate &&
        extraction.dates.length > 0 &&
        "Des dates ont été vues mais aucune n’a un rôle suffisamment établi."
    ].filter(Boolean)
  };
}
