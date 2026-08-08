/**
 * V4-L / V4-M — French Fiscal Knowledge
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
  MetadataQualityScore
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
