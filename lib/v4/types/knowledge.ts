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
  /** V4-N — explication sémantique vérifiée (pas slug). */
  hasVerifiedSemanticExplanation?: boolean;
}

/** Qualité sémantique V4-N — distincte du statut discovery. */
export type TaxKnowledgeQualityStatus =
  | "verified"
  | "partiallyVerified"
  | "discovered"
  | "needsReview";

/** Rôles d’année — ne pas confondre millésimes. */
export type FiscalYearRole =
  | "documentYear"
  | "incomeYear"
  | "applicableYear"
  | "paymentYear"
  | "issueYear"
  | "unknown";

export interface TaxKnowledgeSection {
  concept: string;
  label: string;
}

export interface TaxCerfaInfo {
  number: string;
  version?: string | null;
  verified: boolean;
  source?: string | null;
}

/**
 * Couche sémantique V4-N — connaissance générale officielle.
 * Jamais une valeur utilisateur.
 */
export interface TaxDocumentSemanticKnowledge {
  reference: string;
  normalizedReference: string;
  officialTitle: string;
  shortTitle: string;
  family: FrenchTaxFamily;
  documentKind: TaxDocumentKind;
  description: string;
  purpose: string;
  audience: string[];
  commonSituations: string[];
  userQuestionsAnswered: string[];
  importantSections: TaxKnowledgeSection[];
  relatedDocumentRefs: string[];
  officialSources: KnowledgeProvenance[];
  cerfa?: TaxCerfaInfo | null;
  applicableYears: number[];
  confidence: number;
  provenance: KnowledgeProvenance[];
  lastVerifiedAt?: string | null;
  qualityStatus: TaxKnowledgeQualityStatus;
  /** Reformulation courte FR pour utilisateur (déterministe). */
  plainLanguageWhat: string;
  plainLanguagePurpose: string;
  /** Actions générales possibles du TYPE — pas obligations utilisateur. */
  generalPossibleActions: string[];
  /** Ce qu’il est pertinent de regarder EN GÉNÉRAL sur ce type. */
  generalWhatToCheck: string[];
}

/**
 * Explication fiscale structurée = Knowledge + DocumentFacts séparés.
 */
export interface TaxDocumentExplanation {
  identity: {
    reference: string | null;
    officialTitle: string | null;
    family: FrenchTaxFamily | null;
    documentKind: TaxDocumentKind | null;
    qualityStatus: TaxKnowledgeQualityStatus | null;
  };
  whatIsIt: string | null;
  purpose: string | null;
  whoIsConcerned: string | null;
  whatToCheck: string[];
  /** Infos générales sur le type — jamais inventées depuis Knowledge comme actions dues. */
  possibleActions: string[];
  /** Faits réellement présents dans le document utilisateur. */
  importantDocumentFacts: DocumentFactRef[];
  relatedDocuments: Array<{
    reference: string;
    title: string;
    relationType?: string;
  }>;
  warnings: string[];
  confidence: number;
  knowledgeFacts: KnowledgeFact[];
  sourceFacts: DocumentFactRef[];
  invariants: {
    documentFactsFromKnowledge: number;
    inventedTaxObligations: number;
    inventedTaxDates: number;
    inventedTaxAmounts: number;
    unsupportedKnowledgeClaims: number;
  };
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
  /** V4-N — Cerfa vérifié officiellement (sinon absent). */
  cerfaVerified?: boolean;
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
  /** V4-N qualité sémantique. */
  qualityStatus?: TaxKnowledgeQualityStatus;
  metadataHash?: string | null;
  /** Pack sémantique si enrichi (priorité). */
  semantic?: TaxDocumentSemanticKnowledge | null;
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
  /** V4-N — rôle d'année distinct (ne pas confondre millésimes). */
  yearRole?: FiscalYearRole | null;
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
  /** V4-N — explication sémantique structurée (Knowledge ≠ DocumentFacts). */
  taxExplanation?: TaxDocumentExplanation | null;
  /** V4-P — cases/rubriques détectées + explications. */
  detectedFields?: DetectedTaxField[];
  fieldExplanations?: TaxFieldExplanation[];
  fieldRegistryVersion?: string | null;
  /** Invariants knowledge. */
  invariants: {
    knowledgeAsDocumentFact: number;
    personalIdAsFormReference: number;
    mentionedAsIdentity: number;
    /** V4-N */
    documentFactsFromKnowledge?: number;
    inventedTaxObligations?: number;
    inventedTaxDates?: number;
    inventedTaxAmounts?: number;
    unsupportedKnowledgeClaims?: number;
    knowledgeWithoutProvenance?: number;
    /** V4-P */
    taxFieldKnowledgePromotedToFact?: number;
    unsupportedFieldValues?: number;
    emptyFieldConvertedToZero?: number;
    unverifiedFieldDefinitionPresentedAsVerified?: number;
    fieldFalsePositiveCritical?: number;
  };
}

