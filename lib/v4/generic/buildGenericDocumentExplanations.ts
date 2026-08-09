/**
 * Explications locales génériques — domain ≠ fiscal.
 * Ne invente aucune obligation / montant dû / deadline.
 */

import type {
  LocalExplanation,
  LocalExplanationSourceFact
} from "../types/knowledge.js";
import { formatDateFR, formatMoneyFR } from "../presentation/format.js";
import { extractImportantFacts } from "./rankDocumentFacts.js";
import type {
  GenericDocumentFact,
  GenericDocumentTypeId,
  GenericNormalizedAmount
} from "./types.js";

let lexSeq = 0;
export function resetGenericExplanationIdsForTests(): void {
  lexSeq = 0;
}

export function buildGenericDocumentExplanations(input: {
  documentId: string;
  documentType: GenericDocumentTypeId;
  facts: readonly GenericDocumentFact[];
}): LocalExplanation[] {
  const facts = [...input.facts];
  const important = extractImportantFacts(facts);
  const titleFact = facts.find((f) => f.kind === "documentTitle");
  const org = facts.find((f) => f.kind === "organization");
  const title =
    (titleFact?.normalizedValue as string) ||
    titleFact?.rawValue ||
    (input.documentType === "renewalNotice"
      ? "Avis de renouvellement"
      : "Document");

  const sourceFacts = factsToSources(facts);
  const details: string[] = [];
  for (const f of important) {
    const line = formatImportantLine(f);
    if (line) details.push(line);
  }

  const summary = buildSummary({
    documentType: input.documentType,
    title,
    orgName: org ? String(org.normalizedValue ?? org.rawValue) : null
  });

  const why = important.map((f) => {
    const quote = f.evidence?.[0]?.text || f.rawValue;
    return `${f.label} : « ${quote} »`;
  });

  const uncertain = facts
    .filter((f) => f.roleAmbiguous)
    .map((f) => ambiguousNote(f));

  const missingInformation = uncertain.slice();

  lexSeq += 1;
  const explanation: LocalExplanation = {
    id: `glex-${input.documentId}-${lexSeq}`,
    domain: "administrative",
    subject: input.documentId,
    title,
    summary,
    details,
    importance: "primary",
    status: uncertain.length ? "needsInformation" : "explained",
    sourceFacts,
    ruleRefs: [],
    sourceRefs: [],
    taxYear: null,
    calculation: null,
    calculationExplanation: null,
    sourceExplanation:
      "Explication locale générique — uniquement des faits explicitement présents.",
    missingInformation,
    why,
    limits: [
      "Cette explication ne crée aucun devoir de paiement ni d’action pour l’utilisateur.",
      "Les montants et dates n’ont de rôle précis que si le document le indique clairement."
    ]
  };

  // Explications secondaires « Pourquoi ? » par fait important
  const secondary: LocalExplanation[] = important.map((f) => {
    lexSeq += 1;
    return {
      id: `glex-${f.id}-${lexSeq}`,
      domain: "administrative" as const,
      subject: f.id,
      title: f.label,
      summary: formatImportantLine(f) || `${f.label} : ${f.rawValue}`,
      details: [
        `Valeur originale : ${f.rawValue}`,
        f.normalizedValue != null
          ? `Valeur normalisée : ${stringifyNorm(f)}`
          : "Pas de normalisation supplémentaire."
      ],
      importance: "secondary" as const,
      status: f.roleAmbiguous ? ("needsInformation" as const) : ("explained" as const),
      sourceFacts: factsToSources([f]),
      ruleRefs: [],
      sourceRefs: [],
      taxYear: null,
      calculation: null,
      calculationExplanation: null,
      sourceExplanation: null,
      missingInformation: f.roleAmbiguous ? [ambiguousNote(f)] : [],
      why: [
        `Passage documentaire : « ${f.evidence?.[0]?.text || f.rawValue} »`
      ],
      limits: [
        "Aucune interprétation juridique n’est ajoutée à ce fait documentaire.",
        "Ce fait ne devient pas un devoir de paiement sans mention explicite."
      ]
    };
  });

  return [explanation, ...secondary];
}

function buildSummary(input: {
  documentType: GenericDocumentTypeId;
  title: string;
  orgName: string | null;
}): string {
  if (input.documentType === "renewalNotice" && input.orgName) {
    return `Ce document contient un avis de renouvellement provenant de ${input.orgName}.`;
  }
  if (input.documentType === "renewalNotice") {
    return `Ce document contient un avis de renouvellement.`;
  }
  if (input.orgName) {
    return `Ce document contient des informations provenant de ${input.orgName}.`;
  }
  return `Ce document contient des informations explicitement présentes, sans type certain.`;
}

export function formatImportantLine(f: GenericDocumentFact): string | null {
  if (f.kind === "amount") {
    const norm = f.normalizedValue as GenericNormalizedAmount | null;
    const money =
      norm && typeof norm === "object" && "amount" in norm
        ? formatMoneyFR(norm.amount)
        : null;
    // Jamais « Montant à payer » sans preuve
    if (f.roleAmbiguous || !f.structuralRole) {
      return `Montant trouvé : ${money || f.rawValue}.`;
    }
    return `Montant indiqué : ${money || f.rawValue}.`;
  }
  if (f.kind === "deadline") {
    const d = formatDateFR(f.normalizedValue) || f.rawValue;
    return `Date limite indiquée : ${d}.`;
  }
  if (f.kind === "reference") {
    return `Référence : ${f.normalizedValue ?? f.rawValue}.`;
  }
  if (f.kind === "date") {
    const d = formatDateFR(f.normalizedValue) || f.rawValue;
    if (f.structuralRole === "documentDate") {
      return `Date du document : ${d}.`;
    }
    return `Date trouvée : ${d}.`;
  }
  if (f.kind === "organization") {
    return `Émis par : ${f.normalizedValue ?? f.rawValue}.`;
  }
  return null;
}

function ambiguousNote(f: GenericDocumentFact): string {
  if (f.kind === "amount") {
    return `Le document contient le montant ${f.rawValue}, mais son rôle n’est pas suffisamment clair.`;
  }
  if (f.kind === "date" || f.kind === "deadline") {
    return `Le document contient la date ${f.rawValue}, mais son rôle n’est pas suffisamment clair.`;
  }
  return `Information ambiguë : ${f.label} (${f.rawValue}).`;
}

function factsToSources(
  facts: readonly GenericDocumentFact[]
): LocalExplanationSourceFact[] {
  return facts.map((f) => ({
    kind: "document" as const,
    id: f.id,
    label: f.label,
    value: f.rawValue,
    fieldCode: null,
    documentId: f.documentId
  }));
}

function stringifyNorm(f: GenericDocumentFact): string {
  const v = f.normalizedValue;
  if (v && typeof v === "object" && "amount" in v) {
    return `${(v as GenericNormalizedAmount).amount} ${(v as GenericNormalizedAmount).currency}`;
  }
  return String(v ?? "");
}
