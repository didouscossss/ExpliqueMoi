/**
 * Index de faits documentaires pour cross-matching requirements — V4-Q.
 * Travaille sur DocumentFacts / faits déjà disponibles — pas de persistance distante.
 */

import type {
  CandidateDocumentFact,
  DetectedTaxField,
  TaxFieldDeclarantRole
} from "../../../../../types/knowledge.js";
import type { EvidenceSpan } from "../../../../../types/evidence.js";

export interface IndexedAnalyzedDocument {
  id: string;
  label: string;
  documentType?: string | null;
  year?: number | null;
  text?: string | null;
  detectedFields?: DetectedTaxField[];
  /** Faits libres déjà extraits (montants, années, etc.). */
  looseFacts?: Array<{
    factType: string;
    value: unknown;
    displayValue?: string | null;
    year?: number | null;
    declarantRole?: TaxFieldDeclarantRole | null;
    fieldCode?: string | null;
    confidence?: number;
    evidence?: EvidenceSpan[];
    keywords?: string[];
  }>;
}

let factSeq = 0;

function nextFactId(prefix: string): string {
  factSeq += 1;
  return `${prefix}-${factSeq}`;
}

export function resetRequirementFactIdsForTests(): void {
  factSeq = 0;
}

/** Construit un index plat de candidats à partir de documents analysés. */
export function buildDocumentFactIndex(
  documents: readonly IndexedAnalyzedDocument[]
): CandidateDocumentFact[] {
  const out: CandidateDocumentFact[] = [];

  for (const doc of documents) {
    const yearFromText = extractYear(doc.text || "");
    const docYear = doc.year ?? yearFromText;

    if (docYear != null) {
      out.push({
        factId: nextFactId("year"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || null,
        factType: "fiscalYear",
        value: docYear,
        displayValue: String(docYear),
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: doc.year != null ? 0.9 : 0.7,
        evidence: textEvidence(doc.text, String(docYear)),
        provenanceNote: "Année détectée dans le document analysé"
      });
    }

    // Présence documentaire typée
    if (doc.documentType) {
      out.push({
        factId: nextFactId("doc"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType,
        factType: "documentPresence",
        value: doc.documentType,
        displayValue: doc.label,
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: 0.85,
        evidence: textEvidence(doc.text, doc.label.slice(0, 40)),
        provenanceNote: "Type de document analysé"
      });
    }

    for (const field of doc.detectedFields || []) {
      if (
        field.presence === "presentWithValue" &&
        field.detectedValue != null
      ) {
        out.push({
          factId: nextFactId(`field-${field.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "fieldValue",
          value:
            field.detectedNumericValue != null
              ? field.detectedNumericValue
              : field.detectedValue,
          displayValue: field.detectedValue,
          year: field.yearHint ?? docYear,
          declarantRole: inferRoleFromCode(field.normalizedCode),
          fieldCode: field.normalizedCode,
          confidence: field.confidence,
          evidence: field.evidence || [],
          provenanceNote: `Valeur documentaire associée à la case ${field.normalizedCode}`
        });
      } else if (field.presence === "ambiguous") {
        for (const c of field.candidateValues || []) {
          out.push({
            factId: nextFactId(`amb-${field.normalizedCode}`),
            sourceDocumentId: doc.id,
            sourceDocumentLabel: doc.label,
            documentType: doc.documentType || null,
            factType: "amount",
            value: c.value,
            displayValue: c.value,
            year: field.yearHint ?? docYear,
            declarantRole: inferRoleFromCode(field.normalizedCode),
            fieldCode: field.normalizedCode,
            confidence: Math.min(c.confidence, 0.55),
            evidence: field.evidence || [],
            provenanceNote: `Montant candidat ambigu près de la case ${field.normalizedCode}`
          });
        }
      } else if (field.presence === "presentEmpty") {
        out.push({
          factId: nextFactId(`empty-${field.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "fieldValue",
          value: null,
          displayValue: null,
          year: field.yearHint ?? docYear,
          declarantRole: inferRoleFromCode(field.normalizedCode),
          fieldCode: field.normalizedCode,
          confidence: field.confidence,
          evidence: field.evidence || [],
          provenanceNote: `Case ${field.normalizedCode} présente sans valeur`
        });
      }

      // Rôle détectable via libellé
      const role = inferRoleFromCode(field.normalizedCode);
      if (role && role !== "household" && role !== "unknown") {
        out.push({
          factId: nextFactId(`role-${field.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "declarantRole",
          value: role,
          displayValue: role,
          year: field.yearHint ?? docYear,
          declarantRole: role,
          fieldCode: field.normalizedCode,
          confidence: 0.8,
          evidence: field.evidence || [],
          provenanceNote: "Rôle fiscal associé à la case selon le registre"
        });
      }
    }

    for (const loose of doc.looseFacts || []) {
      out.push({
        factId: nextFactId(`loose-${loose.factType}`),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || null,
        factType: loose.factType,
        value: loose.value,
        displayValue:
          loose.displayValue ??
          (loose.value == null ? null : String(loose.value)),
        year: loose.year ?? docYear,
        declarantRole: loose.declarantRole ?? null,
        fieldCode: loose.fieldCode ?? null,
        confidence: loose.confidence ?? 0.6,
        evidence: loose.evidence || textEvidence(doc.text, String(loose.value ?? "")),
        provenanceNote: "Fait documentaire indexé"
      });
    }

    // Heuristique prudente : attestation fiscale mentionnée
    const text = (doc.text || "").toLowerCase();
    if (
      /attestation\s+fiscale|cesu|emploi\s+[àa]\s+domicile|services?\s+[àa]\s+la\s+personne/.test(
        text
      )
    ) {
      const amountMatch = text.match(
        /(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{2})?)\s*€/
      );
      out.push({
        factId: nextFactId("attestation"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || "taxCertificate",
        factType: "taxCertificate",
        value: amountMatch ? amountMatch[1] : "attestation",
        displayValue: amountMatch ? `${amountMatch[1]} €` : doc.label,
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: 0.65,
        evidence: textEvidence(doc.text, amountMatch?.[0] || "attestation fiscale"),
        provenanceNote:
          "Document analysé mentionnant une attestation / emploi à domicile"
      });
    }
  }

  return out;
}

function extractYear(text: string): number | null {
  const m = text.match(
    /(?:revenus?\s+de\s+l['’]?année|année|exercice|millésime)\s*(20\d{2})/i
  );
  if (m) return Number(m[1]);
  const bare = text.match(/\b(202[4-6])\b/);
  return bare ? Number(bare[1]) : null;
}

function textEvidence(text: string | null | undefined, needle: string): EvidenceSpan[] {
  if (!text || !needle) return [];
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) {
    return [
      {
        page: 1,
        text: text.slice(0, 80)
      }
    ];
  }
  return [
    {
      page: 1,
      text: text.slice(Math.max(0, idx - 20), idx + needle.length + 20)
    }
  ];
}

function inferRoleFromCode(code: string): TaxFieldDeclarantRole | null {
  if (/^[123]A[A-Z]$/.test(code) || code === "1AJ" || code === "1AS" || code === "1AP" || code === "1AK" || code === "1AF") {
    return "declarant1";
  }
  if (code === "1BJ" || code === "1BS" || code === "1BP" || code === "1BK") {
    return "declarant2";
  }
  if (code === "1CJ" || code === "1CS") return "dependent1";
  if (code === "1DJ" || code === "1DS") return "dependent2";
  if (/^[2478]/.test(code)) return "household";
  return "unknown";
}
