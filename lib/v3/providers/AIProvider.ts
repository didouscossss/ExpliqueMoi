/**
 * Interface commune des fournisseurs IA V3.
 * Le moteur appelle analyze / answer / summarize sans connaître le fournisseur.
 * Aucun appel réseau ici — contrat uniquement.
 */

import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

/** Identifiant logique d’un fournisseur (extensible plus tard). */
export type AIProviderName = string;

export interface AnswerResult {
  ok: boolean;
  answer: string | null;
  source?: string | null;
  found?: boolean;
  provider: string;
  model?: string | null;
  warnings?: string[];
}

export interface SummarizeResult {
  ok: boolean;
  summary: string | null;
  provider: string;
  model?: string | null;
  warnings?: string[];
}

/**
 * Contrat unique pour tous les providers futurs
 * (Gemini, OpenAI, Mistral, …).
 */
export interface AIProvider {
  /** Nom logique du provider (`gemini`, `openai`, …). */
  readonly name: AIProviderName;

  /** Expliquer / structurer à partir du contexte texte + analyse locale. */
  analyze(context: AIContext): Promise<AnalysisResult>;

  /** Répondre à une question sur le contexte de session. */
  answer(context: AIContext, question: string): Promise<AnswerResult>;

  /** Produire un résumé à partir du contexte. */
  summarize(context: AIContext): Promise<SummarizeResult>;
}
