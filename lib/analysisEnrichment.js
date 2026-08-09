/**
 * Enrichissement post-Gemini : dates, montants, références, personnes,
 * délais, risques, contradictions et qualité de lecture.
 * N’invente jamais : normalise uniquement ce qui est fourni.
 */

const DATE_TYPES = new Set([
  "letter_date",
  "issue_date",
  "reception_date",
  "deadline",
  "delay",
  "appointment",
  "period",
  "due_date",
  "meeting_date",
  "payment_date",
  "table_date",
  "handwritten_date",
  "historical",
  "legal_mention",
  "other"
]);

const AMOUNT_KINDS = new Set([
  "to_pay",
  "paid",
  "refund",
  "salary",
  "allowance",
  "tax",
  "vat",
  "ht",
  "ttc",
  "total",
  "deposit",
  "penalty",
  "table_value",
  "historical",
  "example",
  "other"
]);

const PRIMARY_DATE_TYPES = new Set([
  "deadline",
  "due_date",
  "appointment",
  "meeting_date",
  "period",
  "payment_date"
]);

const SECONDARY_DATE_TYPES = new Set([
  "historical",
  "legal_mention",
  "table_date",
  "other"
]);

const SECONDARY_AMOUNT_KINDS = new Set([
  "table_value",
  "historical",
  "example",
  "vat",
  "ht",
  "other"
]);

const REF_TYPES = new Set([
  "caf",
  "cpam",
  "file",
  "client",
  "invoice",
  "siret",
  "rib",
  "iban",
  "bic",
  "tax_id",
  "contract",
  "letter",
  "other"
]);

const PERSON_ROLES = new Set([
  "sender",
  "recipient",
  "administration",
  "organization",
  "company",
  "service",
  "agent",
  "signatory",
  "landlord",
  "tenant",
  "syndic",
  "other"
]);

export function enrichAnalysisResult(raw, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const pageErrors = Array.isArray(options.pageErrors)
    ? options.pageErrors
    : [];
  const extraWarnings = Array.isArray(options.extraWarnings)
    ? options.extraWarnings
    : [];
  const heterogeneous = options.heterogeneous === true;

  const dates = normalizeDates(source);
  const amounts = normalizeAmounts(source);
  const tables = Array.isArray(source.tables) ? source.tables : [];
  const references = normalizeReferences(source);
  const persons = normalizePersons(source);
  const deadlines = normalizeDeadlines(source, dates);
  const requiredDocuments = normalizeRequiredDocuments(source);
  const risks = normalizeRisks(source);
  const actions = normalizeActions(source);
  const contradictions = detectContradictions({
    dates,
    amounts,
    deadlines,
    tables,
    source
  });

  const warnings = [];
  const pushWarning = (value) => {
    const text = cleanText(value);
    if (text && !warnings.includes(text)) {
      warnings.push(text);
    }
  };

  extraWarnings.forEach(pushWarning);
  if (Array.isArray(source.warnings)) {
    source.warnings.forEach(pushWarning);
  }
  if (heterogeneous) {
    pushWarning(
      "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément."
    );
  }
  contradictions.forEach((item) => pushWarning(item.message));

  // Avertissements légers (incertitude locale) — ne forcent PAS reading_quality=partial
  const softUncertainty = collectSoftUncertainty(source, dates, amounts);
  softUncertainty.forEach(pushWarning);

  // Regroupe les bruits « Date/Montant trouvé / rôle non déterminé » hors synthèse
  filterNoisyWarnings(warnings);

  const confidence = normalizeConfidence(source.confidence);
  const readingQuality = deriveReadingQuality({
    declared: source.reading_quality,
    confidence,
    pageErrors,
    contradictions,
    summary: source.plain_summary,
    actions,
    dates,
    amounts
  });

  const documentType = sanitizeDocumentType(
    source.document_type,
    source.identification_level,
    source.document_family,
    source.user_summary
  );

  const userSummary = buildUserSummary(source, {
    documentType,
    amounts,
    dates,
    deadlines,
    actions,
    primaryAmountHint: source.amount
  });

  const primaryAmount = userSummary.main_amount
    ? {
        value: userSummary.main_amount.value,
        meaning:
          userSummary.main_amount.meaning ||
          userSummary.main_amount.label ||
          ""
      }
    : pickPrimaryAmount(amounts, source.amount, documentType);

  const primaryDates = selectDisplayDates(dates, deadlines, documentType);
  const legacyDates = primaryDates.slice(0, 6).map((item) => ({
    date: item.date,
    label: item.label || mapDateTypeLabel(item.type),
    meaning: item.meaning || item.context || "",
    type: item.type || "",
    page: item.page || "",
    context: item.context || "",
    confidence: item.confidence
  }));

  // Détails montants : seulement ceux utiles (pas dump de tableaux fiscaux)
  const displayAmounts = selectDisplayAmounts(amounts, documentType);
  const legacyAmountsDetail = displayAmounts.slice(0, 8).map((item) => ({
    label: item.label || mapAmountKindLabel(item.kind),
    value: item.value,
    kind: mapAmountKindLegacy(item.kind),
    page: item.page || ""
  }));

  const entities = mergeEntities(source.entities, persons, references);

  const plainSummary =
    cleanText(userSummary.one_sentence) ||
    cleanText(source.plain_summary) ||
    "C’est un document dont l’objet n’a pas été identifié avec certitude.";

  const mainAction = userSummary.main_action;
  const normalizedActions = (
    mainAction?.action
      ? [
          {
            action: mainAction.action,
            how: mainAction.how || "",
            page: "",
            context: "",
            confidence: 80
          },
          ...actions.filter(
            (item) =>
              normalizeKey(item.action) !== normalizeKey(mainAction.action)
          )
        ]
      : actions
  )
    .slice(0, 5)
    .map((item) => ({
      action: item.action,
      how: item.how || "",
      page: item.page || "",
      context: item.context || "",
      confidence: item.confidence
    }));

  return {
    engine: cleanText(source.engine) || "",
    document_type: documentType,
    document_family: cleanText(source.document_family) || "",
    identification_level: normalizeIdentificationLevel(
      source.identification_level,
      documentType
    ),
    issuer: cleanText(source.issuer) || pickIssuer(persons),
    plain_summary: plainSummary,
    request:
      cleanText(source.request) ||
      (normalizedActions[0]?.action
        ? normalizedActions[0].action
        : "Aucune action particulière n’est demandée."),
    why_received:
      cleanText(source.why_received) ||
      "Information non trouvée avec certitude",
    user_summary: userSummary,
    urgency: {
      level: ["none", "soon", "urgent", "uncertain"].includes(
        source.urgency?.level
      )
        ? source.urgency.level
        : inferUrgencyLevel(deadlines, risks, documentType),
      message:
        cleanText(source.urgency?.message) ||
        "Le niveau d’urgence n’a pas été déterminé."
    },
    actions: normalizedActions,
    // Legacy + enrichi — dates principales seulement pour l’UI
    dates: legacyDates,
    timeline: normalizeTimeline(source.timeline, primaryDates),
    amount: primaryAmount,
    amounts_detail: legacyAmountsDetail,
    tables: limitTablesForDocument(tables, documentType),
    entities,
    evidence: Array.isArray(source.evidence)
      ? source.evidence.slice(0, 6)
      : [],
    confidence,
    reading_quality: readingQuality,
    warnings,
    page_errors: pageErrors,
    heterogeneous,
    batch_heterogeneous: heterogeneous,
    // Nouvelle structure propre (extraction large conservée)
    amounts,
    references,
    persons,
    deadlines,
    requiredDocuments,
    risks,
    contradictions,
    enriched_dates: dates,
    didou: source.didou && typeof source.didou === "object" ? source.didou : null
  };
}

