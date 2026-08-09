/**
 * Analyse de connaissance fiscale FR — offline, 0 fetch.
 */

import type { TextBlock } from "../../../types/textBlock.js";
import type { DocumentTypeId } from "../../../types/documentClassification.js";
import type {
  FiscalKnowledgeAnalysis,
  FrenchTaxFamily
} from "../../../types/knowledge.js";
import {
  detectFiscalReferences,
  selectPrimaryIdentity
} from "./detector/detectReferences.js";
import {
  buildFiscalKnowledgeSignals,
  suggestFamilyFromSignals
} from "./signals/buildSignals.js";
import {
  knowledgeFactsForEntry,
  loadFrenchTaxRegistry,
  lookupById
} from "./registry/loadRegistry.js";
import { detectFrenchTaxFields } from "./fields/detectFields.js";
import { explainDetectedTaxFields } from "./fields/explainTaxField.js";
import { loadFrenchTaxFieldRegistry } from "./fields/loadRegistry.js";
import { buildAssistanceForDetectedFields } from "./fields/requirements/buildFieldAssistance.js";
import { loadFrenchTaxFieldRequirementsRegistry } from "./fields/requirements/loadRegistry.js";

const FAMILY_TO_TYPE: Partial<Record<FrenchTaxFamily, DocumentTypeId>> = {
  incomeTaxReturn: "incomeTaxReturn",
  incomeTaxNotice: "incomeTaxNotice",
  propertyTax: "propertyTax",
  housingTax: "taxDocument",
  rentalIncomeDeclaration: "incomeTaxReturn",
  foreignIncomeDeclaration: "incomeTaxReturn",
  professionalIncomeDeclaration: "incomeTaxReturn",
  professionalBenefits: "taxForm",
  taxCreditReduction: "incomeTaxReturn",
  capitalGainsDeclaration: "incomeTaxReturn",
  wealthTax: "incomeTaxReturn",
  foreignAccountsDeclaration: "taxForm",
  inheritanceDonation: "taxForm",
  withholdingTax: "taxForm",
  corporateTax: "taxForm",
  vatDeclaration: "taxForm",
  businessTax: "taxForm",
  taxCertificate: "taxForm",
  taxInstruction: "taxForm",
  taxForm: "taxForm",
  taxNotice: "incomeTaxNotice",
  unknownTaxDocument: "unknownTaxDocument"
};

const FAMILY_TO_PROFILE: Partial<Record<FrenchTaxFamily, string>> = {
  incomeTaxReturn: "incomeTaxReturn",
  incomeTaxNotice: "incomeTaxNotice",
  propertyTax: "propertyTax",
  rentalIncomeDeclaration: "incomeTaxReturn",
  foreignIncomeDeclaration: "incomeTaxReturn",
  professionalIncomeDeclaration: "incomeTaxReturn",
  taxCreditReduction: "incomeTaxReturn",
  capitalGainsDeclaration: "incomeTaxReturn",
  wealthTax: "incomeTaxReturn",
  unknownTaxDocument: "unknownTaxDocument"
};

