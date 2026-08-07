/**
 * Configuration générique du fournisseur IA V3.
 */

import type { AIProviderName } from "./AIProvider.js";
import { DEFAULT_OPENAI_MODEL } from "./openaiConstants.js";

export interface ProviderConfig {
  /**
   * Fournisseur actif (ex. `"openai"`).
   */
  provider: AIProviderName;

  /** Modèle unique (ex. OPENAI_MODEL / gpt-4o-mini). */
  model?: string;

  /** Timeout optionnel en millisecondes. */
  timeoutMs?: number;

  /**
   * Options non loggées (ex. apiKey injectée depuis l’env serveur).
   */
  options?: Record<string, unknown>;
}

/** Config par défaut V3 étape F : OpenAI. */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: "openai",
  model: DEFAULT_OPENAI_MODEL,
  timeoutMs: 45_000,
  options: {}
};

/**
 * Construit une ProviderConfig depuis un objet partiel
 * sans effectuer d’appel réseau.
 */
export function createProviderConfig(
  partial: Partial<ProviderConfig> = {}
): ProviderConfig {
  const provider =
    String(partial.provider || DEFAULT_PROVIDER_CONFIG.provider).trim() ||
    DEFAULT_PROVIDER_CONFIG.provider;

  let model: string | undefined;
  if (partial.model === undefined || partial.model === null || partial.model === "") {
    model =
      provider === "openai"
        ? DEFAULT_OPENAI_MODEL
        : DEFAULT_PROVIDER_CONFIG.model;
  } else {
    model = String(partial.model);
  }

  return {
    provider,
    model,
    timeoutMs:
      Number(partial.timeoutMs) > 0
        ? Number(partial.timeoutMs)
        : DEFAULT_PROVIDER_CONFIG.timeoutMs,
    options: { ...(partial.options || {}) }
  };
}

/**
 * Lit la config depuis les variables d’environnement serveur uniquement.
 * OPENAI_API_KEY n’est jamais exposée au frontend.
 */
export function createProviderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ProviderConfig {
  const provider = String(env.AI_PROVIDER || "openai")
    .trim()
    .toLowerCase() || "openai";

  const model =
    provider === "openai"
      ? String(env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() ||
        DEFAULT_OPENAI_MODEL
      : env.OPENAI_MODEL
        ? String(env.OPENAI_MODEL).trim()
        : undefined;

  const apiKey = String(env.OPENAI_API_KEY || "").trim();

  return createProviderConfig({
    provider,
    model,
    options: apiKey ? { apiKey } : {}
  });
}
