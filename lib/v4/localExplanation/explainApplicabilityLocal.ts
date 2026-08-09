/**
 * Explication locale d’applicabilité — compose les résultats V4-T (read-only).
 */

import type {
  LocalExplanationStatus,
  TaxApplicabilityEvaluation
} from "../types/knowledge.js";

export function explainApplicabilityLocal(
  app: TaxApplicabilityEvaluation | null | undefined
): {
  status: LocalExplanationStatus;
  summary: string;
  details: string[];
  missingInformation: string[];
  why: string[];
  sourceRefs: Array<{ title: string; url: string }>;
  ruleRefs: Array<{
    ruleId: string;
    version?: string | null;
    kind?: string | null;
    status?: string | null;
  }>;
} {
  if (!app) {
    return {
      status: "unknown",
      summary:
        "Cette information ne peut pas encore être déterminée avec les éléments disponibles.",
      details: [],
      missingInformation: [],
      why: [
        "Aucune évaluation d’applicabilité n’est disponible pour ce sujet."
      ],
      sourceRefs: [],
      ruleRefs: []
    };
  }

  const missingInformation = (app.missingInformation || []).map(
    (m) => m.question || m.reason || m.id
  );
  const why = [...(app.reasons || [])];
  const sourceRefs = [...(app.sources || [])];
  const ruleRefs = app.ruleId
    ? [
        {
          ruleId: `app:${app.ruleId}`,
          kind: "applicability",
          status: null,
          version: null
        }
      ]
    : [];

  switch (app.status) {
    case "applicable":
      return {
        status: "explained",
        summary:
          "Les conditions modélisées pour ce point sont satisfaites selon les informations disponibles.",
        details: why,
        missingInformation: [],
        why: [
          "Les faits et précisions disponibles correspondent à la règle d’applicabilité vérifiée."
        ],
        sourceRefs,
        ruleRefs
      };
    case "needsInformation":
      return {
        status: "needsInformation",
        summary:
          "Une information supplémentaire est nécessaire pour déterminer si cette règle s’applique.",
        details: why,
        missingInformation,
        why: [
          "Le moteur refuse de conclure tant qu’une information déterminante manque."
        ],
        sourceRefs,
        ruleRefs
      };
    case "conflicted":
      return {
        status: "conflicted",
        summary: "Les informations disponibles sont contradictoires.",
        details: [...why, ...(app.conflicts || [])],
        missingInformation: [],
        why: [
          "Des éléments incompatibles empêchent toute conclusion d’applicabilité."
        ],
        sourceRefs,
        ruleRefs
      };
    case "notApplicable":
      return {
        status: "notApplicable",
        summary:
          "Selon les informations disponibles et la règle modélisée, ce point n’est pas pertinent pour ce dossier.",
        details: why,
        missingInformation: [],
        why: ["La règle d’applicabilité conclut à non pertinent."],
        sourceRefs,
        ruleRefs
      };
    case "unknown":
    default:
      return {
        status: "unknown",
        summary:
          "Cette information ne peut pas encore être déterminée avec les éléments disponibles.",
        details: why,
        missingInformation,
        why: [
          "Les sources modélisées ne suffisent pas pour conclure sur ce point."
        ],
        sourceRefs,
        ruleRefs
      };
  }
}
