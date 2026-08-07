/**
 * Mappe la réponse V3 (/api/v3/analyze) vers le schéma attendu par normalizeAnalysis().
 *
 * Faits UI = 100 % locaux (jamais écrasés par l’IA) :
 * - document_type ← local.documentType
 * - plain_summary ← local.factualSummary
 * - evidence ← local.evidence (extraits verbatim)
 * - amount ← amountToPay → amountTTC → netToPay → amountHT
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

const PRINCIPAL_MEANING = {
  amountToPay: "Montant à payer détecté localement.",
  amountTTC: "Montant TTC détecté localement.",
  netToPay: "Net à payer détecté localement.",
  amountHT: "Montant HT (TTC / à payer non détecté)."
};

const TYPE_LABELS = {
  facture: "facture",
  devis: "devis",
  contrat: "contrat",
  bulletin_de_salaire: "bulletin de salaire",
  releve_bancaire: "relevé bancaire",
  courrier: "courrier",
  ordonnance: "ordonnance",
  document_inconnu: "Document"
};

/**
 * Priorité explicite montant principal facture.
 * @returns {{ value: number|null, source: string|null }}
 */
export function selectPrincipalAmountValue(fields) {
  if (fields?.amountToPay != null && Number.isFinite(Number(fields.amountToPay))) {
    return { value: Number(fields.amountToPay), source: "amountToPay" };
  }
  if (fields?.amountTTC != null && Number.isFinite(Number(fields.amountTTC))) {
    return { value: Number(fields.amountTTC), source: "amountTTC" };
  }
  if (fields?.netToPay != null && Number.isFinite(Number(fields.netToPay))) {
    return { value: Number(fields.netToPay), source: "netToPay" };
  }
  if (fields?.amountHT != null && Number.isFinite(Number(fields.amountHT))) {
    return { value: Number(fields.amountHT), source: "amountHT" };
  }
  return { value: null, source: null };
}

/**
 * @param {object} v3Response corps JSON de /api/v3/analyze (ok:true)
 */
export function mapV3ResponseToUiAnalysis(v3Response) {
  const local = v3Response?.localAnalysis || {};
  const fields = local.fields || {};
  const result = v3Response?.result || {};
  const explanation = result.explanation || {};
  const meta = v3Response?.meta || {};
  const aiMeta = meta.ai || {};

  const localDocType = clean(local.documentType);
  // Type = LOCAL uniquement (l’IA ne doit pas écraser).
  const documentType =
    TYPE_LABELS[localDocType] ||
    localDocType.replace(/_/g, " ") ||
    "Document";

  // Résumé = factuel LOCAL uniquement.
  const summary =
    clean(local.factualSummary) ||
    clean(result.summary) ||
    "Résumé factuel indisponible.";

  const issuer = clean(fields.companyName) || clean(local.issuer) || "";

  const actions = Array.isArray(local.detectedActions)
    ? local.detectedActions.map((action) => ({
        action: clean(action),
        how: "Voir le document et les montants / échéances détectés."
      }))
    : [];

  const amountToPay = fields.amountToPay ?? null;
  const amountTTC = fields.amountTTC ?? null;
  const netToPay = fields.netToPay ?? null;
  const amountHT = fields.amountHT ?? null;
  const amountTVA = fields.amountTVA ?? null;

  const invoiceLike =
    localDocType === "facture" || localDocType === "devis";
  const isPayslip = localDocType === "bulletin_de_salaire";

  if (!actions.length && (amountToPay != null || amountTTC != null || netToPay != null)) {
    const due = amountToPay ?? amountTTC ?? netToPay;
    actions.push({
      action: "Vérifier et régler le montant dû",
      how: `Montant détecté : ${formatAmount(due)}.`
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

  // Passages importants = preuves LOCALES verbatim (jamais keyPoints IA).
  const localEvidence = Array.isArray(local.evidence) ? local.evidence : [];
  const evidence = localEvidence.map((item, index) => ({
    id: clean(item.id) || `ev-${index + 1}`,
    quote: clean(item.quote),
    page: item.page != null ? String(item.page) : "",
    field: clean(item.field),
    label: clean(item.label),
    source: clean(item.source) || "ocr"
  })).filter((item) => item.quote);

  const amounts = [];
  if (amountHT != null) {
    amounts.push({ value: formatAmount(amountHT), label: "HT", kind: "ht" });
  }
  if (amountTVA != null) {
    amounts.push({ value: formatAmount(amountTVA), label: "TVA", kind: "vat" });
  }
  if (amountTTC != null) {
    amounts.push({
      value: formatAmount(amountTTC),
      label: "TTC",
      kind: "ttc"
    });
  }
  if (amountToPay != null && amountToPay !== amountTTC) {
    amounts.push({
      value: formatAmount(amountToPay),
      label: "À payer",
      kind: "due"
    });
  }

  const warnings = [
    ...(Array.isArray(local.warnings) ? local.warnings : []),
    ...(Array.isArray(result.warnings) ? result.warnings : [])
  ]
    .map(clean)
    .filter(Boolean);

  if (aiMeta.available === false) {
    const msg = "Explication IA indisponible — faits locaux affichés.";
    if (!warnings.includes(msg)) warnings.push(msg);
  } else {
    warnings.push(
      "Analyse V3 : faits locaux ; IA utilisée uniquement pour l’explication complémentaire."
    );
  }

  let principalValue = "Non trouvé";
  let principalMeaning = "Aucun montant identifié.";
  let principalSource = null;

  if (invoiceLike) {
    const picked = selectPrincipalAmountValue({
      amountToPay,
      amountTTC,
      netToPay,
      amountHT
    });
    principalSource = picked.source;
    if (picked.value != null) {
      principalValue = formatAmount(picked.value);
      principalMeaning =
        PRINCIPAL_MEANING[picked.source] || "Montant détecté localement.";
    }
  } else if (isPayslip) {
    const picked = selectPrincipalAmountValue({
      amountToPay: null,
      amountTTC: null,
      netToPay: netToPay ?? amountTTC,
      amountHT
    });
    principalSource = picked.source;
    if (picked.value != null) {
      principalValue = formatAmount(picked.value);
      principalMeaning =
        PRINCIPAL_MEANING[picked.source] || "Net à payer détecté localement.";
    }
  } else {
    const picked = selectPrincipalAmountValue({
      amountToPay,
      amountTTC,
      netToPay,
      amountHT
    });
    principalSource = picked.source;
    if (picked.value != null) {
      principalValue = formatAmount(picked.value);
      principalMeaning =
        PRINCIPAL_MEANING[picked.source] || "Montant détecté localement.";
    }
  }

  // Explication pédagogique AI (optionnelle) — ne remplace pas le résumé factuel.
  const pedagogy = clean(explanation.pedagogy || explanation.explanation || "");

  return {
    document_type: documentType,
    issuer,
    plain_summary: summary,
    request:
      fields.clientName
        ? `Document destiné à ${fields.clientName}.`
        : "Consulter le résumé et les points clés.",
    why_received:
      localDocType === "facture"
        ? "Il s’agit d’une facture détectée localement."
        : "Document administratif détecté localement.",
    actions,
    dates,
    amount: {
      value: principalValue,
      meaning: principalMeaning,
      source: principalSource
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
    provider: result.provider || meta.provider || null,
    model: result.model || meta.model || null,
    ai_available: aiMeta.available !== false,
    pedagogy: pedagogy || null
  };
}
