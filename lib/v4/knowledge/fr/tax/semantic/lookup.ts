/**
 * Lookup knowledge fiscale — déterministe, offline, 0 fetch / 0 LLM.
 */

import type {
  FrenchTaxDocumentEntry,
  TaxDocumentRelation,
  TaxDocumentSemanticKnowledge
} from "../../../../types/knowledge.js";
import {
  getFrenchTaxRegistryIndex,
  loadFrenchTaxRegistry,
  lookupById
} from "../registry/loadRegistry.js";
import { lookupRegistry } from "../registry/lookup.js";
import { getPrioritySemantic } from "./prioritySemantics.js";

export function findByReference(
  reference: string
): FrenchTaxDocumentEntry | null {
  const res = lookupRegistry(getFrenchTaxRegistryIndex(), reference);
  if (res.matchKind === "none" || res.matchKind === "possible") return null;
  return res.entry;
}

export function findByCerfa(cerfa: string): FrenchTaxDocumentEntry | null {
  const res = lookupRegistry(getFrenchTaxRegistryIndex(), cerfa);
  if (res.matchKind !== "cerfa") return null;
  return res.entry;
}

export function lookupTaxDocumentKnowledge(
  referenceOrId: string
): TaxDocumentSemanticKnowledge | null {
  const byRef = findByReference(referenceOrId);
  if (byRef?.semantic) return byRef.semantic;
  if (byRef) {
    return getPrioritySemantic(byRef.normalizedReference);
  }
  const reg = loadFrenchTaxRegistry();
  const byId = lookupById(reg, referenceOrId);
  if (byId?.semantic) return byId.semantic;
  if (byId) return getPrioritySemantic(byId.normalizedReference);
  return getPrioritySemantic(referenceOrId.toUpperCase());
}

export function findRelatedDocuments(
  reference: string
): Array<{ entry: FrenchTaxDocumentEntry; relation: TaxDocumentRelation }> {
  const entry = findByReference(reference);
  if (!entry) return [];
  const reg = loadFrenchTaxRegistry();
  const out: Array<{ entry: FrenchTaxDocumentEntry; relation: TaxDocumentRelation }> =
    [];
  for (const rel of entry.relatedDocuments || []) {
    const target = lookupById(reg, rel.targetId);
    if (target) out.push({ entry: target, relation: rel });
  }
  // Aussi via semantic relatedDocumentRefs
  if (entry.semantic?.relatedDocumentRefs?.length) {
    for (const ref of entry.semantic.relatedDocumentRefs) {
      if (out.some((o) => o.entry.normalizedReference === ref)) continue;
      const t = findByReference(ref);
      if (t) {
        out.push({
          entry: t,
          relation: {
            targetId: t.id,
            relationType: "relatedTo",
            source: entry.semantic.officialSources[0]?.url || "semantic",
            confidence: 0.7
          }
        });
      }
    }
  }
  return out;
}
