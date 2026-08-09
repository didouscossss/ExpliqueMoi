/**
 * Audit déterministe du registre de règles fiscales — V4-W.
 */

import type {
  TaxFormula,
  TaxRuleRegistryEntry,
  TaxRuleRegistryInvariants
} from "../../../../types/knowledge.js";
import { TAX_FORMULAS } from "../calculation/formulas.js";
import { buildTaxRuleRegistry, sortRegistryEntries } from "./buildEntries.js";
import { emptyRuleRegistryInvariants, entryCoversYear } from "./resolve.js";

export interface TaxRuleRegistryAuditIssue {
  code: string;
  ruleId?: string;
  version?: string;
  detail: string;
}

export interface TaxRuleRegistryAuditReport {
  ok: boolean;
  issues: TaxRuleRegistryAuditIssue[];
  invariants: TaxRuleRegistryInvariants;
  entryCount: number;
  calculationCount: number;
  applicabilityCount: number;
}

export function auditTaxRuleRegistry(
  entries?: readonly TaxRuleRegistryEntry[],
  formulas: readonly TaxFormula[] = TAX_FORMULAS
): TaxRuleRegistryAuditReport {
  const list = sortRegistryEntries(entries ?? buildTaxRuleRegistry({ formulas }));
  const issues: TaxRuleRegistryAuditIssue[] = [];
  const invariants = emptyRuleRegistryInvariants();
  const formulaById = new Map(formulas.map((f) => [f.formulaId, f]));

  // duplicate ruleId + version
  const seen = new Map<string, TaxRuleRegistryEntry>();
  for (const e of list) {
    const key = `${e.ruleId}@@${e.version}`;
    const prev = seen.get(key);
    if (prev) {
      const same =
        JSON.stringify(canon(prev)) === JSON.stringify(canon(e));
      if (!same) {
        issues.push({
          code: "duplicateRuleVersionIncompatible",
          ruleId: e.ruleId,
          version: e.version,
          detail: "Même ruleId+version avec contenu incompatible."
        });
      } else {
        issues.push({
          code: "duplicateRuleVersion",
          ruleId: e.ruleId,
          version: e.version,
          detail: "Entrée dupliquée (ruleId+version)."
        });
      }
    } else {
      seen.set(key, e);
    }

    if (e.status === "verified") {
      if (!e.sourceRefs.length || !e.provenance?.length) {
        issues.push({
          code: "unsourcedVerifiedRule",
          ruleId: e.ruleId,
          version: e.version,
          detail: "Règle verified sans sourceRefs/provenance."
        });
        invariants.unsourcedVerifiedRules += 1;
      }
      if (!e.sourceExcerpt) {
        issues.push({
          code: "verifiedWithoutExcerpt",
          ruleId: e.ruleId,
          version: e.version,
          detail: "Règle verified sans sourceExcerpt."
        });
      }
    }

    if (!e.version || !String(e.version).trim()) {
      issues.push({
        code: "invalidVersion",
        ruleId: e.ruleId,
        detail: "Version vide ou invalide."
      });
    }

    if (e.kind === "calculation") {
      if (!e.formulaId) {
        issues.push({
          code: "calculationWithoutFormulaId",
          ruleId: e.ruleId,
          version: e.version,
          detail: "Entrée calculation sans formulaId."
        });
      } else if (!formulaById.has(e.formulaId)) {
        // extras may be absent from production formulas — only flag if no formulas passed matching
        const inProvided = formulas.some((f) => f.formulaId === e.formulaId);
        if (!inProvided && formulas === TAX_FORMULAS) {
          issues.push({
            code: "missingFormulaBinding",
            ruleId: e.ruleId,
            version: e.version,
            detail: `formulaId inconnu: ${e.formulaId}`
          });
        }
      } else {
        const f = formulaById.get(e.formulaId)!;
        if (f.verificationStatus === "verified" && !f.provenance?.length) {
          issues.push({
            code: "calculatedFormulaWithoutProvenance",
            ruleId: e.ruleId,
            version: e.version,
            detail: "Formule verified sans provenance."
          });
        }
      }
    }
  }

  // overlap ambigu de périodes pour un même ruleId (versions verified distinctes)
  const byRule = new Map<string, TaxRuleRegistryEntry[]>();
  for (const e of list) {
    if (e.status !== "verified") continue;
    const arr = byRule.get(e.ruleId) || [];
    arr.push(e);
    byRule.set(e.ruleId, arr);
  }
  for (const [ruleId, versions] of byRule) {
    if (versions.length < 2) continue;
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        const a = versions[i]!;
        const b = versions[j]!;
        if (yearsOverlap(a, b)) {
          issues.push({
            code: "ambiguousPeriodOverlap",
            ruleId,
            version: `${a.version}/${b.version}`,
            detail: `Chevauchement d'années entre ${a.version} et ${b.version}.`
          });
        }
      }
    }
  }

  // deux formules concurrentes verified pour le même fieldCode + année
  const calc = list.filter(
    (e) => e.kind === "calculation" && e.status === "verified"
  );
  for (let i = 0; i < calc.length; i++) {
    for (let j = i + 1; j < calc.length; j++) {
      const a = calc[i]!;
      const b = calc[j]!;
      if (a.formulaId === b.formulaId && a.version === b.version) continue;
      const sharedFields = a.fieldCodes.filter((c) =>
        b.fieldCodes.includes(c)
      );
      if (!sharedFields.length) continue;
      if (yearsOverlap(a, b)) {
        issues.push({
          code: "concurrentFormulasSameScope",
          ruleId: `${a.ruleId}|${b.ruleId}`,
          version: `${a.version}/${b.version}`,
          detail: `Formules concurrentes sur ${sharedFields.join(",")}.`
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    invariants,
    entryCount: list.length,
    calculationCount: list.filter((e) => e.kind === "calculation").length,
    applicabilityCount: list.filter((e) => e.kind === "applicability").length
  };
}

function yearsOverlap(a: TaxRuleRegistryEntry, b: TaxRuleRegistryEntry): boolean {
  const yearsA = expandYears(a);
  const yearsB = expandYears(b);
  for (const y of yearsA) {
    if (yearsB.has(y)) return true;
  }
  // effective ranges without explicit taxYears
  if (!a.taxYears.length && !b.taxYears.length) {
    const aFrom = a.effectiveFrom ?? Number.NEGATIVE_INFINITY;
    const aTo = a.effectiveTo ?? Number.POSITIVE_INFINITY;
    const bFrom = b.effectiveFrom ?? Number.NEGATIVE_INFINITY;
    const bTo = b.effectiveTo ?? Number.POSITIVE_INFINITY;
    return aFrom <= bTo && bFrom <= aTo;
  }
  return false;
}

function expandYears(e: TaxRuleRegistryEntry): Set<number> {
  const s = new Set<number>(e.taxYears);
  if (e.effectiveFrom != null && e.effectiveTo != null) {
    for (let y = e.effectiveFrom; y <= e.effectiveTo; y++) s.add(y);
  }
  // also mark years covered via entryCoversYear helper for taxYears only
  for (const y of e.taxYears) {
    if (entryCoversYear(e, y)) s.add(y);
  }
  return s;
}

function canon(e: TaxRuleRegistryEntry) {
  return {
    ruleId: e.ruleId,
    kind: e.kind,
    fieldCodes: [...e.fieldCodes].sort(),
    taxYears: [...e.taxYears].sort((a, b) => a - b),
    effectiveFrom: e.effectiveFrom ?? null,
    effectiveTo: e.effectiveTo ?? null,
    version: e.version,
    status: e.status,
    sourceRefs: [...e.sourceRefs].sort(),
    formulaId: e.formulaId ?? null,
    applicabilityRuleId: e.applicabilityRuleId ?? null,
    sourceExcerpt: e.sourceExcerpt ?? null
  };
}
