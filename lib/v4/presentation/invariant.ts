/**
 * Invariants anti-hallucination V4-H.
 */

import type {
  PresentationItem,
  UserPresentation
} from "../types/userPresentation.js";
import type { DocumentExplanation } from "../types/documentExplanation.js";

function itemHasSource(item: PresentationItem): boolean {
  return item.sourceFacts.length > 0;
}

function isAffirmative(item: PresentationItem): boolean {
  if (item.status === "noExplicitActionDetected") return false;
  if (item.status === "missing" || item.status === "notApplicable") return false;
  return Boolean(item.text && item.text.length > 0);
}

export function countUnsupportedPresentationFacts(
  presentation: Omit<
    UserPresentation,
    | "unsupportedPresentationFacts"
    | "inventedActions"
    | "inventedDeadlines"
    | "inventedAmounts"
    | "inventedReasons"
  >
): {
  unsupportedPresentationFacts: number;
  inventedActions: number;
  inventedDeadlines: number;
  inventedAmounts: number;
  inventedReasons: number;
} {
  let unsupported = 0;
  const check = (item: PresentationItem | null | undefined) => {
    if (!item) return;
    if (!isAffirmative(item)) return;
    if (!itemHasSource(item)) {
      unsupported += 1;
      return;
    }
    // Preuve requise sauf formulation d'identité type-only / info secondaire signalée
    if (
      item.evidence.length === 0 &&
      item.status !== "info" &&
      !item.sourceFacts.includes("documentType")
    ) {
      unsupported += 1;
    }
  };

  // identity : source documentType toujours OK
  if (
    presentation.documentIdentity.text &&
    presentation.documentIdentity.sourceFacts.length === 0
  ) {
    unsupported += 1;
  }

  for (const i of presentation.essential) check(i);
  for (const i of presentation.actions) check(i);
  check(presentation.reason);
  for (const i of presentation.importantDates) check(i);
  for (const i of presentation.importantAmounts) check(i);
  for (const i of presentation.warnings) check(i);
  for (const i of presentation.secondaryInformation) check(i);

  return {
    unsupportedPresentationFacts: unsupported,
    inventedActions: 0, // calculé dans builder vs explanation
    inventedDeadlines: 0,
    inventedAmounts: 0,
    inventedReasons: 0
  };
}

export function countInventions(
  presentation: UserPresentation,
  explanation: DocumentExplanation
): {
  inventedActions: number;
  inventedDeadlines: number;
  inventedAmounts: number;
  inventedReasons: number;
} {
  let inventedActions = 0;
  let inventedDeadlines = 0;
  let inventedAmounts = 0;
  let inventedReasons = 0;

  const explActionDescs = new Set(
    explanation.actions
      .filter((a) => a.status !== "noExplicitActionDetected" && a.description)
      .map((a) => a.description!.toLowerCase())
  );
  for (const a of presentation.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    // Action utilisateur → ExplanationAction ; info prélèvement → secondary/action supportée
    const ok =
      a.sourceFacts.some((s) => s.startsWith("action:")) ||
      (a.kind === "prelevementInfo" &&
        a.sourceFacts.some(
          (s) =>
            s.startsWith("secondary:paymentInformation") ||
            s.startsWith("action:")
        ) &&
        a.evidence.length > 0);
    if (!ok) inventedActions += 1;
  }

  for (const d of presentation.importantDates) {
    const ok = d.sourceFacts.some((s) => {
      const field = s.split(":")[0];
      return (
        explanation.deadlines.some((x) => x.field === field || x.kind === field) ||
        explanation.importantFacts.some(
          (x) =>
            (x.field === field || x.kind === field) &&
            /date|deadline|period/i.test(x.field)
        )
      );
    });
    if (!ok) inventedDeadlines += 1;
  }

  for (const m of presentation.importantAmounts) {
    if (
      !m.sourceFacts.some((s) =>
        explanation.amounts.some((x) => x.field === s || x.kind === s)
      )
    ) {
      inventedAmounts += 1;
    }
  }

  if (presentation.reason) {
    const hasPurpose = explanation.summaryFacts.some(
      (f) => f.field === "purpose" && (f.status === "supported" || f.status === "derived")
    );
    if (!hasPurpose) inventedReasons += 1;
  }

  // unused but keep for potential fuzzy match
  void explActionDescs;

  return {
    inventedActions,
    inventedDeadlines,
    inventedAmounts,
    inventedReasons
  };
}

export function presentationInvariantsHold(
  presentation: UserPresentation
): string[] {
  const errors: string[] = [];
  if (presentation.unsupportedPresentationFacts !== 0) {
    errors.push(
      `unsupportedPresentationFacts=${presentation.unsupportedPresentationFacts}`
    );
  }
  if (presentation.inventedActions !== 0) {
    errors.push(`inventedActions=${presentation.inventedActions}`);
  }
  if (presentation.inventedDeadlines !== 0) {
    errors.push(`inventedDeadlines=${presentation.inventedDeadlines}`);
  }
  if (presentation.inventedAmounts !== 0) {
    errors.push(`inventedAmounts=${presentation.inventedAmounts}`);
  }
  if (presentation.inventedReasons !== 0) {
    errors.push(`inventedReasons=${presentation.inventedReasons}`);
  }
  for (const s of presentation.secondaryInformation) {
    if (s.kind === "bankStatement" || s.label === "bankStatement") {
      errors.push("secondary:bankStatementForbidden");
    }
  }
  return errors;
}
