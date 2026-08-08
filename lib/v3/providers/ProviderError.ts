/**
 * Erreurs structurées provider V3 — jamais de contenu documentaire.
 */

export type ProviderErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_REQUEST"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK"
  | "INVALID_PROVIDER_RESPONSE"
  | "UNKNOWN_PROVIDER"
  | "EMPTY_CONTEXT";

export interface ProviderErrorBody {
  code: ProviderErrorCode | string;
  message: string;
  provider: string;
  httpStatus: number | null;
}

export class ProviderError extends Error {
  readonly code: string;
  readonly provider: string;
  readonly httpStatus: number | null;

  constructor(body: ProviderErrorBody) {
    super(body.message);
    this.name = "ProviderError";
    this.code = body.code;
    this.provider = body.provider;
    this.httpStatus = body.httpStatus;
  }

  toJSON(): ProviderErrorBody {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      httpStatus: this.httpStatus
    };
  }
}

export function toProviderErrorBody(
  error: unknown,
  provider: string
): ProviderErrorBody {
  if (error instanceof ProviderError) {
    return error.toJSON();
  }

  const message =
    error instanceof Error ? error.message : "Erreur provider inconnue.";

  return {
    code: "PROVIDER_NETWORK",
    message: message.slice(0, 240),
    provider,
    httpStatus: null
  };
}
