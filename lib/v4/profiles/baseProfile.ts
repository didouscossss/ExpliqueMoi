/**
 * Fabrique de DocumentProfile déclaratifs (V4-E).
 */

import type { DocumentTypeId } from "../types/documentClassification.js";
import type {
  DocumentProfile,
  DocumentProfileContext,
  FieldExpectation,
  ProfileAnalysisResult,
  ProfileResolutionResult,
  ProfileValidationResult,
  RelationExpectation
} from "../types/documentProfile.js";
import type { DocumentClassification } from "../types/documentClassification.js";
import type { DocumentSession } from "../types/documentSession.js";
import {
  resolutionToAnalysis,
  resolveProfileFields,
  validateProfile
} from "./resolver.js";

export interface ProfileDefinition {
  id: DocumentTypeId;
  expectedFields: FieldExpectation[];
  optionalFields: FieldExpectation[];
  notApplicableFields?: FieldExpectation[];
  forbiddenOrSuspiciousFields?: FieldExpectation[];
  expectedRelations?: RelationExpectation[];
  /** Types acceptés en plus de id (alias). */
  alsoSupports?: DocumentTypeId[];
}

export function createDocumentProfile(def: ProfileDefinition): DocumentProfile {
  const profile: DocumentProfile = {
    id: def.id,
    expectedFields: def.expectedFields,
    optionalFields: def.optionalFields,
    notApplicableFields: def.notApplicableFields,
    forbiddenOrSuspiciousFields: def.forbiddenOrSuspiciousFields,
    expectedRelations: def.expectedRelations,

    supports(
      classification: DocumentClassification,
      _session?: DocumentSession | null
    ): boolean {
      if (classification.primary === def.id) return true;
      return Boolean(def.alsoSupports?.includes(classification.primary));
    },

    resolveFields(ctx: DocumentProfileContext): ProfileResolutionResult {
      return resolveProfileFields(profile, ctx);
    },

    validate(ctx: DocumentProfileContext): ProfileValidationResult {
      return validateProfile(profile, ctx);
    },

    analyze(ctx: DocumentProfileContext): ProfileAnalysisResult {
      return resolutionToAnalysis(profile.resolveFields(ctx));
    }
  };
  return profile;
}
