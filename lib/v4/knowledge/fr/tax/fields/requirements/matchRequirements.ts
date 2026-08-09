/**
 * Cross-match requirement ↔ document facts — déterministe, avec evidence.
 * Aucune agrégation automatique de montants.
 */

import type {
  CandidateDocumentFact,
  InformationRequirement,
  RequirementEvidenceLink,
  RequirementFactMatcher,
  RequirementStatus
} from "../../../../../types/knowledge.js";

export interface RequirementMatchResult {
  status: RequirementStatus;
  candidateFacts: CandidateDocumentFact[];
  evidenceLinks: RequirementEvidenceLink[];
  /** Toujours null — V4-Q refuse l’agrégation non modélisée. */
  aggregatedValue: null;
  matchNotes: string[];
}

export function findCandidateFactsForRequirement(
  requirement: InformationRequirement,
  facts: readonly CandidateDocumentFact[]
): RequirementMatchResult {
  const matchers = requirement.factMatchers || [];
  if (!matchers.length) {
    return {
      status: "notChecked",
      candidateFacts: [],
      evidenceLinks: [],
      aggregatedValue: null,
      matchNotes: ["no_matcher"]
    };
  }

  const candidates: CandidateDocumentFact[] = [];
  const links: RequirementEvidenceLink[] = [];
  const notes: string[] = [];

  for (const fact of facts) {
    for (const matcher of matchers) {
      const verdict = scoreFactAgainstMatcher(fact, matcher, requirement);
      if (!verdict) continue;
      if (candidates.some((c) => c.factId === fact.factId)) {
        // enrich link only
      } else {
        candidates.push(fact);
      }
      links.push({
        requirementId: requirement.id,
        factId: fact.factId,
        confidence: verdict.confidence,
        evidence: fact.evidence || [],
        matchReason: verdict.reason,
        status: verdict.status
      });
      notes.push(verdict.reason);
    }
  }

  if (!candidates.length) {
    return {
      status: "missing",
      candidateFacts: [],
      evidenceLinks: [],
      aggregatedValue: null,
      matchNotes: ["no_candidate_in_analyzed_materials"]
    };
  }

  const strong = links.filter((l) => l.status === "strong");
  const ambiguous = links.filter((l) => l.status === "ambiguous");
  const amounts = candidates.filter(
    (c) =>
      c.factType === "amount" ||
      c.factType === "fieldValue" ||
      typeof c.value === "number"
  );

  // Plusieurs montants candidats sans règle d’agrégation → ambiguous, jamais sommé
  if (
    requirement.kind === "amount" &&
    amounts.length > 1 &&
    strong.length !== 1
  ) {
    return {
      status: "ambiguous",
      candidateFacts: candidates,
      evidenceLinks: links.map((l) =>
        l.status === "strong" ? { ...l, status: "ambiguous" as const } : l
      ),
      aggregatedValue: null,
      matchNotes: [...notes, "multiple_amounts_no_aggregation"]
    };
  }

  if (ambiguous.length && !strong.length) {
    return {
      status: "ambiguous",
      candidateFacts: candidates,
      evidenceLinks: links,
      aggregatedValue: null,
      matchNotes: [...notes, "only_ambiguous_matches"]
    };
  }

  if (requirement.kind === "amount") {
    const emptyOnly = candidates.every(
      (c) => c.value == null || c.displayValue == null
    );
    if (emptyOnly) {
      return {
        status: "missing",
        candidateFacts: candidates,
        evidenceLinks: links,
        aggregatedValue: null,
        matchNotes: [...notes, "present_empty_not_amount"]
      };
    }
    // Mauvais type : booléen / texte non numérique
    const typedWrong = candidates.every((c) => {
      if (typeof c.value === "number") return false;
      if (typeof c.value === "string" && /\d/.test(c.value)) return false;
      return c.factType === "declarantRole" || c.factType === "documentPresence";
    });
    if (typedWrong && !strong.length) {
      return {
        status: "ambiguous",
        candidateFacts: candidates,
        evidenceLinks: links,
        aggregatedValue: null,
        matchNotes: [...notes, "wrong_value_type"]
      };
    }
  }

  if (strong.length >= 1) {
    return {
      status: "found",
      candidateFacts: candidates,
      evidenceLinks: links,
      aggregatedValue: null,
      matchNotes: notes
    };
  }

  // Candidats seuls
  return {
    status: "ambiguous",
    candidateFacts: candidates,
    evidenceLinks: links,
    aggregatedValue: null,
    matchNotes: [...notes, "candidate_only"]
  };
}

