/**
 * Configuration générique du fournisseur IA V3.
 * Aucune clé n’est lue ni utilisée à cette étape — structure seule.
 */

import type { AIProviderName } from "./AIProvider.js";

export interface ProviderConfig {
  /**
   * Fournisseur actif (ex. `"gemini" | "openai" | "mistral"`).
   * Résolu plus tard par ProviderFactory lorsque des adapters existeront.
   */
  provider: AIProviderName;

  /** Modèle optionnel (ex. `"gemini-3.5-flash"`). */
  model?: string;

  /** Timeout optionnel en millisecondes. */
  timeoutMs?: number;

  /**
   * Réserve pour options futures (température, etc.).
   * Ne doit jamais contenir de secrets loggés.
   */
  options?: Record<string, unknown>;
}

/** Config par défaut — aucun provider concret n’est encore enregistré. */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: "none",
  model: undefined,
  timeoutMs: 45_000,
  options: {}
};

/**
 * Construit une ProviderConfig depuis un objet partiel / variables d’env
 * sans effectuer d’appel réseau ni lire de secrets.
 */
export function createProviderConfig(
  partial: Partial<ProviderConfig> = {}
): ProviderConfig {
  const provider =
    String(partial.provider || DEFAULT_PROVIDER_CONFIG.provider).trim() ||
    DEFAULT_PROVIDER_CONFIG.provider;

  return {
    provider,
    model:
      partial.model === undefined || partial.model === null
        ? DEFAULT_PROVIDER_CONFIG.model
        : String(partial.model),
    timeoutMs:
      Number(partial.timeoutMs) > 0
        ? Number(partial.timeoutMs)
        : DEFAULT_PROVIDER_CONFIG.timeoutMs,
    options: { ...(partial.options || {}) }
  };
}
