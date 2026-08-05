/**
 * Normalisation et fusion des dates documentaires.
 */

export const DATE_TYPES = [
  "document_date",
  "issue_date",
  "reception_date",
  "deadline",
  "payment_date",
  "appointment_date",
  "start_date",
  "end_date",
  "period",
  "birth_date",
  "signature_date",
  "unknown"
];

const MONTHS_FR = {
  janvier: 1,
  janv: 1,
  février: 2,
  fevrier: 2,
  févr: 2,
  fevr: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  décembre: 12,
  decembre: 12,
  déc: 12,
  dec: 12
};

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  if (number > 0 && number <= 1) {
    return Math.round(number * 100);
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function inferType(label = "", meaning = "", rawType = "") {
  const hint = `${rawType} ${label} ${meaning}`.toLowerCase();

  if (/deadline|limite|avant le|échéance|echeance|délai|delai|répondre|repondre/.test(hint)) {
    return "deadline";
  }
  if (/paiement|prélèvement|prelevement|à payer|a payer|règlement|reglement/.test(hint)) {
    return "payment_date";
  }
  if (/rendez-vous|rdv|convocation|audience/.test(hint)) {
    return "appointment_date";
  }
  if (/naissance|birth/.test(hint)) {
    return "birth_date";
  }
  if (/signature|signé|signe/.test(hint)) {
    return "signature_date";
  }
  if (/réception|reception|reçu|recu/.test(hint)) {
    return "reception_date";
  }
  if (/émission|emission|édition|edition|issue|courrier|lettre|document/.test(hint)) {
    return "document_date";
  }
  if (/début|debut|start|à compter|a compter/.test(hint)) {
    return "start_date";
  }
  if (/fin|end|jusqu/.test(hint)) {
    return "end_date";
  }
  if (/période|periode|du .* au|trimestre/.test(hint)) {
    return "period";
  }

  return DATE_TYPES.includes(rawType) ? rawType : "unknown";
}

/**
 * Parse une date FR/ISO sans inventer d’année absente.
 * @returns {{ normalized: string|null, needsYear: boolean }}
 */
export function parseFlexibleDate(raw) {
  const text = clean(raw);

  if (!text) {
    return { normalized: null, needsYear: false };
  }

  // ISO YYYY-MM-DD
  let match = text.match(/\b(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    return {
      normalized: iso(match[1], match[2], match[3]),
      needsYear: false
    };
  }

  // DD/MM/YYYY or DD-MM-YYYY
  match = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|19\d{2})\b/);
  if (match) {
    return {
      normalized: iso(match[3], match[2], match[1]),
      needsYear: false
    };
  }

  // DD/MM without year — do NOT invent year
  match = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})\b(?![\/\-.]\d)/);
  if (match) {
    return { normalized: null, needsYear: true };
  }

  // "5 août 2026" / "15 septembre 2026"
  match = text.match(
    /\b(\d{1,2}|1er)\s+([A-Za-zéèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]+)\s+(20\d{2}|19\d{2})\b/i
  );
  if (match) {
    const day = match[1].toLowerCase() === "1er" ? 1 : Number(match[1]);
    const month = MONTHS_FR[normalizeMonthKey(match[2])];
    if (month && day >= 1 && day <= 31) {
      return {
        normalized: iso(match[3], month, day),
        needsYear: false
      };
    }
  }

  // "avant le 15 septembre" without year
  match = text.match(
    /\b(\d{1,2}|1er)\s+([A-Za-zéèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]+)\b(?!\s*(?:20|19)\d{2})/i
  );
  if (match && MONTHS_FR[normalizeMonthKey(match[2])]) {
    return { normalized: null, needsYear: true };
  }

  return { normalized: null, needsYear: false };
}

function normalizeMonthKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "");
}

