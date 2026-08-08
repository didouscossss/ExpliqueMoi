/**
 * Assemblage DocumentUnderstanding à partir des sorties V4-A→E.
 */

import { toConfidence } from "../types/confidence.js";
import type { DocumentClassification } from "../types/documentClassification.js";
import type {
  DocumentProfile,
  ProfileResolutionResult
} from "../types/documentProfile.js";
import type { EntityCandidate } from "../types/entityCandidate.js";
import type { ConsistencyResult, Relation } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import type {
  DocumentUnderstanding,
  UnderstandingItem
} from "../types/documentUnderstanding.js";
import { buildActions } from "./actions.js";
import { detectExplicitNoAction } from "./noAction.js";
import {
  computeEvidenceCoverage,
  dropUnsupportedFacts
} from "./coverage.js";
import { enrichEvidence } from "./evidence.js";
import { buildFactBuckets } from "./facts.js";
import { buildPurpose } from "./purpose.js";
import { buildSections } from "./sections.js";
import { buildStructuredSummary } from "./summary.js";
import { buildUncertainties, buildWarnings } from "./warnings.js";

export interface UnderstandingBuildInput {
  classification: DocumentClassification;
  profile: DocumentProfile;
  resolution: ProfileResolutionResult;
  candidates: readonly EntityCandidate[];
  relations: readonly Relation[];
  consistency: ConsistencyResult | null;
  blocks: readonly TextBlock[];
}

function buildIdentity(
  classification: DocumentClassification,
  resolution: ProfileResolutionResult,
  blocks: readonly TextBlock[]
): DocumentUnderstanding["identity"] {
  const titleField = resolution.fields.find(
    (f) =>
      (f.field === "title" ||
        f.field === "formTitle" ||
        f.field === "contractTitle" ||
        f.field === "subject") &&
      (f.status === "resolved" || f.status === "ambiguous")
  );
  const refField = resolution.fields.find(
    (f) =>
      (f.field === "invoiceNumber" ||
        f.field === "reference" ||
        f.field === "references") &&
      (f.status === "resolved" || f.status === "ambiguous")
  );

  const toItem = (
    f: NonNullable<typeof titleField>,
    kind: string
  ): UnderstandingItem | null => {
    const evidence = enrichEvidence(f.evidence, blocks);
    if (!evidence.length || f.value === undefined) return null;
    return {
      kind,
      value: f.value,
      confidence: f.confidence || toConfidence(0.5),
      status: f.status,
      importance: f.expectation.importance || "medium",
      evidence,
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || []
    };
  };

  return {
    documentType: classification.primary,
    title: titleField ? toItem(titleField, titleField.field) : null,
    reference: refField ? toItem(refField, refField.field) : null
  };
}

/** Affirmation dérivée arithmétique HT+TVA≈TTC si relation valide. */
function buildArithmeticDerived(
  relations: readonly Relation[],
  resolution: ProfileResolutionResult,
  blocks: readonly TextBlock[]
): UnderstandingItem | null {
  const arith = relations.find(
    (r) =>
      r.type === "arithmetic" &&
      r.score >= 0.7 &&
      /HT\s*\+\s*TVA|HT\+TVA/i.test(r.label || "")
  );
  if (!arith) {
    // fallback: any high-score arithmetic
    const any = relations.find((r) => r.type === "arithmetic" && r.score >= 0.85);
    if (!any) return null;
    return fromArith(any, resolution, blocks);
  }
  return fromArith(arith, resolution, blocks);
}

