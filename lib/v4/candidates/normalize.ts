/**
 * Normalisation locale des valeurs FR (montants, %, dates).
 * Pure — pas d’I/O.
 */

/** Normalise espaces / casse pour matching lexical. */
export function normalizeLex(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse un montant français / OCR :
 * - 1 103,14 €
 * - 1103.14 EUR
 * - 1.103,14 €
 * - 25,99
 */
export function parseFrenchMoney(raw: string): number | null {
  let s = String(raw || "")
    .replace(/€|eur|euros?/gi, "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!s) return null;

  // 1.103,14 ou 1 103,14
  if (/\d{1,3}(?:[.\s]\d{3})+,\d{1,2}$/.test(s.replace(/\s/g, (m) => m))) {
    s = s.replace(/[.\s]/g, "").replace(",", ".");
  } else if (/\d+,\d{1,2}$/.test(s)) {
    // 21,66
    s = s.replace(/\s/g, "").replace(",", ".");
  } else if (/\d+\.\d{1,2}$/.test(s) && !/\d+\.\d{3},/.test(raw)) {
    // 1103.14
    s = s.replace(/\s/g, "");
  } else {
    s = s.replace(/\s/g, "").replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse « 20 % », « 20,00% », « 5,5 % ». */
export function parseFrenchPercentage(raw: string): number | null {
  const m = String(raw || "").match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Date FR → ISO YYYY-MM-DD si fiable. */
export function parseFrenchDate(raw: string): string | null {
  const m = String(raw || "").match(
    /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/
  );
  if (!m) return null;
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

export function stripCurrency(raw: string): string {
  return String(raw || "")
    .replace(/[€]/g, "")
    .replace(/\beuros?\b/gi, "")
    .replace(/\beur\b/gi, "")
    .trim();
}
