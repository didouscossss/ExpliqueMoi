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
  "table_date",
  "handwritten_date",
  "other"
]);

const AMOUNT_KINDS = new Set([
  "to_pay",
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

  const primaryAmount = pickPrimaryAmount(amounts, source.amount);
  const legacyDates = dates.slice(0, 12).map((item) => ({
    date: item.date,
    label: item.label || mapDateTypeLabel(item.type),
    meaning: item.context || item.meaning || ""
  }));

  const legacyAmountsDetail = amounts.slice(0, 20).map((item) => ({
    label: item.label || mapAmountKindLabel(item.kind),
    value: item.value,
    kind: mapAmountKindLegacy(item.kind),
    page: item.page || ""
  }));

  const entities = mergeEntities(source.entities, persons, references);

  return {
    document_type:
      cleanText(source.document_type) || "Document non identifié",
    issuer: cleanText(source.issuer) || pickIssuer(persons),
    plain_summary:
      cleanText(source.plain_summary) ||
      "C’est un document dont l’objet n’a pas été identifié avec certitude.",
    request:
      cleanText(source.request) ||
      "Information non trouvée avec certitude",
    why_received:
      cleanText(source.why_received) ||
      "Information non trouvée avec certitude",
    urgency: {
      level: ["none", "soon", "urgent", "uncertain"].includes(
        source.urgency?.level
      )
        ? source.urgency.level
        : inferUrgencyLevel(deadlines, risks),
      message:
        cleanText(source.urgency?.message) ||
        "Le niveau d’urgence n’a pas été déterminé."
    },
    actions: actions.slice(0, 6).map((item) => ({
      action: item.action,
      how: item.how || "",
      page: item.page || "",
      context: item.context || "",
      confidence: item.confidence
    })),
    // Legacy + enrichi
    dates: legacyDates,
    timeline: normalizeTimeline(source.timeline, dates),
    amount: primaryAmount,
    amounts_detail: legacyAmountsDetail,
    tables,
    entities,
    evidence: Array.isArray(source.evidence)
      ? source.evidence.slice(0, 10)
      : [],
    confidence,
    reading_quality: readingQuality,
    warnings,
    page_errors: pageErrors,
    heterogeneous,
    batch_heterogeneous: heterogeneous,
    // Nouvelle structure propre
    amounts,
    references,
    persons,
    deadlines,
    requiredDocuments,
    risks,
    contradictions,
    enriched_dates: dates
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

  return dedupeBy(
    result,
    (item) => `${item.date}|${item.type}|${item.page}`
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

function pickPrimaryAmount(amounts, fallback) {
  const preferred =
    amounts.find((item) => item.kind === "to_pay") ||
    amounts.find((item) => item.kind === "ttc") ||
    amounts.find((item) => item.kind === "total") ||
    amounts[0];

  if (preferred) {
    return {
      value: preferred.value,
      meaning: preferred.label || preferred.context || mapAmountKindLabel(preferred.kind)
    };
  }

  return {
    value:
      cleanText(fallback?.value) ||
      "Information non trouvée avec certitude",
    meaning: cleanText(fallback?.meaning) || ""
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

function inferUrgencyLevel(deadlines, risks) {
  if (risks.some((item) => item.severity === "high")) {
    return "urgent";
  }
  if (deadlines.length) {
    return "soon";
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
  if (/rendez[- ]?vous|rdv|appointment/.test(text)) return "appointment";
  if (/période|periode|period|du .* au/.test(text)) return "period";
  if (/délai|delai|delay/.test(text)) return "delay";
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
  if (/rembours/.test(text)) return "refund";
  if (/salaire|net à payer|brut/.test(text)) return "salary";
  if (/allocation|aide|prestation/.test(text)) return "allowance";
  if (/impôt|impot|fiscal|taxe(?!.*tva)/.test(text)) return "tax";
  if (/\btva\b|vat/.test(text)) return "vat";
  if (/\bht\b/.test(text)) return "ht";
  if (/\bttc\b/.test(text)) return "ttc";
  if (/acompte|deposit/.test(text)) return "deposit";
  if (/pénalité|penalit|majoration|amende/.test(text)) return "penalty";
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
    table_date: "Date (tableau)",
    handwritten_date: "Date manuscrite",
    other: "Date"
  };
  return labels[type] || "Date";
}

function mapAmountKindLabel(kind) {
  const labels = {
    to_pay: "Montant à payer",
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

export {
  mapDateTypeLabel,
  mapAmountKindLabel,
  normalizeDateType,
  normalizeAmountKind,
  inferRefType,
  parseFrenchAmount
};
