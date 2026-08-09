/**
 * Charge le registre des cases fiscales — offline, 0 fetch.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FrenchTaxFieldEntry,
  FrenchTaxFieldRegistry
} from "../../../../types/knowledge.js";
import { PRIORITY_TAX_FIELDS } from "./priorityFields.js";

export const FRENCH_TAX_FIELD_REGISTRY_VERSION = "2026.08.08-v4p1";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_CANDIDATES = [
  join(HERE, "../../../../../../generated/french-tax-field-registry.json"),
  join(process.cwd(), "generated/french-tax-field-registry.json")
];

let cached: FrenchTaxFieldRegistry | null = null;
let byCode: Map<string, FrenchTaxFieldEntry[]> | null = null;

export function buildSeedFieldRegistry(
  generatedAt: string = new Date().toISOString()
): FrenchTaxFieldRegistry {
  return {
    version: FRENCH_TAX_FIELD_REGISTRY_VERSION,
    country: "FR",
    generatedAt,
    sourceMode: "curated-official",
    entries: [...PRIORITY_TAX_FIELDS]
  };
}

function buildIndex(registry: FrenchTaxFieldRegistry): Map<string, FrenchTaxFieldEntry[]> {
  const map = new Map<string, FrenchTaxFieldEntry[]>();
  for (const e of registry.entries) {
    const list = map.get(e.normalizedCode) || [];
    list.push(e);
    map.set(e.normalizedCode, list);
  }
  return map;
}

export function loadFrenchTaxFieldRegistry(): FrenchTaxFieldRegistry {
  if (cached) return cached;
  for (const path of ARTIFACT_CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as FrenchTaxFieldRegistry;
      if (raw?.entries?.length) {
        cached = raw;
        byCode = buildIndex(raw);
        return cached;
      }
    } catch {
      // fall through
    }
  }
  cached = buildSeedFieldRegistry("seed-runtime");
  byCode = buildIndex(cached);
  return cached;
}

export function getFrenchTaxFieldIndex(): Map<string, FrenchTaxFieldEntry[]> {
  if (!byCode) loadFrenchTaxFieldRegistry();
  return byCode!;
}

export function resetFrenchTaxFieldRegistryCacheForTests(): void {
  cached = null;
  byCode = null;
}

export function lookupFieldByCode(code: string): FrenchTaxFieldEntry[] {
  const key = code.toUpperCase().replace(/\s+/g, "");
  return getFrenchTaxFieldIndex().get(key) || [];
}