export function analyzeFiscalKnowledge(
  blocks: readonly TextBlock[]
): FiscalKnowledgeAnalysis {
  const registry = loadFrenchTaxRegistry();
  const detectedReferences = detectFiscalReferences(blocks, registry);
  const signals = buildFiscalKnowledgeSignals(
    blocks,
    detectedReferences,
    registry
  );
  const primaryIdentity = selectPrimaryIdentity(detectedReferences);
  const suggestedFamily = suggestFamilyFromSignals(signals, detectedReferences);

  // Document clairement fiscal mais sans famille nette
  const text = blocks.map((b) => b.text).join("\n").toLowerCase();
  const clearlyFiscal =
    /imp[oô]t|fiscal|dgfip|finances\s+publiques|num[eé]ro\s+fiscal|taxe\s+fonci/.test(
      text
    );
  // Ne pas forcer unknown si une famille lexicale/identité a déjà été suggérée
  const family =
    (primaryIdentity?.family as FrenchTaxFamily | null) ||
    suggestedFamily ||
    (clearlyFiscal ? ("unknownTaxDocument" as FrenchTaxFamily) : null);

  const suggestedDocumentType = family
    ? FAMILY_TO_TYPE[family] || "unknownTaxDocument"
    : null;
  const suggestedProfileId = family ? FAMILY_TO_PROFILE[family] || null : null;

  const knowledgeFacts = [];
  for (const ref of detectedReferences) {
    if (!ref.registryId) continue;
    if (ref.matchKind === "possible") continue;
    const entry = lookupById(registry, ref.registryId);
    if (entry) knowledgeFacts.push(...knowledgeFactsForEntry(entry));
  }

  // Invariants
  let personalIdAsFormReference = 0;
  let mentionedAsIdentity = 0;
  for (const ref of detectedReferences) {
    if (ref.kind === "taxpayerIdentifier" && ref.kind === ("formReference" as never)) {
      personalIdAsFormReference += 1;
    }
    if (ref.kind === "taxpayerIdentifier") {
      // déjà kind distinct — OK
    }
    if (
      ref.role === "mentionedDocument" &&
      suggestedFamily &&
      ref.family === suggestedFamily &&
      !detectedReferences.some(
        (r) => r.role === "documentIdentity" && r.family === suggestedFamily
      ) &&
      suggestedFamily !== "unknownTaxDocument"
    ) {
      // Si on a suggéré la famille UNIQUEMENT via mention — compteur
      const onlyMention =
        !signals.some(
          (s) =>
            s.family === suggestedFamily &&
            s.referenceRole === "documentIdentity"
        ) &&
        !signals.some(
          (s) =>
            s.signal.startsWith("knowledge:lexical:") &&
            s.family === suggestedFamily
        );
      if (onlyMention) mentionedAsIdentity += 1;
    }
  }

  // V4-P — détection cases (après identité pour contextualiser)
  const preliminary: FiscalKnowledgeAnalysis = {
    enabled: true,
    registryVersion: registry.version,
    detectedReferences,
    signals,
    suggestedFamily: family,
    suggestedDocumentType,
    suggestedProfileId,
    knowledgeFacts,
    primaryIdentity,
    invariants: {
      knowledgeAsDocumentFact: 0,
      personalIdAsFormReference,
      mentionedAsIdentity
    }
  };
  const detectedFields = detectFrenchTaxFields(blocks, preliminary);
  const fieldExplanations = explainDetectedTaxFields(detectedFields);
  const fieldRegistry = loadFrenchTaxFieldRegistry();
  const requirementsRegistry = loadFrenchTaxFieldRequirementsRegistry();

  const primaryRef =
    primaryIdentity?.normalized ||
    detectedFields.find((d) => d.documentRefHint)?.documentRefHint ||
    null;
  const yearHint =
    detectedFields.find((d) => d.yearHint)?.yearHint ||
    (() => {
      const m = text.match(/\b(202[4-6])\b/);
      return m ? Number(m[1]) : null;
    })();

  const fieldAssistance = buildAssistanceForDetectedFields(
    detectedFields,
    fieldExplanations,
    {
      documentRef: primaryRef,
      year: yearHint,
      documents: [
        {
          id: "primary",
          label: "Document analysé",
          documentType: suggestedDocumentType || "taxForm",
          year: yearHint,
          text: blocks.map((b) => b.text).join("\n"),
          detectedFields
        }
      ]
    }
  );

  let taxFieldKnowledgePromotedToFact = 0;
  let unsupportedFieldValues = 0;
  let emptyFieldConvertedToZero = 0;
  let unverifiedFieldDefinitionPresentedAsVerified = 0;
  let fieldFalsePositiveCritical = 0;
  let knowledgePromotedToUserFact = 0;
  let requirementPromotedToObligation = 0;
  let candidateFactPromotedToCertain = 0;
  let unsupportedEligibilityDecision = 0;
  let unsupportedTaxAmount = 0;
  let automaticUnsafeAggregation = 0;
  let missingPresentedAsUserDoesNotHave = 0;

  for (const fe of fieldExplanations) {
    taxFieldKnowledgePromotedToFact += fe.invariants.taxFieldKnowledgePromotedToFact;
    unsupportedFieldValues += fe.invariants.unsupportedFieldValues;
    emptyFieldConvertedToZero += fe.invariants.emptyFieldConvertedToZero;
    unverifiedFieldDefinitionPresentedAsVerified +=
      fe.invariants.unverifiedFieldDefinitionPresentedAsVerified;
  }
  // Faux positif critique : case « certaine » hors contexte fiscal
  for (const df of detectedFields) {
    if (df.confidence >= 0.75 && !df.registryId && !primaryIdentity) {
      fieldFalsePositiveCritical += 1;
    }
  }
  for (const fa of fieldAssistance) {
    knowledgePromotedToUserFact += fa.invariants.knowledgePromotedToUserFact;
    requirementPromotedToObligation +=
      fa.invariants.requirementPromotedToObligation;
    candidateFactPromotedToCertain +=
      fa.invariants.candidateFactPromotedToCertain;
    unsupportedEligibilityDecision +=
      fa.invariants.unsupportedEligibilityDecision;
    unsupportedTaxAmount += fa.invariants.unsupportedTaxAmount;
    automaticUnsafeAggregation += fa.invariants.automaticUnsafeAggregation;
    missingPresentedAsUserDoesNotHave +=
      fa.invariants.missingPresentedAsUserDoesNotHave;
  }

  return {
    ...preliminary,
    detectedFields,
    fieldExplanations,
    fieldRegistryVersion: fieldRegistry.version,
    fieldAssistance,
    requirementsRegistryVersion: requirementsRegistry.version,
    invariants: {
      ...preliminary.invariants,
      taxFieldKnowledgePromotedToFact,
      unsupportedFieldValues,
      emptyFieldConvertedToZero,
      unverifiedFieldDefinitionPresentedAsVerified,
      fieldFalsePositiveCritical,
      knowledgePromotedToUserFact,
      requirementPromotedToObligation,
      candidateFactPromotedToCertain,
      unsupportedEligibilityDecision,
      unsupportedTaxAmount,
      automaticUnsafeAggregation,
      missingPresentedAsUserDoesNotHave
    }
  };
}
