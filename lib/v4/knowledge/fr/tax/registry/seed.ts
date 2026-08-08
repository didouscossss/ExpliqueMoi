/**
 * Seed / version registry V4-M.
 * Les entrées runtime viennent du pipeline discovery (snapshot officiel)
 * ou de l’artefact generated/french-tax-registry.json.
 */

import { runDiscoveryPipeline } from "../discovery/pipeline.js";

export const FRENCH_TAX_REGISTRY_VERSION = "2026.08.08-v4n1";

/** Construit le registre depuis le snapshot offline + enrichissements. */
export function buildSeedRegistry(generatedAt: string = "seed-runtime") {
  return runDiscoveryPipeline({
    generatedAt,
    version: FRENCH_TAX_REGISTRY_VERSION
  }).registry;
}

/** Entrées seed (évaluation lazy via getter pour éviter coût import inutile). */
export const FRENCH_TAX_REGISTRY_SEED = {
  get entries() {
    return buildSeedRegistry("seed-entries").entries;
  }
};
