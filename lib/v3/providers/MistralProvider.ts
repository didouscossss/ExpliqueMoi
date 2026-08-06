/**
 * Squelette MistralProvider — non connecté.
 */

import type { AIProvider } from "./AIProvider.js";
import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

export class MistralProvider implements AIProvider {
  readonly name = "mistral";

  async analyze(_context: AIContext): Promise<AnalysisResult> {
    throw new Error("MistralProvider.analyze — non implémenté.");
  }

  async answer(_context: AIContext, _question: string): Promise<unknown> {
    throw new Error("MistralProvider.answer — non implémenté.");
  }

  async reply(
    _context: AIContext,
    _options?: Record<string, unknown>
  ): Promise<unknown> {
    throw new Error("MistralProvider.reply — non implémenté.");
  }

  async checklist(_context: AIContext): Promise<unknown> {
    throw new Error("MistralProvider.checklist — non implémenté.");
  }
}
