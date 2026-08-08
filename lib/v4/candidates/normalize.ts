/**
 * Normalisation locale des valeurs FR (montants, %, dates).
 * Pure — pas d’I/O.
 */

/** Normalise espaces / casse pour matching lexical. */
export function normalizeLex(text: string): string {
  let s = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Tolérance OCR légère (pas un moteur OCR) : 0↔o dans labels courants
  // ex. t0tal → total, m0ntant → montant, tva2o% → tva20%
  s = s
    .replace(/(?<=[a-z])0(?=[a-z])/g, "o")
    .replace(/(?<=\d)o(?=\d)/g, "0")
    .replace(/(?<=\d)o(?=\s*%)/g, "0")
    .replace(/\bo(?=\d+\s*%)/g, "0");
  return s;
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

const MONTHS_FR: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12
};

function toIso(yyyy: number, mm: number, dd: number): string | null {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

/** Date FR → ISO YYYY-MM-DD si fiable (numérique ou « 15 septembre 2026 »). */
export function parseFrenchDate(raw: string): string | null {
  const text = String(raw || "");
  const num = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (num) {
    let dd = Number(num[1]);
    let mm = Number(num[2]);
    let yyyy = Number(num[3]);
    if (yyyy < 100) yyyy += 2000;
    return toIso(yyyy, mm, dd);
  }
  const lex = normalizeLex(text);
  const named = lex.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/
  );
  if (named) {
    const dd = Number(named[1]);
    const mm = MONTHS_FR[named[2]];
    const yyyy = Number(named[3]);
    if (!mm) return null;
    return toIso(yyyy, mm, dd);
  }
  return null;
}

export function stripCurrency(raw: string): string {
  return String(raw || "")
    .replace(/[€]/g, "")
    .replace(/\beuros?\b/gi, "")
    .replace(/\beur\b/gi, "")
    .trim();
}
