/**
 * Mapper UserPresentation → modèle Preview (snake_case Gemini-compatible).
 * Ne crée AUCUN fait nouveau — sélection / ordre / format uniquement.
 * V4-O : attache fiscal_document (view model) sans contaminer Knowledge → DocumentFacts.
 */

import type { AnalyzeDocumentV4Result } from "../pipeline/analyzeDocumentV4.js";
import type { PresentationItem } from "../types/userPresentation.js";
import { formatDateFR, formatMoneyFR } from "../presentation/format.js";
import {
  buildFiscalDocumentViewModel,
  fiscalViewModelToPreviewJson,
  humanEvidenceSupport
} from "./fiscalViewModel.js";

export interface PreviewAnalysisMapped {
  engine: "v4";
  document_type: string;
  issuer: string;
  plain_summary: string;
  request: string;
  why_received: string;
  actions: Array<{ action: string; how: string }>;
  /** false = non-action explicite ; true = actions ; null = indéterminé. */
  action_required: boolean | null;
  dates: Array<{ date: string; label: string; meaning: string }>;
  enriched_dates: Array<{ date: string; label: string; meaning: string }>;
  amount: { value: string; meaning: string };
  urgency: { level: "none" | "soon" | "urgent" | "uncertain"; message: string };
  evidence: Array<{ page: string; quote: string; explanation: string }>;
  warnings: string[];
  confidence: number;
  reading_quality: "full" | "partial" | "failed";
  tables: unknown[];
  amounts_detail: Array<{ label: string; value: string; kind: string; page: string }>;
  /** V4-O — view model fiscal (null pour factures / non fiscal). */
  fiscal_document: Record<string, unknown> | null;
  /** Debug Preview — jamais inventé. */
  v4_debug: Record<string, unknown>;
  /** Invariants UI d’intégration. */
  v4_invariants: {
    unsupportedPresentationFacts: number;
    unsupportedExplanationFacts: number;
    inventedActions: number;
    inventedDeadlines: number;
    inventedAmounts: number;
    inventedReasons: number;
    uiInventedActions: number;
    uiInventedDeadlines: number;
    uiInventedAmounts: number;
    uiInventedReasons: number;
    knowledgePromotedToDocumentFact: number;
    uncertainRenderedAsCertain: number;
    technicalLabelsExposed: number;
    unsupportedUserActions: number;
    taxFieldKnowledgePromotedToFact: number;
    unsupportedFieldValues: number;
    emptyFieldConvertedToZero: number;
    unverifiedFieldDefinitionPresentedAsVerified: number;
    fieldFalsePositiveCritical: number;
    knowledgePromotedToUserFact: number;
    requirementPromotedToObligation: number;
    candidateFactPromotedToCertain: number;
    unsupportedEligibilityDecision: number;
    unsupportedTaxAmount: number;
    automaticUnsafeAggregation: number;
    missingPresentedAsUserDoesNotHave: number;
  };
}

function isAmbiguous(item: PresentationItem): boolean {
  return item.status === "ambiguous" || item.status === "contradictory";
}

function pickPrimaryAmount(items: PresentationItem[]): PresentationItem | null {
  if (!items.length) return null;
  const usable = items.filter((i) => !isAmbiguous(i) && i.value != null);
  if (!usable.length) return null;

  // Hiérarchie sémantique Presentation — jamais un HT / sous-composante en principal.
  const refund = usable.find(
    (i) =>
      i.sourceFacts?.includes("refundAmount") ||
      i.kind === "refundAmount" ||
      /^remboursement$/i.test(i.label || "")
  );
  if (refund) return refund;

  const due = usable.find(
    (i) =>
      i.sourceFacts?.includes("amountDue") ||
      i.sourceFacts?.includes("netToPay") ||
      /^montant dû$/i.test(i.label || "")
  );
  if (due) return due;

  const ttc = usable.find(
    (i) =>
      (i.sourceFacts?.includes("amountTTC") || /ttc/i.test(i.label || "")) &&
      !/total ht/i.test(i.label || "")
  );
  if (ttc) return ttc;

  const primaryTier = usable.find(
    (i) => i.tier === "primary" && !/total ht/i.test(i.label || "")
  );
  if (primaryTier) return primaryTier;

  // Ne jamais retomber sur amountHT comme montant principal Preview
  return (
    usable.find((i) => !/total ht|ht$/i.test(i.label || "")) || null
  );
}

function pickPrimaryDate(items: PresentationItem[]): PresentationItem | null {
  if (!items.length) return null;
  // Préférer remboursement / échéance supportés — pas une date secondaire.
  const preferred = items.find(
    (i) =>
      !isAmbiguous(i) &&
      i.value != null &&
      /refundDate|remboursement|dueDate|échéance|actionDeadline/i.test(
        `${i.kind} ${i.label} ${i.sourceFacts?.join(" ") || ""}`
      )
  );
  if (preferred) return preferred;
  const usable = items.find((i) => !isAmbiguous(i) && i.value != null);
  return usable || null;
}

