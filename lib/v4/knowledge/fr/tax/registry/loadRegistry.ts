/**
 * Charge le registre fiscal FR — artefact local offline.
 * Runtime : 0 fetch. Index O(1) pour lookup.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry,
  KnowledgeFact
} from "../../../../types/knowledge.js";
import {
  buildSeedRegistry,
  FRENCH_TAX_REGISTRY_VERSION
} from "./seed.js";
import { buildRegistryIndex, type FrenchTaxRegistryIndex } from "./indexes.js";
import { lookupRegistry, type RegistryLookupResult } from "./lookup.js";
import { normalizeTaxReference } from "../normalize/normalizeReference.js";
import { enrichRegistryWithSemantics } from "../semantic/applySemantics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_CANDIDATES = [
  join(HERE, "../../../../../../generated/french-tax-registry.json"),
  join(process.cwd(), "generated/french-tax-registry.json")
];

let cached: FrenchTaxDocumentRegistry | null = null;
let cachedIndex: FrenchTaxRegistryIndex | null = null;

export function buildRegistryFromSeed(
  generatedAt: string = new Date().toISOString()
): FrenchTaxDocumentRegistry {
  return enrichRegistryWithSemantics(buildSeedRegistry(generatedAt));
}

export function loadFrenchTaxRegistry(): FrenchTaxDocumentRegistry {
  if (cached) return cached;
  for (const path of ARTIFACT_CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as FrenchTaxDocumentRegistry;
      if (raw?.entries?.length) {
        // V4-N — packs sémantiques prioritaires appliqués offline au chargement
        cached = enrichRegistryWithSemantics(raw);
        cachedIndex = buildRegistryIndex(cached);
        return cached;
      }
    } catch {
      // fall through to seed
    }
  }
  cached = buildRegistryFromSeed("seed-runtime");
  cachedIndex = buildRegistryIndex(cached);
  return cached;
}

export function getFrenchTaxRegistryIndex(): FrenchTaxRegistryIndex {
  if (!cachedIndex) loadFrenchTaxRegistry();
  return cachedIndex!;
}

export function resetFrenchTaxRegistryCacheForTests(): void {
  cached = null;
  cachedIndex = null;
}

export function lookupByReference(
  registry: FrenchTaxDocumentRegistry,
  normalizedRef: string
): FrenchTaxDocumentEntry | null {
  const index = buildRegistryIndex(registry);
  const res = lookupRegistry(index, normalizedRef);
  if (res.matchKind === "none" || res.matchKind === "possible") {
    // Compat V4-L : possible ne compte pas comme hit fort pour detector
    if (res.matchKind === "possible") return null;
    return null;
  }
  return res.entry;
}

export function lookupReferenceDetailed(
  query: string
): RegistryLookupResult {
  const index = getFrenchTaxRegistryIndex();
  return lookupRegistry(index, query);
}

export function lookupById(
  registry: FrenchTaxDocumentRegistry,
  id: string
): FrenchTaxDocumentEntry | null {
  return registry.entries.find((e) => e.id === id) || null;
}

export function knowledgeFactsForEntry(
  entry: FrenchTaxDocumentEntry
): KnowledgeFact[] {
  return [
    {
      kind: "knowledge",
      id: `kf:${entry.id}:title`,
      country: "FR",
      statement: `${entry.normalizedReference || entry.referenceNumbers[0] || entry.id} correspond à « ${entry.officialTitle} ».`,
      subjectId: entry.id,
      fields: ["officialTitle", "reference"],
      provenance: entry.officialSources,
      confidence: entry.confidence
    },
    {
      kind: "knowledge",
      id: `kf:${entry.id}:purpose`,
      country: "FR",
      statement: entry.purpose,
      subjectId: entry.id,
      fields: ["purpose"],
      provenance: entry.officialSources,
      confidence: entry.confidence
    }
  ];
}

export function knownNormalizedReferences(): Set<string> {
  return getFrenchTaxRegistryIndex().knownReferences;
}

export { FRENCH_TAX_REGISTRY_VERSION, normalizeTaxReference };
