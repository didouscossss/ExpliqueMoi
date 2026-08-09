/**
 * Audit applicability V4-T — npm run knowledge:tax:applicability:audit
 */

import type {
  DocumentCase,
  TaxApplicabilityEvaluation,
  TaxApplicabilityInvariants
} from "../../../../types/knowledge.js";
import { emptyApplicabilityInvariants } from "./evaluateApplicability.js";

export interface ApplicabilityAuditReport {
  ok: boolean;
  violations: string[];
  invariants: TaxApplicabilityInvariants;
  strongEvaluations: number;
  unknownFields: string[];
}

export function auditTaxApplicability(
  docCase: DocumentCase,
  evaluations?: TaxApplicabilityEvaluation[] | null
): ApplicabilityAuditReport {
  const evals =
    evaluations || docCase.applicabilityEvaluations || [];
  const invariants = {
    ...(docCase.applicabilityInvariants || emptyApplicabilityInvariants())
  };
  const violations: string[] = [];

  for (const [k, v] of Object.entries(invariants)) {
    if (typeof v === "number" && v > 0) {
      violations.push(`${k}=${v}`);
    }
  }

  let strongEvaluations = 0;
  const unknownFields: string[] = [];

  for (const ev of evals) {
    if (ev.status === "applicable" || ev.status === "notApplicable") {
      strongEvaluations += 1;
      if (!ev.ruleId) {
        violations.push(`strongWithoutRule:${ev.fieldCode}`);
        invariants.missingApplicabilityProvenance += 1;
      }
      if (!ev.sources?.length) {
        violations.push(`strongWithoutSource:${ev.fieldCode}`);
        invariants.missingApplicabilityProvenance += 1;
      }
      if (!ev.yearPolicy) {
        violations.push(`strongWithoutYearPolicy:${ev.fieldCode}`);
      }
      if (!ev.evidence?.length && ev.status === "applicable") {
        violations.push(`applicableWithoutEvidence:${ev.fieldCode}`);
      }
    }
    if (ev.status === "unknown") unknownFields.push(ev.fieldCode);

    // Formulations interdites
    const blob = [ev.headline, ...ev.reasons].join(" ");
    if (/vous devez remplir|vous êtes éligible|vous avez droit/i.test(blob)) {
      violations.push(`normativeLanguage:${ev.fieldCode}`);
      invariants.unsupportedEligibilityDecision += 1;
    }
  }

  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
    invariants.unsupportedEligibilityDecision += 1;
  }
  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
    invariants.automaticUnsafeAggregation += 1;
  }

  return {
    ok: violations.length === 0,
    violations,
    invariants,
    strongEvaluations,
    unknownFields: [...new Set(unknownFields)].sort()
  };
}
