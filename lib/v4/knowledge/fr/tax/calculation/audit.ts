/**
 * Audit calculation V4-U.
 */

import type {
  CalculationResult,
  DocumentCase,
  TaxCalculationInvariants
} from "../../../../types/knowledge.js";
import { emptyCalculationInvariants } from "./calculateDerivedValue.js";

export interface CalculationAuditReport {
  ok: boolean;
  violations: string[];
  invariants: TaxCalculationInvariants;
  calculatedCount: number;
  unsupportedCount: number;
}

export function auditTaxCalculation(
  docCase: DocumentCase,
  results?: CalculationResult[] | null
): CalculationAuditReport {
  const calcResults = results || docCase.calculationResults || [];
  const invariants = {
    ...(docCase.calculationInvariants || emptyCalculationInvariants())
  };
  const violations: string[] = [];

  for (const [k, v] of Object.entries(invariants)) {
    if (typeof v === "number" && v > 0) violations.push(`${k}=${v}`);
  }

  let calculatedCount = 0;
  let unsupportedCount = 0;

  for (const r of calcResults) {
    if (r.status === "calculated") {
      calculatedCount += 1;
      if (!r.formulaId) violations.push(`calculatedWithoutFormula:${r.fieldCode}`);
      if (!r.sources?.length) {
        violations.push(`calculatedWithoutSources:${r.fieldCode}`);
      }
      if (!r.rule?.version || !r.rule?.formulaId) {
        violations.push(`calculatedWithoutRuleProvenance:${r.fieldCode}`);
      }
      if (r.missingInputs.length) {
        violations.push(`calculatedWithMissing:${r.fieldCode}`);
        invariants.calculationWithMissingInput += 1;
      }
      if (r.conflicts.length) {
        violations.push(`calculatedWithConflict:${r.fieldCode}`);
        invariants.calculationWithConflictedInput += 1;
      }
    }
    if (r.status === "unsupported") unsupportedCount += 1;

    const blob = [r.explanation, ...r.limits].join(" ");
    // Tolérer les négations du type « n'est pas un montant … à déclarer ».
    if (
      /vous devez déclarer|vous êtes éligible|vous avez droit/i.test(blob) ||
      (/\bmontant à déclarer\b/i.test(blob) &&
        !/pas (un )?montant/i.test(blob))
    ) {
      violations.push(`normativeLanguage:${r.fieldCode}`);
      invariants.calculationPromotedToObligation += 1;
    }
  }

  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
    invariants.derivedValuePromotedToDeclaredAmount += 1;
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
    invariants.calculationPromotedToEligibility += 1;
  }

  return {
    ok: violations.length === 0,
    violations,
    invariants,
    calculatedCount,
    unsupportedCount
  };
}
