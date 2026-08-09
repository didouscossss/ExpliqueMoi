/**
 * Audit DocumentCase — npm run knowledge:tax:case:audit
 */

import type { DocumentCase } from "../../../../types/knowledge.js";

export interface DocumentCaseAuditReport {
  ok: boolean;
  documentsWithoutId: string[];
  factsWithoutDocumentId: string[];
  relationsWithoutEvidence: string[];
  matchesWithoutReason: string[];
  lostProvenance: string[];
  duplicateDoubleCount: string[];
  yearIncompatibleStrong: string[];
  roleIncompatibleStrong: string[];
  invalidRelations: string[];
  orphanFacts: string[];
  orphanRelations: string[];
  unsafeAggregation: string[];
  unsupportedCertainty: string[];
  invariantViolations: string[];
}

export function auditDocumentCase(docCase: DocumentCase): DocumentCaseAuditReport {
  const documentsWithoutId: string[] = [];
  const factsWithoutDocumentId: string[] = [];
  const relationsWithoutEvidence: string[] = [];
  const matchesWithoutReason: string[] = [];
  const lostProvenance: string[] = [];
  const duplicateDoubleCount: string[] = [];
  const yearIncompatibleStrong: string[] = [];
  const roleIncompatibleStrong: string[] = [];
  const invalidRelations: string[] = [];
  const orphanFacts: string[] = [];
  const orphanRelations: string[] = [];
  const unsafeAggregation: string[] = [];
  const unsupportedCertainty: string[] = [];
  const invariantViolations: string[] = [];

  const docIds = new Set(docCase.documents.map((d) => d.documentId));

  for (const d of docCase.documents) {
    if (!d.documentId) documentsWithoutId.push(d.fileName || "?");
  }

  for (const f of docCase.factIndex) {
    if (!f.sourceDocumentId) {
      factsWithoutDocumentId.push(f.factId);
      lostProvenance.push(f.factId);
    } else if (!docIds.has(f.sourceDocumentId)) {
      orphanFacts.push(f.factId);
    }
  }

  for (const r of docCase.relations) {
    if (!r.evidence?.length) relationsWithoutEvidence.push(r.relationId);
    if (!r.reason?.trim()) invalidRelations.push(`${r.relationId}:no_reason`);
    if (!docIds.has(r.fromDocumentId) || !docIds.has(r.toDocumentId)) {
      orphanRelations.push(r.relationId);
    }
    if (
      r.relationType.startsWith("possible") &&
      r.confidence >= 0.95 &&
      !/potentiel/i.test(r.reason)
    ) {
      unsupportedCertainty.push(r.relationId);
    }
  }

  for (const m of docCase.requirementMatches) {
    for (const link of m.evidenceLinks) {
      if (!link.matchReason?.trim()) {
        matchesWithoutReason.push(`${m.requirementId}:${link.factId}`);
      }
    }
    if (m.aggregatedValue != null) {
      unsafeAggregation.push(m.requirementId);
    }
    if (m.yearRelation === "yearMismatch" && m.verdict === "strong") {
      yearIncompatibleStrong.push(m.requirementId);
    }
    for (const sb of m.scoreBreakdowns) {
      if (
        sb.verdict === "strong" &&
        sb.breakdown.rejectReasons.some((x) => x.includes("roleMismatch"))
      ) {
        roleIncompatibleStrong.push(m.requirementId);
      }
    }
  }

  // Duplicate double-count
  const nonPrimary = docCase.documents.filter(
    (d) => d.duplicateStatus === "possibleDuplicate" && !d.isPrimaryCopy
  );
  for (const d of nonPrimary) {
    if (docCase.factIndex.some((f) => f.sourceDocumentId === d.documentId)) {
      duplicateDoubleCount.push(d.documentId);
    }
  }

  if (docCase.suggestedDeclaredAmount != null) {
    unsafeAggregation.push("suggestedDeclaredAmount");
  }

  for (const [k, v] of Object.entries(docCase.invariants)) {
    if (typeof v === "number" && v > 0) {
      // automaticUnsafeAggregation refusals counted as 0 in engine
      invariantViolations.push(`${k}=${v}`);
    }
  }

  const ok =
    documentsWithoutId.length === 0 &&
    factsWithoutDocumentId.length === 0 &&
    relationsWithoutEvidence.length === 0 &&
    matchesWithoutReason.length === 0 &&
    lostProvenance.length === 0 &&
    duplicateDoubleCount.length === 0 &&
    yearIncompatibleStrong.length === 0 &&
    roleIncompatibleStrong.length === 0 &&
    invalidRelations.length === 0 &&
    orphanFacts.length === 0 &&
    orphanRelations.length === 0 &&
    unsafeAggregation.length === 0 &&
    unsupportedCertainty.length === 0 &&
    invariantViolations.length === 0;

  return {
    ok,
    documentsWithoutId,
    factsWithoutDocumentId,
    relationsWithoutEvidence,
    matchesWithoutReason,
    lostProvenance,
    duplicateDoubleCount,
    yearIncompatibleStrong,
    roleIncompatibleStrong,
    invalidRelations,
    orphanFacts,
    orphanRelations,
    unsafeAggregation,
    unsupportedCertainty,
    invariantViolations
  };
}
