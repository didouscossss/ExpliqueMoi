/**
 * Construction d’evidence d’applicabilité — V4-T.
 */

import type {
  TaxApplicabilityEvidence,
  TaxApplicabilityEvidenceSourceKind
} from "../../../../types/knowledge.js";

let seq = 0;
export function resetApplicabilityBuildIdsForTests(): void {
  seq = 0;
}

export function buildApplicabilityEvidence(input: {
  sourceKind: TaxApplicabilityEvidenceSourceKind;
  label: string;
  detail: string;
  ruleId?: string | null;
  factId?: string | null;
  documentId?: string | null;
  userFactId?: string | null;
}): TaxApplicabilityEvidence {
  seq += 1;
  return {
    evidenceId: `aev-${seq}`,
    sourceKind: input.sourceKind,
    label: input.label,
    detail: input.detail,
    ruleId: input.ruleId || null,
    factId: input.factId || null,
    documentId: input.documentId || null,
    userFactId: input.userFactId || null
  };
}
