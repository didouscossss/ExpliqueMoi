/**
 * Construction keyFacts / financialFacts / importantDates / parties.
 */

import { toConfidence } from "../types/confidence.js";
import type { DocumentTypeId } from "../types/documentClassification.js";
import type { ResolvedField } from "../types/documentProfile.js";
import type { UnderstandingItem } from "../types/documentUnderstanding.js";
import type { TextBlock } from "../types/textBlock.js";
import { enrichEvidence } from "./evidence.js";
import {
  importanceFor,
  isDateField,
  isFinancialField,
  isPartyField
} from "./importance.js";

function fieldToItem(
  field: ResolvedField,
  type: DocumentTypeId,
  blocks: readonly TextBlock[]
): UnderstandingItem | null {
  if (field.status === "notApplicable") return null;
  if (field.status === "missing") {
    // missing ≠ affirmation négative — on n'expose pas comme fait
    return null;
  }

  const evidence = enrichEvidence(field.evidence, blocks);
  if (
    (field.status === "resolved" || field.status === "ambiguous") &&
    field.value !== undefined &&
    evidence.length === 0
  ) {
    // pas de fait sans preuve
    return null;
  }

  return {
    kind: field.field,
    value: field.value,
    confidence: field.confidence || toConfidence(0.5),
    status: field.status,
    importance: importanceFor(
      type,
      field.field,
      field.expectation.importance
    ),
    evidence,
    derivedFrom: [
      `field:${field.field}`,
      ...(field.candidateIds || []).map((id) => `candidate:${id}`),
      ...(field.reasons || []).map((r) => r.signal)
    ],
    reasoning: field.reasons || []
  };
}

export function buildFactBuckets(
  type: DocumentTypeId,
  fields: readonly ResolvedField[],
  blocks: readonly TextBlock[]
): {
  parties: UnderstandingItem[];
  keyFacts: UnderstandingItem[];
  financialFacts: UnderstandingItem[];
  importantDates: UnderstandingItem[];
} {
  const parties: UnderstandingItem[] = [];
  const financialFacts: UnderstandingItem[] = [];
  const importantDates: UnderstandingItem[] = [];
  const keyFacts: UnderstandingItem[] = [];

  for (const f of fields) {
    const item = fieldToItem(f, type, blocks);
    if (!item) continue;

    if (isPartyField(f.field)) {
      parties.push(item);
    } else if (isFinancialField(f.field)) {
      financialFacts.push(item);
    } else if (isDateField(f.field)) {
      importantDates.push(item);
    } else if (
      item.importance === "critical" ||
      item.importance === "high" ||
      item.importance === "medium"
    ) {
      keyFacts.push(item);
    }
  }

  // keyFacts = faits importants hors buckets déjà listés + top financial/dates/parties
  const ranked = [...parties, ...financialFacts, ...importantDates, ...keyFacts]
    .filter(
      (i) => i.importance === "critical" || i.importance === "high"
    )
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      return rank[a.importance] - rank[b.importance];
    });

  // Dédupliquer keyFacts par kind
  const seen = new Set<string>();
  const mergedKey: UnderstandingItem[] = [];
  for (const item of ranked) {
    if (seen.has(item.kind)) continue;
    seen.add(item.kind);
    mergedKey.push(item);
  }

  return {
    parties,
    keyFacts: mergedKey,
    financialFacts,
    importantDates
  };
}
