/**
 * Opérations typées — pas d’eval(), pas de JS dynamique — V4-U.
 */

import type {
  TaxFormulaOperation,
  TaxRoundingPolicy,
  TaxValueUnit
} from "../../../../types/knowledge.js";

export interface FormulaEvalOk {
  ok: true;
  value: number;
  notes: string[];
}

export interface FormulaEvalErr {
  ok: false;
  reason: string;
  invariant?:
    | "incompatibleUnitsCalculated"
    | "unsupportedRounding"
    | "implicitAmountAggregation";
}

export type FormulaEvalResult = FormulaEvalOk | FormulaEvalErr;

export function evaluateTypedOperation(
  operation: TaxFormulaOperation,
  values: number[],
  unit: TaxValueUnit,
  inputUnits: TaxValueUnit[],
  roundingPolicy: TaxRoundingPolicy
): FormulaEvalResult {
  if (!values.length) {
    return { ok: false, reason: "no_values" };
  }

  let raw: number;
  const notes: string[] = [`op:${operation}`];

  switch (operation) {
    case "identity":
      if (values.length !== 1) {
        return { ok: false, reason: "identity_requires_one_input" };
      }
      if (inputUnits.some((u) => u !== unit)) {
        return {
          ok: false,
          reason: "incompatible_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      raw = values[0];
      break;
    case "sum":
    case "subtract":
    case "multiply":
    case "divide":
    case "min":
    case "max":
      if (inputUnits.some((u) => u !== unit)) {
        return {
          ok: false,
          reason: "incompatible_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      if (operation === "sum") {
        raw = values.reduce((a, b) => a + b, 0);
        notes.push(`sum_of_${values.length}`);
      } else if (operation === "subtract") {
        if (values.length < 2) {
          return { ok: false, reason: "subtract_requires_two_inputs" };
        }
        raw = values.slice(1).reduce((a, b) => a - b, values[0]);
      } else if (operation === "multiply") {
        raw = values.reduce((a, b) => a * b, 1);
      } else if (operation === "divide") {
        if (values.length !== 2) {
          return { ok: false, reason: "divide_requires_two_inputs" };
        }
        if (values[1] === 0) return { ok: false, reason: "division_by_zero" };
        raw = values[0] / values[1];
      } else if (operation === "min") {
        raw = Math.min(...values);
      } else {
        raw = Math.max(...values);
      }
      break;
    case "percentage":
      if (values.length !== 2) {
        return { ok: false, reason: "percentage_requires_base_and_rate" };
      }
      // values[0]=base EUR, values[1]=rate percentage → result EUR
      if (inputUnits[0] !== "EUR" || inputUnits[1] !== "percentage") {
        return {
          ok: false,
          reason: "percentage_input_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      if (unit !== "EUR") {
        return { ok: false, reason: "percentage_result_unit" };
      }
      raw = (values[0] * values[1]) / 100;
      break;
    default:
      return { ok: false, reason: `unsupported_operation:${operation}` };
  }

  const rounded = applyRounding(raw, roundingPolicy);
  if (!rounded.ok) return rounded;
  return { ok: true, value: rounded.value, notes: [...notes, ...rounded.notes] };
}

function applyRounding(
  value: number,
  policy: TaxRoundingPolicy
): FormulaEvalOk | FormulaEvalErr {
  switch (policy) {
    case "none":
      return { ok: true, value, notes: ["rounding:none"] };
    case "nearestEuro":
      return {
        ok: true,
        value: Math.round(value),
        notes: ["rounding:nearestEuro"]
      };
    case "floor":
      return { ok: true, value: Math.floor(value), notes: ["rounding:floor"] };
    case "ceil":
      return { ok: true, value: Math.ceil(value), notes: ["rounding:ceil"] };
    case "sourceDefined":
      // Arrondi déjà appliqué côté source — on conserve la valeur
      return { ok: true, value, notes: ["rounding:sourceDefined"] };
    default:
      return {
        ok: false,
        reason: `unsupported_rounding:${policy}`,
        invariant: "unsupportedRounding"
      };
  }
}
