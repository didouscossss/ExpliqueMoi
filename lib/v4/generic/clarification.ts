/**
 * Clarifications génériques — réponses = UserFact distincts.
 * Ne réécrit jamais le contenu documentaire.
 */

import type {
  GenericClarificationQuestion,
  GenericDocumentFact,
  GenericUserFact
} from "./types.js";

let qSeq = 0;
let uSeq = 0;

export function resetGenericClarificationIdsForTests(): void {
  qSeq = 0;
  uSeq = 0;
}

/**
 * Si une info importante est ambiguë, propose une clarification prudente.
 */
export function buildGenericClarifications(
  facts: readonly GenericDocumentFact[]
): GenericClarificationQuestion[] {
  const out: GenericClarificationQuestion[] = [];
  for (const f of facts) {
    if (!f.roleAmbiguous) continue;
    if (f.kind === "date" || (f.kind === "deadline" && f.roleAmbiguous)) {
      qSeq += 1;
      out.push({
        questionId: `gq-date-${qSeq}`,
        relatedFactId: f.id,
        prompt: "Savez-vous à quoi correspond cette date ?",
        reason: `Le document contient la date ${f.rawValue}, mais son rôle n’est pas suffisamment clair.`,
        expectedAnswerType: "text"
      });
    } else if (f.kind === "amount") {
      qSeq += 1;
      out.push({
        questionId: `gq-amount-${qSeq}`,
        relatedFactId: f.id,
        prompt: "Savez-vous à quoi correspond ce montant ?",
        reason: `Le document contient le montant ${f.rawValue}, mais son rôle n’est pas suffisamment clair.`,
        expectedAnswerType: "text"
      });
    }
  }
  return out;
}

/**
 * Applique une réponse utilisateur → GenericUserFact.
 * Les GenericDocumentFact restent inchangés.
 */
export function applyGenericClarificationAnswer(input: {
  question: GenericClarificationQuestion;
  answer: string;
  existingDocumentFacts: readonly GenericDocumentFact[];
}): {
  userFact: GenericUserFact;
  documentFactsUnchanged: GenericDocumentFact[];
} {
  uSeq += 1;
  const raw = String(input.answer || "").trim();
  const userFact: GenericUserFact = {
    kind: "user",
    factId: `guser-${uSeq}`,
    questionId: input.question.questionId,
    relatedFactId: input.question.relatedFactId,
    answer: raw,
    rawAnswer: raw,
    normalizedValue: raw || null,
    source: "clarification",
    answeredAt: null,
    sequence: uSeq
  };

  // Copie défensive — aucune réécriture rétroactive
  const documentFactsUnchanged = input.existingDocumentFacts.map((f) => ({
    ...f,
    evidence: f.evidence.map((e) => ({ ...e }))
  }));

  return { userFact, documentFactsUnchanged };
}
