/**
 * Construit DocumentExplanation depuis DocumentUnderstanding + classification.
 * Déterministe, local, aucune invention.
 */

import { toConfidence } from "../types/confidence.js";
import type { DocumentClassification } from "../types/documentClassification.js";
import { SECONDARY_SECTION_KINDS } from "../types/documentClassification.js";
import type {
  DocumentExplanation,
  ExplanationAction,
  ExplanationFact,
  ExplanationSecondaryInfo,
  ExplanationWarning
} from "../types/documentExplanation.js";
import type {
  ActionUnderstanding,
  DocumentUnderstanding,
  UnderstandingItem,
  UnderstandingWarning
} from "../types/documentUnderstanding.js";
import type { TextBlock } from "../types/textBlock.js";
import { enrichEvidence } from "../understanding/evidence.js";
import { countUnsupportedExplanationFacts } from "./invariant.js";
import { toExplanationStatus } from "./mapStatus.js";

function itemToFact(
  item: UnderstandingItem,
  blocks: readonly TextBlock[],
  fieldOverride?: string
): ExplanationFact | null {
  // missing / notApplicable / unknown : pas d'affirmation
  if (
    item.status === "missing" ||
    item.status === "notApplicable" ||
    item.status === "notFound" ||
    item.status === "unknown" ||
    item.status === "noExplicitActionDetected"
  ) {
    return null;
  }
  if (item.value === undefined || item.value === null) return null;

  const evidence = enrichEvidence(item.evidence, blocks);
  if (!evidence.length) return null; // pas de preuve → pas d'affirmation

  const status = toExplanationStatus(item.status, item.derivedFrom);
  return {
    kind: item.kind,
    field: fieldOverride || item.kind,
    value: item.value,
    confidence: item.confidence,
    status,
    evidence,
    derivedFrom: [...item.derivedFrom],
    reasoning: [...item.reasoning]
  };
}

function mapWarning(
  w: UnderstandingWarning,
  blocks: readonly TextBlock[]
): ExplanationWarning | null {
  // missingExpectedField / lowConfidence / unresolvedRelation ≠ contradiction
  if (
    w.kind === "missingExpectedField" ||
    w.kind === "lowConfidence" ||
    w.kind === "unresolvedRelation" ||
    w.kind === "unusualStructure"
  ) {
    return null;
  }

  const evidence = enrichEvidence(w.evidence, blocks);
  if (!evidence.length) return null;

  if (w.kind === "arithmeticContradiction") {
    return {
      kind: "arithmeticInconsistency",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "contradictory"
    };
  }
  if (w.kind === "conflictingValues") {
    return {
      kind: "conflictingValues",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "contradictory"
    };
  }
  if (w.kind === "ambiguousField") {
    return {
      kind: "ambiguousField",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "ambiguous"
    };
  }
  return null;
}

function mapAction(
  a: ActionUnderstanding,
  blocks: readonly TextBlock[]
): ExplanationAction | null {
  if (a.status === "noExplicitActionDetected") {
    return {
      actionType: "none",
      description: null,
      deadline: null,
      confidence: a.confidence,
      status: "noExplicitActionDetected",
      evidence: [],
      derivedFrom: [...a.derivedFrom],
      reasoning: [...a.reasoning]
    };
  }
  if (!a.description) return null;
  const evidence = enrichEvidence(a.evidence, blocks);
  if (!evidence.length) return null;

  const deadline = a.deadline
    ? itemToFact(a.deadline, blocks, "actionDeadline")
    : null;

  return {
    actionType: a.actionType,
    description: a.description,
    deadline,
    confidence: a.confidence,
    status: toExplanationStatus(a.status, a.derivedFrom),
    evidence,
    derivedFrom: [...a.derivedFrom],
    reasoning: [...a.reasoning]
  };
}

function mapSecondary(
  classification: DocumentClassification,
  blocks: readonly TextBlock[]
): ExplanationSecondaryInfo[] {
  const out: ExplanationSecondaryInfo[] = [];
  for (const sec of classification.secondarySections || []) {
    const kind = sec.kind;
    // Strict : uniquement SecondarySectionKind — jamais DocumentType (ex. bankStatement)
    if (!(SECONDARY_SECTION_KINDS as readonly string[]).includes(kind)) {
      continue;
    }

    const evidence = blocks
      .filter((b) => {
        if (kind === "bankingDetails") {
          return /iban|rib|\bbic\b|coordonn[eé]es\s+bancaires/i.test(b.text);
        }
        if (kind === "paymentInformation") {
          return /sepa|pr[eé]l[eè]vement|mode\s+de\s+paiement|mandat/i.test(
            b.text
          );
        }
        if (kind === "paymentSchedule") {
          return /[eé]ch[eé]ancier|mensualit/i.test(b.text);
        }
        return sec.signals.some((s) =>
          b.text.toLowerCase().includes(s.toLowerCase())
        );
      })
      .slice(0, 4)
      .map((b) => ({
        text: b.text,
        page: b.page,
        bbox: b.bbox ?? null,
        blockId: b.id,
        lineId: b.lineId ?? null
      }));

    // Sans preuve textuelle → ne pas affirmer la section
    if (!evidence.length && sec.signals.length === 0) continue;

    out.push({
      kind: "secondarySection",
      sectionKind: kind,
      signals: [...sec.signals],
      confidence: sec.confidence,
      status: "supported",
      evidence,
      derivedFrom: [
        `secondarySection:${kind}`,
        ...sec.signals.map((s) => `signal:${s}`)
      ]
    });
  }
  return out;
}

