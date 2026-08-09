/**
 * Parsing déterministe des réponses utilisateur — V4-S.
 * Jamais d’invention silencieuse.
 */

import type {
  ClarificationAnswerStatus,
  ClarificationAnswerType
} from "../../../../types/knowledge.js";

export interface ParsedClarificationAnswer {
  rawAnswer: string;
  normalizedValue: string | number | boolean | null;
  valueType: ClarificationAnswerType;
  status: ClarificationAnswerStatus;
  parseNotes: string[];
}

const UNKNOWN_RE =
  /^(je\s+ne\s+sais\s+pas|je\s+sais\s+pas|jsp|inconnu|aucune\s+id[eé]e|ne\s+sais\s+pas)$/i;
const REFUSED_RE =
  /^(je\s+pr[eé]f[eè]re\s+ne\s+pas\s+r[eé]pondre|passer|skip|passer\s+cette\s+question)$/i;
const YES_RE = /^(oui|yes|o|y|true|vrai)$/i;
const NO_RE = /^(non|no|n|false|faux)$/i;

export function parseClarificationAnswer(
  raw: string,
  expected: ClarificationAnswerType
): ParsedClarificationAnswer {
  const rawAnswer = String(raw ?? "");
  const trimmed = rawAnswer.trim();
  const notes: string[] = [];

  if (!trimmed) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "unanswered",
      parseNotes: ["empty"]
    };
  }

  if (UNKNOWN_RE.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: "unknown",
      status: "unknown",
      parseNotes: ["explicit_unknown"]
    };
  }

  if (REFUSED_RE.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: "refused",
      status: "refused",
      parseNotes: ["explicit_refusal"]
    };
  }

  if (/environ|approx|~|vers\s+\d|environ\s+\d/i.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "ambiguous",
      parseNotes: ["approximate_language"]
    };
  }

  switch (expected) {
    case "amount":
    case "decimal":
      return parseAmount(rawAnswer, trimmed, expected, notes);
    case "integer":
    case "year": {
      const n = Number(trimmed.replace(/\s/g, ""));
      if (!Number.isInteger(n)) {
        return invalid(rawAnswer, expected, ["not_integer"]);
      }
      if (expected === "year" && (n < 1990 || n > 2100)) {
        return invalid(rawAnswer, expected, ["year_out_of_range"]);
      }
      return {
        rawAnswer,
        normalizedValue: n,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
    }
    case "boolean":
    case "yesNo": {
      if (YES_RE.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: true,
          valueType: expected,
          status: "accepted",
          parseNotes: ["yes"]
        };
      }
      if (NO_RE.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: false,
          valueType: expected,
          status: "accepted",
          parseNotes: ["no"]
        };
      }
      // « aucun » n’est mappé que pour yesNo si explicite non
      if (/^aucun(e)?$/i.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: null,
          valueType: expected,
          status: "ambiguous",
          parseNotes: ["aucun_not_safe_boolean"]
        };
      }
      return invalid(rawAnswer, expected, ["not_boolean"]);
    }
    case "declarant": {
      const map: Record<string, string> = {
        "1": "declarant1",
        "déclarant 1": "declarant1",
        "declarant 1": "declarant1",
        "declarant1": "declarant1",
        "2": "declarant2",
        "déclarant 2": "declarant2",
        "declarant 2": "declarant2",
        "declarant2": "declarant2",
        foyer: "household",
        "foyer fiscal": "household"
      };
      const key = trimmed.toLowerCase();
      if (map[key]) {
        return {
          rawAnswer,
          normalizedValue: map[key],
          valueType: "declarant",
          status: "accepted",
          parseNotes: ["declarant_mapped"]
        };
      }
      return invalid(rawAnswer, expected, ["unknown_declarant"]);
    }
    case "choice":
    case "text":
    case "document":
    case "date":
      return {
        rawAnswer,
        normalizedValue: trimmed,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
    default:
      return {
        rawAnswer,
        normalizedValue: trimmed,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
  }
}

function parseAmount(
  rawAnswer: string,
  trimmed: string,
  expected: ClarificationAnswerType,
  notes: string[]
): ParsedClarificationAnswer {
  // Ambiguïté FR: 32.450 peut être 32450 ou 32.45
  if (/^\d{1,3}\.\d{3}(\.\d{3})*$/.test(trimmed.replace(/\s/g, "").replace(/€/g, ""))) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "ambiguous",
      parseNotes: ["dot_thousands_ambiguous_fr"]
    };
  }
  const cleaned = trimmed
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\u00a0/g, "");
  // 32 450 or 32450 or 32450,00
  const fr = cleaned.replace(/(\d),(\d{2})$/, "$1.$2");
  if (!/^-?\d+([.,]\d+)?$/.test(fr.replace(/\./g, (m, off, s) => {
    // only allow one decimal sep at end
    return m;
  })) && !/^-?\d+$/.test(cleaned.replace(",", ""))) {
    // accept spaces already removed; allow 32450,50
  }
  const normalized = fr.includes(",") && !fr.match(/,\d{2}$/)
    ? null
    : Number(fr.replace(",", "."));
  if (normalized == null || !Number.isFinite(normalized)) {
    // try pure digits with spaces already stripped
    const digits = cleaned.replace(/[^\d.,-]/g, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
      return {
        rawAnswer,
        normalizedValue: null,
        valueType: expected,
        status: "ambiguous",
        parseNotes: ["dot_thousands_ambiguous_fr"]
      };
    }
    const n2 = Number(digits.replace(",", "."));
    if (!Number.isFinite(n2)) {
      return invalid(rawAnswer, expected, ["not_amount"]);
    }
    notes.push("amount_parsed");
    return {
      rawAnswer,
      normalizedValue: n2,
      valueType: expected,
      status: "accepted",
      parseNotes: notes
    };
  }
  notes.push("amount_parsed");
  return {
    rawAnswer,
    normalizedValue: normalized,
    valueType: expected,
    status: "accepted",
    parseNotes: notes
  };
}

function invalid(
  rawAnswer: string,
  expected: ClarificationAnswerType,
  notes: string[]
): ParsedClarificationAnswer {
  return {
    rawAnswer,
    normalizedValue: null,
    valueType: expected,
    status: "invalid",
    parseNotes: notes
  };
}
