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

/**
 * Montants FR / PDF :
 * - 8,33 ou 8.33 (point fréquent dans le texte PDF)
 * - 1 234,56 / 1.234,56
 * Important : `\d+[.,]\d{1,2}` avant `\d+` sinon « 8.33 » est tronqué en « 8 ».
 */
const AMOUNT_NUM = String.raw`(\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d{1,3}(?:[ \u00a0]\d{3})+|\d+)`;

const CURRENCY_OPT = String.raw`(?:€|eur|euros?)?`;
const CURRENCY_REQ = String.raw`(?:€|eur|euros?)`;

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
      /(?:date(?:\s*d['’]émission|\s*du\s*document|\s*de\s*pr[ée]l[èe]vement|\s*de\s*facture)?|émise?\s+le|fait\s+le|en\s+date\s+du|pr[ée]l[èe]vement)\s*[:=]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})|(?:^|[^\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?!\d)/gi
    )
  ];
  for (const match of numeric) {
    const day = match[1] || match[4];
    const month = match[2] || match[5];
    const year = match[3] || match[6];
    if (!day || !month || !year) continue;
    const iso = toIsoDate(day, month, year);
    const raw = match[0].replace(/^[^\dDPdp]+/, "").trim();
    const label = /échéance|a\s*payer|avant\s+le|limite/i.test(match[0])
      ? "deadline"
      : /émission|emise|fait\s+le|pr[ée]l[èe]vement|date\s+de\s+facture|date\s+d/i.test(
            match[0]
          )
        ? "document_date"
        : /date/i.test(match[0])
          ? "document_date"
          : null;
    const target = label === "deadline" ? deadlines : dates;
    push(target, raw || match[0].trim(), iso, label);
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

/**
 * Extraction des montants avec rang de confiance selon le libellé.
 * Un « Prix HT 8,00 » (ligne) ne doit pas écraser un « Total HT 8,33 ».
 * Un « Montant à payer / TTC » prime pour le montant principal d’une facture.
 * Accepte aussi « 9,99 € TTC » (montant avant libellé) et décimales à point (PDF).
 */
export function extractAmounts(text: string): LocalAmountFinding[] {
  const byKey = new Map<string, LocalAmountFinding>();

  // Libellés de montant final (facture) — générique FR.
  const FINAL_DUE =
    String.raw`(?:somme|montant|total|net)\s*[àa]\s*(?:payer|r[ée]gler)`;
  const TTC_WORD =
    String.raw`(?:t\.?\s*t\.?\s*c\.?|ttc|toutes\s*taxes\s*comprises?)`;
  const HT_WORD = String.raw`(?:h\.?\s*t\.?|hors\s*taxes?)`;
  // « TTC » ou « (TTC) » optionnel entre le libellé et le montant.
  const OPT_TTC_TAG = String.raw`(?:\s*\(?\s*${TTC_WORD}\s*\)?)?`;

  const patterns: Array<{ label: string; rank: number; re: RegExp }> = [
    // ——— À payer / dû (priorité max pour factures) ———
    // Ex. « Somme à payer TTC : 9.99 € », « Montant à payer : 9,99 € »
    {
      label: "montant_a_payer",
      rank: 52,
      re: new RegExp(
        String.raw`${FINAL_DUE}${OPT_TTC_TAG}\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "montant_a_payer",
      rank: 50,
      re: new RegExp(
        String.raw`(?:montant|total|net)\s*[àa]\s*payer\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "montant_a_payer",
      rank: 48,
      re: new RegExp(
        String.raw`(?:^|[\n;])\s*[àa]\s*payer\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      // Exige €/eur pour ne pas confondre avec « Date de prélèvement : 24/11/2025 ».
      label: "montant_a_payer",
      rank: 45,
      re: new RegExp(
        String.raw`(?:montant\s*(?:du|de)\s*)?(?:pr[ée]l[èe]vement|pr[ée]lever)\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_REQ}`,
        "gi"
      )
    },
    {
      label: "net_a_payer",
      rank: 48,
      re: new RegExp(
        String.raw`(?:net\s*[àa]\s*payer|salaire\s*net(?:\s*[àa]\s*payer)?)\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },

    // ——— TTC (totaux d’abord ; puis ordre inversé « 9,99 € TTC ») ———
    {
      label: "TTC",
      rank: 42,
      re: new RegExp(
        String.raw`${FINAL_DUE}\s*\(?\s*${TTC_WORD}\s*\)?\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "TTC",
      rank: 40,
      re: new RegExp(
        String.raw`(?:montant\s*total|total(?:\s*(?:g[ée]n[ée]ral|de\s*la\s*facture))?|montant)\s*\(?\s*${TTC_WORD}\s*\)?\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "TTC",
      rank: 36,
      re: new RegExp(
        String.raw`${AMOUNT_NUM}[ \t]*${CURRENCY_OPT}[ \t]*${TTC_WORD}\b`,
        "gi"
      )
    },
    {
      label: "TTC",
      rank: 28,
      re: new RegExp(
        String.raw`\(?\s*${TTC_WORD}\s*\)?\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },

    // ——— HT (totaux d’abord ; « prix HT » plus faible ; ordre inversé) ———
    {
      label: "HT",
      rank: 35,
      re: new RegExp(
        String.raw`(?:montant\s*total|total(?:\s*(?:g[ée]n[ée]ral|de\s*la\s*facture))?|montant)\s*\(?\s*${HT_WORD}\s*\)?\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "HT",
      rank: 22,
      re: new RegExp(
        String.raw`${AMOUNT_NUM}[ \t]*${CURRENCY_OPT}[ \t]*${HT_WORD}\b`,
        "gi"
      )
    },
    {
      label: "HT",
      rank: 12,
      re: new RegExp(
        String.raw`(?:prix\s*)?${HT_WORD}\s*[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },

    // ——— TVA : consommer le taux (20 %) avant le montant ; ordre inversé ———
    {
      label: "TVA",
      rank: 30,
      re: new RegExp(
        String.raw`(?:montant\s*(?:de\s*(?:la\s*)?)?)?(?:t\.?\s*v\.?\s*a\.?|tva)\s*(?:\d+[.,]?\d*\s*%\s*)?[:=]?\s*${AMOUNT_NUM}\s*${CURRENCY_OPT}`,
        "gi"
      )
    },
    {
      label: "TVA",
      rank: 26,
      re: new RegExp(
        String.raw`${AMOUNT_NUM}[ \t]*${CURRENCY_OPT}[ \t]*(?:de[ \t]+)?(?:t\.?\s*v\.?\s*a\.?|tva)\b`,
        "gi"
      )
    }
  ];

  for (const { label, rank, re } of patterns) {
    for (const match of text.matchAll(re)) {
      const rawNum = match[1];
      const value = parseFrenchAmount(rawNum);
      if (value === null) {
        continue;
      }

      // Rejeter un « montant TVA » qui n’est clairement qu’un taux (ex. match « TVA 20 » sans €).
      if (label === "TVA" && isLikelyVatRateNotAmount(match[0], value)) {
        continue;
      }

      const key = `${label}:${value}`;
      const existing = byKey.get(key);
      if (existing && (existing.rank || 0) >= rank) {
        continue;
      }
      byKey.set(key, {
        raw: match[0].trim(),
        value,
        currency: "EUR",
        label,
        rank,
        page: null
      });
    }
  }

  return [...byKey.values()].sort((a, b) => (b.rank || 0) - (a.rank || 0));
}

/**
 * Priorité montant principal facture/devis :
 * amountToPay → amountTTC → netToPay → amountHT (dernier recours).
 */
export function selectPrincipalAmountValue(fields: {
  amountToPay?: number | null;
  amountTTC?: number | null;
  netToPay?: number | null;
  amountHT?: number | null;
}): { value: number | null; source: string | null } {
  if (fields.amountToPay != null && Number.isFinite(fields.amountToPay)) {
    return { value: fields.amountToPay, source: "amountToPay" };
  }
  if (fields.amountTTC != null && Number.isFinite(fields.amountTTC)) {
    return { value: fields.amountTTC, source: "amountTTC" };
  }
  if (fields.netToPay != null && Number.isFinite(fields.netToPay)) {
    return { value: fields.netToPay, source: "netToPay" };
  }
  if (fields.amountHT != null && Number.isFinite(fields.amountHT)) {
    return { value: fields.amountHT, source: "amountHT" };
  }
  return { value: null, source: null };
}

/** « TVA 20 » / « TVA 20% » sans montant monétaire réel → pas un amount. */
function isLikelyVatRateNotAmount(rawMatch: string, value: number): boolean {
  const compact = rawMatch.replace(/\s+/g, " ").trim();
  // Taux usuels FR capturés seuls (sans décimales monétaires ni symbole €).
  const commonRates = new Set([2.1, 5.5, 10, 20]);
  if (!commonRates.has(value)) {
    return false;
  }
  const hasCurrency = /€|eur|euros?/i.test(compact);
  const hasMoneyDecimals = /,\d{2}\b/.test(compact) || /\.\d{2}\b/.test(compact);
  // « TVA 20% » ou « TVA 20 » sans € ni ,xx → taux, pas montant.
  if (/%/.test(compact) && !hasCurrency && !hasMoneyDecimals) {
    return true;
  }
  if (!hasCurrency && !hasMoneyDecimals && /tva\s*\d+/i.test(compact)) {
    return true;
  }
  return false;
}

/**
 * Choisit le meilleur montant parmi des labels, en privilégiant le rang
 * puis une cohérence HT + TVA ≈ TTC si disponible.
 */
export function pickBestAmount(
  amounts: LocalAmountFinding[],
  labels: string[],
  opts?: { preferReconcileWith?: { ht?: number | null; tva?: number | null } }
): number | null {
  const candidates = amounts.filter(
    (item) =>
      item.value != null &&
      Number.isFinite(item.value) &&
      labels.includes(String(item.label || ""))
  );
  if (!candidates.length) {
    return null;
  }

  const ht = opts?.preferReconcileWith?.ht;
  const tva = opts?.preferReconcileWith?.tva;
  const canReconcile =
    ht != null && tva != null && Number.isFinite(ht) && Number.isFinite(tva);

  candidates.sort((a, b) => {
    const rankDiff = (b.rank || 0) - (a.rank || 0);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (canReconcile) {
      const target = (ht as number) + (tva as number);
      const da = Math.abs((a.value as number) - target);
      const db = Math.abs((b.value as number) - target);
      return da - db;
    }
    return 0;
  });

  return candidates[0].value ?? null;
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
      /^(facture|devis|contrat|bulletin|releve|ordonnance|objet|total|prix|tva|date|montant|somme)\b/.test(
        compact
      )
    ) {
      continue;
    }
    // Évite les montants / lignes numériques (ex. « 8.33 EUR »)
    if (/^\d/.test(line.trim()) || /\b\d+[.,]\d{2}\b/.test(line)) {
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
