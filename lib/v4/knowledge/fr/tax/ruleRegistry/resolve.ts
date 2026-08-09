/**
 * Sélection déterministe de règles / formules versionnées — V4-W.
 * Aucun last-wins. Aucun choix arbitraire sur overlap.
 */

import type {
  TaxFormula,
  TaxFormulaResolution,
  TaxRuleRegistryEntry,
  TaxRuleRegistryInvariants,
  TaxRuleResolution,
  TaxRuleResolutionStatus
} from "../../../../types/knowledge.js";
import { TAX_FORMULAS } from "../calculation/formulas.js";
import {
  buildTaxRuleRegistry,
  entryFromFormula,
  formulaVersion,
  sortRegistryEntries
} from "./buildEntries.js";

export function emptyRuleRegistryInvariants(): TaxRuleRegistryInvariants {
  return {
    implicitRuleSelection: 0,
    unsourcedVerifiedRules: 0,
    ambiguousRuleAutoResolution: 0,
    derivedValuePromotedToDeclaredAmount: 0,
    calculationPromotedToEligibility: 0,
    implicitAmountAggregation: 0
  };
}

export function entryCoversYear(
  entry: TaxRuleRegistryEntry,
  taxYear: number | null
): boolean {
  if (taxYear == null) return true;
  if (entry.taxYears.includes(taxYear)) return true;
  const from = entry.effectiveFrom;
  const to = entry.effectiveTo;
  if (from != null || to != null) {
    const lo = from ?? Number.NEGATIVE_INFINITY;
    const hi = to ?? Number.POSITIVE_INFINITY;
    return taxYear >= lo && taxYear <= hi;
  }
  return false;
}

export interface ResolveTaxRuleOptions {
  entries?: readonly TaxRuleRegistryEntry[];
  ruleId?: string | null;
  fieldCode?: string | null;
  kind?: TaxRuleRegistryEntry["kind"] | null;
  taxYear?: number | null;
  /** Si true, experimental peut être résolu. Production: false. */
  allowExperimental?: boolean;
  /** Inclure deprecated (jamais pour exécution production). */
  allowDeprecated?: boolean;
}

export function resolveTaxRule(
  options: ResolveTaxRuleOptions
): TaxRuleResolution {
  const taxYear = options.taxYear ?? null;
  const entries = sortRegistryEntries(
    options.entries ?? buildTaxRuleRegistry()
  );
  const field = options.fieldCode?.toUpperCase() || null;

  let pool = entries.filter((e) => {
    if (options.ruleId && e.ruleId !== options.ruleId) return false;
    if (options.kind && e.kind !== options.kind) return false;
    if (field && !e.fieldCodes.map((c) => c.toUpperCase()).includes(field)) {
      return false;
    }
    return entryCoversYear(e, taxYear);
  });

  // Année demandée hors périmètre → unsupported (pas de fallback autre année)
  if (taxYear != null) {
    const yearHits = pool.filter((e) => entryCoversYear(e, taxYear));
    pool = yearHits;
  }

  const deprecated = pool.filter((e) => e.status === "deprecated");
  const experimental = pool.filter((e) => e.status === "experimental");
  const unsupported = pool.filter((e) => e.status === "unsupported");
  let executable = pool.filter((e) => e.status === "verified");

  if (options.allowExperimental) {
    executable = sortRegistryEntries([...executable, ...experimental]);
  }
  if (options.allowDeprecated) {
    executable = sortRegistryEntries([...executable, ...deprecated]);
  }

  executable = sortRegistryEntries(executable);

  if (executable.length === 1) {
    return {
      status: "resolved",
      entry: executable[0]!,
      candidates: executable,
      reason: `Règle résolue: ${executable[0]!.ruleId}@${executable[0]!.version}`,
      taxYear
    };
  }

  if (executable.length > 1) {
    return {
      status: "ambiguous",
      entry: null,
      candidates: executable,
      reason: `Plusieurs versions également valides: ${executable
        .map((e) => `${e.ruleId}@${e.version}`)
        .join(", ")}`,
      taxYear
    };
  }

  if (!options.allowExperimental && experimental.length > 0 && deprecated.length === 0) {
    return {
      status: "experimentalOnly",
      entry: null,
      candidates: sortRegistryEntries(experimental),
      reason:
        "Seules des règles experimental existent pour ce périmètre — non exécutables en production.",
      taxYear
    };
  }

  if (unsupported.length && !pool.some((e) => e.status === "verified")) {
    return {
      status: "unsupported",
      entry: null,
      candidates: sortRegistryEntries(pool),
      reason: "Aucune règle verified compatible pour ce périmètre.",
      taxYear
    };
  }

  return {
    status: "unsupported",
    entry: null,
    candidates: sortRegistryEntries(pool),
    reason:
      taxYear != null
        ? `Aucune version compatible pour l'année ${taxYear}.`
        : "Aucune version compatible.",
    taxYear
  };
}

