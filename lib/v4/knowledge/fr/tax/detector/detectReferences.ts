/**
 * Détecteur de références fiscales FR — V4-M (v2).
 * Candidats → lookup registry → evidence. Ne classifie pas seul.
 */

import { normalizeLex } from "../../../../candidates/normalize.js";
import type { TextBlock } from "../../../../types/textBlock.js";
import type {
  DetectedFiscalReference,
  FiscalNumericKind,
  FiscalReferenceRole,
  FrenchTaxDocumentRegistry
} from "../../../../types/knowledge.js";
import {
  normalizeTaxReference,
  ocrRepairTaxReference
} from "../normalize/normalizeReference.js";
import { buildRegistryIndex } from "../registry/indexes.js";
import { lookupRegistry } from "../registry/lookup.js";

/** Numéro fiscal contribuable — 13 chiffres. */
const TAXPAYER_ID_RE = /\b(\d{13})\b/g;

/** Référence d’avis. */
const NOTICE_REF_RE =
  /\b(?:r[eé]f[eé]rence\s+(?:de\s+l['’]?avis|avis)|n[°o]\s*avis|avis\s+n[°o]?)\s*[:\s]*([A-Z0-9][A-Z0-9\-]{5,20})\b/gi;

const YEAR_RE = /\b(20[2-3]\d)\b/g;

/** Candidats formulaire (typo / OCR / espaces). Pas de tiret long (ponctuation). */
const FORM_CANDIDATE_RE =
  /\b(?:n[°oº]\s*)?(?:formulaire\s+)?((?:\d{3,4}|[2O][0OIli]\d{2})(?:[ \-_\/]+[A-Z0-9]{1,8}){0,4})\b/gi;

/** Mots FR qui ne sont jamais des suffixes de formulaire. */
const VARIANT_STOP = new Set([
  "ET",
  "DE",
  "DES",
  "DU",
  "LA",
  "LE",
  "LES",
  "AU",
  "AUX",
  "SUR",
  "POUR",
  "UNE",
  "UN",
  "OU",
  "EN",
  "D",
  "L",
  "A",
  "DECLARATION",
  "IMPOT",
  "IMPOTS",
  "REVENUS",
  "FORMULAIRE",
  "ANNEE",
  "PAGE"
]);

function sanitizeFormCandidate(raw: string): string {
  // Couper avant tiret typographique / em-dash
  let s = raw.split(/[–—]/)[0] || raw;
  const parts = s.split(/[ \-_\/]+/).filter(Boolean);
  if (!parts.length) return s.trim();
  const kept = [parts[0]!];
  for (const p of parts.slice(1)) {
    const up = p.toUpperCase();
    if (VARIANT_STOP.has(up)) break;
    if (!/^[A-Z0-9]{1,8}$/i.test(p)) break;
    kept.push(p);
  }
  return kept.join("-");
}

const CERFA_RE = /\bCERFA\s*n?[°o]?\s*(\d{5}(?:\s*[*#]\s*\d+)?)\b/gi;

function evidenceFor(block: TextBlock) {
  return [
    {
      text: block.text,
      page: block.page,
      bbox: block.bbox ?? null,
      blockId: block.id,
      lineId: block.lineId ?? null
    }
  ];
}

function fiscalContextScore(lex: string): number {
  let s = 0;
  if (/formulaire|cerfa|declaration|impot|fiscal|dgfip|finances\s+publiques|annexe|rici/.test(lex))
    s += 0.45;
  if (/n[°o]|reference|titre/.test(lex)) s += 0.15;
  if (/direction\s+generale\s+des\s+finances\s+publiques/.test(lex)) s += 0.2;
  // négatifs
  if (/rue|avenue|boulevard|appartement|code\s+postal|telephone|tel\b|facture|client|contrat|compte\s+bancaire/.test(lex))
    s -= 0.45;
  if (/€|eur\b|montant|total\s+ttc|total\s+ht/.test(lex) && !/impot|fiscal|declaration|avis/.test(lex))
    s -= 0.2;
  return s;
}

function inferReferenceRole(
  blockText: string,
  normalized: string,
  kind: FiscalNumericKind
): FiscalReferenceRole {
  if (kind !== "formReference") return "unknown";
  const lex = normalizeLex(blockText);
  // lex est lowercase — la flex ref doit l'être aussi
  const refFlex = normalized.toLowerCase().replace(/-/g, "[- ]?");

  if (
    /joindre|joignez|piece\s+jointe|annexez|veuillez\s+joindre/.test(lex) &&
    new RegExp(refFlex, "i").test(lex)
  ) {
    return "attachmentReference";
  }
  if (
    /voir\s+(votre\s+)?declaration|reportez|reporter|conformement\s+a\s+votre|selon\s+votre\s+declaration|mentionne/.test(
      lex
    )
  ) {
    return "mentionedDocument";
  }
  if (
    new RegExp(
      `(declaration\\s+des\\s+revenus|formulaire)\\s+(n[°o]\\s*)?${refFlex}|${refFlex}\\s*(-\\s*)?(declaration|formulaire)`,
      "i"
    ).test(lex) ||
    (/^\s*(declaration|formulaire)/.test(lex) &&
      lex.includes(normalized.replace(/-/g, "").toLowerCase()))
  ) {
    // "formulaire 2042-C" dans un joignez déjà traité ; sinon identité
    return "documentIdentity";
  }
  if (/annexe|complementaire/.test(lex) && new RegExp(refFlex, "i").test(lex)) {
    return "relatedDocument";
  }
  if (
    lex.trim().length < 100 &&
    new RegExp(`\\b${refFlex}\\b`, "i").test(lex) &&
    /declaration|formulaire|cerfa|impot/.test(lex)
  ) {
    return "documentIdentity";
  }
  return "unknown";
}

function pushUnique(out: DetectedFiscalReference[], item: DetectedFiscalReference): void {
  const key = `${item.kind}|${item.normalized}|${item.role}|${item.evidence[0]?.blockId || ""}`;
  if (out.some((x) => `${x.kind}|${x.normalized}|${x.role}|${x.evidence[0]?.blockId || ""}` === key))
    return;
  out.push(item);
}

export function detectFiscalReferences(
  blocks: readonly TextBlock[],
  registry: FrenchTaxDocumentRegistry
): DetectedFiscalReference[] {
  const out: DetectedFiscalReference[] = [];
  const index = buildRegistryIndex(registry);
  const known = index.knownReferences;

  for (const block of blocks) {
    const text = block.text || "";
    const lex = normalizeLex(text);
    const ctx = fiscalContextScore(lex);

    // 1) Form candidates
    FORM_CANDIDATE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FORM_CANDIDATE_RE.exec(text)) !== null) {
      const rawCaptured = m[1] || m[0];
      const raw = sanitizeFormCandidate(rawCaptured);
      if (!raw) continue;
      let norm = normalizeTaxReference(raw);
      let normalizationReason: string | null = null;
      let normalizedCandidate = norm.normalizedReference;

      let lookup = lookupRegistry(index, norm.normalizedReference);

      // OCR repair only with strong fiscal context
      if (lookup.matchKind === "none" && ctx >= 0.4) {
        const repaired = ocrRepairTaxReference(raw, known);
        if (repaired) {
          norm = normalizeTaxReference(repaired.candidate);
          normalizedCandidate = repaired.candidate;
          normalizationReason = repaired.reason;
          lookup = lookupRegistry(index, repaired.candidate);
        }
      }

      // Années calendaires isolées (2024/2025…) ≠ formulaire —
      // sauf si la référence est connue du registre (ex. 2042).
      if (
        /^(19|20)\d{2}$/.test(norm.normalizedReference) &&
        lookup.matchKind === "none"
      ) {
        continue;
      }

      if (lookup.matchKind === "none" && ctx < 0.35) continue;
      if (
        lookup.matchKind === "none" &&
        !/^\d{3,4}(-[A-Z0-9]+)*$/i.test(norm.normalizedReference)
      )
        continue;

      // Address / invoice false positives
      if (ctx < 0.2) continue;
      if (
        ctx < 0.35 &&
        /rue|avenue|boulevard|appartement|facture\s+n|client\s|contrat\s|appelez/.test(lex)
      ) {
        continue;
      }

      const role = inferReferenceRole(text, norm.normalizedReference, "formReference");
      const entry = lookup.entry;
      // possible match → faible confiance, pas identité forte
      const matchKind = lookup.matchKind;
      let confidence = lookup.confidence * (0.5 + Math.max(0, Math.min(ctx, 0.5)));
      if (role === "documentIdentity") confidence = Math.min(0.95, confidence + 0.15);
      if (role === "mentionedDocument") confidence = Math.min(0.75, confidence);
      if (matchKind === "possible") confidence = Math.min(confidence, 0.4);

      pushUnique(out, {
        raw,
        normalized: norm.normalizedReference,
        kind: "formReference",
        role: ctx >= 0.35 ? role : "unknown",
        registryId: entry && matchKind !== "possible" ? entry.id : entry?.id || null,
        family: entry?.family || null,
        evidence: evidenceFor(block),
        confidence,
        reasons: [
          `match:${matchKind}`,
          `role:${role}`,
          `context:${ctx.toFixed(2)}`,
          normalizationReason || "norm:standard"
        ],
        rawText: raw,
        normalizedCandidate,
        normalizationReason,
        matchKind
      });
    }

    // 2) Cerfa
    CERFA_RE.lastIndex = 0;
    while ((m = CERFA_RE.exec(text)) !== null) {
      const raw = m[1].replace(/\s+/g, "");
      const lookup = lookupRegistry(index, raw);
      pushUnique(out, {
        raw,
        normalized: raw.toUpperCase(),
        kind: "cerfaNumber",
        role: "unknown",
        registryId: lookup.entry?.id || null,
        family: lookup.entry?.family || null,
        evidence: evidenceFor(block),
        confidence: lookup.confidence,
        reasons: [`match:${lookup.matchKind}`, "kind:cerfaNumber", "not:formReference"],
        matchKind: lookup.matchKind
      });
    }

    // 3) Taxpayer ID
    TAXPAYER_ID_RE.lastIndex = 0;
    while ((m = TAXPAYER_ID_RE.exec(text)) !== null) {
      const raw = m[1];
      const labeled = /numero\s+fiscal|n[°o]\s*fiscal|identifiant\s+fiscal/.test(lex);
      pushUnique(out, {
        raw,
        normalized: raw,
        kind: "taxpayerIdentifier",
        role: "unknown",
        registryId: null,
        family: null,
        evidence: evidenceFor(block),
        confidence: labeled ? 0.9 : 0.55,
        reasons: ["kind:taxpayerIdentifier", "not:formReference"]
      });
    }

    // 4) Notice reference
    NOTICE_REF_RE.lastIndex = 0;
    while ((m = NOTICE_REF_RE.exec(text)) !== null) {
      const raw = m[1];
      if (/^204[0-9]/.test(raw)) continue;
      pushUnique(out, {
        raw,
        normalized: raw.toUpperCase(),
        kind: "noticeReference",
        role: "documentIdentity",
        registryId: null,
        family: "incomeTaxNotice",
        evidence: evidenceFor(block),
        confidence: 0.75,
        reasons: ["kind:noticeReference", "not:formReference"]
      });
    }

    // 5) Fiscal year
    if (/annee|revenus\s+de|impot\s+sur\s+les\s+revenus|fiscal/.test(lex)) {
      YEAR_RE.lastIndex = 0;
      while ((m = YEAR_RE.exec(text)) !== null) {
        const year = Number(m[1]);
        if (year < 2020 || year > 2035) continue;
        pushUnique(out, {
          raw: m[1],
          normalized: m[1],
          kind: "fiscalYear",
          role: "unknown",
          registryId: null,
          family: null,
          evidence: evidenceFor(block),
          confidence: 0.45,
          reasons: ["kind:fiscalYear", "not:formReference"]
        });
      }
    }
  }

  return out;
}

export function classifyNumericToken(
  raw: string,
  contextLine: string
): FiscalNumericKind {
  const lex = normalizeLex(contextLine);
  const digits = raw.replace(/\D/g, "");
  if (/^\d{13}$/.test(digits)) return "taxpayerIdentifier";
  if (/cerfa/i.test(lex) && /^\d{5}/.test(digits)) return "cerfaNumber";
  if (/siren|siret/.test(lex) || /^\d{9}$/.test(digits) || /^\d{14}$/.test(digits)) {
    return "businessIdentifier";
  }
  if (/^20[2-3]\d$/.test(raw) && /annee|revenus|fiscal/.test(lex)) {
    return "fiscalYear";
  }
  if (/\d{3,4}/.test(raw) && /formulaire|declaration|cerfa|n[°o]/.test(lex)) {
    return "formReference";
  }
  if (/r[eé]f[eé]rence\s+(de\s+l['’]?avis|avis)|n[°o]\s*avis/.test(lex)) {
    return "noticeReference";
  }
  if (/€|eur|montant/.test(lex)) return "amount";
  return "unknownNumericIdentifier";
}

/** Choisit une identité principale parmi plusieurs refs — structure > fréquence. */
export function selectPrimaryIdentity(
  refs: readonly DetectedFiscalReference[]
): DetectedFiscalReference | null {
  const identities = refs.filter(
    (r) =>
      r.kind === "formReference" &&
      r.role === "documentIdentity" &&
      r.matchKind !== "possible" &&
      (r.confidence || 0) >= 0.55
  );
  if (identities.length === 0) return null;
  if (identities.length === 1) return identities[0]!;
  // Ambigu : plusieurs identités distinctes
  const norms = new Set(identities.map((i) => i.normalized));
  if (norms.size > 1) return null;
  return identities.sort((a, b) => b.confidence - a.confidence)[0]!;
}
