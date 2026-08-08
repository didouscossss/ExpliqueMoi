/**
 * Diff de registres — pas de remplacement silencieux.
 */

import type { FrenchTaxDocumentEntry, FrenchTaxDocumentRegistry } from "../../../../types/knowledge.js";

export interface RegistryDiff {
  added: string[];
  removed: string[];
  changed: Array<{ id: string; fields: string[] }>;
  newVersion: string | null;
  sourceChanged: string[];
}

function entryFingerprint(e: FrenchTaxDocumentEntry): string {
  return JSON.stringify({
    family: e.family,
    documentType: e.documentType,
    referenceNumbers: e.referenceNumbers,
    cerfaNumbers: e.cerfaNumbers,
    officialTitle: e.officialTitle,
    purpose: e.purpose,
    applicableYears: e.applicableYears,
    documentVersion: e.documentVersion ?? null,
    validFrom: e.validFrom ?? null,
    validTo: e.validTo ?? null,
    relatedDocuments: e.relatedDocuments,
    expectedFields: e.expectedFields,
    officialSources: e.officialSources.map((s) => s.url),
    confidence: e.confidence
  });
}

function changedFields(
  a: FrenchTaxDocumentEntry,
  b: FrenchTaxDocumentEntry
): string[] {
  const fields: Array<keyof FrenchTaxDocumentEntry> = [
    "family",
    "documentType",
    "referenceNumbers",
    "cerfaNumbers",
    "officialTitle",
    "description",
    "purpose",
    "applicableYears",
    "documentVersion",
    "validFrom",
    "validTo",
    "expectedSignals",
    "negativeSignals",
    "relatedDocuments",
    "profileId",
    "expectedFields",
    "confidence"
  ];
  const out: string[] = [];
  for (const f of fields) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) out.push(String(f));
  }
  if (
    JSON.stringify(a.officialSources.map((s) => s.url)) !==
    JSON.stringify(b.officialSources.map((s) => s.url))
  ) {
    out.push("officialSources");
  }
  return out;
}

export function diffFrenchTaxRegistries(
  previous: FrenchTaxDocumentRegistry | null,
  next: FrenchTaxDocumentRegistry
): RegistryDiff {
  if (!previous) {
    return {
      added: next.entries.map((e) => e.id),
      removed: [],
      changed: [],
      newVersion: next.version,
      sourceChanged: next.entries.map((e) => e.id)
    };
  }

  const prevMap = new Map(previous.entries.map((e) => [e.id, e]));
  const nextMap = new Map(next.entries.map((e) => [e.id, e]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ id: string; fields: string[] }> = [];
  const sourceChanged: string[] = [];

  for (const id of nextMap.keys()) {
    if (!prevMap.has(id)) added.push(id);
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removed.push(id);
  }
  for (const [id, nextE] of nextMap) {
    const prevE = prevMap.get(id);
    if (!prevE) continue;
    if (entryFingerprint(prevE) !== entryFingerprint(nextE)) {
      const fields = changedFields(prevE, nextE);
      changed.push({ id, fields });
      if (fields.includes("officialSources")) sourceChanged.push(id);
    }
  }

  return {
    added,
    removed,
    changed,
    newVersion: previous.version !== next.version ? next.version : null,
    sourceChanged
  };
}
