/**
 * Invariant anti-hallucination V4-G.
 * Affirmation ⇒ preuve directe OU dérivation dont toutes les entrées ont des preuves.
 */

import type {
  DocumentExplanation,
  ExplanationAction,
  ExplanationFact,
  ExplanationWarning
} from "../types/documentExplanation.js";

function isAffirmativeFact(f: ExplanationFact): boolean {
  if (
    f.status === "missing" ||
    f.status === "notApplicable"
  ) {
    return false;
  }
  return f.value !== undefined && f.value !== null;
}

function factSupported(f: ExplanationFact): boolean {
  if (!isAffirmativeFact(f)) return true;
  if (f.evidence.length > 0) return true;
  // Dérivation : derivedFrom non vide + evidence attendue ailleurs ;
  // sans evidence locale → unsupported
  return false;
}

function actionSupported(a: ExplanationAction): boolean {
  if (a.status === "noExplicitActionDetected") return true;
  if (!a.description) return true;
  return a.evidence.length > 0;
}

function warningSupported(w: ExplanationWarning): boolean {
  // Warning démontrable ⇒ evidence requise
  return w.evidence.length > 0;
}

export function countUnsupportedExplanationFacts(
  explanation: Omit<DocumentExplanation, "unsupportedExplanationFacts">
): number {
  let n = 0;
  const checkFact = (f: ExplanationFact | null | undefined) => {
    if (!f) return;
    if (!factSupported(f)) n += 1;
  };

  checkFact(explanation.title);
  for (const f of explanation.summaryFacts) checkFact(f);
  for (const f of explanation.importantFacts) checkFact(f);
  for (const f of explanation.deadlines) checkFact(f);
  for (const f of explanation.amounts) checkFact(f);
  for (const a of explanation.actions) {
    if (!actionSupported(a)) n += 1;
    if (a.deadline && !factSupported(a.deadline)) n += 1;
  }
  for (const w of explanation.warnings) {
    if (!warningSupported(w)) n += 1;
  }
  // secondaryInformation : signals de contenu — evidence optionnelle si confidence-only
  // On exige evidence si status supported/derived
  for (const s of explanation.secondaryInformation) {
    if (
      (s.status === "supported" || s.status === "derived") &&
      s.evidence.length === 0 &&
      s.signals.length === 0
    ) {
      n += 1;
    }
  }
  return n;
}

export function explanationInvariantsHold(
  explanation: DocumentExplanation
): string[] {
  const errors: string[] = [];
  if (explanation.unsupportedExplanationFacts !== 0) {
    errors.push(
      `unsupportedExplanationFacts=${explanation.unsupportedExplanationFacts}`
    );
  }
  // Secondary sections ne doivent jamais être des DocumentType
  for (const s of explanation.secondaryInformation) {
    if (s.sectionKind === "bankStatement") {
      errors.push("secondaryInformation:bankStatementForbidden");
    }
  }
  return errors;
}
