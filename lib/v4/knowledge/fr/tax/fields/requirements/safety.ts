/**
 * Invariants safety V4-Q — requirements / assistance.
 */

import type { TaxFieldAssistance } from "../../../../../types/knowledge.js";

export interface RequirementsSafetyReport {
  ok: boolean;
  violations: string[];
}

export function checkTaxFieldAssistanceSafety(
  assistance: TaxFieldAssistance | TaxFieldAssistance[]
): RequirementsSafetyReport {
  const list = Array.isArray(assistance) ? assistance : [assistance];
  const violations: string[] = [];

  for (const a of list) {
    if (a.suggestedDeclaredAmount != null) {
      violations.push(`${a.fieldCode}:suggestedDeclaredAmount`);
    }
    if (a.eligibilityDecision != null) {
      violations.push(`${a.fieldCode}:eligibilityDecision`);
    }
    if (a.invariants.knowledgePromotedToUserFact > 0) {
      violations.push(`${a.fieldCode}:knowledgePromotedToUserFact`);
    }
    if (a.invariants.requirementPromotedToObligation > 0) {
      violations.push(`${a.fieldCode}:requirementPromotedToObligation`);
    }
    if (a.invariants.candidateFactPromotedToCertain > 0) {
      violations.push(`${a.fieldCode}:candidateFactPromotedToCertain`);
    }
    if (a.invariants.unsupportedEligibilityDecision > 0) {
      violations.push(`${a.fieldCode}:unsupportedEligibilityDecision`);
    }
    if (a.invariants.unsupportedTaxAmount > 0) {
      violations.push(`${a.fieldCode}:unsupportedTaxAmount`);
    }
    // automaticUnsafeAggregation est un compteur de refus — OK s’il est > 0
    // tant que aggregatedValue reste null
    for (const e of a.evaluatedRequirements) {
      if (e.aggregatedValue != null) {
        violations.push(`${a.fieldCode}:${e.requirementId}:aggregatedValue`);
      }
      if (/vous n['’]avez pas|vous ne possédez pas/i.test(e.statusLabel)) {
        violations.push(
          `${a.fieldCode}:${e.requirementId}:missingPresentedAsUserDoesNotHave`
        );
      }
      if (
        /vous devez|indiquez |déclarez |éligible|montant correct/i.test(
          e.description
        )
      ) {
        violations.push(`${a.fieldCode}:${e.requirementId}:obligationTone`);
      }
    }
    if (a.priorityQuestions.length > 3) {
      violations.push(`${a.fieldCode}:tooManyPriorityQuestions`);
    }
    for (const q of a.questions) {
      if (!q.requirementId) {
        violations.push(`${a.fieldCode}:questionWithoutRequirement`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
