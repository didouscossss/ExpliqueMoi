/**
 * Relations entre EntityCandidate (V4-C).
 * Traçables jusqu’aux TextBlock via evidence.
 */

import type { ScoreReason } from "./entityCandidate.js";
import type { EvidenceSpan } from "./evidence.js";

/** Types de relations du moteur générique V4-C. */
export type RelationType =
  | "arithmetic"
  | "spatial"
  | "semantic"
  | "temporal"
  | "ownership"
  | "actionDeadline"
  | "tableMembership"
  | "sameSection"
  | "sender"
  | "recipient"
  | "issuer"
  | "organizationPerson";

/** @deprecated alias V4-A — préférer RelationType. */
export type RelationKind = RelationType | "ht_vat_ttc" | "ht_rate_ttc" | "other";

export interface Relation {
  id: string;
  sourceCandidateId: string;
  targetCandidateId: string;
  type: RelationType | string;
  /** Score 0..1. */
  score: number;
  reasons: ScoreReason[];
  evidence: EvidenceSpan[];
  /** Candidats intermédiaires (ex. vatRate / vatAmount). */
  via?: string[];
  label?: string;
}

export interface Contradiction {
  id: string;
  /** Combinaison / relation concernée. */
  subjectIds: string[];
  kind: string;
  message: string;
  /** Pénalité appliquée au score global (négatif). */
  penalty: number;
  reasons: ScoreReason[];
  evidence: EvidenceSpan[];
}

export type ConsistencyStatus =
  | "resolved"
  | "ambiguous"
  | "contradictory"
  | "partial";

export interface FieldAssignment {
  role: string;
  candidateId: string;
  value: unknown;
  localScore: number;
}

/**
 * Une solution globale = combinaison de rôles + relations + score explicable.
 */
export interface ConsistencySolution {
  id: string;
  status: ConsistencyStatus;
  assignments: FieldAssignment[];
  score: number;
  reasons: ScoreReason[];
  relations: Relation[];
  contradictions: Contradiction[];
  /** Alternatives proches si status === "ambiguous". */
  alternatives?: ConsistencySolution[];
}

export interface ConsistencyResult {
  status: ConsistencyStatus;
  /** Meilleure solution (ou première des ambiguës). */
  best: ConsistencySolution | null;
  solutions: ConsistencySolution[];
  relations: Relation[];
  contradictions: Contradiction[];
}
