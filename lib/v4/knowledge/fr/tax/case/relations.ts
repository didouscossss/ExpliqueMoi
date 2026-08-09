/**
 * Relations inter-documents — jamais une obligation fiscale.
 */

import type {
  DocumentInstance,
  DocumentRelation,
  CaseYearRelation
} from "../../../../types/knowledge.js";

const RELATED_FORMS: Record<string, string[]> = {
  "2042": ["2042-RICI", "2042-C", "2044", "2047"],
  "2042-RICI": ["2042", "2042-C"],
  "2044": ["2042"],
  "2047": ["2042"],
  "2042-C": ["2042", "2042-RICI"]
};

export function buildDocumentRelations(
  documents: readonly DocumentInstance[]
): DocumentRelation[] {
  const relations: DocumentRelation[] = [];
  const sorted = [...documents].sort((a, b) =>
    a.documentId.localeCompare(b.documentId)
  );

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      relations.push(...relatePair(a, b));
    }
  }

  return relations.sort((x, y) => x.relationId.localeCompare(y.relationId));
}

function isNonFiscalNoise(d: DocumentInstance): boolean {
  const blob = `${d.detectedType || ""} ${d.recognitionLabel || ""} ${d.fileName || ""}`.toLowerCase();
  return /invoice|facture/.test(blob);
}

function relatePair(
  a: DocumentInstance,
  b: DocumentInstance
): DocumentRelation[] {
  const out: DocumentRelation[] = [];
  if (isNonFiscalNoise(a) || isNonFiscalNoise(b)) {
    // Pas de relation fiscale automatique depuis une facture FP
    return out;
  }
  const yearRel = yearRelation(a.fiscalYear, b.fiscalYear);

  if (
    a.fiscalYear != null &&
    b.fiscalYear != null &&
    a.fiscalYear === b.fiscalYear
  ) {
    out.push(
      rel(a, b, "sameFiscalYear", 0.85, yearRel, `Même année fiscale ${a.fiscalYear}`)
    );
  }

  const ra = a.detectedReference;
  const rb = b.detectedReference;
  if (ra && rb && (RELATED_FORMS[ra]?.includes(rb) || RELATED_FORMS[rb]?.includes(ra))) {
    out.push(
      rel(
        a,
        b,
        "relatedTaxForm",
        0.8,
        yearRel,
        `Formulaires potentiellement liés : ${ra} ↔ ${rb}`
      )
    );
  }

  // Supporting document heuristics
  const aIsCert = /certificate|attestation|taxCertificate/i.test(
    a.detectedType || a.recognitionLabel || ""
  );
  const bIsCert = /certificate|attestation|taxCertificate/i.test(
    b.detectedType || b.recognitionLabel || ""
  );
  const aIsReturn = /2042|incomeTaxReturn|taxForm/i.test(
    `${a.detectedReference || ""} ${a.detectedType || ""}`
  );
  const bIsReturn = /2042|incomeTaxReturn|taxForm/i.test(
    `${b.detectedReference || ""} ${b.detectedType || ""}`
  );

  if ((aIsCert && bIsReturn) || (bIsCert && aIsReturn)) {
    const fieldHint = findSharedFieldHint(a, b) || "7DB";
    out.push(
      rel(
        aIsCert ? a : b,
        aIsCert ? b : a,
        "possibleSupportingDocument",
        yearRel === "yearMismatch" ? 0.35 : 0.7,
        yearRel,
        "Document potentiellement justificatif d’une déclaration — aucune obligation de report.",
        fieldHint
      )
    );
  }

  // Field evidence: field on form + amount on other doc
  for (const field of a.detectedFields) {
    if (!field.normalizedCode) continue;
    const otherHasAmount = b.facts.some(
      (f) =>
        (f.factType === "amount" || f.factType === "taxCertificate") &&
        f.displayValue
    );
    if (otherHasAmount && /7DB|7DR|4BA|1AJ|1BJ/i.test(field.normalizedCode)) {
      out.push(
        rel(
          b,
          a,
          "possibleFieldEvidence",
          yearRel === "yearMismatch" ? 0.3 : 0.65,
          yearRel,
          `Information potentiellement pertinente pour la case ${field.normalizedCode}.`,
          field.normalizedCode
        )
      );
    }
  }
  for (const field of b.detectedFields) {
    if (!field.normalizedCode) continue;
    const otherHasAmount = a.facts.some(
      (f) =>
        (f.factType === "amount" || f.factType === "taxCertificate") &&
        f.displayValue
    );
    if (otherHasAmount && /7DB|7DR|4BA|1AJ|1BJ/i.test(field.normalizedCode)) {
      out.push(
        rel(
          a,
          b,
          "possibleFieldEvidence",
          yearRel === "yearMismatch" ? 0.3 : 0.65,
          yearRel,
          `Information potentiellement pertinente pour la case ${field.normalizedCode}.`,
          field.normalizedCode
        )
      );
    }
  }

  // Same declarant role signals
  const rolesA = new Set(
    a.facts.map((f) => f.declarantRole).filter(Boolean)
  );
  const rolesB = new Set(
    b.facts.map((f) => f.declarantRole).filter(Boolean)
  );
  for (const role of rolesA) {
    if (role && role !== "unknown" && role !== "household" && rolesB.has(role)) {
      out.push(
        rel(
          a,
          b,
          "sameDeclarant",
          0.6,
          yearRel,
          `Même rôle fiscal potentiel (${role}) — pas de fusion automatique des faits.`
        )
      );
      break;
    }
  }

  return out;
}

function yearRelation(
  a: number | null,
  b: number | null
): CaseYearRelation {
  if (a == null || b == null) return "yearUnknown";
  if (a === b) return "sameYear";
  return "yearMismatch";
}

function findSharedFieldHint(
  a: DocumentInstance,
  b: DocumentInstance
): string | null {
  const codes = new Set(a.detectedFields.map((f) => f.normalizedCode));
  for (const f of b.detectedFields) {
    if (codes.has(f.normalizedCode)) return f.normalizedCode;
  }
  return null;
}

function rel(
  from: DocumentInstance,
  to: DocumentInstance,
  type: DocumentRelation["relationType"],
  confidence: number,
  yearRel: CaseYearRelation,
  reason: string,
  fieldCodeHint?: string | null
): DocumentRelation {
  const [fromId, toId] =
    from.documentId < to.documentId
      ? [from.documentId, to.documentId]
      : [to.documentId, from.documentId];
  // Keep semantic direction in reason; id canonical for determinism
  return {
    relationId: `rel-${type}-${fromId}-${toId}-${fieldCodeHint || "x"}`,
    fromDocumentId: from.documentId,
    toDocumentId: to.documentId,
    relationType: type,
    confidence,
    evidence: [
      {
        page: 1,
        text: `${from.fileName || from.documentId} ↔ ${to.fileName || to.documentId}`
      }
    ],
    reason,
    fieldCodeHint: fieldCodeHint || null,
    yearRelation: yearRel
  };
}
