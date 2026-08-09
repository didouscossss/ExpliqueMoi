/**
 * Score de qualité des métadonnées (objectif, non marketing).
 */

import type {
  FrenchTaxDocumentEntry,
  MetadataQualityScore,
  TaxDocumentKind
} from "../../../../types/knowledge.js";

export function computeMetadataQuality(input: {
  hasOfficialReference: boolean;
  hasOfficialTitle: boolean;
  hasOfficialSource: boolean;
  hasAuthority: boolean;
  hasYearInformation: boolean;
  hasCerfa: boolean;
  hasRelations: boolean;
  documentKind: TaxDocumentKind;
}): MetadataQualityScore {
  // Cerfa applicable surtout aux formulaires (pas notices/avis)
  const cerfaApplicable =
    input.documentKind === "form" || input.documentKind === "certificate";

  let score = 0;
  if (input.hasOfficialReference) score += 0.25;
  if (input.hasOfficialTitle) score += 0.25;
  if (input.hasOfficialSource) score += 0.2;
  if (input.hasAuthority) score += 0.15;
  if (input.hasYearInformation) score += 0.05;
  if (input.hasRelations) score += 0.05;
  if (cerfaApplicable) {
    if (input.hasCerfa) score += 0.05;
  } else {
    // ne pas pénaliser l'absence de Cerfa
    score += 0.05;
  }

  return {
    score: Math.min(1, Number(score.toFixed(3))),
    hasOfficialReference: input.hasOfficialReference,
    hasOfficialTitle: input.hasOfficialTitle,
    hasOfficialSource: input.hasOfficialSource,
    hasAuthority: input.hasAuthority,
    hasYearInformation: input.hasYearInformation,
    hasCerfa: input.hasCerfa,
    hasRelations: input.hasRelations,
    cerfaApplicable
  };
}

export function qualityFromEntry(e: FrenchTaxDocumentEntry): MetadataQualityScore {
  return computeMetadataQuality({
    hasOfficialReference: e.referenceNumbers.length > 0 || Boolean(e.normalizedReference),
    hasOfficialTitle: Boolean(e.officialTitle && e.officialTitle.length > 3),
    hasOfficialSource: e.officialSources.length > 0,
    hasAuthority: Boolean(e.authority),
    hasYearInformation: (e.applicableYears || []).length > 0,
    hasCerfa: e.cerfaNumbers.length > 0,
    hasRelations: e.relatedDocuments.length > 0,
    documentKind: e.documentKind
  });
}
