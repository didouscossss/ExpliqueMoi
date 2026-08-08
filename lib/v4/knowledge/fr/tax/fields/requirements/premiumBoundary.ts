/**
 * Frontière premium V4-Q — TaxAssistanceContext structurelle.
 * AUCUN appel LLM. FREE = requirements + faits + gaps.
 */

import type { TaxAssistanceContext } from "../../../../../types/knowledge.js";

/** Réservé premium — non branché. */
export function assistFieldWithLlm(_ctx: TaxAssistanceContext): never {
  throw new Error(
    "assistFieldWithLlm est réservé au parcours premium et n’est pas disponible en V4-Q."
  );
}

/** Réservé premium — non branché. */
export function explainRequirementsWithContext(
  _ctx: TaxAssistanceContext
): never {
  throw new Error(
    "explainRequirementsWithContext est réservé au parcours premium et n’est pas disponible en V4-Q."
  );
}

/** Réservé premium — décision d’applicabilité non disponible. */
export function decideFieldApplicability(_ctx: TaxAssistanceContext): never {
  throw new Error(
    "decideFieldApplicability est réservé à une future couche d’éligibilité fiable et n’est pas disponible en V4-Q."
  );
}
