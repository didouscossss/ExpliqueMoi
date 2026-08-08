/**
 * Safety DocumentCase V4-R.
 */

import type { DocumentCase } from "../../../../types/knowledge.js";
import { auditDocumentCase } from "./audit.js";

export interface DocumentCaseSafetyReport {
  ok: boolean;
  violations: string[];
}

export function checkDocumentCaseSafety(
  docCase: DocumentCase
): DocumentCaseSafetyReport {
  const violations: string[] = [];
  const audit = auditDocumentCase(docCase);
  if (!audit.ok) {
    for (const [k, v] of Object.entries(audit)) {
      if (k === "ok") continue;
      if (Array.isArray(v) && v.length) violations.push(`${k}:${v.length}`);
    }
  }
  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
  }
  for (const m of docCase.requirementMatches) {
    if (m.aggregatedValue != null) violations.push(`agg:${m.requirementId}`);
  }
  for (const view of docCase.caseCentricViews) {
    if (view.suggestedDeclaredAmount != null) {
      violations.push(`viewAgg:${view.fieldCode}`);
    }
    const blob = JSON.stringify(view);
    if (/reportez|vous devez déclarer|éligible|additionnez/i.test(blob)) {
      violations.push(`forbiddenTone:${view.fieldCode}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
