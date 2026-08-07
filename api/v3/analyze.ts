/**
 * Endpoint V3 analyse.
 * Pipeline : texte/OCR → LocalAnalysis (faits) → AI optionnelle (explication)
 * L’analyse factuelle réussit même si OpenAI est absent / en erreur.
 * N’altère pas /api/analyze (V2). Aucun PDF brut requis.
 */

import type { VercelRequest, VercelResponse } from "../types/vercel.js";
import { analyzeLocally } from "../../lib/v3/localAnalysis/index.js";
import {
  buildAIContext,
  createProviderConfigFromEnv,
  getAIProvider,
  logProviderEvent,
  ProviderError
} from "../../lib/v3/providers/index.js";
import type { OCRResult } from "../../lib/v3/types/OCRResult.js";
import type { LocalAnalysis } from "../../lib/v3/types/LocalAnalysis.js";

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
    if (error.code === "EMPTY_CONTEXT" || error.code === "UNKNOWN_PROVIDER") {
      return 400;
    }
    if (error.code === "MISSING_API_KEY") return 500;
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

function localIsUsable(local: LocalAnalysis): boolean {
  if (!local) return false;
  if (local.documentType && local.documentType !== "document_inconnu") {
    return true;
  }
  const fields = local.fields || ({} as LocalAnalysis["fields"]);
  return Boolean(
    fields.amountHT != null ||
      fields.amountTTC != null ||
      fields.amountToPay != null ||
      fields.date ||
      fields.invoiceNumber ||
      (local.dates && local.dates.length) ||
      (local.factualSummary && local.factualSummary.length > 8)
  );
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

    // ——— Faits 100 % locaux (avant tout appel IA) ———
    const localAnalysis = analyzeLocally(normalizedOcr);

    if (!localIsUsable(localAnalysis) && !normalizedOcr.fullText.trim()) {
      return response.status(400).json({
        ok: false,
        version: "v3",
        localAnalysis,
        error: {
          code: "EMPTY_CONTEXT",
          message: "Aucun texte exploitable pour l’analyse locale.",
          provider: "v3",
          httpStatus: 400
        }
      });
    }

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

    // ——— Couche IA optionnelle (non bloquante pour action analyze) ———
    let aiResult: Awaited<ReturnType<typeof provider.analyze>> | null = null;
    let aiAvailable = false;
    let aiError: { code?: string; message?: string; httpStatus?: number | null } | null =
      null;

    try {
      if (action === "answer") {
        const answerResult = await provider.answer(
          context,
          String(body.question || "")
        );
        const durationMs = Date.now() - started;
        if (!answerResult.ok) {
          return response.status(answerResult.error?.httpStatus || 502).json({
            ok: false,
            version: "v3",
            localAnalysis,
            error: answerResult.error,
            meta: { requestId, durationMs, ai: { available: false } }
          });
        }
        return response.status(200).json({
          ok: true,
          version: "v3",
          action,
          localAnalysis,
          result: answerResult,
          meta: {
            requestId,
            provider: answerResult.provider,
            model: answerResult.model,
            durationMs,
            charCount: context.text.length,
            ai: { available: true }
          }
        });
      }

      if (action === "summarize") {
        // Summarize AI optionnel : si échec, fallback résumé factuel local.
        aiResult = (await provider.summarize(context)) as unknown as Awaited<
          ReturnType<typeof provider.analyze>
        >;
      } else {
        aiResult = await provider.analyze(context);
      }

      aiAvailable = Boolean(aiResult?.ok);
      if (!aiAvailable) {
        aiError = {
          code: aiResult?.error?.code,
          message: aiResult?.error?.message,
          httpStatus: aiResult?.error?.httpStatus ?? null
        };
      }
    } catch (error) {
      aiAvailable = false;
      aiError = {
        code:
          error instanceof ProviderError
            ? error.code
            : "PROVIDER_NETWORK",
        message: String(
          error instanceof Error ? error.message : "Erreur provider"
        ).slice(0, 240),
        httpStatus:
          error instanceof ProviderError ? error.httpStatus : null
      };
    }

    const durationMs = Date.now() - started;
    logProviderEvent(aiAvailable ? "info" : "error", "v3_analyze_done", {
      requestId,
      provider: config.provider,
      model: config.model,
      durationMs,
      httpStatus: 200,
      ok: true,
      charCount: context.text.length,
      code: aiError?.code,
      action
    });

    const factualSummary = localAnalysis.factualSummary || null;
    const explanation =
      aiAvailable &&
      aiResult &&
      "explanation" in aiResult &&
      aiResult.explanation &&
      typeof aiResult.explanation === "object"
        ? (aiResult.explanation as Record<string, unknown>)
        : null;

    // result.summary = résumé FACTUEL local (jamais écrasé par l’IA).
    // L’explication pédagogique AI éventuelle vit dans explanation.pedagogy / explanation.explanation.
    const pedagogy =
      explanation && typeof explanation.pedagogy === "string"
        ? explanation.pedagogy
        : explanation && typeof explanation.explanation === "string"
          ? explanation.explanation
          : explanation && typeof explanation.summary === "string"
            ? explanation.summary
            : null;

    return response.status(200).json({
      ok: true,
      version: "v3",
      action: action === "summarize" ? "summarize" : "analyze",
      localAnalysis,
      result: {
        ok: true,
        version: "v3",
        summary: factualSummary,
        localAnalysis,
        explanation: {
          documentType: localAnalysis.documentType,
          keyPoints: [],
          pedagogy,
          warnings: Array.isArray(explanation?.warnings)
            ? explanation?.warnings
            : [],
          // Garde les faits locaux comme référence pour le client.
          source: "local_facts"
        },
        warnings: [
          ...(localAnalysis.warnings || []),
          ...(aiAvailable ? [] : ["Explication IA indisponible pour cette analyse."])
        ],
        provider: aiAvailable ? aiResult?.provider || config.provider : null,
        model: aiAvailable ? aiResult?.model || config.model : null,
        error: null
      },
      meta: {
        requestId,
        provider: aiAvailable ? aiResult?.provider || config.provider : null,
        model: aiAvailable ? aiResult?.model || config.model : null,
        durationMs,
        charCount: context.text.length,
        ai: {
          available: aiAvailable,
          error: aiError
        }
      }
    });
  } catch (error) {
    const providerName = String(process.env.AI_PROVIDER || "openai");
    // Erreur locale bloquante (texte vide côté buildAIContext, etc.)
    if (error instanceof ProviderError && error.code === "EMPTY_CONTEXT") {
      return response.status(400).json(structuredError(error, providerName));
    }

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
