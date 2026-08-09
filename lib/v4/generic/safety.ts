/**
 * Compteurs de sécurité V4-Y — détectent inventions / promotions interdites.
 */

import type { LocalExplanation } from "../types/knowledge.js";
import type {
  GenericDocumentFact,
  GenericDocumentTypeId,
  GenericSafetyInvariants
} from "./types.js";

const OBLIGATION_RE =
  /\b(vous\s+devez|montant\s+[àa]\s+payer|montant\s+d[uû]|dette|pr[eé]l[eè]vement\s+obligatoire)\b/i;
const AMOUNT_MEANING_RE =
  /\b(montant\s+[àa]\s+payer|montant\s+d[uû]|dette|somme\s+due)\b/i;
const DEADLINE_INVENT_RE =
  /\b(date\s+limite\s+invent|deadline\s+invent|vous\s+devez\s+avant)\b/i;

export function emptyGenericSafety(): GenericSafetyInvariants {
  return {
    implicitDocumentObligation: 0,
    implicitAmountMeaning: 0,
    implicitDeadlineMeaning: 0,
    unsupportedDocumentClassification: 0,
    genericFactPromotedToDomainFact: 0,
    genericFactPromotedToEligibility: 0,
    genericFactPromotedToDeclaration: 0,
    unsourcedGenericExplanation: 0
  };
}

export function auditGenericSafety(input: {
  facts: readonly GenericDocumentFact[];
  explanations: readonly LocalExplanation[];
  documentType: GenericDocumentTypeId;
  documentTypeEvidence: readonly string[];
  taxRulesTriggered?: number;
  taxCalculations?: number;
}): GenericSafetyInvariants {
  const safety = emptyGenericSafety();

  for (const f of input.facts) {
    // Montant sans rôle → ne doit pas porter un label d'obligation
    if (f.kind === "amount") {
      if (AMOUNT_MEANING_RE.test(f.label) && (f.roleAmbiguous || !f.structuralRole)) {
        safety.implicitAmountMeaning += 1;
      }
    }
    // Date isolée ne doit pas être kind=deadline
    if (f.kind === "deadline" && f.roleAmbiguous) {
      safety.implicitDeadlineMeaning += 1;
    }
    if (f.kind === "deadline" && !hasDeadlineEvidence(f)) {
      safety.implicitDeadlineMeaning += 1;
    }
  }

  for (const e of input.explanations) {
    const blob = [e.summary, ...e.details, ...e.why].join(" ");
    if (OBLIGATION_RE.test(blob)) {
      safety.implicitDocumentObligation += 1;
    }
    if (AMOUNT_MEANING_RE.test(blob)) {
      // Autorisé seulement si un fait non ambigu le porte avec preuve
      const hasExplicit = input.facts.some(
        (f) =>
          f.kind === "amount" &&
          !f.roleAmbiguous &&
          f.structuralRole === "amountDue" &&
          AMOUNT_MEANING_RE.test(f.label)
      );
      if (!hasExplicit) safety.implicitAmountMeaning += 1;
    }
    if (!e.sourceFacts.length && e.status === "explained") {
      safety.unsourcedGenericExplanation += 1;
    }
    if (e.domain === "fiscal") {
      // Une explication générique ne doit pas se présenter comme fiscale
      safety.genericFactPromotedToDomainFact += 1;
    }
    if (DEADLINE_INVENT_RE.test(blob)) {
      safety.implicitDeadlineMeaning += 1;
    }
  }

  if (
    input.documentType !== "unknown" &&
    (!input.documentTypeEvidence || input.documentTypeEvidence.length === 0)
  ) {
    safety.unsupportedDocumentClassification += 1;
  }

  // Promotions domaine (éligibilité / déclaration) — toujours 0 hors module fiscal
  if ((input.taxRulesTriggered || 0) > 0) {
    // Pas un compteur de promotion, mais on n'incrémente pas ici ;
    // les tests vérifient taxRulesTriggered séparément.
  }

  return safety;
}

function hasDeadlineEvidence(f: GenericDocumentFact): boolean {
  if (f.structuralRole === "deadline" || f.structuralRole === "dueDate") {
    return true;
  }
  const raw = `${f.label} ${f.rawValue}`.toLowerCase();
  return /date\s+limite|au\s+plus\s+tard|avant\s+le|échéance\s*:/.test(raw);
}

/** Vérifie qu’aucun compteur n’est > 0. */
export function assertGenericSafetyClean(
  safety: GenericSafetyInvariants
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [k, v] of Object.entries(safety)) {
    if (typeof v === "number" && v !== 0) {
      violations.push(`${k}=${v}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
