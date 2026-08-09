/**
 * Projection Preview minimale — CE DOCUMENT / À RETENIR / ÉMIS PAR.
 */

import type { LocalExplanation } from "../types/knowledge.js";
import { formatImportantLine } from "./buildGenericDocumentExplanations.js";
import { extractImportantFacts } from "./rankDocumentFacts.js";
import type {
  GenericDocumentFact,
  GenericDocumentPreview,
  GenericDocumentTypeId,
  GenericSafetyInvariants
} from "./types.js";

export function buildGenericDocumentPreview(input: {
  documentType: GenericDocumentTypeId;
  facts: readonly GenericDocumentFact[];
  explanations: readonly LocalExplanation[];
}): GenericDocumentPreview {
  const titleFact = input.facts.find((f) => f.kind === "documentTitle");
  const org = input.facts.find((f) => f.kind === "organization");
  const important = extractImportantFacts(input.facts);

  const ceDocument =
    (titleFact?.normalizedValue as string) ||
    titleFact?.rawValue ||
    (input.documentType === "renewalNotice"
      ? "Avis de renouvellement"
      : "Document non identifié");

  const aRetenir = important
    .map((f) => formatImportantLine(f))
    .filter((x): x is string => Boolean(x))
    .map((s) => s.replace(/\.$/, ""));

  const pourquoi = important.map((f) => ({
    label: f.label,
    evidence: f.evidence?.[0]?.text || f.rawValue
  }));

  const informationIncertaine = input.facts
    .filter((f) => f.roleAmbiguous)
    .map((f) => {
      if (f.kind === "amount") {
        return `Montant trouvé : ${f.rawValue} (rôle non déterminé)`;
      }
      if (f.kind === "date") {
        return `Date trouvée : ${f.rawValue} (rôle non déterminé)`;
      }
      return `${f.label} : ${f.rawValue}`;
    });

  // Inclure aussi missingInformation des explications
  for (const e of input.explanations) {
    for (const m of e.missingInformation || []) {
      if (!informationIncertaine.includes(m)) informationIncertaine.push(m);
    }
  }

  return {
    ceDocument,
    aRetenir,
    emisPar: org ? String(org.normalizedValue ?? org.rawValue) : null,
    pourquoi,
    informationIncertaine
  };
}

/** JSON snake_case pour Preview / UI. */
export function genericUnderstandingToPreviewJson(input: {
  documentType: GenericDocumentTypeId;
  documentTypeConfidence: number;
  preview: GenericDocumentPreview;
  explanations: readonly LocalExplanation[];
  safety: GenericSafetyInvariants;
  facts: readonly GenericDocumentFact[];
}): Record<string, unknown> {
  return {
    document_type: input.documentType,
    document_type_confidence: input.documentTypeConfidence,
    ce_document: input.preview.ceDocument,
    a_retenir: input.preview.aRetenir,
    emis_par: input.preview.emisPar,
    pourquoi: input.preview.pourquoi,
    information_incertaine: input.preview.informationIncertaine,
    explanations: input.explanations.map((e) => ({
      id: e.id,
      domain: e.domain,
      subject: e.subject,
      title: e.title,
      summary: e.summary,
      details: e.details,
      importance: e.importance,
      status: e.status,
      why: e.why,
      source_facts: e.sourceFacts,
      missing_information: e.missingInformation,
      limits: e.limits
    })),
    facts: input.facts.map((f) => ({
      id: f.id,
      kind: f.kind,
      label: f.label,
      raw_value: f.rawValue,
      normalized_value: f.normalizedValue,
      importance: f.importance,
      role_ambiguous: Boolean(f.roleAmbiguous),
      structural_role: f.structuralRole || null,
      evidence: f.evidence
    })),
    safety: input.safety
  };
}