function iso(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(Number(month)).padStart(2, "0");
  const d = String(Number(day)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseRelative(raw) {
  const text = clean(raw).toLowerCase();

  let match = text.match(
    /(?:sous|dans(?:\s+un)?\s+délai\s+de|dans|sous\s+un\s+délai\s+de)\s+(\d+)\s+(jours?|jours?|semaines?|mois)/i
  );
  if (!match) {
    match = text.match(/\b(\d+)\s+(jours?|semaines?|mois)\b/i);
  }

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unitRaw = match[2].toLowerCase();
  let unit = "days";

  if (/semaine/.test(unitRaw)) unit = "weeks";
  if (/mois/.test(unitRaw)) unit = "months";

  return {
    relativeValue: value,
    relativeUnit: unit,
    needsUserConfirmation: true
  };
}

/**
 * Normalise une liste de dates (Gemini / legacy / enrichie).
 */
export function normalizeDateEntries(rawDates = [], options = {}) {
  const max = Number(options.max) > 0 ? Number(options.max) : 40;
  const sourceHint = clean(options.defaultSource) || null;

  if (!Array.isArray(rawDates)) {
    return [];
  }

  return rawDates
    .slice(0, max)
    .map((item) => normalizeOneDate(item, sourceHint))
    .filter((item) => item && (item.raw || item.normalized || item.relativeValue));
}

function normalizeOneDate(item, sourceHint) {
  if (!item || typeof item !== "object") {
    if (typeof item === "string" && clean(item)) {
      return normalizeOneDate({ raw: item, date: item }, sourceHint);
    }
    return null;
  }

  const raw = clean(item.raw || item.date || item.value || item.text);
  const label = clean(item.label || item.role || item.type_label);
  const meaning = clean(item.meaning || item.context || item.explication);
  const context = clean(item.context || item.meaning || meaning);
  const page = item.page != null && item.page !== ""
    ? Number(item.page) || clean(String(item.page))
    : null;
  const source = clean(item.source) || sourceHint || null;
  const type = inferType(label, meaning, clean(item.type));

  const relative =
    item.relativeValue != null
      ? {
          relativeValue: Number(item.relativeValue),
          relativeUnit: clean(item.relativeUnit) || "days",
          needsUserConfirmation: item.needsUserConfirmation !== false
        }
      : parseRelative(raw) || parseRelative(`${label} ${meaning}`);

  const parsed = parseFlexibleDate(raw);
  let normalized =
    clean(item.normalized) ||
    parsed.normalized ||
    null;

  // Ne jamais inventer une année
  if (parsed.needsYear) {
    normalized = null;
  }

  if (relative && !normalized) {
    return {
      raw: raw || clean(`${relative.relativeValue} ${relative.relativeUnit}`),
      normalized: null,
      type: type === "unknown" ? "deadline" : type,
      label: label || "Délai relatif",
      page,
      source: source || "paragraphe",
      context,
      confidence: normalizeConfidence(item.confidence) || 70,
      relativeValue: relative.relativeValue,
      relativeUnit: relative.relativeUnit,
      referenceDate: clean(item.referenceDate) || null,
      needsUserConfirmation: true,
      // compat UI legacy
      date: raw || `${relative.relativeValue} ${relative.relativeUnit}`,
      meaning: context || meaning
    };
  }

  if (!raw && !normalized) {
    return null;
  }

  return {
    raw: raw || normalized,
    normalized,
    type,
    label: label || defaultLabel(type),
    page,
    source: source || "paragraphe",
    context,
    confidence: normalizeConfidence(item.confidence) || (normalized ? 90 : 70),
    relativeValue: null,
    relativeUnit: null,
    referenceDate: null,
    needsUserConfirmation: Boolean(item.needsUserConfirmation) || parsed.needsYear,
    date: raw || normalized,
    meaning: context || meaning
  };
}

function defaultLabel(type) {
  switch (type) {
    case "deadline":
      return "Date limite";
    case "payment_date":
      return "Date de paiement";
    case "appointment_date":
      return "Rendez-vous";
    case "document_date":
    case "issue_date":
      return "Date du document";
    case "start_date":
      return "Date de début";
    case "end_date":
      return "Date de fin";
    case "period":
      return "Période";
    default:
      return "Date";
  }
}

/**
 * Fusionne les dates de plusieurs chunks sans perdre les rôles distincts.
 */
export function mergeDates(chunkDates = []) {
  const flat = [];

  for (const entry of chunkDates) {
    if (Array.isArray(entry)) {
      flat.push(...normalizeDateEntries(entry));
    } else if (entry && typeof entry === "object") {
      const one = normalizeOneDate(entry, null);
      if (one) flat.push(one);
    }
  }

  const byKey = new Map();

  for (const date of flat) {
    const key = [
      date.normalized || clean(date.raw).toLowerCase(),
      date.type || "unknown",
      date.page == null ? "" : String(date.page)
    ].join("|");

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...date });
      continue;
    }

    // Garder la plus fiable ; fusionner contextes
    const keep =
      (date.confidence || 0) > (existing.confidence || 0) ? date : existing;
    const other = keep === date ? existing : date;

    // Ne pas remplacer une date précise par une vague
    if (existing.normalized && !date.normalized) {
      byKey.set(key, {
        ...existing,
        context: mergeText(existing.context, date.context),
        meaning: mergeText(existing.meaning, date.meaning),
        confidence: Math.max(existing.confidence || 0, date.confidence || 0)
      });
      continue;
    }

    byKey.set(key, {
      ...keep,
      context: mergeText(keep.context, other.context),
      meaning: mergeText(keep.meaning, other.meaning),
      label: keep.label || other.label,
      source: keep.source || other.source,
      confidence: Math.max(keep.confidence || 0, other.confidence || 0),
      normalized: keep.normalized || other.normalized,
      raw: preferPreciseRaw(keep, other)
    });
  }

  return [...byKey.values()]
    .sort((a, b) => {
      const an = a.normalized || "";
      const bn = b.normalized || "";
      if (an && bn && an !== bn) return an.localeCompare(bn);
      return (Number(a.page) || 0) - (Number(b.page) || 0);
    })
    .slice(0, 40);
}

