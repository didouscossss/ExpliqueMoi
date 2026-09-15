/**
 * C — Extraction générique des montants V2.1
 *
 * Objectifs :
 * - détecter les montants en euros ;
 * - conserver leur position dans le document ;
 * - fournir du contexte local aux interpréteurs ;
 * - éviter qu'un mot éloigné ("rembourserons", etc.)
 *   contamine plusieurs montants du même paragraphe ;
 * - ne jamais décider ici du montant principal.
 */

import {
  formatEuro,
  normalizeAmountKey,
  parseFrenchAmount
} from "../normalize/text.js";

/**
 * Exemples :
 * 25,99 €
 * 1 175,00 €
 * 10.640,50 EUR
 */
const AMOUNT_RE =
  /(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2})\s*(?:€|EUR|euros?)(?=\s|$|[.,;:)])/gi;

/**
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

  // Toujours conserver l'ordre du document.
  return results.sort(
    (a, b) => a.index - b.index
  );
}

/**
 * Collecte les occurrences correspondant à une regex.
 */
function collectAmounts(
  source,
  regex,
  results,
  seen
) {
  regex.lastIndex = 0;

  let match;

  while ((match = regex.exec(source))) {
    const rawNumber =
      match[1] || match[0];

    const numeric =
      parseFrenchAmount(rawNumber);

    if (!Number.isFinite(numeric)) {
      continue;
    }

    if (numeric <= 0) {
      continue;
    }

    const formatted =
      formatEuro(numeric);

    const key =
      normalizeAmountKey(formatted);

    const matchIndex =
      Number(match.index) || 0;

    const rawMatch =
      String(match[0] || "").trim();

    const before =
      snippetBefore(
        source,
        matchIndex,
        180
      );

    const after =
      snippetAfter(
        source,
        matchIndex + rawMatch.length,
        180
      );

    /*
     * `context` alimente directement le classement de rôle
     * (interpret/roles.js) : "déjà prélevé", "à rembourser",
     * etc. y sont cherchés tels quels. Un document à montants
     * rapprochés ("Montant de l'impôt : 1 850 € Montant déjà
     * prélevé à la source : 1 200 €") ferait sinon hériter au
     * premier montant un statut qui appartient au second — on
     * construit donc `context` à partir des extraits déjà
     * bornés au montant voisin le plus proche, pas du texte
     * brut sur 180 caractères de chaque côté.
     */
    const context =
      cleanWhitespace(
        `${clipBeforeNeighboringAmount(before)} ${rawMatch} ${clipAfterNeighboringAmount(after)}`
      );

    const line =
      extractLineAt(
        source,
        matchIndex
      );

    const paragraph =
      extractParagraphAt(
        source,
        matchIndex
      );

    /**
     * Même valeur + emplacement proche =
     * probablement la même occurrence détectée
     * par les deux regex.
     */
    const dedupe =
      `${key}|${Math.floor(matchIndex / 20)}`;

    if (seen.has(dedupe)) {
      continue;
    }

    seen.add(dedupe);

    const hints =
      detectAmountHints({
        before,
        after,
        line,
        context,
        paragraph
      });

    results.push({
      raw: rawMatch,
      value: formatted,
      numeric,
      key,
      index: matchIndex,

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
 *
 * IMPORTANT :
 *
 * Les signaux financiers sensibles sont recherchés
 * dans une zone PROCHE du montant.
 *
 * On ne doit pas taguer :
 *
 *   1 175 €
 *   ...
 *   nous vous rembourserons 397,63 €
 *
 * comme si les deux montants étaient des remboursements.
 */
function detectAmountHints({
  before,
  after,
  line,
  context,
  paragraph
}) {
  const hints = [];

  /*
   * IMPORTANT :
   * On n'utilise PLUS "line" ni "paragraph"
   * pour les signaux métier.
   *
   * Certains OCR mettent toute une page
   * sur une seule ligne.
   */

  /*
   * =====================================================
   * NE JAMAIS FRANCHIR UN MONTANT VOISIN
   * =====================================================
   *
   * Bug réel corrigé : dans un document à plusieurs montants
   * rapprochés (avis d'impôt, décompte de remboursement...),
   * une étiquette qui qualifie le montant SUIVANT ("Montant
   * déjà prélevé à la source : 1 200 €") pouvait se trouver
   * dans la fenêtre "tout proche" du montant PRÉCÉDENT
   * ("Montant de l'impôt sur le revenu : 1 850 €") dès que les
   * deux étaient à moins de ~65 caractères l'un de l'autre —
   * le second montant héritait alors à tort du rôle du
   * premier.
   *
   * On ne peut pas s'appuyer sur les retours à la ligne (cf.
   * commentaire ci-dessus : un OCR peut aplatir une page
   * entière). On coupe donc `before`/`after` au premier
   * montant voisin rencontré, quelle que soit la mise en
   * forme — un signal métier ne doit jamais être cherché
   * au-delà du montant suivant/précédent.
   */

  const clippedBefore =
    clipBeforeNeighboringAmount(before);

  const clippedAfter =
    clipAfterNeighboringAmount(after);

  const nearBefore =
    normalizeText(
      clippedBefore
        .slice(-120)
    );

  const nearAfter =
    normalizeText(
      clippedAfter
        .slice(0, 120)
    );

  const local =
    `${nearBefore} ${nearAfter}`.trim();

  /*
   * Contexte ultra-proche :
   * utile pour les signaux très sensibles.
   */
  const veryNearBefore =
    normalizeText(
      clippedBefore
        .slice(-65)
    );

  const veryNearAfter =
    normalizeText(
      clippedAfter
        .slice(0, 65)
    );

  const veryLocal =
    `${veryNearBefore} ${veryNearAfter}`.trim();

  /*
   * =====================================================
   * PAIEMENT À EFFECTUER
   * =====================================================
   */

  if (
    /montant a payer|net a payer|reste a payer|total a regler|somme a regler|solde a payer/.test(
      veryLocal
    )
  ) {
    hints.push("payment_due");
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT AUTOMATIQUE
   * =====================================================
   */

  if (
    /prelevement automatique|sera preleve|sera debite|montant preleve|montant du prelevement|total du montant preleve|nous preleverons/.test(
      veryLocal
    )
  ) {
    hints.push("automatic_debit");
  }

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   *
   * Très important :
   * le mot remboursement doit être réellement
   * proche du montant.
   */

  if (
    /nous vous rembourserons|vous serez rembourse|remboursement prevu|remboursement a venir|a vous rembourser|avoir en votre faveur|credit en votre faveur|solde crediteur/.test(
      veryLocal
    )
  ) {
    hints.push("refund");
  }

  /*
   * =====================================================
   * DÉJÀ PAYÉ
   * =====================================================
   */

  if (
    /deja paye|deja regle|paiement effectue|paiement recu|a ete preleve|deja preleve|facture acquittee/.test(
      veryLocal
    )
  ) {
    hints.push("already_paid");
  }

  /*
   * =====================================================
   * CAPITAL SOCIAL
   * =====================================================
   *
   * Ici aussi : contexte réellement proche.
   */

  if (
    /capital social|au capital de|capital de la societe|capital souscrit|capital detenu/.test(
      veryLocal
    )
  ) {
    hints.push("company_legal");
  }

  /*
   * =====================================================
   * TVA
   * =====================================================
   */

  if (
    /dont tva|montant tva|tva\s*[+:=]|tva a/.test(
      veryLocal
    )
  ) {
    hints.push("vat");
  }

  /*
   * =====================================================
   * HT / HTVA
   * =====================================================
   */

  if (
    /montant ht|base ht|total ht|total htva|\bhtva\b/.test(
      veryLocal
    )
  ) {
    hints.push("ht");
  }

  /*
   * =====================================================
   * TTC
   * =====================================================
   */

  if (
    /total ttc|toutes taxes comprises/.test(
      veryLocal
    )
  ) {
    hints.push("total_ttc");
  }

  /*
   * =====================================================
   * MENSUALITÉS
   * =====================================================
   */

  if (
    /mensualite|mensualites|echeancier|echeance mensuelle/.test(
      veryLocal
    )
  ) {
    hints.push("installment");
  }

  /*
   * =====================================================
   * LIGNE DE DÉTAIL
   * =====================================================
   */

  if (
    /abonnement|\bforfait\b|option|consommation|prix unitaire|quantite|kwh|promotion/.test(
      local
    )
  ) {
    hints.push("invoice_line");
  }

  return [...new Set(hints)];
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

  if (
    String(line || "").length >= 10
  ) {
    confidence += 5;
  }

  if (
    String(context || "").length >= 40
  ) {
    confidence += 5;
  }

  if (
    hints.includes("payment_due") ||
    hints.includes("automatic_debit") ||
    hints.includes("refund") ||
    hints.includes("already_paid")
  ) {
    confidence += 15;
  }

  if (
    hints.includes("company_legal")
  ) {
    confidence -= 20;
  }

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
 * CONTEXTES
 * =====================================================
 */

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
    text.slice(start, index)
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
    text.slice(index, end)
  );
}

/**
 * Motif simple pour repérer un AUTRE montant en euros à
 * l'intérieur d'un extrait de contexte (before/after) — sert
 * uniquement à borner les fenêtres de recherche de mots-clés,
 * pas à extraire des montants (voir AMOUNT_RE / AMOUNT_EUR_FIRST_RE
 * pour ça).
 */
const NEIGHBORING_AMOUNT_RE =
  /\d[\d  .,]*\s*(?:€|EUR|euros?)|(?:€|EUR)\s*\d[\d  .,]*/i;

/**
 * Motif d'une NOUVELLE ÉTIQUETTE DE CHAMP — "Montant remboursé :",
 * "Base de remboursement :", "Taux :"...
 *
 * Dans un document "Étiquette : Valeur" (avis d'impôt, décompte
 * de remboursement, relevé...), l'étiquette du champ SUIVANT suit
 * directement la valeur du champ courant : même après avoir coupé
 * au prochain MONTANT, le texte "Montant déjà prélevé à la
 * source :" (qui qualifie le montant suivant) restait dans la
 * fenêtre du montant courant. On coupe donc aussi à la prochaine
 * étiquette reconnaissable (mot(s) capitalisés suivis de ":"),
 * signal fort et peu ambigu de nouveau champ dans ce type de
 * document.
 */
const NEXT_FIELD_LABEL_RE =
  /[A-ZÀ-Ý][\wÀ-ÿ'()/-]*(?:\s+[a-zà-ÿ0-9'()/-]+){0,5}\s*:/;

/**
 * Coupe `after` juste avant le prochain montant rencontré, pour
 * qu'un signal métier ("déjà prélevé", "à rembourser"...) ne
 * puisse jamais être attribué à tort à un montant voisin plutôt
 * qu'à celui auquel il s'applique réellement.
 */
function clipAfterNeighboringAmount(after) {
  const text = String(after || "");

  const boundaries = [
    text.match(NEIGHBORING_AMOUNT_RE)?.index,
    text.match(NEXT_FIELD_LABEL_RE)?.index
  ].filter((index) => index !== undefined);

  if (!boundaries.length) {
    return text;
  }

  return text.slice(0, Math.min(...boundaries));
}

/**
 * Symétrique de clipAfterNeighboringAmount pour `before`.
 */
function clipBeforeNeighboringAmount(before) {
  const text = String(before || "");
  let lastEnd = -1;
  const regex = new RegExp(NEIGHBORING_AMOUNT_RE, "gi");
  let match;

  while ((match = regex.exec(text))) {
    lastEnd = match.index + match[0].length;

    // Éviter une boucle infinie sur un motif de longueur nulle.
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  return lastEnd === -1 ? text : text.slice(lastEnd);
}

function extractLineAt(
  text,
  index
) {
  const previousNewline =
    text.lastIndexOf(
      "\n",
      index
    );

  const nextNewline =
    text.indexOf(
      "\n",
      index
    );

  const start =
    previousNewline >= 0
      ? previousNewline + 1
      : 0;

  const end =
    nextNewline >= 0
      ? nextNewline
      : text.length;

  return cleanWhitespace(
    text.slice(start, end)
  );
}

function extractParagraphAt(
  text,
  index
) {
  const previousParagraph =
    text.lastIndexOf(
      "\n\n",
      index
    );

  const nextParagraph =
    text.indexOf(
      "\n\n",
      index
    );

  const start =
    previousParagraph >= 0
      ? previousParagraph + 2
      : Math.max(
          0,
          index - 300
        );

  const end =
    nextParagraph >= 0
      ? nextParagraph
      : Math.min(
          text.length,
          index + 300
        );

  return cleanWhitespace(
    text.slice(start, end)
  );
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function cleanWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
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
