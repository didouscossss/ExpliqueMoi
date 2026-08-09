/**
 * V4-Y — Faits documentaires génériques (hors domaine fiscal).
 * FACT ≠ INTERPRETATION. Aucune dépendance fr/tax/.
 */

import type { EvidenceSpan } from "../types/evidence.js";
import type { LocalExplanation } from "../types/knowledge.js";

/** Catégories de ce qui a été trouvé — pas de signification juridique. */
export type GenericFactKind =
  | "date"
  | "amount"
  | "reference"
  | "organization"
  | "person"
  | "address"
  | "contact"
  | "deadline"
  | "period"
  | "documentTitle"
  | "informationalText"
  | "unknown";

/** Importance auditable, déterministe — pas de ML. */
export type GenericFactImportance = "important" | "normal" | "context";

/** Classification prudente hors registry fiscal. */
export type GenericDocumentTypeId = "renewalNotice" | "unknown";

export type GenericNormalizedAmount = {
  amount: number;
  currency: "EUR";
};

export type GenericNormalizedValue =
  | string
  | number
  | GenericNormalizedAmount
  | null;

/**
 * Fait générique explicitement présent dans le document.
 * Distinct de CandidateDocumentFact (tax / fieldCode).
 */
export interface GenericDocumentFact {
  id: string;
  documentId: string;
  kind: GenericFactKind;
  label: string;
  rawValue: string;
  normalizedValue?: GenericNormalizedValue;
  confidence: number;
  importance: GenericFactImportance;
  evidence: EvidenceSpan[];
  sourceLocation?: {
    lineIndex: number | null;
    page: number | null;
  } | null;
  /**
   * Rôle structurel explicite (ex. documentDate) — jamais inventé.
   * Absent si le contexte ne permet pas de le déterminer.
   */
  structuralRole?: string | null;
  /** Ambiguïté de rôle (date/montant sans contexte). */
  roleAmbiguous?: boolean;
}

export interface GenericClarificationQuestion {
  questionId: string;
  relatedFactId: string;
  prompt: string;
  reason: string;
  expectedAnswerType: "text" | "date" | "amount" | "choice";
}

/**
 * Réponse utilisateur — UserFact distinct, ne réécrit jamais le document.
 */
export interface GenericUserFact {
  kind: "user";
  factId: string;
  questionId: string;
  relatedFactId: string | null;
  answer: string;
  rawAnswer: string;
  normalizedValue?: string | number | null;
  source: "clarification";
  answeredAt: string | null;
  sequence: number;
}

export interface GenericSafetyInvariants {
  implicitDocumentObligation: number;
  implicitAmountMeaning: number;
  implicitDeadlineMeaning: number;
  unsupportedDocumentClassification: number;
  genericFactPromotedToDomainFact: number;
  genericFactPromotedToEligibility: number;
  genericFactPromotedToDeclaration: number;
  unsourcedGenericExplanation: number;
}

export interface GenericDocumentPreview {
  ceDocument: string;
  aRetenir: string[];
  emisPar: string | null;
  pourquoi: Array<{ label: string; evidence: string }>;
  informationIncertaine: string[];
}

export interface GenericDocumentUnderstanding {
  documentId: string;
  documentType: GenericDocumentTypeId;
  documentTypeConfidence: number;
  documentTypeEvidence: string[];
  facts: GenericDocumentFact[];
  importantFacts: GenericDocumentFact[];
  explanations: LocalExplanation[];
  clarifications: GenericClarificationQuestion[];
  userFacts: GenericUserFact[];
  preview: GenericDocumentPreview;
  safety: GenericSafetyInvariants;
  /** Compteurs isolation domaine. */
  taxRulesTriggered: number;
  taxCalculations: number;
  fetchCount: number;
  llmCount: number;
}

export interface GenericDocumentSeed {
  text: string;
  fileName?: string | null;
  id?: string | null;
}

export interface GenericDocumentSession {
  documents: Array<{
    id: string;
    text: string;
    fileName: string | null;
    order: number;
  }>;
  understandings: GenericDocumentUnderstanding[];
  /** Concaténation déterministe des faits (ordre upload). */
  facts: GenericDocumentFact[];
  explanations: LocalExplanation[];
  safety: GenericSafetyInvariants;
}
