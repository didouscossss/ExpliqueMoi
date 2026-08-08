/**
 * Détection des sections fonctionnelles secondaires.
 * Séparé des DocumentType : « ce que contient le document » ≠ « ce qu’est le document ».
 * IBAN / RIB / SEPA / prélèvement → bankingDetails / paymentInformation,
 * jamais bankStatement.
 */

import type {
  SecondarySectionKind,
  SecondarySectionSignal
} from "../types/documentClassification.js";
import type { ClassificationContext } from "./context.js";

interface FunctionalHit {
  kind: SecondarySectionKind;
  confidence: number;
  signals: string[];
}

function pushUnique(
  out: FunctionalHit[],
  kind: SecondarySectionKind,
  confidence: number,
  signal: string
): void {
  const existing = out.find((h) => h.kind === kind);
  if (existing) {
    existing.confidence = Math.min(1, Math.max(existing.confidence, confidence));
    if (!existing.signals.includes(signal)) existing.signals.push(signal);
    return;
  }
  out.push({ kind, confidence, signals: [signal] });
}

/**
 * Infère les catégories fonctionnelles à partir du texte / candidats / structures.
 * Ne lit PAS les scores de types documentaires.
 */
export function detectSecondarySections(
  ctx: ClassificationContext
): SecondarySectionSignal[] {
  const hits: FunctionalHit[] = [];
  const { lex, structures, candidates } = ctx;

  // --- bankingDetails (coordonnées, pas un relevé) ---
  if (structures.hasIban || candidates.some((c) => c.type === "iban")) {
    pushUnique(hits, "bankingDetails", 0.85, "iban");
  }
  if (/\brib\b|\biban\b|\bbic\b|\bswift\b/.test(lex)) {
    if (/\brib\b/.test(lex)) pushUnique(hits, "bankingDetails", 0.8, "rib");
    if (/\bbic\b|\bswift\b/.test(lex)) {
      pushUnique(hits, "bankingDetails", 0.7, "bic");
    }
  }
  if (/coordonn[eé]es\s+bancaires|compte\s+bancaire\s+(pour|de)\s+paiement/.test(lex)) {
    pushUnique(hits, "bankingDetails", 0.75, "bankingCoordinates");
  }

  // --- paymentInformation ---
  if (
    structures.hasPrelevement ||
    /prelevement|pr[eé]l[eè]vement/.test(lex)
  ) {
    pushUnique(hits, "paymentInformation", 0.8, "prelevement");
  }
  if (/mandat\s+sepa|sepa/.test(lex)) {
    pushUnique(hits, "paymentInformation", 0.85, "mandatSepa");
  }
  if (
    /mode\s+de\s+paiement|payable\s+(avant|le)|montant\s+[aà]\s+payer|paiement\s+automatique/.test(
      lex
    )
  ) {
    pushUnique(hits, "paymentInformation", 0.65, "paymentTerms");
  }

  // --- paymentSchedule ---
  if (/[eé]ch[eé]ancier|mensualit[eé]s?|prochaine\s+[eé]ch[eé]ance/.test(lex)) {
    pushUnique(hits, "paymentSchedule", 0.75, "echeancier");
  }

  // --- contactInformation ---
  const hasPhone = candidates.some((c) => c.type === "phone");
  const hasEmail = candidates.some((c) => c.type === "email");
  const hasAddress = candidates.some((c) => c.type === "address");
  if (hasPhone) pushUnique(hits, "contactInformation", 0.55, "phone");
  if (hasEmail) pushUnique(hits, "contactInformation", 0.55, "email");
  if (hasAddress) pushUnique(hits, "contactInformation", 0.5, "address");
  if (/service\s+client|nous\s+contacter|hotline|n[°o]\s*vert/.test(lex)) {
    pushUnique(hits, "contactInformation", 0.6, "customerService");
  }

  // --- legalInformation ---
  if (
    /mentions\s+l[eé]gales|sas\s+au\s+capital|rcs\s+|siret\s+|tva\s+intracommunautaire/.test(
      lex
    )
  ) {
    pushUnique(hits, "legalInformation", 0.55, "legalMentions");
  }

  // --- contractualInformation ---
  if (
    /conditions\s+g[eé]n[eé]rales|cgv|cgu|clause\s+contractuelle|selon\s+votre\s+contrat/.test(
      lex
    )
  ) {
    pushUnique(hits, "contractualInformation", 0.6, "contractTerms");
  }

  // --- taxInformation (section fiscale annexe, pas le type taxDocument) ---
  if (
    /assujetti\s+[aà]\s+la\s+tva|taux\s+de\s+tva|ventilation\s+tva|base\s+ht/.test(
      lex
    ) &&
    !structures.hasTaxMarks
  ) {
    pushUnique(hits, "taxInformation", 0.45, "vatBreakdown");
  }

  // Garde-fou : jamais de type documentaire dans les kinds
  return hits.map((h) => ({
    kind: h.kind,
    confidence: Number(h.confidence.toFixed(4)),
    signals: h.signals
  }));
}

/** True si une section secondaire est un kind fonctionnel connu. */
export function isSecondarySectionKind(
  value: string
): value is SecondarySectionKind {
  return (
    value === "paymentInformation" ||
    value === "bankingDetails" ||
    value === "paymentSchedule" ||
    value === "contactInformation" ||
    value === "legalInformation" ||
    value === "contractualInformation" ||
    value === "taxInformation"
  );
}
