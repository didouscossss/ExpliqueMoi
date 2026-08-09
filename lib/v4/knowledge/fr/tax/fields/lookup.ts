/**
 * Lookup cases fiscales — déterministe, offline.
 * Clé : documentRef + fieldCode + year (lorsque connu).
 */

import type { FrenchTaxFieldEntry } from "../../../../types/knowledge.js";
import { loadFrenchTaxFieldRegistry, lookupFieldByCode } from "./loadRegistry.js";
import { getPriorityTaxField } from "./priorityFields.js";
import { normalizeTaxFieldCode } from "./normalizeFieldCode.js";

export interface TaxFieldLookupQuery {
  documentRef?: string | null;
  fieldCode: string;
  year?: number | null;
}

export interface TaxFieldLookupResult {
  entry: FrenchTaxFieldEntry | null;
  matchKind: "exact" | "yearAgnostic" | "partial" | "none";
  reason: string;
}

export function lookupTaxField(query: TaxFieldLookupQuery): TaxFieldLookupResult {
  const norm = normalizeTaxFieldCode(query.fieldCode);
  if (!norm.valid) {
    return { entry: null, matchKind: "none", reason: "invalidCode" };
  }

  const candidates = lookupFieldByCode(norm.normalizedCode);
  const pack = getPriorityTaxField(norm.normalizedCode);
  const pool = candidates.length ? candidates : pack ? [pack] : [];
  if (!pool.length) {
    return { entry: null, matchKind: "none", reason: "unknownField" };
  }

  let filtered = pool;
  if (query.documentRef) {
    const ref = query.documentRef.toUpperCase();
    const byDoc = pool.filter((e) =>
      e.documentRefs.some((d) => d.toUpperCase() === ref)
    );
    if (byDoc.length) filtered = byDoc;
  }

  if (query.year != null) {
    const yearHits = filtered.filter((e) => e.applicableYears.includes(query.year!));
    if (yearHits.length === 1) {
      return { entry: yearHits[0]!, matchKind: "exact", reason: "document+code+year" };
    }
    if (yearHits.length > 1) {
      // préférer yearStable verified
      const preferred =
        yearHits.find((e) => e.qualityStatus === "verified" && e.yearStable) ||
        yearHits[0]!;
      return { entry: preferred, matchKind: "exact", reason: "document+code+year" };
    }
    // Année connue mais non listée — ne pas appliquer silencieusement une autre année
    const stable = filtered.find((e) => e.yearStable && e.qualityStatus === "verified");
    if (stable) {
      return {
        entry: {
          ...stable,
          qualityStatus:
            stable.qualityStatus === "verified"
              ? "partiallyVerified"
              : stable.qualityStatus
        },
        matchKind: "partial",
        reason: "yearNotListed-stableFallback"
      };
    }
    return {
      entry: filtered[0]
        ? { ...filtered[0], qualityStatus: "needsReview" }
        : null,
      matchKind: "partial",
      reason: "yearMismatch"
    };
  }

  const best =
    filtered.find((e) => e.qualityStatus === "verified") || filtered[0]!;
  return {
    entry: best,
    matchKind: query.documentRef ? "yearAgnostic" : "yearAgnostic",
    reason: query.documentRef ? "document+code" : "codeOnly"
  };
}

export function findRelatedTaxFields(
  fieldCode: string
): FrenchTaxFieldEntry[] {
  const res = lookupTaxField({ fieldCode });
  if (!res.entry) return [];
  const out: FrenchTaxFieldEntry[] = [];
  for (const rel of res.entry.relatedFields) {
    const t = lookupTaxField({ fieldCode: rel }).entry;
    if (t) out.push(t);
  }
  return out;
}

export function knownTaxFieldCodes(): Set<string> {
  const reg = loadFrenchTaxFieldRegistry();
  return new Set(reg.entries.map((e) => e.normalizedCode));
}
