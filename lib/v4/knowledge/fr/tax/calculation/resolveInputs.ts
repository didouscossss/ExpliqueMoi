/**
 * Résolution d’inputs de formule — provenance stricte — V4-U.
 */

import type {
  CandidateDocumentFact,
  DerivedTaxValue,
  DocumentInstance,
  ResolvedFormulaInput,
  TaxCalculationInvariants,
  TaxFormula,
  TaxFormulaInput,
  TaxValueUnit,
  UserProvidedFact
} from "../../../../types/knowledge.js";

export interface ResolveInputsContext {
  facts: readonly CandidateDocumentFact[];
  userFacts: readonly UserProvidedFact[];
  derivedValues?: readonly DerivedTaxValue[];
  documents: readonly DocumentInstance[];
  targetYear: number | null;
  invariants: TaxCalculationInvariants;
}

export interface ResolveInputsResult {
  resolved: ResolvedFormulaInput[];
  missing: string[];
  conflicts: string[];
  ok: boolean;
}

export function resolveFormulaInputs(
  formula: TaxFormula,
  ctx: ResolveInputsContext
): ResolveInputsResult {
  const resolved: ResolvedFormulaInput[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];

  for (const input of formula.inputs) {
    const r = resolveOne(input, formula, ctx);
    resolved.push(r);
    if (r.status === "missing" && input.required) missing.push(input.inputId);
    if (r.status === "conflicted") conflicts.push(input.inputId);
    if (r.status === "incompatible") {
      missing.push(input.inputId);
      ctx.invariants.incompatibleUnitsCalculated += 0; // blocked, not calculated
    }
  }

  return {
    resolved,
    missing,
    conflicts,
    ok: missing.length === 0 && conflicts.length === 0
  };
}

