/**
 * Construit un AIContext minimal — jamais de PDF/images/buffers.
 */

import type { AIContext } from "../types/AIContext.js";
import type { LocalAnalysis } from "../types/LocalAnalysis.js";
import type { OCRResult } from "../types/OCRResult.js";
import { ProviderError } from "./ProviderError.js";

export interface BuildAIContextInput {
  text?: string | null;
  ocrResult?: OCRResult | null;
  localAnalysis?: LocalAnalysis | null;
  excerpts?: string[];
  question?: string;
}

/**
 * Priorité : ocrResult.fullText si disponible, sinon text fourni.
 * Refuse explicitement les champs fichier/brut s’ils sont présents dans un payload élargi.
 */
export function buildAIContext(
  input: BuildAIContextInput,
  providerName = "openai"
): AIContext {
  const fullText = String(input.ocrResult?.fullText || "").trim();
  const plainText = String(input.text || "").trim();
  const text = fullText || plainText;

  if (!text) {
    throw new ProviderError({
      code: "EMPTY_CONTEXT",
      message:
        "Aucun texte exploitable (OCRResult.fullText ou text requis). Le PDF brut n’est pas accepté.",
      provider: providerName,
      httpStatus: 400
    });
  }

  const pageCount =
    input.ocrResult?.pages?.length ||
    (input.localAnalysis ? undefined : undefined);

  return {
    text,
    localAnalysis: input.localAnalysis ?? null,
    excerpts: Array.isArray(input.excerpts)
      ? input.excerpts.map((item) => String(item || "").slice(0, 2000)).filter(Boolean)
      : undefined,
    meta: {
      pageCount: pageCount || undefined,
      hasOcr: Boolean(fullText),
      warnings: input.ocrResult?.warnings?.slice(0, 10) || []
    }
  };
}

/** Payload JSON sûr pour l’API OpenAI — champs autorisés uniquement. */
export function toOpenAISafePayload(
  context: AIContext,
  extras: { question?: string } = {}
): Record<string, unknown> {
  return {
    text: context.text,
    localAnalysis: context.localAnalysis,
    excerpts: context.excerpts || [],
    meta: {
      pageCount: context.meta?.pageCount ?? null,
      hasOcr: context.meta?.hasOcr ?? false,
      warningCount: context.meta?.warnings?.length ?? 0
    },
    question: extras.question ? String(extras.question).slice(0, 2000) : undefined
  };
}
