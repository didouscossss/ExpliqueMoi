/**
 * Orchestrateur V4-Y — compréhension documentaire générique hors fiscalité.
 * Pipeline : texte → candidats V4 (fiscalKnowledge=false) → generic facts
 * → classification prudente → importance → LocalExplanation administrative.
 *
 * Aucun import fr/tax/. Aucun fetch / LLM.
 */

import { analyzeDocumentV4 } from "../pipeline/analyzeDocumentV4.js";
import {
  buildGenericDocumentExplanations,
  resetGenericExplanationIdsForTests
} from "./buildGenericDocumentExplanations.js";
import {
  applyGenericClarificationAnswer,
  buildGenericClarifications,
  resetGenericClarificationIdsForTests
} from "./clarification.js";
import { classifyGenericDocument } from "./classifyGenericDocument.js";
import {
  extractGenericFacts,
  resetGenericFactIdsForTests
} from "./extractGenericFacts.js";
import {
  buildGenericDocumentPreview,
  genericUnderstandingToPreviewJson
} from "./mapGenericToPreview.js";
import {
  extractImportantFacts,
  rankDocumentFacts
} from "./rankDocumentFacts.js";
import {
  assertGenericSafetyClean,
  auditGenericSafety,
  emptyGenericSafety
} from "./safety.js";
import type {
  GenericClarificationQuestion,
  GenericDocumentSeed,
  GenericDocumentSession,
  GenericDocumentUnderstanding,
  GenericUserFact
} from "./types.js";

export interface AnalyzeGenericDocumentOptions {
  documentId?: string;
  resetIds?: boolean;
}

export function analyzeGenericDocument(
  seed: GenericDocumentSeed | string,
  options: AnalyzeGenericDocumentOptions = {}
): GenericDocumentUnderstanding {
  if (options.resetIds) {
    resetGenericFactIdsForTests();
    resetGenericExplanationIdsForTests();
    resetGenericClarificationIdsForTests();
  }

  const text = typeof seed === "string" ? seed : seed.text || "";
  const documentId =
    options.documentId ||
    (typeof seed === "string" ? "doc-generic-1" : seed.id || "doc-generic-1");

  // Pipeline A→H générique — pas de knowledge fiscale
  const v4 = analyzeDocumentV4({ text, fiscalKnowledge: false });

  const classification = classifyGenericDocument(text);
  let facts = extractGenericFacts({
    documentId,
    text,
    blocks: v4.blocks,
    candidates: v4.candidates
  });
  facts = rankDocumentFacts(facts);
  const importantFacts = extractImportantFacts(facts);

  const explanations = buildGenericDocumentExplanations({
    documentId,
    documentType: classification.documentType,
    facts
  });

  const clarifications = buildGenericClarifications(facts);
  const preview = buildGenericDocumentPreview({
    documentType: classification.documentType,
    facts,
    explanations
  });

  const taxRulesTriggered = countTaxSignals(v4);
  const taxCalculations = 0; // jamais de calcul fiscal sur ce chemin

  const safety = auditGenericSafety({
    facts,
    explanations,
    documentType: classification.documentType,
    documentTypeEvidence: classification.evidence,
    taxRulesTriggered,
    taxCalculations
  });

  return {
    documentId,
    documentType: classification.documentType,
    documentTypeConfidence: classification.confidence,
    documentTypeEvidence: classification.evidence,
    facts,
    importantFacts,
    explanations,
    clarifications,
    userFacts: [],
    preview,
    safety,
    taxRulesTriggered,
    taxCalculations,
    fetchCount: 0,
    llmCount: 0
  };
}

function countTaxSignals(v4: {
  fiscalKnowledge?: unknown;
  classification?: { primary?: string };
}): number {
  if (v4.fiscalKnowledge) return 1;
  const primary = v4.classification?.primary || "";
  // Le chemin générique peut classer "notice" etc. — ce n’est pas une règle fiscale
  if (
    /^(incomeTax|taxDocument|taxForm|propertyTax|unknownTaxDocument|taxNotice)/.test(
      primary
    )
  ) {
    return 1;
  }
  return 0;
}

