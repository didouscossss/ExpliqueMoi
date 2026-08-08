/**
 * Stub de compilation uniquement — vérifie que DocumentProfile est implémentable.
 * Non exécuté en runtime productif.
 */

import type {
  DocumentClassification,
  DocumentProfile,
  DocumentProfileContext,
  ProfileAnalysisResult,
  ProfileResolutionResult,
  ProfileValidationResult
} from "./index.js";
import { DocumentSession } from "./documentSession.js";
import { toConfidence } from "./confidence.js";

class UnknownProfileStub implements DocumentProfile {
  readonly id = "unknown" as const;
  readonly expectedFields = [];
  readonly optionalFields = [];

  supports(
    classification: DocumentClassification,
    _session?: DocumentSession | null
  ): boolean {
    return classification.primary === "unknown";
  }

  resolveFields(ctx: DocumentProfileContext): ProfileResolutionResult {
    return {
      profileId: this.id,
      fields: [],
      completeness: {
        completeness: 1,
        missingRequired: [],
        ambiguous: [],
        resolvedHighConfidence: [],
        resolved: [],
        notApplicable: []
      },
      relations: ctx.relations ? [...ctx.relations] : [],
      warnings: []
    };
  }

  validate(ctx: DocumentProfileContext): ProfileValidationResult {
    return { ok: true, resolution: this.resolveFields(ctx), issues: [] };
  }

  analyze(ctx: DocumentProfileContext): ProfileAnalysisResult {
    return {
      fields: [],
      relations: ctx.relations ? [...ctx.relations] : [],
      warnings: [],
      resolution: this.resolveFields(ctx)
    };
  }
}

/** Empêche l’élimination tree-shake du stub pendant tsc. */
export function __v4aTypecheckSmoke(): string {
  const session = DocumentSession.create({ rawText: null });
  const profile = new UnknownProfileStub();
  const classification: DocumentClassification = {
    scores: { unknown: 1 },
    primary: "unknown",
    confidence: toConfidence(0.2),
    status: "unknown",
    alternatives: [],
    secondarySections: [],
    evidence: [],
    contradictions: []
  };
  const ok = profile.supports(classification, session);
  session.destroy();
  return ok ? "ok" : "no";
}
