/**
 * Conditions déterministes propres aux formules — V4-V.
 */

import type {
  CalculationResult,
  ResolvedFormulaInput,
  TaxFormula,
  TaxFormulaCondition,
  UserProvidedFact
} from "../../../../types/knowledge.js";

export interface FormulaConditionContext {
  resolved: readonly ResolvedFormulaInput[];
  userFacts: readonly UserProvidedFact[];
}

export type FormulaConditionOutcome =
  | { ok: true }
  | {
      ok: false;
      status: CalculationResult["status"];
      missingInputs: string[];
      explanation: string;
    };

export function evaluateFormulaConditions(
  formula: TaxFormula,
  ctx: FormulaConditionContext
): FormulaConditionOutcome {
  for (const cond of formula.formulaConditions || []) {
    const r = evaluateOne(cond, ctx);
    if (!r.ok) return r;
  }
  return { ok: true };
}

function evaluateOne(
  cond: TaxFormulaCondition,
  ctx: FormulaConditionContext
): FormulaConditionOutcome {
  if (cond.kind === "inputAtMost") {
    const inp = ctx.resolved.find((r) => r.inputId === cond.inputId);
    if (!inp || inp.status !== "resolved" || typeof inp.value !== "number") {
      return {
        ok: false,
        status: "needsInformation",
        missingInputs: [cond.inputId],
        explanation: `Cette valeur ne peut pas encore être calculée : ${cond.inputId} manque.`
      };
    }
    if (inp.unit !== cond.unit) {
      return {
        ok: false,
        status: "unsupported",
        missingInputs: [],
        explanation: `Unité incompatible pour la condition ${cond.inputId}.`
      };
    }
    if (inp.value > cond.value) {
      return {
        ok: false,
        status: cond.onFail,
        missingInputs: [],
        explanation: cond.message
      };
    }
    return { ok: true };
  }

  if (cond.kind === "userFactAccepted") {
    const accepted = ctx.userFacts.some(
      (u) =>
        u.active !== false &&
        u.answerStatus === "accepted" &&
        u.requirementId === cond.requirementId &&
        (!u.fieldCode || u.fieldCode.toUpperCase() === cond.fieldCode.toUpperCase()) &&
        isAffirmative(u.normalizedValue ?? u.answer)
    );
    if (!accepted) {
      return {
        ok: false,
        status: "needsInformation",
        missingInputs: [cond.missingId],
        explanation: cond.message
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    status: "unsupported",
    missingInputs: [],
    explanation: "Condition de formule non reconnue."
  };
}

function isAffirmative(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return ["oui", "yes", "true", "ok", "confirmé", "confirme", "1"].includes(s);
}
