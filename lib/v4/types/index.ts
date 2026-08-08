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

export type {
  RelationType,
  RelationKind,
  Relation,
  Contradiction,
  ConsistencyStatus,
  FieldAssignment,
  ConsistencySolution,
  ConsistencyResult
} from "./relation.js";

export type {
  DocumentTypeId,
  DocumentTypeScores,
  SignalFamily,
  ClassificationSignals,
  ClassificationEvidenceItem,
  ClassificationStatus,
  ClassificationAlternative,
  SecondarySectionKind,
  SecondarySectionSignal,
  DocumentClassification
} from "./documentClassification.js";
export {
  DOCUMENT_TYPE_IDS,
  SECONDARY_SECTION_KINDS
} from "./documentClassification.js";

export type {
  FieldImportance,
  FieldCardinality,
  FieldResolutionStatus,
  FieldExpectation,
  RelationExpectation,
  FieldAlternative,
  ResolvedField,
  ProfileCompleteness,
  ProfileResolutionResult,
  ProfileValidationResult,
  DocumentProfileContext,
  ProfileAnalysisResult,
  DocumentProfile
} from "./documentProfile.js";

export type {
  UnderstandingClaimStatus,
  PurposeKind,
  PartyRole,
  WarningKind,
  UnderstandingItem,
  DocumentIdentity,
  ActionUnderstanding,
  UnderstandingWarning,
  UnderstandingUncertainty,
  SectionUnderstanding,
  EvidenceCoverage,
  StructuredSummary,
  DocumentUnderstanding
} from "./documentUnderstanding.js";

export type {
  ExplanationStatus,
  ExplanationWarningKind,
  ExplanationFact,
  ExplanationAction,
  ExplanationWarning,
  ExplanationSecondaryInfo,
  DocumentExplanation
} from "./documentExplanation.js";

export type {
  PresentationTier,
  PresentationItem,
  PresentationIdentity,
  PresentationEvidencePassage,
  UserPresentation,
  SourceFactRef
} from "./userPresentation.js";

export type { DocumentSessionInit } from "./documentSession.js";
export { DocumentSession } from "./documentSession.js";

export type {
  KnowledgeCountry,
  FrenchTaxFamily,
  FiscalNumericKind,
  FiscalReferenceRole,
  KnowledgeRelationType,
  KnowledgeSourceType,
  KnowledgeProvenance,
  KnowledgeFact,
  DocumentFactRef,
  TaxDocumentRelation,
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry,
  DetectedFiscalReference,
  FiscalKnowledgeSignal,
  FiscalKnowledgeAnalysis,
  ExternalSourceRecord,
  TaxDocumentKind,
  TaxVariantKind,
  RegistryEntryStatus,
  RegistryLookupMatchKind,
  OfficialDocumentCandidate,
  MetadataQualityScore,
  TaxKnowledgeQualityStatus,
  FiscalYearRole,
  TaxKnowledgeSection,
  TaxCerfaInfo,
  TaxDocumentSemanticKnowledge,
  TaxDocumentExplanation
} from "./knowledge.js";
