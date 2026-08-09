/**
 * Évalue l’applicabilité fiscale d’une case — V4-T.
 * Knowledge ≠ DocumentFacts ≠ UserFacts ≠ Applicability.
 */

import type {
  CandidateDocumentFact,
  ClarificationSession,
  DocumentCase,
  DocumentInstance,
  FactConflict,
  TaxApplicabilityEvaluation,
  TaxApplicabilityInvariants,
  TaxApplicabilityRule,
  TaxApplicabilityStatus,
  UserProvidedFact
} from "../../../../types/knowledge.js";
import {
  evaluateCondition,
  type ConditionEvalContext
} from "./evaluateCondition.js";
import { getApplicabilityRulesForField } from "./rules.js";
import { explainTaxApplicability } from "./explainApplicability.js";
import { buildClarificationCandidatesFromApplicability } from "./bridgeClarification.js";

export function emptyApplicabilityInvariants(): TaxApplicabilityInvariants {
  return {
    knowledgePromotedToUserFact: 0,
    knowledgePromotedToDocumentFact: 0,
    documentFactPromotedToApplicabilityWithoutRule: 0,
    userFactPromotedToApplicabilityWithoutRule: 0,
    absencePromotedToNegative: 0,
    unsupportedApplicable: 0,
    unsupportedNotApplicable: 0,
    unsupportedEligibilityDecision: 0,
    supportingDocumentPromotedToEligibility: 0,
    crossYearApplicabilityPromotion: 0,
    crossRoleApplicabilityPromotion: 0,
    conflictAutoResolved: 0,
    unknownPromotedToKnown: 0,
    refusedPromotedToNegative: 0,
    automaticUnsafeAggregation: 0,
    applicabilityClarificationLoop: 0,
    uploadOrderChangesApplicability: 0,
    missingApplicabilityProvenance: 0
  };
}

export interface EvaluateApplicabilityInput {
  fieldCode: string;
  facts: readonly CandidateDocumentFact[];
  userFacts?: readonly UserProvidedFact[];
  conflicts?: readonly FactConflict[];
  documents?: readonly DocumentInstance[];
  documentTexts?: readonly string[];
  fieldCodesPresent?: readonly string[];
  yearsPresent?: readonly number[];
  targetYear?: number | null;
  clarificationSession?: ClarificationSession | null;
}

export function evaluateTaxFieldApplicability(
  input: EvaluateApplicabilityInput
): {
  evaluation: TaxApplicabilityEvaluation;
  invariants: TaxApplicabilityInvariants;
} {
  const invariants = emptyApplicabilityInvariants();
  const fieldCode = input.fieldCode.toUpperCase();
  const rules = getApplicabilityRulesForField(fieldCode);

  if (!rules.length) {
    return {
      invariants,
      evaluation: baseUnknown(
        fieldCode,
        "Les sources actuellement modélisées décrivent cette case, mais ne suffisent pas à déterminer son applicabilité à votre situation.",
        [
          "Aucune règle d’applicabilité vérifiée n’est modélisée pour cette case."
        ]
      )
    };
  }

  const evaluations = rules.map((rule) =>
    evaluateOneRule(rule, input, invariants)
  );

  const merged = mergeFieldEvaluations(fieldCode, evaluations, invariants);
  merged.clarificationQuestionCandidates =
    buildClarificationCandidatesFromApplicability(
      merged,
      input.clarificationSession || null,
      invariants
    );
  return { evaluation: merged, invariants };
}

