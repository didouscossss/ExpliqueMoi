/**
 * Couche providers V3 — étape F : OpenAIProvider uniquement.
 */

export type {
  AIProvider,
  AIProviderName,
  AnswerResult,
  SummarizeResult
} from "./AIProvider.js";

export {
  createProviderConfig,
  createProviderConfigFromEnv,
  DEFAULT_PROVIDER_CONFIG
} from "./ProviderConfig.js";
export type { ProviderConfig } from "./ProviderConfig.js";

export {
  ProviderFactory,
  providerFactory,
  getAIProvider
} from "./ProviderFactory.js";
export type { AIProviderConstructor } from "./ProviderFactory.js";

export { OpenAIProvider, DEFAULT_OPENAI_MODEL } from "./OpenAIProvider.js";
export type { OpenAIProviderOptions, FetchLike } from "./OpenAIProvider.js";

export { ProviderError, toProviderErrorBody } from "./ProviderError.js";
export type { ProviderErrorBody, ProviderErrorCode } from "./ProviderError.js";

export { buildAIContext, toOpenAISafePayload } from "./buildAIContext.js";
export type { BuildAIContextInput } from "./buildAIContext.js";

export { logProviderEvent } from "./redactedLog.js";
export type { ProviderLogMeta } from "./redactedLog.js";