function fromArith(
  rel: Relation,
  resolution: ProfileResolutionResult,
  blocks: readonly TextBlock[]
): UnderstandingItem | null {
  const usable = (name: string) =>
    resolution.fields.find(
      (f) =>
        f.field === name &&
        (f.status === "resolved" || f.status === "ambiguous") &&
        f.value !== undefined
    );
  const ht = usable("amountHT");
  const vat = usable("vatAmount");
  const ttc = usable("amountTTC");
  if (!ht || !vat || !ttc) return null;
  const evidence = enrichEvidence(
    [
      ...(ht.evidence || []),
      ...(vat.evidence || []),
      ...(ttc.evidence || []),
      ...(rel.evidence || [])
    ],
    blocks
  );
  if (evidence.length < 2) return null;
  return {
    kind: "arithmeticConsistency",
    value: {
      amountHT: ht.value,
      vatAmount: vat.value,
      amountTTC: ttc.value,
      relation: rel.label || "HT + TVA ≈ TTC"
    },
    confidence: toConfidence(rel.score),
    status: "resolved",
    importance: "high",
    evidence,
    derivedFrom: [
      "field:amountHT",
      "field:vatAmount",
      "field:amountTTC",
      `relation:${rel.id}`,
      "arithmetic:HT+VAT≈TTC"
    ],
    reasoning: [
      ...rel.reasons,
      { signal: "explicitLabel:TTC", delta: 0.1 },
      { signal: "arithmetic:HT+VAT≈TTC", delta: 0.3 }
    ]
  };
}

export function buildDocumentUnderstanding(
  input: UnderstandingBuildInput
): DocumentUnderstanding {
  const {
    classification,
    resolution,
    candidates,
    relations,
    consistency,
    blocks
  } = input;
  const type = classification.primary;

  const purpose = buildPurpose(type, blocks, resolution.fields);
  const identity = buildIdentity(classification, resolution, blocks);
  const buckets = buildFactBuckets(type, resolution.fields, blocks);
  const derived = buildArithmeticDerived(relations, resolution, blocks);
  if (derived) {
    buckets.financialFacts.push(derived);
    if (!buckets.keyFacts.some((k) => k.kind === derived.kind)) {
      buckets.keyFacts.push(derived);
    }
  }

  const parties = dropUnsupportedFacts(buckets.parties);
  const keyFacts = dropUnsupportedFacts(buckets.keyFacts);
  const financialFacts = dropUnsupportedFacts(buckets.financialFacts);
  const importantDates = dropUnsupportedFacts(buckets.importantDates);

  const explicitNoAction = detectExplicitNoAction(blocks);
  if (
    explicitNoAction &&
    !keyFacts.some((k) => k.kind === "actionRequired")
  ) {
    keyFacts.push(explicitNoAction);
  }

  const actions = buildActions(
    type,
    resolution.fields,
    candidates,
    relations,
    blocks
  );
  const warnings = buildWarnings(resolution, consistency, relations, blocks);
  const uncertainties = buildUncertainties(resolution, blocks);
  const sections = buildSections(resolution.fields, blocks);

  // Purpose sans preuve → unknown (pas fait inventé)
  const safePurpose =
    purpose.status === "resolved" && purpose.evidence.length === 0
      ? { ...purpose, status: "unknown" as const, value: "unknown" }
      : purpose;

  const finalParties = dropUnsupportedFacts(parties);
  const finalKey = dropUnsupportedFacts(keyFacts);
  const finalFin = dropUnsupportedFacts(financialFacts);
  const finalDates = dropUnsupportedFacts(importantDates);
  const finalActions = actions.filter(
    (a) =>
      a.status === "noExplicitActionDetected" ||
      (Boolean(a.description) && a.evidence.length > 0)
  );

  // Warnings contradictoires sans evidence → ne pas les exposer comme faits
  const finalWarnings = warnings.filter(
    (w) =>
      (w.kind !== "arithmeticContradiction" &&
        w.kind !== "conflictingValues") ||
      w.evidence.length > 0
  );

  const evidenceCoverage = computeEvidenceCoverage({
    purpose: safePurpose,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings
  });

  const structuredSummary = buildStructuredSummary({
    purpose: safePurpose,
    identity,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings,
    uncertainties
  });

  return {
    documentType: classification,
    identity,
    purpose: safePurpose,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings,
    uncertainties,
    sections,
    evidenceCoverage,
    structuredSummary
  };
}
