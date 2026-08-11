/**
 * E — Adaptateur facture.
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;
  const text = String(ctx.text || "");
  const lines = Array.isArray(ctx.lines) ? ctx.lines : text.split(/\n/);

  /*
   * Ne prend plus simplement le premier amountDue.
   * On classe tous les montants pour distinguer :
   * - total réel de la facture ;
   * - lignes de détail ;
   * - HT / TVA / autres montants.
   */
  const due = pickBestInvoiceAmount(
    extraction.amounts || [],
    text,
    lines
  );

  const deadline =
    extraction.dates.find(
      (d) => d.role === "deadline" && d.important
    ) || null;

  const issueDate =
    extraction.dates.find((d) => d.role === "issueDate") || null;

  const paymentTerms = extractPaymentTerms(text, lines);

  const billingPeriod = pickInvoicePeriod(
    extraction.periods || [],
    text
  );

  const issuer = pickIssuer(
    extraction.entities.organizations || [],
    text,
    lines
  );

  const invoiceReference = pickInvoiceReference(
    extraction.entities.references || []
  );

  const actions = [];

  if (due) {
    actions.push({
      action: `Régler ${due.value}`,
      how: paymentTerms?.text
        ? `Selon les modalités de la facture — ${paymentTerms.text}`
        : "Selon le moyen de paiement indiqué sur la facture",
      confidence: Math.max(due.confidence || 80, 85)
    });
  }

  /*
   * IMPORTANT :
   * "Sous trente jours" est un délai relatif,
   * pas une véritable date calendrier.
   */
  const effectiveDeadline = deadline
    ? {
        date: deadline.raw,
        label: "Date limite de paiement",
        meaning:
          cleanProof(deadline.context) ||
          "Date limite indiquée sur la facture",
        confidence: deadline.confidence
      }
    : paymentTerms
    ? {
        date: null,
        displayValue: paymentTerms.short,
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
      kind: effectiveDeadline.date ? "date" : "paymentTerms",
      label: effectiveDeadline.label,
      value:
        effectiveDeadline.date ||
        effectiveDeadline.displayValue,
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
      explanation: "Montant total à régler"
    },

    billingPeriod && {
      page: "Page 1",
      quote: cleanProof(
        billingPeriod.context || billingPeriod.raw
      ),
      explanation: "Période facturée"
    },

    paymentTerms && {
      page: "Page 1",
      quote: paymentTerms.text,
      explanation: "Délai ou condition de paiement"
    },

    issueDate && {
      page: "Page 1",
      quote: cleanProof(
        issueDate.context || issueDate.raw
      ),
      explanation: "Date indiquée sur la facture"
    }
  ].filter((item) => item && item.quote);

  return {
    family: "facture",
    documentType:
      detection.documentType || "Facture",

    understandingLevel:
      due ? "strong" : detection.understandingLevel,

    confidence: Math.max(
      detection.confidence || 0,
      due ? 84 : 60
    ),

    issuer,
    recipient: null,

    /*
     * Une condition comme "sous 30 jours" ne doit
     * plus devenir artificiellement mainDate.
     *
     * mainDate est réservée à une vraie date.
     */
    mainDate: deadline
      ? {
          date: deadline.raw,
          label: "Date limite de paiement",
          meaning:
            cleanProof(deadline.context) ||
            "Date limite indiquée sur la facture",
          role: "deadline"
        }
      : issueDate
      ? {
          date: issueDate.raw,
          label: "Date du document",
          meaning: "Date indiquée sur la facture",
          role: "issueDate"
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

    deadlines: effectiveDeadline
      ? [effectiveDeadline]
      : [],

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

/**
 * Classe les montants d'une facture et choisit
 * le candidat le plus probable comme total à payer.
 */
function pickBestInvoiceAmount(amounts, text, lines) {
  if (!Array.isArray(amounts) || !amounts.length) {
    return null;
  }

  const scored = amounts.map((amount) => {
    const ctx = String(amount.context || "").toLowerCase();
    let score = Number(amount.confidence || 0);

    /*
     * Rôle déjà attribué par roles.js
     */
    if (amount.role === "amountDue") {
      score += 100;
    }

    if (amount.important) {
      score += 20;
    }

    /*
     * Signaux très forts d'un total final.
     */
    if (
      /montant\s+du\s*\(?\s*ttc\s*\)?/i.test(ctx)
    ) {
      score += 180;
    }

    if (/montant\s+ttc/i.test(ctx)) {
      score += 170;
    }

    if (/total\s+ttc/i.test(ctx)) {
      score += 170;
    }

    if (/net\s+[àa]\s+payer/i.test(ctx)) {
      score += 170;
    }

    if (/montant\s+[àa]\s+payer/i.test(ctx)) {
      score += 160;
    }

    if (/reste\s+[àa]\s+payer/i.test(ctx)) {
      score += 150;
    }

    if (/total\s+[àa]\s+r[ée]gler/i.test(ctx)) {
      score += 150;
    }

    /*
     * Lignes de détail : forte pénalité.
     */
    if (
      /\b(abonnement(?:s)?|forfait(?:\s+proportionnel)?|part\s+fixe|part\s+variable|détail|detail)\b/i.test(
        ctx
      )
    ) {
      score -= 180;
    }

    if (amount.role === "invoiceLineAmount") {
      score -= 200;
    }

    if (amount.role === "ht") {
      score -= 140;
    }

    if (amount.role === "vat") {
      score -= 140;
    }

    if (amount.role === "example") {
      score -= 250;
    }

    /*
     * Vérification supplémentaire dans les lignes OCR.
     *
     * Si le montant apparaît sur une ligne contenant
     * explicitement TTC / total / à payer, bonus.
     */
    const amountValue = normalizeAmountForSearch(amount.value);

    for (const line of lines) {
      const normalizedLine = normalizeAmountForSearch(line);

      if (
        amountValue &&
        normalizedLine.includes(amountValue)
      ) {
        const lowerLine = String(line || "").toLowerCase();

        if (
          /montant.*ttc|total.*ttc|net.*[àa].*payer|montant.*[àa].*payer/.test(
            lowerLine
          )
        ) {
          score += 220;
        }

        if (
          /abonnement|forfait|part fixe|part variable/.test(
            lowerLine
          )
        ) {
          score -= 180;
        }
      }
    }

    return {
      amount,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];

  /*
   * On exige un minimum de cohérence avant
   * d'afficher un montant comme somme à payer.
   */
  if (!best || best.score < 70) {
    return null;
  }

  return {
    ...best.amount,
    confidence: Math.max(
      best.amount.confidence || 0,
      best.score >= 200 ? 92 : 80
    )
  };
}

/**
 * Normalisation légère pour retrouver un montant
 * dans une ligne OCR malgré espaces / virgules.
 */
function normalizeAmountForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[€eur]/g, "")
    .replace(/\./g, ",")
    .trim();
}

/**
 * Détecte les conditions de paiement.
 */
function extractPaymentTerms(text, lines) {
  const candidates = [
    ...lines
      .map((line) => String(line || "").trim())
      .filter(Boolean),

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
        short: "Sous 30 jours"
      };
    }
  }

  return null;
}

