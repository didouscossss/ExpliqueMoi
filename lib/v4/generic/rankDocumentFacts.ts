/**
 * Importance documentaire déterministe et auditable.
 * Pas de scoring opaque / ML.
 */

import type {
  GenericDocumentFact,
  GenericFactImportance,
  GenericFactKind
} from "./types.js";

/** Table auditable kind → importance par défaut. */
export const GENERIC_IMPORTANCE_BY_KIND: Record<
  GenericFactKind,
  GenericFactImportance
> = {
  deadline: "important",
  reference: "important",
  amount: "important",
  organization: "normal",
  documentTitle: "normal",
  date: "normal",
  person: "normal",
  address: "normal",
  contact: "normal",
  period: "normal",
  informationalText: "context",
  unknown: "context"
};

export function importanceForKind(kind: GenericFactKind): GenericFactImportance {
  return GENERIC_IMPORTANCE_BY_KIND[kind] || "context";
}

/** Applique l’importance structurée (mutatif local via copie). */
export function rankDocumentFacts(
  facts: readonly GenericDocumentFact[]
): GenericDocumentFact[] {
  return facts.map((f) => ({
    ...f,
    importance: importanceForKind(f.kind)
  }));
}

/** Faits importants dans un ordre stable (kind puis id). */
export function extractImportantFacts(
  facts: readonly GenericDocumentFact[]
): GenericDocumentFact[] {
  return facts
    .filter((f) => f.importance === "important")
    .slice()
    .sort((a, b) => {
      const ka = kindOrder(a.kind) - kindOrder(b.kind);
      if (ka !== 0) return ka;
      return a.id.localeCompare(b.id);
    });
}

function kindOrder(kind: GenericFactKind): number {
  const order: GenericFactKind[] = [
    "deadline",
    "amount",
    "reference",
    "organization",
    "documentTitle",
    "date",
    "period",
    "person",
    "address",
    "contact",
    "informationalText",
    "unknown"
  ];
  const i = order.indexOf(kind);
  return i < 0 ? 99 : i;
}
