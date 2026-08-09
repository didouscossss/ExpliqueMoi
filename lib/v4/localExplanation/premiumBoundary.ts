/**
 * Frontière Premium future — V4-X.
 * Structure seule. Aucun fetch, aucun LLM, aucun envoi de document.
 */

import type {
  DocumentCase,
  LocalExplanation,
  PremiumExplanationContext
} from "../types/knowledge.js";

/**
 * Construit un contexte structuré sélectionné pour un éventuel enrichissement Premium.
 * N’inclut PAS le document brut. N’appelle aucune API.
 */
export function buildPremiumExplanationContext(
  docCase: DocumentCase,
  selectedSubjects?: readonly string[]
): PremiumExplanationContext {
  const all = docCase.localExplanations || [];
  const selected = selectedSubjects?.length
    ? all.filter((e) =>
        selectedSubjects.map((s) => s.toUpperCase()).includes(e.subject)
      )
    : all.filter((e) => e.importance === "primary" || e.status === "explained");

  return {
    caseId: docCase.caseId || null,
    selectedSubjects: selected.map((e) => e.subject).sort(),
    explanations: selected.map(sanitizeForPremium),
    note:
      "Contexte Premium structuré — aucun appel réseau/LLM en V4-X. Sélection explicite uniquement ; pas de document brut."
  };
}

function sanitizeForPremium(e: LocalExplanation): LocalExplanation {
  // Copie défensive — pas de mutation de l’explication source
  return {
    ...e,
    sourceFacts: e.sourceFacts.map((f) => ({ ...f })),
    ruleRefs: e.ruleRefs.map((r) => ({ ...r })),
    sourceRefs: e.sourceRefs.map((s) => ({ ...s })),
    details: [...e.details],
    missingInformation: [...e.missingInformation],
    why: [...e.why],
    limits: [...e.limits],
    calculation: e.calculation ? { ...e.calculation } : null
  };
}
