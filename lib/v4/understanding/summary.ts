/**
 * StructuredSummary — pas de français naturel.
 */

import type {
  ActionUnderstanding,
  DocumentUnderstanding,
  StructuredSummary,
  UnderstandingItem,
  UnderstandingUncertainty,
  UnderstandingWarning
} from "../types/documentUnderstanding.js";

export function buildStructuredSummary(input: {
  purpose: UnderstandingItem;
  identity: DocumentUnderstanding["identity"];
  parties: UnderstandingItem[];
  keyFacts: UnderstandingItem[];
  financialFacts: UnderstandingItem[];
  importantDates: UnderstandingItem[];
  actions: ActionUnderstanding[];
  warnings: UnderstandingWarning[];
  uncertainties: UnderstandingUncertainty[];
}): StructuredSummary {
  const what: UnderstandingItem[] = [];
  if (input.identity.title) what.push(input.identity.title);
  what.push(input.purpose);
  if (input.identity.reference) what.push(input.identity.reference);

  const who = input.parties.filter(
    (p) => p.status === "resolved" || p.status === "ambiguous"
  );

  const why: UnderstandingItem[] = [input.purpose];

  const important = input.keyFacts.filter(
    (k) => k.importance === "critical" || k.importance === "high"
  );

  const explicitActions = input.actions.filter(
    (a) => a.status !== "noExplicitActionDetected"
  );

  const deadlines = [
    ...input.importantDates.filter((d) =>
      /deadline|dueDate|paymentDate|paymentDeadline|actionDeadline/i.test(d.kind)
    ),
    ...explicitActions
      .map((a) => a.deadline)
      .filter((d): d is UnderstandingItem => Boolean(d))
  ];

  // Conserver ambiguïté dans amounts (ne pas aplatir)
  const amounts = input.financialFacts.filter(
    (f) => f.status === "resolved" || f.status === "ambiguous"
  );

  return {
    what,
    who,
    why,
    important,
    actions: explicitActions.length
      ? explicitActions
      : input.actions.filter((a) => a.status === "noExplicitActionDetected"),
    deadlines,
    amounts,
    warnings: input.warnings,
    uncertainties: input.uncertainties
  };
}