function scoreFactAgainstMatcher(
  fact: CandidateDocumentFact,
  matcher: RequirementFactMatcher,
  requirement: InformationRequirement
): {
  confidence: number;
  reason: string;
  status: "candidate" | "strong" | "ambiguous";
} | null {
  const docType = (fact.documentType || "").toLowerCase();
  const blob = [
    fact.displayValue || "",
    fact.provenanceNote || "",
    fact.sourceDocumentLabel || "",
    String(fact.value ?? "")
  ]
    .join(" ")
    .toLowerCase();

  for (const bad of matcher.rejectDocumentTypes || []) {
    if (docType === bad.toLowerCase() || docType.includes(bad.toLowerCase())) {
      return null;
    }
  }
  for (const kw of matcher.rejectKeywords || []) {
    if (blob.includes(kw.toLowerCase())) return null;
  }

  if (!matcher.factTypes.includes(fact.factType)) {
    // fieldValue peut servir d’amount
    if (
      !(
        matcher.factTypes.includes("amount") &&
        fact.factType === "fieldValue"
      ) &&
      !(
        matcher.factTypes.includes("fieldValue") &&
        fact.factType === "amount"
      ) &&
      !(
        matcher.factTypes.includes("taxCertificate") &&
        fact.factType === "documentPresence"
      )
    ) {
      return null;
    }
  }

  let score = 0.4;
  const reasons: string[] = [`factType:${fact.factType}`];

  if (matcher.fieldCodeHints?.length) {
    if (
      fact.fieldCode &&
      matcher.fieldCodeHints.some(
        (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
      )
    ) {
      score += 0.35;
      reasons.push("fieldCode_match");
    } else if (fact.fieldCode) {
      // mauvais code — rejeter pour requirements amount ciblés
      if (requirement.kind === "amount" && requirement.blocking) {
        return null;
      }
      score -= 0.2;
      reasons.push("fieldCode_mismatch");
    }
  }

  if (matcher.documentTypeHints?.length) {
    if (
      fact.documentType &&
      matcher.documentTypeHints.some(
        (h) =>
          docType === h.toLowerCase() || docType.includes(h.toLowerCase())
      )
    ) {
      score += 0.15;
      reasons.push("documentType_match");
    }
  }

  if (matcher.declarantRoleHints?.length) {
    if (
      fact.declarantRole &&
      matcher.declarantRoleHints.includes(fact.declarantRole)
    ) {
      score += 0.1;
      reasons.push("declarant_match");
    } else if (fact.declarantRole && requirement.kind === "declarantRole") {
      reasons.push("declarant_candidate");
    }
  }

  if (matcher.yearRequired) {
    if (fact.year != null || fact.factType === "fiscalYear") {
      score += 0.2;
      reasons.push("year_present");
    } else {
      return null;
    }
  }

  if (matcher.keywords?.length) {
    const hit = matcher.keywords.some((k) => blob.includes(k.toLowerCase()));
    if (hit) {
      score += 0.15;
      reasons.push("keyword_hit");
    } else if (
      requirement.kind === "documentPresence" &&
      !matcher.fieldCodeHints?.length
    ) {
      // sans mot-clé ni code, type document peut suffire
      if (!matcher.documentTypeHints?.length) return null;
    }
  }

  score = Math.max(0, Math.min(0.95, score));
  if (score < 0.45) return null;

  let status: "candidate" | "strong" | "ambiguous" = "candidate";
  if (score >= 0.75 && reasons.includes("fieldCode_match")) status = "strong";
  else if (
    score >= 0.7 &&
    (fact.factType === "fiscalYear" || fact.factType === "declarantRole")
  ) {
    status = "strong";
  } else if (
    score >= 0.7 &&
    requirement.kind === "documentPresence" &&
    (reasons.includes("keyword_hit") || reasons.includes("documentType_match"))
  ) {
    status = "strong";
  } else if (score < 0.6) {
    status = "ambiguous";
  }

  return {
    confidence: score,
    reason: reasons.join("+"),
    status
  };
}

/** Refuse explicitement toute somme de candidats. */
export function refuseUnsafeAggregation(
  candidates: readonly CandidateDocumentFact[]
): { aggregatedValue: null; refused: boolean; reason: string } {
  const numeric = candidates.filter(
    (c) => typeof c.value === "number" || /\d/.test(String(c.value ?? ""))
  );
  if (numeric.length > 1) {
    return {
      aggregatedValue: null,
      refused: true,
      reason: "automaticUnsafeAggregation_refused"
    };
  }
  return { aggregatedValue: null, refused: false, reason: "n/a" };
}
