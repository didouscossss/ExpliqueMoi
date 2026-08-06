/**
 * Interface commune des fournisseurs IA V3.
 * Aucune implémentation métier ici.
 */

import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

export interface AIProvider {
  readonly name: string;

  /** Expliquer / structurer à partir du contexte texte. */
  analyze(context: AIContext): Promise<AnalysisResult>;

  /** Répondre à une question sur le contexte de session. */
  answer(context: AIContext, question: string): Promise<unknown>;

  /** Rédiger une réponse / un brouillon. */
  reply(context: AIContext, options?: Record<string, unknown>): Promise<unknown>;

  /** Préparer une checklist de pièces. */
  checklist(context: AIContext): Promise<unknown>;
}