function dedupeFacts(facts: ExplanationFact[]): ExplanationFact[] {
  const seen = new Set<string>();
  const out: ExplanationFact[] = [];
  for (const f of facts) {
    const key = `${f.field}|${String(f.value)}|${f.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function buildDocumentExplanation(input: {
  understanding: DocumentUnderstanding;
  classification: DocumentClassification;
  blocks: readonly TextBlock[];
}): DocumentExplanation {
  const { understanding: u, classification, blocks } = input;

  const title = u.identity.title
    ? itemToFact(u.identity.title, blocks)
    : null;

  const summaryFacts = dedupeFacts(
    [
      itemToFact(u.purpose, blocks, "purpose"),
      title,
      u.identity.reference
        ? itemToFact(u.identity.reference, blocks)
        : null,
      ...u.parties.map((p) => itemToFact(p, blocks))
    ].filter((f): f is ExplanationFact => Boolean(f))
  );

  const importantFacts = dedupeFacts(
    u.keyFacts
      .map((k) => itemToFact(k, blocks))
      .filter((f): f is ExplanationFact => Boolean(f))
  );

  const amounts = dedupeFacts(
    u.financialFacts
      .map((f) => itemToFact(f, blocks))
      .filter((x): x is ExplanationFact => Boolean(x))
  );

  const deadlines = dedupeFacts(
    [
      ...u.importantDates
        .filter((d) =>
          /deadline|dueDate|paymentDeadline|actionDeadline|effectiveDate|endDate/i.test(
            d.kind
          )
        )
        .map((d) => itemToFact(d, blocks)),
      ...u.actions
        .map((a) => (a.deadline ? itemToFact(a.deadline, blocks) : null))
    ].filter((f): f is ExplanationFact => Boolean(f))
  );

  const actions = u.actions
    .map((a) => mapAction(a, blocks))
    .filter((a): a is ExplanationAction => Boolean(a));

  // Ambiguïtés → conserver les valeurs candidates distinctes (pas de choix arbitraire)
  const applyAmbiguity = (facts: ExplanationFact[]): ExplanationFact[] =>
    facts.map((f) => {
      if (f.status !== "ambiguous") return f;
      const unc = u.uncertainties.find((x) => x.kind === f.field || x.kind === f.kind);
      if (!unc?.candidates?.length) return f;
      const values = [
        ...new Set(unc.candidates.map((c) => JSON.stringify(c.value)))
      ].map((s) => JSON.parse(s) as unknown);
      // Exiger au moins 2 valeurs distinctes pour exposer une liste
      if (values.length < 2) return f;
      const evidence = enrichEvidence(
        [...f.evidence, ...unc.candidates.flatMap((c) => c.evidence)],
        blocks
      );
      if (evidence.length < 1) return f;
      return {
        ...f,
        value: values,
        evidence,
        derivedFrom: [...new Set([...f.derivedFrom, ...unc.derivedFrom])]
      };
    });

  const importantFactsFinal = applyAmbiguity(importantFacts);
  const deadlinesFinal = applyAmbiguity(deadlines);
  const amountsFinal = applyAmbiguity(amounts);

  // Ajouter les uncertainties absentes des buckets
  for (const unc of u.uncertainties) {
    if (unc.status !== "ambiguous") continue;
    const evidence = enrichEvidence(
      [
        ...unc.evidence,
        ...unc.candidates.flatMap((c) => c.evidence)
      ],
      blocks
    );
    if (!evidence.length) continue;
    const fact: ExplanationFact = {
      kind: unc.kind,
      field: unc.kind,
      value: unc.candidates.map((c) => c.value),
      confidence: toConfidence(
        Math.max(...unc.candidates.map((c) => c.confidence), 0.4)
      ),
      status: "ambiguous",
      evidence,
      derivedFrom: [...unc.derivedFrom],
      reasoning: [...unc.reasoning]
    };
    if (!importantFactsFinal.some((f) => f.field === fact.field && f.status === "ambiguous")) {
      importantFactsFinal.push(fact);
    }
    if (/date|deadline|period/i.test(fact.field)) {
      if (!deadlinesFinal.some((d) => d.field === fact.field && d.status === "ambiguous")) {
        deadlinesFinal.push(fact);
      }
    }
    if (/amount|balance|salary|tax|ttc|ht|due|vat/i.test(fact.field)) {
      if (!amountsFinal.some((a) => a.field === fact.field && a.status === "ambiguous")) {
        amountsFinal.push(fact);
      }
    }
  }

  const warnings = u.warnings
    .map((w) => mapWarning(w, blocks))
    .filter((w): w is ExplanationWarning => Boolean(w));

  const secondaryInformation = mapSecondary(classification, blocks);

  const partial = {
    documentType: classification,
    title,
    summaryFacts,
    importantFacts: importantFactsFinal,
    actions,
    deadlines: deadlinesFinal,
    amounts: amountsFinal,
    warnings,
    secondaryInformation,
    evidenceCoverage: u.evidenceCoverage
  };

  const unsupportedExplanationFacts = countUnsupportedExplanationFacts(partial);

  return {
    ...partial,
    unsupportedExplanationFacts
  };
}
