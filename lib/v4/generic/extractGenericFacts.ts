/**
 * Extraction / normalisation de faits génériques à partir du texte + candidats.
 * Ne dépend PAS de fr/tax/. FACT ≠ INTERPRETATION.
 */

import type { EntityCandidate } from "../types/entityCandidate.js";
import type { EvidenceSpan } from "../types/evidence.js";
import type { TextBlock } from "../types/textBlock.js";
import {
  parseFrenchDate,
  parseFrenchMoney,
  normalizeLex
} from "../candidates/normalize.js";
import { importanceForKind } from "./rankDocumentFacts.js";
import type {
  GenericDocumentFact,
  GenericFactKind,
  GenericNormalizedAmount
} from "./types.js";

let factSeq = 0;
export function resetGenericFactIdsForTests(): void {
  factSeq = 0;
}

function nextId(prefix: string): string {
  factSeq += 1;
  return `${prefix}-${factSeq}`;
}

interface LabeledHit {
  kind: GenericFactKind;
  label: string;
  rawValue: string;
  normalizedValue: GenericDocumentFact["normalizedValue"];
  structuralRole: string | null;
  roleAmbiguous: boolean;
  lineIndex: number;
  confidence: number;
  evidenceQuote: string;
}

/**
 * Libellés structurels explicites — seule source autorisée pour deadline /
 * documentDate / organisation / référence / titre.
 */
const LABELED_LINE_PATTERNS: Array<{
  re: RegExp;
  kind: GenericFactKind;
  label: string;
  structuralRole: string | null;
  roleAmbiguous: boolean;
}> = [
  {
    re: /^\s*(?:organisme|emetteur|émetteur|expediteur|expéditeur|soci[eé]t[eé]|entreprise)\s*[:\-]\s*(.+)\s*$/i,
    kind: "organization",
    label: "Organisme",
    structuralRole: "issuer",
    roleAmbiguous: false
  },
  {
    re: /^\s*r[eé]f[eé]rence(?:\s+(?:contrat|dossier|client))?\s*[:\-]\s*(.+)\s*$/i,
    kind: "reference",
    label: "Référence",
    structuralRole: "reference",
    roleAmbiguous: false
  },
  {
    re: /^\s*date\s+(?:du\s+)?document\s*[:\-]\s*(.+)\s*$/i,
    kind: "date",
    label: "Date du document",
    structuralRole: "documentDate",
    roleAmbiguous: false
  },
  {
    re: /^\s*date\s+limite\s*[:\-]\s*(.+)\s*$/i,
    kind: "deadline",
    label: "Date limite indiquée",
    structuralRole: "deadline",
    roleAmbiguous: false
  },
  {
    re: /^\s*montant(?:\s+indiqu[eé])?\s*[:\-]\s*(.+)\s*$/i,
    kind: "amount",
    label: "Montant indiqué",
    structuralRole: "indicatedAmount",
    roleAmbiguous: false
  }
];

export function extractGenericFacts(input: {
  documentId: string;
  text: string;
  blocks?: readonly TextBlock[];
  candidates?: readonly EntityCandidate[];
}): GenericDocumentFact[] {
  const text = String(input.text || "");
  const lines = text.split(/\r?\n/);
  const facts: GenericDocumentFact[] = [];
  const seen = new Set<string>();

  // 1) Titre documentaire explicite (première ligne non vide significative)
  const titleHit = detectDocumentTitle(lines);
  if (titleHit) {
    pushFact(facts, seen, {
      id: nextId("gfact"),
      documentId: input.documentId,
      kind: titleHit.kind,
      label: titleHit.label,
      rawValue: titleHit.rawValue,
      normalizedValue: titleHit.normalizedValue ?? titleHit.rawValue,
      confidence: titleHit.confidence,
      importance: importanceForKind(titleHit.kind),
      evidence: evidenceFromLine(titleHit.lineIndex, titleHit.evidenceQuote, lines),
      sourceLocation: { lineIndex: titleHit.lineIndex, page: 1 },
      structuralRole: titleHit.structuralRole,
      roleAmbiguous: titleHit.roleAmbiguous
    });
  }

  // 2) Lignes libellées
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pat of LABELED_LINE_PATTERNS) {
      const m = line.match(pat.re);
      if (!m) continue;
      const rawValue = m[1].replace(/\s+/g, " ").trim();
      if (!rawValue) continue;

      let normalized: GenericDocumentFact["normalizedValue"] = rawValue;
      let kind = pat.kind;
      let roleAmbiguous = pat.roleAmbiguous;

      if (kind === "amount" || /€|eur/i.test(rawValue)) {
        const money = parseFrenchMoney(rawValue);
        if (money != null) {
          kind = "amount";
          normalized = amountNorm(money);
        }
      }
      if (kind === "date" || kind === "deadline") {
        const iso = parseFrenchDate(rawValue);
        if (iso) normalized = iso;
      }

      const hit: LabeledHit = {
        kind,
        label: pat.label,
        rawValue,
        normalizedValue: normalized,
        structuralRole: pat.structuralRole,
        roleAmbiguous,
        lineIndex: i,
        confidence: 0.9,
        evidenceQuote: line.trim()
      };
      pushFact(facts, seen, toFact(input.documentId, hit, lines));
    }
  }

  // 3) Candidats non encore couverts — prudence : pas d’invention de rôle
  for (const c of input.candidates || []) {
    const fact = candidateToGenericFact(input.documentId, c, facts);
    if (fact) pushFact(facts, seen, fact);
  }

  // 4) Texte informatif explicite (phrases non libellées, context)
  for (const para of extractInformationalSnippets(lines)) {
    pushFact(facts, seen, {
      id: nextId("gfact"),
      documentId: input.documentId,
      kind: "informationalText",
      label: "Texte informatif",
      rawValue: para.text,
      normalizedValue: para.text,
      confidence: 0.7,
      importance: importanceForKind("informationalText"),
      evidence: evidenceFromLine(para.lineIndex, para.text, lines),
      sourceLocation: { lineIndex: para.lineIndex, page: 1 },
      structuralRole: null,
      roleAmbiguous: false
    });
  }

  return facts;
}

