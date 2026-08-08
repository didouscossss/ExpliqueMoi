/**
 * V4-L / V4-M — Knowledge types.
 * KnowledgeFact ≠ DocumentFact (faits utilisateur).
 */

import type { EvidenceSpan } from "./evidence.js";
import type { DocumentTypeId } from "./documentClassification.js";

/** Pays supportés pour les registres de connaissance. */
export type KnowledgeCountry = "FR";

/**
 * Familles fiscales françaises (extensible, non exhaustive).
 * Guidées par les sources officielles découvertes — pas une liste marketing.
 */
export type FrenchTaxFamily =
  | "incomeTaxReturn"
  | "incomeTaxNotice"
  | "propertyTax"
  | "housingTax"
  | "withholdingTax"
  | "taxCreditReduction"
  | "taxRefund"
  | "taxPayment"
  | "foreignIncomeDeclaration"
  | "rentalIncomeDeclaration"
  | "professionalIncomeDeclaration"
  | "professionalBenefits"
  | "capitalGainsDeclaration"
  | "wealthTax"
  | "inheritanceDonation"
  | "foreignAccountsDeclaration"
  | "corporateTax"
  | "vatDeclaration"
  | "businessTax"
  | "taxCertificate"
  | "taxAdministrativeLetter"
  | "taxForm"
  | "taxNotice"
  | "taxInstruction"
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
  | "yearVariant"
  | "supplementOf"
  | "annexOf"
  | "instructionFor"
  | "replaces"
  | "replacedBy"
  | "relatedTo"
  | "requiredWith"
  | "optionalWith"
  | "yearVariantOf";

/** Nature du document indexé (formulaire ≠ notice). */
export type TaxDocumentKind =
  | "form"
  | "notice"
  | "instruction"
  | "taxNotice"
  | "certificate"
  | "administrativeLetter"
  | "other";

export type TaxVariantKind =
  | "base"
  | "complement"
  | "pro"
  | "rici"
  | "sd"
  | "nr"
  | "ifi"
  | "iom"
  | "other"
  | "unknown";

export type KnowledgeSourceType = "official" | "derived" | "curated";

export type RegistryEntryStatus =
  | "integrated"
  | "discovered"
  | "validated"
  | "rejected"
  | "needsReview";

export type RegistryLookupMatchKind =
  | "exact"
  | "normalized"
  | "cerfa"
  | "alias"
  | "possible"
  | "none";

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

export interface MetadataQualityScore {
  score: number;
  hasOfficialReference: boolean;
  hasOfficialTitle: boolean;
  hasOfficialSource: boolean;
  hasAuthority: boolean;
  hasYearInformation: boolean;
  hasCerfa: boolean;
  hasRelations: boolean;
  /** Cerfa non attendu pour ce type → ne pénalise pas. */
  cerfaApplicable: boolean;
}

export interface FrenchTaxDocumentEntry {
  id: string;
  country: KnowledgeCountry;
  authority: string;
  family: FrenchTaxFamily;
  /** Type V4 associé (signal, pas décision absolue). */
  documentType: DocumentTypeId;
  /** form vs notice vs instruction… */
  documentKind: TaxDocumentKind;
  referenceNumbers: string[];
  /** Référence brute telle que découverte (typo source). */
  rawReference?: string | null;
  normalizedReference: string;
  baseReference?: string | null;
  variantKind?: TaxVariantKind | null;
  cerfaNumbers: string[];
  cerfaVersion?: string | null;
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
  quality?: MetadataQualityScore;
  status?: RegistryEntryStatus;
  metadataHash?: string | null;
}

export interface FrenchTaxDocumentRegistry {
  version: string;
  country: KnowledgeCountry;
  generatedAt: string;
  sourceMode: "curated-official" | "auto-refresh" | "discovery+curated";
  entries: FrenchTaxDocumentEntry[];
  /** Compteurs discovery (build). */
  discoveryStats?: {
    discovered: number;
    validated: number;
    integrated: number;
    rejected: number;
    needsReview: number;
  };
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
  /** V4-M OCR / normalisation. */
  rawText?: string;
  normalizedCandidate?: string;
  normalizationReason?: string | null;
  matchKind?: RegistryLookupMatchKind;
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
  /** Identité principale si non ambiguë. */
  primaryIdentity?: DetectedFiscalReference | null;
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

/** Candidat uniforme produit par les source adapters (build-time). */
export interface OfficialDocumentCandidate {
  rawReference: string;
  reference: string;
  title: string;
  url: string;
  authority: string;
  cerfa?: string | null;
  year?: number | null;
  source: string;
  retrievedAt: string;
  documentKindGuess?: TaxDocumentKind;
  metadataHash?: string;
}
