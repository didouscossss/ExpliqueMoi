/**
 * Applique les packs sémantiques prioritaires sur le registry (build / load).
 */

import type {
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry
} from "../../../../types/knowledge.js";
import { PRIORITY_SEMANTIC_BY_REF } from "./prioritySemantics.js";
import { applyQualityToEntry } from "./qualityStatus.js";

export function enrichEntryWithSemantics(
  entry: FrenchTaxDocumentEntry
): FrenchTaxDocumentEntry {
  const pack = PRIORITY_SEMANTIC_BY_REF.get(entry.normalizedReference);
  if (!pack) {
    return applyQualityToEntry(entry);
  }

  const merged: FrenchTaxDocumentEntry = {
    ...entry,
    officialTitle: pack.officialTitle || entry.officialTitle,
    description: pack.description,
    purpose: pack.purpose,
    applicableYears:
      pack.applicableYears.length > 0 ? pack.applicableYears : entry.applicableYears,
    cerfaNumbers:
      pack.cerfa?.number && !entry.cerfaNumbers.includes(pack.cerfa.number)
        ? [...entry.cerfaNumbers, pack.cerfa.number]
        : entry.cerfaNumbers.length
          ? entry.cerfaNumbers
          : pack.cerfa?.number
            ? [pack.cerfa.number]
            : [],
    cerfaVerified: Boolean(pack.cerfa?.verified),
    semantic: pack,
    // Prefer pack provenance for semantic fields
    officialSources:
      pack.officialSources.length > 0 ? pack.officialSources : entry.officialSources,
    confidence: Math.max(entry.confidence, pack.confidence)
  };
  return applyQualityToEntry(merged);
}

export function enrichRegistryWithSemantics(
  registry: FrenchTaxDocumentRegistry
): FrenchTaxDocumentRegistry {
  return {
    ...registry,
    version: registry.version.includes("v4n")
      ? registry.version
      : `${registry.version}+v4n`,
    entries: registry.entries.map(enrichEntryWithSemantics)
  };
}
