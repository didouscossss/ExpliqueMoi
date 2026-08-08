/**
 * Charge le registre fiscal FR — artefact local offline.
 * Runtime : 0 fetch.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry
} from "../../../../types/knowledge.js";
import {
  FRENCH_TAX_REGISTRY_SEED,
  FRENCH_TAX_REGISTRY_VERSION
} from "./seed.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_CANDIDATES = [
  join(HERE, "../../../../../../generated/french-tax-registry.json"),
  join(process.cwd(), "generated/french-tax-registry.json")
];

let cached: FrenchTaxDocumentRegistry | null = null;

export function buildRegistryFromSeed(
  generatedAt: string = new Date().toISOString()
): FrenchTaxDocumentRegistry {
  return {
    version: FRENCH_TAX_REGISTRY_VERSION,
    country: "FR",
    generatedAt,
    sourceMode: "curated-official",
    entries: [...FRENCH_TAX_REGISTRY_SEED]
  };
}

export function loadFrenchTaxRegistry(): FrenchTaxDocumentRegistry {
  if (cached) return cached;
  for (const path of ARTIFACT_CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as FrenchTaxDocumentRegistry;
      if (raw?.entries?.length) {
        cached = raw;
        return cached;
      }
    } catch {
      // fall through to seed
    }
  }
  cached = buildRegistryFromSeed("seed-runtime");
  return cached;
}

export function resetFrenchTaxRegistryCacheForTests(): void {
  cached = null;
}

export function lookupByReference(
  registry: FrenchTaxDocumentRegistry,
  normalizedRef: string
): FrenchTaxDocumentEntry | null {
  const key = normalizedRef.toUpperCase().replace(/\s+/g, "");
  for (const e of registry.entries) {
    for (const r of e.referenceNumbers) {
      if (r.toUpperCase().replace(/\s+/g, "") === key) return e;
    }
    for (const a of e.aliases) {
      if (a.toUpperCase().replace(/\s+/g, "") === key) return e;
    }
  }
  return null;
}

export function lookupById(
  registry: FrenchTaxDocumentRegistry,
  id: string
): FrenchTaxDocumentEntry | null {
  return registry.entries.find((e) => e.id === id) || null;
}

export function knowledgeFactsForEntry(
  entry: FrenchTaxDocumentEntry
): import("../../../../types/knowledge.js").KnowledgeFact[] {
  return [
    {
      kind: "knowledge",
      id: `kf:${entry.id}:title`,
      country: "FR",
      statement: `${entry.referenceNumbers[0] || entry.id} correspond à « ${entry.officialTitle} ».`,
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
