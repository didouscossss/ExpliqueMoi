/**
 * Document Understanding (V4-F) — compréhension structurée evidence-first.
 * Aucun texte génératif / résumé naturel.
 */

import type { Confidence } from "./confidence.js";
import type { DocumentClassification } from "./documentClassification.js";
import type { FieldImportance, FieldResolutionStatus } from "./documentProfile.js";
import type { ScoreReason } from "./entityCandidate.js";
import type { EvidenceSpan } from "./evidence.js";

export type UnderstandingClaimStatus =
  | FieldResolutionStatus
  | "unknown"
  | "notFound"
  | "noExplicitActionDetected";

export type PurposeKind =
  | "paymentRequest"
  | "informationRequest"
  | "certification"
  | "information"
  | "agreement"
  | "accountStatement"
  | "taxObligation"
  | "employmentRecord"
  | "formSubmission"
  | "explanation"
  | "unknown";

export type PartyRole =
  | "issuer"
  | "legalIssuer"
  | "sender"
  | "recipient"
  | "beneficiary"
  | "accountHolder"
  | "employer"
  | "employee"
  | "taxpayer"
  | "authority"
  | "contractingParty";

export type WarningKind =
  | "arithmeticContradiction"
  | "conflictingValues"
  | "missingExpectedField"
  | "ambiguousField"
  | "lowConfidence"
  | "unusualStructure"
  | "unresolvedRelation";

/**
 * Affirmation structurée — toujours reliée à des preuves si factuelle.
 */
export interface UnderstandingItem {
  kind: string;
  value: unknown;
  confidence: Confidence;
  status: UnderstandingClaimStatus;
  importance: FieldImportance;
  evidence: EvidenceSpan[];
  /** Champs / relations / candidats ayant permis la conclusion. */
  derivedFrom: string[];
  /** Raisons machine-readable. */
  reasoning: ScoreReason[];
}

export interface DocumentIdentity {
  documentType: string;
  title?: UnderstandingItem | null;
  reference?: UnderstandingItem | null;
}

export interface ActionUnderstanding {
  actionType: string;
  description: string | null;
  actor?: string | null;
  target?: string | null;
  deadline?: UnderstandingItem | null;
  requiredDocuments: UnderstandingItem[];
  conditions: UnderstandingItem[];
  confidence: Confidence;
  evidence: EvidenceSpan[];
  status: UnderstandingClaimStatus;
  derivedFrom: string[];
  reasoning: ScoreReason[];
}

export interface UnderstandingWarning {
  kind: WarningKind;
  message: string;
  relatedKinds: string[];
  confidence: Confidence;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
  reasoning: ScoreReason[];
}

export interface UnderstandingUncertainty {
  kind: string;
  status: "ambiguous" | "lowConfidence" | "unresolved";
  candidates: Array<{
    value: unknown;
    confidence: number;
    evidence: EvidenceSpan[];
    derivedFrom: string[];
  }>;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
  reasoning: ScoreReason[];
}

export interface SectionUnderstanding {
  title: string | null;
  kind: string;
  items: UnderstandingItem[];
  evidence: EvidenceSpan[];
}

export interface EvidenceCoverage {
  totalClaims: number;
  directlySupported: number;
  relationallySupported: number;
  unsupported: number;
  coverage: number;
}

/**
 * Résumé STRUCTURÉ uniquement — pas de phrases UI.
 */
export interface StructuredSummary {
  what: UnderstandingItem[];
  who: UnderstandingItem[];
  why: UnderstandingItem[];
  important: UnderstandingItem[];
  actions: ActionUnderstanding[];
  deadlines: UnderstandingItem[];
  amounts: UnderstandingItem[];
  warnings: UnderstandingWarning[];
  uncertainties: UnderstandingUncertainty[];
}

export interface DocumentUnderstanding {
  documentType: DocumentClassification;
  identity: DocumentIdentity;
  purpose: UnderstandingItem;
  parties: UnderstandingItem[];
  keyFacts: UnderstandingItem[];
  financialFacts: UnderstandingItem[];
  importantDates: UnderstandingItem[];
  actions: ActionUnderstanding[];
  warnings: UnderstandingWarning[];
  uncertainties: UnderstandingUncertainty[];
  sections: SectionUnderstanding[];
  evidenceCoverage: EvidenceCoverage;
  structuredSummary: StructuredSummary;
}
