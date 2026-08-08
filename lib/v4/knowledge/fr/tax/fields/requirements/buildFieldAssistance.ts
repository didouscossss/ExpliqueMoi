/**
 * Construit l’aide à la compréhension d’une case — V4-Q.
 * Couches : Official Knowledge ≠ User Document Facts ≠ User Applicability.
 * Aucune décision d’éligibilité, aucun montant inventé, 0 LLM.
 */

import type {
  CandidateDocumentFact,
  DetectedTaxField,
  EvaluatedRequirement,
  FieldInformationStatus,
  RequirementStatus,
  TaxAssistanceContext,
  TaxFieldAssistance,
  TaxFieldExplanation
} from "../../../../../types/knowledge.js";
import { lookupTaxField } from "../lookup.js";
import {
  buildDocumentFactIndex,
  type IndexedAnalyzedDocument
} from "./documentFactIndex.js";
import {
  buildTaxFieldQuestions,
  selectPriorityQuestions
} from "./buildQuestions.js";
import { lookupTaxFieldRequirements } from "./lookup.js";
import {
  findCandidateFactsForRequirement,
  refuseUnsafeAggregation
} from "./matchRequirements.js";

const FORBIDDEN_MISSING_PHRASES =
  /vous n['’]avez pas|vous ne possédez pas|il vous manque obligatoirement/i;

const FORBIDDEN_OBLIGATION =
  /vous devez (mettre|indiquer|déclarer)|indiquez |déclarez |vous êtes éligible|vous avez droit|le montant correct/i;

export interface BuildTaxFieldAssistanceInput {
  fieldCode: string;
  documentRef?: string | null;
  year?: number | null;
  detected?: DetectedTaxField | null;
  explanation?: TaxFieldExplanation | null;
  /** Documents déjà analysés (courant + annexes). */
  documents?: readonly IndexedAnalyzedDocument[];
  /** Faits pré-indexés (tests / pipeline). */
  preindexedFacts?: readonly CandidateDocumentFact[];
  userAnswers?: Array<{ requirementId: string; answer: string }>;
}

function statusLabelFr(status: RequirementStatus): string {
  switch (status) {
    case "found":
      return "Information retrouvée dans les éléments analysés";
    case "missing":
      return "Information non retrouvée dans les éléments analysés";
    case "ambiguous":
      return "Information ambiguë — à vérifier";
    case "notChecked":
      return "Information non encore confrontée aux documents";
    case "notApplicableKnown":
      return "Information non applicable dans ce contexte (déterministe)";
    case "unknown":
      return "Statut inconnu";
    default:
      return "Statut inconnu";
  }
}

function computeInformationStatus(
  evaluated: readonly EvaluatedRequirement[]
): FieldInformationStatus {
  if (evaluated.some((e) => e.status === "ambiguous")) {
    return "ambiguousInformation";
  }
  const blockingMissing = evaluated.filter(
    (e) => e.priority === "blocking" && e.status === "missing"
  );
  if (blockingMissing.length) return "missingInformation";
  if (
    evaluated.some(
      (e) =>
        e.status === "missing" ||
        e.status === "notChecked" ||
        e.status === "unknown"
    )
  ) {
    return "requiresVerification";
  }
  return "sufficientForExplanation";
}

export function buildTaxFieldAssistance(
  input: BuildTaxFieldAssistanceInput
): TaxFieldAssistance {
  const code = input.fieldCode.toUpperCase().replace(/\s+/g, "");
  const fieldLookup = lookupTaxField({
    documentRef: input.documentRef,
    fieldCode: code,
    year: input.year
  });
  const reqLookup = lookupTaxFieldRequirements({
    documentRef: input.documentRef || fieldLookup.entry?.documentRefs?.[0],
    fieldCode: code,
    year: input.year
  });

  const entry = fieldLookup.entry;
  const requirements = reqLookup.entry;

  let knowledgePromotedToUserFact = 0;
  let requirementPromotedToObligation = 0;
  let candidateFactPromotedToCertain = 0;
  let unsupportedEligibilityDecision = 0;
  let unsupportedTaxAmount = 0;
  let automaticUnsafeAggregation = 0;
  let missingPresentedAsUserDoesNotHave = 0;

  const facts: CandidateDocumentFact[] = [
    ...(input.preindexedFacts || []),
    ...buildDocumentFactIndex(input.documents || [])
  ];

  // Inclure le champ détecté courant s’il n’est pas déjà dans documents
  if (input.detected && !(input.documents || []).length) {
    facts.push(
      ...buildDocumentFactIndex([
        {
          id: "current",
          label: "Document analysé",
          documentType: "incomeTaxReturn",
          year: input.year ?? input.detected.yearHint,
          detectedFields: [input.detected]
        }
      ])
    );
  }

  const evaluated: EvaluatedRequirement[] = [];
  if (requirements) {
    for (const req of requirements.informationRequirements) {
      const match = findCandidateFactsForRequirement(req, facts);
      // Compteur d’agrégations dangereuses effectuées (doit rester 0).
      const agg = refuseUnsafeAggregation(match.candidateFacts);
      if (agg.aggregatedValue != null) automaticUnsafeAggregation += 1;

      // Mauvais type explicite : valeur présente mais non amount
      let status = match.status;
      if (
        req.kind === "amount" &&
        input.detected?.presence === "presentWithValue" &&
        input.detected.checkboxState &&
        input.detected.detectedNumericValue == null &&
        req.expectedValueType === "amount"
      ) {
        // checkbox sur case amount — ambigu
        status = "ambiguous";
      }

      const label = statusLabelFr(status);
      if (FORBIDDEN_MISSING_PHRASES.test(label)) {
        missingPresentedAsUserDoesNotHave += 1;
      }
      if (FORBIDDEN_OBLIGATION.test(req.description)) {
        requirementPromotedToObligation += 1;
      }

      // Ne jamais présenter un match seulement « candidate » comme found/certain
      if (
        status === "found" &&
        match.evidenceLinks.length > 0 &&
        match.evidenceLinks.every((l) => l.status === "candidate")
      ) {
        status = "ambiguous";
      }

      evaluated.push({
        requirementId: req.id,
        label: req.label,
        description: req.description,
        kind: req.kind,
        priority: req.priority,
        status,
        statusLabel: statusLabelFr(status),
        candidateFacts: match.candidateFacts,
        evidenceLinks: match.evidenceLinks,
        aggregatedValue: null,
        provenance: req.provenance
      });
    }
  }

  const questions = requirements
    ? buildTaxFieldQuestions(requirements.informationRequirements, evaluated)
    : [];
  const priorityQuestions = selectPriorityQuestions(questions, 3);

  const documentFactsSummary: TaxFieldAssistance["documentFactsSummary"] = [];
  if (input.explanation?.documentValue) {
    documentFactsSummary.push({
      label: "Valeur détectée pour cette case",
      value: input.explanation.documentValue,
      status: "found"
    });
  } else if (input.detected?.presence === "presentEmpty") {
    documentFactsSummary.push({
      label: "Case dans le document",
      value: "présente sans valeur renseignée",
      status: "presentEmpty"
    });
  } else if (input.detected?.presence === "ambiguous") {
    documentFactsSummary.push({
      label: "Valeurs candidates",
      value: (input.detected.candidateValues || [])
        .map((c) => c.value)
        .join(" · "),
      status: "ambiguous"
    });
  } else if (!input.detected) {
    documentFactsSummary.push({
      label: "Dans vos documents",
      value: "aucune valeur certaine rattachée à cette case",
      status: "missing"
    });
  }

  // Knowledge ne doit pas devenir fait utilisateur
  if (
    entry?.plainLanguageWhat &&
    documentFactsSummary.some((d) =>
      d.value.includes(entry.plainLanguageWhat!.slice(0, 16))
    )
  ) {
    knowledgePromotedToUserFact += 1;
  }

  const informationStatus = requirements
    ? computeInformationStatus(evaluated)
    : ("requiresVerification" as FieldInformationStatus);

  // Guardrails finaux
  const suggestedDeclaredAmount = null;
  const eligibilityDecision = null;
  if (suggestedDeclaredAmount != null) unsupportedTaxAmount += 1;
  if (eligibilityDecision != null) unsupportedEligibilityDecision += 1;

  const yearMatch =
    reqLookup.matchKind === "exact"
      ? ("exact" as const)
      : reqLookup.matchKind === "stable"
        ? ("stable" as const)
        : reqLookup.matchKind === "partial"
          ? ("mismatch" as const)
          : ("unknown" as const);

  const allCandidates = [
    ...new Map(
      evaluated.flatMap((e) => e.candidateFacts).map((f) => [f.factId, f])
    ).values()
  ];

  return {
    fieldCode: code,
    documentRef:
      input.documentRef ||
      requirements?.documentRef ||
      entry?.documentRefs?.[0] ||
      null,
    year: input.year ?? input.detected?.yearHint ?? null,
    yearMatch,
    knowledge: {
      label: entry?.label || null,
      whatIsIt: entry?.explanation || null,
      plainLanguageWhat: entry?.plainLanguageWhat || null,
      expectedValueType:
        requirements?.expectedValueType || entry?.valueType || null,
      qualityStatus:
        requirements?.qualityStatus || entry?.qualityStatus || null
    },
    documentFactsSummary,
    evaluatedRequirements: evaluated,
    supportingDocuments: requirements?.possibleSupportingDocuments || [],
    generalConditions: requirements?.generalConditions || [],
    missingRequirements: evaluated.filter((e) => e.status === "missing"),
    ambiguousRequirements: evaluated.filter((e) => e.status === "ambiguous"),
    questions,
    priorityQuestions,
    informationStatus,
    candidateFacts: allCandidates,
    relatedFields: requirements?.relatedFields || entry?.relatedFields || [],
    provenance: [
      ...(requirements?.provenance || []),
      ...(entry?.provenance || [])
    ],
    suggestedDeclaredAmount,
    eligibilityDecision,
    invariants: {
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

export function buildTaxAssistanceContext(
  assistance: TaxFieldAssistance,
  userAnswers: Array<{ requirementId: string; answer: string }> = []
): TaxAssistanceContext {
  const fieldLookup = lookupTaxField({
    documentRef: assistance.documentRef,
    fieldCode: assistance.fieldCode,
    year: assistance.year
  });
  const reqLookup = lookupTaxFieldRequirements({
    documentRef: assistance.documentRef,
    fieldCode: assistance.fieldCode,
    year: assistance.year
  });
  return {
    fieldKnowledge: fieldLookup.entry,
    fieldRequirements: reqLookup.entry,
    relevantDocumentFacts: assistance.candidateFacts,
    missingRequirements: assistance.missingRequirements,
    ambiguities: assistance.ambiguousRequirements,
    userAnswers,
    provenance: assistance.provenance,
    informationStatus: assistance.informationStatus,
    questions: assistance.questions
  };
}

export function buildAssistanceForDetectedFields(
  detected: readonly DetectedTaxField[],
  explanations: readonly TaxFieldExplanation[],
  options?: {
    documentRef?: string | null;
    year?: number | null;
    documents?: readonly IndexedAnalyzedDocument[];
  }
): TaxFieldAssistance[] {
  const explByCode = new Map(explanations.map((e) => [e.fieldCode, e]));
  const out: TaxFieldAssistance[] = [];
  for (const d of detected) {
    // Seulement si requirements connus OU case registry connue
    const req = lookupTaxFieldRequirements({
      documentRef: options?.documentRef || d.documentRefHint,
      fieldCode: d.normalizedCode,
      year: options?.year ?? d.yearHint
    });
    if (!req.entry) continue;
    out.push(
      buildTaxFieldAssistance({
        fieldCode: d.normalizedCode,
        documentRef: options?.documentRef || d.documentRefHint,
        year: options?.year ?? d.yearHint,
        detected: d,
        explanation: explByCode.get(d.normalizedCode) || null,
        documents: options?.documents
      })
    );
  }
  return out;
}