/**
 * Choisit la période facturée.
 */
function pickInvoicePeriod(periods, text) {
  if (!periods.length) {
    return null;
  }

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

/**
 * Choisit l'organisme émetteur.
 */
function pickIssuer(organizations, text, lines) {
  const orgs = organizations.filter(Boolean);

  const preferred = orgs.find((org) =>
    /simer/i.test(org)
  );

  if (preferred) {
    return preferred;
  }

  const header = lines.slice(0, 16).join(" ");

  const match = header.match(
    /(?:organisme(?: de gestion)?|service public)\s*[:-]?\s*([A-Z][A-Z0-9&' -]{2,30})/i
  );

  if (match?.[1]) {
    return cleanProof(match[1])
      .replace(/\s+-.*$/, "");
  }

  const known = String(text || "").match(
    /\bSIMER\b/i
  );

  if (known) {
    return known[0].toUpperCase();
  }

  return orgs[0] || null;
}

/**
 * Évite les références OCR manifestement absurdes.
 *
 * Exemple observé :
 * "vembre" ne doit jamais devenir une référence.
 */
function pickInvoiceReference(references) {
  const candidates = references.filter(
    (ref) =>
      ref &&
      (ref.type === "invoice" || ref.type === "file")
  );

  return (
    candidates.find((ref) =>
      isPlausibleReference(ref.value)
    ) || null
  );
}

function isPlausibleReference(value) {
  const ref = String(value || "").trim();

  if (!ref) {
    return false;
  }

  /*
   * Une référence crédible contient généralement
   * au moins un chiffre.
   */
  if (!/\d/.test(ref)) {
    return false;
  }

  if (ref.length < 4 || ref.length > 40) {
    return false;
  }

  return true;
}

/**
 * Produit une preuve propre pour le montant.
 */
function bestAmountProof(amount) {
  const ctx = cleanProof(amount?.context || "");

  if (!ctx) {
    return `Montant à payer : ${amount?.value || ""}`;
  }

  const hasStrongLabel =
    /montant.*ttc|total.*ttc|net.*à payer|net.*a payer|montant.*à payer|montant.*a payer/.test(
      ctx.toLowerCase()
    );

  if (hasStrongLabel && ctx.length <= 180) {
    return ctx;
  }

  return `Montant à payer : ${amount.value}`;
}

/**
 * Nettoyage léger des preuves affichées.
 */
function cleanProof(value) {
  return String(value || "")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .slice(0, 190);
}

/**
 * Supprime les preuves identiques.
 */
function dedupeEvidence(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(
      item.quote || ""
    ).toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
