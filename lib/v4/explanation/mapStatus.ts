/**
 * Mapping Understanding → ExplanationStatus.
 */

import type { ExplanationStatus } from "../types/documentExplanation.js";
import type { UnderstandingClaimStatus } from "../types/documentUnderstanding.js";

export function toExplanationStatus(
  status: UnderstandingClaimStatus | string,
  derivedFrom: readonly string[] = []
): ExplanationStatus {
  if (status === "ambiguous") return "ambiguous";
  if (status === "missing" || status === "notFound") return "missing";
  if (status === "notApplicable") return "notApplicable";
  if (status === "unknown" || status === "noExplicitActionDetected") {
    return "missing";
  }

  const isDerived = derivedFrom.some(
    (d) =>
      d.startsWith("relation:") ||
      d.includes("arithmetic") ||
      d.includes("actionDeadline") ||
      d === "arithmetic:HT+VAT≈TTC"
  );
  if (isDerived) return "derived";
  return "supported";
}
