/**
 * Scoring cross-document explicable — V4-R.
 * Règles fortes / rejects dominent un seuil numérique opaque.
 */

import type {
  CandidateDocumentFact,
  CaseYearRelation,
  CrossMatchVerdict,
  InformationRequirement,
  MatchScoreBreakdown,
  RequirementFactMatcher
} from "../../../../types/knowledge.js";

export interface ScoredFactMatch {
  fact: CandidateDocumentFact;
  breakdown: MatchScoreBreakdown;
  verdict: CrossMatchVerdict;
}

export function scoreFactForRequirement(
  requirement: InformationRequirement,
  fact: CandidateDocumentFact,
  options?: {
    targetYear?: number | null;
    expectedRole?: string | null;
  }
): ScoredFactMatch {
  const contributions: MatchScoreBreakdown["contributions"] = [];
  const rejectReasons: string[] = [];

  let documentTypeMatch = 0;
  let yearMatch = 0;
  let roleMatch = 0;
  let factTypeMatch = 0;
  let keywordMatch = 0;
  let fieldEvidenceMatch = 0;

  const matchers = requirement.factMatchers || [];
  const matcher = matchers[0] || ({ factTypes: [] } as RequirementFactMatcher);

  const docType = (fact.documentType || "").toLowerCase();
  const blob = [
    fact.displayValue || "",
    fact.provenanceNote || "",
    fact.sourceDocumentLabel || "",
    String(fact.value ?? "")
  ]
    .join(" ")
    .toLowerCase();

  // REJECT RULES (dominent)
  for (const bad of matcher.rejectDocumentTypes || []) {
    if (docType === bad.toLowerCase() || docType.includes(bad.toLowerCase())) {
      rejectReasons.push(`reject:documentType:${bad}`);
    }
  }
  for (const kw of matcher.rejectKeywords || []) {
    if (blob.includes(kw.toLowerCase())) {
      rejectReasons.push(`reject:keyword:${kw}`);
    }
  }
  if (/facture|sku|bon de commande|total ttc/.test(blob) && docType.includes("invoice")) {
    rejectReasons.push("reject:non_fiscal_invoice_context");
  }
  if (
    options?.targetYear != null &&
    fact.year != null &&
    fact.year !== options.targetYear
  ) {
    rejectReasons.push(`reject:yearMismatch:${fact.year}!=${options.targetYear}`);
  }
  if (
    options?.expectedRole &&
    fact.declarantRole &&
    options.expectedRole !== "household" &&
    options.expectedRole !== "unknown" &&
    fact.declarantRole !== options.expectedRole &&
    requirement.kind === "amount"
  ) {
    rejectReasons.push(
      `reject:roleMismatch:${fact.declarantRole}!=${options.expectedRole}`
    );
  }
  if (
    requirement.expectedValueType === "amount" &&
    fact.factType === "declarantRole"
  ) {
    rejectReasons.push("reject:wrong_value_type");
  }
  if (
    requirement.kind === "amount" &&
    matcher.fieldCodeHints?.length &&
    fact.fieldCode &&
    !matcher.fieldCodeHints.some(
      (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
    )
  ) {
    // montant d’une autre case — reject fort pour amount blocking
    if (requirement.blocking) {
      rejectReasons.push(`reject:fieldCodeMismatch:${fact.fieldCode}`);
    }
  }

  if (rejectReasons.length) {
    const breakdown: MatchScoreBreakdown = {
      documentTypeMatch: 0,
      yearMatch: 0,
      roleMatch: 0,
      factTypeMatch: 0,
      keywordMatch: 0,
      fieldEvidenceMatch: 0,
      rejectReasons,
      contributions: rejectReasons.map((r) => ({
        key: "reject",
        value: 0,
        note: r
      }))
    };
    return { fact, breakdown, verdict: "rejected" };
  }

  // Positive contributions
  const typeOk =
    matcher.factTypes.includes(fact.factType) ||
    (matcher.factTypes.includes("amount") && fact.factType === "fieldValue") ||
    (matcher.factTypes.includes("fieldValue") && fact.factType === "amount") ||
    (matcher.factTypes.includes("taxCertificate") &&
      (fact.factType === "documentPresence" || fact.factType === "taxCertificate"));
  if (typeOk) {
    factTypeMatch = 1;
    contributions.push({
      key: "factTypeMatch",
      value: 1,
      note: `factType:${fact.factType}`
    });
  }

  if (matcher.documentTypeHints?.length && fact.documentType) {
    if (
      matcher.documentTypeHints.some(
        (h) => docType === h.toLowerCase() || docType.includes(h.toLowerCase())
      )
    ) {
      documentTypeMatch = 1;
      contributions.push({
        key: "documentTypeMatch",
        value: 1,
        note: `documentType:${fact.documentType}`
      });
    }
  }

  const yr = yearRelationFor(options?.targetYear ?? null, fact.year);
  if (yr === "sameYear") {
    yearMatch = 1;
    contributions.push({ key: "yearMatch", value: 1, note: "sameYear" });
  } else if (yr === "yearUnknown") {
    yearMatch = 0.3;
    contributions.push({ key: "yearMatch", value: 0.3, note: "yearUnknown" });
  } else if (yr === "yearStable") {
    yearMatch = 0.6;
    contributions.push({ key: "yearMatch", value: 0.6, note: "yearStable" });
  }

  if (matcher.declarantRoleHints?.length && fact.declarantRole) {
    if (matcher.declarantRoleHints.includes(fact.declarantRole)) {
      roleMatch = 1;
      contributions.push({
        key: "roleMatch",
        value: 1,
        note: `role:${fact.declarantRole}`
      });
    }
  }

  if (matcher.keywords?.length) {
    const hit = matcher.keywords.some((k) => blob.includes(k.toLowerCase()));
    if (hit) {
      keywordMatch = 1;
      contributions.push({ key: "keywordMatch", value: 1, note: "keyword_hit" });
    }
  }

  if (
    matcher.fieldCodeHints?.length &&
    fact.fieldCode &&
    matcher.fieldCodeHints.some(
      (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
    )
  ) {
    fieldEvidenceMatch = 1;
    contributions.push({
      key: "fieldEvidenceMatch",
      value: 1,
      note: `field:${fact.fieldCode}`
    });
  }

  const breakdown: MatchScoreBreakdown = {
    documentTypeMatch,
    yearMatch,
    roleMatch,
    factTypeMatch,
    keywordMatch,
    fieldEvidenceMatch,
    rejectReasons: [],
    contributions
  };

  // Règles fortes dominent
  if (fieldEvidenceMatch === 1 && factTypeMatch === 1 && yearMatch >= 0.6) {
    return { fact, breakdown, verdict: "strong" };
  }
  if (
    requirement.kind === "documentPresence" &&
    (keywordMatch === 1 || documentTypeMatch === 1) &&
    yearMatch >= 0.3
  ) {
    return {
      fact,
      breakdown,
      verdict: yearMatch === 1 ? "strong" : "candidate"
    };
  }
  if (fact.factType === "fiscalYear" && factTypeMatch === 1) {
    return { fact, breakdown, verdict: "strong" };
  }
  if (factTypeMatch !== 1) {
    // Sans alignement de type de fait, ne pas créer de bruit « ambiguous »
    return {
      fact,
      breakdown: {
        ...breakdown,
        rejectReasons: ["reject:factType_required"],
        contributions: [
          ...contributions,
          { key: "reject", value: 0, note: "reject:factType_required" }
        ]
      },
      verdict: "rejected"
    };
  }
  if (keywordMatch === 1 || documentTypeMatch === 1 || fieldEvidenceMatch === 1) {
    return { fact, breakdown, verdict: "candidate" };
  }
  return { fact, breakdown, verdict: "candidate" };
}

export function findCandidateFactsForRequirementInCase(
  requirement: InformationRequirement,
  facts: readonly CandidateDocumentFact[],
  options?: { targetYear?: number | null; expectedRole?: string | null }
): {
  matches: ScoredFactMatch[];
  status: "found" | "missing" | "ambiguous" | "notChecked";
  verdict: CrossMatchVerdict;
  yearRelation: CaseYearRelation;
  aggregatedValue: null;
} {
  if (!requirement.factMatchers?.length) {
    return {
      matches: [],
      status: "notChecked",
      verdict: "rejected",
      yearRelation: "yearUnknown",
      aggregatedValue: null
    };
  }

  const matches = facts
    .map((f) => scoreFactForRequirement(requirement, f, options))
    .filter((m) => m.verdict !== "rejected");

  const yearRelation = deriveYearRelation(matches, options?.targetYear);

  if (!matches.length) {
    return {
      matches: [],
      status: "missing",
      verdict: "rejected",
      yearRelation,
      aggregatedValue: null
    };
  }

  const strong = matches.filter((m) => m.verdict === "strong");
  const ambiguous = matches.filter((m) => m.verdict === "ambiguous");
  const amountFacts = matches.filter(
    (m) =>
      (m.fact.factType === "amount" || m.fact.factType === "fieldValue") &&
      m.fact.displayValue != null
  );

  // Plusieurs montants distincts sans unique strong → ambiguous, jamais agrégé
  if (requirement.kind === "amount" && amountFacts.length > 1 && strong.length !== 1) {
    const values = new Set(
      amountFacts.map((m) => String(m.fact.displayValue || m.fact.value))
    );
    if (values.size > 1) {
      return {
        matches: matches.map((m) =>
          m.verdict === "strong" ? { ...m, verdict: "ambiguous" as const } : m
        ),
        status: "ambiguous",
        verdict: "ambiguous",
        yearRelation,
        aggregatedValue: null
      };
    }
  }

  // Un strong unique domine les candidats plus faibles
  if (strong.length === 1) {
    return {
      matches: strong,
      status: "found",
      verdict: "strong",
      yearRelation,
      aggregatedValue: null
    };
  }

  if (strong.length > 1) {
    return {
      matches: strong,
      status: "ambiguous",
      verdict: "ambiguous",
      yearRelation,
      aggregatedValue: null
    };
  }

  if (ambiguous.length || matches.length > 1) {
    return {
      matches,
      status: "ambiguous",
      verdict: "ambiguous",
      yearRelation,
      aggregatedValue: null
    };
  }

  return {
    matches,
    status: matches[0].verdict === "candidate" ? "ambiguous" : "found",
    verdict: matches[0].verdict,
    yearRelation,
    aggregatedValue: null
  };
}

function yearRelationFor(
  target: number | null,
  factYear: number | null
): CaseYearRelation {
  if (target == null || factYear == null) return "yearUnknown";
  if (target === factYear) return "sameYear";
  return "yearMismatch";
}

function deriveYearRelation(
  matches: ScoredFactMatch[],
  targetYear?: number | null
): CaseYearRelation {
  if (targetYear == null) return "yearUnknown";
  const years = matches.map((m) => m.fact.year).filter((y): y is number => y != null);
  if (!years.length) return "yearUnknown";
  if (years.every((y) => y === targetYear)) return "sameYear";
  if (years.some((y) => y !== targetYear)) return "yearMismatch";
  return "yearUnknown";
}
