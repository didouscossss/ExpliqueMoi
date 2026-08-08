/**
 * V4-L / V4-M / V4-N — French Fiscal Knowledge
 * BUILD : sources officielles autorisées
 * RUNTIME : artefact local, 0 fetch / 0 LLM
 */

export type {
  KnowledgeCountry,
  FrenchTaxFamily,
  FiscalNumericKind,
  FiscalReferenceRole,
  KnowledgeRelationType,
  KnowledgeSourceType,
  KnowledgeProvenance,
  KnowledgeFact,
  DocumentFactRef,
  TaxDocumentRelation,
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry,
  DetectedFiscalReference,
  FiscalKnowledgeSignal,
  FiscalKnowledgeAnalysis,
  ExternalSourceRecord,
  TaxDocumentKind,
  TaxVariantKind,
  RegistryEntryStatus,
  RegistryLookupMatchKind,
  OfficialDocumentCandidate,
  MetadataQualityScore,
  TaxKnowledgeQualityStatus,
  FiscalYearRole,
  TaxKnowledgeSection,
  TaxCerfaInfo,
  TaxDocumentSemanticKnowledge,
  TaxDocumentExplanation,
  TaxFieldValueType,
  TaxFieldDeclarantRole,
  TaxFieldPresence,
  TaxFieldCheckboxState,
  FrenchTaxFieldEntry,
  FrenchTaxFieldRegistry,
  DetectedTaxField,
  TaxFieldExplanation
} from "../types/knowledge.js";

