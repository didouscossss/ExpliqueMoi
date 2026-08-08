/**
 * Fusion knowledge → classification (opt-in).
 * Une référence reconnue = signal fort, jamais décision absolue seule.
 */

import { toConfidence } from "../../../types/confidence.js";
import type { DocumentClassification } from "../../../types/documentClassification.js";
import type { FiscalKnowledgeAnalysis } from "../../../types/knowledge.js";

/**
 * Enrichit une classification existante avec les KnowledgeSignals.
 * Ne remplace pas le routeur — ajuste scores / primary si preuves suffisantes.
 */
export function mergeFiscalKnowledgeIntoClassification(
  classification: DocumentClassification,
  knowledge: FiscalKnowledgeAnalysis
): DocumentClassification {
  const scores = { ...classification.scores };
  const evidence = [...classification.evidence];

  for (const s of knowledge.signals) {
    const type =
      s.family === "incomeTaxReturn"
        ? "incomeTaxReturn"
        : s.family === "incomeTaxNotice"
          ? "incomeTaxNotice"
          : s.family === "propertyTax"
            ? "propertyTax"
            : s.family === "unknownTaxDocument"
              ? "unknownTaxDocument"
              : s.family === "tax" || s.family === "negative"
                ? null
                : "taxDocument";

    if (type && s.weight > 0) {
      scores[type] = Math.min(1, (scores[type] || 0) + s.weight * 0.5);
      evidence.push({
        signal: s.signal,
        family: "lexical",
        delta: s.weight * 0.5,
        type,
        evidence: s.evidence
      });
    } else if (s.weight < 0 && knowledge.suggestedDocumentType) {
      // Pénaliser une mauvaise promotion (ex. mention 2042 → incomeTaxReturn)
      const penalized = "incomeTaxReturn";
      scores[penalized] = Math.max(0, (scores[penalized] || 0) + s.weight * 0.5);
      evidence.push({
        signal: s.signal,
        family: "negativeEvidence",
        delta: s.weight * 0.5,
        type: penalized,
        evidence: s.evidence
      });
    }
  }

  // Boost type suggéré seulement si pas uniquement une mention
  const hasMentionOnly =
    knowledge.detectedReferences.some((r) => r.role === "mentionedDocument") &&
    !knowledge.detectedReferences.some((r) => r.role === "documentIdentity") &&
    !knowledge.signals.some((s) => s.signal.startsWith("knowledge:lexical:"));

  let primary = classification.primary;
  let confidence = classification.confidence;
  let status = classification.status;

  if (
    knowledge.suggestedDocumentType &&
    !hasMentionOnly &&
    (scores[knowledge.suggestedDocumentType] || 0) >= 0.45
  ) {
    // Ne pas écraser une classification non-fiscale forte (facture, banque…)
    const nonFiscalStrong = ["invoice", "bankStatement", "contract", "payslip"].includes(
      classification.primary
    );
    const currentScore = scores[classification.primary] || 0;
    const suggestedScore = scores[knowledge.suggestedDocumentType] || 0;
    if (!nonFiscalStrong || suggestedScore > currentScore + 0.15) {
      primary = knowledge.suggestedDocumentType;
      confidence = toConfidence(Math.min(0.95, Math.max(suggestedScore, 0.55)));
      status = suggestedScore >= 0.55 ? "resolved" : "ambiguous";
    }
  }

  // unknownTaxDocument explicite — préférable à une fausse classe précise
  // Ne pas écraser une famille fiscale spécialisée déjà choisie.
  if (knowledge.suggestedFamily === "unknownTaxDocument") {
    const specializedFiscal = new Set([
      "incomeTaxReturn",
      "incomeTaxNotice",
      "propertyTax",
      "taxForm"
    ]);
    if (!specializedFiscal.has(primary)) {
      const softPrimaries = new Set([
        "unknown",
        "taxDocument",
        "administrativeLetter",
        "notice",
        "form",
        "unknownTaxDocument"
      ]);
      if (softPrimaries.has(classification.primary) || softPrimaries.has(primary)) {
        primary = "unknownTaxDocument";
        scores.unknownTaxDocument = Math.max(scores.unknownTaxDocument || 0, 0.55);
        status = "unknown";
        confidence = toConfidence(0.45);
      }
    }
  }

  const alternatives = Object.entries(scores)
    .filter(([t]) => t !== primary)
    .map(([type, score]) => ({ type: type as typeof primary, confidence: score || 0 }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    ...classification,
    primary,
    confidence,
    status,
    scores,
    alternatives,
    evidence,
    signals: {
      ...classification.signals,
      strong: [
        ...(classification.signals?.strong || []),
        ...knowledge.signals
          .filter((s) => s.weight >= 0.4)
          .map((s) => s.signal)
      ],
      negative: [
        ...(classification.signals?.negative || []),
        ...knowledge.signals
          .filter((s) => s.weight < 0)
          .map((s) => s.signal)
      ]
    }
  };
}
