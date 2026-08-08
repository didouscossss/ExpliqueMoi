/**
 * npm run knowledge:tax:calculation:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxCalculation,
  buildDocumentCase,
  listFormulaIds,
  NON_MODELED_FORMULA_NOTES,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  TAX_FORMULAS
} from "../lib/v4/index.ts";
import { CALC_DOCS } from "../lib/v4/__fixtures__/fiscal/calculationFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:calculation:audit (V4-U) ===");
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
  resetDerivedIdsForTests();

  const docCase = buildDocumentCase(
    [
      CALC_DOCS.salary1AJ,
      CALC_DOCS.empty1AJ,
      CALC_DOCS.foncierMicro,
      CALC_DOCS.multiAmountsNoFormula,
      ...CALC_DOCS.duplicatePair
    ],
    { resetIds: true }
  );

  const report = auditTaxCalculation(docCase);
  const payload = {
    generatedAt: new Date().toISOString(),
    caseId: docCase.caseId,
    formulaIds: listFormulaIds(),
    formulasCount: TAX_FORMULAS.length,
    nonModeledNotes: [...NON_MODELED_FORMULA_NOTES],
    calculationResults: (docCase.calculationResults || []).map((r) => ({
      fieldCode: r.fieldCode,
      status: r.status,
      formulaId: r.formulaId,
      value: r.value,
      unit: r.unit,
      missingInputs: r.missingInputs,
      conflicts: r.conflicts.length
    })),
    metrics: docCase.calculationMetrics || null,
    suggestedDeclaredAmount: docCase.suggestedDeclaredAmount,
    eligibilityDecision: docCase.eligibilityDecision,
    boundaries: {
      derivedValuePromotedToDeclaredAmount: 0,
      calculationPromotedToEligibility: 0,
      packIsEmptyByDesign: TAX_FORMULAS.length === 0
    },
    ...report
  };

  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-calculation-audit.json"),
    JSON.stringify(payload, null, 2) + "\n"
  );
  console.log(JSON.stringify(payload, null, 2));
  if (!report.ok) {
    console.error("AUDIT FAILED");
    process.exit(1);
  }
  if (TAX_FORMULAS.length !== 0) {
    console.error("Unexpected production formulas — pack should stay empty unless sourced");
    process.exit(1);
  }
  console.log("AUDIT OK");
}

main();
