/**
 * C — Phrases d'obligation / action / échéance V2.
 *
 * Objectifs :
 * - détecter de vraies demandes utilisateur ;
 * - ignorer les formules de politesse ;
 * - éviter "merci de votre confiance" ;
 * - conserver réunions / échéances / obligations.
 */

const ACTION_PATTERNS = [
  /*
   * =====================================================
   * DEMANDE EXPLICITE
   * =====================================================
   */

  {
    re: /\b(?:vous\s+(?:devez|êtes\s+prié|etes\s+prie)|veuillez|prière\s+de|priere\s+de|il\s+vous\s+est\s+demandé|il\s+vous\s+est\s+demande)\b[^.!\n]{5,160}/gi,
    kind: "request"
  },

  /*
   * =====================================================
   * "MERCI DE" UNIQUEMENT DEVANT UN VRAI VERBE D'ACTION
   * =====================================================
   *
   * Exemple accepté :
   * "Merci de nous transmettre le document"
   *
   * Exemple rejeté :
   * "Merci de votre confiance"
   */

  {
    re: /\bmerci\s+de\s+(?:(?:bien\s+)?(?:nous\s+)?(?:transmettre|envoyer|retourner|compléter|completer|signer|fournir|joindre|répondre|repondre|régler|regler|payer|confirmer|contacter|appeler|participer|voter))\b[^.!\n]{0,140}/gi,
    kind: "request"
  },

  /*
   * =====================================================
   * ACTIONS DIRECTES
   * =====================================================
   */

  {
    re: /\b(?:à\s+retourner|a\s+retourner|à\s+payer|a\s+payer|régler|regler|transmettre|envoyer|répondre|repondre|compléter|completer|signer|fournir|joindre|confirmer|contacter|appeler|participer|donner\s+procuration|voter)\b[^.!\n]{0,120}/gi,
    kind: "action"
  },

  /*
   * =====================================================
   * ÉCHÉANCES
   * =====================================================
   */

  {
    re: /\b(?:avant\s+le|au\s+plus\s+tard\s+le|date\s+limite|échéance|echeance)\b[^.!\n]{0,100}/gi,
    kind: "deadline"
  },

  /*
   * =====================================================
   * RÉUNION / ASSEMBLÉE
   * =====================================================
   */

  {
    re: /\b(?:ordre\s+du\s+jour|procuration|pouvoir|vote\s+par\s+correspondance)\b[^.!\n]{0,140}/gi,
    kind: "meeting"
  }
];

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractActionPhrases(
  text
) {
  const source =
    String(
      text || ""
    );

  const results = [];

  const seen =
    new Set();

  for (
    const pattern
    of ACTION_PATTERNS
  ) {
    pattern.re.lastIndex = 0;

    let match;

    while (
      (
        match =
          pattern.re.exec(
            source
          )
      )
    ) {
      const phrase =
        String(
          match[0] || ""
        )
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      if (
        phrase.length < 8
      ) {
        continue;
      }

      /*
       * ===================================================
       * FILTRE FORMULES DE POLITESSE
       * ===================================================
       */

      if (
        isPolitenessOnly(
          phrase
        )
      ) {
        continue;
      }

      const key =
        normalizeText(
          phrase
        );

      if (
        !key ||
        seen.has(
          key
        )
      ) {
        continue;
      }

      seen.add(
        key
      );

      results.push({
        phrase,

        kind:
          pattern.kind,

        confidence:
          calculateConfidence({
            phrase,
            kind:
              pattern.kind
          })
      });
    }
  }

  return results
    .sort(
      (a, b) =>
        Number(
          b?.confidence || 0
        ) -
        Number(
          a?.confidence || 0
        )
    )
    .slice(
      0,
      20
    );
}

/**
 * =====================================================
 * FORMULE DE POLITESSE ?
 * =====================================================
 */

function isPolitenessOnly(
  phrase
) {
  const text =
    normalizeText(
      phrase
    );

  /*
   * Cas classiques.
   */

  if (
    /merci de votre confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /merci pour votre confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /nous vous remercions de votre confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /avec nos remerciements/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /nous vous remercions/.test(
      text
    ) &&
    !containsRealActionVerb(
      text
    )
  ) {
    return true;
  }

  /*
   * "Merci de ..." sans verbe d'action.
   */

  if (
    /^merci de\b/.test(
      text
    ) &&
    !containsRealActionVerb(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * VRAI VERBE D'ACTION ?
 * =====================================================
 */

function containsRealActionVerb(
  text
) {
  return (
    /\b(?:transmettre|envoyer|retourner|completer|signer|fournir|joindre|repondre|regler|payer|confirmer|contacter|appeler|participer|voter)\b/.test(
      text
    )
  );
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateConfidence({
  phrase,
  kind
}) {
  const text =
    normalizeText(
      phrase
    );

  let confidence =
    kind === "deadline"
      ? 75
      : 65;

  /*
   * Demande explicite.
   */

  if (
    /vous devez|veuillez|il vous est demande|vous etes prie/.test(
      text
    )
  ) {
    confidence += 15;
  }

  /*
   * Verbe d'action réel.
   */

  if (
    containsRealActionVerb(
      text
    )
  ) {
    confidence += 10;
  }

  /*
   * Réunion.
   */

  if (
    kind === "meeting"
  ) {
    confidence += 5;
  }

  return Math.min(
    confidence,
    95
  );
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[’']/g,
      "'"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}
