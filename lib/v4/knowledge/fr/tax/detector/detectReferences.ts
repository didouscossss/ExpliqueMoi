/**
 * Détecteur de références fiscales FR.
 * Produit des candidats + kinds — ne classifie pas seul le document.
 */

import { normalizeLex } from "../../../../candidates/normalize.js";
import type { TextBlock } from "../../../../types/textBlock.js";
import type {
  DetectedFiscalReference,
  FiscalNumericKind,
  FiscalReferenceRole,
  FrenchTaxDocumentRegistry
} from "../../../../types/knowledge.js";
import { lookupByReference } from "../registry/loadRegistry.js";

/** Formes formulaire : 2042, 2042-C, 2042-C-PRO, 2065-SD, 3310-CA3-SD… */
const FORM_REF_RE =
  /\b((?:2042(?:\s*[- ]?\s*(?:C(?:\s*[- ]?\s*PRO)?|RICI|IOM|TA|K)?)?)|2044(?:\s*[- ]?\s*(?:SPE|EB))?|2047|2065(?:\s*[- ]?\s*SD)?|2572(?:\s*[- ]?\s*SD)?|3310(?:\s*[- ]?\s*CA3(?:\s*[- ]?\s*SD)?)?|1330(?:\s*[- ]?\s*CVAE(?:\s*[- ]?\s*SD)?))\b/gi;

/** Numéro fiscal contribuable — 13 chiffres (ne pas confondre avec formulaire). */
const TAXPAYER_ID_RE = /\b(\d{13})\b/g;

/** Référence d’avis synthétique / typique (lettres+chiffres, pas un formulaire connu). */
const NOTICE_REF_RE =
  /\b(?:r[eé]f[eé]rence\s+(?:de\s+l['’]?avis|avis)|n[°o]\s*avis|avis\s+n[°o]?)\s*[:\s]*([A-Z0-9][A-Z0-9\-]{5,20})\b/gi;

/** Année fiscale isolée. */
const YEAR_RE = /\b(20[2-3]\d)\b/g;

function normalizeFormRef(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/([A-Z])PRO$/, "$1-PRO")
    .replace(/2042C(?!-)/, "2042-C")
    .replace(/2042RICI/, "2042-RICI")
    .replace(/2065SD/, "2065-SD")
    .replace(/2572SD/, "2572-SD")
    .replace(/3310CA3SD/, "3310-CA3-SD")
    .replace(/3310CA3/, "3310-CA3")
    .replace(/1330CVAESD/, "1330-CVAE-SD")
    .replace(/1330CVAE/, "1330-CVAE");
}

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

function inferReferenceRole(
  blockText: string,
  normalized: string,
  kind: FiscalNumericKind
): FiscalReferenceRole {
  if (kind !== "formReference") return "unknown";
  const lex = normalizeLex(blockText);
  const ref = normalizeLex(normalized);

  // Mention / renvoi ≠ identité du document courant
  if (
    /voir\s+(votre\s+)?declaration|reportez|reporter|conformement\s+a\s+votre|selon\s+votre\s+declaration|joindre\s+votre/.test(
      lex
    )
  ) {
    return "mentionedDocument";
  }

  // Titre / identité
  if (
    new RegExp(
      `(declaration\\s+des\\s+revenus|formulaire)\\s+.*${ref.replace(/-/g, "[- ]?")}|${ref.replace(/-/g, "[- ]?")}\\s*(-\\s*)?(declaration|formulaire)`
    ).test(lex) ||
    (/^\s*(declaration|formulaire)/.test(lex) && lex.includes(ref.replace(/-/g, "")))
  ) {
    return "documentIdentity";
  }

  if (/annexe|complementaire|joindre|piece\s+jointe/.test(lex)) {
    return "relatedDocument";
  }

  // Formulaire seul en tête de ligne courte
  if (lex.trim().length < 80 && new RegExp(`\\b${ref.replace(/-/g, "[- ]?")}\\b`).test(lex)) {
    if (/declaration|formulaire|cerfa|impot/.test(lex)) return "documentIdentity";
  }

  return "unknown";
}

function pushUnique(
  out: DetectedFiscalReference[],
  item: DetectedFiscalReference
): void {
  const key = `${item.kind}|${item.normalized}|${item.evidence[0]?.blockId || ""}`;
  if (out.some((x) => `${x.kind}|${x.normalized}|${x.evidence[0]?.blockId || ""}` === key)) {
    return;
  }
  out.push(item);
}

/**
 * Détecte références / identifiants fiscaux dans les blocs.
 */
export function detectFiscalReferences(
  blocks: readonly TextBlock[],
  registry: FrenchTaxDocumentRegistry
): DetectedFiscalReference[] {
  const out: DetectedFiscalReference[] = [];

  for (const block of blocks) {
    const text = block.text || "";
    const lex = normalizeLex(text);

    // 1) Form references
    FORM_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FORM_REF_RE.exec(text)) !== null) {
      const raw = m[1] || m[0];
      const normalized = normalizeFormRef(raw);
      // Adresse / code postal / bruit : 2042 seul sans contexte fiscal faible
      const entry = lookupByReference(registry, normalized);
      const role = inferReferenceRole(text, normalized, "formReference");
      const fiscalContext =
        /declaration|formulaire|impot|fiscal|cerfa|avis|revenus|dgfip|annexe|rici/.test(
          lex
        );
      // Faux positif : numéro d'adresse « 2042 » sans contexte
      if (!fiscalContext && !entry) continue;
      if (
        !fiscalContext &&
        role === "unknown" &&
        /rue|avenue|boulevard|bp\b|cedex|appartement|batiment/.test(lex)
      ) {
        continue;
      }

      pushUnique(out, {
        raw,
        normalized,
        kind: "formReference",
        role: fiscalContext ? role : "unknown",
        registryId: entry?.id || null,
        family: entry?.family || null,
        evidence: evidenceFor(block),
        confidence: entry
          ? role === "documentIdentity"
            ? 0.85
            : role === "mentionedDocument"
              ? 0.7
              : 0.55
          : fiscalContext
            ? 0.4
            : 0.15,
        reasons: [
          entry ? `registry:${entry.id}` : "registry:miss",
          `role:${role}`,
          fiscalContext ? "context:fiscal" : "context:weak"
        ]
      });
    }

    // 2) Taxpayer identifier (13 digits)
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
        reasons: [
          "kind:taxpayerIdentifier",
          labeled ? "label:numeroFiscal" : "shape:13digits",
          "not:formReference"
        ]
      });
    }

    // 3) Notice reference
    NOTICE_REF_RE.lastIndex = 0;
    while ((m = NOTICE_REF_RE.exec(text)) !== null) {
      const raw = m[1];
      // Ne pas reprendre un formReference
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

    // 4) Fiscal year (weak — never formReference)
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
  if (/siren|siret/.test(lex) || /^\d{9}$/.test(digits) || /^\d{14}$/.test(digits)) {
    return "businessIdentifier";
  }
  if (/^20[2-3]\d$/.test(raw) && /annee|revenus|fiscal/.test(lex)) {
    return "fiscalYear";
  }
  if (FORM_REF_RE.test(raw)) return "formReference";
  if (/r[eé]f[eé]rence\s+(de\s+l['’]?avis|avis)|n[°o]\s*avis/.test(lex)) {
    return "noticeReference";
  }
  if (/€|eur|montant/.test(lex)) return "amount";
  return "unknownNumericIdentifier";
}
