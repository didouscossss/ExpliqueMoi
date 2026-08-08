/**
 * V4-N — TaxDocumentExplanation from identity + knowledge + document facts.
 * Strict separation: KnowledgeFact never becomes DocumentFact.
 * Deterministic, offline, 0 fetch / 0 LLM.
 */

import type { DocumentExplanation } from "../../../../types/documentExplanation.js";
import type { DocumentIdentity } from "../../../../types/documentUnderstanding.js";
import type {
  DocumentFactRef,
  FiscalKnowledgeAnalysis,
  KnowledgeFact,
  TaxDocumentExplanation,
  TaxDocumentSemanticKnowledge,
  TaxKnowledgeQualityStatus
} from "../../../../types/knowledge.js";
import { findByReference, findRelatedDocuments, lookupTaxDocumentKnowledge } from "./lookup.js";
import { getPrioritySemantic } from "./prioritySemantics.js";

function factRefsFromExplanation(explanation: DocumentExplanation): DocumentFactRef[] {
  const out: DocumentFactRef[] = [];
  const push = (f: {
    field: string;
    value: unknown;
    evidence: DocumentFactRef["evidence"];
    derivedFrom: string[];
    status: string;
  }) => {
    if (f.status === "missing" || f.status === "notApplicable") return;
    if (f.value == null || f.value === "") return;
    if (!f.evidence?.length) return;
    out.push({
      kind: "document",
      field: f.field,
      value: f.value,
      evidence: f.evidence,
      derivedFrom: f.derivedFrom
    });
  };

  for (const f of explanation.importantFacts || []) push(f);
  for (const f of explanation.amounts || []) push(f);
  for (const f of explanation.deadlines || []) push(f);
  for (const f of explanation.summaryFacts || []) push(f);
  if (explanation.title) push(explanation.title);

  return out;
}

