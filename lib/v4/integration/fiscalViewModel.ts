/**
 * V4-O — View model fiscal pour l’UI Preview.
 * Knowledge ≠ DocumentFacts garanti jusqu’à la présentation.
 * Aucun fetch / LLM. Aucune invention.
 */

import type { AnalyzeDocumentV4Result } from "../pipeline/analyzeDocumentV4.js";
import type {
  DocumentFactRef,
  FiscalKnowledgeAnalysis,
  TaxDocumentExplanation,
  TaxKnowledgeQualityStatus
} from "../types/knowledge.js";
import { formatDateFR, formatMoneyFR } from "../presentation/format.js";

export type FiscalRecognitionLevel =
  | "certain"
  | "probable"
  | "partial"
  | "insufficient";

export interface FiscalViewFact {
  label: string;
  value: string;
  /** Champ technique — debug uniquement, jamais exposé tel quel. */
  fieldKey: string;
}

export interface FiscalViewAction {
  text: string;
  /** supported = dans le document ; none = aucune action certaine. */
  certainty: "supported" | "none";
}

export interface FiscalViewRelated {
  reference: string;
  title: string;
  note: string;
}

export interface FiscalViewEvidence {
  page: string;
  quote: string;
  supports: string;
}

export interface FiscalViewProvenance {
  title: string;
  url: string;
  authority: string;
}

export interface FiscalViewField {
  fieldCode: string;
  label: string | null;
  section: string | null;
  explanation: string | null;
  declarantRoleLabel: string | null;
  /** Valeur documentaire uniquement — jamais inventée depuis Knowledge. */
  documentValue: string | null;
  presenceLabel: string;
  page: number | null;
  confidence: number;
  qualityLabel: string | null;
  warnings: string[];
}

export interface FiscalDocumentViewModel {
  recognized: boolean;
  recognitionLevel: FiscalRecognitionLevel;
  confidenceHeadline: string;
  confidenceMessage: string;
  identity: {
    publicTitle: string;
    reference: string | null;
    cerfa: string | null;
    familyLabel: string | null;
    showReference: boolean;
  };
  understanding: {
    whatIsIt: string | null;
    purpose: string | null;
    whoIsConcerned: string | null;
  };
  documentFacts: FiscalViewFact[];
  possibleActions: FiscalViewAction[];
  importantPoints: string[];
  relatedDocuments: FiscalViewRelated[];
  /** V4-P — cases/rubriques (priorité : avec valeur, puis mentionnées). */
  taxFields: FiscalViewField[];
  uncertainties: string[];
  evidence: FiscalViewEvidence[];
  provenance: FiscalViewProvenance[];
  qualityStatus: TaxKnowledgeQualityStatus | null;
  qualityStatusLabel: string | null;
  /** Emplacements futurs premium — non fonctionnels. */
  premiumPlaceholders: Array<{ id: string; label: string; description: string }>;
  invariants: {
    knowledgePromotedToDocumentFact: number;
    uncertainRenderedAsCertain: number;
    technicalLabelsExposed: number;
    unsupportedUserActions: number;
    taxFieldKnowledgePromotedToFact: number;
    unsupportedFieldValues: number;
    emptyFieldConvertedToZero: number;
    unverifiedFieldDefinitionPresentedAsVerified: number;
    fieldFalsePositiveCritical: number;
  };
}

function presenceLabelFr(presence: string): string {
  switch (presence) {
    case "presentWithValue":
      return "Valeur détectée dans le document";
    case "presentEmpty":
      return "Case présente sans valeur renseignée";
    case "ambiguous":
      return "Valeur ambiguë — non rattachée";
    case "valueUnknown":
      return "Valeur non déterminée";
    default:
      return "Case non détectée comme champ rempli";
  }
}

const NON_FISCAL_PRIMARY = new Set([
  "invoice",
  "bankStatement",
  "contract",
  "payslip",
  "receipt"
]);

const FISCAL_PRIMARY = new Set([
  "taxDocument",
  "incomeTaxReturn",
  "incomeTaxNotice",
  "propertyTax",
  "taxForm",
  "unknownTaxDocument",
  "form",
  "notice",
  "administrativeLetter"
]);