export interface ResolveTaxFormulaOptions {
  fieldCode: string;
  formulaId?: string | null;
  taxYear?: number | null;
  formulas?: readonly TaxFormula[];
  extraFormulas?: readonly TaxFormula[];
  allowExperimental?: boolean;
}

/**
 * Résout une TaxFormula exécutable via le registre.
 * Ne choisit jamais silencieusement parmi plusieurs versions.
 */
export function resolveTaxFormula(
  options: ResolveTaxFormulaOptions
): TaxFormulaResolution & { invariants: TaxRuleRegistryInvariants } {
  const invariants = emptyRuleRegistryInvariants();
  const taxYear = options.taxYear ?? null;
  const fieldCode = options.fieldCode.toUpperCase();
  const allFormulas = [
    ...(options.formulas ?? TAX_FORMULAS),
    ...(options.extraFormulas ?? [])
  ];
  // Clé formulaId@version — plusieurs versions peuvent partager le même formulaId.
  const formulaByKey = new Map(
    allFormulas.map((f) => [`${f.formulaId}@${formulaVersion(f)}`, f])
  );
  const calcEntries = sortRegistryEntries(allFormulas.map(entryFromFormula));

  const resolution = resolveTaxRule({
    entries: calcEntries,
    ruleId: options.formulaId ? `calc:${options.formulaId}` : null,
    fieldCode,
    kind: "calculation",
    taxYear,
    allowExperimental: options.allowExperimental === true,
    allowDeprecated: false
  });

  if (resolution.status === "ambiguous") {
    // Refus correct — ne pas auto-résoudre
    invariants.ambiguousRuleAutoResolution += 0;
    return {
      status: "ambiguous",
      formula: null,
      entry: null,
      candidates: resolution.candidates,
      reason: resolution.reason,
      taxYear,
      invariants
    };
  }

  if (resolution.status !== "resolved" || !resolution.entry) {
    const status: TaxRuleResolutionStatus =
      resolution.status === "experimentalOnly"
        ? "experimentalOnly"
        : "unsupported";
    return {
      status,
      formula: null,
      entry: null,
      candidates: resolution.candidates,
      reason: resolution.reason,
      taxYear,
      invariants
    };
  }

  const entry = resolution.entry;
  if (entry.status === "verified" && entry.sourceRefs.length === 0) {
    invariants.unsourcedVerifiedRules += 1;
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: "Règle verified sans sourceRefs — exécution refusée.",
      taxYear,
      invariants
    };
  }

  const formulaId = entry.formulaId || options.formulaId;
  const formula = formulaId
    ? formulaByKey.get(`${formulaId}@${entry.version}`) || null
    : null;
  if (!formula) {
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: "Entrée registre sans TaxFormula liée pour cette version.",
      taxYear,
      invariants
    };
  }

  if (
    taxYear != null &&
    !formula.taxYears.includes(taxYear) &&
    !(
      (formula.effectiveFrom != null || formula.effectiveTo != null) &&
      taxYear >= (formula.effectiveFrom ?? Number.NEGATIVE_INFINITY) &&
      taxYear <= (formula.effectiveTo ?? Number.POSITIVE_INFINITY)
    )
  ) {
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: `La formule ${formula.formulaId} ne couvre pas l'année ${taxYear}.`,
      taxYear,
      invariants
    };
  }

  return {
    status: "resolved",
    formula,
    entry,
    candidates: [entry],
    reason: resolution.reason,
    taxYear,
    invariants
  };
}
