/**
 * Explication locale d’une valeur dérivée — compose CalculationResult (read-only).
 */

import type {
  CalculationResult,
  LocalExplanationCalculationSlice,
  LocalExplanationRuleRef,
  LocalExplanationSourceFact,
  LocalExplanationStatus
} from "../types/knowledge.js";

export function explainDerivedValueLocal(
  calc: CalculationResult | null | undefined
): {
  status: LocalExplanationStatus | null;
  summary: string | null;
  calculationExplanation: string | null;
  calculation: LocalExplanationCalculationSlice | null;
  details: string[];
  missingInformation: string[];
  why: string[];
  sourceRefs: Array<{ title: string; url: string }>;
  ruleRefs: LocalExplanationRuleRef[];
  derivedFacts: LocalExplanationSourceFact[];
} {
  if (!calc || calc.status === "unsupported") {
    if (calc?.status === "unsupported") {
      return {
        status: "unsupported",
        summary:
          "ExpliqueMoi ne dispose pas encore d’une règle suffisamment vérifiée pour expliquer ce point.",
        calculationExplanation: calc.explanation || null,
        calculation: null,
        details: [],
        missingInformation: [],
        why: [
          "Aucune formule verified exécutable n’a produit de résultat pour ce sujet."
        ],
        sourceRefs: calc.sources || [],
        ruleRefs: calc.rule
          ? [
              {
                ruleId: calc.rule.ruleId,
                version: calc.rule.version,
                kind: "calculation",
                status: calc.rule.status,
                formulaId: calc.rule.formulaId
              }
            ]
          : [],
        derivedFacts: []
      };
    }
    return {
      status: null,
      summary: null,
      calculationExplanation: null,
      calculation: null,
      details: [],
      missingInformation: [],
      why: [],
      sourceRefs: [],
      ruleRefs: [],
      derivedFacts: []
    };
  }

  const ruleRefs: LocalExplanationRuleRef[] = calc.rule
    ? [
        {
          ruleId: calc.rule.ruleId,
          version: calc.rule.version,
          kind: "calculation",
          status: calc.rule.status,
          formulaId: calc.rule.formulaId
        }
      ]
    : calc.formulaId
      ? [
          {
            ruleId: `calc:${calc.formulaId}`,
            formulaId: calc.formulaId,
            kind: "calculation"
          }
        ]
      : [];

  const derivedFacts: LocalExplanationSourceFact[] = [];
  if (calc.status === "calculated" && calc.derivedValue) {
    derivedFacts.push({
      kind: "derived",
      id: calc.derivedValue.derivedId,
      label: "Valeur calculée (dérivée)",
      value:
        calc.value != null
          ? `${calc.value}${calc.unit === "EUR" ? " €" : calc.unit ? ` ${calc.unit}` : ""}`
          : null,
      fieldCode: calc.fieldCode,
      documentId: null
    });
  }

  switch (calc.status) {
    case "calculated": {
      const valueLabel =
        calc.value != null
          ? `${calc.value}${calc.unit === "EUR" ? " €" : calc.unit ? ` ${calc.unit}` : ""}`
          : "—";
      const versionNote = calc.rule?.version
        ? ` (formule ${calc.formulaId}, v${calc.rule.version})`
        : calc.formulaId
          ? ` (formule ${calc.formulaId})`
          : "";
      return {
        status: "explained",
        summary: `Valeur calculée à partir des informations disponibles : ${valueLabel}.`,
        calculationExplanation: `Le moteur applique la formule vérifiée${versionNote}. ${calc.explanation}`,
        calculation: {
          status: calc.status,
          value: calc.value,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: `Résultat calculé : ${valueLabel}`
        },
        details: [
          "Ce résultat est une valeur dérivée, distincte du montant éventuellement lu dans le document.",
          ...(calc.limits || [])
        ],
        missingInformation: [],
        why: [
          "Un calcul déterministe a été exécuté à partir de faits disponibles et d’une formule sourcée."
        ],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts
      };
    }
    case "needsInformation":
      return {
        status: "needsInformation",
        summary:
          "Une information supplémentaire est nécessaire pour calculer cette valeur.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [],
        missingInformation: [...(calc.missingInputs || [])],
        why: ["Le calcul reste bloqué tant qu’un input nécessaire manque."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    case "conflicted":
      return {
        status: "conflicted",
        summary: "Les informations disponibles sont contradictoires.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [...(calc.conflicts || [])],
        missingInformation: [],
        why: ["Le moteur refuse de trancher un conflit d’entrées."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    case "notApplicable":
      return {
        status: "notApplicable",
        summary: "Le calcul n’est pas applicable selon les informations disponibles.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [],
        missingInformation: [],
        why: ["Les conditions de la formule ne sont pas réunies."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    default:
      return {
        status: "unsupported",
        summary:
          "ExpliqueMoi ne dispose pas encore d’une règle suffisamment vérifiée pour expliquer ce point.",
        calculationExplanation: calc.explanation,
        calculation: null,
        details: [],
        missingInformation: [],
        why: [],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
  }
}
