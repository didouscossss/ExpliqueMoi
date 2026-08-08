/**
 * Détecteur de cases fiscales FR — V4-P.
 * Contexte fiscal obligatoire. Knowledge ≠ valeur document.
 */

import { normalizeLex } from "../../../../candidates/normalize.js";
import type { TextBlock } from "../../../../types/textBlock.js";
import type {
  DetectedTaxField,
  FiscalKnowledgeAnalysis,
  TaxFieldPresence
} from "../../../../types/knowledge.js";
import { knownTaxFieldCodes, lookupTaxField } from "./lookup.js";
import { normalizeTaxFieldCode } from "./normalizeFieldCode.js";

/** Codes type 1AJ, 4BA, 7DB, 8UU… */
const FIELD_TOKEN_RE = /\b([1-9][A-Za-z]{1,2})\b/g;

/** Montants plausibles — exige €/EUR ou séparateur milliers / décimales. */
const AMOUNT_RE =
  /((?:\d{1,3}(?:[ \u00a0]\d{3})+|\d{2,})(?:[.,]\d{2})?)\s*(?:€|EUR|euros?)?|(?:€|EUR)\s*((?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d{2})?)/gi;

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

function fiscalFieldContextScore(lex: string, hasDocIdentity: boolean): number {
  let s = 0;
  if (hasDocIdentity) s += 0.35;
  if (
    /case|cases|rubrique|declaration|formulaire|2042|2044|2047|impot|dgfip|finances\s+publiques|declarant/.test(
      lex
    )
  ) {
    s += 0.4;
  }
  if (/traitements|salaires|pensions|foncier|credit\s+d.?impot|rici/.test(lex)) {
    s += 0.15;
  }
  // Négatifs — facture / adresse / produit
  if (
    /facture|client|iban|siret|immatriculation|commande|livraison|produit|sku|reference\s+client/.test(
      lex
    )
  ) {
    s -= 0.55;
  }
  if (/appartement|rue|avenue|boulevard|code\s+postal/.test(lex)) s -= 0.35;
  return s;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\s|\u00a0/g, "")
    .replace(/€|EUR|euros?/gi, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function extractAmountsNear(
  text: string,
  matchIndex: number,
  matchLen: number
): Array<{ value: string; numeric: number | null; distance: number }> {
  const out: Array<{ value: string; numeric: number | null; distance: number }> =
    [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const token = (m[1] || m[2] || "").trim();
    if (!token) continue;
    // Ignorer années isolées
    if (/^20[2-3]\d$/.test(token.replace(/\D/g, ""))) continue;
    // Ignorer références formulaire type 2042/2044
    if (/^204[0-9]$/.test(token.replace(/\D/g, ""))) continue;
    const dist = Math.min(
      Math.abs(m.index - (matchIndex + matchLen)),
      Math.abs(m.index + token.length - matchIndex)
    );
    if (dist > 48) continue;
    const numeric = parseAmount(token);
    if (numeric == null) continue;
    if (numeric < 10 && !/€|EUR/i.test(m[0])) continue;
    out.push({ value: token.trim(), numeric, distance: dist });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

function checkboxStateFromContext(
  text: string,
  index: number
): DetectedTaxField["checkboxState"] {
  const around = text.slice(Math.max(0, index - 24), index + 24).toLowerCase();
  if (/\[x\]|☑|☒|\bcoch[eé]e?\b|\boui\b/.test(around)) return "checked";
  if (/\[\s*\]|☐|\bnon\s+coch/.test(around)) return "unchecked";
  if (/cochez|à\s+cocher/.test(around)) return "notDetected";
  return "ambiguous";
}

/**
 * Détecte les cases fiscales dans les blocs, avec association prudente case↔valeur.
 */
export function detectFrenchTaxFields(
  blocks: readonly TextBlock[],
  fiscalKnowledge?: FiscalKnowledgeAnalysis | null
): DetectedTaxField[] {
  const known = knownTaxFieldCodes();
  const docRef =
    fiscalKnowledge?.primaryIdentity?.normalized ||
    fiscalKnowledge?.taxExplanation?.identity.reference ||
    null;
  const hasIdentity = Boolean(
    fiscalKnowledge?.primaryIdentity?.role === "documentIdentity"
  );

  // Année revenus si détectée
  let yearHint: number | null = null;
  for (const r of fiscalKnowledge?.detectedReferences || []) {
    if (r.kind === "fiscalYear" && r.yearRole === "incomeYear") {
      yearHint = Number(r.normalized);
      break;
    }
  }

  const out: DetectedTaxField[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const text = block.text || "";
    const lex = normalizeLex(text);
    const ctx = fiscalFieldContextScore(lex, hasIdentity);
    if (ctx < 0.35) continue;

    FIELD_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FIELD_TOKEN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const { normalizedCode, valid } = normalizeTaxFieldCode(raw);
      if (!valid) continue;

      // Exiger registre connu OU contexte case très fort
      const inRegistry = known.has(normalizedCode);
      const explicitCase = new RegExp(
        `case\\s+${normalizedCode}|${normalizedCode}\\s*:`,
        "i"
      ).test(text);
      if (!inRegistry && !explicitCase) continue;
      if (!inRegistry && ctx < 0.7) continue;

      // « voir case 1AJ » dans un texte explicatif sans grille → mention faible
      const explanatoryOnly =
        /voir\s+(la\s+)?case|reportez|conformement|notice/.test(lex) &&
        !/\d{2,}[ \u00a0.,]\d{2}/.test(text);

      const lookup = lookupTaxField({
        documentRef: docRef,
        fieldCode: normalizedCode,
        year: yearHint
      });

      const amounts = extractAmountsNear(text, m.index, raw.length);
      let presence: TaxFieldPresence = "notDetected";
      let detectedValue: string | null = null;
      let detectedNumericValue: number | null = null;
      let candidateValues: DetectedTaxField["candidateValues"] = [];
      let confidence = Math.min(0.9, 0.4 + ctx * 0.4);
      const reasons = [`context:${ctx.toFixed(2)}`];

      if (lookup.entry) {
        reasons.push(`registry:${lookup.matchKind}`);
        confidence = Math.min(0.95, confidence + 0.15);
      } else {
        reasons.push("registry:none");
        confidence = Math.min(confidence, 0.45);
      }

      if (explanatoryOnly) {
        presence = "notDetected";
        confidence = Math.min(confidence, 0.4);
        reasons.push("role:explanatoryMention");
      } else if (lookup.entry?.valueType === "boolean") {
        const cb = checkboxStateFromContext(text, m.index);
        presence =
          cb === "checked"
            ? "presentWithValue"
            : cb === "unchecked"
              ? "presentEmpty"
              : "valueUnknown";
        detectedValue =
          cb === "checked" ? "checked" : cb === "unchecked" ? "unchecked" : null;
        reasons.push(`checkbox:${cb}`);
        if (cb === "ambiguous" || cb === "notDetected") confidence = Math.min(confidence, 0.5);
      } else if (amounts.length === 0) {
        // Case citée dans une grille sans montant adjacent
        if (/case|corrigez|montant|declarant/i.test(text)) {
          presence = "presentEmpty";
          reasons.push("value:empty");
        } else {
          presence = "valueUnknown";
          reasons.push("value:unknown");
        }
      } else if (amounts.length === 1 && amounts[0]!.distance <= 28) {
        presence = "presentWithValue";
        detectedValue = amounts[0]!.value;
        detectedNumericValue = amounts[0]!.numeric;
        confidence = Math.min(0.92, confidence + 0.12);
        reasons.push("value:adjacent");
      } else if (amounts.length > 1) {
        // Ambigu — ne pas choisir
        presence = "ambiguous";
        candidateValues = amounts.slice(0, 3).map((a) => ({
          value: a.value,
          confidence: Math.max(0.2, 0.6 - a.distance / 80)
        }));
        detectedValue = null;
        detectedNumericValue = null;
        confidence = Math.min(confidence, 0.45);
        reasons.push("value:ambiguous");
      } else {
        presence = "valueUnknown";
        reasons.push("value:far");
      }

      // Ne jamais convertir vide → 0
      if (presence === "presentEmpty") {
        detectedValue = null;
        detectedNumericValue = null;
        reasons.push("emptyNotZero");
      }

      const key = `${normalizedCode}|${block.page}|${presence}|${detectedValue || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        fieldCode: normalizedCode,
        normalizedCode,
        page: block.page ?? null,
        presence,
        checkboxState:
          lookup.entry?.valueType === "boolean"
            ? checkboxStateFromContext(text, m.index)
            : null,
        detectedValue,
        detectedNumericValue,
        candidateValues: candidateValues?.length ? candidateValues : undefined,
        confidence,
        evidence: evidenceFor(block),
        registryId: lookup.entry?.id || null,
        documentRefHint: docRef,
        yearHint,
        reasons
      });
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}
