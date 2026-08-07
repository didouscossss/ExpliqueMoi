/**
 * OpenAIProvider V3 — seul provider concret de l’étape F.
 * Un modèle, zéro fallback, zéro retry.
 * N’accepte que du texte + LocalAnalysis (jamais PDF/images/buffers).
 */

import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";
import type {
  AIProvider,
  AnswerResult,
  SummarizeResult
} from "./AIProvider.js";
import { toOpenAISafePayload } from "./buildAIContext.js";
import { DEFAULT_OPENAI_MODEL } from "./openaiConstants.js";
import type { ProviderConfig } from "./ProviderConfig.js";
import { ProviderError, toProviderErrorBody } from "./ProviderError.js";
import { logProviderEvent } from "./redactedLog.js";

export { DEFAULT_OPENAI_MODEL } from "./openaiConstants.js";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type FetchLike = typeof fetch;

export interface OpenAIProviderOptions {
  /** Injection pour tests — aucun appel réel. */
  fetchImpl?: FetchLike;
  requestId?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string | null;
  private readonly fetchImpl: FetchLike;
  private readonly requestId: string | null;

  constructor(config: ProviderConfig = { provider: "openai" }, options: OpenAIProviderOptions = {}) {
    this.model =
      String(config.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() ||
      DEFAULT_OPENAI_MODEL;
    this.timeoutMs =
      Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 45_000;
    const fromOptions = config.options?.apiKey;
    this.apiKey =
      (typeof fromOptions === "string" && fromOptions.trim()) ||
      (process.env.OPENAI_API_KEY || "").trim() ||
      null;
    this.fetchImpl = options.fetchImpl || fetch;
    this.requestId = options.requestId || null;
  }

  async analyze(context: AIContext): Promise<AnalysisResult> {
    const started = Date.now();
    const missing = this.missingKeyResult(context);
    if (missing) {
      return missing;
    }

    try {
      const payload = toOpenAISafePayload(context);
      const content = await this.complete({
        action: "analyze",
        system: ANALYZE_SYSTEM,
        user: JSON.stringify(payload),
        json: true
      });

      const parsed = this.parseJsonObject(content);
      const summary =
        typeof parsed.summary === "string"
          ? parsed.summary
          : typeof parsed.plain_summary === "string"
            ? parsed.plain_summary
            : null;

      const result: AnalysisResult = {
        ok: true,
        version: "v3",
        summary,
        localAnalysis: context.localAnalysis,
        explanation:
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : null,
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map(String).slice(0, 20)
          : [],
        provider: this.name,
        model: this.model
      };

      logProviderEvent("info", "analyze_ok", {
        requestId: this.requestId || undefined,
        provider: this.name,
        model: this.model,
        durationMs: Date.now() - started,
        httpStatus: 200,
        ok: true,
        charCount: context.text.length,
        action: "analyze"
      });

      return result;
    } catch (error) {
      return this.failureAnalysis(context, error, started, "analyze");
    }
  }

  async answer(context: AIContext, question: string): Promise<AnswerResult> {
    const started = Date.now();
    if (!this.apiKey) {
      return {
        ok: false,
        answer: null,
        provider: this.name,
        model: this.model,
        error: {
          code: "MISSING_API_KEY",
          message: "OPENAI_API_KEY manquante.",
          provider: this.name,
          httpStatus: null
        }
      };
    }

    try {
      const payload = toOpenAISafePayload(context, { question });
      const content = await this.complete({
        action: "answer",
        system: ANSWER_SYSTEM,
        user: JSON.stringify(payload),
        json: true
      });
      const parsed = this.parseJsonObject(content);

      const result: AnswerResult = {
        ok: true,
        answer: typeof parsed.answer === "string" ? parsed.answer : null,
        source: typeof parsed.source === "string" ? parsed.source : null,
        found: Boolean(parsed.found),
        provider: this.name,
        model: this.model,
        warnings: []
      };

      logProviderEvent("info", "answer_ok", {
        requestId: this.requestId || undefined,
        provider: this.name,
        model: this.model,
        durationMs: Date.now() - started,
        httpStatus: 200,
        ok: true,
        charCount: context.text.length,
        action: "answer"
      });

      return result;
    } catch (error) {
      const body = toProviderErrorBody(error, this.name);
      logProviderEvent("error", "answer_error", {
        requestId: this.requestId || undefined,
        provider: this.name,
        model: this.model,
        durationMs: Date.now() - started,
        httpStatus: body.httpStatus,
        ok: false,
        charCount: context.text.length,
        code: body.code,
        action: "answer"
      });
      return {
        ok: false,
        answer: null,
        provider: this.name,
        model: this.model,
        error: body
      };
    }
  }

  async summarize(context: AIContext): Promise<SummarizeResult> {
    const started = Date.now();
    if (!this.apiKey) {
      return {
        ok: false,
        summary: null,
        provider: this.name,
        model: this.model,
        error: {
          code: "MISSING_API_KEY",
          message: "OPENAI_API_KEY manquante.",
          provider: this.name,
          httpStatus: null
        }
      };
    }

    try {
      const payload = toOpenAISafePayload(context);
      const content = await this.complete({
        action: "summarize",
        system: SUMMARIZE_SYSTEM,
        user: JSON.stringify(payload),
        json: true
      });
      const parsed = this.parseJsonObject(content);

      const result: SummarizeResult = {
        ok: true,
        summary: typeof parsed.summary === "string" ? parsed.summary : null,
        provider: this.name,
        model: this.model,
        warnings: []
      };

      logProviderEvent("info", "summarize_ok", {
        requestId: this.requestId || undefined,
        provider: this.name,
        model: this.model,
        durationMs: Date.now() - started,
        httpStatus: 200,
        ok: true,
        charCount: context.text.length,
        action: "summarize"
      });

      return result;
    } catch (error) {
      const body = toProviderErrorBody(error, this.name);
      logProviderEvent("error", "summarize_error", {
        requestId: this.requestId || undefined,
        provider: this.name,
        model: this.model,
        durationMs: Date.now() - started,
        httpStatus: body.httpStatus,
        ok: false,
        charCount: context.text.length,
        code: body.code,
        action: "summarize"
      });
      return {
        ok: false,
        summary: null,
        provider: this.name,
        model: this.model,
        error: body
      };
    }
  }

  private missingKeyResult(context: AIContext): AnalysisResult | null {
    if (this.apiKey) {
      return null;
    }
    return {
      ok: false,
      version: "v3",
      summary: null,
      localAnalysis: context.localAnalysis,
      explanation: null,
      warnings: [],
      provider: this.name,
      model: this.model,
      error: {
        code: "MISSING_API_KEY",
        message: "OPENAI_API_KEY manquante.",
        provider: this.name,
        httpStatus: null
      }
    };
  }

  private failureAnalysis(
    context: AIContext,
    error: unknown,
    started: number,
    action: string
  ): AnalysisResult {
    const body = toProviderErrorBody(error, this.name);
    logProviderEvent("error", `${action}_error`, {
      requestId: this.requestId || undefined,
      provider: this.name,
      model: this.model,
      durationMs: Date.now() - started,
      httpStatus: body.httpStatus,
      ok: false,
      charCount: context.text.length,
      code: body.code,
      action
    });

    return {
      ok: false,
      version: "v3",
      summary: null,
      localAnalysis: context.localAnalysis,
      explanation: null,
      warnings: [],
      provider: this.name,
      model: this.model,
      error: body
    };
  }

  private async complete(args: {
    action: string;
    system: string;
    user: string;
    json: boolean;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: args.json ? { type: "json_object" } : undefined,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user }
          ]
        })
      });

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const apiError = data.error as { message?: string; code?: string } | undefined;
        throw new ProviderError({
          code: "PROVIDER_HTTP_ERROR",
          message: String(
            apiError?.message ||
              `OpenAI HTTP ${response.status}`
          ).slice(0, 240),
          provider: this.name,
          httpStatus: response.status
        });
      }

      const choices = data.choices as
        | Array<{ message?: { content?: string } }>
        | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new ProviderError({
          code: "INVALID_PROVIDER_RESPONSE",
          message: "Réponse OpenAI vide ou invalide.",
          provider: this.name,
          httpStatus: response.status
        });
      }

      return content;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError({
          code: "PROVIDER_TIMEOUT",
          message: `Timeout OpenAI après ${this.timeoutMs} ms.`,
          provider: this.name,
          httpStatus: null
        });
      }
      throw new ProviderError({
        code: "PROVIDER_NETWORK",
        message: String(
          error instanceof Error ? error.message : "Erreur réseau OpenAI"
        ).slice(0, 240),
        provider: this.name,
        httpStatus: null
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(content.slice(start, end + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          // fallthrough
        }
      }
    }

    throw new ProviderError({
      code: "INVALID_PROVIDER_RESPONSE",
      message: "JSON OpenAI illisible.",
      provider: this.name,
      httpStatus: 200
    });
  }
}

const ANALYZE_SYSTEM = `Tu es ExpliqueMoi V3. Tu expliques un document administratif français.
Tu reçois UNIQUEMENT du texte déjà extrait et une analyse locale JSON.
N'invente pas. Réponds en JSON avec: summary (string), documentType (string), keyPoints (string[]), warnings (string[]).
Langue: français.`;

const ANSWER_SYSTEM = `Tu réponds UNIQUEMENT à partir du texte et de l'analyse locale fournis.
JSON: { "answer": string, "source": string, "found": boolean }.
Si l'info est absente: found=false et answer="Je ne trouve pas cette information dans le document."
Français.`;

const SUMMARIZE_SYSTEM = `Résume clairement le document en français à partir du texte fourni.
JSON: { "summary": string }. N'invente pas.`;
