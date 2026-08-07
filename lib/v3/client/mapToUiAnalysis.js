/**
 * Mappe la réponse V3 (/api/v3/analyze) vers le schéma attendu par normalizeAnalysis().
 */

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatAmount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return `${Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

/**
 * @param {object} v3Response corps JSON de /api/v3/analyze (ok:true)
 */
export function mapV3ResponseToUiAnalysis(v3Response) {
  const local = v3Response?.localAnalysis || {};
  const fields = local.fields || {};
  const result = v3Response?.result || {};
  const explanation = result.explanation || {};

  const summary =
    clean(result.summary) ||
    clean(explanation.summary) ||
    "Résumé indisponible.";

  const documentType =
    clean(explanation.documentType) ||
    clean(local.documentType)?.replace(/_/g, " ") ||
    "Document";

  const issuer = clean(fields.companyName) || clean(local.issuer) || "";

  const keyPoints = Array.isArray(explanation.keyPoints)
    ? explanation.keyPoints.map(clean).filter(Boolean)
    : [];

  const actions = Array.isArray(local.detectedActions)
    ? local.detectedActions.map((action) => ({
        action: clean(action),
        how: "Voir le document et les montants / échéances détectés."
      }))
    : [];

  if (!actions.length && fields.amountTTC != null) {
    actions.push({
      action: "Vérifier et régler le montant TTC si dû",
      how: `Montant TTC détecté : ${formatAmount(fields.amountTTC)}.`
    });
  }

  const dates = Array.isArray(local.dates)
    ? local.dates.map((item) => ({
        date: clean(item.iso || item.raw),
        type: clean(item.label) || "date",
        label: clean(item.label) || "Date",
        meaning: clean(item.raw)
      }))
    : [];

  for (const deadline of local.deadlines || []) {
    dates.push({
      date: clean(deadline.iso || deadline.raw),
      type: "deadline",
      label: "Échéance",
      meaning: clean(deadline.raw)
    });
  }

  const evidence = keyPoints.map((quote, index) => ({
    id: `v3-${index + 1}`,
    quote,
    page: ""
  }));

  if (fields.invoiceNumber) {
    evidence.unshift({
      id: "v3-invoice",
      quote: `N° ${fields.invoiceNumber}`,
      page: ""
    });
  }

  const ttc = fields.amountTTC;
  const ht = fields.amountHT;
  const tva = fields.amountTVA;

  const amounts = [];
  if (ht != null) {
    amounts.push({ value: formatAmount(ht), label: "HT", kind: "ht" });
  }
  if (tva != null) {
    amounts.push({ value: formatAmount(tva), label: "TVA", kind: "vat" });
  }
  if (ttc != null) {
    amounts.push({ value: formatAmount(ttc), label: "TTC", kind: "ttc" });
  }

  const warnings = [
    ...(Array.isArray(local.warnings) ? local.warnings : []),
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...(Array.isArray(explanation.warnings) ? explanation.warnings : [])
  ]
    .map(clean)
    .filter(Boolean);

  warnings.push(
    "Analyse V3 : extraction locale puis explication IA (aucun document brut envoyé)."
  );

  return {
    document_type: documentType,
    issuer,
    plain_summary: summary,
    request:
      fields.clientName
        ? `Document destiné à ${fields.clientName}.`
        : "Consulter le résumé et les points clés.",
    why_received:
      clean(local.documentType) === "facture"
        ? "Il s’agit d’une facture détectée localement."
        : "Document administratif détecté localement.",
    actions,
    dates,
    amount: {
      value: ttc != null ? formatAmount(ttc) : ht != null ? formatAmount(ht) : "Non trouvé",
      meaning:
        ttc != null
          ? "Montant TTC détecté localement."
          : ht != null
            ? "Montant HT détecté localement."
            : "Aucun montant identifié."
    },
    amounts,
    urgency: {
      level: (local.deadlines || []).length ? "soon" : "none",
      message: (local.deadlines || []).length
        ? "Une échéance a été détectée."
        : "Pas d’urgence explicite détectée."
    },
    evidence,
    warnings,
    confidence: Math.round((local.documentTypeConfidence || 0.5) * 100),
    reading_quality: "full",
    references: Array.isArray(local.references) ? local.references : [],
    entities: {
      client: fields.clientName || null,
      company: fields.companyName || null,
      siret: fields.siret || null,
      iban: fields.iban || null
    },
    engine: "v3",
    provider: result.provider || v3Response?.meta?.provider || null,
    model: result.model || v3Response?.meta?.model || null
  };
}