export function evaluateDocumentCaseApplicability(
  docCase: DocumentCase
): {
  evaluations: TaxApplicabilityEvaluation[];
  invariants: TaxApplicabilityInvariants;
} {
  const codes = [
    ...new Set([
      ...docCase.taxContext.fieldCodesPresent,
      ...docCase.fieldAssistance.map((a) => a.fieldCode)
    ])
  ].sort();

  const invariants = emptyApplicabilityInvariants();
  const evaluations: TaxApplicabilityEvaluation[] = [];

  for (const code of codes) {
    const { evaluation, invariants: inv } = evaluateTaxFieldApplicability({
      fieldCode: code,
      facts: docCase.factIndex,
      userFacts: docCase.userAnswers,
      conflicts: docCase.conflicts,
      documents: docCase.documents,
      documentTexts: docCase.documents.map((d) => d.text || ""),
      fieldCodesPresent: docCase.taxContext.fieldCodesPresent,
      yearsPresent: docCase.taxContext.yearsPresent,
      targetYear:
        docCase.taxContext.yearsPresent.length === 1
          ? docCase.taxContext.yearsPresent[0]
          : null,
      clarificationSession: docCase.clarificationSession || null
    });
    evaluations.push(evaluation);
    mergeInv(invariants, inv);
  }

  // Guard: supporting document alone must never yield applicable for 7DB
  for (const ev of evaluations) {
    if (ev.fieldCode === "7DB" && ev.status === "applicable") {
      const onlySupport = ev.evidence.every(
        (e) =>
          /attestation|justificatif|supporting/i.test(e.detail) ||
          e.sourceKind === "officialKnowledge"
      );
      if (onlySupport || !ev.ruleId) {
        invariants.supportingDocumentPromotedToEligibility += 1;
        ev.status = "unknown";
        ev.headline =
          "Impossible à déterminer — un justificatif seul ne suffit pas à conclure.";
        ev.limits.push(
          "La présence d’un document support ne suffit pas à conclure qu’un avantage fiscal s’applique."
        );
      }
    }
  }

  return { evaluations, invariants };
}

function evaluateOneRule(
  rule: TaxApplicabilityRule,
  input: EvaluateApplicabilityInput,
  invariants: TaxApplicabilityInvariants
): TaxApplicabilityEvaluation {
  const fieldCode = rule.fieldCode;
  if (!rule.provenance?.length || !rule.sourceExcerpt) {
    invariants.missingApplicabilityProvenance += 1;
    return baseUnknown(
      fieldCode,
      "Impossible à déterminer — provenance de règle incomplète.",
      ["Provenance manquante — conclusion forte refusée."]
    );
  }

  const yearsPresent = input.yearsPresent || [];
  const yearRelation = deriveYearRelation(
    rule,
    yearsPresent,
    input.targetYear ?? null,
    invariants
  );

  if (yearRelation === "yearMismatch" && rule.yearPolicy === "exact") {
    invariants.crossYearApplicabilityPromotion += 0;
    return {
      ...baseUnknown(
        fieldCode,
        "Impossible à déterminer pour cette année — la règle modélisée ne s’applique pas automatiquement à un autre millésime.",
        ["Année incompatible avec la politique exacte de la règle."]
      ),
      ruleId: rule.ruleId,
      yearPolicy: rule.yearPolicy,
      yearRelation,
      sources: sourcesOf(rule)
    };
  }

  const ctx: ConditionEvalContext = {
    fieldCode,
    ruleId: rule.ruleId,
    facts: input.facts,
    userFacts: input.userFacts || [],
    conflicts: input.conflicts || [],
    documentTypes: (input.documents || []).map((d) => d.detectedType || ""),
    documentTexts:
      input.documentTexts ||
      (input.documents || []).map((d) => d.text || ""),
    fieldCodesPresent: input.fieldCodesPresent || [],
    yearsPresent,
    targetYear: input.targetYear ?? null,
    clarificationSession: input.clarificationSession || null
  };

  const cond = evaluateCondition(rule.conditions, ctx);

  // Role safety: requiredRole vs facts
  if (rule.requiredRole) {
    const cross = detectCrossRolePromotion(
      rule.requiredRole,
      fieldCode,
      input.facts,
      input.userFacts || []
    );
    if (cross) {
      invariants.crossRoleApplicabilityPromotion += 1;
    }
  }

  let status: TaxApplicabilityStatus = "unknown";
  const reasons: string[] = [];
  const satisfied: string[] = [];
  const unsatisfied: string[] = [];

  if (cond.result === "conflicted") {
    status = "conflicted";
    reasons.push(...cond.conflicts);
  } else if (cond.result === "true") {
    status = rule.effectWhenTrue;
    satisfied.push(cond.trace);
    reasons.push(rule.sourceExcerpt);
  } else if (cond.result === "false") {
    // false explicite seulement (jamais absence)
    status = rule.effectWhenFalse === "applicable"
      ? "applicable"
      : rule.effectWhenFalse === "notApplicable"
        ? "notApplicable"
        : rule.effectWhenFalse === "needsInformation"
          ? "needsInformation"
          : "unknown";
    unsatisfied.push(cond.trace);
    reasons.push(rule.sourceExcerpt);
  } else {
    // unknown
    if (rule.absenceIsUnknown && cond.missingInformation.length) {
      status = "needsInformation";
      reasons.push(
        "Je ne peux pas encore déterminer si cette case est pertinente : une information nécessaire manque."
      );
    } else if (cond.missingInformation.length) {
      status = "needsInformation";
    } else {
      status = "unknown";
      reasons.push(
        "Les sources actuellement modélisées décrivent cette case, mais ne suffisent pas à déterminer son applicabilité à votre situation."
      );
    }
  }

  // Garde globale : absence ≠ false / notApplicable
  if (
    status === "notApplicable" &&
    /absent|missing/i.test(cond.trace) &&
    rule.absenceIsUnknown
  ) {
    invariants.absencePromotedToNegative += 1;
    status = "needsInformation";
  }

  // Downgrade strong conclusions without full provenance / rule id
  if (
    (status === "applicable" || status === "notApplicable") &&
    (!rule.ruleId || !rule.provenance.length)
  ) {
    if (status === "applicable") invariants.unsupportedApplicable += 1;
    else invariants.unsupportedNotApplicable += 1;
    status = "unknown";
  }

  // Refused / unknown answers must not become negative conclusions
  const session = input.clarificationSession;
  if (session && (status === "notApplicable" || status === "applicable")) {
    for (const miss of cond.missingInformation) {
      const q = session.questions.find(
        (x) =>
          x.requirementId === miss.id ||
          x.questionId.includes(miss.id) ||
          (x.fieldCode === miss.fieldCode &&
            (x.status === "unknown" || x.status === "refused"))
      );
      if (q?.status === "unknown") {
        invariants.unknownPromotedToKnown += 1;
        status = "needsInformation";
      }
      if (q?.status === "refused" && status === "notApplicable") {
        invariants.refusedPromotedToNegative += 1;
        status = "unknown";
      }
    }
  }

  const explanation = explainTaxApplicability({
    status,
    rule,
    cond,
    reasons
  });

  return {
    fieldCode,
    status,
    headline: explanation.headline,
    ruleId: rule.ruleId,
    reasons: explanation.why,
    satisfiedConditions: explanation.conditionsSatisfied,
    unsatisfiedConditions: explanation.conditionsNotSatisfied,
    missingInformation: cond.missingInformation,
    conflicts: cond.conflicts,
    evidence: cond.evidence.map((e) => ({
      ...e,
      provenance: rule.provenance
    })),
    sources: sourcesOf(rule),
    yearPolicy: rule.yearPolicy,
    yearRelation,
    role: rule.requiredRole || null,
    limits: explanation.limits,
    clarificationQuestionCandidates: []
  };
}