/**
 * Convertit le résultat V4 en objet analysis attendu par normalizeAnalysis / Preview.
 */
export function mapV4ResultToPreviewAnalysis(
  result: AnalyzeDocumentV4Result,
  options: {
    extractionQuality?: "full" | "partial" | "empty";
    fallbackReason?: string | null;
  } = {}
): PreviewAnalysisMapped {
  const { presentation, diagnostics, explanation } = result;
  const identity = presentation.documentIdentity;

  const essentialText = presentation.essential
    .map((e) => e.text)
    .filter(Boolean)
    .join(" ");

  const plain_summary =
    essentialText ||
    identity.text ||
    (identity.documentType === "unknown"
      ? "Les éléments extraits ne permettent pas encore d’identifier clairement ce document."
      : identity.label);

  // Prélèvement / infos paiement ≠ actions utilisateur Preview
  const userActions = presentation.actions.filter(
    (a) =>
      a.kind === "userAction" &&
      a.text &&
      a.status !== "noExplicitActionDetected"
  );
  const actions = userActions.map((a) => ({
    action: a.text,
    how: a.label || ""
  }));

  const action_required = presentation.actionRequired;
  const request =
    actions[0]?.action ||
    (action_required === false
      ? "Aucune action requise."
      : "Aucune demande certaine.");

  // Nature du document ≠ raison de réception
  const why_received = presentation.reason?.text || "";

  const primaryDate = pickPrimaryDate(presentation.importantDates);
  const dates = primaryDate
    ? [
        {
          date:
            formatDateFR(primaryDate.value) ||
            String(primaryDate.value || primaryDate.text),
          label: primaryDate.label || "Date",
          meaning: primaryDate.text || primaryDate.label || ""
        }
      ]
    : [];

  // Si plusieurs dates importantes non ambiguës, les exposer ensuite (secondaires)
  for (const d of presentation.importantDates) {
    if (primaryDate && d === primaryDate) continue;
    if (isAmbiguous(d) || d.value == null) continue;
    dates.push({
      date: formatDateFR(d.value) || String(d.value),
      label: d.label || "Date",
      meaning: d.text || ""
    });
  }

  // Relevé : ne pas exposer la liste d’opérations comme « montant principal »
  const primaryAmount =
    diagnostics.primaryDocumentType === "bankStatement"
      ? null
      : pickPrimaryAmount(presentation.importantAmounts);
  let amount = primaryAmount
    ? {
        value:
          formatMoneyFR(primaryAmount.value) ||
          (Array.isArray(primaryAmount.value)
            ? "Non trouvé"
            : String(primaryAmount.value ?? "Non trouvé")),
        meaning: primaryAmount.label || primaryAmount.text || ""
      }
    : { value: "Non trouvé", meaning: "" };
  if (Array.isArray(primaryAmount?.value)) {
    amount = { value: "Non trouvé", meaning: "" };
  }

  const amounts_detail = presentation.importantAmounts
    .filter((a) => a.value != null && !isAmbiguous(a))
    .map((a) => ({
      label: a.label || a.kind,
      value:
        a.kind === "rate" || /taux/i.test(a.label || "")
          ? `${a.value} %`
          : formatMoneyFR(a.value) || String(a.value),
      kind: a.kind,
      page: String(a.evidence?.[0]?.page || "")
    }));

  // Warnings : uniquement ceux de UserPresentation (missing ≠ contradiction)
  const warnings = presentation.warnings
    .filter((w) => w.kind !== "missing" && w.status !== "missing")
    .map((w) => w.text)
    .filter(Boolean);

  const evidence = presentation.evidencePassages
    .filter((p) => p.excerpt && p.excerpt.trim().length >= 4)
    .filter(
      (p) =>
        !/r[eé]seaux?\s+sociaux|des questions sur|facebook|instagram|support\s+client/i.test(
          p.excerpt
        )
    )
    .slice(0, 8)
    .map((p) => ({
      page: p.page ? `Page ${p.page}` : "Document",
      quote: p.excerpt,
      explanation: p.supportedFacts?.length
        ? `Ce passage permet d’identifier ${humanEvidenceSupport(p.supportedFacts)}.`
        : ""
    }));

  // Urgence « bientôt » uniquement si action utilisateur réelle + deadline d'action
  // (paymentDate / prélèvement ≠ actionDeadline)
  let urgencyLevel: PreviewAnalysisMapped["urgency"]["level"] = "none";
  let urgencyMessage = "Aucune urgence particulière n’a été identifiée.";
  const actionDeadlineDate = presentation.importantDates.find(
    (d) =>
      !isAmbiguous(d) &&
      !/pr[eé]l[eè]vement|paymentDate|paiement/i.test(`${d.kind} ${d.label}`) &&
      /deadline|échéance|limite|actionDeadline|dueDate/i.test(
        `${d.kind} ${d.label} ${d.sourceFacts?.join(" ") || ""}`
      )
  );
  const hasCriticalWarning = presentation.warnings.some(
    (w) =>
      w.kind === "arithmeticInconsistency" ||
      (w.kind !== "missing" &&
        w.kind !== "ambiguousField" &&
        w.status !== "missing" &&
        w.status !== "ambiguous")
  );
  if (userActions.length && actionDeadlineDate) {
    urgencyLevel = "soon";
    urgencyMessage = actionDeadlineDate.text || "Une échéance est indiquée.";
  } else if (action_required === false && userActions.length === 0) {
    urgencyLevel = "none";
    urgencyMessage =
      "Aucune action à effectuer — information financière à noter.";
  } else if (userActions.length === 0 && !hasCriticalWarning) {
    urgencyLevel = "none";
    urgencyMessage = "Aucune urgence particulière n’a été identifiée.";
  } else if (presentation.warnings.some((w) => w.kind === "arithmeticInconsistency")) {
    urgencyLevel = "uncertain";
    urgencyMessage = "Certaines informations du document méritent une vérification.";
  } else if (identity.documentType === "unknown") {
    urgencyLevel = "uncertain";
    urgencyMessage = "Le document n’a pas pu être classé avec certitude.";
  }

  const inventedUi = {
    uiInventedActions: 0,
    uiInventedDeadlines: 0,
    uiInventedAmounts: 0,
    uiInventedReasons: 0
  };

  const confidence = Math.round(
    Math.max(0, Math.min(1, diagnostics.classificationConfidence || 0)) * 100
  );

  const reading_quality: PreviewAnalysisMapped["reading_quality"] =
    options.extractionQuality === "empty"
      ? "partial"
      : options.extractionQuality === "partial"
        ? "partial"
        : identity.documentType === "unknown"
          ? "partial"
          : "full";

  // V4-O — view model fiscal (null si non applicable / facture)
  const fiscalVm = buildFiscalDocumentViewModel(result);
  const fiscal_document = fiscalVm
    ? fiscalViewModelToPreviewJson(fiscalVm)
    : null;

  // Enrichir l’identité / résumé Preview pour docs fiscaux reconnus (sans inventer)
  let document_type = identity.text || identity.label || "Document";
  let summaryOut = plain_summary;
  let whyOut = why_received;
  let actionsOut = actions;
  let requestOut = request;
  let actionRequiredOut = action_required;

  if (fiscalVm) {
    document_type = fiscalVm.identity.publicTitle;
    if (fiscalVm.understanding.whatIsIt) {
      summaryOut = fiscalVm.understanding.whatIsIt;
      if (
        fiscalVm.understanding.purpose &&
        fiscalVm.understanding.purpose !== fiscalVm.understanding.whatIsIt
      ) {
        summaryOut = `${fiscalVm.understanding.whatIsIt} ${fiscalVm.understanding.purpose}`;
      }
    } else if (!fiscalVm.recognized) {
      summaryOut =
        "Ce document semble être fiscal ou administratif, mais je ne peux pas encore identifier précisément son type.";
    }
    if (fiscalVm.understanding.purpose) {
      whyOut = fiscalVm.understanding.purpose;
    }
    // Actions UI : uniquement celles supportées (pas les phrases knowledge générales)
    const supported = fiscalVm.possibleActions.filter((a) => a.certainty === "supported");
    if (supported.length) {
      actionsOut = supported.map((a) => ({ action: a.text, how: "Selon le document" }));
      actionRequiredOut = true;
      requestOut = supported[0]!.text;
    } else {
      actionsOut = [];
      actionRequiredOut = false;
      requestOut = "Aucune action certaine détectée.";
    }
  }

  return {
    engine: "v4",
    document_type,
    issuer: "",
    plain_summary: summaryOut,
    request: requestOut,
    why_received: whyOut,
    actions: actionsOut,
    action_required: actionRequiredOut,
    dates,
    enriched_dates: dates,
    amount,
    urgency: { level: urgencyLevel, message: urgencyMessage },
    evidence: fiscalVm?.evidence?.length
      ? fiscalVm.evidence.map((e) => ({
          page: e.page,
          quote: e.quote,
          explanation: e.supports
        }))
      : evidence,
    warnings,
    confidence,
    reading_quality,
    tables: [],
    amounts_detail,
    fiscal_document,
    v4_debug: {
      engine: "v4",
      primaryDocumentType: diagnostics.primaryDocumentType,
      classificationConfidence: diagnostics.classificationConfidence,
      classificationStatus: diagnostics.classificationStatus,
      secondarySections: diagnostics.secondarySections,
      resolvedFields: diagnostics.resolvedFields,
      ambiguousFields: diagnostics.ambiguousFields,
      warnings: diagnostics.contradictions,
      hasArithmeticInconsistency: diagnostics.hasArithmeticInconsistency,
      unsupportedExplanationFacts: diagnostics.unsupportedExplanationFacts,
      unsupportedPresentationFacts: diagnostics.unsupportedPresentationFacts,
      inventedFacts: {
        actions: diagnostics.inventedActions,
        deadlines: diagnostics.inventedDeadlines,
        amounts: diagnostics.inventedAmounts,
        reasons: diagnostics.inventedReasons
      },
      evidenceCoverage: diagnostics.evidenceCoverage,
      extractionQuality: options.extractionQuality || null,
      fallbackReason: options.fallbackReason || null,
      presentationActionsCount: diagnostics.presentationActionsCount,
      actionRequired: actionRequiredOut,
      explanationDocumentType: explanation.documentType?.primary || null,
      fiscalAttached: Boolean(fiscal_document),
      fiscalRecognition: fiscalVm?.recognitionLevel || null,
      fiscalReference: fiscalVm?.identity.reference || null
    },
    v4_invariants: {
      unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
      unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
      inventedActions: presentation.inventedActions,
      inventedDeadlines: presentation.inventedDeadlines,
      inventedAmounts: presentation.inventedAmounts,
      inventedReasons: presentation.inventedReasons,
      ...inventedUi,
      knowledgePromotedToDocumentFact:
        fiscalVm?.invariants.knowledgePromotedToDocumentFact ?? 0,
      uncertainRenderedAsCertain:
        fiscalVm?.invariants.uncertainRenderedAsCertain ?? 0,
      technicalLabelsExposed: fiscalVm?.invariants.technicalLabelsExposed ?? 0,
      unsupportedUserActions: fiscalVm?.invariants.unsupportedUserActions ?? 0,
      taxFieldKnowledgePromotedToFact:
        fiscalVm?.invariants.taxFieldKnowledgePromotedToFact ??
        result.fiscalKnowledge?.invariants.taxFieldKnowledgePromotedToFact ??
        0,
      unsupportedFieldValues:
        fiscalVm?.invariants.unsupportedFieldValues ??
        result.fiscalKnowledge?.invariants.unsupportedFieldValues ??
        0,
      emptyFieldConvertedToZero:
        fiscalVm?.invariants.emptyFieldConvertedToZero ??
        result.fiscalKnowledge?.invariants.emptyFieldConvertedToZero ??
        0,
      unverifiedFieldDefinitionPresentedAsVerified:
        fiscalVm?.invariants.unverifiedFieldDefinitionPresentedAsVerified ??
        result.fiscalKnowledge?.invariants
          .unverifiedFieldDefinitionPresentedAsVerified ??
        0,
      fieldFalsePositiveCritical:
        fiscalVm?.invariants.fieldFalsePositiveCritical ??
        result.fiscalKnowledge?.invariants.fieldFalsePositiveCritical ??
        0,
      knowledgePromotedToUserFact:
        fiscalVm?.invariants.knowledgePromotedToUserFact ??
        result.fiscalKnowledge?.invariants.knowledgePromotedToUserFact ??
        0,
      requirementPromotedToObligation:
        fiscalVm?.invariants.requirementPromotedToObligation ??
        result.fiscalKnowledge?.invariants.requirementPromotedToObligation ??
        0,
      candidateFactPromotedToCertain:
        fiscalVm?.invariants.candidateFactPromotedToCertain ??
        result.fiscalKnowledge?.invariants.candidateFactPromotedToCertain ??
        0,
      unsupportedEligibilityDecision:
        fiscalVm?.invariants.unsupportedEligibilityDecision ??
        result.fiscalKnowledge?.invariants.unsupportedEligibilityDecision ??
        0,
      unsupportedTaxAmount:
        fiscalVm?.invariants.unsupportedTaxAmount ??
        result.fiscalKnowledge?.invariants.unsupportedTaxAmount ??
        0,
      automaticUnsafeAggregation:
        fiscalVm?.invariants.automaticUnsafeAggregation ??
        result.fiscalKnowledge?.invariants.automaticUnsafeAggregation ??
        0,
      missingPresentedAsUserDoesNotHave:
        fiscalVm?.invariants.missingPresentedAsUserDoesNotHave ??
        result.fiscalKnowledge?.invariants.missingPresentedAsUserDoesNotHave ??
        0
    }
  };
}
