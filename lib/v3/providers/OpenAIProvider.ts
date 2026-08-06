/**
 * Squelette OpenAIProvider — non connecté.
 */

import type { AIProvider } from "./AIProvider.js";
import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async analyze(_context: AIContext): Promise<AnalysisResult> {
    throw new Error("OpenAIProvider.analyze — non implémenté.");
  }

  async answer(_context: AIContext, _question: string): Promise<unknown> {
    throw new Error("OpenAIProvider.answer — non implémenté.");
  }

  async reply(
    _context: AIContext,
    _options?: Record<string, unknown>
  ): Promise<unknown> {
    throw new Error("OpenAIProvider.reply — non implémenté.");
  }

  async checklist(_context: AIContext): Promise<unknown> {
    throw new Error("OpenAIProvider.checklist — non implémenté.");
  }
}