function mergeFieldEvaluations(
  fieldCode: string,
  items: TaxApplicabilityEvaluation[],
  invariants: TaxApplicabilityInvariants
): TaxApplicabilityEvaluation {
  if (!items.length) {
    return baseUnknown(
      fieldCode,
      "Impossible à déterminer.",
      ["Aucune évaluation."]
    );
  }
  if (items.some((i) => i.status === "conflicted")) {
    const hit = items.find((i) => i.status === "conflicted")!;
    // never auto-resolve
    invariants.conflictAutoResolved += 0;
    return prefer(hit, items);
  }
  if (items.some((i) => i.status === "applicable")) {
    return prefer(
      items.find((i) => i.status === "applicable")!,
      items
    );
  }
  if (items.some((i) => i.status === "notApplicable")) {
    return prefer(
      items.find((i) => i.status === "notApplicable")!,
      items
    );
  }
  if (items.some((i) => i.status === "needsInformation")) {
    return prefer(
      items.find((i) => i.status === "needsInformation")!,
      items
    );
  }
  return prefer(items[0], items);
}

function prefer(
  primary: TaxApplicabilityEvaluation,
  all: TaxApplicabilityEvaluation[]
): TaxApplicabilityEvaluation {
  return {
    ...primary,
    missingInformation: uniqMissing(all.flatMap((a) => a.missingInformation)),
    conflicts: [...new Set(all.flatMap((a) => a.conflicts))],
    evidence: all.flatMap((a) => a.evidence),
    reasons: [...new Set(all.flatMap((a) => a.reasons))],
    limits: [...new Set(all.flatMap((a) => a.limits))]
  };
}

