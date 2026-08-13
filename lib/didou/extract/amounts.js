/**
 * C — Extraction générique des montants V2.
 *
 * Objectifs :
 * - détecter les montants en euros ;
 * - conserver davantage de contexte ;
 * - mémoriser ce qui se trouve avant / après ;
 * - conserver la ligne source ;
 * - ne plus classer automatiquement du plus gros au plus petit ;
 * - préparer les données pour roles.js / invoice.js.
 */

import {
  formatEuro,
  normalizeAmountKey,
  parseFrenchAmount
} from "../normalize/text.js";

/*
 * Exemples :
 * 25,99 €
 * 1 175,00 €
 * 10.640,50 EUR
 */
const AMOUNT_RE =
  /(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\s*(?:€|EUR|euros?)(?=\s|$|[.,;:)])/gi;

/*
 * Exemples :
 * € 25,99
 * EUR 1 175,00
 */
const AMOUNT_EUR_FIRST_RE =
  /(?:€|EUR)\s*(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})(?=\s|$|[.,;:)])/gi;

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractAmounts(text) {
  const source = String(text || "");

  const results = [];
  const seen = new Set();

  collectAmounts(
    source,
    AMOUNT_RE,
    results,
    seen
  );

  collectAmounts(
    source,
    AMOUNT_EUR_FIRST_RE,
    results,
    seen
  );

  /*
   * IMPORTANT :
   * on conserve l'ordre naturel du document.
   *
   * Ne PAS trier par valeur numérique.
   *
   * Cela permet aux couches suivantes de raisonner
   * sur la position réelle des montants.
   */
  return results.sort(
    (a, b) =>
      a.index - b.index
  );
}

/**
 * Collecte générique.
 */
function collectAmounts(
  source,
  regex,
  results,
  seen
) {
  regex.lastIndex = 0;

  let match;

  while (
    (
      match =
        regex.exec(source)
    )
  ) {
    const rawNumber =
      match[1] ||
      match[0];

    const numeric =
      parseFrenchAmount(
        rawNumber
      );

    if (
      !Number.isFinite(
        numeric
      )
    ) {
      continue;
    }

    if (
      numeric <= 0
    ) {
      continue;
    }

    const formatted =
      formatEuro(
        numeric
      );

    const key =
      normalizeAmountKey(
        formatted
      );

    const matchIndex =
      Number(
        match.index
      ) || 0;

    const rawMatch =
      String(
        match[0] ||
        ""
      ).trim();

    /*
     * Contexte large.
     */
    const context =
      snippetAround(
        source,
        matchIndex,
        rawMatch.length,
        180
      );

    /*
     * Contexte avant / après séparés.
     */
    const before =
      snippetBefore(
        source,
        matchIndex,
        180
      );

    const after =
      snippetAfter(
        source,
        matchIndex +
          rawMatch.length,
        180
      );

    /*
     * Ligne exacte.
     */
    const line =
      extractLineAt(
        source,
        matchIndex
      );

    /*
     * Paragraphe proche.
     */
    const paragraph =
      extractParagraphAt(
        source,
        matchIndex
      );

    /*
     * Déduplication :
     * même valeur + même emplacement approximatif.
     */
    const dedupe =
      `${key}|${Math.floor(
        matchIndex / 20
      )}`;

    if (
      seen.has(
        dedupe
      )
    ) {
      continue;
    }

    seen.add(
      dedupe
    );

    /*
     * Signaux contextuels simples.
     *
     * Ce ne sont PAS encore des rôles.
     * Ils servent uniquement d'indices
     * pour les couches suivantes.
     */
    const hints =
      detectAmountHints({
        before,
        after,
        line,
        context,
        paragraph
      });

    results.push({
      raw:
        rawMatch,

      value:
        formatted,

      numeric,

      key,

      index:
        matchIndex,

      context,

      before,

      after,

      line,

      paragraph,

      hints,

      confidence:
        calculateBaseConfidence({
          numeric,
          line,
          context,
          hints
        })
    });
  }
}

/**
 * =====================================================
 * INDICES CONTEXTUELS
 * =====================================================
 */

