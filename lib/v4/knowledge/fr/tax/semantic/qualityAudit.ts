/**
 * Audit qualité sémantique V4-N — métriques honnêtes, offline.
 */

import type { FrenchTaxDocumentRegistry } from "../../../../types/knowledge.js";
import { buildRegistryIndex } from "../registry/indexes.js";
import { PRIORITY_SEMANTIC_BY_REF } from "./prioritySemantics.js";
import {
  hasVerifiedSemantic,
  isGenericDescription,
  isGenericPurpose
} from "./qualityStatus.js";

export interface TaxKnowledgeQualityReport {
  totalEntries: number;
  verifiedEntries: number;
  partiallyVerified: number;
  discovered: number;
  needsReview: number;
  withOfficialTitle: number;
  withVerifiedCerfa: number;
  withPurpose: number;
  withDescription: number;
  withApplicableYears: number;
  withRelations: number;
  withSemanticExplanation: number;
  priorityDocumentsCoverage: {
    totalPriority: number;
    presentInRegistry: number;
    enriched: number;
    missingFromRegistry: string[];
    notEnriched: string[];
  };
  missingProvenance: string[];
  invalidRelations: string[];
  duplicateReferences: string[];
  conflictingCerfa: string[];
  knowledgeWithoutProvenanceVerified: string[];
  slugOnlyDescriptions: number;
  ok: boolean;
}

export function auditTaxKnowledgeQuality(
  registry: FrenchTaxDocumentRegistry
): TaxKnowledgeQualityReport {
  const entries = registry.entries;
  let verifiedEntries = 0;
  let partiallyVerified = 0;
  let discovered = 0;
  let needsReview = 0;
  let withOfficialTitle = 0;
  let withVerifiedCerfa = 0;
  let withPurpose = 0;
  let withDescription = 0;
  let withApplicableYears = 0;
  let withRelations = 0;
  let withSemanticExplanation = 0;
  let slugOnlyDescriptions = 0;

  const missingProvenance: string[] = [];
  const knowledgeWithoutProvenanceVerified: string[] = [];
  const byNorm = new Map<string, string[]>();
  const cerfaToRefs = new Map<string, string[]>();

  for (const e of entries) {
    const qs = e.qualityStatus || "discovered";
    if (qs === "verified") verifiedEntries += 1;
    else if (qs === "partiallyVerified") partiallyVerified += 1;
    else if (qs === "needsReview") needsReview += 1;
    else discovered += 1;

    if (e.officialTitle && e.officialTitle.length > 3) withOfficialTitle += 1;
    if (e.cerfaVerified && e.cerfaNumbers.length > 0) withVerifiedCerfa += 1;
    if (e.purpose && !isGenericPurpose(e.purpose)) withPurpose += 1;
    if (e.description && !isGenericDescription(e.description)) withDescription += 1;
    else if (isGenericDescription(e.description)) slugOnlyDescriptions += 1;
    if ((e.applicableYears || []).length > 0) withApplicableYears += 1;
    if ((e.relatedDocuments || []).length > 0) withRelations += 1;

    // Semantic réelle = plain language + purpose non générique + sources (pas slug)
    if (
      e.semantic &&
      (e.semantic.qualityStatus === "verified" ||
        e.semantic.qualityStatus === "partiallyVerified") &&
      e.semantic.plainLanguageWhat &&
      e.semantic.plainLanguageWhat.length >= 20 &&
      !isGenericPurpose(e.semantic.purpose) &&
      (e.semantic.officialSources?.length || e.semantic.provenance?.length)
    ) {
      withSemanticExplanation += 1;
    } else if (hasVerifiedSemantic(e)) {
      withSemanticExplanation += 1;
    }

    if (!e.officialSources?.length || !e.authority) {
      missingProvenance.push(e.id);
    }
    if (
      e.qualityStatus === "verified" &&
      e.semantic &&
      !e.semantic.provenance?.length &&
      !e.semantic.officialSources?.length
    ) {
      knowledgeWithoutProvenanceVerified.push(e.id);
    }

    const list = byNorm.get(e.normalizedReference) || [];
    list.push(e.id);
    byNorm.set(e.normalizedReference, list);

    for (const c of e.cerfaNumbers || []) {
      const arr = cerfaToRefs.get(c) || [];
      arr.push(e.normalizedReference);
      cerfaToRefs.set(c, arr);
    }
  }

  const index = buildRegistryIndex(registry);
  const invalidRelations: string[] = [];
  for (const e of entries) {
    for (const rel of e.relatedDocuments || []) {
      if (!index.byId.has(rel.targetId) && !entries.some((x) => x.id === rel.targetId)) {
        invalidRelations.push(`${e.id}->${rel.targetId}`);
      }
    }
  }

  const duplicateReferences = [...byNorm.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([ref, ids]) => `${ref}:${ids.join(",")}`);

  const conflictingCerfa = [...cerfaToRefs.entries()]
    .filter(([, refs]) => new Set(refs).size > 1)
    .map(([cerfa, refs]) => `${cerfa}:${[...new Set(refs)].join(",")}`);

  const priorityRefs = [...PRIORITY_SEMANTIC_BY_REF.keys()];
  const missingFromRegistry: string[] = [];
  const notEnriched: string[] = [];
  let presentInRegistry = 0;
  let enriched = 0;
  for (const ref of priorityRefs) {
    const e = entries.find((x) => x.normalizedReference === ref);
    if (!e) {
      missingFromRegistry.push(ref);
      continue;
    }
    presentInRegistry += 1;
    if (e.semantic && e.semantic.plainLanguageWhat) {
      enriched += 1;
    } else {
      notEnriched.push(ref);
    }
  }

  const ok =
    knowledgeWithoutProvenanceVerified.length === 0 &&
    invalidRelations.length === 0 &&
    duplicateReferences.length === 0 &&
    presentInRegistry === priorityRefs.length &&
    enriched >= Math.min(15, priorityRefs.length);

  return {
    totalEntries: entries.length,
    verifiedEntries,
    partiallyVerified,
    discovered,
    needsReview,
    withOfficialTitle,
    withVerifiedCerfa,
    withPurpose,
    withDescription,
    withApplicableYears,
    withRelations,
    withSemanticExplanation,
    priorityDocumentsCoverage: {
      totalPriority: priorityRefs.length,
      presentInRegistry,
      enriched,
      missingFromRegistry,
      notEnriched
    },
    missingProvenance,
    invalidRelations,
    duplicateReferences,
    conflictingCerfa,
    knowledgeWithoutProvenanceVerified,
    slugOnlyDescriptions,
    ok
  };
}
