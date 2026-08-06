/**
 * Extracteurs déterministes (regex / heuristiques).
 */

import type {
  LocalAmountFinding,
  LocalContactFinding,
  LocalDateFinding,
  LocalReferenceFinding
} from "../types/LocalAnalysis.js";
import {
  linesOf,
  normalizeCompact,
  normalizeText,
  parseFrenchAmount,
  parseFrenchMonthName,
  toIsoDate
} from "./normalize.js";

const AMOUNT_NUM = String.raw`(\d{1,3}(?:[ .]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;

export function extractDates(text: string): {
  dates: LocalDateFinding[];
  deadlines: LocalDateFinding[];
} {
  const dates: LocalDateFinding[] = [];
  const deadlines: LocalDateFinding[] = [];
  const seen = new Set<string>();

  const push = (
    target: LocalDateFinding[],
    raw: string,
    iso: string | null,
    label: string | null
  ) => {
    const key = `${iso || raw}|${label || ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push({ raw, iso, label, page: null });
  };

  const numeric = [
    ...text.matchAll(
      /(?:date(?:\s*d['’]émission|\s*du\s*document)?|émise?\s+le|fait\s+le|en\s+date\s+du)?\s*[:=]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/gi
    )
  ];
  for (const match of numeric) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    const label = /échéance|a\s*payer|avant\s+le|limite/i.test(match[0])
      ? "deadline"
      : /émission|emise|fait\s+le|date/i.test(match[0])
        ? "document_date"
        : null;
    const target = label === "deadline" ? deadlines : dates;
    push(target, match[0].trim(), iso, label);
  }

  const named = [
    ...text.matchAll(
      /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/gi
    )
  ];
  for (const match of named) {
    const month = parseFrenchMonthName(match[2]);
    const iso = month ? toIsoDate(match[1], month, match[3]) : null;
    push(dates, match[0], iso, "document_date");
  }

  const deadlinePatterns = [
    ...text.matchAll(
      /(?:échéance|a\s*régler\s+avant|payable\s+avant|avant\s+le|date\s*limite)\s*[:=]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/gi
    )
  ];
  for (const match of deadlinePatterns) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    push(deadlines, match[0].trim(), iso, "deadline");
  }

  return { dates, deadlines };
}

