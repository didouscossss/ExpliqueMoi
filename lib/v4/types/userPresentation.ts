/**
 * User Presentation (V4-H) — formulation déterministe pour l’UI.
 * Aucune nouvelle extraction / interprétation métier.
 */

import type { DocumentTypeId } from "./documentClassification.js";
import type { ExplanationFact, ExplanationStatus } from "./documentExplanation.js";
import type { EvidenceSpan } from "./evidence.js";

export type PresentationTier = "primary" | "important" | "secondary";

export interface PresentationItem {
  kind: string;
  label: string;
  text: string;
  value?: unknown;
  status: ExplanationStatus | "noExplicitActionDetected" | "info";
  tier: PresentationTier;
  /** Clés des ExplanationFact / actions / warnings sources (field|kind). */
  sourceFacts: string[];
  evidence: EvidenceSpan[];
}

export interface PresentationIdentity {
  documentType: DocumentTypeId;
  label: string;
  text: string;
  sourceFacts: string[];
  evidence: EvidenceSpan[];
}

export interface PresentationEvidencePassage {
  page: number;
  blockId: string | null;
  excerpt: string;
  supportedFacts: string[];
}

export interface UserPresentation {
  documentIdentity: PresentationIdentity;
  /** L’essentiel — phrases courtes template. */
  essential: PresentationItem[];
  /** Ce que vous devez faire — vide si aucune action supportée. */
  actions: PresentationItem[];
  /** Pourquoi vous l’avez reçu — null si non supporté. */
  reason: PresentationItem | null;
  importantDates: PresentationItem[];
  importantAmounts: PresentationItem[];
  warnings: PresentationItem[];
  evidencePassages: PresentationEvidencePassage[];
  secondaryInformation: PresentationItem[];
  /** Anti-hallucination : doit rester 0. */
  unsupportedPresentationFacts: number;
  inventedActions: number;
  inventedDeadlines: number;
  inventedAmounts: number;
  inventedReasons: number;
}

/** Référence légère vers un fait source (pour traçabilité). */
export type SourceFactRef = Pick<
  ExplanationFact,
  "kind" | "field" | "value" | "status" | "evidence" | "derivedFrom"
>;