export function detectContradictions({
  dates = [],
  amounts = [],
  deadlines = [],
  tables = [],
  source = {}
}) {
  const contradictions = [];

  const deadlineValues = unique(
    [
      ...deadlines.map((item) => cleanText(item.date)),
      ...dates
        .filter((item) =>
          ["deadline", "due_date"].includes(item.type)
        )
        .map((item) => cleanText(item.date))
    ].filter(Boolean)
  );

  if (deadlineValues.length > 1) {
    contradictions.push({
      type: "deadline_conflict",
      message: `Plusieurs dates limites différentes apparaissent (${deadlineValues.join(" / ")}). Vérifiez laquelle s’applique.`,
      items: deadlineValues,
      confidence: 90
    });
  }

  const toPay = amounts.filter((item) => item.kind === "to_pay");
  const toPayValues = unique(toPay.map((item) => normalizeAmountKey(item.value)));
  if (toPayValues.length > 1) {
    contradictions.push({
      type: "amount_conflict",
      message: `Plusieurs montants à payer incompatibles apparaissent (${toPay
        .map((item) => item.value)
        .join(" / ")}).`,
      items: toPay.map((item) => item.value),
      confidence: 85
    });
  }

  const ht = firstAmount(amounts, "ht");
  const tva = firstAmount(amounts, "vat");
  const ttc = firstAmount(amounts, "ttc") || firstAmount(amounts, "total");

  if (ht && tva && ttc) {
    const htN = parseFrenchAmount(ht.value);
    const tvaN = parseFrenchAmount(tva.value);
    const ttcN = parseFrenchAmount(ttc.value);

    if (
      Number.isFinite(htN) &&
      Number.isFinite(tvaN) &&
      Number.isFinite(ttcN)
    ) {
      const expected = htN + tvaN;
      if (Math.abs(expected - ttcN) > 0.05) {
        contradictions.push({
          type: "totals_inconsistent",
          message: `Totaux incohérents : HT (${ht.value}) + TVA (${tva.value}) ≠ TTC (${ttc.value}).`,
          items: [ht.value, tva.value, ttc.value],
          confidence: 80
        });
      }
    }
  }

  for (const table of tables) {
    const totals = table?.totals && typeof table.totals === "object"
      ? Object.entries(table.totals)
      : [];
    for (const [label, value] of totals) {
      const tableTotal = parseFrenchAmount(String(value));
      if (!Number.isFinite(tableTotal) || !ttc) {
        continue;
      }
      const main = parseFrenchAmount(ttc.value);
      if (
        Number.isFinite(main) &&
        /ttc|total/i.test(label) &&
        Math.abs(main - tableTotal) > 0.05
      ) {
        contradictions.push({
          type: "table_total_mismatch",
          message: `Le total du tableau « ${cleanText(table.title) || "sans titre"} » (${value}) ne correspond pas au montant TTC principal (${ttc.value}).`,
          items: [String(value), ttc.value],
          confidence: 75
        });
      }
    }
  }

  // Contradictions déjà fournies par le modèle
  if (Array.isArray(source.contradictions)) {
    for (const item of source.contradictions) {
      const message = cleanText(item?.message || item);
      if (!message) continue;
      if (contradictions.some((c) => c.message === message)) continue;
      contradictions.push({
        type: cleanText(item?.type) || "model_flag",
        message,
        items: Array.isArray(item?.items) ? item.items : [],
        confidence: normalizeConfidence(item?.confidence ?? 70)
      });
    }
  }

  return contradictions.slice(0, 8);
}

