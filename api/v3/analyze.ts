/**
 * Endpoint V3 analyse.
 * Pipeline : texte/OCR → LocalAnalysis → AIProvider → AnalysisResult
 * N’altère pas /api/analyze (V2). Aucun PDF brut requis.
 */

import type { VercelRequest, VercelResponse } from "../types/vercel.js";
import {
  analyzeLocally,
  enrichLocalAmountFields
} from "../../lib/v3/localAnalysis/index.js";
import {
  buildAIContext,
  createProviderConfigFromEnv,
  getAIProvider,
  logProviderEvent,
  ProviderError
} from "../../lib/v3/providers/index.js";
import type { OCRResult } from "../../lib/v3/types/OCRResult.js";

function requestIdOf(request: VercelRequest): string {
  const headers = request.headers || {};
  return String(
    headers["x-request-id"] ||
      headers["x-expliquemoi-request"] ||
      `v3_${Date.now().toString(36)}`
  );
}

function readJsonBody(request: VercelRequest): Record<string, unknown> {
  if (request.body && typeof request.body === "object") {
    return request.body as Record<string, unknown>;
  }
  return {};
}

function httpStatusForError(error: unknown): number {
  if (error instanceof ProviderError) {
    if (error.code === "MISSING_API_KEY") return 500;
    if (error.code === "EMPTY_CONTEXT" || error.code === "UNKNOWN_PROVIDER") {
      return 400;
    }
    if (error.httpStatus && Number.isFinite(error.httpStatus)) {
      return error.httpStatus;
    }
  }
  return 502;
}

function structuredError(error: unknown, provider = "openai") {
  if (error instanceof ProviderError) {
    return {
      ok: false as const,
      error: error.toJSON()
    };
  }

  return {
    ok: false as const,
    error: {
      code: "PROVIDER_NETWORK",
      message: String(
        error instanceof Error ? error.message : "Erreur V3"
      ).slice(0, 240),
      provider,
      httpStatus: null as number | null
    }
  };
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const requestId = requestIdOf(request);
  const started = Date.now();

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method === "GET") {
    return response.status(200).json({
      status: "ready",
      version: "v3",
      provider: String(process.env.AI_PROVIDER || "openai"),
      modelDefault: String(process.env.OPENAI_MODEL || "gpt-4o-mini")
    });
  }

  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST JSON requis.",
        provider: "v3",
        httpStatus: 405
      }
    });
  }

  try {
    const body = readJsonBody(request);
    const action = String(body.action || "analyze").toLowerCase();

    if (body.file || body.pdf || body.bytes || body.base64 || body.images) {
      return response.status(400).json({
        ok: false,
        error: {
          code: "RAW_DOCUMENT_NOT_ALLOWED",
          message:
            "Le document brut n’est pas accepté. Envoyez text ou ocrResult.fullText.",
          provider: "v3",
          httpStatus: 400
        }
      });
    }

    const incoming = (body.ocrResult || null) as Partial<OCRResult> | null;
    const text = String(body.text || incoming?.fullText || "");
    const normalizedOcr: OCRResult = {
      pages: Array.isArray(incoming?.pages)
        ? incoming.pages.map((page, index) => ({
            pageNumber: Number(page?.pageNumber) || index + 1,
            text: String(page?.text || ""),
            confidence: Number(page?.confidence) || 0
          }))
        : text
          ? [{ pageNumber: 1, text, confidence: 100 }]
          : [],
      fullText: String(incoming?.fullText || text || ""),
      warnings: Array.isArray(incoming?.warnings)
        ? incoming.warnings.map(String)
        : []
    };

    const localAnalysis = analyzeLocally(normalizedOcr);
    const context = buildAIContext({
      text: body.text ? String(body.text) : undefined,
      ocrResult: normalizedOcr,
      localAnalysis,
      excerpts: Array.isArray(body.excerpts)
        ? body.excerpts.map(String)
        : undefined
    });

    const config = createProviderConfigFromEnv();
    const provider = getAIProvider(config, { requestId });

    let result;
    if (action === "answer") {
      result = await provider.answer(context, String(body.question || ""));
    } else if (action === "summarize") {
      result = await provider.summarize(context);
    } else {
      result = await provider.analyze(context);
    }

    const durationMs = Date.now() - started;
    logProviderEvent(result.ok ? "info" : "error", "v3_analyze_done", {
      requestId,
      provider: result.provider || config.provider,
      model: result.model || config.model,
      durationMs,
      httpStatus: result.ok ? 200 : result.error?.httpStatus || 502,
      ok: result.ok,
      charCount: context.text.length,
      code: result.error?.code,
      action
    });

    // Si l’IA a repris un libellé final (« Somme à payer TTC : 9.99 € »)
    // dans les keyPoints alors que l’OCR seul l’a manqué, enrichir les fields.
    const explanation = (result.explanation || {}) as Record<string, unknown>;
    const keyPoints = Array.isArray(explanation.keyPoints)
      ? explanation.keyPoints.map(String)
      : [];
    const enrichedLocal = enrichLocalAmountFields(localAnalysis, [
      normalizedOcr.fullText,
      ...keyPoints
    ]);

    if (!result.ok) {
      const status = result.error?.httpStatus || 502;
      const normalized =
        status === 401 ||
        status === 429 ||
        (status >= 400 && status < 600)
          ? status
          : 502;

      return response.status(normalized).json({
        ok: false,
        version: "v3",
        localAnalysis: enrichedLocal,
        error: result.error || {
          code: "PROVIDER_HTTP_ERROR",
          message: "Échec provider.",
          provider: config.provider,
          httpStatus: normalized
        }
      });
    }

    return response.status(200).json({
      ok: true,
      version: "v3",
      action,
      localAnalysis: enrichedLocal,
      result: {
        ...result,
        localAnalysis: enrichedLocal
      },
      meta: {
        requestId,
        provider: result.provider,
        model: result.model,
        durationMs,
        charCount: context.text.length
      }
    });
  } catch (error) {
    const providerName = String(process.env.AI_PROVIDER || "openai");
    const body = structuredError(error, providerName);
    const status = httpStatusForError(error);

    logProviderEvent("error", "v3_analyze_exception", {
      requestId,
      provider: providerName,
      durationMs: Date.now() - started,
      httpStatus: status,
      ok: false,
      code: body.error.code,
      action: "analyze"
    });

    return response.status(status).json(body);
  }
}
