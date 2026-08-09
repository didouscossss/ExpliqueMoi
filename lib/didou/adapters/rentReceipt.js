/**
 * E — Adaptateur quittance de loyer.
 */

/**
 * @param {{ text: string, extraction: object, detection: object }} ctx
 */
export function adaptRentReceipt(ctx) {
  const { text, extraction, detection } = ctx;
  const lower = text.toLowerCase();

  const paid =
    extraction.amounts.find((a) => a.role === "paymentAmount" && a.important) ||
    extraction.amounts.find((a) =>
      /loyer|quittanc|payé|perçu|reglé|réglé|somme de/.test(
        String(a.context || "").toLowerCase()
      )
    ) ||
    extraction.amounts[0] ||
    null;

  const period =
    extraction.periods[0] ||
    extraction.dates.find((d) => d.role === "coveredPeriod") ||
    null;

  const issuer =
    extraction.entities.organizations.find((o) =>
      /sci|bailleur|immobilier|gestion/i.test(o)
    ) ||
    extraction.entities.organizations[0] ||
    null;

  const tenant =
    extraction.entities.people[0] ||
    findLabeled(text, /locataire\s*[:\-]\s*(.+)/i) ||
    null;

  const address = extraction.entities.addresses[0] || null;

  const importantFacts = [];
  if (period) {
    importantFacts.push({
      kind: "period",
      label: "Période couverte",
      value: period.raw,
      confidence: period.confidence || 80
    });
  }
  if (paid) {
    importantFacts.push({
      kind: "amount",
      label: "Loyer payé / quittancé",
      value: paid.value,
      confidence: paid.confidence || 80
    });
  }
  if (issuer) {
    importantFacts.push({
      kind: "issuer",
      label: "Bailleur / gestionnaire",
      value: issuer,
      confidence: 70
    });
  }
  if (tenant) {
    importantFacts.push({
      kind: "person",
      label: "Locataire",
      value: tenant,
      confidence: 65
    });
  }
  if (address) {
    importantFacts.push({
      kind: "address",
      label: "Logement",
      value: address,
      confidence: 70
    });
  }
  if (/atteste|quittance|reçu|recu|paiement/.test(lower)) {
    importantFacts.push({
      kind: "status",
      label: "Preuve de paiement",
      value: "Le document atteste que le loyer a été payé pour la période indiquée.",
      confidence: 85
    });
  }

  const evidence = [];
  if (paid) {
    evidence.push({
      page: "Page 1",
      quote: paid.context || paid.value,
      explanation: "Montant du loyer quittancé"
    });
  }
  if (period) {
    evidence.push({
      page: "Page 1",
      quote: period.context || period.raw,
      explanation: "Période de loyer couverte"
    });
  }

  return {
    family: "logement",
    documentType: detection.documentType || "Quittance de loyer",
    understandingLevel:
      paid && period ? "strong" : detection.understandingLevel || "probable",
    confidence: Math.max(detection.confidence || 0, paid && period ? 88 : 70),
    issuer,
    recipient: tenant,
    mainDate: period
      ? {
          date: period.raw,
          label: "Période de loyer",
          meaning: "Mois / période couverte par la quittance",
          role: "coveredPeriod"
        }
      : null,
    mainAmount: paid
      ? {
          value: paid.value,
          label: "Loyer payé",
          meaning: "Montant quittancé / payé",
          role: "paymentAmount"
        }
      : null,
    importantFacts: importantFacts.slice(0, 6),
    actions: [],
    deadlines: [],
    whyReceived:
      "Ce document vous a probablement été remis comme preuve de paiement du loyer.",
    documentPurpose:
      "Attester que le loyer a été payé pour une période donnée.",
    attentionLevel: "none",
    evidence,
    warnings: [],
    uncertainties: paid
      ? []
      : ["Le montant exact du loyer n’a pas pu être confirmé avec certitude."]
  };
}

function findLabeled(text, re) {
  const match = String(text || "").match(re);
  return match ? match[1].trim() : null;
}
