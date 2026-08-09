/**
 * Explication déterministe des faits documentaires / utilisateur — V4-X.
 * Read-only : ne modifie aucun fait.
 */

import type {
  CandidateDocumentFact,
  CaseCentricFieldView,
  LocalExplanationSourceFact,
  UserProvidedFact
} from "../types/knowledge.js";

export function collectSourceFactsForSubject(input: {
  subject: string;
  facts: readonly CandidateDocumentFact[];
  userFacts?: readonly UserProvidedFact[];
  view?: CaseCentricFieldView | null;
}): {
  sourceFacts: LocalExplanationSourceFact[];
  foundSummary: string | null;
  details: string[];
} {
  const code = input.subject.toUpperCase();
  const sourceFacts: LocalExplanationSourceFact[] = [];
  const details: string[] = [];

  const docFacts = input.facts.filter(
    (f) => (f.fieldCode || "").toUpperCase() === code
  );
  for (const f of docFacts) {
    const value =
      f.displayValue != null
        ? String(f.displayValue)
        : f.value != null
          ? String(f.value)
          : null;
    sourceFacts.push({
      kind: "document",
      id: f.factId,
      label: `Information trouvée pour ${code}`,
      value,
      fieldCode: code,
      documentId: f.sourceDocumentId || null
    });
    if (value != null) {
      details.push(
        `Le document indique ${formatValue(value, f)} associé à la case ${code}.`
      );
    } else {
      details.push(`La case ${code} est mentionnée dans le document sans montant exploitable.`);
    }
  }

  for (const u of input.userFacts || []) {
    if ((u.fieldCode || "").toUpperCase() !== code) continue;
    if (u.active === false) continue;
    if (u.answerStatus !== "accepted") continue;
    const value =
      u.normalizedValue != null
        ? String(u.normalizedValue)
        : u.answer != null
          ? String(u.answer)
          : null;
    // Skip pure boolean exclusion confirmations from "montant trouvé"
    if (u.valueType === "boolean" || typeof u.normalizedValue === "boolean") {
      sourceFacts.push({
        kind: "user",
        id: u.factId || u.questionId,
        label: "Précision fournie par vous",
        value: value,
        fieldCode: code,
        documentId: null
      });
      details.push("Une précision fournie par vous a été prise en compte.");
      continue;
    }
    sourceFacts.push({
      kind: "user",
      id: u.factId || u.questionId,
      label: "Information fournie par vous",
      value,
      fieldCode: code,
      documentId: null
    });
    if (value != null) {
      details.push(`Vous avez indiqué ${value} pour ${code}.`);
    }
  }

  let foundSummary: string | null = null;
  const amountLike = sourceFacts.find(
    (s) =>
      s.kind === "document" &&
      s.value != null &&
      /\d/.test(s.value) &&
      s.label.includes("Information trouvée")
  );
  if (amountLike?.value != null) {
    foundSummary = `Le document indique ${amountLike.value}${
      /€/.test(amountLike.value) ? "" : " €"
    } dans la case ${code}.`.replace(" € €", " €");
  } else if (input.view?.foundByDocument?.length) {
    foundSummary = `Des éléments liés à ${code} ont été repérés dans le dossier.`;
  } else if (!sourceFacts.length) {
    foundSummary = null;
  }

  return { sourceFacts, foundSummary, details: [...new Set(details)] };
}

function formatValue(value: string, f: CandidateDocumentFact): string {
  if (/€/.test(value)) return value;
  if (typeof f.value === "number") return `${f.value} €`;
  if (/^\d/.test(value.replace(/\s/g, ""))) return `${value} €`;
  return value;
}