export function deriveReadingQuality({
  declared,
  confidence,
  pageErrors = [],
  contradictions = [],
  summary,
  actions = [],
  dates = [],
  amounts = []
}) {
  const declaredQuality = cleanText(declared).toLowerCase();

  const hasCore =
    cleanText(summary).length >= 28 &&
    (actions.length > 0 || dates.length > 0 || amounts.length > 0);

  // Échec réel uniquement
  if (declaredQuality === "failed" && !hasCore) {
    return "failed";
  }

  // Pages totalement illisibles multiples → partial
  if (pageErrors.length >= 2 && confidence < 50) {
    return "partial";
  }

  // Analyse complète avec éventuellement de petites incertitudes → full
  if (hasCore && confidence >= 55) {
    return "full";
  }

  if (hasCore) {
    return "full";
  }

  if (declaredQuality === "partial") {
    return "partial";
  }

  return confidence < 40 ? "partial" : "full";
}

function normalizeDates(source) {
  const fromDates = Array.isArray(source.dates) ? source.dates : [];
  const fromEnriched = Array.isArray(source.enriched_dates)
    ? source.enriched_dates
    : [];
  const merged = [...fromEnriched, ...fromDates];

  const result = [];

  for (const item of merged) {
    if (!item || typeof item !== "object") continue;
    const date = cleanText(item.date);
    if (!date || /non trouvée|non trouvé|incertitude/i.test(date)) {
      continue;
    }

    const type = normalizeDateType(item.type || item.label);
    result.push({
      date,
      type,
      label:
        cleanText(item.label) || mapDateTypeLabel(type),
      meaning: cleanText(item.meaning || item.context),
      page: cleanText(item.page) || "",
      context: cleanText(item.context || item.meaning),
      confidence: normalizeConfidence(item.confidence ?? 70)
    });
  }

  // Déduplique aussi les formats de date équivalents (01/07/2026 ≈ 1 juillet 2026)
  return dedupeBy(
    result,
    (item) =>
      `${normalizeDateKey(item.date)}|${item.type || "other"}|${item.page || ""}`
  ).slice(0, 20);
}

function normalizeAmounts(source) {
  const fromAmounts = Array.isArray(source.amounts) ? source.amounts : [];
  const fromDetail = Array.isArray(source.amounts_detail)
    ? source.amounts_detail
    : [];
  const merged = [...fromAmounts, ...fromDetail];

  if (
    source.amount?.value &&
    !/non trouvée|non trouvé|incertitude/i.test(source.amount.value)
  ) {
    merged.unshift({
      value: source.amount.value,
      label: source.amount.meaning || "Montant principal",
      kind: inferAmountKind(source.amount.meaning, source.amount.value),
      page: "",
      context: source.amount.meaning || "",
      confidence: 75
    });
  }

  const result = [];

  for (const item of merged) {
    if (!item || typeof item !== "object") continue;
    const value = cleanText(item.value || item.amount);
    if (!value || /non trouvée|non trouvé|incertitude/i.test(value)) {
      continue;
    }

    const kind = normalizeAmountKind(item.kind || item.label || item.context);
    const label =
      cleanText(item.label) ||
      cleanText(item.context) ||
      mapAmountKindLabel(kind);

    result.push({
      value,
      label,
      kind,
      page: cleanText(item.page) || "",
      context: cleanText(item.context || item.label || item.meaning),
      confidence: normalizeConfidence(item.confidence ?? 70)
    });
  }

  return dedupeBy(
    result,
    (item) => `${normalizeAmountKey(item.value)}|${item.kind}|${item.page}`
  ).slice(0, 24);
}

function normalizeReferences(source) {
  const fromRefs = Array.isArray(source.references) ? source.references : [];
  const fromEntities = Array.isArray(source.entities?.references)
    ? source.entities.references.map((value) => ({
        value,
        type: inferRefType(value),
        page: "",
        context: "",
        confidence: 65
      }))
    : [];

  const result = [];

  for (const item of [...fromRefs, ...fromEntities]) {
    if (typeof item === "string") {
      const value = cleanText(item);
      if (!value) continue;
      result.push({
        value,
        type: inferRefType(value),
        page: "",
        context: "",
        confidence: 65
      });
      continue;
    }

    const value = cleanText(item?.value || item?.reference || item?.label);
    if (!value) continue;

    result.push({
      value,
      type: normalizeRefType(item?.type || value),
      page: cleanText(item?.page) || "",
      context: cleanText(item?.context || item?.label),
      confidence: normalizeConfidence(item?.confidence ?? 70)
    });
  }

  return dedupeBy(result, (item) => `${item.value}|${item.type}`).slice(
    0,
    24
  );
}