function resolveOne(
  input: TaxFormulaInput,
  formula: TaxFormula,
  ctx: ResolveInputsContext
): ResolvedFormulaInput {
  // Constante officielle sourcée — pas un fait document/user
  if (input.constantId) {
    const c = (formula.constants || []).find(
      (x) => x.constantId === input.constantId
    );
    if (!c) {
      return {
        inputId: input.inputId,
        value: null,
        unit: input.unit,
        taxYear: null,
        role: input.role || null,
        sourceKind: "constant",
        sourceId: input.constantId,
        status: "missing",
        provenanceNote: `Constante officielle absente: ${input.constantId}`,
        documentId: null
      };
    }
    if (c.unit !== input.unit) {
      return {
        inputId: input.inputId,
        value: null,
        unit: input.unit,
        taxYear: null,
        role: input.role || null,
        sourceKind: "constant",
        sourceId: c.constantId,
        status: "incompatible",
        provenanceNote: `Unité constante incompatible: ${c.unit} vs ${input.unit}`,
        documentId: null
      };
    }
    return {
      inputId: input.inputId,
      value: c.value,
      unit: c.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: "constant",
      sourceId: c.constantId,
      status: "resolved",
      provenanceNote: c.sourceNote,
      documentId: null
    };
  }

  const code = (input.fieldCode || "").toUpperCase();
  const candidates: ResolvedFormulaInput[] = [];

  // Document facts — skip duplicate non-primary copies when document graph is present.
  // If documents[] is empty (unit tests on facts alone), do not filter by primary set.
  const hasDocumentGraph = ctx.documents.length > 0;
  const primaryDocIds = new Set(
    ctx.documents
      .filter((d) => d.isPrimaryCopy || d.duplicateStatus !== "possibleDuplicate")
      .map((d) => d.documentId)
  );

  for (const f of ctx.facts) {
    if (code && f.fieldCode !== code) continue;
    if (f.factType === "declarantRole" || f.factType === "fiscalYear") continue;
    const num = toNumber(f.displayValue ?? f.value);
    if (num == null && input.unit !== "boolean") continue;

    // Duplicate guard — exclure les copies non primaires (sans incrémenter : prévention OK)
    if (
      hasDocumentGraph &&
      f.sourceDocumentId &&
      !primaryDocIds.has(f.sourceDocumentId)
    ) {
      continue;
    }
    if (
      hasDocumentGraph &&
      f.sourceDocumentId &&
      ctx.documents.some(
        (d) =>
          d.documentId === f.sourceDocumentId &&
          d.duplicateStatus === "possibleDuplicate" &&
          !d.isPrimaryCopy
      )
    ) {
      continue;
    }

    // Version: do not auto-select
    if (
      f.sourceDocumentId &&
      ctx.documents.some(
        (d) =>
          d.documentId === f.sourceDocumentId &&
          d.duplicateStatus === "possibleVersion"
      )
    ) {
      // keep as candidate but if multiple versions with different values → conflict
    }

    // Year
    if (
      formula.yearPolicy === "exact" &&
      ctx.targetYear != null &&
      f.year != null &&
      f.year !== ctx.targetYear
    ) {
      ctx.invariants.crossYearCalculation += 0;
      continue;
    }

    // Role — pas de glissement silencieux cross-role.
    // household : n’accepte que household / unknown / null (pas declarant1/2).
    if (input.role && input.role !== "unknown") {
      if (input.role === "household") {
        if (
          f.declarantRole &&
          f.declarantRole !== "unknown" &&
          f.declarantRole !== "household"
        ) {
          ctx.invariants.crossRoleCalculation += 0;
          continue;
        }
      } else if (
        f.declarantRole &&
        f.declarantRole !== "unknown" &&
        f.declarantRole !== input.role
      ) {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    }
    if (formula.rolePolicy === "household") {
      if (
        f.declarantRole &&
        f.declarantRole !== "unknown" &&
        f.declarantRole !== "household"
      ) {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    } else if (
      formula.rolePolicy !== "any" &&
      formula.rolePolicy !== "unknown"
    ) {
      if (
        f.declarantRole &&
        f.declarantRole !== "unknown" &&
        f.declarantRole !== formula.rolePolicy
      ) {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    }

    candidates.push({
      inputId: input.inputId,
      value: num,
      unit: input.unit,
      taxYear: f.year,
      role: f.declarantRole || input.role || null,
      sourceKind: "document",
      sourceId: f.factId,
      status: "resolved",
      provenanceNote: f.provenanceNote || `document:${f.sourceDocumentId}`,
      documentId: f.sourceDocumentId
    });
  }

  // User facts
  if (input.allowUserFact !== false) {
    for (const u of ctx.userFacts) {
      if (u.active === false) continue;
      if (code && u.fieldCode !== code) continue;
      if (u.answerStatus === "unknown" || u.answerStatus === "refused") continue;
      if (u.answerStatus !== "accepted") continue;
      // Ne pas traiter un oui/non (ex. confirmation d’exclusions) comme un montant EUR.
      if (
        input.unit !== "boolean" &&
        (u.valueType === "boolean" ||
          typeof u.normalizedValue === "boolean" ||
          (typeof u.answer === "string" &&
            /^(oui|non|yes|no|true|false)$/i.test(u.answer.trim())))
      ) {
        continue;
      }
      const num = toNumber(u.normalizedValue ?? u.answer);
      if (num == null && input.unit !== "boolean") continue;

      if (
        formula.yearPolicy === "exact" &&
        ctx.targetYear != null &&
        u.year != null &&
        u.year !== ctx.targetYear
      ) {
        continue;
      }
      if (
        input.role &&
        u.role &&
        u.role !== "unknown" &&
        u.role !== input.role
      ) {
        continue;
      }

      candidates.push({
        inputId: input.inputId,
        value: num,
        unit: input.unit,
        taxYear: u.year ?? null,
        role: u.role || input.role || null,
        sourceKind: "user",
        sourceId: u.factId || u.questionId,
        status: "resolved",
        provenanceNote: "Information fournie par vous",
        documentId: null
      });
    }
  }

  // Derived values
  if (input.allowDerivedValue) {
    for (const d of ctx.derivedValues || []) {
      if (code && d.fieldCode !== code) continue;
      if (d.unit !== input.unit) {
        continue;
      }
      const num = typeof d.value === "number" ? d.value : null;
      if (num == null) continue;
      candidates.push({
        inputId: input.inputId,
        value: num,
        unit: d.unit,
        taxYear: d.taxYear,
        role: d.role,
        sourceKind: "derived",
        sourceId: d.derivedId,
        status: "resolved",
        provenanceNote: `derived:${d.formulaId}`,
        documentId: null
      });
    }
  }

  if (!candidates.length) {
    return {
      inputId: input.inputId,
      value: null,
      unit: input.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: "document",
      sourceId: "",
      status: "missing",
      provenanceNote: "Input absent",
      documentId: null
    };
  }

  // Compatible same values → keep one, preserve multi-provenance in note
  const values = [
    ...new Set(candidates.map((c) => String(c.value)))
  ];
  if (values.length > 1) {
    return {
      inputId: input.inputId,
      value: null,
      unit: input.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: candidates[0].sourceKind,
      sourceId: candidates.map((c) => c.sourceId).join("|"),
      status: "conflicted",
      provenanceNote: `Conflit: ${candidates
        .map((c) => `${c.sourceKind}:${c.value}`)
        .join(" vs ")}`,
      documentId: null
    };
  }

  // Same value from multiple sources — no double-count for sum ops at input level
  const primary = pickPrimaryCandidate(candidates, ctx);
  if (
    candidates.length > 1 &&
    candidates.every((c) => String(c.value) === String(primary.value))
  ) {
    primary.provenanceNote = `Valeurs identiques (${candidates.length} sources) — une seule retenue, pas de double comptage. Sources: ${candidates
      .map((c) => c.sourceKind)
      .join(", ")}`;
  }
  return primary;
}

function pickPrimaryCandidate(
  candidates: ResolvedFormulaInput[],
  _ctx: ResolveInputsContext
): ResolvedFormulaInput {
  // Prefer document over user over derived/constant — but same value only reaches here
  const order = { document: 0, user: 1, derived: 2, constant: 3 } as const;
  return [...candidates].sort(
    (a, b) => order[a.sourceKind] - order[b.sourceKind]
  )[0];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "string") return null;
  const n = Number(
    v.replace(/\s/g, "").replace(/€/g, "").replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}

/** Détecte une tentative d’agrégation implicite hors formule. */
export function detectImplicitAggregation(
  facts: readonly CandidateDocumentFact[],
  fieldCode: string
): number {
  const amounts = facts.filter(
    (f) =>
      f.fieldCode === fieldCode &&
      (typeof f.value === "number" ||
        (f.displayValue != null && /\d/.test(String(f.displayValue))))
  );
  // Presence of multiple amounts is OK — summing them without formula is not.
  // This helper returns count of amounts; caller must not sum.
  return amounts.length;
}

export function assertUnitsCompatible(
  units: TaxValueUnit[],
  target: TaxValueUnit
): boolean {
  return units.every((u) => u === target);
}
