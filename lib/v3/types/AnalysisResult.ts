/**
 * Résultat d’analyse V3 (sortie IA + fusion locale).
 * Signatures uniquement — aucun traitement métier.
 */

import type { LocalAnalysis } from "./LocalAnalysis.js";

export interface AnalysisResult {
  ok: boolean;
  version: "v3";
  summary: string | null;
  localAnalysis: LocalAnalysis | null;
  /** Structure libre pour la future fusion UI — non branchée. */
  explanation: Record<string, unknown> | null;
  warnings: string[];
  provider: string | null;
  model: string | null;
}
