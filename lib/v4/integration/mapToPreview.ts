/**
 * Mapper UserPresentation → modèle Preview (snake_case Gemini-compatible).
 * Ne crée AUCUN fait nouveau — sélection / ordre / format uniquement.
 */

import type { AnalyzeDocumentV4Result } from "../pipeline/analyzeDocumentV4.js";
import type { PresentationItem } from "../types/userPresentation.js";
import { formatDateFR, formatMoneyFR } from "../presentation/format.js";

export interface PreviewAnalysisMapped {
  engine: "v4";
  document_type: string;
  issuer: string;
  plain_summary: string;
  request: string;
  why_received: string;
  actions: Array<{ action: string; how: string }>;
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
  };
}

function isAmbiguous(item: PresentationItem): boolean {
  return item.status === "ambiguous" || item.status === "contradictory";
}

function pickPrimaryAmount(items: PresentationItem[]): PresentationItem | null {
  if (!items.length) return null;
  const usable = items.filter((i) => !isAmbiguous(i) && i.value != null);
  if (!usable.length) return null;

  // Suivre les faits Presentation (sourceFacts) — pas de recalcul métier.
  // amountDue prioritaire lorsqu’il est réellement exposé par UserPresentation.
  const due = usable.find(
    (i) =>
      i.sourceFacts?.includes("amountDue") ||
      i.sourceFacts?.includes("netToPay") ||
      /^montant dû$/i.test(i.label || "")
  );
  if (due) return due;

  const ttc = usable.find(
    (i) => i.sourceFacts?.includes("amountTTC") || /ttc/i.test(i.label || "")
  );
  if (ttc) return ttc;

  const primaryTier = usable.find((i) => i.tier === "primary");
  return primaryTier || usable[0];
}

function pickPrimaryDate(items: PresentationItem[]): PresentationItem | null {
  if (!items.length) return null;
  // Ne pas prendre première/dernière date du document brut —
  // uniquement les dates déjà sélectionnées par UserPresentation.
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

  const actions = presentation.actions
    .filter((a) => a.text && a.status !== "noExplicitActionDetected")
    .map((a) => ({
      action: a.text,
      how: a.label || ""
    }));

  const request = actions[0]?.action || "Aucune demande certaine.";

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
      value: formatMoneyFR(a.value) || String(a.value),
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
    .map((p) => ({
      page: p.page ? `Page ${p.page}` : "Document",
      quote: p.excerpt,
      explanation: p.supportedFacts?.length
        ? `Éléments liés : ${p.supportedFacts.join(", ")}`
        : ""
    }));

  // Urgence : seulement si warning/action deadline réellement supportés
  let urgencyLevel: PreviewAnalysisMapped["urgency"]["level"] = "none";
  let urgencyMessage = "Aucune urgence particulière n’a été identifiée.";
  const deadlineDate = presentation.importantDates.find(
    (d) =>
      !isAmbiguous(d) &&
      /deadline|échéance|limite/i.test(`${d.kind} ${d.label}`)
  );
  if (presentation.actions.length && deadlineDate) {
    urgencyLevel = "soon";
    urgencyMessage = deadlineDate.text || "Une échéance est indiquée.";
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

  return {
    engine: "v4",
    document_type: identity.text || identity.label || "Document",
    issuer: "",
    plain_summary,
    request,
    why_received,
    actions,
    dates,
    enriched_dates: dates,
    amount,
    urgency: { level: urgencyLevel, message: urgencyMessage },
    evidence,
    warnings,
    confidence,
    reading_quality,
    tables: [],
    amounts_detail,
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
      explanationDocumentType: explanation.documentType?.primary || null
    },
    v4_invariants: {
      unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
      unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
      inventedActions: presentation.inventedActions,
      inventedDeadlines: presentation.inventedDeadlines,
      inventedAmounts: presentation.inventedAmounts,
      inventedReasons: presentation.inventedReasons,
      ...inventedUi
    }
  };
}
