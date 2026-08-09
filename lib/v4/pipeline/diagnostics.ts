/**
 * Diagnostics end-to-end V4-I — inspection tests/debug uniquement.
 */

import type { DocumentClassification } from "../types/documentClassification.js";
import type { DocumentExplanation } from "../types/documentExplanation.js";
import type {
  ProfileResolutionResult,
  ResolvedField
} from "../types/documentProfile.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { UserPresentation } from "../types/userPresentation.js";
import type { DocumentUnderstanding } from "../types/documentUnderstanding.js";

export interface V4Diagnostics {
  primaryDocumentType: string;
  classificationConfidence: number;
  classificationStatus: string;
  secondarySections: Array<{ kind: string; confidence: number; signals: string[] }>;
  resolvedFields: string[];
  ambiguousFields: string[];
  missingRequiredFields: string[];
  notApplicableFields: string[];
  contradictions: string[];
  evidenceCoverage: {
    totalClaims: number;
    unsupported: number;
    coverage: number;
  };
  unsupportedExplanationFacts: number;
  unsupportedPresentationFacts: number;
  inventedActions: number;
  inventedDeadlines: number;
  inventedAmounts: number;
  inventedReasons: number;
  relationTypes: string[];
  presentationActionsCount: number;
  hasArithmeticInconsistency: boolean;
  invariantErrors: string[];
}

function fieldNames(fields: readonly ResolvedField[], status: string): string[] {
  return fields.filter((f) => f.status === status).map((f) => f.field);
}

export function buildV4Diagnostics(input: {
  classification: DocumentClassification;
  resolution: ProfileResolutionResult;
  relations: readonly Relation[];
  consistency: ConsistencyResult | null;
  understanding: DocumentUnderstanding;
  explanation: DocumentExplanation;
  presentation: UserPresentation;
  explanationInvariantErrors: string[];
  presentationInvariantErrors: string[];
}): V4Diagnostics {
  const { classification, resolution, explanation, presentation } = input;
  const contradictions = [
    ...(input.consistency?.contradictions || []).map((c) => c.message),
    ...explanation.warnings
      .filter((w) => w.status === "contradictory")
      .map((w) => w.message)
  ];

  return {
    primaryDocumentType: classification.primary,
    classificationConfidence: classification.confidence.score,
    classificationStatus: classification.status,
    secondarySections: (classification.secondarySections || []).map((s) => ({
      kind: s.kind,
      confidence: s.confidence,
      signals: [...s.signals]
    })),
    resolvedFields: fieldNames(resolution.fields, "resolved"),
    ambiguousFields: [
      ...fieldNames(resolution.fields, "ambiguous"),
      ...explanation.importantFacts
        .filter((f) => f.status === "ambiguous")
        .map((f) => f.field),
      ...explanation.deadlines
        .filter((f) => f.status === "ambiguous")
        .map((f) => f.field),
      ...explanation.amounts
        .filter((f) => f.status === "ambiguous")
        .map((f) => f.field)
    ].filter((v, i, a) => a.indexOf(v) === i),
    missingRequiredFields: [...resolution.completeness.missingRequired],
    notApplicableFields: fieldNames(resolution.fields, "notApplicable"),
    contradictions,
    evidenceCoverage: {
      totalClaims: explanation.evidenceCoverage.totalClaims,
      unsupported: explanation.evidenceCoverage.unsupported,
      coverage: explanation.evidenceCoverage.coverage
    },
    unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
    unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
    inventedActions: presentation.inventedActions,
    inventedDeadlines: presentation.inventedDeadlines,
    inventedAmounts: presentation.inventedAmounts,
    inventedReasons: presentation.inventedReasons,
    relationTypes: [...new Set(input.relations.map((r) => String(r.type)))],
    presentationActionsCount: presentation.actions.filter(
      (a) => a.kind === "userAction"
    ).length,
    hasArithmeticInconsistency: explanation.warnings.some(
      (w) => w.kind === "arithmeticInconsistency"
    ),
    invariantErrors: [
      ...input.explanationInvariantErrors,
      ...input.presentationInvariantErrors
    ]
  };
}