function preferPreciseRaw(a, b) {
  if (a.normalized && !b.normalized) return a.raw;
  if (b.normalized && !a.normalized) return b.raw;
  return clean(a.raw).length >= clean(b.raw).length ? a.raw : b.raw;
}

function mergeText(a, b) {
  const left = clean(a);
  const right = clean(b);

  if (!left) return right;
  if (!right || left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left} — ${right}`.slice(0, 400);
}

/**
 * Extrais des dates depuis les cellules de tableaux.
 */
export function extractDatesFromTables(tables = []) {
  if (!Array.isArray(tables)) {
    return [];
  }

  const found = [];

  tables.forEach((table, tableIndex) => {
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const page = table?.page ?? null;
    const tableTitle = clean(table?.title);

    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;

      row.forEach((cell, colIndex) => {
        const value = clean(String(cell ?? ""));
        if (!value) return;

        const looksLikeDate =
          /\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?/.test(value) ||
          /\b(20\d{2}|19\d{2})-\d{1,2}-\d{1,2}\b/.test(value) ||
          /\b(\d{1,2}|1er)\s+[A-Za-zéèêàâùûôîç]+\s+20\d{2}\b/i.test(value) ||
          /sous\s+\d+|dans\s+un\s+délai|dans\s+\d+/i.test(value);

        if (!looksLikeDate) return;

        const column = clean(columns[colIndex]) || `Colonne ${colIndex + 1}`;
        const type = inferType(column, tableTitle, "");

        found.push({
          raw: value,
          type,
          label: column || tableTitle || "Date (tableau)",
          page,
          source: "tableau",
          context: `Tableau « ${tableTitle || tableIndex + 1} », ligne ${rowIndex + 1}, ${column}`,
          confidence: 88,
          tableColumn: column,
          tableRow: rowIndex + 1,
          tableTitle: tableTitle || null
        });
      });
    });
  });

  return normalizeDateEntries(found);
}