function normalizePersons(source) {
  const fromPersons = Array.isArray(source.persons) ? source.persons : [];
  const result = [];

  for (const item of fromPersons) {
    const name = cleanText(item?.name || item?.label);
    if (!name) continue;
    result.push({
      name,
      role: normalizePersonRole(item?.role),
      page: cleanText(item?.page) || "",
      context: cleanText(item?.context),
      confidence: normalizeConfidence(item?.confidence ?? 70)
    });
  }

  // Fallback depuis entities
  const entities = source.entities || {};
  for (const name of entities.people || []) {
    const cleaned = cleanText(name);
    if (!cleaned) continue;
    result.push({
      name: cleaned,
      role: "other",
      page: "",
      context: "",
      confidence: 60
    });
  }
  for (const name of entities.organizations || []) {
    const cleaned = cleanText(name);
    if (!cleaned) continue;
    result.push({
      name: cleaned,
      role: "organization",
      page: "",
      context: "",
      confidence: 65
    });
  }
  for (const name of entities.signatures || []) {
    const cleaned = cleanText(name);
    if (!cleaned) continue;
    result.push({
      name: cleaned,
      role: "signatory",
      page: "",
      context: "Signature",
      confidence: 60
    });
  }

  if (cleanText(source.issuer)) {
    result.unshift({
      name: cleanText(source.issuer),
      role: "sender",
      page: "",
      context: "Expéditeur / organisme",
      confidence: 80
    });
  }

  return dedupeBy(result, (item) => `${item.name}|${item.role}`).slice(0, 20);
}

function normalizeDeadlines(source, dates) {
  const fromDeadlines = Array.isArray(source.deadlines)
    ? source.deadlines
    : [];
  const result = [];

  for (const item of fromDeadlines) {
    const date = cleanText(item?.date);
    if (!date) continue;
    result.push({
      date,
      label: cleanText(item?.label) || "Date limite",
      page: cleanText(item?.page) || "",
      context: cleanText(item?.context || item?.meaning),
      confidence: normalizeConfidence(item?.confidence ?? 75)
    });
  }

  for (const item of dates) {
    if (!["deadline", "due_date", "appointment"].includes(item.type)) {
      continue;
    }
    result.push({
      date: item.date,
      label: item.label || mapDateTypeLabel(item.type),
      page: item.page,
      context: item.context,
      confidence: item.confidence
    });
  }

  return dedupeBy(result, (item) => `${item.date}|${item.label}`).slice(
    0,
    12
  );
}

function normalizeRequiredDocuments(source) {
  const raw =
    source.requiredDocuments ||
    source.required_documents ||
    source.proofs ||
    [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return dedupeBy(
    raw
      .map((item) => {
        if (typeof item === "string") {
          return {
            label: cleanText(item),
            required: true,
            reason: "Demandée dans le document.",
            page: "",
            context: "",
            confidence: 65
          };
        }

        return {
          label: cleanText(item?.label || item?.name || item?.document),
          required: item?.required !== false,
          reason:
            cleanText(item?.reason || item?.why) ||
            "Demandée dans le document.",
          page: cleanText(item?.page) || "",
          context: cleanText(item?.context),
          confidence: normalizeConfidence(item?.confidence ?? 70)
        };
      })
      .filter((item) => item.label),
    (item) => item.label.toLowerCase()
  ).slice(0, 20);
}

function normalizeRisks(source) {
  const raw = Array.isArray(source.risks) ? source.risks : [];

  return dedupeBy(
    raw
      .map((item) => {
        if (typeof item === "string") {
          return {
            label: cleanText(item),
            severity: "medium",
            page: "",
            context: "",
            confidence: 60
          };
        }

        return {
          label: cleanText(item?.label || item?.message || item?.risk),
          severity: ["low", "medium", "high"].includes(item?.severity)
            ? item.severity
            : "medium",
          page: cleanText(item?.page) || "",
          context: cleanText(item?.context),
          confidence: normalizeConfidence(item?.confidence ?? 65)
        };
      })
      .filter((item) => item.label),
    (item) => item.label.toLowerCase()
  ).slice(0, 12);
}

function normalizeActions(source) {
  const raw = Array.isArray(source.actions) ? source.actions : [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return {
          action: cleanText(item),
          how: "",
          page: "",
          context: "",
          confidence: 70
        };
      }

      return {
        action: cleanText(item?.action || item?.label),
        how: cleanText(item?.how || item?.detail),
        page: cleanText(item?.page) || "",
        context: cleanText(item?.context),
        confidence: normalizeConfidence(item?.confidence ?? 75)
      };
    })
    .filter((item) => item.action)
    .slice(0, 8);
}

function normalizeTimeline(raw, dates) {
  const fromRaw = Array.isArray(raw) ? raw : [];
  const mapped = fromRaw
    .map((item) => ({
      date: cleanText(item?.date),
      label: cleanText(item?.label),
      meaning: cleanText(item?.meaning || item?.context)
    }))
    .filter((item) => item.date || item.label);

  if (mapped.length) {
    return mapped.slice(0, 16);
  }

  return dates.slice(0, 12).map((item) => ({
    date: item.date,
    label: item.label,
    meaning: item.context || item.meaning
  }));
}

function collectSoftUncertainty(source, dates, amounts) {
  const notes = [];

  if (
    !dates.length &&
    /date|délai|échéance/i.test(
      `${source.plain_summary || ""} ${source.request || ""}`
    )
  ) {
    notes.push(
      "Certaines dates mentionnées n’ont pas pu être extraites avec certitude."
    );
  }

  if (
    !amounts.length &&
    /€|euro|montant|payer|rembours/i.test(
      `${source.plain_summary || ""} ${source.request || ""}`
    )
  ) {
    notes.push(
      "Un montant semble présent mais n’a pas été confirmé avec certitude."
    );
  }

  return notes;
}

