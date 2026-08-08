/**
 * Classification multi-scores (Document Schema Router — V4-D).
 * IBAN+BIC ne suffit PAS à conclure bankStatement.
 * Liste extensible via le registre de profils.
 */

import type { Confidence } from "./confidence.js";
import type { ScoreReason } from "./entityCandidate.js";
import type { EvidenceSpan } from "./evidence.js";

/**
 * Types documentaires initiaux V4-D.
 * Extensible : enregistrer un nouveau SchemaProfile suffit.
 */
export type DocumentTypeId =
  | "invoice"
  | "bankStatement"
  | "taxDocument"
  | "administrativeLetter"
  | "contract"
  | "payslip"
  | "receipt"
  | "notice"
  | "form"
  | "certificate"
  | "financialStatement"
  | "explanatoryDocument"
  | "unknown"
  /** Alias V4-A conservés pour compat. */
  | "taxNotice"
  | "fiscalPackage"
  | "legalDocument";

/** Scores par type dans [0, 1]. */
export type DocumentTypeScores = Partial<Record<DocumentTypeId, number>>;

export type SignalFamily =
  | "lexical"
  | "structural"
  | "entity"
  | "relation"
  | "arithmetic"
  | "layout"
  | "negativeEvidence";

export interface ClassificationSignals {
  strong?: string[];
  secondary?: string[];
  negative?: string[];
  structural?: string[];
}

export interface ClassificationEvidenceItem {
  signal: string;
  family: SignalFamily;
  delta: number;
  type?: DocumentTypeId;
  evidence: EvidenceSpan[];
}

export type ClassificationStatus = "resolved" | "ambiguous" | "unknown";

export interface ClassificationAlternative {
  type: DocumentTypeId;
  confidence: number;
}

export interface SecondarySectionSignal {
  type: DocumentTypeId;
  confidence: number;
  signals: string[];
}

/**
 * Résultat de classification non binaire.
 */
export interface DocumentClassification {
  primary: DocumentTypeId;
  confidence: Confidence;
  status: ClassificationStatus;
  scores: DocumentTypeScores;
  alternatives: ClassificationAlternative[];
  /** Sections / fonctions secondaires (ex. paiement SEPA dans une facture). */
  secondarySections: SecondarySectionSignal[];
  evidence: ClassificationEvidenceItem[];
  contradictions: ScoreReason[];
  signals?: ClassificationSignals;
}

export const DOCUMENT_TYPE_IDS: readonly DocumentTypeId[] = [
  "invoice",
  "bankStatement",
  "taxDocument",
  "administrativeLetter",
  "contract",
  "payslip",
  "receipt",
  "notice",
  "form",
  "certificate",
  "financialStatement",
  "explanatoryDocument",
  "unknown"
] as const;
