/**
 * EvidenceCoverage — unsupported factual claims must be 0.
 */

import type {
  ActionUnderstanding,
  DocumentUnderstanding,
  EvidenceCoverage,
  UnderstandingItem,
  UnderstandingWarning
} from "../types/documentUnderstanding.js";
import { isFactualClaim } from "./evidence.js";

function claimSupport(
  item: UnderstandingItem
): "direct" | "relational" | "unsupported" | "skip" {
  if (!isFactualClaim(item)) return "skip";
  if (!item.evidence.length) return "unsupported";
  const relational = item.derivedFrom.some(
    (d) =>
      d.startsWith("relation:") ||
      d.includes("arithmetic") ||
      d.includes("actionDeadline")
  );
  return relational ? "relational" : "direct";
}

export function computeEvidenceCoverage(input: {
  purpose: UnderstandingItem;
  parties: UnderstandingItem[];
  keyFacts: UnderstandingItem[];
  financialFacts: UnderstandingItem[];
  importantDates: UnderstandingItem[];
  actions: ActionUnderstanding[];
  warnings: UnderstandingWarning[];
}): EvidenceCoverage {
  const items: UnderstandingItem[] = [
    input.purpose,
    ...input.parties,
    ...input.keyFacts,
    ...input.financialFacts,
    ...input.importantDates
  ];

  // Actions factuelles (pas noExplicitActionDetected)
  for (const a of input.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    if (!a.description) continue;
    items.push({
      kind: `action:${a.actionType}`,
      value: a.description,
      confidence: a.confidence,
      status: a.status,
      importance: "high",
      evidence: a.evidence,
      derivedFrom: a.derivedFrom,
      reasoning: a.reasoning
    });
    if (a.deadline && isFactualClaim(a.deadline)) {
      items.push(a.deadline);
    }
  }

  // Warnings avec message factuel (contradictions) doivent avoir evidence
  for (const w of input.warnings) {
    if (w.kind !== "arithmeticContradiction" && w.kind !== "conflictingValues") {
      continue;
    }
    items.push({
      kind: `warning:${w.kind}`,
      value: w.message,
      confidence: w.confidence,
      status: "resolved",
      importance: "high",
      evidence: w.evidence,
      derivedFrom: w.derivedFrom,
      reasoning: w.reasoning
    });
  }

  let directlySupported = 0;
  let relationallySupported = 0;
  let unsupported = 0;
  let total = 0;

  for (const item of items) {
    const s = claimSupport(item);
    if (s === "skip") continue;
    total += 1;
    if (s === "direct") directlySupported += 1;
    else if (s === "relational") relationallySupported += 1;
    else unsupported += 1;
  }

  const supported = directlySupported + relationallySupported;
  const coverage = total === 0 ? 1 : supported / total;

  return {
    totalClaims: total,
    directlySupported,
    relationallySupported,
    unsupported,
    coverage: Number(coverage.toFixed(4))
  };
}

/** Filtre les faits sans preuve avant exposition. */
export function dropUnsupportedFacts<T extends UnderstandingItem>(
  items: T[]
): T[] {
  return items.filter((i) => !isFactualClaim(i) || i.evidence.length > 0);
}

export function invariantsHold(u: DocumentUnderstanding): string[] {
  const errors: string[] = [];
  if (u.evidenceCoverage.unsupported !== 0) {
    errors.push(`unsupportedClaims=${u.evidenceCoverage.unsupported}`);
  }
  const check = (items: UnderstandingItem[], label: string) => {
    for (const i of items) {
      if (isFactualClaim(i) && i.evidence.length === 0) {
        errors.push(`${label}:${i.kind}:noEvidence`);
      }
    }
  };
  check([u.purpose], "purpose");
  check(u.parties, "parties");
  check(u.keyFacts, "keyFacts");
  check(u.financialFacts, "financial");
  check(u.importantDates, "dates");
  for (const a of u.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    if (a.description && a.evidence.length === 0) {
      errors.push(`action:noEvidence`);
    }
  }
  return errors;
}
