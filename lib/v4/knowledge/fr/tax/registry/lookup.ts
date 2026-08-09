/**
 * Lookup registre — exact / normalized / cerfa / alias / possible / none.
 * possible ≠ certitude.
 */

import type {
  FrenchTaxDocumentEntry,
  RegistryLookupMatchKind
} from "../../../../types/knowledge.js";
import { normalizeTaxReference } from "../normalize/normalizeReference.js";
import type { FrenchTaxRegistryIndex } from "./indexes.js";

export interface RegistryLookupResult {
  matchKind: RegistryLookupMatchKind;
  entry: FrenchTaxDocumentEntry | null;
  confidence: number;
  normalizedQuery: string;
}

export function lookupRegistry(
  index: FrenchTaxRegistryIndex,
  query: string
): RegistryLookupResult {
  const q = String(query || "").trim();
  if (!q) {
    return { matchKind: "none", entry: null, confidence: 0, normalizedQuery: "" };
  }

  // Cerfa shape: 5 digits optional *version
  if (/^\d{5}([*#]\d+)?$/.test(q.replace(/\s/g, ""))) {
    const key = q.replace(/\s/g, "").toUpperCase();
    const base = key.split(/[*#]/)[0]!;
    const hits = index.byCerfa.get(key) || index.byCerfa.get(base) || [];
    if (hits.length === 1) {
      return {
        matchKind: "cerfa",
        entry: hits[0]!,
        confidence: 0.85,
        normalizedQuery: key
      };
    }
    if (hits.length > 1) {
      return {
        matchKind: "possible",
        entry: hits[0]!,
        confidence: 0.4,
        normalizedQuery: key
      };
    }
  }

  const norm = normalizeTaxReference(q);
  const exact = index.byNormalizedReference.get(norm.normalizedReference);
  if (exact) {
    const kind: RegistryLookupMatchKind =
      q.toUpperCase().replace(/\s+/g, "-") === norm.normalizedReference
        ? "exact"
        : "normalized";
    return {
      matchKind: kind,
      entry: exact,
      confidence: kind === "exact" ? 0.95 : 0.9,
      normalizedQuery: norm.normalizedReference
    };
  }

  // Alias
  const aliasKey = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const byAlias = index.byAlias.get(aliasKey);
  if (byAlias) {
    return {
      matchKind: "alias",
      entry: byAlias,
      confidence: 0.8,
      normalizedQuery: norm.normalizedReference
    };
  }

  // Possible: base reference only matches a family of variants
  if (norm.variantParts.length === 0) {
    const variants = [...index.byNormalizedReference.keys()].filter(
      (k) => k === norm.baseReference || k.startsWith(`${norm.baseReference}-`)
    );
    if (variants.length === 1) {
      return {
        matchKind: "possible",
        entry: index.byNormalizedReference.get(variants[0]!)!,
        confidence: 0.45,
        normalizedQuery: norm.normalizedReference
      };
    }
    if (variants.length > 1) {
      const base = index.byNormalizedReference.get(norm.baseReference);
      return {
        matchKind: "possible",
        entry: base || index.byNormalizedReference.get(variants[0]!)!,
        confidence: 0.35,
        normalizedQuery: norm.normalizedReference
      };
    }
  }

  return {
    matchKind: "none",
    entry: null,
    confidence: 0,
    normalizedQuery: norm.normalizedReference
  };
}
