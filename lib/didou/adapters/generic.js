/**
 * E — Analyseur générique (documents inconnus ou partiels).
 */

/*
 * `meaning` est un texte destiné à être lu par l'utilisateur —
 * pas un espace de debug. Utiliser directement le "context" brut
 * extrait (souvent ~300 caractères de texte source, ponctuation
 * coupée) revenait à afficher un extrait illisible à la place
 * d'une explication. On préfère une courte phrase honnête basée
 * sur le rôle déjà identifié (même vocabulaire que
 * interpret/roles.js), et un extrait COURT en dernier recours —
 * jamais le contexte complet.
 */

const DATE_MEANING_BY_ROLE = {
  issueDate: "Date d’émission du document",
  deadline: "Date limite mentionnée dans le document",
  meetingDate: "Date d’un rendez-vous ou d’une réunion",
  paymentDate: "Date d’un paiement",
  debitDate: "Date d’un prélèvement",
  refundDate: "Date d’un remboursement",
  coveredPeriod: "Période concernée par le document"
};

const AMOUNT_MEANING_BY_ROLE = {
  amountDue: "Montant à régler",
  paymentAmount: "Montant d’un paiement",
  paidAmount: "Montant déjà payé",
  refundAmount: "Montant d’un remboursement",
  refundedAmount: "Montant déjà remboursé",
  automaticDebitAmount: "Montant d’un prélèvement automatique",
  installmentAmount: "Montant d’une échéance",
  salary: "Montant d’une rémunération",
  deposit: "Montant d’un dépôt de garantie"
};

const MAX_MEANING_EXCERPT = 100;
const MAX_EVIDENCE_QUOTE = 200;

function truncate(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function describeDateMeaning(date) {
  return (
    DATE_MEANING_BY_ROLE[date?.role] ||
    (date?.context
      ? `Date trouvée dans : « ${truncate(date.context, MAX_MEANING_EXCERPT)} »`
      : "Date mentionnée dans le document")
  );
}

function describeAmountMeaning(amount) {
  return (
    AMOUNT_MEANING_BY_ROLE[amount?.role] ||
    (amount?.context
      ? `Montant trouvé dans : « ${truncate(amount.context, MAX_MEANING_EXCERPT)} »`
      : "Montant mentionné dans le document")
  );
}

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
      meaning: describeDateMeaning(d),
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
          meaning: describeDateMeaning(mainDate),
          role: mainDate.role || "unknown"
        }
      : null,
    mainAmount: mainAmount
      ? {
          value: mainAmount.value,
          label: mainAmount.role || "Montant",
          meaning: describeAmountMeaning(mainAmount),
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
        quote: truncate(mainAmount.context || mainAmount.value, MAX_EVIDENCE_QUOTE),
        explanation: "Montant contextualisé"
      },
      mainDate && {
        page: "Page 1",
        quote: truncate(mainDate.context || mainDate.raw, MAX_EVIDENCE_QUOTE),
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