export { FISCAL_EXTERNAL_SOURCES } from "./sources/licenses.js";
export {
  FRENCH_TAX_REGISTRY_SEED,
  FRENCH_TAX_REGISTRY_VERSION,
  buildSeedRegistry
} from "./fr/tax/registry/seed.js";
export {
  buildRegistryFromSeed,
  loadFrenchTaxRegistry,
  resetFrenchTaxRegistryCacheForTests,
  lookupByReference,
  lookupById,
  lookupReferenceDetailed,
  knowledgeFactsForEntry,
  getFrenchTaxRegistryIndex,
  knownNormalizedReferences
} from "./fr/tax/registry/loadRegistry.js";
export {
  detectFiscalReferences,
  classifyNumericToken,
  selectPrimaryIdentity
} from "./fr/tax/detector/detectReferences.js";
export {
  buildFiscalKnowledgeSignals,
  suggestFamilyFromSignals
} from "./fr/tax/signals/buildSignals.js";
export { analyzeFiscalKnowledge } from "./fr/tax/analyzeFiscalKnowledge.js";
export { mergeFiscalKnowledgeIntoClassification } from "./fr/tax/applyKnowledge.js";
export {
  FREE_LOCAL_KNOWLEDGE_CONSUMER,
  type FreeLocalKnowledgeConsumer,
  type ProAiKnowledgeConsumer,
  type KnowledgeConsumer
} from "./consumers.js";
export {
  validateFrenchTaxRegistry,
  assertRegistryValid
} from "./fr/tax/registry/validateRegistry.js";
export { diffFrenchTaxRegistries } from "./fr/tax/registry/diffRegistry.js";
export {
  checkFiscalKnowledgeSafety,
  knowledgeFactIsNotDocumentFact,
  documentFactIsNotKnowledgeFact
} from "./fr/tax/safety.js";
export {
  normalizeTaxReference,
  ocrRepairTaxReference,
  referencesEquivalent
} from "./fr/tax/normalize/normalizeReference.js";
export { runDiscoveryPipeline } from "./fr/tax/discovery/pipeline.js";
export { lookupRegistry } from "./fr/tax/registry/lookup.js";
export { buildRegistryIndex } from "./fr/tax/registry/indexes.js";
export {
  PRIORITY_SEMANTIC_PACKS,
  PRIORITY_SEMANTIC_BY_REF,
  getPrioritySemantic
} from "./fr/tax/semantic/prioritySemantics.js";
export {
  enrichEntryWithSemantics,
  enrichRegistryWithSemantics
} from "./fr/tax/semantic/applySemantics.js";
export {
  deriveQualityStatus,
  applyQualityToEntry,
  hasVerifiedSemantic,
  isGenericPurpose,
  isGenericDescription
} from "./fr/tax/semantic/qualityStatus.js";
export {
  findByReference,
  findByCerfa,
  lookupTaxDocumentKnowledge,
  findRelatedDocuments
} from "./fr/tax/semantic/lookup.js";
export {
  explainTaxDocument,
  explainTaxDocumentType
} from "./fr/tax/semantic/explainTaxDocument.js";
export { auditTaxKnowledgeQuality } from "./fr/tax/semantic/qualityAudit.js";
export {
  FRENCH_TAX_FIELD_REGISTRY_VERSION,
  buildSeedFieldRegistry,
  loadFrenchTaxFieldRegistry,
  resetFrenchTaxFieldRegistryCacheForTests,
  lookupFieldByCode
} from "./fr/tax/fields/loadRegistry.js";
export {
  lookupTaxField,
  findRelatedTaxFields,
  knownTaxFieldCodes,
  type TaxFieldLookupQuery,
  type TaxFieldLookupResult
} from "./fr/tax/fields/lookup.js";
export { detectFrenchTaxFields } from "./fr/tax/fields/detectFields.js";
export {
  explainTaxField,
  explainDetectedTaxFields
} from "./fr/tax/fields/explainTaxField.js";
export { normalizeTaxFieldCode, looksLikeTaxFieldCode } from "./fr/tax/fields/normalizeFieldCode.js";
export {
  PRIORITY_TAX_FIELDS,
  getPriorityTaxField
} from "./fr/tax/fields/priorityFields.js";
export { auditTaxFieldRegistry } from "./fr/tax/fields/qualityAudit.js";
export {
  FRENCH_TAX_FIELD_REQUIREMENTS_VERSION,
  buildSeedRequirementsRegistry,
  loadFrenchTaxFieldRequirementsRegistry,
  resetFrenchTaxFieldRequirementsCacheForTests,
  lookupRequirementsByCode
} from "./fr/tax/fields/requirements/loadRegistry.js";
export {
  lookupTaxFieldRequirements,
  knownRequirementFieldCodes,
  type TaxFieldRequirementsLookupQuery,
  type TaxFieldRequirementsLookupResult
} from "./fr/tax/fields/requirements/lookup.js";
export {
  PRIORITY_TAX_FIELD_REQUIREMENTS,
  getPriorityTaxFieldRequirements
} from "./fr/tax/fields/requirements/priorityRequirements.js";
export { auditTaxFieldRequirementsRegistry } from "./fr/tax/fields/requirements/qualityAudit.js";
export {
  buildDocumentFactIndex,
  resetRequirementFactIdsForTests,
  type IndexedAnalyzedDocument
} from "./fr/tax/fields/requirements/documentFactIndex.js";
export {
  findCandidateFactsForRequirement,
  refuseUnsafeAggregation
} from "./fr/tax/fields/requirements/matchRequirements.js";
export {
  buildTaxFieldQuestions,
  selectPriorityQuestions,
  MAX_PRIORITY_QUESTIONS
} from "./fr/tax/fields/requirements/buildQuestions.js";
export {
  buildTaxFieldAssistance,
  buildTaxAssistanceContext,
  buildAssistanceForDetectedFields
} from "./fr/tax/fields/requirements/buildFieldAssistance.js";
export { checkTaxFieldAssistanceSafety } from "./fr/tax/fields/requirements/safety.js";
export {
  assistFieldWithLlm,
  explainRequirementsWithContext,
  decideFieldApplicability,
  narrateClarificationWithLlm
} from "./fr/tax/fields/requirements/premiumBoundary.js";
export {
  buildDocumentCase,
  addDocumentsToCase,
  removeDocumentFromCase,
  buildCaseTaxAssistanceContext,
  assertUploadOrderStable,
  type DocumentCaseInput,
  type BuildDocumentCaseOptions
} from "./fr/tax/case/buildDocumentCase.js";
export { auditDocumentCase } from "./fr/tax/case/audit.js";
export { checkDocumentCaseSafety } from "./fr/tax/case/safety.js";
export {
  findCandidateFactsForRequirementInCase,
  scoreFactForRequirement
} from "./fr/tax/case/matchScoring.js";
export { buildDocumentRelations } from "./fr/tax/case/relations.js";
export { detectFactConflicts } from "./fr/tax/case/conflicts.js";
export { assessDuplicates } from "./fr/tax/case/duplicates.js";
export {
  hashDocumentContent,
  buildCaseId,
  normalizeDocumentText
} from "./fr/tax/case/hash.js";
export {
  parseClarificationAnswer,
  selectNextClarificationQuestion,
  assertQuestionOrderStable,
  DEFAULT_MAX_ASKED,
  buildClarificationSession,
  markQuestionAsked,
  emptyClarificationInvariants,
  initClarificationState,
  applyClarificationAnswer,
  explainClarificationChanges,
  auditClarification,
  auditClarificationState,
  type ApplyClarificationResult,
  type ClarificationAuditReport
} from "./fr/tax/clarification/index.js";
export {
  evaluateCondition,
  resetApplicabilityEvidenceIdsForTests,
  evaluateTaxFieldApplicability,
  evaluateDocumentCaseApplicability,
  assertApplicabilityOrderStable,
  emptyApplicabilityInvariants,
  TAX_APPLICABILITY_RULES,
  getApplicabilityRulesForField,
  listApplicabilityRuleIds,
  explainTaxApplicability,
  applicabilityStatusLabel,
  buildClarificationCandidatesFromApplicability,
  mergeApplicabilityQuestionsIntoSession,
  buildApplicabilityEvidence,
  resetApplicabilityBuildIdsForTests,
  auditTaxApplicability,
  type ApplicabilityAuditReport
} from "./fr/tax/applicability/index.js";
export {
  TAX_FORMULAS,
  NON_MODELED_FORMULA_NOTES,
  getFormulasForField,
  listFormulaIds,
  evaluateTypedOperation,
  resolveFormulaInputs,
  detectImplicitAggregation,
  calculateDerivedValue,
  evaluateDocumentCaseCalculations,
  assertCalculationOrderStable,
  emptyCalculationInvariants,
  resetDerivedIdsForTests,
  explainTaxCalculation,
  auditTaxCalculation,
  type CalculationAuditReport
} from "./fr/tax/calculation/index.js";