function pickImportantDocumentFacts(facts: DocumentFactRef[]): DocumentFactRef[] {
  const preferred = [
    "amount",
    "total",
    "tax",
    "deadline",
    "date",
    "period",
    "year",
    "reference",
    "status",
    "refund",
    "due"
  ];
  const scored = facts.map((f) => {
    const key = `${f.field}`.toLowerCase();
    const score = preferred.findIndex((p) => key.includes(p));
    return { f, score: score === -1 ? 99 : score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 12).map((x) => x.f);
}

function buildKnowledgeFacts(
  semantic: TaxDocumentSemanticKnowledge | null,
  subjectId: string
): KnowledgeFact[] {
  if (!semantic) return [];
  const prov = semantic.provenance.length
    ? semantic.provenance
    : semantic.officialSources;
  return [
    {
      kind: "knowledge",
      id: `kf:${subjectId}:what`,
      country: "FR",
      statement: semantic.plainLanguageWhat,
      subjectId,
      fields: ["plainLanguageWhat", "description"],
      provenance: prov,
      confidence: semantic.confidence
    },
    {
      kind: "knowledge",
      id: `kf:${subjectId}:purpose`,
      country: "FR",
      statement: semantic.plainLanguagePurpose || semantic.purpose,
      subjectId,
      fields: ["plainLanguagePurpose", "purpose"],
      provenance: prov,
      confidence: semantic.confidence
    }
  ];
}

function whoIsConcerned(semantic: TaxDocumentSemanticKnowledge | null): string | null {
  if (!semantic) return null;
  if (!semantic.audience?.length) return null;
  return `Publics généralement concernés (connaissance générale) : ${semantic.audience.join(", ")}.`;
}

function buildWhatToCheck(
  semantic: TaxDocumentSemanticKnowledge | null,
  documentFacts: DocumentFactRef[]
): string[] {
  const checks: string[] = [];
  if (semantic?.generalWhatToCheck?.length) {
    for (const item of semantic.generalWhatToCheck) {
      checks.push(
        `${item} (repère général sur ce type de document — non affirmé comme présent ici).`
      );
    }
  }
  const amounts = documentFacts.filter((f) =>
    /amount|total|tax|refund|due|montant/i.test(f.field)
  );
  const dates = documentFacts.filter((f) =>
    /date|deadline|period|year|échéance/i.test(f.field)
  );
  if (amounts.length) {
    checks.push(
      `${amounts.length} montant(s) réellement détecté(s) dans le document — à vérifier dans le texte source.`
    );
  }
  if (dates.length) {
    checks.push(
      `${dates.length} date(s) ou période(s) réellement détectée(s) dans le document — à vérifier dans le texte source.`
    );
  }
  if (!checks.length) {
    checks.push(
      "Aucun élément prioritaire n'a pu être listé de façon fiable pour ce document."
    );
  }
  return checks;
}

function buildPossibleActions(
  semantic: TaxDocumentSemanticKnowledge | null,
  explanation: DocumentExplanation
): { actions: string[]; inventedTaxObligations: number } {
  const actions: string[] = [];
  let inventedTaxObligations = 0;

  if (semantic?.generalPossibleActions?.length) {
    for (const a of semantic.generalPossibleActions) {
      actions.push(
        `${a} (contexte général du type de document, pas une obligation personnelle).`
      );
    }
  }

  for (const act of explanation.actions || []) {
    if (act.status === "noExplicitActionDetected" || act.status === "missing") continue;
    if (!act.evidence?.length) continue;
    if (act.description) {
      actions.push(
        `Action détectée dans le document : ${act.description}`
      );
    }
  }

  if (!actions.length) {
    actions.push(
      "Aucune action précise n'est démontrée dans ce document ; aucune obligation personnelle n'est inventée."
    );
  }

  // Guard: concrete case/deadline obligations must not come from knowledge-only text
  for (const a of actions) {
    if (
      /\bcase\s+[0-9A-Z]{2,}\b/i.test(a) &&
      !/détectée dans le document/i.test(a)
    ) {
      inventedTaxObligations += 1;
    }
    if (
      /avant\s+le\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(a) &&
      !/détectée dans le document/i.test(a)
    ) {
      inventedTaxObligations += 1;
    }
  }

  return { actions, inventedTaxObligations };
}

function resolveSemantic(referenceHint: string | null): {
  semantic: TaxDocumentSemanticKnowledge | null;
  qualityStatus: TaxKnowledgeQualityStatus | null;
  officialTitle: string | null;
  family: TaxDocumentExplanation["identity"]["family"];
  documentKind: TaxDocumentExplanation["identity"]["documentKind"];
  reference: string | null;
} {
  if (!referenceHint) {
    return {
      semantic: null,
      qualityStatus: null,
      officialTitle: null,
      family: null,
      documentKind: null,
      reference: null
    };
  }
  const entry = findByReference(referenceHint);
  const semantic =
    entry?.semantic ||
    lookupTaxDocumentKnowledge(referenceHint) ||
    getPrioritySemantic(referenceHint.toUpperCase());
  return {
    semantic,
    qualityStatus: entry?.qualityStatus || semantic?.qualityStatus || null,
    officialTitle: semantic?.officialTitle || entry?.officialTitle || null,
    family: semantic?.family || entry?.family || null,
    documentKind: semantic?.documentKind || entry?.documentKind || null,
    reference: semantic?.normalizedReference || entry?.normalizedReference || referenceHint
  };
}

/**
 * Pure explanation builder.
 */
export function explainTaxDocument(input: {
  identity: DocumentIdentity;
  explanation: DocumentExplanation;
  fiscalKnowledge?: FiscalKnowledgeAnalysis | null;
  referenceHint?: string | null;
}): TaxDocumentExplanation {
  const primary =
    input.referenceHint ||
    input.fiscalKnowledge?.primaryIdentity?.normalized ||
    (typeof input.identity.reference?.value === "string"
      ? input.identity.reference.value
      : null) ||
    null;

  const resolved = resolveSemantic(primary);
  const semantic = resolved.semantic;

  const sourceFacts = factRefsFromExplanation(input.explanation);
  const importantDocumentFacts = pickImportantDocumentFacts(sourceFacts);

  // Invariant: document facts must never originate from knowledge ids
  const documentFactsFromKnowledge = importantDocumentFacts.filter((f) =>
    f.derivedFrom.some((d) => d.startsWith("kf:"))
  ).length;

  const knowledgeFacts = buildKnowledgeFacts(
    semantic,
    resolved.reference || "unknown"
  );

  const { actions, inventedTaxObligations } = buildPossibleActions(
    semantic,
    input.explanation
  );

  const related = resolved.reference
    ? findRelatedDocuments(resolved.reference).map(({ entry, relation }) => ({
        reference: entry.normalizedReference,
        title: entry.officialTitle,
        relationType: relation.relationType
      }))
    : (semantic?.relatedDocumentRefs || []).map((ref) => ({
        reference: ref,
        title: getPrioritySemantic(ref)?.officialTitle || ref,
        relationType: "relatedTo"
      }));

  const warnings: string[] = [];
  const conf = semantic?.confidence ?? 0.2;
  if (!semantic || conf < 0.55) {
    warnings.push(
      "Identification ou connaissance limitée : les informations générales peuvent ne pas correspondre à ce document."
    );
  }
  if (
    resolved.qualityStatus === "needsReview" ||
    resolved.qualityStatus === "discovered"
  ) {
    warnings.push("La fiche knowledge associée n'est que partiellement vérifiée.");
  }
  if (!importantDocumentFacts.some((f) => /amount|total|tax|montant/i.test(f.field))) {
    warnings.push("Aucun montant n'est présenté comme prouvé par le document.");
  }
  if (!importantDocumentFacts.some((f) => /date|deadline|period|year/i.test(f.field))) {
    warnings.push("Aucune date n'est présentée comme prouvée par le document.");
  }
  warnings.push(
    "Les informations générales (knowledge) ne remplacent pas le contenu réel du document et ne constituent pas un conseil fiscal."
  );

  // Count invented amounts/dates: knowledge statements that look like concrete user values
  let inventedTaxDates = 0;
  let inventedTaxAmounts = 0;
  for (const kf of knowledgeFacts) {
    if (/\b\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d{2})?\s*€/.test(kf.statement)) {
      inventedTaxAmounts += 1;
    }
    if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(kf.statement)) {
      inventedTaxDates += 1;
    }
  }

  const unsupportedKnowledgeClaims =
    semantic && (!semantic.officialSources?.length || !semantic.provenance?.length)
      ? 1
      : 0;

  return {
    identity: {
      reference: resolved.reference,
      officialTitle: resolved.officialTitle,
      family: resolved.family,
      documentKind: resolved.documentKind,
      qualityStatus: resolved.qualityStatus
    },
    whatIsIt: semantic?.plainLanguageWhat || null,
    purpose: semantic?.plainLanguagePurpose || semantic?.purpose || null,
    whoIsConcerned: whoIsConcerned(semantic),
    whatToCheck: buildWhatToCheck(semantic, importantDocumentFacts),
    possibleActions: actions,
    importantDocumentFacts,
    relatedDocuments: related,
    warnings,
    confidence: semantic?.confidence ?? 0.2,
    knowledgeFacts,
    sourceFacts,
    invariants: {
      documentFactsFromKnowledge,
      inventedTaxObligations,
      inventedTaxDates,
      inventedTaxAmounts,
      unsupportedKnowledgeClaims
    }
  };
}

/** Knowledge-only type explanation (no document facts). */
export function explainTaxDocumentType(
  reference: string
): TaxDocumentSemanticKnowledge | null {
  return lookupTaxDocumentKnowledge(reference);
}