function uniqMissing(
  items: TaxApplicabilityEvaluation["missingInformation"]
): TaxApplicabilityEvaluation["missingInformation"] {
  const map = new Map<string, (typeof items)[number]>();
  for (const m of items) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function baseUnknown(
  fieldCode: string,
  headline: string,
  reasons: string[]
): TaxApplicabilityEvaluation {
  return {
    fieldCode,
    status: "unknown",
    headline,
    ruleId: null,
    reasons,
    satisfiedConditions: [],
    unsatisfiedConditions: [],
    missingInformation: [],
    conflicts: [],
    evidence: [],
    sources: [],
    yearPolicy: null,
    yearRelation: "yearUnknown",
    role: null,
    limits: [
      "Cette évaluation ne constitue ni une obligation déclarative ni une décision d’avantage fiscal."
    ],
    clarificationQuestionCandidates: []
  };
}

function sourcesOf(rule: TaxApplicabilityRule) {
  return rule.provenance
    .filter((p) => p.url)
    .map((p) => ({ title: p.title || "Source officielle", url: p.url }));
}

function deriveYearRelation(
  rule: TaxApplicabilityRule,
  yearsPresent: readonly number[],
  targetYear: number | null,
  invariants: TaxApplicabilityInvariants
): TaxApplicabilityEvaluation["yearRelation"] {
  if (!yearsPresent.length && targetYear == null) return "yearUnknown";
  const years = targetYear != null ? [targetYear] : [...yearsPresent];
  const inRule = years.every((y) => rule.taxYears.includes(y));
  if (inRule) {
    return rule.yearPolicy === "verifiedStable" ? "yearStable" : "sameYear";
  }
  if (years.some((y) => !rule.taxYears.includes(y))) {
    if (rule.yearPolicy === "verifiedStable") {
      // stable pack may still warn
      return "yearMismatch";
    }
    invariants.crossYearApplicabilityPromotion += 0;
    return "yearMismatch";
  }
  return "yearUnknown";
}

function detectCrossRolePromotion(
  required: string,
  fieldCode: string,
  facts: readonly CandidateDocumentFact[],
  userFacts: readonly UserProvidedFact[]
): boolean {
  // If we concluded using opposite role facts — bug signal
  const opposite =
    required === "declarant1"
      ? "declarant2"
      : required === "declarant2"
        ? "declarant1"
        : null;
  if (!opposite) return false;
  const usedOppositeDoc = facts.some(
    (f) =>
      f.fieldCode === fieldCode &&
      f.declarantRole === opposite &&
      f.displayValue != null &&
      !facts.some(
        (g) =>
          g.fieldCode === fieldCode &&
          g.declarantRole === required &&
          g.displayValue != null
      )
  );
  const usedOppositeUser = userFacts.some(
    (u) =>
      u.fieldCode === fieldCode &&
      u.role === opposite &&
      u.active !== false
  );
  return usedOppositeDoc || usedOppositeUser;
}

function mergeInv(
  a: TaxApplicabilityInvariants,
  b: TaxApplicabilityInvariants
): void {
  for (const key of Object.keys(b) as (keyof TaxApplicabilityInvariants)[]) {
    a[key] = (a[key] || 0) + (b[key] || 0);
  }
}

/** Stabilité ordre upload. */
export function assertApplicabilityOrderStable(
  evalsA: TaxApplicabilityEvaluation[],
  evalsB: TaxApplicabilityEvaluation[]
): { ok: boolean; uploadOrderChangesApplicability: number } {
  const key = (e: TaxApplicabilityEvaluation) =>
    `${e.fieldCode}|${e.status}|${e.ruleId || ""}|${e.headline}`;
  const a = [...evalsA].map(key).sort();
  const b = [...evalsB].map(key).sort();
  const ok = JSON.stringify(a) === JSON.stringify(b);
  return { ok, uploadOrderChangesApplicability: ok ? 0 : 1 };
}
