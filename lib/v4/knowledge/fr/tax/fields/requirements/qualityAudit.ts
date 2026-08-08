/**
 * Audit qualité registre requirements — V4-Q.
 * npm run knowledge:tax:requirements:audit
 */

import type { FrenchTaxFieldRequirementsRegistry } from "../../../../../types/knowledge.js";

export interface TaxFieldRequirementsAuditReport {
  totalEntries: number;
  verified: number;
  partiallyVerified: number;
  needsReview: number;
  missingProvenance: string[];
  missingDocumentRef: string[];
  missingFieldCode: string[];
  emptyRequirements: string[];
  duplicateKeys: string[];
  unsupportedSupportingDocuments: string[];
  unsupportedConditions: string[];
  questionsWithoutRequirement: string[];
  yearCollisions: string[];
  invalidRelatedFields: string[];
  ok: boolean;
}

export function auditTaxFieldRequirementsRegistry(
  registry: FrenchTaxFieldRequirementsRegistry
): TaxFieldRequirementsAuditReport {
  const codes = new Set(registry.entries.map((e) => e.normalizedCode));
  const keyCount = new Map<string, number>();
  const missingProvenance: string[] = [];
  const missingDocumentRef: string[] = [];
  const missingFieldCode: string[] = [];
  const emptyRequirements: string[] = [];
  const unsupportedSupportingDocuments: string[] = [];
  const unsupportedConditions: string[] = [];
  const questionsWithoutRequirement: string[] = [];
  const yearCollisions: string[] = [];
  const invalidRelatedFields: string[] = [];

  let verified = 0;
  let partiallyVerified = 0;
  let needsReview = 0;

  for (const e of registry.entries) {
    const key = `${e.normalizedCode}|${[...e.documentRefs].sort().join(",")}|${e.applicableYears.join(",")}`;
    keyCount.set(key, (keyCount.get(key) || 0) + 1);

    if (e.qualityStatus === "verified") verified += 1;
    else if (e.qualityStatus === "partiallyVerified") partiallyVerified += 1;
    else needsReview += 1;

    if (!e.fieldCode?.trim()) missingFieldCode.push(e.id);
    if (!e.documentRef?.trim() || !e.documentRefs?.length) {
      missingDocumentRef.push(e.id);
    }
    if (!e.provenance?.length) missingProvenance.push(e.id);
    if (!e.informationRequirements?.length) emptyRequirements.push(e.id);

    const reqIds = new Set(e.informationRequirements.map((r) => r.id));
    for (const r of e.informationRequirements) {
      if (!r.provenance?.length) missingProvenance.push(`${e.id}:${r.id}`);
      if (!r.label?.trim() || !r.description?.trim()) {
        emptyRequirements.push(`${e.id}:${r.id}`);
      }
      if (r.questionTemplate && !reqIds.has(r.id)) {
        questionsWithoutRequirement.push(`${e.id}:${r.id}`);
      }
    }

    for (const s of e.possibleSupportingDocuments || []) {
      if (s.normative && !s.provenance?.length) {
        unsupportedSupportingDocuments.push(`${e.id}:${s.id}`);
      }
      if (!s.label?.trim()) {
        unsupportedSupportingDocuments.push(`${e.id}:${s.id}:empty`);
      }
    }

    for (const c of e.generalConditions || []) {
      if (!c.provenance?.length || !c.statement?.trim()) {
        unsupportedConditions.push(`${e.id}:${c.id}`);
      }
    }

    for (const rel of e.relatedFields || []) {
      // related may point to fields without requirements — only flag empty codes
      if (!rel?.trim()) invalidRelatedFields.push(`${e.id}->empty`);
    }

    // Collision année : même code + même documentRef + années qui se chevauchent avec entrée distincte
    for (const other of registry.entries) {
      if (other.id === e.id) continue;
      if (other.normalizedCode !== e.normalizedCode) continue;
      const sharedRef = e.documentRefs.some((r) => other.documentRefs.includes(r));
      if (!sharedRef) continue;
      const overlap = e.applicableYears.some((y) => other.applicableYears.includes(y));
      if (overlap) yearCollisions.push(`${e.id}|${other.id}`);
    }

    void codes;
  }

  const duplicateKeys = [...keyCount.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const uniqueYearCollisions = [...new Set(yearCollisions)].filter((pair) => {
    const [a, b] = pair.split("|");
    return a < b;
  });

  const ok =
    missingProvenance.length === 0 &&
    missingDocumentRef.length === 0 &&
    missingFieldCode.length === 0 &&
    emptyRequirements.length === 0 &&
    unsupportedSupportingDocuments.length === 0 &&
    unsupportedConditions.length === 0 &&
    questionsWithoutRequirement.length === 0 &&
    duplicateKeys.length === 0 &&
    uniqueYearCollisions.length === 0 &&
    verified >= 5;

  return {
    totalEntries: registry.entries.length,
    verified,
    partiallyVerified,
    needsReview,
    missingProvenance,
    missingDocumentRef,
    missingFieldCode,
    emptyRequirements,
    duplicateKeys,
    unsupportedSupportingDocuments,
    unsupportedConditions,
    questionsWithoutRequirement,
    yearCollisions: uniqueYearCollisions,
    invalidRelatedFields,
    ok
  };
}
