/**
 * Lookup requirements par documentRef + fieldCode + year — offline.
 * Ne jamais appliquer silencieusement un millésime différent.
 */

import type { FrenchTaxFieldRequirements } from "../../../../../types/knowledge.js";
import {
  getFrenchTaxFieldRequirementsIndex,
  loadFrenchTaxFieldRequirementsRegistry
} from "./loadRegistry.js";

export interface TaxFieldRequirementsLookupQuery {
  documentRef?: string | null;
  fieldCode: string;
  year?: number | null;
}

export interface TaxFieldRequirementsLookupResult {
  entry: FrenchTaxFieldRequirements | null;
  matchKind: "exact" | "stable" | "partial" | "none";
  reasons: string[];
}

export function lookupTaxFieldRequirements(
  query: TaxFieldRequirementsLookupQuery
): TaxFieldRequirementsLookupResult {
  loadFrenchTaxFieldRequirementsRegistry();
  const code = query.fieldCode.toUpperCase().replace(/\s+/g, "");
  const candidates = getFrenchTaxFieldRequirementsIndex().get(code) || [];
  const reasons: string[] = [];

  if (!candidates.length) {
    return { entry: null, matchKind: "none", reasons: ["requirement_absent"] };
  }

  let pool = candidates;
  if (query.documentRef) {
    const ref = query.documentRef.toUpperCase();
    const filtered = candidates.filter((e) =>
      e.documentRefs.some((r) => r.toUpperCase() === ref || ref.includes(r.toUpperCase()))
    );
    if (filtered.length) {
      pool = filtered;
      reasons.push("documentRef_match");
    } else {
      reasons.push("documentRef_mismatch_kept_code_only");
    }
  }

  const entry = pool[0];
  if (query.year == null) {
    reasons.push("year_unknown");
    return {
      entry,
      matchKind: entry.yearStable ? "stable" : "partial",
      reasons
    };
  }

  if (entry.applicableYears.includes(query.year)) {
    reasons.push("year_exact");
    return { entry, matchKind: "exact", reasons };
  }

  if (entry.yearStable) {
    reasons.push("year_outside_list_but_marked_stable_needs_review");
    return { entry, matchKind: "partial", reasons };
  }

  reasons.push("year_mismatch");
  return { entry: null, matchKind: "none", reasons };
}

export function knownRequirementFieldCodes(): string[] {
  return [...getFrenchTaxFieldRequirementsIndex().keys()].sort();
}
