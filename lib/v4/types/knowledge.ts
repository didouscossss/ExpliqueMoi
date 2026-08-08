/**
 * V4-L — Knowledge types.
 * KnowledgeFact ≠ DocumentFact (faits utilisateur).
 */

import type { EvidenceSpan } from "./evidence.js";
import type { DocumentTypeId } from "./documentClassification.js";

/** Pays supportés pour les registres de connaissance. */
export type KnowledgeCountry = "FR";

/** Familles fiscales françaises (extensible, non exhaustive). */
export type FrenchTaxFamily =
  | "incomeTaxReturn"
  | "incomeTaxNotice"
  | "propertyTax"
  | "withholdingTax"
  | "taxCreditReduction"
  | "taxRefund"
  | "taxPayment"
  | "foreignIncomeDeclaration"
  | "rentalIncomeDeclaration"
  | "professionalIncomeDeclaration"
  | "corporateTax"
  | "vatDeclaration"
  | "businessTax"
  | "taxCertificate"
  | "taxAdministrativeLetter"
  | "taxForm"
  | "taxNotice"
  | "unknownTaxDocument";

/**
 * Taxonomie des nombres / identifiants fiscaux.
 * Critiquer : ne jamais traiter tout nombre comme formReference.
 */
export type FiscalNumericKind =
  | "formReference"
  | "cerfaNumber"
  | "documentReference"
  | "taxpayerIdentifier"
  | "noticeReference"
  | "businessIdentifier"
  | "fiscalYear"
  | "amount"
  | "date"
  | "unknownNumericIdentifier";

/** Rôle d’une référence dans le document courant. */
export type FiscalReferenceRole =
  | "documentIdentity"
  | "relatedDocument"
  | "mentionedDocument"
  | "attachmentReference"
  | "unknown";

export type KnowledgeRelationType =
  | "supplement"
  | "annex"
  | "relatedDeclaration"
  | "instruction"
  | "replacement"
  | "yearVariant";

export type KnowledgeSourceType = "official" | "derived" | "curated";

export interface KnowledgeProvenance {
  sourceType: KnowledgeSourceType;
  authority: string;
  url: string;
  retrievedAt: string;
  title: string;
  supports: string[];
  licenseId?: string;
}

/**
 * Fait de connaissance générale (registre / officialité).
 * Ne contient JAMAIS une valeur utilisateur extraite d’un document.
 */
export interface KnowledgeFact {
  kind: "knowledge";
  id: string;
  country: KnowledgeCountry;
  statement: string;
  subjectId: string;
  fields: string[];
  provenance: KnowledgeProvenance[];
  confidence: number;
}

/**
 * Fait documentaire utilisateur — doit provenir du document.
 * Séparé explicitement de KnowledgeFact.
 */
export interface DocumentFactRef {
  kind: "document";
  field: string;
  value: unknown;
  evidence: EvidenceSpan[];
  derivedFrom: string[];
}

export interface TaxDocumentRelation {
  targetId: string;
  relationType: KnowledgeRelationType;
  source: string;
  confidence: number;
}

export interface FrenchTaxDocumentEntry {
  id: string;
  country: KnowledgeCountry;
  authority: string;
  family: FrenchTaxFamily;
  /** Type V4 associé (signal, pas décision absolue). */
  documentType: DocumentTypeId;
  referenceNumbers: string[];
  cerfaNumbers: string[];
  aliases: string[];
  officialTitle: string;
  description: string;
  purpose: string;
  applicableYears: number[];
  documentVersion?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  expectedSignals: string[];
  negativeSignals: string[];
  relatedDocuments: TaxDocumentRelation[];
  profileId?: string | null;
  expectedFields: string[];
  officialSources: KnowledgeProvenance[];
  provenance: KnowledgeProvenance[];
  confidence: number;
}

export interface FrenchTaxDocumentRegistry {
  version: string;
  country: KnowledgeCountry;
  generatedAt: string;
  sourceMode: "curated-official" | "auto-refresh";
  entries: FrenchTaxDocumentEntry[];
}

export interface DetectedFiscalReference {
  raw: string;
  normalized: string;
  kind: FiscalNumericKind;
  role: FiscalReferenceRole;
  registryId: string | null;
  family: FrenchTaxFamily | null;
  evidence: EvidenceSpan[];
  confidence: number;
  reasons: string[];
}

export interface FiscalKnowledgeSignal {
  signal: string;
  family: FrenchTaxFamily | "tax" | "negative";
  weight: number;
  registryId?: string | null;
  referenceRole?: FiscalReferenceRole;
  evidence: EvidenceSpan[];
}

export interface FiscalKnowledgeAnalysis {
  enabled: true;
  registryVersion: string;
  detectedReferences: DetectedFiscalReference[];
  signals: FiscalKnowledgeSignal[];
  suggestedFamily: FrenchTaxFamily | null;
  suggestedDocumentType: DocumentTypeId | null;
  suggestedProfileId: string | null;
  knowledgeFacts: KnowledgeFact[];
  /** Invariants knowledge. */
  invariants: {
    knowledgeAsDocumentFact: number;
    personalIdAsFormReference: number;
    mentionedAsIdentity: number;
  };
}

export interface ExternalSourceRecord {
  id: string;
  source: string;
  owner: string;
  license: string;
  termsUrl: string;
  redistributionAllowed: boolean | "UNKNOWN";
  commercialUseAllowed: boolean | "UNKNOWN";
  localBundlingAllowed: boolean | "UNKNOWN";
  retrievalMethod: string;
  notes?: string;
}
