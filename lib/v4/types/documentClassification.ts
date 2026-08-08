/**
 * Classification multi-scores (Document Schema Router — V4-C plus tard).
 * IBAN+BIC ne suffit PAS à conclure bankStatement.
 */

import type { Confidence } from "./confidence.js";

export type DocumentTypeId =
  | "invoice"
  | "administrativeLetter"
  | "taxNotice"
  | "bankStatement"
  | "contract"
  | "payslip"
  | "certificate"
  | "form"
  | "fiscalPackage"
  | "explanatoryDocument"
  | "legalDocument"
  | "unknown";

/** Scores par type dans [0, 1]. Plusieurs types peuvent être élevés. */
export type DocumentTypeScores = Partial<Record<DocumentTypeId, number>>;

export interface ClassificationSignals {
  strong?: string[];
  secondary?: string[];
  negative?: string[];
  /** Combinaisons / structure (layout, tableaux…). */
  structural?: string[];
}

export interface DocumentClassification {
  scores: DocumentTypeScores;
  /** Type retenu (souvent le max) ; unknown si aucun seuil. */
  primary: DocumentTypeId;
  confidence: Confidence;
  signals?: ClassificationSignals;
}

export const DOCUMENT_TYPE_IDS: readonly DocumentTypeId[] = [
  "invoice",
  "administrativeLetter",
  "taxNotice",
  "bankStatement",
  "contract",
  "payslip",
  "certificate",
  "form",
  "fiscalPackage",
  "explanatoryDocument",
  "legalDocument",
  "unknown"
] as const;
