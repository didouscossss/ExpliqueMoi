/**
 * Audit des explications locales — V4-X.
 */

import type {
  DocumentCase,
  LocalExplanation,
  LocalExplanationInvariants
} from "../types/knowledge.js";
import { emptyLocalExplanationInvariants } from "./buildLocalExplanations.js";

export interface LocalExplanationAuditReport {
  ok: boolean;
  violations: string[];
  invariants: LocalExplanationInvariants;
  explanationCount: number;
}

export function auditLocalExplanations(
  docCase: DocumentCase,
  explanations?: LocalExplanation[] | null
): LocalExplanationAuditReport {
  const list = explanations || docCase.localExplanations || [];
  const invariants = {
    ...(docCase.localExplanationInvariants || emptyLocalExplanationInvariants())
  };
  const violations: string[] = [];

  for (const [k, v] of Object.entries(invariants)) {
    if (typeof v === "number" && v > 0) violations.push(`${k}=${v}`);
  }

  for (const e of list) {
    const blob = [
      e.summary,
      ...e.details,
      e.calculationExplanation || "",
      ...e.why
    ].join(" ");
    if (
      /vous devez déclarer|vous êtes éligible|vous avez droit/i.test(blob) ||
      (/\bmontant à déclarer\b/i.test(blob) && !/pas .*(montant|valeur)/i.test(blob))
    ) {
      violations.push(`normativeLanguage:${e.subject}`);
      invariants.explanationPromotedToDeclaration += 1;
    }
    if (
      e.status === "explained" &&
      e.calculation?.status === "calculated" &&
      !e.sourceRefs.length &&
      !e.ruleRefs.length
    ) {
      violations.push(`unsourcedCalculatedExplanation:${e.subject}`);
      invariants.unsourcedExplanation += 1;
    }
  }

  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
    invariants.explanationPromotedToDeclaration += 1;
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
    invariants.explanationPromotedToEligibility += 1;
  }

  return {
    ok: violations.length === 0,
    violations,
    invariants,
    explanationCount: list.length
  };
}
