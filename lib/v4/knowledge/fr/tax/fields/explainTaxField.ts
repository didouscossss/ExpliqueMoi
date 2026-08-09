/**
 * Explication d’une case = Knowledge + DocumentFacts séparés.
 */

import type {
  DetectedTaxField,
  TaxFieldExplanation
} from "../../../../types/knowledge.js";
import { lookupTaxField } from "./lookup.js";

const ROLE_LABELS: Record<string, string> = {
  declarant1: "Déclarant 1",
  declarant2: "Déclarant 2",
  dependent1: "1re personne à charge",
  dependent2: "2e personne à charge",
  household: "Foyer fiscal",
  unknown: "Rôle non précisé"
};

export function explainTaxField(
  detected: DetectedTaxField
): TaxFieldExplanation {
  const lookup = lookupTaxField({
    documentRef: detected.documentRefHint,
    fieldCode: detected.normalizedCode,
    year: detected.yearHint
  });
  const entry = lookup.entry;

  let taxFieldKnowledgePromotedToFact = 0;
  let unsupportedFieldValues = 0;
  let emptyFieldConvertedToZero = 0;
  let unverifiedFieldDefinitionPresentedAsVerified = 0;

  // Document value uniquement si presence + evidence
  let documentValue: string | null = null;
  if (
    detected.presence === "presentWithValue" &&
    detected.detectedValue &&
    detected.evidence?.length
  ) {
    documentValue =
      detected.detectedNumericValue != null &&
      entry?.valueType === "amount"
        ? `${detected.detectedValue}`
        : detected.detectedValue;
  } else if (detected.presence === "presentEmpty") {
    documentValue = null;
    if (detected.detectedValue === "0" || detected.detectedNumericValue === 0) {
      emptyFieldConvertedToZero = 1;
      documentValue = null;
    }
  } else if (detected.presence === "ambiguous") {
    documentValue = null;
    unsupportedFieldValues = 1;
  }

  // Knowledge ne doit jamais devenir documentValue
  if (
    documentValue &&
    entry?.plainLanguageWhat &&
    documentValue.includes(entry.plainLanguageWhat.slice(0, 12))
  ) {
    taxFieldKnowledgePromotedToFact = 1;
    documentValue = null;
  }

  if (
    entry?.qualityStatus !== "verified" &&
    entry?.qualityStatus !== "partiallyVerified" &&
    entry
  ) {
    // si on présentait comme verified — compteur
  }
  if (
    !entry?.officialSources?.length &&
    entry?.qualityStatus === "verified"
  ) {
    unverifiedFieldDefinitionPresentedAsVerified = 1;
  }

  const warnings: string[] = [];
  if (!entry) {
    warnings.push(
      "Case détectée mais non présente dans le registre officiel local — aucune définition n’est affirmée."
    );
  } else if (entry.qualityStatus === "partiallyVerified") {
    warnings.push("La définition de cette case n’est que partiellement vérifiée.");
  } else if (entry.qualityStatus === "needsReview") {
    warnings.push("La définition de cette case nécessite une revue.");
  }
  if (detected.presence === "ambiguous") {
    warnings.push(
      "Plusieurs valeurs sont proches de cette case : aucune n’est rattachée avec certitude."
    );
  }
  if (detected.presence === "presentEmpty") {
    warnings.push("La case est présente mais aucune valeur n’y est renseignée.");
  }
  if (lookup.matchKind === "partial") {
    warnings.push(
      "L’année fiscale du document n’est pas clairement alignée avec la définition utilisée."
    );
  }
  warnings.push(
    "Cette explication décrit le rôle général de la case ; elle ne constitue pas un conseil fiscal personnalisé."
  );

  // Ne jamais présenter needsReview comme verified
  const presentedStatus =
    entry?.qualityStatus === "verified" && !entry.officialSources?.length
      ? "needsReview"
      : entry?.qualityStatus || null;

  return {
    fieldCode: detected.normalizedCode,
    label: entry?.label || null,
    section: entry?.section || null,
    whatIsIt: entry?.explanation || null,
    plainLanguageWhat: entry?.plainLanguageWhat || null,
    declarantRoleLabel: entry ? ROLE_LABELS[entry.declarantRole] || null : null,
    documentValue,
    presence: detected.presence,
    page: detected.page,
    qualityStatus: presentedStatus,
    provenance: entry?.provenance || [],
    confidence: Math.min(detected.confidence, entry?.confidence ?? detected.confidence),
    warnings,
    invariants: {
      taxFieldKnowledgePromotedToFact,
      unsupportedFieldValues,
      emptyFieldConvertedToZero,
      unverifiedFieldDefinitionPresentedAsVerified
    }
  };
}

export function explainDetectedTaxFields(
  detected: DetectedTaxField[]
): TaxFieldExplanation[] {
  return detected.map(explainTaxField);
}
