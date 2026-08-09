/**
 * A — Normalisation du texte extrait (local, déterministe).
 */

const NBSP = /\u00a0/g;
const MULTI_SPACE = /[ \t]+/g;
const MULTI_NL = /\n{3,}/g;

/**
 * @param {string} input
 * @returns {{ text: string, lines: string[], pages: Array<{ page: number, text: string }> }}
 */
export function normalizeDocumentText(input) {
  const pages = Array.isArray(input?.pages)
    ? input.pages.map((page, index) => ({
        page: Number(page.page || page.pageNumber || index + 1),
        text: normalizePlainText(page.text || page.content || "")
      }))
    : [];

  const pasted = normalizePlainText(input?.text || input?.pastedText || "");
  const joinedPages = pages.map((p) => p.text).filter(Boolean).join("\n\n");
  const text = [pasted, joinedPages].filter(Boolean).join("\n\n").trim();
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return { text, lines, pages };
}

export function normalizePlainText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(NBSP, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(MULTI_SPACE, " ")
    .replace(MULTI_NL, "\n\n")
    .trim();
}

/** Normalise un montant FR/EN vers nombre. */
export function parseFrenchAmount(value) {
  const text = String(value || "")
    .replace(/\s/g, "")
    .replace(/€|eur(os)?/gi, "")
    .replace(/\u00a0/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

export function formatEuro(value) {
  if (!Number.isFinite(value)) return null;
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

export function normalizeAmountKey(value) {
  const n = parseFrenchAmount(value);
  if (Number.isFinite(n)) return n.toFixed(2);
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** Clé de date comparable (YYYY-MM-DD ou texte normalisé). */
export function normalizeDateKey(value) {
  const text = String(value || "")
    .toLowerCase()
    .trim();
  if (!text) return "";

  const numeric = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    let year = numeric[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const months = {
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

  const verbal = text.match(
    /(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})/i
  );
  if (verbal) {
    const day = verbal[1].padStart(2, "0");
    const monthRaw = verbal[2]
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace("fevrier", "fevrier")
      .replace("aout", "aout")
      .replace("decembre", "decembre");
    const month = months[monthRaw] || "00";
    return `${verbal[3]}-${month}-${day}`;
  }

  // Période mois année
  const monthYear = text.match(
    /^(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})$/i
  );
  if (monthYear) {
    const monthRaw = monthYear[1]
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const month = months[monthRaw] || "00";
    return `${monthYear[2]}-${month}`;
  }

  return text.replace(/\s+/g, " ");
}
