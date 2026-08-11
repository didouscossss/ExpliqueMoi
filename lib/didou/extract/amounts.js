/**
 * C — Extraction générique des montants.
 */

import {
  formatEuro,
  normalizeAmountKey,
  parseFrenchAmount
} from "../normalize/text.js";

// Montant avec devise après.
// Pas de \b après € : € n'est pas un word-char.
const AMOUNT_RE =
  /(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\s*(?:€|EUR|euros?)(?=\s|$|[.,;:)])/gi;

// Devise avant le montant.
const AMOUNT_EUR_FIRST_RE =
  /(?:€|EUR)\s*(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})(?=\s|$|[.,;:)])/gi;

/*
 * Totaux explicitement libellés.
 *
 * Cette règle est volontairement plus tolérante :
 * le symbole € peut avoir été perdu ou mal OCRisé.
 *
 * Exemples :
 *   Montant du (TTC) 115,27 €
 *   Total TTC : 115,27
 *   Net à payer 82,40 EUR
 *   Montant à payer : 12,99 €
 */
const LABELED_TOTAL_RE =
  /(?:montant\s+(?:du\s*)?\(?\s*ttc\s*\)?|montant\s+ttc|total\s+ttc|net\s+[àa]\s+payer|montant\s+[àa]\s+payer|reste\s+[àa]\s+payer|total\s+[àa]\s+r[ée]gler)\s*[:=\-]?\s*(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})(?:\s*(?:€|EUR|euros?))?/gi;

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractAmounts(text) {
  const source = String(text || "");
  const results = [];
  const seen = new Map();

  /**
   * Ajoute ou remplace un montant si une occurrence
   * plus fiable du même montant/contexte est trouvée.
   */
  const addResult = ({
    raw,
    numeric,
    context,
    confidence,
    index,
    sourceType
  }) => {
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return;
    }

    const formatted = formatEuro(numeric);
    const key = normalizeAmountKey(formatted);

    const normalizedContext = String(context || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    /*
     * On conserve plusieurs occurrences d'un même montant
     * lorsqu'elles apparaissent réellement à des endroits
     * différents du document.
     */
    const dedupeKey =
      `${key}|${Math.floor(Number(index || 0) / 35)}|` +
      normalizedContext.slice(0, 55);

    const result = {
      raw: String(raw || "").trim(),
      value: formatted,
      numeric,
      key,
      context,
      confidence,
      sourceType,
      index: Number(index || 0)
    };

    const previous = seen.get(dedupeKey);

    if (!previous) {
      seen.set(dedupeKey, result);
      return;
    }

    if ((result.confidence || 0) > (previous.confidence || 0)) {
      seen.set(dedupeKey, result);
    }
  };

  /**
   * Extraction standard des valeurs avec devise.
   */
  const collectStandard = (regex, sourceType) => {
    regex.lastIndex = 0;

    let match;

    while ((match = regex.exec(source))) {
      const rawNumber = match[1] || match[0];
      const numeric = parseFrenchAmount(rawNumber);

      if (!Number.isFinite(numeric) || numeric <= 0) {
        continue;
      }

      const context = evidenceAround(
        source,
        match.index,
        match[0]
      );

      addResult({
        raw: match[0],
        numeric,
        context,
        confidence: inferAmountConfidence(context, 60),
        index: match.index,
        sourceType
      });
    }
  };

  collectStandard(AMOUNT_RE, "currency-after");
  collectStandard(AMOUNT_EUR_FIRST_RE, "currency-before");

  /**
   * Deuxième passe :
   * recherche spécifique des totaux clairement libellés.
   *
   * Elle permet notamment de récupérer un total lorsque
   * Tesseract a perdu le symbole €.
   */
  LABELED_TOTAL_RE.lastIndex = 0;

  let totalMatch;

  while ((totalMatch = LABELED_TOTAL_RE.exec(source))) {
    const rawNumber = totalMatch[1];
    const numeric = parseFrenchAmount(rawNumber);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }

    const context = cleanEvidence(totalMatch[0]);

    addResult({
      raw: totalMatch[0],
      numeric,
      context,
      confidence: 94,
      index: totalMatch.index,
      sourceType: "explicit-total"
    });
  }

  const finalResults = [...seen.values()];

  /*
   * On garde le comportement historique :
   * montants les plus élevés en premier.
   *
   * invoice.js ne dépend cependant plus uniquement
   * de cet ordre puisqu'il applique maintenant son score.
   */
  finalResults.sort((a, b) => {
    /*
     * Les totaux explicitement identifiés ont priorité.
     */
    if (
      a.sourceType === "explicit-total" &&
      b.sourceType !== "explicit-total"
    ) {
      return -1;
    }

    if (
      b.sourceType === "explicit-total" &&
      a.sourceType !== "explicit-total"
    ) {
      return 1;
    }

    /*
     * Puis confiance.
     */
    const confidenceDiff =
      (b.confidence || 0) - (a.confidence || 0);

    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }

    /*
     * Puis valeur numérique.
     */
    return b.numeric - a.numeric;
  });

  /*
   * index/sourceType sont utiles au moteur mais
   * ne posent aucun problème s'ils restent dans l'objet.
   */
  return finalResults;
}