function detectDocumentTitle(lines: string[]): LabeledHit | null {
  for (let i = 0; i < Math.min(lines.length, 5); i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^avis\s+de\s+renouvellement$/i.test(t)) {
      return {
        kind: "documentTitle",
        label: "Titre du document",
        rawValue: t,
        normalizedValue: "Avis de renouvellement",
        structuralRole: "documentTitle",
        roleAmbiguous: false,
        lineIndex: i,
        confidence: 0.95,
        evidenceQuote: t
      };
    }
    // Titre court majuscules / phrase titre
    if (t.length <= 60 && !/[:€]/.test(t) && /^[A-ZÉÈÀÂÊÎÔÛÄËÏÖÜÇ0-9 \-']+$/.test(t)) {
      return {
        kind: "documentTitle",
        label: "Titre du document",
        rawValue: t,
        normalizedValue: titleCaseFr(t),
        structuralRole: "documentTitle",
        roleAmbiguous: false,
        lineIndex: i,
        confidence: 0.7,
        evidenceQuote: t
      };
    }
    break; // première ligne non vide seulement pour titre générique
  }
  return null;
}

function candidateToGenericFact(
  documentId: string,
  c: EntityCandidate,
  existing: readonly GenericDocumentFact[]
): GenericDocumentFact | null {
  const raw = String(c.raw ?? c.value ?? "").trim();
  if (!raw) return null;

  // Déjà couvert par un fait libellé ?
  if (
    existing.some((f) => valuesOverlap(f.rawValue, raw) || valuesOverlap(String(f.normalizedValue ?? ""), String(c.value ?? "")))
  ) {
    return null;
  }

  if (c.type === "money") {
    const amount =
      typeof c.value === "number" ? c.value : parseFrenchMoney(raw);
    if (amount == null) return null;
    // Sans libellé : montant trouvé, PAS « à payer »
    return {
      id: nextId("gfact"),
      documentId,
      kind: "amount",
      label: "Montant trouvé",
      rawValue: raw,
      normalizedValue: amountNorm(amount),
      confidence: Math.min(0.75, bestHypScore(c) || 0.55),
      importance: importanceForKind("amount"),
      evidence: c.evidence || [],
      sourceLocation: {
        lineIndex: null,
        page: c.page ?? 1
      },
      structuralRole: null,
      roleAmbiguous: true
    };
  }

  if (c.type === "date" || c.type === "deadline" || c.type === "period") {
    const iso =
      typeof c.value === "string" && /^\d{4}-\d{2}-\d{2}/.test(c.value)
        ? c.value
        : parseFrenchDate(raw);
    if (!iso) return null;
    const top = bestHyp(c);
    const isDeadlineRole =
      top &&
      (top.role === "deadline" || top.role === "dueDate") &&
      top.score >= 0.55 &&
      hasDeadlineCue(c);
    // Date isolée → kind=date, jamais deadline inventée
    return {
      id: nextId("gfact"),
      documentId,
      kind: isDeadlineRole ? "deadline" : "date",
      label: isDeadlineRole ? "Date limite indiquée" : "Date trouvée",
      rawValue: raw,
      normalizedValue: iso,
      confidence: Math.min(0.8, top?.score || 0.55),
      importance: importanceForKind(isDeadlineRole ? "deadline" : "date"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: isDeadlineRole ? "deadline" : null,
      roleAmbiguous: !isDeadlineRole
    };
  }

  if (c.type === "organization") {
    return {
      id: nextId("gfact"),
      documentId,
      kind: "organization",
      label: "Organisation",
      rawValue: String(c.value ?? raw),
      normalizedValue: String(c.value ?? raw),
      confidence: 0.7,
      importance: importanceForKind("organization"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: "issuer",
      roleAmbiguous: false
    };
  }

  if (c.type === "reference" || c.type === "invoiceNumber") {
    return {
      id: nextId("gfact"),
      documentId,
      kind: "reference",
      label: "Référence",
      rawValue: String(c.value ?? raw),
      normalizedValue: String(c.value ?? raw),
      confidence: 0.75,
      importance: importanceForKind("reference"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: "reference",
      roleAmbiguous: false
    };
  }

  if (c.type === "person") {
    return {
      id: nextId("gfact"),
      documentId,
      kind: "person",
      label: "Personne",
      rawValue: String(c.value ?? raw),
      normalizedValue: String(c.value ?? raw),
      confidence: 0.65,
      importance: importanceForKind("person"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: null,
      roleAmbiguous: false
    };
  }

  if (c.type === "address") {
    return {
      id: nextId("gfact"),
      documentId,
      kind: "address",
      label: "Adresse",
      rawValue: String(c.value ?? raw),
      normalizedValue: String(c.value ?? raw),
      confidence: 0.65,
      importance: importanceForKind("address"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: null,
      roleAmbiguous: false
    };
  }

  if (c.type === "phone" || c.type === "email") {
    return {
      id: nextId("gfact"),
      documentId,
      kind: "contact",
      label: c.type === "email" ? "E-mail" : "Téléphone",
      rawValue: String(c.value ?? raw),
      normalizedValue: String(c.value ?? raw),
      confidence: 0.7,
      importance: importanceForKind("contact"),
      evidence: c.evidence || [],
      sourceLocation: { lineIndex: null, page: c.page ?? 1 },
      structuralRole: null,
      roleAmbiguous: false
    };
  }

  return null;
}

function hasDeadlineCue(c: EntityCandidate): boolean {
  const ctx = c.context;
  if (!ctx) return false;
  const blob = normalizeLex(
    [ctx.sameLine, ctx.previousLine, ctx.before, ctx.after].join(" ")
  );
  return /date\s+limite|au\s+plus\s+tard|avant\s+le|a\s+payer\s+avant|limite\s+de\s+paiement/.test(
    blob
  );
}

function extractInformationalSnippets(
  lines: string[]
): Array<{ text: string; lineIndex: number }> {
  const out: Array<{ text: string; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t.length < 24) continue;
    if (/[:]\s*\S/.test(t) && /^(organisme|montant|date|r[eé]f)/i.test(t)) {
      continue;
    }
    if (/votre\s+contrat|montant\s+indiqu|pour\s+toute\s+question|arrive\s+[àa]\s+[eé]ch[eé]ance/i.test(t)) {
      out.push({ text: t, lineIndex: i });
    }
  }
  return out.slice(0, 4);
}

function toFact(
  documentId: string,
  hit: LabeledHit,
  lines: string[]
): GenericDocumentFact {
  return {
    id: nextId("gfact"),
    documentId,
    kind: hit.kind,
    label: hit.label,
    rawValue: hit.rawValue,
    normalizedValue: hit.normalizedValue,
    confidence: hit.confidence,
    importance: importanceForKind(hit.kind),
    evidence: evidenceFromLine(hit.lineIndex, hit.evidenceQuote, lines),
    sourceLocation: { lineIndex: hit.lineIndex, page: 1 },
    structuralRole: hit.structuralRole,
    roleAmbiguous: hit.roleAmbiguous
  };
}

function evidenceFromLine(
  lineIndex: number,
  quote: string,
  lines: string[]
): EvidenceSpan[] {
  const text = quote || lines[lineIndex] || "";
  return [
    {
      page: 1,
      blockId: `line-${lineIndex}`,
      text: text.trim()
    }
  ];
}

function amountNorm(amount: number): GenericNormalizedAmount {
  return { amount, currency: "EUR" };
}

function pushFact(
  facts: GenericDocumentFact[],
  seen: Set<string>,
  fact: GenericDocumentFact
): void {
  const key = `${fact.kind}|${normalizeLex(fact.rawValue)}|${fact.structuralRole || ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  facts.push(fact);
}

function valuesOverlap(a: string, b: string): boolean {
  const na = normalizeLex(a);
  const nb = normalizeLex(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function bestHyp(c: EntityCandidate) {
  if (!c.hypotheses?.length) return null;
  return [...c.hypotheses].sort((a, b) => b.score - a.score)[0] || null;
}

function bestHypScore(c: EntityCandidate): number {
  return bestHyp(c)?.score || 0;
}

function titleCaseFr(s: string): string {
  const lower = s.toLowerCase();
  const small = new Set(["de", "du", "des", "la", "le", "les", "et", "a", "à", "d"]);
  return lower
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