export function extractAmounts(text: string): LocalAmountFinding[] {
  const amounts: LocalAmountFinding[] = [];
  const seen = new Set<string>();

  const patterns: Array<{ label: string; re: RegExp }> = [
    {
      label: "HT",
      re: new RegExp(
        String.raw`(?:total\s*)?(?:montant\s*)?(?:h\.?\s*t\.?|hors\s*taxes?)\s*[:=]?\s*${AMOUNT_NUM}\s*(?:€|eur|euros?)?`,
        "gi"
      )
    },
    {
      label: "TVA",
      re: new RegExp(
        String.raw`(?:montant\s*)?(?:t\.?\s*v\.?\s*a\.?|tva(?:\s*\d+\s*%)?)\s*[:=]?\s*${AMOUNT_NUM}\s*(?:€|eur|euros?)?`,
        "gi"
      )
    },
    {
      label: "TTC",
      re: new RegExp(
        String.raw`(?:total\s*)?(?:montant\s*)?(?:t\.?\s*t\.?\s*c\.?|ttc|toutes\s*taxes\s*comprises?)\s*[:=]?\s*${AMOUNT_NUM}\s*(?:€|eur|euros?)?`,
        "gi"
      )
    },
    {
      label: "net_a_payer",
      re: new RegExp(
        String.raw`(?:net\s*[àa]\s*payer|salaire\s*net)\s*[:=]?\s*${AMOUNT_NUM}\s*(?:€|eur|euros?)?`,
        "gi"
      )
    }
  ];

  for (const { label, re } of patterns) {
    for (const match of text.matchAll(re)) {
      const rawNum = match[1];
      const value = parseFrenchAmount(rawNum);
      const key = `${label}:${value}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      amounts.push({
        raw: match[0].trim(),
        value,
        currency: "EUR",
        label,
        page: null
      });
    }
  }

  return amounts;
}

/** Validation IBAN basique (longueur + caractères) + MOD-97 si possible. */
export function isPlausibleIban(iban: string): boolean {
  const compact = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^FR\d{12}[0-9A-Z]{11}\d{2}$/.test(compact) && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) {
    return false;
  }
  if (compact.length < 15 || compact.length > 34) {
    return false;
  }

  try {
    const rearranged = compact.slice(4) + compact.slice(0, 4);
    const expanded = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
    let remainder = 0;
    for (const chunk of expanded.match(/.{1,7}/g) || []) {
      remainder = Number(String(remainder) + chunk) % 97;
    }
    return remainder === 1;
  } catch {
    return compact.startsWith("FR") && compact.length === 27;
  }
}

export function extractIban(text: string): LocalReferenceFinding[] {
  const findings: LocalReferenceFinding[] = [];
  const seen = new Set<string>();
  // FR + 25 caractères alphanumériques (espaces optionnels).
  const matches = text.matchAll(
    /\b(?:IBAN\s*[:=]?\s*)?(FR(?:\s*[0-9A-Z]){25})\b/gi
  );

  for (const match of matches) {
    const value = match[1].replace(/\s+/g, "").toUpperCase();
    if (seen.has(value) || !isPlausibleIban(value)) {
      continue;
    }
    seen.add(value);
    findings.push({ kind: "iban", value, page: null });
  }

  return findings;
}

/** Luhn SIRET (14 chiffres). */
export function isValidSiret(siret: string): boolean {
  const digits = siret.replace(/\s+/g, "");
  if (!/^\d{14}$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let n = Number(digits[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function extractSiret(text: string): LocalReferenceFinding[] {
  const findings: LocalReferenceFinding[] = [];
  const seen = new Set<string>();

  const labeled = text.matchAll(
    /SIRET\s*[:=]?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5}|\d{14})/gi
  );
  for (const match of labeled) {
    const value = match[1].replace(/\s+/g, "");
    if (seen.has(value)) {
      continue;
    }
    if (!isValidSiret(value) && !/^\d{14}$/.test(value)) {
      continue;
    }
    // Accepter 14 chiffres même si Luhn échoue légèrement (OCR), mais préférer valides
    seen.add(value);
    findings.push({ kind: "siret", value, page: null });
  }

  // Fallback: 14 digits near company forme juridique
  if (!findings.length) {
    for (const match of text.matchAll(/\b(\d{14})\b/g)) {
      const value = match[1];
      if (isValidSiret(value) && !seen.has(value)) {
        seen.add(value);
        findings.push({ kind: "siret", value, page: null });
      }
    }
  }

  return findings;
}

export function extractInvoiceNumber(text: string): LocalReferenceFinding[] {
  const patterns = [
    /(?:facture|devis|invoice)\s*n[°oº]?\s*[:=]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/i,
    /n[°oº]\s*(?:de\s*)?(?:facture|devis)\s*[:=]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/i,
    /\b(FA[-/]?\d{3,}|\d{4}[-/]\d{3,})\b/i
  ];

  const findings: LocalReferenceFinding[] = [];
  const seen = new Set<string>();

  for (const re of patterns) {
    const match = text.match(re);
    if (!match?.[1]) {
      continue;
    }
    const value = match[1].trim().toUpperCase();
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    findings.push({ kind: "invoice_number", value, page: null });
  }

  return findings;
}

function cleanName(value: string): string | null {
  const cleaned = normalizeText(value)
    .replace(/^[:\-–]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[.,;]+$/g, "")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 80) {
    return null;
  }
  if (/^(date|montant|iban|siret|total|page)\b/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function extractCompanyName(text: string): string | null {
  const labeled = text.match(
    /(?:émetteur|emetteur|société|societe|entreprise|vendeur|prestataire)\s*[:=]\s*([^\n]+)/i
  );
  if (labeled?.[1]) {
    const name = cleanName(labeled[1]);
    if (name) {
      return name;
    }
  }

  for (const line of linesOf(text).slice(0, 12)) {
    const form = line.match(
      /\b((?:SASU|SAS|SARL|EURL|SA|SCI|SNC)\s+[A-Z0-9ÉÈÊËÀÂÄÔÖÙÛÜÇ][\wÉÈÊËÀÂÄÔÖÙÛÜÇ&'’.\- ]{1,60})/i
    );
    if (form?.[1]) {
      return cleanName(form[1]);
    }
  }

  // Première ligne « titre » hors mots-clés document
  for (const line of linesOf(text).slice(0, 8)) {
    const compact = normalizeCompact(line);
    if (
      /^(facture|devis|contrat|bulletin|releve|ordonnance|objet)\b/.test(compact)
    ) {
      continue;
    }
    if (/[a-z]{3,}/i.test(line) && line.length >= 3 && line.length <= 60) {
      // Prefer ALL CAPS / Title-like company lines
      if (/^[A-Z0-9ÉÈÊËÀÂÄÔÖÙÛÜÇ][A-Z0-9ÉÈÊËÀÂÄÔÖÙÛÜÇ &'’.\-]{2,}$/.test(line)) {
        return cleanName(line);
      }
    }
  }

  return null;
}

export function extractClientName(text: string): string | null {
  const labeled = text.match(
    /(?:client|facturé\s*[àa]|facture\s*[àa]|destinataire|adressé\s*[àa]|patient)\s*[:=]\s*([^\n]+)/i
  );
  if (labeled?.[1]) {
    return cleanName(labeled[1]);
  }

  const block = text.match(
    /(?:client|facturé\s*[àa]|destinataire)\s*\n\s*([^\n]+)/i
  );
  if (block?.[1]) {
    return cleanName(block[1]);
  }

  return null;
}

export function extractContacts(text: string): LocalContactFinding[] {
  const contacts: LocalContactFinding[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  )) {
    const value = match[0].toLowerCase();
    if (!seen.has(value)) {
      seen.add(value);
      contacts.push({ kind: "email", value, page: null });
    }
  }

  for (const match of text.matchAll(
    /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g
  )) {
    const value = match[0].replace(/\s+/g, " ").trim();
    if (!seen.has(value)) {
      seen.add(value);
      contacts.push({ kind: "phone", value, page: null });
    }
  }

  return contacts;
}

export function detectActions(text: string): string[] {
  const actions: string[] = [];
  if (/à\s*régler|merci\s+de\s+payer|payable|virement/i.test(text)) {
    actions.push("Régler le montant dû");
  }
  if (/signer|signature|retourner\s+signé/i.test(text)) {
    actions.push("Signer et retourner le document");
  }
  if (/joindre|fournir|pièces?\s+justificatives?/i.test(text)) {
    actions.push("Fournir les pièces demandées");
  }
  if (/contacter|rappeler|téléphone/i.test(text)) {
    actions.push("Contacter l’émetteur si besoin");
  }
  return actions;
}

export function detectRequiredDocuments(text: string): string[] {
  const required: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/pièce\s+d['’]identité|carte\s+d['’]identité/i, "Pièce d’identité"],
    [/rib|relevé\s+d['’]identité\s+bancaire/i, "RIB"],
    [/avis\s+d['’]imposition/i, "Avis d’imposition"],
    [/justificatif\s+de\s+domicile/i, "Justificatif de domicile"],
    [/attestation/i, "Attestation"]
  ];
  for (const [re, label] of patterns) {
    if (re.test(text)) {
      required.push(label);
    }
  }
  return required;
}
