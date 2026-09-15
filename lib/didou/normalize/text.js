/**
 * A — Normalisation du texte extrait (local, déterministe).
 */

const NBSP = /\u00a0/g;
const MULTI_SPACE = /[ \t]+/g;
const MULTI_NL = /\n{3,}/g;

/**
 * @param {string} input
 * @returns {{
 *   text: string,
 *   lines: string[],
 *   pages: Array<{ page: number, text: string }>,
 *   pageOffsets: Array<{ page: number, start: number, end: number }>
 * }}
 */
export function normalizeDocumentText(input) {
  const pages = Array.isArray(input?.pages)
    ? input.pages.map((page, index) => ({
        page: Number(page.page || page.pageNumber || index + 1),
        text: normalizePlainText(page.text || page.content || "")
      }))
    : [];

  const pasted = normalizePlainText(input?.text || input?.pastedText || "");
  const nonEmptyPages = pages.filter((p) => p.text);
  const joinedPages = nonEmptyPages.map((p) => p.text).join("\n\n");
  const text = [pasted, joinedPages].filter(Boolean).join("\n\n").trim();
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  /*
   * Offsets de chaque page dans `text`, pour pouvoir relier une
   * date/un montant/une action (extraits avec un offset de
   * caractère dans `text`) à la page physique dont il provient —
   * sans quoi la classification par page (Document Structure
   * Engine) ne peut influencer aucune décision en aval.
   *
   * `text` est reconstruit ici exactement comme ci-dessus : si
   * cette logique de jointure change, ces deux blocs doivent
   * changer ensemble.
   */
  const pageOffsets = [];
  /*
   * Chaque composant (`pasted`, chaque page) est déjà trim() par
   * normalizePlainText : la chaîne assemblée n'a ni espace de
   * tête ni espace de fin, donc le `.trim()` final sur `text` est
   * un no-op et ne décale rien par rapport au calcul ci-dessous.
   */
  let cursor = pasted ? pasted.length + 2 : 0; // "\n\n" séparateur

  for (const page of nonEmptyPages) {
    const start = cursor;
    const end = start + page.text.length;
    pageOffsets.push({ page: page.page, start, end });
    cursor = end + 2; // "\n\n" séparateur avant la page suivante
  }

  return { text, lines, pages, pageOffsets };
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

/**
 * Convertit une date au format "20 juillet 2026" (courante dans un
 * courrier français réel) en "20/07/2026", le format numérique
 * utilisé partout ailleurs dans Didou (affichage, comparaisons,
 * fixtures de tests...). Une date déjà numérique ("20/07/2026",
 * "20-07-2026"...) est simplement renormalisée avec des "/" et un
 * jour/mois sur 2 chiffres. Retourne la valeur d'origine si elle ne
 * correspond à aucun de ces deux formats (ex. "juillet 2026" seul).
 */
export function toDigitDate(value) {
  const text = String(value || "")
    .trim();
  if (!text) return text;

  const numeric = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    let year = numeric[3];
    if (year.length === 2) year = `20${year}`;
    return `${day}/${month}/${year}`;
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
    /^(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})$/i
  );
  if (verbal) {
    const day = verbal[1].padStart(2, "0");
    const monthRaw = verbal[2]
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const month = months[monthRaw] || null;
    if (month) {
      return `${day}/${month}/${verbal[3]}`;
    }
  }

  return text;
}

/**
 * Heure/lieu d'un rendez-vous (audience, rendez-vous médical,
 * entretien...) à partir du seul extrait de contexte déjà disponible
 * autour d'une date — pas besoin du texte source complet. Utilisé à
 * la fois par adapters/generic.js et brain/fusion.js : jusqu'ici,
 * seule l'assemblée générale de copropriété (adapters/condoMeeting.js)
 * bénéficiait d'une extraction heure/lieu — tout autre type de
 * rendez-vous ressortait sans heure ni lieu dans `mainDate`, même
 * quand l'un ou l'autre était écrit juste à côté de la date.
 */
export function extractMeetingTimeFromContext(context) {
  const text = String(context || "");

  const match =
    text.match(/(?<![a-zà-ÿ])(?:à|a)\s+(\d{1,2})\s*h\s*(\d{2})?(?![a-zà-ÿ])/i) ||
    text.match(/(?<![a-zà-ÿ])(?:à|a)\s+(\d{1,2}):(\d{2})\b/i);

  if (!match) return null;

  const hour = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;

  if (!Number.isFinite(hour) || hour > 23 || !Number.isFinite(minutes) || minutes > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function extractMeetingPlaceFromContext(context) {
  const text = String(context || "");

  const match =
    text.match(
      /\b(?:se tiendra|aura lieu)[\s\S]{0,60}?(?<![a-zà-ÿ])(?:à|a|au|aux)\s+(?!\d{1,2}\s*(?:h\s*\d{0,2}\b|:\s*\d{2}\b))([^.\n(][^.\n(]{2,140})/i
    ) ||
    text.match(
      /\br(?:é|e)uni[a-z]*[\s\S]{0,60}?(?<![a-zà-ÿ])(?:à|a|au|aux)\s+(?!\d{1,2}\s*(?:h\s*\d{0,2}\b|:\s*\d{2}\b))([^.\n(][^.\n(]{2,140})/i
    ) ||
    /*
     * Heure suivie directement du lieu, avec ou sans préposition
     * répétée ("à 9h00, Salle 3..." / "à 10h00, au centre
     * d'expertise médicale...") — aussi courant qu'un seul "à
     * [lieu]" explicite. Ne se déclenche que si ce qui suit
     * ressemble vraiment à un lieu (mot-clé de bâtiment/salle ou
     * numéro de rue), pour éviter de capturer une phrase quelconque.
     */
    text.match(
      /\d{1,2}\s*(?:h\s*\d{0,2}|:\d{2})\s*,?\s*(?:(?:à|a|au|aux)\s+)?((?:\d{1,4}\s+(?:rue|avenue|av|boulevard|bd|route|chemin|impasse|allee|allée|place|quai|cours)\b|(?:salle|mairie|h[oô]tel|centre|residence|résidence|local|agence|tribunal|palais de justice)\b)[^.\n(]{0,140})/i
    );

  if (!match?.[1]) return null;

  const place = String(match[1])
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;:\-–—\s]+$/, "")
    .trim();

  return place.length >= 4 ? place : null;
}

/**
 * Retrouve le numéro de page physique correspondant à un offset
 * de caractère dans le texte joint (voir `normalizeDocumentText`).
 * Retourne `null` si aucune page ne correspond (texte collé sans
 * pages, offset hors limites...).
 */
export function resolvePageForOffset(pageOffsets, offset) {
  if (!Array.isArray(pageOffsets) || !pageOffsets.length) {
    return null;
  }

  const index = Number(offset);
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }

  const match = pageOffsets.find(
    (entry) => index >= entry.start && index < entry.end
  );

  return match ? match.page : null;
}
