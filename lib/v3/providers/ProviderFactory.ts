/**
 * Fabrique des fournisseurs IA V3.
 * Étape F : seul OpenAIProvider est enregistré.
 */

import type { AIProvider, AIProviderName } from "./AIProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import {
  createProviderConfig,
  createProviderConfigFromEnv,
  type ProviderConfig
} from "./ProviderConfig.js";
import { ProviderError } from "./ProviderError.js";

export type AIProviderConstructor = new (
  config: ProviderConfig,
  options?: { fetchImpl?: typeof fetch; requestId?: string }
) => AIProvider;

/**
 * Registre + fabrique.
 */
export class ProviderFactory {
  private readonly registry = new Map<AIProviderName, AIProviderConstructor>();
  private defaultsReady = false;

  /** Enregistre un constructeur de provider. */
  register(name: AIProviderName, ctor: AIProviderConstructor): void {
    const key = String(name || "")
      .trim()
      .toLowerCase();
    if (!key) {
      throw new Error("ProviderFactory.register: nom de provider invalide.");
    }
    this.registry.set(key, ctor);
  }

  /** Enregistre les providers concrets autorisés (OpenAI seul pour F). */
  ensureDefaults(): void {
    if (this.defaultsReady) {
      return;
    }
    if (!this.registry.has("openai")) {
      this.register("openai", OpenAIProvider);
    }
    this.defaultsReady = true;
  }

  has(name: AIProviderName): boolean {
    this.ensureDefaults();
    return this.registry.has(String(name || "").trim().toLowerCase());
  }

  list(): AIProviderName[] {
    this.ensureDefaults();
    return [...this.registry.keys()].sort();
  }

  create(
    config: Partial<ProviderConfig> | ProviderConfig = {},
    options: { fetchImpl?: typeof fetch; requestId?: string } = {}
  ): AIProvider {
    this.ensureDefaults();
    const resolved = createProviderConfig(config);
    const key = String(resolved.provider || "")
      .trim()
      .toLowerCase();

    const ctor = this.registry.get(key);
    if (!ctor) {
      const available = this.list();
      throw new ProviderError({
        code: "UNKNOWN_PROVIDER",
        message:
          `Provider inconnu: "${resolved.provider}".` +
          (available.length
            ? ` Disponibles: ${available.join(", ")}.`
            : ""),
        provider: resolved.provider || "unknown",
        httpStatus: 400
      });
    }

    return new ctor(resolved, options);
  }
}

/** Instance partagée. */
export const providerFactory = new ProviderFactory();

/**
 * Point d’entrée moteur V3.
 * Par défaut: AI_PROVIDER / OPENAI_* depuis l’environnement serveur.
 */
export function getAIProvider(
  config: Partial<ProviderConfig> | ProviderConfig = {},
  options: { fetchImpl?: typeof fetch; requestId?: string } = {}
): AIProvider {
  const fromEnv = createProviderConfigFromEnv();
  const merged = createProviderConfig({
    ...fromEnv,
    ...config,
    options: {
      ...(fromEnv.options || {}),
      ...(config.options || {})
    }
  });
  return providerFactory.create(merged, options);
}
