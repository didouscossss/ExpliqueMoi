/**
 * Conflits explicites — jamais résolus arbitrairement.
 */

import type {
  CandidateDocumentFact,
  DocumentInstance,
  FactConflict
} from "../../../../types/knowledge.js";

export function detectFactConflicts(
  documents: readonly DocumentInstance[],
  facts: readonly CandidateDocumentFact[]
): FactConflict[] {
  const conflicts: FactConflict[] = [];

  const yearsByField = new Map<string, CandidateDocumentFact[]>();
  for (const f of facts) {
    if (!f.fieldCode || f.year == null) continue;
    const list = yearsByField.get(f.fieldCode) || [];
    list.push(f);
    yearsByField.set(f.fieldCode, list);
  }
  for (const [code, list] of yearsByField) {
    const years = [...new Set(list.map((f) => f.year))];
    if (years.length > 1) {
      conflicts.push({
        conflictId: `conflict-year-${code}-${[...years].sort().join("-")}`,
        kind: "year",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs années différentes ont été trouvées pour la case ${code} (${years.join(", ")}).`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }

  const amountsByKey = new Map<string, CandidateDocumentFact[]>();
  for (const f of facts) {
    if (!f.fieldCode) continue;
    if (f.factType !== "fieldValue" && f.factType !== "amount") continue;
    if (f.value == null && f.displayValue == null) continue;
    const key = `${f.fieldCode}|${f.year ?? "?"}|${f.declarantRole ?? "?"}`;
    const list = amountsByKey.get(key) || [];
    list.push(f);
    amountsByKey.set(key, list);
  }
  for (const [key, list] of amountsByKey) {
    const nums = [
      ...new Set(
        list
          .map((f) => normalizeAmount(f.displayValue ?? f.value))
          .filter((n): n is number => n != null)
      )
    ];
    if (nums.length > 1) {
      const code = key.split("|")[0];
      conflicts.push({
        conflictId: `conflict-amount-${key.replace(/\|/g, "_")}`,
        kind: "amount",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs informations différentes ont été trouvées pour ${code} (${nums.join(" / ")}).`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }

  const rolesByCode = new Map<string, CandidateDocumentFact[]>();
  for (const f of facts) {
    if (!f.fieldCode || !f.declarantRole || f.declarantRole === "household") {
      continue;
    }
    const list = rolesByCode.get(f.fieldCode) || [];
    list.push(f);
    rolesByCode.set(f.fieldCode, list);
  }
  for (const [code, list] of rolesByCode) {
    const roles = [...new Set(list.map((f) => f.declarantRole))];
    if (roles.length > 1) {
      conflicts.push({
        conflictId: `conflict-role-${code}`,
        kind: "role",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs rôles déclarants différents apparaissent pour ${code}.`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }

  for (const d of documents) {
    for (const field of d.detectedFields) {
      if (field.presence !== "presentEmpty") continue;
      const others = facts.filter(
        (f) =>
          f.fieldCode === field.normalizedCode &&
          f.sourceDocumentId !== d.documentId &&
          f.displayValue
      );
      if (!others.length) continue;
      conflicts.push({
        conflictId: `conflict-empty-${field.normalizedCode}-${d.documentId}`,
        kind: "emptyVsValue",
        documentIds: [d.documentId, ...uniqueDocIds(others)],
        factIds: others.map((o) => o.factId),
        description: `La case ${field.normalizedCode} est vide dans un document mais une valeur apparaît dans un autre.`,
        evidence: others.flatMap((o) => o.evidence || []).slice(0, 3)
      });
    }
  }

  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.conflictId)) return false;
    seen.add(c.conflictId);
    return true;
  });
}

function uniqueDocIds(list: readonly CandidateDocumentFact[]): string[] {
  return [
    ...new Set(list.map((f) => f.sourceDocumentId || "").filter(Boolean))
  ] as string[];
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  const n = Number(cleaned.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
