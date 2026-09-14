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

/*
 * `(?:(?!\n\n)[^.!])` : n'importe quel caractère sauf "." et "!",
 * tant qu'on n'est pas au début d'un saut de PARAGRAPHE (\n\n).
 *
 * Un simple retour à la ligne (habillage de texte à ~70
 * caractères, très fréquent dans un courrier réel) n'est PAS une
 * fin de phrase — "avant le\n26/06/2026" est une seule phrase
 * coupée par la mise en page. Un \n\n (ligne vide) reste, lui, un
 * vrai changement de sujet et continue d'arrêter la capture.
 */
const TAIL5 = "(?:(?!\\n\\n)[^.!]){5,160}";
const TAIL0_140 = "(?:(?!\\n\\n)[^.!]){0,140}";
const TAIL0_120 = "(?:(?!\\n\\n)[^.!]){0,120}";
const TAIL0_100 = "(?:(?!\\n\\n)[^.!]){0,100}";

const ACTION_PATTERNS = [
  /*
   * =====================================================
   * DEMANDE EXPLICITE
   * =====================================================
   */

  {
    re: new RegExp(
      `\\b(?:vous\\s+(?:devez|êtes\\s+prié|etes\\s+prie)|veuillez|prière\\s+de|priere\\s+de|il\\s+vous\\s+est\\s+demandé|il\\s+vous\\s+est\\s+demande)\\b${TAIL5}`,
      "gi"
    ),
    kind: "request"
  },

  /*
   * =====================================================
   * OBLIGATION PASSIVE ("DOIT ÊTRE TRANSMIS...")
   * =====================================================
   *
   * Formulation très fréquente dans les courriers
   * administratifs/fiscaux/juridiques : l'obligation est
   * exprimée à la voix passive, sans impératif ni "merci de" —
   * "ce document doit être transmis avant le 20/05/2026",
   * "le formulaire doit être retourné sous 15 jours".
   */

  {
    re: new RegExp(
      `\\b(?:doit|doivent)\\s+(?:etre|être)\\s+(?:transmis|envoye|envoyé|retourne|retourné|regle|réglé|acquitte|acquitté|complete|complété|rempli|signe|signé|fourni|renvoye|renvoyé|paye|payé|regularise|régularisé|adresse|adressé|restitue|restitué|deposé|depose)\\b${TAIL0_120}`,
      "gi"
    ),
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
    re: new RegExp(
      `\\bmerci\\s+de\\s+(?:(?:bien\\s+)?(?:nous\\s+)?(?:transmettre|envoyer|retourner|compléter|completer|signer|fournir|joindre|répondre|repondre|régler|regler|payer|confirmer|contacter|appeler|participer|voter|régulariser|regulariser|rembourser))\\b${TAIL0_140}`,
      "gi"
    ),
    kind: "request"
  },

  /*
   * =====================================================
   * ACTIONS DIRECTES
   * =====================================================
   */

  {
    re: new RegExp(
      `\\b(?:à\\s+retourner|a\\s+retourner|à\\s+payer|a\\s+payer|régler|regler|transmettre|envoyer|répondre|repondre|compléter|completer|signer|fournir|joindre|confirmer|contacter|appeler|participer|donner\\s+procuration|voter|régulariser|regulariser|rembourser)\\b${TAIL0_120}`,
      "gi"
    ),
    kind: "action"
  },

  /*
   * =====================================================
   * ÉCHÉANCES
   * =====================================================
   */

  {
    re: new RegExp(
      `\\b(?:avant\\s+le|au\\s+plus\\s+tard\\s+le|date\\s+limite|échéance|echeance)\\b${TAIL0_100}`,
      "gi"
    ),
    kind: "deadline"
  },

  /*
   * =====================================================
   * RÉUNION / ASSEMBLÉE
   * =====================================================
   */

  {
    re: new RegExp(
      `\\b(?:ordre\\s+du\\s+jour|procuration|pouvoir|vote\\s+par\\s+correspondance)\\b${TAIL0_140}`,
      "gi"
    ),
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

      /*
       * ===================================================
       * CONTEXTE PHRASE COMPLETE
       * ===================================================
       *
       * Le regex ci-dessus capture volontairement la phrase
       * à partir du verbe d'action ("participer ou donner
       * procuration...") pour rester générique.
       *
       * Mais le sujet / modal qui précède ("Vous pouvez",
       * "Vous devez", "Vous êtes invité à") est souvent ce
       * qui permet aux couches en aval (Semantic Relevance)
       * de déterminer QUI est concerné et avec quelle force.
       *
       * On capture donc aussi la phrase englobante complète,
       * sans changer `phrase` (toujours utilisée pour
       * l'affichage / la déduplication).
       */

      const sentence =
        extractEnclosingSentence(
          source,
          match.index,
          match[0].length
        );

      results.push({
        phrase,

        sentence,

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
    /vous\s+devez|veuillez|il\s+vous\s+est\s+demande|vous\s+etes\s+prie|doit\s+(?:etre|être)|doivent\s+(?:etre|être)/.test(
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
 * PHRASE ENGLOBANTE
 * =====================================================
 *
 * Retrouve la phrase complète autour d'un match, en
 * cherchant la ponctuation de fin de phrase la plus proche
 * avant et après (., !, ?, retour à la ligne).
 *
 * Purement structurel : aucun mot-clé métier ici.
 */

const SENTENCE_BOUNDARY_CHARS = [".", "!", "?", "\n"];
const SENTENCE_CONTEXT_WINDOW = 160;
const SENTENCE_MAX_LENGTH = 220;

function extractEnclosingSentence(
  source,
  matchIndex,
  matchLength
) {
  const before =
    source.slice(
      Math.max(
        0,
        matchIndex - SENTENCE_CONTEXT_WINDOW
      ),
      matchIndex
    );

  const after =
    source.slice(
      matchIndex + matchLength,
      Math.min(
        source.length,
        matchIndex + matchLength + SENTENCE_CONTEXT_WINDOW
      )
    );

  const beforeBoundary =
    Math.max(
      ...SENTENCE_BOUNDARY_CHARS.map(
        (char) => before.lastIndexOf(char)
      )
    );

  const precedingClause =
    before
      .slice(
        beforeBoundary >= 0
          ? beforeBoundary + 1
          : 0
      )
      .trim();

  const afterBoundaryCandidates =
    SENTENCE_BOUNDARY_CHARS
      .map((char) => after.indexOf(char))
      .filter((index) => index >= 0);

  const afterBoundary =
    afterBoundaryCandidates.length
      ? Math.min(...afterBoundaryCandidates)
      : after.length;

  const followingClause =
    after
      .slice(0, afterBoundary)
      .trim();

  const matched =
    source.slice(
      matchIndex,
      matchIndex + matchLength
    );

  const sentence =
    [precedingClause, matched, followingClause]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  return sentence.length > SENTENCE_MAX_LENGTH
    ? sentence.slice(0, SENTENCE_MAX_LENGTH).trim()
    : sentence;
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
