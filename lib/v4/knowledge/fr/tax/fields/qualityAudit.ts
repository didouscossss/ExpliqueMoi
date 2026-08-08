/**
 * Audit qualité registre des cases — V4-P.
 */

import type { FrenchTaxFieldRegistry } from "../../../../types/knowledge.js";
import { normalizeTaxFieldCode } from "./normalizeFieldCode.js";

export interface TaxFieldQualityReport {
  totalEntries: number;
  verified: number;
  partiallyVerified: number;
  needsReview: number;
  discovered: number;
  missingProvenance: string[];
  missingDocumentRef: string[];
  missingLabel: string[];
  emptyDefinition: string[];
  invalidCode: string[];
  duplicateKeys: string[];
  invalidRelatedFields: string[];
  verifiedWithoutProof: string[];
  genericSuspect: string[];
  ok: boolean;
}

export function auditTaxFieldRegistry(
  registry: FrenchTaxFieldRegistry
): TaxFieldQualityReport {
  const codes = new Set(registry.entries.map((e) => e.normalizedCode));
  const keyCount = new Map<string, number>();
  const missingProvenance: string[] = [];
  const missingDocumentRef: string[] = [];
  const missingLabel: string[] = [];
  const emptyDefinition: string[] = [];
  const invalidCode: string[] = [];
  const invalidRelatedFields: string[] = [];
  const verifiedWithoutProof: string[] = [];
  const genericSuspect: string[] = [];

  let verified = 0;
  let partiallyVerified = 0;
  let needsReview = 0;
  let discovered = 0;

  for (const e of registry.entries) {
    const key = `${e.normalizedCode}|${[...e.documentRefs].sort().join(",")}|${e.applicableYears.join(",")}`;
    keyCount.set(key, (keyCount.get(key) || 0) + 1);

    if (e.qualityStatus === "verified") verified += 1;
    else if (e.qualityStatus === "partiallyVerified") partiallyVerified += 1;
    else if (e.qualityStatus === "needsReview") needsReview += 1;
    else discovered += 1;

    if (!normalizeTaxFieldCode(e.fieldCode).valid) invalidCode.push(e.id);
    if (!e.documentRefs?.length) missingDocumentRef.push(e.id);
    if (!e.label?.trim()) missingLabel.push(e.id);
    if (!e.plainLanguageWhat || e.plainLanguageWhat.length < 20) emptyDefinition.push(e.id);
    if (!e.officialSources?.length || !e.provenance?.length) missingProvenance.push(e.id);
    if (e.qualityStatus === "verified" && !e.officialSources?.length) {
      verifiedWithoutProof.push(e.id);
    }
    if (/cette case sert à|informations diverses|à compléter/i.test(e.plainLanguageWhat) && e.plainLanguageWhat.length < 40) {
      genericSuspect.push(e.id);
    }
    for (const rel of e.relatedFields || []) {
      if (!codes.has(rel.toUpperCase())) invalidRelatedFields.push(`${e.id}->${rel}`);
    }
  }

  const duplicateKeys = [...keyCount.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const ok =
    missingProvenance.length === 0 &&
    missingDocumentRef.length === 0 &&
    missingLabel.length === 0 &&
    emptyDefinition.length === 0 &&
    invalidCode.length === 0 &&
    verifiedWithoutProof.length === 0 &&
    duplicateKeys.length === 0 &&
    verified >= 15;

  return {
    totalEntries: registry.entries.length,
    verified,
    partiallyVerified,
    needsReview,
    discovered,
    missingProvenance,
    missingDocumentRef,
    missingLabel,
    emptyDefinition,
    invalidCode,
    duplicateKeys,
    invalidRelatedFields,
    verifiedWithoutProof,
    genericSuspect,
    ok
  };
}
