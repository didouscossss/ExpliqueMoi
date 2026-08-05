/**
 * Modèles Gemini actifs (août 2026).
 * Les familles 2.0 / 2.5-flash « classiques » renvoient 404
 * « no longer available to new users » en production.
 */

export const PRIMARY_MODEL = "gemini-3.5-flash";

/**
 * Fallbacks ordonnés — uniquement des IDs encore servis.
 * Les lite / preview free-tier passent avant les anciens 2.x (retirés).
 */
export const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-flash-latest"
];

/** True si l’erreur indique un modèle à abandonner immédiatement. */
export function isUnavailableModelError(status, message = "") {
  const text = String(message || "");
  return (
    status === 404 ||
    /not found|unsupported|unknown model|no longer available|not available to new users|is not found/i.test(
      text
    )
  );
}
