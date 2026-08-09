/**
 * Questions déterministes dérivées des requirements — 0 LLM.
 */

import type {
  EvaluatedRequirement,
  InformationRequirement,
  RequirementPriority,
  TaxFieldQuestion
} from "../../../../../types/knowledge.js";

const PRIORITY_ORDER: Record<RequirementPriority, number> = {
  blocking: 1,
  ambiguity: 2,
  yearUnknown: 3,
  declarantUnknown: 4,
  supportingDocument: 5,
  secondary: 6
};

export const MAX_PRIORITY_QUESTIONS = 3;

export function buildTaxFieldQuestions(
  requirements: readonly InformationRequirement[],
  evaluated: readonly EvaluatedRequirement[]
): TaxFieldQuestion[] {
  const byId = new Map(evaluated.map((e) => [e.requirementId, e]));
  const questions: TaxFieldQuestion[] = [];

  for (const req of requirements) {
    if (!req.questionTemplate || !req.expectedAnswerType) continue;
    const ev = byId.get(req.id);
    if (!ev) continue;

    // Ne poser que si l’info manque, est ambiguë, ou non vérifiée
    if (
      ev.status !== "missing" &&
      ev.status !== "ambiguous" &&
      ev.status !== "notChecked" &&
      ev.status !== "unknown"
    ) {
      continue;
    }

    let priority = req.priority;
    if (ev.status === "ambiguous") priority = "ambiguity";

    questions.push({
      requirementId: req.id,
      question: req.questionTemplate,
      expectedAnswerType: req.expectedAnswerType,
      reason: reasonFor(ev),
      priority,
      provenance: req.provenance || []
    });
  }

  return sortQuestions(questions);
}

export function selectPriorityQuestions(
  questions: readonly TaxFieldQuestion[],
  max: number = MAX_PRIORITY_QUESTIONS
): TaxFieldQuestion[] {
  return sortQuestions([...questions]).slice(0, max);
}

function sortQuestions(questions: TaxFieldQuestion[]): TaxFieldQuestion[] {
  return [...questions].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] || 99) - (PRIORITY_ORDER[b.priority] || 99)
  );
}

function reasonFor(ev: EvaluatedRequirement): string {
  switch (ev.status) {
    case "missing":
      return "Cette information n’a pas été retrouvée dans les éléments analysés.";
    case "ambiguous":
      return "Plusieurs éléments candidats ont été détectés ; une précision serait utile.";
    case "notChecked":
      return "Cette information n’a pas encore été confrontée aux documents analysés.";
    default:
      return "Une précision permettrait de mieux comprendre cette case.";
  }
}
