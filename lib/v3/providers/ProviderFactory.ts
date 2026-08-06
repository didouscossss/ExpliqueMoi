/**
 * Fabrique générique des fournisseurs IA V3.
 * Aucun provider concret enregistré à cette étape.
 * Aucun appel réseau.
 */

import type { AIProvider, AIProviderName } from "./AIProvider.js";
import {
  createProviderConfig,
  type ProviderConfig
} from "./ProviderConfig.js";

export type AIProviderConstructor = new (
  config: ProviderConfig
) => AIProvider;

/**
 * Registre + fabrique. Les adapters (Gemini, OpenAI, …)
 * s’enregistreront ici dans une étape ultérieure.
 */
export class ProviderFactory {
  private readonly registry = new Map<AIProviderName, AIProviderConstructor>();

  /** Enregistre un constructeur de provider (pour étapes futures). */
  register(name: AIProviderName, ctor: AIProviderConstructor): void {
    const key = String(name || "")
      .trim()
      .toLowerCase();
    if (!key) {
      throw new Error("ProviderFactory.register: nom de provider invalide.");
    }
    this.registry.set(key, ctor);
  }

  /** Indique si un provider est enregistré. */
  has(name: AIProviderName): boolean {
    return this.registry.has(String(name || "").trim().toLowerCase());
  }

  /** Liste des providers enregistrés. */
  list(): AIProviderName[] {
    return [...this.registry.keys()].sort();
  }

  /**
   * Crée une instance AIProvider selon la config.
   * Échoue clairement tant qu’aucun adapter n’est enregistré.
   */
  create(config: Partial<ProviderConfig> | ProviderConfig = {}): AIProvider {
    const resolved = createProviderConfig(config);
    const key = String(resolved.provider || "")
      .trim()
      .toLowerCase();

    const ctor = this.registry.get(key);
    if (!ctor) {
      const available = this.list();
      throw new Error(
        `ProviderFactory: aucun provider enregistré pour "${resolved.provider}".` +
          (available.length
            ? ` Disponibles: ${available.join(", ")}.`
            : " Aucun adapter concret n’est encore branché (étape E — architecture seule).")
      );
    }

    return new ctor(resolved);
  }
}

/** Instance partagée (registre vide par défaut). */
export const providerFactory = new ProviderFactory();

/**
 * Point d’entrée moteur V3 : obtient un AIProvider opaque.
 * Aujourd’hui : lève une erreur explicite (pas de provider concret).
 */
export function getAIProvider(
  config: Partial<ProviderConfig> | ProviderConfig = {}
): AIProvider {
  return providerFactory.create(config);
}