/** V4-P — type de valeur attendue pour une case. */
export type TaxFieldValueType =
  | "amount"
  | "boolean"
  | "text"
  | "date"
  | "count"
  | "unknown";

/** Rôle déclarant générique — jamais une identité personnelle. */
export type TaxFieldDeclarantRole =
  | "declarant1"
  | "declarant2"
  | "dependent1"
  | "dependent2"
  | "household"
  | "unknown";

export type TaxFieldPresence =
  | "presentWithValue"
  | "presentEmpty"
  | "notDetected"
  | "valueUnknown"
  | "ambiguous";

export type TaxFieldCheckboxState =
  | "checked"
  | "unchecked"
  | "ambiguous"
  | "notDetected";

/**
 * Connaissance générale d’une case fiscale (registre).
 * Jamais une valeur utilisateur.
 */
export interface FrenchTaxFieldEntry {
  id: string;
  country: KnowledgeCountry;
  fieldCode: string;
  normalizedCode: string;
  documentRefs: string[];
  section: string;
  subsection?: string | null;
  label: string;
  explanation: string;
  plainLanguageWhat: string;
  declarantRole: TaxFieldDeclarantRole;
  valueType: TaxFieldValueType;
  applicableYears: number[];
  /** true si la définition est stable sur les années listées (vérifié). */
  yearStable?: boolean;
  aliases: string[];
  relatedFields: string[];
  officialSources: KnowledgeProvenance[];
  provenance: KnowledgeProvenance[];
  confidence: number;
  qualityStatus: TaxKnowledgeQualityStatus;
  lastVerifiedAt?: string | null;
}

export interface FrenchTaxFieldRegistry {
  version: string;
  country: KnowledgeCountry;
  generatedAt: string;
  sourceMode: "curated-official" | "discovery+curated";
  entries: FrenchTaxFieldEntry[];
}

/** Case détectée dans LE document utilisateur. */
export interface DetectedTaxField {
  fieldCode: string;
  normalizedCode: string;
  page: number | null;
  presence: TaxFieldPresence;
  checkboxState?: TaxFieldCheckboxState | null;
  /** Valeur documentaire uniquement — null si vide/ambiguous/absente. */
  detectedValue: string | null;
  detectedNumericValue?: number | null;
  candidateValues?: Array<{ value: string; confidence: number }>;
  confidence: number;
  evidence: EvidenceSpan[];
  registryId: string | null;
  documentRefHint: string | null;
  yearHint: number | null;
  reasons: string[];
}

/** Explication case = Knowledge + DocumentFacts séparés. */
export interface TaxFieldExplanation {
  fieldCode: string;
  label: string | null;
  section: string | null;
  whatIsIt: string | null;
  plainLanguageWhat: string | null;
  declarantRoleLabel: string | null;
  documentValue: string | null;
  presence: TaxFieldPresence;
  page: number | null;
  qualityStatus: TaxKnowledgeQualityStatus | null;
  provenance: KnowledgeProvenance[];
  confidence: number;
  warnings: string[];
  invariants: {
    taxFieldKnowledgePromotedToFact: number;
    unsupportedFieldValues: number;
    emptyFieldConvertedToZero: number;
    unverifiedFieldDefinitionPresentedAsVerified: number;
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
