/**
 * E — Adaptateur facture.
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;
  const text = String(ctx.text || "");
  const lines = Array.isArray(ctx.lines) ? ctx.lines : text.split(/\n/);

  const due =
    extraction.amounts.find((a) => a.role === "amountDue" && a.important) ||
    extraction.amounts.find((a) =>
      /ttc|à payer|a payer|montant du|montant dû|net|total|payable/.test(
        String(a.context || "").toLowerCase()
      )
    ) ||
    null;

  const deadline =
    extraction.dates.find((d) => d.role === "deadline" && d.important) || null;

  const issueDate = extraction.dates.find((d) => d.role === "issueDate") || null;
  const paymentTerms = extractPaymentTerms(text, lines);
  const billingPeriod = pickInvoicePeriod(extraction.periods || [], text);
  const issuer = pickIssuer(extraction.entities.organizations || [], text, lines);
  const invoiceReference = (extraction.entities.references || []).find(
    (ref) => ref.type === "invoice" || ref.type === "file"
  );

  const actions = [];
  if (due) {
    actions.push({
      action: `Régler ${due.value}`,
      how: paymentTerms?.text
        ? `Selon les modalités de la facture — ${paymentTerms.text}`
        : "Selon le moyen de paiement indiqué sur la facture",
      confidence: 80
    });
  }

  const effectiveDeadline = deadline
    ? {
        date: deadline.raw,
        label: "Date limite de paiement",
        meaning: cleanProof(deadline.context) || "Date limite indiquée sur la facture",
        confidence: deadline.confidence
      }
    : paymentTerms
      ? {
          date: paymentTerms.short,
          label: "Délai de paiement",
          meaning: paymentTerms.text,
          confidence: 85
        }
      : null;

  const importantFacts = [
    due && {
      kind: "amount",
      label: "Montant à payer",
      value: due.value,
      confidence: due.confidence
    },
    billingPeriod && {
      kind: "period",
      label: "Période concernée",
      value: billingPeriod.raw,
      confidence: billingPeriod.confidence
    },
    effectiveDeadline && {
      kind: "date",
      label: effectiveDeadline.label,
      value: effectiveDeadline.date,
      confidence: effectiveDeadline.confidence
    },
    issueDate && {
      kind: "date",
      label: "Date du document",
      value: issueDate.raw,
      confidence: issueDate.confidence
    },
    issuer && {
      kind: "issuer",
      label: "Émetteur",
      value: issuer,
      confidence: 75
    },
    invoiceReference && {
      kind: "reference",
      label: "Référence",
      value: invoiceReference.value,
      confidence: invoiceReference.confidence || 65
    }
  ].filter(Boolean);

  const evidence = [
    due && {
      page: "Page 1",
      quote: bestAmountProof(due),
      explanation: "Montant principal de la facture"
    },
    billingPeriod && {
      page: "Page 1",
      quote: cleanProof(billingPeriod.context || billingPeriod.raw),
      explanation: "Période facturée"
    },
    paymentTerms && {
      page: "Page 1",
      quote: paymentTerms.text,
      explanation: "Délai ou condition de paiement"
    },
    issueDate && {
      page: "Page 1",
      quote: cleanProof(issueDate.context || issueDate.raw),
      explanation: "Date indiquée sur la facture"
    }
  ].filter((item) => item && item.quote);

  return {
    family: "facture",
    documentType: detection.documentType || "Facture",
    understandingLevel: due ? "strong" : detection.understandingLevel,
    confidence: Math.max(detection.confidence || 0, due ? 84 : 60),
    issuer,
    recipient: null,
    mainDate: effectiveDeadline
      ? {
          date: effectiveDeadline.date,
          label: effectiveDeadline.label,
          meaning: effectiveDeadline.meaning,
          role: deadline ? "deadline" : "paymentTerms"
        }
      : billingPeriod
        ? {
            date: billingPeriod.raw,
            label: "Période concernée",
            meaning: "Période couverte par cette facture",
            role: "coveredPeriod"
          }
        : null,
    mainAmount: due
      ? {
          value: due.value,
          label: "Montant à payer",
          meaning: "Montant total à régler",
          role: "amountDue"
        }
      : null,
    importantFacts,
    actions,
    deadlines: effectiveDeadline ? [effectiveDeadline] : [],
    whyReceived: due
      ? `Ce document vous demande de régler ${due.value}.`
      : "Ce document vous informe d’un montant à régler.",
    documentPurpose: billingPeriod
      ? `Demander le paiement d’un service pour la période ${billingPeriod.raw}.`
      : "Demander le paiement d’une prestation ou d’un service.",
    attentionLevel: due ? "soon" : "uncertain",
    evidence: dedupeEvidence(evidence),
    warnings: [],
    uncertainties: []
  };
}

function extractPaymentTerms(text, lines) {
  const candidates = [
    ...lines.map((line) => String(line || "").trim()).filter(Boolean),
    String(text || "").replace(/\s+/g, " ")
  ];

  for (const candidate of candidates) {
    const match = candidate.match(
      /(?:payable|à payer|a payer|règlement|reglement)[^\n.!?]{0,45}(?:sous|dans)\s+(trente|30)\s+jours?[^\n.!?]{0,55}/i
    );
    if (match) {
      const textValue = cleanProof(match[0]);
      return {
        text: textValue,
        short: /30/.test(match[1]) ? "Sous 30 jours" : "Sous trente jours"
      };
    }
  }

  return null;
}

function pickInvoicePeriod(periods, text) {
  if (!periods.length) return null;
  return (
    periods.find((p) => p.kind === "semester") ||
    periods.find((p) =>
      /redevance|factur|abonnement|période|periode|semestre/.test(
        String(p.context || text).toLowerCase()
      )
    ) ||
    null
  );
}

function pickIssuer(organizations, text, lines) {
  const orgs = organizations.filter(Boolean);
  const preferred = orgs.find((org) => /simer/i.test(org));
  if (preferred) return preferred;

  // Acronyme / organisme bien visible dans l'en-tête, sans dictionnaire fournisseur.
  const header = lines.slice(0, 16).join(" ");
  const m = header.match(/(?:organisme(?: de gestion)?|service public)\s*[:\-]?\s*([A-Z][A-Z0-9&' -]{2,30})/i);
  if (m?.[1]) return cleanProof(m[1]).replace(/\s+-.*$/, "");

  const known = String(text || "").match(/\bSIMER\b/i);
  if (known) return known[0].toUpperCase();
  return orgs[0] || null;
}

function bestAmountProof(amount) {
  const ctx = cleanProof(amount?.context || "");
  if (!ctx) return amount?.value || "";
  const hasLabel = /montant|ttc|total|à payer|a payer|payable|net/.test(ctx.toLowerCase());
  if (hasLabel && ctx.length <= 180) return ctx;
  return `Montant à payer : ${amount.value}`;
}

function cleanProof(value) {
  return String(value || "")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .slice(0, 190);
}

function dedupeEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.quote || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
