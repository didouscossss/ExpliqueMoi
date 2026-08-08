/**
 * Détermine qualityStatus V4-N sans tricher.
 * Une description issue d'un slug ≠ semanticExplanation vérifiée.
 */

import type {
  FrenchTaxDocumentEntry,
  TaxKnowledgeQualityStatus
} from "../../../../types/knowledge.js";

const GENERIC_PURPOSE =
  /Formalité\s*\/\s*déclaration fiscale \(voir notice officielle\)/i;
const GENERIC_DESC = /Formulaire fiscal officiel n°/i;

export function isGenericPurpose(purpose: string): boolean {
  return !purpose || GENERIC_PURPOSE.test(purpose);
}

export function isGenericDescription(description: string): boolean {
  return !description || GENERIC_DESC.test(description);
}

export function hasVerifiedSemantic(entry: FrenchTaxDocumentEntry): boolean {
  const s = entry.semantic;
  if (!s) return false;
  if (s.qualityStatus !== "verified" && s.qualityStatus !== "partiallyVerified") {
    return false;
  }
  // Exige plain language + purpose non générique
  if (!s.plainLanguageWhat || s.plainLanguageWhat.length < 20) return false;
  if (!s.purpose || isGenericPurpose(s.purpose)) return false;
  if (!s.officialSources?.length) return false;
  return s.qualityStatus === "verified";
}

export function deriveQualityStatus(
  entry: FrenchTaxDocumentEntry
): TaxKnowledgeQualityStatus {
  if (entry.status === "needsReview") return "needsReview";

  const hasTitle = Boolean(entry.officialTitle && entry.officialTitle.length > 3);
  const hasSource = (entry.officialSources || []).length > 0;
  const hasAuthority = Boolean(entry.authority);
  const semanticVerified = hasVerifiedSemantic(entry);
  const semanticPartial =
    Boolean(entry.semantic) &&
    entry.semantic!.qualityStatus === "partiallyVerified" &&
    Boolean(entry.semantic!.plainLanguageWhat);

  if (semanticVerified && hasTitle && hasSource && hasAuthority) {
    return "verified";
  }
  if (
    (semanticPartial || (!isGenericPurpose(entry.purpose) && hasSource)) &&
    hasTitle &&
    hasAuthority
  ) {
    return "partiallyVerified";
  }
  if (hasTitle && hasSource) return "discovered";
  return "needsReview";
}

export function applyQualityToEntry(
  entry: FrenchTaxDocumentEntry
): FrenchTaxDocumentEntry {
  const qualityStatus = deriveQualityStatus(entry);
  const quality = {
    ...(entry.quality || {
      score: 0,
      hasOfficialReference: entry.referenceNumbers.length > 0,
      hasOfficialTitle: Boolean(entry.officialTitle),
      hasOfficialSource: (entry.officialSources || []).length > 0,
      hasAuthority: Boolean(entry.authority),
      hasYearInformation: (entry.applicableYears || []).length > 0,
      hasCerfa: (entry.cerfaNumbers || []).length > 0,
      hasRelations: (entry.relatedDocuments || []).length > 0,
      cerfaApplicable: entry.documentKind === "form"
    }),
    hasVerifiedSemanticExplanation: hasVerifiedSemantic(entry)
  };
  return { ...entry, qualityStatus, quality };
}