function mergeEntities(rawEntities, persons, references) {
  const source = rawEntities && typeof rawEntities === "object"
    ? rawEntities
    : {};

  return {
    people: unique([
      ...(Array.isArray(source.people) ? source.people : []),
      ...persons
        .filter((item) =>
          ["recipient", "agent", "signatory", "other"].includes(item.role)
        )
        .map((item) => item.name)
    ]),
    addresses: unique(source.addresses || []),
    references: unique([
      ...(Array.isArray(source.references) ? source.references : []),
      ...references.map((item) => item.value)
    ]),
    signatures: unique([
      ...(Array.isArray(source.signatures) ? source.signatures : []),
      ...persons
        .filter((item) => item.role === "signatory")
        .map((item) => item.name)
    ]),
    organizations: unique([
      ...(Array.isArray(source.organizations) ? source.organizations : []),
      ...persons
        .filter((item) =>
          ["sender", "administration", "organization", "company", "service"].includes(
            item.role
          )
        )
        .map((item) => item.name)
    ])
  };
}

function pickPrimaryAmount(amounts, fallback, documentType = "") {
  const type = cleanText(documentType).toLowerCase();
  const useful = amounts.filter(
    (item) => !SECONDARY_AMOUNT_KINDS.has(item.kind) || item.kind === "vat"
  );

  let preferred = null;

  if (/quittance|loyer|reçu de loyer/.test(type)) {
    preferred =
      useful.find((item) => item.kind === "paid") ||
      useful.find((item) => /quittanc|payé|loyer/i.test(item.label)) ||
      useful.find((item) => item.kind === "total");
  } else if (/liasse|2031|déclaration de résultats|formulaire fiscal/.test(type)) {
    // Pas de montant principal inventé à partir des cellules de tableau
    preferred =
      useful.find((item) => item.kind === "to_pay") ||
      useful.find((item) => item.kind === "tax" && item.confidence >= 80) ||
      null;
  } else if (/facture|avoir|devis/.test(type)) {
    preferred =
      useful.find((item) => item.kind === "to_pay") ||
      useful.find((item) => item.kind === "ttc") ||
      useful.find((item) => item.kind === "total") ||
      useful.find((item) => item.kind === "refund");
  } else {
    preferred =
      useful.find((item) => item.kind === "to_pay") ||
      useful.find((item) => item.kind === "paid") ||
      useful.find((item) => item.kind === "ttc") ||
      useful.find((item) => item.kind === "total") ||
      useful.find((item) => item.kind === "refund") ||
      useful.find((item) => item.kind === "salary") ||
      useful.find((item) => !SECONDARY_AMOUNT_KINDS.has(item.kind));
  }

  if (preferred && preferred.confidence >= 45) {
    return {
      value: preferred.value,
      meaning:
        preferred.label ||
        preferred.context ||
        mapAmountKindLabel(preferred.kind)
    };
  }

  const fallbackValue = cleanText(fallback?.value);
  if (
    fallbackValue &&
    !/non trouvée|non trouvé|incertitude/i.test(fallbackValue)
  ) {
    return {
      value: fallbackValue,
      meaning: cleanText(fallback?.meaning) || ""
    };
  }

  return {
    value: "Information non trouvée avec certitude",
    meaning: ""
  };
}

function pickIssuer(persons) {
  const sender = persons.find((item) =>
    ["sender", "administration", "organization", "company"].includes(
      item.role
    )
  );
  return sender?.name || "";
}

function inferUrgencyLevel(deadlines, risks, documentType = "") {
  if (risks.some((item) => item.severity === "high")) {
    return "urgent";
  }
  if (deadlines.length) {
    return "soon";
  }
  const type = cleanText(documentType).toLowerCase();
  if (/quittance|relevé|attestation|liasse|formulaire/.test(type)) {
    return "none";
  }
  return "uncertain";
}

function normalizeDateType(value) {
  const text = cleanText(value).toLowerCase();

  if (!text) return "other";
  if (DATE_TYPES.has(text)) return text;
  if (/limite|échéance|echeance|avant le|à retourner|deadline|due/.test(text)) {
    return "deadline";
  }
  if (/émission|emission|édition|edition|issue/.test(text)) {
    return "issue_date";
  }
  if (/courrier|lettre|letter/.test(text)) return "letter_date";
  if (/réception|reception|reçu/.test(text)) return "reception_date";
  if (/assemblée|assemblee|ag\b|meeting|convocation/.test(text)) {
    return "meeting_date";
  }
  if (/rendez[- ]?vous|rdv|appointment/.test(text)) return "appointment";
  if (/période|periode|period|du .* au|loyer de/.test(text)) return "period";
  if (/paiement|payé|reglé|réglé|payment/.test(text)) return "payment_date";
  if (/délai|delai|delay/.test(text)) return "delay";
  if (/historique|exercice \d{4}|année \d{4}/.test(text)) return "historical";
  if (/mention légale|cgv|article|legal/.test(text)) return "legal_mention";
  if (/tableau|table/.test(text)) return "table_date";
  if (/manuscrit|handwritten/.test(text)) return "handwritten_date";
  if (/prélèvement|prelevement|due_date/.test(text)) return "due_date";
  return "other";
}