const FAMILY_LABELS: Record<string, string> = {
  incomeTaxReturn: "Déclaration de revenus",
  incomeTaxNotice: "Avis d’impôt sur le revenu",
  propertyTax: "Taxe foncière",
  housingTax: "Taxe d’habitation",
  withholdingTax: "Prélèvement à la source",
  taxCreditReduction: "Réductions et crédits d’impôt",
  taxRefund: "Remboursement d’impôt",
  taxPayment: "Paiement d’impôt",
  foreignIncomeDeclaration: "Revenus de source étrangère",
  rentalIncomeDeclaration: "Revenus fonciers",
  professionalIncomeDeclaration: "Revenus professionnels",
  professionalBenefits: "Bénéfices professionnels",
  capitalGainsDeclaration: "Plus-values",
  wealthTax: "Impôt sur la fortune immobilière",
  inheritanceDonation: "Succession / donation",
  foreignAccountsDeclaration: "Comptes à l’étranger",
  corporateTax: "Impôt sur les sociétés",
  vatDeclaration: "Déclaration de TVA",
  businessTax: "Impôts des entreprises",
  taxCertificate: "Attestation / certificat fiscal",
  taxAdministrativeLetter: "Courrier fiscal",
  taxForm: "Formulaire fiscal",
  taxNotice: "Avis fiscal",
  taxInstruction: "Notice fiscale",
  unknownTaxDocument: "Document fiscal"
};

const QUALITY_LABELS: Record<TaxKnowledgeQualityStatus, string> = {
  verified: "Explication vérifiée à partir de sources officielles",
  partiallyVerified: "Certaines informations restent à vérifier",
  discovered: "Fiche encore partielle",
  needsReview: "À vérifier"
};

const FIELD_LABELS: Record<string, string> = {
  amountDue: "Montant à payer",
  taxAmount: "Montant d’impôt",
  refundAmount: "Montant à rembourser",
  paymentDeadline: "Date limite de paiement",
  fiscalPeriod: "Période / date indiquée",
  amountTTC: "Montant TTC",
  amountHT: "Montant HT",
  vatAmount: "TVA",
  purpose: "Objet indiqué",
  reference: "Référence",
  status: "Statut",
  incomeYear: "Année des revenus",
  documentYear: "Année du document"
};

const EVIDENCE_SUPPORT_LABELS: Record<string, string> = {
  amountDue: "le montant à payer",
  taxAmount: "le montant d’impôt",
  refundAmount: "le montant à rembourser",
  paymentDeadline: "la date limite",
  fiscalPeriod: "la période ou une date du document",
  amountTTC: "un montant TTC",
  amountHT: "un montant HT",
  vatAmount: "un montant de TVA",
  documentIdentity: "l’identité du document",
  reference: "une référence",
  actionDeadline: "une échéance",
  arithmeticConsistency: "la cohérence des montants",
  secondary: "une information complémentaire"
};

const TECHNICAL_EXPOSED =
  /\b(incomeTaxReturn|incomeTaxNotice|taxCreditReduction|fiscalKnowledge|DocumentFacts?|KnowledgeFact|qualityStatus|relatedDocumentRefs|warning:|amountHT|arithmeticConsistency)\b/i;

export function familyLabelFr(family: string | null | undefined): string | null {
  if (!family) return null;
  return FAMILY_LABELS[family] || null;
}

export function qualityStatusLabelFr(
  status: TaxKnowledgeQualityStatus | null | undefined
): string | null {
  if (!status) return null;
  return QUALITY_LABELS[status] || null;
}

export function humanFieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // Ne jamais exposer le camelCase technique tel quel
  const spaced = field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  if (/^[a-z0-9 ]+$/.test(spaced) && !/[A-Z]{2,}/.test(field)) {
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return "Information du document";
}

export function humanEvidenceSupport(facts: string[] | undefined): string {
  if (!facts?.length) return "une information du document";
  const labels = facts
    .map((f) => {
      const key = f.split(":").pop() || f;
      if (EVIDENCE_SUPPORT_LABELS[key]) return EVIDENCE_SUPPORT_LABELS[key];
      if (TECHNICAL_EXPOSED.test(key)) return null;
      return humanFieldLabel(key).toLowerCase();
    })
    .filter(Boolean) as string[];
  if (!labels.length) return "une information du document";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

function formatFactValue(field: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (/amount|tax|refund|due|ttc|ht|vat/i.test(field)) {
      return formatMoneyFR(value) || `${value}`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return formatDateFR(value) || value;
    }
    // Filtrer valeurs techniques type "accountStatement" / "taxObligation"
    if (/^(accountStatement|taxObligation|paymentInformation)$/i.test(value)) {
      return null;
    }
    return value;
  }
  return String(value);
}