/** Session multi-documents — ordre d’upload stable, recalcul à add/remove. */
export function buildGenericDocumentSession(
  docs: readonly GenericDocumentSeed[],
  options: { resetIds?: boolean } = {}
): GenericDocumentSession {
  if (options.resetIds) {
    resetGenericFactIdsForTests();
    resetGenericExplanationIdsForTests();
    resetGenericClarificationIdsForTests();
  }

  const documents = docs.map((d, i) => ({
    id: d.id || `gdoc-${i + 1}`,
    text: d.text || "",
    fileName: d.fileName ?? null,
    order: i
  }));

  const understandings = documents.map((d) =>
    analyzeGenericDocument(
      { text: d.text, fileName: d.fileName, id: d.id },
      { documentId: d.id, resetIds: false }
    )
  );

  return assembleSession(documents, understandings);
}

export function addDocumentsToGenericSession(
  session: GenericDocumentSession,
  docs: readonly GenericDocumentSeed[]
): GenericDocumentSession {
  const start = session.documents.length;
  const added = docs.map((d, i) => ({
    id: d.id || `gdoc-${start + i + 1}`,
    text: d.text || "",
    fileName: d.fileName ?? null,
    order: start + i
  }));
  const documents = [...session.documents, ...added];
  const understandings = [
    ...session.understandings,
    ...added.map((d) =>
      analyzeGenericDocument(
        { text: d.text, fileName: d.fileName, id: d.id },
        { documentId: d.id, resetIds: false }
      )
    )
  ];
  return assembleSession(documents, understandings);
}

export function removeDocumentFromGenericSession(
  session: GenericDocumentSession,
  documentId: string
): GenericDocumentSession {
  const documents = session.documents
    .filter((d) => d.id !== documentId)
    .map((d, i) => ({ ...d, order: i }));
  const understandings = documents.map((d) =>
    analyzeGenericDocument(
      { text: d.text, fileName: d.fileName, id: d.id },
      { documentId: d.id, resetIds: false }
    )
  );
  return assembleSession(documents, understandings);
}

function assembleSession(
  documents: GenericDocumentSession["documents"],
  understandings: GenericDocumentUnderstanding[]
): GenericDocumentSession {
  const facts = understandings.flatMap((u) => u.facts);
  const explanations = understandings.flatMap((u) => u.explanations);
  const safety = understandings.reduce((acc, u) => {
    for (const k of Object.keys(acc) as (keyof typeof acc)[]) {
      acc[k] += u.safety[k] || 0;
    }
    return acc;
  }, emptyGenericSafety());

  return { documents, understandings, facts, explanations, safety };
}

export function applyGenericUserAnswer(
  understanding: GenericDocumentUnderstanding,
  questionId: string,
  answer: string
): GenericDocumentUnderstanding {
  const question =
    understanding.clarifications.find((q) => q.questionId === questionId) ||
    null;
  if (!question) return understanding;

  const { userFact, documentFactsUnchanged } = applyGenericClarificationAnswer({
    question,
    answer,
    existingDocumentFacts: understanding.facts
  });

  // Les faits documentaires restent identiques
  const factsFingerprint = JSON.stringify(
    understanding.facts.map((f) => [f.id, f.rawValue, f.kind])
  );
  const afterFingerprint = JSON.stringify(
    documentFactsUnchanged.map((f) => [f.id, f.rawValue, f.kind])
  );
  if (factsFingerprint !== afterFingerprint) {
    throw new Error("Invariant: clarification a muté un GenericDocumentFact");
  }

  return {
    ...understanding,
    facts: documentFactsUnchanged,
    userFacts: [...understanding.userFacts, userFact]
  };
}

export function genericUnderstandingPreviewPayload(
  u: GenericDocumentUnderstanding
): Record<string, unknown> {
  return genericUnderstandingToPreviewJson({
    documentType: u.documentType,
    documentTypeConfidence: u.documentTypeConfidence,
    preview: u.preview,
    explanations: u.explanations,
    safety: u.safety,
    facts: u.facts
  });
}

export { assertGenericSafetyClean, buildGenericClarifications };