function normalizeAmountKind(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "other";
  if (AMOUNT_KINDS.has(text)) return text;
  if (/à payer|a payer|reste à|montant dû|to_pay|payable/.test(text)) {
    return "to_pay";
  }
  if (/quittanc|payé|reglé|réglé|perçu|paid|loyer reçu/.test(text)) {
    return "paid";
  }
  if (/rembours/.test(text)) return "refund";
  if (/salaire|net à payer|brut/.test(text)) return "salary";
  if (/allocation|aide|prestation/.test(text)) return "allowance";
  if (/impôt|impot|fiscal|taxe(?!.*tva)/.test(text)) return "tax";
  if (/\btva\b|vat/.test(text)) return "vat";
  if (/\bht\b/.test(text)) return "ht";
  if (/\bttc\b/.test(text)) return "ttc";
  if (/acompte|deposit/.test(text)) return "deposit";
  if (/pénalité|penalit|majoration|amende/.test(text)) return "penalty";
  if (/tableau|ligne|case|cellule|table_value/.test(text)) return "table_value";
  if (/historique|exercice|exemple|example/.test(text)) {
    return /exemple|example/.test(text) ? "example" : "historical";
  }
  if (/total/.test(text)) return "total";
  return "other";
}

function inferAmountKind(meaning, value) {
  return normalizeAmountKind(`${meaning || ""} ${value || ""}`);
}

function normalizeRefType(value) {
  const text = cleanText(value).toLowerCase();
  if (REF_TYPES.has(text)) return text;
  return inferRefType(text);
}

function inferRefType(value) {
  const text = cleanText(value).toUpperCase();
  if (/IBAN|FR\d{2}/.test(text)) return "iban";
  if (/\bBIC\b|[A-Z]{6}[A-Z0-9]{2,5}/.test(text) && text.length <= 14) {
    return "bic";
  }
  if (/SIRET|\b\d{14}\b/.test(text)) return "siret";
  if (/RIB/.test(text)) return "rib";
  if (/CAF|allocataire/i.test(text)) return "caf";
  if (/CPAM|NIR|sécurité sociale/i.test(text)) return "cpam";
  if (/fiscal|SPI|numéro fiscal/i.test(text)) return "tax_id";
  if (/facture|invoice|FA?-\d+/i.test(text)) return "invoice";
  if (/contrat/i.test(text)) return "contract";
  if (/client/i.test(text)) return "client";
  if (/courrier|courr\.?/i.test(text)) return "letter";
  if (/dossier|réf|ref/i.test(text)) return "file";
  return "other";
}

