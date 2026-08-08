/**
 * Stub de compilation uniquement — vérifie que DocumentProfile est implémentable.
 * Non exécuté en runtime productif.
 */

import type {
  DocumentClassification,
  DocumentProfile,
  DocumentProfileContext,
  ProfileAnalysisResult
} from "./index.js";
import { DocumentSession } from "./documentSession.js";
import { toConfidence } from "./confidence.js";

class UnknownProfileStub implements DocumentProfile {
  readonly id = "unknown";

  supports(
    classification: DocumentClassification,
    _session: DocumentSession
  ): boolean {
    return classification.primary === "unknown";
  }

  analyze(_ctx: DocumentProfileContext): ProfileAnalysisResult {
    return { fields: [], relations: [], warnings: [] };
  }

  validate(
    result: ProfileAnalysisResult,
    _ctx: DocumentProfileContext
  ): ProfileAnalysisResult {
    return result;
  }
}

/** Empêche l’élimination tree-shake du stub pendant tsc. */
export function __v4aTypecheckSmoke(): string {
  const session = DocumentSession.create({ rawText: null });
  const profile = new UnknownProfileStub();
  const classification: DocumentClassification = {
    scores: { unknown: 1 },
    primary: "unknown",
    confidence: toConfidence(0.2)
  };
  const ok = profile.supports(classification, session);
  session.destroy();
  return ok ? "ok" : "no";
}