/**
 * Construit un contexte OCR autour d'un montant.
 *
 * Point important :
 * une ligne OCR de tableau peut contenir plusieurs montants.
 * Dans ce cas on ne renvoie PLUS toute la ligne.
 */
function evidenceAround(text, index, rawMatch) {
  const source = String(text || "");
  const rawLength = String(rawMatch || "").length;

  const beforeNl = source.lastIndexOf(
    "\n",
    Math.max(0, index - 1)
  );

  const afterNl = source.indexOf(
    "\n",
    index + rawLength
  );

  const lineStart =
    beforeNl >= 0 ? beforeNl + 1 : 0;

  const lineEnd =
    afterNl >= 0 ? afterNl : source.length;

  const rawLine = source.slice(lineStart, lineEnd);
  const line = cleanEvidence(rawLine);

  /*
   * Compte le nombre de montants présents sur cette ligne.
   */
  const amountCount = countAmountsInText(rawLine);

  /*
   * Une ligne courte ne contenant qu'un montant
   * reste la meilleure preuve.
   */
  if (
    line &&
    line.length <= 220 &&
    amountCount <= 1
  ) {
    return line;
  }

  /*
   * Tableau / ligne contenant plusieurs montants :
   * contexte local beaucoup plus précis.
   *
   * On privilégie ce qui se trouve AVANT le montant,
   * car le libellé d'une ligne comptable est généralement
   * situé à gauche.
   */
  const localStart = Math.max(
    lineStart,
    index - 75
  );

  const localEnd = Math.min(
    lineEnd,
    index + rawLength + 28
  );

  const local = cleanEvidence(
    source.slice(localStart, localEnd)
  );

  if (local) {
    return local;
  }

  /*
   * Fallback avec fenêtre plus large.
   */
  const start = Math.max(0, index - 70);
  const end = Math.min(
    source.length,
    index + rawLength + 70
  );

  return cleanEvidence(
    source.slice(start, end)
  );
}

/**
 * Compte approximativement les montants présents
 * dans une portion de texte.
 */
function countAmountsInText(value) {
  const text = String(value || "");

  const regex =
    /\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?\s*(?:€|EUR|euros?)/gi;

  const matches = text.match(regex);

  return matches ? matches.length : 0;
}

/**
 * Ajuste la confiance selon le contexte.
 */
function inferAmountConfidence(context, base = 60) {
  const ctx = String(context || "").toLowerCase();

  /*
   * Total clairement identifié.
   */
  if (
    /montant\s+(?:du\s*)?\(?\s*ttc\s*\)?|montant\s+ttc|total\s+ttc|net\s+[àa]\s+payer|montant\s+[àa]\s+payer|reste\s+[àa]\s+payer/.test(
      ctx
    )
  ) {
    return 92;
  }

  /*
   * Ligne de détail.
   */
  if (
    /\babonnement(?:s)?|forfait|part\s+fixe|part\s+variable|régularisation|regularisation\b/.test(
      ctx
    )
  ) {
    return 58;
  }

  /*
   * HT / TVA.
   */
  if (/\bht\b|\btva\b/.test(ctx)) {
    return 65;
  }

  return base;
}

function cleanEvidence(value) {
  return String(value || "")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .slice(0, 220);
}
