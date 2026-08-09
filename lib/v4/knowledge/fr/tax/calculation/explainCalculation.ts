/**
 * Explications déterministes de calcul — V4-U.
 */

import type {
  CalculationExplanation,
  CalculationResult,
  TaxFormula
} from "../../../../types/knowledge.js";

export function explainTaxCalculation(
  result: CalculationResult,
  formula: TaxFormula | null
): CalculationExplanation {
  const limits = [
    "Cette valeur calculée n’est pas une valeur officielle de déclaration.",
    "Ce calcul ne constitue ni une obligation ni une décision d’avantage fiscal."
  ];

  let headline = result.explanation;
  switch (result.status) {
    case "calculated":
      headline = `Cette valeur est calculée à partir des informations suivantes selon la formule sourcée ${result.formulaId}.`;
      break;
    case "needsInformation":
      headline = `Cette valeur ne peut pas encore être calculée : ${(result.missingInputs || []).join(", ") || "une information"} manque.`;
      break;
    case "conflicted":
      headline =
        "Cette valeur ne peut pas être calculée car plusieurs informations incompatibles existent.";
      break;
    case "notApplicable":
      headline =
        "Calcul non applicable — la case n’est pas pertinente selon les informations disponibles.";
      break;
    case "unsupported":
      headline =
        "Les règles actuellement modélisées ne permettent pas de calculer cette valeur de façon fiable.";
      break;
  }

  return {
    status: result.status,
    headline,
    formulaId: result.formulaId,
    operation: formula?.operation || null,
    inputs: result.inputs.map(
      (i) =>
        `${i.inputId}=${i.value ?? "?"} (${i.sourceKind}${
          i.status !== "resolved" ? `, ${i.status}` : ""
        })`
    ),
    result:
      result.value != null
        ? `${result.value}${result.unit === "EUR" ? " €" : result.unit ? ` ${result.unit}` : ""}`
        : null,
    unit: result.unit,
    year: result.inputs.find((i) => i.taxYear != null)?.taxYear ?? null,
    role: formula?.rolePolicy || null,
    sources: result.sources,
    rounding: formula?.roundingPolicy || null,
    limits
  };
}
