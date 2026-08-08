/**
 * Index locaux pour lookup O(1) — runtime offline.
 */

import type { FrenchTaxDocumentEntry, FrenchTaxDocumentRegistry } from "../../../../types/knowledge.js";
import { normalizeTaxReference } from "../normalize/normalizeReference.js";

export interface FrenchTaxRegistryIndex {
  byNormalizedReference: Map<string, FrenchTaxDocumentEntry>;
  byCerfa: Map<string, FrenchTaxDocumentEntry[]>;
  byAlias: Map<string, FrenchTaxDocumentEntry>;
  byId: Map<string, FrenchTaxDocumentEntry>;
  knownReferences: Set<string>;
}

function aliasKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRegistryIndex(
  registry: FrenchTaxDocumentRegistry
): FrenchTaxRegistryIndex {
  const byNormalizedReference = new Map<string, FrenchTaxDocumentEntry>();
  const byCerfa = new Map<string, FrenchTaxDocumentEntry[]>();
  const byAlias = new Map<string, FrenchTaxDocumentEntry>();
  const byId = new Map<string, FrenchTaxDocumentEntry>();
  const knownReferences = new Set<string>();

  for (const e of registry.entries) {
    byId.set(e.id, e);
    const norm =
      e.normalizedReference ||
      normalizeTaxReference(e.referenceNumbers[0] || "").normalizedReference;
    if (norm) {
      byNormalizedReference.set(norm, e);
      knownReferences.add(norm);
      // also without -SD for possible match
      if (norm.endsWith("-SD")) knownReferences.add(norm.slice(0, -3));
    }
    for (const r of e.referenceNumbers) {
      const n = normalizeTaxReference(r).normalizedReference;
      knownReferences.add(n);
      if (!byNormalizedReference.has(n)) byNormalizedReference.set(n, e);
    }
    for (const c of e.cerfaNumbers) {
      const key = c.replace(/\s+/g, "").toUpperCase();
      const base = key.split(/[*#]/)[0]!;
      const list = byCerfa.get(base) || [];
      list.push(e);
      byCerfa.set(base, list);
      byCerfa.set(key, list);
    }
    for (const a of e.aliases) {
      byAlias.set(aliasKey(a), e);
    }
  }

  return {
    byNormalizedReference,
    byCerfa,
    byAlias,
    byId,
    knownReferences
  };
}
