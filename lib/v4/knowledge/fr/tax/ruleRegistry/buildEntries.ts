/**
 * Construction déterministe du registre de règles / formules — V4-W.
 * Ne duplique pas la logique des formules : référence formulaId / applicabilityRuleId.
 *
 * Distinct du catalogue de formulaires `fr/tax/registry/` (V4-M).
 */

import type {
  TaxApplicabilityRule,
  TaxFormula,
  TaxRuleRegistryEntry,
  TaxRuleRegistryStatus
} from "../../../../types/knowledge.js";
import { TAX_APPLICABILITY_RULES } from "../applicability/rules.js";
import { TAX_FORMULAS } from "../calculation/formulas.js";

export function mapVerificationToRegistryStatus(
  verificationStatus: "verified" | "partial" | "unverified",
  registryStatus?: TaxRuleRegistryStatus
): TaxRuleRegistryStatus {
  if (registryStatus) return registryStatus;
  if (verificationStatus === "verified") return "verified";
  if (verificationStatus === "partial") return "experimental";
  return "unsupported";
}

export function formulaVersion(f: TaxFormula): string {
  return f.version && String(f.version).trim() ? String(f.version) : "1";
}

export function applicabilityVersion(r: TaxApplicabilityRule): string {
  return r.version && String(r.version).trim() ? String(r.version) : "1";
}

export function entryFromFormula(f: TaxFormula): TaxRuleRegistryEntry {
  const provenance = f.provenance || [];
  return {
    ruleId: `calc:${f.formulaId}`,
    kind: "calculation",
    fieldCodes: [f.targetFieldCode.toUpperCase()],
    taxYears: [...f.taxYears].sort((a, b) => a - b),
    effectiveFrom: f.effectiveFrom ?? null,
    effectiveTo: f.effectiveTo ?? null,
    version: formulaVersion(f),
    status: mapVerificationToRegistryStatus(
      f.verificationStatus,
      f.registryStatus
    ),
    sourceRefs: provenance
      .map((p) => p.url)
      .filter((u): u is string => Boolean(u))
      .sort(),
    provenance: [...provenance],
    sourceExcerpt: f.sourceExcerpt || null,
    formulaId: f.formulaId,
    applicabilityRuleId: null
  };
}

export function entryFromApplicabilityRule(
  r: TaxApplicabilityRule
): TaxRuleRegistryEntry {
  const provenance = r.provenance || [];
  return {
    ruleId: `app:${r.ruleId}`,
    kind: "applicability",
    fieldCodes: [r.fieldCode.toUpperCase()],
    taxYears: [...r.taxYears].sort((a, b) => a - b),
    effectiveFrom: null,
    effectiveTo: null,
    version: applicabilityVersion(r),
    status: mapVerificationToRegistryStatus(r.verificationStatus),
    sourceRefs: provenance
      .map((p) => p.url)
      .filter((u): u is string => Boolean(u))
      .sort(),
    provenance: [...provenance],
    sourceExcerpt: r.sourceExcerpt || null,
    formulaId: null,
    applicabilityRuleId: r.ruleId
  };
}

/** Ordre canonique — l’ordre d’insertion ne doit jamais influencer le résultat. */
export function sortRegistryEntries(
  entries: readonly TaxRuleRegistryEntry[]
): TaxRuleRegistryEntry[] {
  return [...entries].sort((a, b) => {
    const k =
      a.ruleId.localeCompare(b.ruleId) ||
      a.version.localeCompare(b.version) ||
      a.kind.localeCompare(b.kind) ||
      a.taxYears.join(",").localeCompare(b.taxYears.join(","));
    return k;
  });
}

export interface BuildTaxRuleRegistryOptions {
  formulas?: readonly TaxFormula[];
  applicabilityRules?: readonly TaxApplicabilityRule[];
  extraEntries?: readonly TaxRuleRegistryEntry[];
}

/**
 * Registre production + entrées additionnelles (tests).
 * Toujours trié de façon déterministe.
 */
export function buildTaxRuleRegistry(
  options: BuildTaxRuleRegistryOptions = {}
): TaxRuleRegistryEntry[] {
  const formulas = options.formulas ?? TAX_FORMULAS;
  const appRules = options.applicabilityRules ?? TAX_APPLICABILITY_RULES;
  const extras = options.extraEntries ?? [];
  return sortRegistryEntries([
    ...formulas.map(entryFromFormula),
    ...appRules.map(entryFromApplicabilityRule),
    ...extras
  ]);
}

export function listRegistryRuleIds(
  entries?: readonly TaxRuleRegistryEntry[]
): string[] {
  const list = entries ?? buildTaxRuleRegistry();
  return [...new Set(list.map((e) => e.ruleId))].sort();
}