function detectAmountHints({
  before,
  after,
  line,
  context,
  paragraph
}) {

  const hints = [];

  const local =
    normalizeText(
      [
        before.slice(-80),
        line,
        after.slice(0, 80)
      ].join(" ")
    );

  const wide =
    normalizeText(
      [
        context,
        paragraph
      ].join(" ")
    );

  /*
   * Paiement dû
   */
  if (
    /montant a payer|net a payer|reste a payer|total a regler|somme a regler/.test(local)
  ) {
    hints.push("payment_due");
  }

  /*
   * Prélèvement automatique
   */
  if (
    /prelevement automatique|sera preleve|sera debite|montant du prelevement/.test(local)
  ) {
    hints.push("automatic_debit");
  }

  /*
   * Remboursement
   *
   * UNIQUEMENT contexte proche.
   */
  if (
    /remboursement|rembourserons|vous serez rembourse|avoir en votre faveur|credit en votre faveur/.test(local)
  ) {
    hints.push("refund");
  }

  /*
   * Déjà payé
   */
  if (
    /deja paye|deja regle|paiement effectue|paiement recu|facture acquittee/.test(local)
  ) {
    hints.push("already_paid");
  }

  /*
   * TVA
   */
  if (
    /\btva\b|dont tva|montant tva/.test(local)
  ) {
    hints.push("vat");
  }

  /*
   * HT
   */
  if (
    /\bht\b|montant ht|base ht/.test(local)
  ) {
    hints.push("ht");
  }

  /*
   * TTC
   */
  if (
    /total ttc|toutes taxes comprises/.test(local)
  ) {
    hints.push("total_ttc");
  }

  /*
   * Mentions légales société
   */
  if (
    /capital social|au capital de|capital de la societe/.test(wide)
  ) {
    hints.push("company_legal");
  }

  /*
   * Ligne de facture
   */
  if (
    /abonnement|forfait|consommation|prix unitaire|quantite|kwh/.test(local)
  ) {
    hints.push("invoice_line");
  }

  return [...new Set(hints)];
}
  const all =
    normalizeText(
      [
        before,
        line,
        after,
        context,
        paragraph
      ].join(" ")
    );

  const hints = [];

  if (
    /montant a payer|net a payer|reste a payer|total a regler|somme a regler/.test(
      all
    )
  ) {
    hints.push(
      "payment_due"
    );
  }

  if (
    /prelevement automatique|sera preleve|montant preleve|total du montant preleve|montant du prelevement|sera debite/.test(
      all
    )
  ) {
    hints.push(
      "automatic_debit"
    );
  }

  if (
    /nous vous rembourserons|vous serez rembourse|remboursement|avoir en votre faveur|credit en votre faveur|solde crediteur/.test(
      all
    )
  ) {
    hints.push(
      "refund"
    );
  }

  if (
    /deja paye|deja regle|paiement effectue|paiement recu|a ete preleve|facture acquittee/.test(
      all
    )
  ) {
    hints.push(
      "already_paid"
    );
  }

  if (
    /capital social|au capital de|capital de la societe|capital souscrit|capital detenu/.test(
      all
    )
  ) {
    hints.push(
      "company_legal"
    );
  }

  if (
    /\btva\b|dont tva|tva payee|montant tva/.test(
      all
    )
  ) {
    hints.push(
      "vat"
    );
  }

  if (
    /\bht\b|montant ht|base ht/.test(
      all
    )
  ) {
    hints.push(
      "ht"
    );
  }

  if (
    /total ttc|toutes taxes comprises/.test(
      all
    )
  ) {
    hints.push(
      "total_ttc"
    );
  }

  if (
    /mensualite|mensualites|echeancier/.test(
      all
    )
  ) {
    hints.push(
      "installment"
    );
  }

  if (
    /abonnement|forfait|option|consommation|prix unitaire|quantite|kwh/.test(
      all
    )
  ) {
    hints.push(
      "invoice_line"
    );
  }

  return [
    ...new Set(
      hints
    )
  ];
}

/**
 * =====================================================
 * CONFIANCE DE BASE
 * =====================================================
 */

function calculateBaseConfidence({
  numeric,
  line,
  context,
  hints
}) {
  let confidence = 60;

  /*
   * Montant bien entouré de texte.
   */
  if (
    String(line || "")
      .length >= 10
  ) {
    confidence += 5;
  }

  if (
    String(context || "")
      .length >= 40
  ) {
    confidence += 5;
  }

  /*
   * Signaux métier.
   */
  if (
    hints.includes(
      "payment_due"
    ) ||
    hints.includes(
      "automatic_debit"
    ) ||
    hints.includes(
      "refund"
    ) ||
    hints.includes(
      "already_paid"
    )
  ) {
    confidence += 15;
  }

  /*
   * Mentions légales :
   * montant détecté mais pas utilisateur.
   */
  if (
    hints.includes(
      "company_legal"
    )
  ) {
    confidence -= 20;
  }

  /*
   * Montants gigantesques :
   * prudence.
   */
  if (
    numeric >= 1000000
  ) {
    confidence -= 15;
  }

  return clamp(
    confidence,
    25,
    95
  );
}

/**
 * =====================================================
 * EXTRACTION DES CONTEXTES
 * =====================================================
 */

function snippetAround(
  text,
  index,
  matchLength,
  radius
) {
  const start =
    Math.max(
      0,
      index - radius
    );

  const end =
    Math.min(
      text.length,
      index +
        matchLength +
        radius
    );

  return cleanWhitespace(
    text.slice(
      start,
      end
    )
  );
}

function snippetBefore(
  text,
  index,
  radius
) {
  const start =
    Math.max(
      0,
      index - radius
    );

  return cleanWhitespace(
    text.slice(
      start,
      index
    )
  );
}

function snippetAfter(
  text,
  index,
  radius
) {
  const end =
    Math.min(
      text.length,
      index + radius
    );

  return cleanWhitespace(
    text.slice(
      index,
      end
    )
  );
}

function extractLineAt(
  text,
  index
) {
  const before =
    text.lastIndexOf(
      "\n",
      index
    );

  const after =
    text.indexOf(
      "\n",
      index
    );

  const start =
    before >= 0
      ? before + 1
      : 0;

  const end =
    after >= 0
      ? after
      : text.length;

  return cleanWhitespace(
    text.slice(
      start,
      end
    )
  );
}

function extractParagraphAt(
  text,
  index
) {
  /*
   * On cherche le double retour à la ligne
   * avant / après.
   */

  const before =
    text.lastIndexOf(
      "\n\n",
      index
    );

  const after =
    text.indexOf(
      "\n\n",
      index
    );

  const start =
    before >= 0
      ? before + 2
      : Math.max(
          0,
          index - 300
        );

  const end =
    after >= 0
      ? after
      : Math.min(
          text.length,
          index + 300
        );

  return cleanWhitespace(
    text.slice(
      start,
      end
    )
  );
}

/**
 * =====================================================
 * OUTILS TEXTE
 * =====================================================
 */

function cleanWhitespace(
  value
) {
  return String(
    value ||
    ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function normalizeText(
  value
) {
  return String(
    value ||
    ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}