function dedupeFacts(facts: FiscalViewFact[]): FiscalViewFact[] {
  const seen = new Set<string>();
  const out: FiscalViewFact[] = [];
  for (const f of facts) {
    const key = `${f.label}|${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function factsFromDocument(
  refs: DocumentFactRef[] | undefined
): FiscalViewFact[] {
  if (!refs?.length) return [];
  const out: FiscalViewFact[] = [];
  for (const f of refs) {
    if (f.kind !== "document") continue;
    if (!f.evidence?.length) continue;
    if (f.derivedFrom?.some((d) => String(d).startsWith("kf:"))) continue;
    const value = formatFactValue(f.field, f.value);
    if (!value) continue;
    out.push({
      label: humanFieldLabel(f.field),
      value,
      fieldKey: f.field
    });
  }
  return dedupeFacts(out).slice(0, 10);
}

function recognitionFrom(
  tx: TaxDocumentExplanation,
  kn: FiscalKnowledgeAnalysis
): {
  level: FiscalRecognitionLevel;
  headline: string;
  message: string;
  recognized: boolean;
} {
  const hasIdentity = Boolean(
    kn.primaryIdentity &&
      kn.primaryIdentity.role === "documentIdentity" &&
      (kn.primaryIdentity.confidence || 0) >= 0.55
  );
  const qs = tx.identity.qualityStatus;
  const conf = tx.confidence || 0;
  const hasWhat = Boolean(tx.whatIsIt);

  if (hasIdentity && qs === "verified" && conf >= 0.75 && hasWhat) {
    return {
      level: "certain",
      headline: "Document bien identifié",
      message:
        "Je peux vous expliquer ce document et ce qu’il indique concrètement.",
      recognized: true
    };
  }
  if ((hasIdentity || hasWhat) && (qs === "verified" || qs === "partiallyVerified")) {
    const uncertain = (tx.warnings || []).some((w) =>
      /incertain|vérifier|partiellement|limitée/i.test(w)
    );
    return {
      level: uncertain ? "probable" : "certain",
      headline: uncertain
        ? "Document identifié — certains détails restent à vérifier"
        : "Document identifié",
      message:
        "L’essentiel est identifié. Vérifiez les points signalés ci-dessous si besoin.",
      recognized: true
    };
  }
  if (kn.suggestedFamily === "unknownTaxDocument" || (!hasIdentity && !hasWhat)) {
    return {
      level: "insufficient",
      headline: "Je ne peux pas identifier ce document avec certitude",
      message:
        "Ce document semble fiscal ou administratif, mais son type précis n’est pas encore établi.",
      recognized: false
    };
  }
  return {
    level: "partial",
    headline: "Document probablement identifié",
    message:
      "L’identification reste partielle. Seules les informations clairement présentes sont affichées.",
    recognized: Boolean(hasWhat || hasIdentity)
  };
}

function publicTitleFor(tx: TaxDocumentExplanation, kn: FiscalKnowledgeAnalysis): string {
  if (tx.identity.officialTitle) return tx.identity.officialTitle;
  const fam =
    familyLabelFr(tx.identity.family) ||
    familyLabelFr(kn.suggestedFamily);
  if (fam) return fam;
  if (tx.identity.reference) return `Document fiscal ${tx.identity.reference}`;
  return "Document fiscal ou administratif";
}

function countTechnicalLabels(vmParts: string[]): number {
  return vmParts.filter((s) => TECHNICAL_EXPOSED.test(s)).length;
}

/**
 * Décide si le view model fiscal doit être exposé à l’UI.
 */
export function shouldAttachFiscalViewModel(
  result: AnalyzeDocumentV4Result
): boolean {
  const primary =
    result.diagnostics?.primaryDocumentType ||
    result.classification?.primary ||
    "";
  if (NON_FISCAL_PRIMARY.has(primary)) return false;
  const kn = result.fiscalKnowledge;
  if (!kn?.taxExplanation) return false;

  if (FISCAL_PRIMARY.has(primary)) return true;
  if (kn.suggestedFamily) return true;
  if (kn.primaryIdentity?.role === "documentIdentity") return true;
  // Signaux fiscaux lexicaux sans type fort
  if (
    kn.signals.some(
      (s) =>
        s.family !== "negative" &&
        (s.signal.startsWith("knowledge:lexical:") || s.weight >= 0.4)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Construit le view model UI à partir du résultat V4 (+ taxExplanation).
 */
export function buildFiscalDocumentViewModel(
  result: AnalyzeDocumentV4Result
): FiscalDocumentViewModel | null {
  if (!shouldAttachFiscalViewModel(result)) return null;
  const kn = result.fiscalKnowledge!;
  const tx = kn.taxExplanation!;

  const recognition = recognitionFrom(tx, kn);
  const publicTitle = publicTitleFor(tx, kn);
  // Ne pas exposer une référence candidate faible comme identité de formulaire
  const rawReference = tx.identity.reference;
  const reference =
    recognition.level === "insufficient"
      ? null
      : rawReference &&
          rawReference !== "INCOME-TAX-NOTICE" &&
          rawReference !== "PROPERTY-TAX-NOTICE"
        ? rawReference
        : recognition.recognized
          ? rawReference
          : null;
  const showReference = Boolean(
    reference &&
      recognition.recognized &&
      reference !== "INCOME-TAX-NOTICE" &&
      reference !== "PROPERTY-TAX-NOTICE" &&
      /^\d{3,4}(-[A-Z0-9]+)*$/i.test(reference)
  );

  // Cerfa uniquement si détecté avec match fort
  const cerfaRef = kn.detectedReferences.find(
    (r) =>
      r.kind === "cerfaNumber" &&
      r.matchKind === "cerfa" &&
      (r.confidence || 0) >= 0.75 &&
      r.registryId
  );

  const documentFacts = factsFromDocument(tx.importantDocumentFacts);

  // Actions : uniquement celles supportées par le document (evidence)
  const supportedActions: FiscalViewAction[] = [];
  for (const a of result.explanation.actions || []) {
    if (a.status === "noExplicitActionDetected" || a.status === "missing") continue;
    if (!a.evidence?.length) continue;
    if (!a.description) continue;
    // Ne pas promouvoir une phrase knowledge générale
    if (/contexte général du type de document/i.test(a.description)) continue;
    supportedActions.push({
      text: a.description,
      certainty: "supported"
    });
  }
  if (!supportedActions.length) {
    supportedActions.push({
      text: "Aucune action certaine détectée.",
      certainty: "none"
    });
  }

  const relatedDocuments: FiscalViewRelated[] = (tx.relatedDocuments || []).map(
    (r) => ({
      reference: r.reference,
      title: r.title || r.reference,
      note: "Document associé — utile dans certaines situations, sans obligation automatique."
    })
  );

  // Points à vérifier : uniquement incertitudes / whatToCheck génériques étiquetés
  const importantPoints: string[] = [];
  for (const w of tx.warnings || []) {
    if (/ne constituent pas un conseil fiscal/i.test(w)) continue;
    if (/Aucun montant n'est présenté|Aucune date n'est présentée/i.test(w)) {
      // redondant si section faits vide — garder si utile
      if (!documentFacts.length) importantPoints.push(w);
      continue;
    }
    importantPoints.push(w);
  }
  // Mentions faibles
  const weakRefs = kn.detectedReferences.filter(
    (r) =>
      r.role === "mentionedDocument" ||
      r.matchKind === "possible" ||
      (r.confidence || 0) < 0.55
  );
  for (const r of weakRefs.slice(0, 3)) {
    if (r.role === "mentionedDocument") {
      importantPoints.push(
        `La référence ${r.normalized} est mentionnée dans le document, sans en constituer forcément l’identité.`
      );
    } else if (r.matchKind === "possible") {
      importantPoints.push(
        `Référence possible : ${r.normalized} (confiance insuffisante pour une identification certaine).`
      );
    }
  }

  const uncertainties = [...importantPoints];

  const provenance: FiscalViewProvenance[] = [];
  for (const kf of tx.knowledgeFacts || []) {
    for (const p of kf.provenance || []) {
      if (!p.url) continue;
      if (provenance.some((x) => x.url === p.url)) continue;
      provenance.push({
        title: p.title || "Source officielle",
        url: p.url,
        authority: p.authority || "DGFiP"
      });
    }
  }

  const evidence: FiscalViewEvidence[] = (result.presentation.evidencePassages || [])
    .filter((p) => p.excerpt && p.excerpt.trim().length >= 4)
    .slice(0, 6)
    .map((p) => ({
      page: p.page ? `Page ${p.page}` : "Document",
      quote: p.excerpt,
      supports: `Ce passage permet d’identifier ${humanEvidenceSupport(p.supportedFacts)}.`
    }));

  const premiumPlaceholders = [
    {
      id: "explain-box",
      label: "Explique-moi cette case",
      description: "Bientôt : aide détaillée case par case (premium)."
    },
    {
      id: "fill-assist",
      label: "Aide-moi à remplir",
      description: "Bientôt : guidage de remplissage pas à pas (premium)."
    },
    {
      id: "ask-document",
      label: "Poser une question approfondie",
      description: "Bientôt : questions/réponses personnalisées sur votre situation (premium)."
    },
    {
      id: "evaluate-field",
      label: "Cette case me concerne-t-elle ?",
      description: "Bientôt : aide à l’applicabilité selon votre situation (premium)."
    }
  ];

  // V4-P — cases détectées (priorité valeur > mention > reste), max 8 en surface
  const fieldExplanations = kn.fieldExplanations || [];
  const rankedFields = [...fieldExplanations].sort((a, b) => {
    const score = (p: string) =>
      p === "presentWithValue" ? 0 : p === "presentEmpty" ? 1 : p === "ambiguous" ? 2 : 3;
    return score(a.presence) - score(b.presence) || b.confidence - a.confidence;
  });
  const taxFields: FiscalViewField[] = rankedFields.slice(0, 8).map((fe) => ({
    fieldCode: fe.fieldCode,
    label: fe.label,
    section: fe.section,
    explanation: fe.plainLanguageWhat || fe.whatIsIt,
    declarantRoleLabel: fe.declarantRoleLabel,
    documentValue: fe.documentValue,
    presenceLabel: presenceLabelFr(fe.presence),
    page: fe.page,
    confidence: fe.confidence,
    qualityLabel: qualityStatusLabelFr(fe.qualityStatus),
    warnings: (fe.warnings || []).filter(
      (w) => !/conseil fiscal personnalisé/i.test(w)
    )
  }));

  const knowledgePromoted = tx.invariants.documentFactsFromKnowledge || 0;
  let unsupportedUserActions = 0;
  for (const a of supportedActions) {
    if (
      a.certainty === "supported" &&
      /vous devez (remplir|cocher|déclarer)|avant le \d{1,2}\//i.test(a.text) &&
      !result.explanation.actions.some(
        (ea) => ea.evidence?.length && ea.description && a.text.includes(ea.description)
      )
    ) {
      unsupportedUserActions += 1;
    }
  }

  // Si knowledge dit "vous devez remplir" dans possibleActions générales — on ne les met PAS dans possibleActions UI
  for (const a of tx.possibleActions || []) {
    if (/vous devez/i.test(a) && !/détectée dans le document/i.test(a)) {
      // comptabilisé seulement si on l'avait promu — on ne le promeut pas
    }
  }

  const exposedParts = [
    publicTitle,
    tx.whatIsIt || "",
    tx.purpose || "",
    ...documentFacts.map((f) => f.label),
    ...supportedActions.map((a) => a.text),
    ...relatedDocuments.map((r) => r.note),
    recognition.headline
  ];
  const technicalLabelsExposed = countTechnicalLabels(exposedParts);

  let uncertainRenderedAsCertain = 0;
  if (
    recognition.level === "certain" &&
    (tx.identity.qualityStatus === "needsReview" ||
      tx.identity.qualityStatus === "discovered" ||
      (kn.primaryIdentity && (kn.primaryIdentity.confidence || 0) < 0.5))
  ) {
    uncertainRenderedAsCertain = 1;
  }

  return {
    recognized: recognition.recognized,
    recognitionLevel: recognition.level,
    confidenceHeadline: recognition.headline,
    confidenceMessage: recognition.message,
    identity: {
      publicTitle,
      reference,
      cerfa: cerfaRef?.normalized || null,
      familyLabel:
        familyLabelFr(tx.identity.family) || familyLabelFr(kn.suggestedFamily),
      showReference
    },
    understanding: {
      whatIsIt: tx.whatIsIt,
      purpose: tx.purpose,
      whoIsConcerned: tx.whoIsConcerned
    },
    documentFacts,
    possibleActions: supportedActions,
    importantPoints: importantPoints.slice(0, 8),
    relatedDocuments: relatedDocuments.slice(0, 8),
    taxFields,
    uncertainties: uncertainties.slice(0, 8),
    evidence,
    provenance: provenance.slice(0, 6),
    qualityStatus: tx.identity.qualityStatus || null,
    qualityStatusLabel: qualityStatusLabelFr(tx.identity.qualityStatus),
    premiumPlaceholders,
    invariants: {
      knowledgePromotedToDocumentFact: knowledgePromoted,
      uncertainRenderedAsCertain,
      technicalLabelsExposed,
      unsupportedUserActions,
      taxFieldKnowledgePromotedToFact:
        kn.invariants.taxFieldKnowledgePromotedToFact || 0,
      unsupportedFieldValues: kn.invariants.unsupportedFieldValues || 0,
      emptyFieldConvertedToZero: kn.invariants.emptyFieldConvertedToZero || 0,
      unverifiedFieldDefinitionPresentedAsVerified:
        kn.invariants.unverifiedFieldDefinitionPresentedAsVerified || 0,
      fieldFalsePositiveCritical: kn.invariants.fieldFalsePositiveCritical || 0
    }
  };
}

/** Sérialisation snake_case pour Preview / API. */
export function fiscalViewModelToPreviewJson(
  vm: FiscalDocumentViewModel
): Record<string, unknown> {
  return {
    recognized: vm.recognized,
    recognition_level: vm.recognitionLevel,
    confidence_headline: vm.confidenceHeadline,
    confidence_message: vm.confidenceMessage,
    identity: {
      public_title: vm.identity.publicTitle,
      reference: vm.identity.reference,
      cerfa: vm.identity.cerfa,
      family_label: vm.identity.familyLabel,
      show_reference: vm.identity.showReference
    },
    understanding: {
      what_is_it: vm.understanding.whatIsIt,
      purpose: vm.understanding.purpose,
      who_is_concerned: vm.understanding.whoIsConcerned
    },
    document_facts: vm.documentFacts.map((f) => ({
      label: f.label,
      value: f.value
    })),
    possible_actions: vm.possibleActions.map((a) => ({
      text: a.text,
      certainty: a.certainty
    })),
    important_points: vm.importantPoints,
    related_documents: vm.relatedDocuments.map((r) => ({
      reference: r.reference,
      title: r.title,
      note: r.note
    })),
    tax_fields: vm.taxFields.map((f) => ({
      field_code: f.fieldCode,
      label: f.label,
      section: f.section,
      explanation: f.explanation,
      declarant_role_label: f.declarantRoleLabel,
      document_value: f.documentValue,
      presence_label: f.presenceLabel,
      page: f.page,
      confidence: f.confidence,
      quality_label: f.qualityLabel,
      warnings: f.warnings
    })),
    uncertainties: vm.uncertainties,
    evidence: vm.evidence,
    provenance: vm.provenance,
    quality_status: vm.qualityStatus,
    quality_status_label: vm.qualityStatusLabel,
    premium_placeholders: vm.premiumPlaceholders,
    invariants: {
      knowledge_promoted_to_document_fact:
        vm.invariants.knowledgePromotedToDocumentFact,
      uncertain_rendered_as_certain: vm.invariants.uncertainRenderedAsCertain,
      technical_labels_exposed: vm.invariants.technicalLabelsExposed,
      unsupported_user_actions: vm.invariants.unsupportedUserActions,
      tax_field_knowledge_promoted_to_fact:
        vm.invariants.taxFieldKnowledgePromotedToFact,
      unsupported_field_values: vm.invariants.unsupportedFieldValues,
      empty_field_converted_to_zero: vm.invariants.emptyFieldConvertedToZero,
      unverified_field_definition_presented_as_verified:
        vm.invariants.unverifiedFieldDefinitionPresentedAsVerified,
      field_false_positive_critical: vm.invariants.fieldFalsePositiveCritical
    }
  };
}
