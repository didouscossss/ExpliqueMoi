/**
 * Profils documentaires spécialisés (V4-E).
 * Reçoivent un DocumentType déjà déterminé (V4-D) — ne refont pas la classification.
 */

import type { Confidence } from "./confidence.js";
import type {
  DocumentClassification,
  DocumentTypeId
} from "./documentClassification.js";
import type { DocumentSession } from "./documentSession.js";
import type { EntityCandidate, EntityType, ScoreReason } from "./entityCandidate.js";
import type { EvidenceSpan, FieldEvidence } from "./evidence.js";
import type { ConsistencyResult, Relation } from "./relation.js";
import type { TextBlock } from "./textBlock.js";

export type FieldImportance = "critical" | "high" | "medium" | "low";
export type FieldCardinality = "single" | "multiple";
export type FieldResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "missing"
  | "notApplicable";

/**
 * Attente générique d’un champ pour un profil.
 */
export interface FieldExpectation {
  field: string;
  candidateTypes: EntityType[];
  preferredRoles?: string[];
  required?: boolean;
  importance?: FieldImportance;
  cardinality?: FieldCardinality;
  confidenceThreshold?: number;
  /** Relations qui renforcent ce champ (types Relation). */
  expectedRelations?: string[];
  /** Signaux lexicaux négatifs (contexte) qui pénalisent un candidat. */
  negativeSignals?: RegExp[];
  /**
   * Indices lexicaux positifs sur le contexte candidat / blocs
   * (scoring soft — jamais décision findFirst finale).
   */
  positiveContext?: RegExp[];
  /**
   * Si true, le champ est déclaré non applicable à ce profil
   * (ex. amount sur explanatoryDocument).
   */
  notApplicable?: boolean;
}

export interface RelationExpectation {
  type: string;
  required?: boolean;
  importance?: FieldImportance;
}

export interface FieldAlternative {
  value: unknown;
  confidence: number;
  candidateIds: string[];
  reasons: ScoreReason[];
}

/**
 * Résolution d’un champ attendu — statut explicite.
 */
export interface ResolvedField {
  field: string;
  status: FieldResolutionStatus;
  value?: unknown;
  confidence?: Confidence;
  evidence?: EvidenceSpan[];
  candidateIds?: string[];
  alternatives?: FieldAlternative[];
  reasons?: ScoreReason[];
  expectation: FieldExpectation;
}

export interface ProfileCompleteness {
  completeness: number;
  missingRequired: string[];
  ambiguous: string[];
  resolvedHighConfidence: string[];
  resolved: string[];
  notApplicable: string[];
}

export interface ProfileResolutionResult {
  profileId: DocumentTypeId;
  fields: ResolvedField[];
  completeness: ProfileCompleteness;
  relations: Relation[];
  warnings: string[];
}

export interface ProfileValidationResult {
  ok: boolean;
  resolution: ProfileResolutionResult;
  issues: string[];
}

export interface DocumentProfileContext {
  classification: DocumentClassification;
  candidates: readonly EntityCandidate[];
  blocks: readonly TextBlock[];
  relations?: readonly Relation[];
  consistency?: ConsistencyResult | null;
  session?: DocumentSession | null;
  text?: string;
}

/** Compat V4-A : analyse → FieldEvidence (sans résumé). */
export interface ProfileAnalysisResult {
  fields: FieldEvidence[];
  relations: Relation[];
  warnings: string[];
  resolution?: ProfileResolutionResult;
}

/**
 * Contrat V4-E d’un profil spécialisé.
 * Le profil ne classifie pas — il résout les champs pour un type donné.
 */
export interface DocumentProfile {
  readonly id: DocumentTypeId;
  readonly expectedFields: FieldExpectation[];
  readonly optionalFields: FieldExpectation[];
  readonly notApplicableFields?: FieldExpectation[];
  readonly forbiddenOrSuspiciousFields?: FieldExpectation[];
  readonly expectedRelations?: RelationExpectation[];

  supports(
    classification: DocumentClassification,
    session?: DocumentSession | null
  ): boolean;

  resolveFields(ctx: DocumentProfileContext): ProfileResolutionResult;

  validate(ctx: DocumentProfileContext): ProfileValidationResult;

  /** Compat : mappe resolveFields → FieldEvidence[] (champs resolved uniquement). */
  analyze(ctx: DocumentProfileContext): ProfileAnalysisResult;
}
