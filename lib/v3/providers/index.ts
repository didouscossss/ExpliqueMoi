/**
 * Couche providers V3 — architecture générique uniquement.
 * Aucun provider concret (Gemini / OpenAI / Mistral) à cette étape.
 */

export type {
  AIProvider,
  AIProviderName,
  AnswerResult,
  SummarizeResult
} from "./AIProvider.js";

export {
  createProviderConfig,
  DEFAULT_PROVIDER_CONFIG
} from "./ProviderConfig.js";
export type { ProviderConfig } from "./ProviderConfig.js";

export {
  ProviderFactory,
  providerFactory,
  getAIProvider
} from "./ProviderFactory.js";
export type { AIProviderConstructor } from "./ProviderFactory.js";
