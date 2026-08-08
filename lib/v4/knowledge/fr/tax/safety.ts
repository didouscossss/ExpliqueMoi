/**
 * Invariants de sécurité knowledge V4-L.
 */

import type {
  DetectedFiscalReference,
  DocumentFactRef,
  FiscalKnowledgeAnalysis,
  KnowledgeFact
} from "../../../types/knowledge.js";

export interface KnowledgeSafetyReport {
  ok: boolean;
  violations: string[];
}

/** KnowledgeFact ne peut pas devenir DocumentFact sans evidence. */
export function knowledgeFactIsNotDocumentFact(fact: KnowledgeFact): boolean {
  return fact.kind === "knowledge";
}

export function documentFactIsNotKnowledgeFact(fact: DocumentFactRef): boolean {
  return fact.kind === "document" && Array.isArray(fact.evidence);
}

export function checkFiscalKnowledgeSafety(
  analysis: FiscalKnowledgeAnalysis
): KnowledgeSafetyReport {
  const violations: string[] = [];

  for (const kf of analysis.knowledgeFacts) {
    if (kf.kind !== "knowledge") {
      violations.push("KnowledgeFact.kind != knowledge");
    }
  }

  for (const ref of analysis.detectedReferences) {
    if (ref.kind === "taxpayerIdentifier") {
      // personalIdentifier ≠ documentReference / formReference
      if (ref.registryId && /^fr-tax-20/.test(ref.registryId)) {
        violations.push("personalIdentifier lié à une entrée formulaire");
      }
    }
    if (ref.kind === "noticeReference" && /^204\d/.test(ref.normalized)) {
      violations.push("noticeReference ressemble à un formReference");
    }
  }

  if (analysis.invariants.knowledgeAsDocumentFact > 0) {
    violations.push("KnowledgeFact promu en DocumentFact");
  }
  if (analysis.invariants.personalIdAsFormReference > 0) {
    violations.push("personalIdAsFormReference");
  }
  if (analysis.invariants.mentionedAsIdentity > 0) {
    violations.push("mentionedDocument traité comme documentIdentity");
  }
  if ((analysis.invariants.documentFactsFromKnowledge || 0) > 0) {
    violations.push("documentFactsFromKnowledge");
  }
  if ((analysis.invariants.inventedTaxObligations || 0) > 0) {
    violations.push("inventedTaxObligations");
  }
  if ((analysis.invariants.inventedTaxDates || 0) > 0) {
    violations.push("inventedTaxDates");
  }
  if ((analysis.invariants.inventedTaxAmounts || 0) > 0) {
    violations.push("inventedTaxAmounts");
  }
  if ((analysis.invariants.unsupportedKnowledgeClaims || 0) > 0) {
    violations.push("unsupportedKnowledgeClaims");
  }
  if ((analysis.invariants.knowledgeWithoutProvenance || 0) > 0) {
    // Uniquement bloquant si des knowledgeFacts verified sans provenance
    const verifiedSansProv = (analysis.taxExplanation?.knowledgeFacts || []).filter(
      (kf) =>
        !kf.provenance?.length &&
        analysis.taxExplanation?.identity.qualityStatus === "verified"
    );
    if (verifiedSansProv.length > 0) {
      violations.push("knowledgeWithoutProvenance");
    }
  }

  return { ok: violations.length === 0, violations };
}

export function assertReferenceKindSeparation(
  refs: readonly DetectedFiscalReference[]
): void {
  for (const r of refs) {
    if (r.kind === "taxpayerIdentifier" && r.normalized.length === 13) {
      if ((r.kind as string) === "formReference") {
        throw new Error("taxpayerIdentifier mislabeled");
      }
    }
  }
}
