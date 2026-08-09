/**
 * Explications déterministes d’applicabilité — V4-T.
 * Ton informatif ; pas d’obligation / éligibilité inventée.
 */

import type {
  TaxApplicabilityConditionEvaluation,
  TaxApplicabilityExplanation,
  TaxApplicabilityRule,
  TaxApplicabilityStatus
} from "../../../../types/knowledge.js";

const HEADLINES: Record<TaxApplicabilityStatus, string> = {
  applicable:
    "Les conditions modélisées pour cette case sont satisfaites selon les informations disponibles.",
  notApplicable:
    "Non applicable selon les informations disponibles et la règle officielle modélisée.",
  needsInformation:
    "Information nécessaire — je ne peux pas encore déterminer si cette case est pertinente.",
  conflicted: "Informations contradictoires — conclusion d’applicabilité impossible.",
  unknown:
    "Impossible à déterminer — les sources modélisées ne suffisent pas pour votre situation."
};

export function explainTaxApplicability(input: {
  status: TaxApplicabilityStatus;
  rule: TaxApplicabilityRule | null;
  cond: TaxApplicabilityConditionEvaluation;
  reasons: string[];
}): TaxApplicabilityExplanation {
  const { status, rule, cond, reasons } = input;
  const why = [...reasons];
  if (status === "applicable") {
    why.push(
      "Les informations disponibles correspondent aux conditions modélisées pour cette case."
    );
  }
  if (status === "needsInformation") {
    for (const m of cond.missingInformation) {
      why.push(`Information manquante : ${m.reason}`);
    }
  }
  if (status === "conflicted") {
    why.push("Les informations disponibles se contredisent sur un élément déterminant.");
  }
  if (status === "unknown") {
    why.push(
      "Les sources actuellement modélisées décrivent cette case, mais ne suffisent pas à déterminer son applicabilité à votre situation."
    );
  }

  const limits = [
    "Cette évaluation ne signifie pas une obligation de déclarer un montant.",
    "Cette évaluation ne constitue pas une décision d’accès à un avantage fiscal."
  ];
  if (rule?.sourceExcerpt) {
    limits.push(`Périmètre de la règle : ${rule.sourceExcerpt}`);
  }

  return {
    status,
    headline: HEADLINES[status],
    why: [...new Set(why)],
    conditionsSatisfied:
      cond.result === "true" ? [cond.trace] : [],
    conditionsNotSatisfied:
      cond.result === "false" ? [cond.trace] : [],
    missingInformation: cond.missingInformation.map((m) => m.question),
    conflicts: cond.conflicts,
    provenance: (rule?.provenance || [])
      .filter((p) => p.url)
      .map((p) => ({ title: p.title || "Source officielle", url: p.url })),
    limits
  };
}

export function applicabilityStatusLabel(
  status: TaxApplicabilityStatus
): string {
  switch (status) {
    case "applicable":
      return "Conditions satisfaites";
    case "notApplicable":
      return "Non applicable selon les informations disponibles";
    case "needsInformation":
      return "Information nécessaire";
    case "conflicted":
      return "Informations contradictoires";
    case "unknown":
    default:
      return "Impossible à déterminer";
  }
}
