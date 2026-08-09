/**
 * Frontière premium V4-P — signatures réservées, AUCUNE implémentation IA.
 * FREE = définitions + valeurs documentaires. Premium = aide contextuelle future.
 */

import type { DetectedTaxField, FrenchTaxFieldEntry } from "../../../../types/knowledge.js";

export interface TaxFieldPremiumContext {
  field: FrenchTaxFieldEntry;
  detected?: DetectedTaxField | null;
  documentRef?: string | null;
  year?: number | null;
  neighboringFields?: DetectedTaxField[];
  userProvidedFacts?: Array<{ label: string; value: string }>;
}

/** Réservé premium — non branché. */
export function explainFieldWithContext(_ctx: TaxFieldPremiumContext): never {
  throw new Error(
    "explainFieldWithContext est réservé au parcours premium et n’est pas disponible en V4-P."
  );
}

/** Réservé premium — non branché. */
export function helpFillField(_ctx: TaxFieldPremiumContext): never {
  throw new Error(
    "helpFillField est réservé au parcours premium et n’est pas disponible en V4-P."
  );
}

/** Réservé premium — non branché. */
export function askAboutField(_ctx: TaxFieldPremiumContext): never {
  throw new Error(
    "askAboutField est réservé au parcours premium et n’est pas disponible en V4-P."
  );
}

/** Réservé premium — non branché. */
export function evaluateFieldApplicability(_ctx: TaxFieldPremiumContext): never {
  throw new Error(
    "evaluateFieldApplicability est réservé au parcours premium et n’est pas disponible en V4-P."
  );
}
