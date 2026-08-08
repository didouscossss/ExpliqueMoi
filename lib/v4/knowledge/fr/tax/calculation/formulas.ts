/**
 * Pack de formules fiscales V4-U.
 *
 * QUALITÉ > QUANTITÉ.
 * Aucune formule inventée pour gonfler la couverture.
 * Les montants lus directement (1AJ, 1BJ, …) restent DocumentFacts,
 * pas DerivedTaxValue(identity).
 *
 * Pack production actuel : VIDE — les connaissances vérifiées du repo
 * décrivent des cases / conditions, pas d’opérations arithmétiques
 * officielles suffisamment précises (seuils crédit 7DB, calcul 2044, etc.).
 */

import type { TaxFormula } from "../../../../types/knowledge.js";

/**
 * Formules production. Vide volontairement.
 * @see NON_MODELED_FORMULA_NOTES
 */
export const TAX_FORMULAS: readonly TaxFormula[] = [];

export const NON_MODELED_FORMULA_NOTES: readonly string[] = [
  "1AJ/1BJ : montants directement lus — DocumentFact, pas formule identity.",
  "4BA/4BB/4BC : report / déficit décrits, mais pas de formule arithmétique 2044 complète sourcée dans le repo.",
  "7DB/7DR : crédit d’impôt — taux/plafonds/éligibilité non modélisés ; pas de calcul d’avantage.",
  "Somme multi-documents : interdite sans TaxFormula explicite (refuseUnsafeAggregation)."
];

export function getFormulasForField(
  fieldCode: string,
  extra: readonly TaxFormula[] = []
): TaxFormula[] {
  const code = fieldCode.toUpperCase();
  return [...TAX_FORMULAS, ...extra].filter(
    (f) => f.targetFieldCode.toUpperCase() === code
  );
}

export function listFormulaIds(extra: readonly TaxFormula[] = []): string[] {
  return [...TAX_FORMULAS, ...extra].map((f) => f.formulaId).sort();
}
