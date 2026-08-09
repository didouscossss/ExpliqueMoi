/**
 * Classification prudente — marqueurs explicites uniquement.
 * Un montant ou une date isolés ne suffisent JAMAIS.
 */

import type { GenericDocumentTypeId } from "./types.js";

export interface GenericClassificationResult {
  documentType: GenericDocumentTypeId;
  confidence: number;
  evidence: string[];
}

/**
 * renewalNotice uniquement si le titre / marqueur « avis de renouvellement »
 * est explicitement présent. Sinon unknown.
 */
export function classifyGenericDocument(
  text: string
): GenericClassificationResult {
  const raw = String(text || "");
  const evidence: string[] = [];

  const renewal =
    /\bavis\s+de\s+renouvellement\b/i.exec(raw) ||
    /\brenouvellement\s+de\s+(votre\s+)?contrat\b/i.exec(raw);

  if (renewal) {
    evidence.push(`marker:${renewal[0]}`);
    // Confiance déterministe : titre explicite fort
    const titleLike = /^\s*avis\s+de\s+renouvellement\s*$/im.test(raw);
    return {
      documentType: "renewalNotice",
      confidence: titleLike ? 0.92 : 0.78,
      evidence
    };
  }

  return {
    documentType: "unknown",
    confidence: 0,
    evidence: []
  };
}
