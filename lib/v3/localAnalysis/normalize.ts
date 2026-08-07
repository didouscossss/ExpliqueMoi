/** Normalisation texte pour heuristiques FR. */

export function normalizeText(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeCompact(text: string): string {
  return normalizeText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function linesOf(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseFrenchAmount(raw: string): number | null {
  const original = String(raw || "").trim();
  // OCR « 9 99 € » / « 9\u00a099 € » : espace/NBSP entre euros et centimes
  const spacedCents = original.match(
    /^(\d{1,3})[ \u00a0](\d{2})\s*(?:€|eur|euros?)?$/i
  );
  if (spacedCents) {
    const value = Number(`${spacedCents[1]}.${spacedCents[2]}`);
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = original
    .replace(/€|eur|euros?/gi, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  // 1 234,56 or 1234,56 or 1.234,56
  let normalized = cleaned;
  if (/,\d{1,2}$/.test(normalized) && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(/\s/g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  let y = Number(year);
  if (y < 100) {
    y += y >= 70 ? 1900 : 2000;
  }
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12"
};

export function parseFrenchMonthName(monthName: string): string | null {
  const key = normalizeCompact(monthName);
  return MONTHS[key] || null;
}
