/**
 * Document Explanation (V4-G) — couche explicative déterministe.
 * Structurée, evidence-first — aucune prose UI générée.
 */

import type { Confidence } from "./confidence.js";
import type {
  DocumentClassification,
  SecondarySectionSignal
} from "./documentClassification.js";
import type { ScoreReason } from "./entityCandidate.js";
import type { EvidenceSpan } from "./evidence.js";
import type { EvidenceCoverage } from "./documentUnderstanding.js";

/**
 * Statut explicatif — ne transforme jamais une hypothèse en vérité.
 */
export type ExplanationStatus =
  | "supported"
  | "derived"
  | "ambiguous"
  | "contradictory"
  | "missing"
  | "notApplicable";

export type ExplanationWarningKind =
  | "arithmeticInconsistency"
  | "conflictingValues"
  | "ambiguousField";

/**
 * Fait explicatif structuré — toujours relié aux preuves si affirmatif.
 */
export interface ExplanationFact {
  kind: string;
  field: string;
  value: unknown;
  confidence: Confidence;
  status: ExplanationStatus;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
  reasoning: ScoreReason[];
}

export interface ExplanationAction {
  actionType: string;
  description: string | null;
  deadline: ExplanationFact | null;
  confidence: Confidence;
  status: ExplanationStatus | "noExplicitActionDetected";
  evidence: EvidenceSpan[];
  derivedFrom: string[];
  reasoning: ScoreReason[];
}

export interface ExplanationWarning {
  kind: ExplanationWarningKind;
  message: string;
  relatedFields: string[];
  confidence: Confidence;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
  reasoning: ScoreReason[];
  status: "contradictory" | "ambiguous";
}

export interface ExplanationSecondaryInfo {
  kind: string;
  /** SecondarySectionKind uniquement — jamais un DocumentTypeId. */
  sectionKind: string;
  signals: string[];
  confidence: number;
  status: ExplanationStatus;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
}

/**
 * Représentation explicative exploitable plus tard par l’UI.
 * Aucune longue phrase générée ici.
 */
export interface DocumentExplanation {
  documentType: DocumentClassification;
  title: ExplanationFact | null;
  summaryFacts: ExplanationFact[];
  importantFacts: ExplanationFact[];
  actions: ExplanationAction[];
  deadlines: ExplanationFact[];
  amounts: ExplanationFact[];
  warnings: ExplanationWarning[];
  secondaryInformation: ExplanationSecondaryInfo[];
  evidenceCoverage: EvidenceCoverage;
  /** Compteur anti-hallucination : doit rester 0. */
  unsupportedExplanationFacts: number;
}
