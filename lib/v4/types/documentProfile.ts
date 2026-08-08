/**
 * Profil documentaire spécialisé (InvoiceProfile, TaxNoticeProfile, …).
 * Le moteur reste extensible via cette interface — implémentations en V4-D+.
 */

import type { DocumentClassification } from "./documentClassification.js";
import type { DocumentSession } from "./documentSession.js";
import type { EntityCandidate } from "./entityCandidate.js";
import type { FieldEvidence } from "./evidence.js";
import type { Relation } from "./relation.js";
import type { TextBlock } from "./textBlock.js";

export interface DocumentProfileContext {
  session: DocumentSession;
  classification: DocumentClassification;
  candidates: readonly EntityCandidate[];
  blocks: readonly TextBlock[];
}

export interface ProfileAnalysisResult {
  /** Champs validés avec evidence + confidence. */
  fields: FieldEvidence[];
  relations: Relation[];
  warnings: string[];
}

/**
 * Contrat d’un profil spécialisé.
 * supports → analyze → validate (ordre attendu par le moteur futur).
 */
export interface DocumentProfile {
  readonly id: string;
  /** Types / conditions pour lesquels ce profil s’applique. */
  supports(
    classification: DocumentClassification,
    session: DocumentSession
  ): boolean;
  analyze(
    ctx: DocumentProfileContext
  ): ProfileAnalysisResult | Promise<ProfileAnalysisResult>;
  validate(
    result: ProfileAnalysisResult,
    ctx: DocumentProfileContext
  ): ProfileAnalysisResult | Promise<ProfileAnalysisResult>;
}
