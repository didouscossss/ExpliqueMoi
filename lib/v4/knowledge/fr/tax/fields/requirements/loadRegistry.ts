/**
 * Charge le registre des requirements fiscaux — offline, 0 fetch.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FrenchTaxFieldRequirements,
  FrenchTaxFieldRequirementsRegistry
} from "../../../../../types/knowledge.js";
import { PRIORITY_TAX_FIELD_REQUIREMENTS } from "./priorityRequirements.js";

export const FRENCH_TAX_FIELD_REQUIREMENTS_VERSION = "2026.08.08-v4q1";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_CANDIDATES = [
  join(
    HERE,
    "../../../../../../../generated/french-tax-field-requirements.json"
  ),
  join(process.cwd(), "generated/french-tax-field-requirements.json")
];

let cached: FrenchTaxFieldRequirementsRegistry | null = null;
let byCode: Map<string, FrenchTaxFieldRequirements[]> | null = null;

export function buildSeedRequirementsRegistry(
  generatedAt: string = new Date().toISOString()
): FrenchTaxFieldRequirementsRegistry {
  return {
    version: FRENCH_TAX_FIELD_REQUIREMENTS_VERSION,
    country: "FR",
    generatedAt,
    sourceMode: "curated-official",
    entries: [...PRIORITY_TAX_FIELD_REQUIREMENTS]
  };
}

function buildIndex(
  registry: FrenchTaxFieldRequirementsRegistry
): Map<string, FrenchTaxFieldRequirements[]> {
  const map = new Map<string, FrenchTaxFieldRequirements[]>();
  for (const e of registry.entries) {
    const list = map.get(e.normalizedCode) || [];
    list.push(e);
    map.set(e.normalizedCode, list);
  }
  return map;
}

export function loadFrenchTaxFieldRequirementsRegistry(): FrenchTaxFieldRequirementsRegistry {
  if (cached) return cached;
  for (const path of ARTIFACT_CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(
        readFileSync(path, "utf8")
      ) as FrenchTaxFieldRequirementsRegistry;
      if (raw?.entries?.length) {
        cached = raw;
        byCode = buildIndex(raw);
        return cached;
      }
    } catch {
      // fall through
    }
  }
  cached = buildSeedRequirementsRegistry("seed-runtime");
  byCode = buildIndex(cached);
  return cached;
}

export function getFrenchTaxFieldRequirementsIndex(): Map<
  string,
  FrenchTaxFieldRequirements[]
> {
  if (!byCode) loadFrenchTaxFieldRequirementsRegistry();
  return byCode!;
}

export function resetFrenchTaxFieldRequirementsCacheForTests(): void {
  cached = null;
  byCode = null;
}

export function lookupRequirementsByCode(
  code: string
): FrenchTaxFieldRequirements[] {
  const key = code.toUpperCase().replace(/\s+/g, "");
  return getFrenchTaxFieldRequirementsIndex().get(key) || [];
}
