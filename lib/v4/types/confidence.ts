/**
 * Confiance normalisée pour tout champ / classification V4.
 * high → affichage normal ; medium → « à vérifier » ; low → pas une certitude.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

/** Score de confiance dans [0, 1]. */
export interface Confidence {
  score: number;
  level: ConfidenceLevel;
}

/** Seuils par défaut (modifiables par le routeur / profil plus tard). */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.55
} as const;

/**
 * Convertit un score [0,1] en Confidence avec niveau.
 * Les scores hors plage sont clampés.
 */
export function toConfidence(score: number): Confidence {
  const s = clamp01(score);
  let level: ConfidenceLevel = "low";
  if (s >= CONFIDENCE_THRESHOLDS.high) level = "high";
  else if (s >= CONFIDENCE_THRESHOLDS.medium) level = "medium";
  return { score: s, level };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function isHighConfidence(c: Confidence): boolean {
  return c.level === "high";
}

export function isDisplayableConfidence(c: Confidence): boolean {
  return c.level === "high" || c.level === "medium";
}
