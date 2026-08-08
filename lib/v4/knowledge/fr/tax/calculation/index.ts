/**
 * V4-U — Valeurs fiscales dérivées, formules sourcées, calcul déterministe.
 */

export {
  TAX_FORMULAS,
  NON_MODELED_FORMULA_NOTES,
  getFormulasForField,
  listFormulaIds,
  getProductionFormulaById
} from "./formulas.js";
export { evaluateTypedOperation } from "./evaluateFormula.js";
export {
  resolveFormulaInputs,
  detectImplicitAggregation,
  assertUnitsCompatible
} from "./resolveInputs.js";
export { evaluateFormulaConditions } from "./formulaConditions.js";
export {
  calculateDerivedValue,
  evaluateDocumentCaseCalculations,
  assertCalculationOrderStable,
  emptyCalculationInvariants,
  resetDerivedIdsForTests
} from "./calculateDerivedValue.js";
export { explainTaxCalculation } from "./explainCalculation.js";
export {
  auditTaxCalculation,
  type CalculationAuditReport
} from "./audit.js";
