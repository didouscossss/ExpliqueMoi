/**
 * E — Adaptateur facture.
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  const due =
    extraction.amounts.find((a) => a.role === "amountDue" && a.important) ||
    extraction.amounts.find((a) =>
      /ttc|à payer|a payer|net|total/.test(String(a.context || "").toLowerCase())
    ) ||
    null;

  const deadline =
    extraction.dates.find((d) => d.role === "deadline" && d.important) ||
    null;

  const issuer =
    extraction.entities.organizations[0] ||
    null;

  const actions = [];
  if (due) {
    actions.push({
      action: `Régler ${due.value}`,
      how: "Selon le moyen de paiement indiqué sur la facture",
      confidence: 75
    });
  }

  const deadlines = deadline
    ? [
        {
          date: deadline.raw,
          label: "Date limite de paiement",
          meaning: deadline.context,
          confidence: deadline.confidence
        }
      ]
    : [];

  return {
    family: "facture",
    documentType: detection.documentType || "Facture",
    understandingLevel: due ? "strong" : detection.understandingLevel,
    confidence: Math.max(detection.confidence || 0, due ? 82 : 60),
    issuer,
    recipient: null,
    mainDate: deadline
      ? {
          date: deadline.raw,
          label: "Échéance de paiement",
          meaning: "Date limite pour régler la facture",
          role: "deadline"
        }
      : null,
    mainAmount: due
      ? {
          value: due.value,
          label: "Montant à payer",
          meaning: due.context || "Montant dû",
          role: "amountDue"
        }
      : null,
    importantFacts: [
      due && {
        kind: "amount",
        label: "Montant à payer",
        value: due.value,
        confidence: due.confidence
      },
      deadline && {
        kind: "date",
        label: "Échéance",
        value: deadline.raw,
        confidence: deadline.confidence
      },
      issuer && {
        kind: "issuer",
        label: "Émetteur",
        value: issuer,
        confidence: 65
      }
    ].filter(Boolean),
    actions,
    deadlines,
    whyReceived: "Ce document vous informe d’un montant à régler.",
    documentPurpose: "Demander le paiement d’une prestation ou d’un service.",
    attentionLevel: deadline || due ? "soon" : "uncertain",
    evidence: [
      due && {
        page: "Page 1",
        quote: due.context || due.value,
        explanation: "Montant principal de la facture"
      },
      deadline && {
        page: "Page 1",
        quote: deadline.context || deadline.raw,
        explanation: "Échéance de paiement"
      }
    ].filter(Boolean),
    warnings: [],
    uncertainties: []
  };
}
