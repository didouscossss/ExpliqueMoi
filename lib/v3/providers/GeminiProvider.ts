/**
 * Squelette GeminiProvider — non connecté.
 */

import type { AIProvider } from "./AIProvider.js";
import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async analyze(_context: AIContext): Promise<AnalysisResult> {
    throw new Error("GeminiProvider.analyze — non implémenté (étape E).");
  }

  async answer(_context: AIContext, _question: string): Promise<unknown> {
    throw new Error("GeminiProvider.answer — non implémenté (étape E).");
  }

  async reply(
    _context: AIContext,
    _options?: Record<string, unknown>
  ): Promise<unknown> {
    throw new Error("GeminiProvider.reply — non implémenté (étape E).");
  }

  async checklist(_context: AIContext): Promise<unknown> {
    throw new Error("GeminiProvider.checklist — non implémenté (étape E).");
  }
}
