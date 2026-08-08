/**
 * Socle de types V4-A — Document Intelligence Engine.
 * Aucun extracteur / routeur / profil concret ici (étapes B+).
 */

export type { BoundingBox } from "./geometry.js";

export type { ConfidenceLevel, Confidence } from "./confidence.js";
export {
  CONFIDENCE_THRESHOLDS,
  toConfidence,
  clamp01,
  isHighConfidence,
  isDisplayableConfidence
} from "./confidence.js";

export type { EvidenceSpan, FieldEvidence } from "./evidence.js";

export type { TextSource, TextBlock } from "./textBlock.js";

export type {
  EntityType,
  ScoreReason,
  RoleHypothesis,
  EntityCandidate,
  CandidateContext,
  MoneyCandidate,
  PersonCandidate,
  OrganizationCandidate,
  DateCandidate,
  PercentageCandidate,
  ReferenceCandidate,
  TableCandidate,
  MoneyRole
} from "./entityCandidate.js";

export type { RelationKind, Relation } from "./relation.js";

export type {
  DocumentTypeId,
  DocumentTypeScores,
  ClassificationSignals,
  DocumentClassification
} from "./documentClassification.js";
export { DOCUMENT_TYPE_IDS } from "./documentClassification.js";

export type {
  DocumentProfileContext,
  ProfileAnalysisResult,
  DocumentProfile
} from "./documentProfile.js";

export type { DocumentSessionInit } from "./documentSession.js";
export { DocumentSession } from "./documentSession.js";