function normalizePersonRole(value) {
  const text = cleanText(value).toLowerCase();
  if (PERSON_ROLES.has(text)) return text;
  if (/expéditeur|emetteur|émetteur|sender|from/.test(text)) return "sender";
  if (/destinataire|recipient|à l'attention/.test(text)) return "recipient";
  if (/administration|préfecture|minister/.test(text)) return "administration";
  if (/organisme|organization|caf|cpam/.test(text)) return "organization";
  if (/entreprise|société|company|sas|sarl/.test(text)) return "company";
  if (/service/.test(text)) return "service";
  if (/agent|conseiller/.test(text)) return "agent";
  if (/signataire|signature/.test(text)) return "signatory";
  if (/bailleur|propriétaire|landlord|lessor/.test(text)) return "landlord";
  if (/locataire|tenant|preneur/.test(text)) return "tenant";
  if (/syndic/.test(text)) return "syndic";
  return "other";
}

function mapDateTypeLabel(type) {
  const labels = {
    letter_date: "Date du courrier",
    issue_date: "Date d’émission",
    reception_date: "Date de réception",
    deadline: "Date limite",
    delay: "Délai",
    appointment: "Rendez-vous",
    period: "Période",
    due_date: "Échéance",
    meeting_date: "Date de l’assemblée",
    payment_date: "Date de paiement",
    table_date: "Date (tableau)",
    handwritten_date: "Date manuscrite",
    historical: "Date historique",
    legal_mention: "Mention légale",
    other: "Date"
  };
  return labels[type] || "Date";
}

function mapAmountKindLabel(kind) {
  const labels = {
    to_pay: "Montant à payer",
    paid: "Montant payé",
    refund: "Montant remboursé",
    salary: "Salaire",
    allowance: "Allocation",
    tax: "Impôt",
    vat: "TVA",
    ht: "Montant HT",
    ttc: "Montant TTC",
    total: "Total",
    deposit: "Acompte",
    penalty: "Pénalité",
    table_value: "Valeur de tableau",
    historical: "Montant historique",
    example: "Exemple",
    other: "Montant"
  };
  return labels[kind] || "Montant";
}

function mapAmountKindLegacy(kind) {
  if (kind === "vat") return "TVA";
  if (kind === "ht") return "HT";
  if (kind === "ttc") return "TTC";
  if (kind === "total") return "TTC";
  return kind || "autre";
}

function firstAmount(amounts, kind) {
  return amounts.find((item) => item.kind === kind) || null;
}

function parseFrenchAmount(value) {
  const text = cleanText(value)
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeAmountKey(value) {
  const number = parseFrenchAmount(value);
  if (Number.isFinite(number)) {
    return number.toFixed(2);
  }
  return cleanText(value).toLowerCase();
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 0 && number <= 1) return Math.round(number * 100);
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildUserSummary(source, ctx) {
  const raw =
    source.user_summary && typeof source.user_summary === "object"
      ? source.user_summary
      : {};

  const documentLabel =
    cleanText(raw.document_label) ||
    cleanText(ctx.documentType) ||
    "Document administratif";

  const oneSentence =
    cleanText(raw.one_sentence) ||
    cleanText(source.plain_summary) ||
    "";

  const importantPoints = unique(
    (Array.isArray(raw.important_points) ? raw.important_points : [])
      .map((item) => cleanText(item))
      .filter(
        (text) =>
          text &&
          !isNoisyUserPoint(text) &&
          text.length >= 8
      )
  ).slice(0, 5);

  const mainDate =
    normalizeMainDate(raw.main_date) ||
    pickMainDate(ctx.dates, ctx.deadlines, ctx.documentType);

  const mainAmount =
    normalizeMainAmount(raw.main_amount) ||
    (() => {
      const picked = pickPrimaryAmount(
        ctx.amounts,
        ctx.primaryAmountHint,
        ctx.documentType
      );
      if (
        !picked?.value ||
        /non trouvée|non trouvé|incertitude/i.test(picked.value)
      ) {
        return null;
      }
      return {
        value: picked.value,
        label: picked.meaning || "Montant principal",
        meaning: picked.meaning || ""
      };
    })();

  const mainAction =
    normalizeMainAction(raw.main_action) ||
    (ctx.actions[0]
      ? {
          action: ctx.actions[0].action,
          how: ctx.actions[0].how || ""
        }
      : null);

  return {
    document_label: documentLabel,
    one_sentence: oneSentence,
    important_points: importantPoints,
    main_date: mainDate,
    main_amount: mainAmount,
    main_action: mainAction
  };
}

function normalizeMainDate(value) {
  if (!value || typeof value !== "object") return null;
  const date = cleanText(value.date);
  if (!date || /non trouvée|non trouvé|incertitude/i.test(date)) {
    return null;
  }
  return {
    date,
    label: cleanText(value.label) || "Date importante",
    meaning: cleanText(value.meaning || value.context)
  };
}

function normalizeMainAmount(value) {
  if (!value || typeof value !== "object") return null;
  const amount = cleanText(value.value);
  if (!amount || /non trouvée|non trouvé|incertitude/i.test(amount)) {
    return null;
  }
  return {
    value: amount,
    label: cleanText(value.label) || "Montant important",
    meaning: cleanText(value.meaning || value.label)
  };
}

function normalizeMainAction(value) {
  if (!value || typeof value !== "object") return null;
  const action = cleanText(value.action);
  if (
    !action ||
    /aucune action|non trouvée|information non/i.test(action)
  ) {
    return null;
  }
  return {
    action,
    how: cleanText(value.how)
  };
}

function pickMainDate(dates, deadlines, documentType) {
  const type = cleanText(documentType).toLowerCase();
  const pool = [
    ...(Array.isArray(deadlines)
      ? deadlines.map((item) => ({
          ...item,
          type: item.type || "deadline"
        }))
      : []),
    ...(Array.isArray(dates) ? dates : [])
  ].filter((item) => item?.date && !SECONDARY_DATE_TYPES.has(item.type));

  if (!pool.length) return null;

  const ranked = pool.slice().sort((a, b) => {
    return datePriority(b, type) - datePriority(a, type);
  });

  const best = ranked[0];
  if (!best || datePriority(best, type) < 20) {
    return null;
  }

  return {
    date: best.date,
    label: best.label || mapDateTypeLabel(best.type),
    meaning: best.meaning || best.context || ""
  };
}

function datePriority(item, documentType) {
  const type = item.type || normalizeDateType(item.label);
  const blob = `${item.label || ""} ${item.meaning || ""} ${item.context || ""}`.toLowerCase();
  let score = item.confidence || 50;

  if (PRIMARY_DATE_TYPES.has(type)) score += 40;
  if (SECONDARY_DATE_TYPES.has(type)) score -= 50;

  if (/assemblée|assemblee|copropriété|convocation/.test(documentType)) {
    if (type === "meeting_date" || /assemblée|ag\b/.test(blob)) score += 50;
    if (type === "historical" || type === "legal_mention") score -= 60;
  }

  if (/quittance|loyer/.test(documentType)) {
    if (type === "period") score += 45;
    if (type === "payment_date") score += 25;
    if (type === "letter_date" || type === "issue_date") score -= 10;
  }

  if (/facture|avoir|devis/.test(documentType)) {
    if (type === "deadline" || type === "due_date") score += 45;
    if (type === "legal_mention") score -= 40;
  }

  if (/liasse|2031|fiscal|déclaration/.test(documentType)) {
    if (type === "period") score += 40;
    if (type === "deadline") score += 30;
    if (type === "table_date" || type === "historical") score -= 40;
  }

  if (/limite|échéance|avant le|rendez-vous|assemblée/.test(blob)) {
    score += 15;
  }

  if (/rôle non|non déterminé|date trouvée/.test(blob)) {
    score -= 80;
  }

  return score;
}

function selectDisplayDates(dates, deadlines, documentType) {
  const main = pickMainDate(dates, deadlines, documentType);
  const type = cleanText(documentType).toLowerCase();

  const selected = [];
  const seen = new Set();

  const push = (item) => {
    if (!item?.date) return;
    const key = `${normalizeDateKey(item.date)}|${item.type || ""}`;
    if (seen.has(key)) return;
    if (SECONDARY_DATE_TYPES.has(item.type) && selected.length >= 1) return;
    if (/rôle non|non déterminé|date trouvée/i.test(`${item.label} ${item.meaning} ${item.context}`)) {
      return;
    }
    seen.add(key);
    selected.push(item);
  };

  if (main) {
    const match =
      dates.find(
        (item) =>
          normalizeDateKey(item.date) === normalizeDateKey(main.date)
      ) || {
        date: main.date,
        type: normalizeDateType(main.label),
        label: main.label,
        meaning: main.meaning,
        context: main.meaning,
        page: "",
        confidence: 80
      };
    push(match);
  }

  for (const item of dates) {
    if (selected.length >= 3) break;
    if (!PRIMARY_DATE_TYPES.has(item.type) && item.type !== "issue_date" && item.type !== "letter_date") {
      continue;
    }
    // Quittance : privilégier période
    if (/quittance|loyer/.test(type) && !["period", "payment_date", "issue_date"].includes(item.type)) {
      continue;
    }
    // Liasse : éviter le bruit de dates de tableau
    if (/liasse|2031|fiscal/.test(type) && ["table_date", "historical", "other"].includes(item.type)) {
      continue;
    }
    push(item);
  }

  return selected;
}

function selectDisplayAmounts(amounts, documentType) {
  const type = cleanText(documentType).toLowerCase();

  if (/liasse|2031|déclaration de résultats|formulaire fiscal/.test(type)) {
    return amounts
      .filter(
        (item) =>
          ["to_pay", "tax", "total"].includes(item.kind) &&
          item.confidence >= 70
      )
      .slice(0, 3);
  }

  return amounts
    .filter((item) => {
      if (SECONDARY_AMOUNT_KINDS.has(item.kind) && item.kind !== "vat") {
        return false;
      }
      if (/montant trouvé|rôle non|non déterminé|non suffisamment clair/i.test(
        `${item.label} ${item.context}`
      )) {
        return false;
      }
      return item.confidence >= 50;
    })
    .slice(0, 6);
}

function limitTablesForDocument(tables, documentType) {
  const type = cleanText(documentType).toLowerCase();
  if (!Array.isArray(tables)) return [];

  // Liasse fiscale : garder au plus 1 aperçu de structure, pas le dump
  if (/liasse|2031|déclaration de résultats/.test(type)) {
    return tables.slice(0, 1).map((table) => ({
      ...table,
      rows: Array.isArray(table.rows) ? table.rows.slice(0, 6) : []
    }));
  }

  return tables.slice(0, 4);
}

function sanitizeDocumentType(
  rawType,
  identificationLevel,
  family,
  userSummary
) {
  const fromSummary = cleanText(userSummary?.document_label);
  let type = cleanText(rawType) || fromSummary;

  if (!type) {
    return "Document non identifié";
  }

  // Empêche qu’une rubrique fiscale isolée devienne le type
  if (isFiscalRubricLabel(type) && !/liasse|2031|cerfa|déclaration|formulaire/i.test(type)) {
    if (fromSummary && !isFiscalRubricLabel(fromSummary)) {
      type = fromSummary;
    } else if (/fiscal|formulaire|liasse/i.test(cleanText(family))) {
      type = "Liasse fiscale / déclaration de résultats";
    } else {
      type = `Document fiscal — ${type}`;
    }
  }

  const level = normalizeIdentificationLevel(identificationLevel, type);

  if (
    level === "probable" &&
    !/^ce document semble/i.test(type) &&
    !/non identifié/i.test(type)
  ) {
    return `Ce document semble être : ${type}`;
  }

  return type;
}

function isFiscalRubricLabel(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return false;
  if (/liasse|2031|cerfa|déclaration de|formulaire|avis d['’]?impôt/.test(text)) {
    return false;
  }
  return /^(bénéfices professionnels|bénéfices industriels|bic|bnc|charges|recettes|immobilisations|amortissements|résultat fiscal|tva collectée|tva déductible)$/i.test(
    text
  );
}

function normalizeIdentificationLevel(value, documentType) {
  const text = cleanText(value).toLowerCase();
  if (["strong", "probable", "unknown"].includes(text)) return text;
  if (/non identifié|inconnu|unknown/i.test(documentType)) return "unknown";
  if (/semble être|probable|possiblement/i.test(documentType)) return "probable";
  return "strong";
}

function filterNoisyWarnings(warnings) {
  for (let i = warnings.length - 1; i >= 0; i -= 1) {
    if (isNoisyUserPoint(warnings[i])) {
      warnings.splice(i, 1);
    }
  }
}

function isNoisyUserPoint(text) {
  return /date trouvée|montant trouvé|rôle non déterminé|rôle n['’]?est pas suffisamment|n['’]?est pas suffisamment clair|information incertaine/i.test(
    text || ""
  );
}

function normalizeDateKey(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";

  const numeric = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    let year = numeric[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const months = {
    janvier: "01",
    fevrier: "02",
    février: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    août: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
    décembre: "12"
  };

  const verbal = text.match(
    /(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})/i
  );
  if (verbal) {
    const day = verbal[1].padStart(2, "0");
    const monthName = verbal[2]
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const monthKey = Object.keys(months).find(
      (key) =>
        key
          .normalize("NFD")
          .replace(/\p{M}/gu, "") === monthName ||
        key === verbal[2].toLowerCase()
    );
    const month = months[verbal[2].toLowerCase()] || months[monthKey] || "00";
    return `${verbal[3]}-${month}-${day}`;
  }

  return text;
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase();
}

export {
  mapDateTypeLabel,
  mapAmountKindLabel,
  normalizeDateType,
  normalizeAmountKind,
  inferRefType,
  parseFrenchAmount,
  buildUserSummary,
  pickMainDate,
  selectDisplayDates,
  selectDisplayAmounts,
  sanitizeDocumentType,
  normalizeDateKey
};
