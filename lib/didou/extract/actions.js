/**
 * C — Phrases d'obligation / action / échéance V3.
 *
 * Objectifs :
 * - détecter de vraies demandes utilisateur ;
 * - ignorer les formules de politesse ;
 * - ignorer les consignes négatives non opérationnelles ;
 * - ignorer les contacts purement optionnels ;
 * - éviter "merci de votre confiance" ;
 * - conserver les vraies obligations, échéances
 *   et actions de réunion.
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
   * OK :
   * "Merci de nous transmettre le document"
   *
   * NON :
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
       * FILTRE NON-ACTION
       * ===================================================
       */

      if (
        isNonOperationalPhrase(
          phrase
        )
      ) {
        continue;
      }

      /*
       * ===================================================
       * FILTRE POLITESSE
       * ===================================================
       */

      if (
        isPolitenessOnly(
          phrase
        )
      ) {
        continue;
      }

      /*
       * ===================================================
       * FILTRE ACTION OPTIONNELLE
       * ===================================================
       *
       * "Contactez-nous si besoin"
       * n'est pas une obligation.
       */

      if (
        isOptionalContactPhrase(
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

  /*
   * Les actions les plus fiables en premier.
   */

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
 * NON-ACTION / CONSIGNE À NE PAS EXÉCUTER
 * =====================================================
 */

function isNonOperationalPhrase(
  phrase
) {
  const text =
    normalizeText(
      phrase
    );

  /*
   * Exemples :
   * "Veuillez ne pas en tenir compte"
   * "Ne pas tenir compte de ce message"
   */

  if (
    /(?:veuillez\s+)?ne\s+pas\s+(?:en\s+)?tenir\s+compte/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /ne\s+tenez\s+pas\s+compte/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Aucun geste demandé.
   */

  if (
    /aucune\s+action/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /aucune\s+demarche/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /rien\s+a\s+faire/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /vous\s+n[' ]?avez\s+rien\s+a\s+faire/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /aucune\s+intervention\s+de\s+votre\s+part/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * ACTION OPTIONNELLE ?
 * =====================================================
 */

function isOptionalContactPhrase(
  phrase
) {
  const text =
    normalizeText(
      phrase
    );

  /*
   * Exemple :
   * "Contactez-nous si vous avez besoin
   * d'informations complémentaires"
   */

  if (
    /\b(?:contacter|contactez|appeler|appelez)\b/.test(
      text
    ) &&
    /(?:si\s+besoin|si\s+necessaire|si\s+vous\s+avez\s+besoin|pour\s+toute\s+information|pour\s+plus\s+d[' ]?informations?|informations?\s+complementaires?)/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * "N'hésitez pas à nous contacter"
   * = proposition, pas obligation.
   */

  if (
    /n[' ]?hesitez\s+pas\s+a\s+(?:nous\s+)?contacter/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /vous\s+pouvez\s+(?:nous\s+)?contacter/.test(
      text
    )
  ) {
    return true;
  }

  return false;
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

  if (
    /merci\s+de\s+votre\s+confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /merci\s+pour\s+votre\s+confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /nous\s+vous\s+remercions\s+de\s+votre\s+confiance/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /avec\s+nos\s+remerciements/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * "Nous vous remercions..."
   * sans véritable action demandée.
   */

  if (
    /nous\s+vous\s+remercions/.test(
      text
    ) &&
    !containsRealActionVerb(
      text
    )
  ) {
    return true;
  }

  /*
   * "Merci de..." sans verbe d'action.
   */

  if (
    /^merci\s+de\b/.test(
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
      normalizeText(
        text
      )
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
   * Obligation explicite.
   */

  if (
    /vous\s+devez|veuillez|il\s+vous\s+est\s+demande|vous\s+etes\s+prie/.test(
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
   * Date limite.
   */

  if (
    kind === "deadline"
  ) {
    confidence += 5;
  }

  /*
   * Réunion.
   */

  if (
    kind === "meeting"
  ) {
    confidence += 5;
  }

  /*
   * Formulation conditionnelle :
   * prudence.
   */

  if (
    /\bsi\s+vous\b|\bsi\s+besoin\b|\bsi\s+necessaire\b/.test(
      text
    )
  ) {
    confidence -= 20;
  }

  return Math.max(
    30,
    Math.min(
      confidence,
      95
    )
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
