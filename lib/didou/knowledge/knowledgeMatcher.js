/**
 * Didou Knowledge Matcher V1
 *
 * Objectif :
 * comparer un document avec toutes les fiches
 * présentes dans DIDOU_KNOWLEDGE.
 *
 * Le matcher calcule un score à partir de :
 * - type / alias
 * - vocabulaire
 * - phrases
 * - organismes
 * - domaines
 * - références
 * - sections
 *
 * Il renvoie les meilleures hypothèses.
 */

import {
  DIDOU_KNOWLEDGE
} from "./index.js";

/**
 * =====================================================
 * POINT D'ENTREE
 * =====================================================
 */

export function matchDocumentKnowledge({
  text,
  detection = null,
  extraction = null,
  limit = 5
} = {}) {
  const source =
    normalizeText(
      text
    );

  if (!source) {
    return {
      best: null,
      matches: [],
      confidence: 0
    };
  }

  const matches =
    [];

  for (
    const knowledge
    of DIDOU_KNOWLEDGE
  ) {
    const result =
      scoreKnowledge({
        source,
        knowledge,
        detection,
        extraction
      });

    if (
      result.score <= 0
    ) {
      continue;
    }

    matches.push(
      result
    );
  }

  matches.sort(
    (a, b) =>
      b.score - a.score
  );

  const best =
    matches[0] ||
    null;

  const second =
    matches[1] ||
    null;

  /*
   * =====================================================
   * CONFIANCE
   * =====================================================
   */

  let confidence = 0;

  if (best) {
    const margin =
      second
        ? best.score -
          second.score
        : best.score;

    confidence =
      calculateConfidence({
        score:
          best.score,

        margin
      });
  }

  return {
    best:
      best
        ? {
            ...best,
            confidence
          }
        : null,

    matches:
      matches
        .slice(
          0,
          Math.max(
            1,
            Number(limit) || 5
          )
        )
        .map(
          (item) => ({
            ...item,

            confidence:
              calculateConfidence({
                score:
                  item.score,

                margin:
                  best
                    ? best.score -
                      item.score
                    : 0
              })
          })
        ),

    confidence
  };
}

/**
 * =====================================================
 * SCORE D'UNE FICHE
 * =====================================================
 */

function scoreKnowledge({
  source,
  knowledge,
  detection,
  extraction
}) {
  let score = 0;

  const signals =
    [];

  /*
   * ===================================================
   * TYPE EXACT
   * ===================================================
   */

  const type =
    normalizeText(
      knowledge?.type
    );

  if (
    type &&
    source.includes(
      type
    )
  ) {
    score += 60;

    signals.push({
      kind:
        "type",

      value:
        knowledge.type,

      weight:
        60
    });
  }

  /*
   * ===================================================
   * ALIAS
   * ===================================================
   */

  for (
    const alias
    of safeArray(
      knowledge?.aliases
    )
  ) {
    const normalized =
      normalizeText(
        alias
      );

    if (
      !normalized
    ) {
      continue;
    }

    if (
      source.includes(
        normalized
      )
    ) {
      score += 35;

      signals.push({
        kind:
          "alias",

        value:
          alias,

        weight:
          35
      });
    }
  }

  /*
   * ===================================================
   * PHRASES
   * ===================================================
   */

  for (
    const phrase
    of safeArray(
      knowledge?.phrases
    )
  ) {
    const normalized =
      normalizeText(
        phrase
      );

    if (
      !normalized
    ) {
      continue;
    }

    if (
      source.includes(
        normalized
      )
    ) {
      score += 25;

      signals.push({
        kind:
          "phrase",

        value:
          phrase,

        weight:
          25
      });
    }
  }

  /*
   * ===================================================
   * VOCABULAIRE
   * ===================================================
   */

  let vocabularyHits = 0;

  for (
    const word
    of safeArray(
      knowledge?.vocabulary
    )
  ) {
    const normalized =
      normalizeText(
        word
      );

    if (
      !normalized
    ) {
      continue;
    }

    if (
      containsKnowledgeTerm(
        source,
        normalized
      )
    ) {
      vocabularyHits += 1;

      /*
       * Un mot seul reste un signal faible.
       */
      score += 8;

      signals.push({
        kind:
          "vocabulary",

        value:
          word,

        weight:
          8
      });
    }
  }

  /*
   * Plusieurs mots cohérents
   * renforcent fortement une fiche.
   */

  if (
    vocabularyHits >= 3
  ) {
    score += 15;

    signals.push({
      kind:
        "vocabulary_cluster",

      value:
        vocabularyHits,

      weight:
        15
    });
  }

  if (
    vocabularyHits >= 5
  ) {
    score += 15;

    signals.push({
      kind:
        "vocabulary_cluster_strong",

      value:
        vocabularyHits,

      weight:
        15
    });
  }

  /*
   * ===================================================
   * ORGANISMES
   * ===================================================
   */

  for (
    const organization
    of safeArray(
      knowledge?.organizations
    )
  ) {
    const normalized =
      normalizeText(
        organization
      );

    if (
      normalized &&
      source.includes(
        normalized
      )
    ) {
      score += 20;

      signals.push({
        kind:
          "organization",

        value:
          organization,

        weight:
          20
      });
    }
  }

  /*
   * ===================================================
   * DOMAINES
   * ===================================================
   */

  for (
    const domain
    of safeArray(
      knowledge?.domains
    )
  ) {
    const normalized =
      normalizeText(
        domain
      );

    if (
      normalized &&
      source.includes(
        normalized
      )
    ) {
      score += 25;

      signals.push({
        kind:
          "domain",

        value:
          domain,

        weight:
          25
      });
    }
  }

  /*
   * ===================================================
   * REFERENCES
   * ===================================================
   */

  for (
    const reference
    of safeArray(
      knowledge?.references
    )
  ) {
    const normalized =
      normalizeText(
        reference
      );

    if (
      normalized &&
      source.includes(
        normalized
      )
    ) {
      score += 30;

      signals.push({
        kind:
          "reference",

        value:
          reference,

        weight:
          30
      });
    }
  }

  /*
   * ===================================================
   * SECTIONS
   * ===================================================
   */

  let sectionHits = 0;

  for (
    const section
    of safeArray(
      knowledge?.sections
    )
  ) {
    const normalized =
      normalizeText(
        section
      );

    if (
      normalized &&
      source.includes(
        normalized
      )
    ) {
      sectionHits += 1;

      score += 12;

      signals.push({
        kind:
          "section",

        value:
          section,

        weight:
          12
      });
    }
  }

  if (
    sectionHits >= 3
  ) {
    score += 20;

    signals.push({
      kind:
        "section_cluster",

      value:
        sectionHits,

      weight:
        20
    });
  }

  /*
   * ===================================================
   * DETECTION ACTUELLE
   * ===================================================
   *
   * On ne veut pas remplacer brutalement
   * le détecteur actuel.
   *
   * Une cohérence apporte donc seulement
   * un petit bonus.
   */

  if (
    knowledge?.family &&
    detection?.family &&
    normalizeText(
      knowledge.family
    ) ===
      normalizeText(
        detection.family
      )
  ) {
    score += 15;

    signals.push({
      kind:
        "family_agreement",

      value:
        knowledge.family,

      weight:
        15
    });
  }

  if (
    knowledge?.type &&
    detection?.documentType &&
    normalizeText(
      knowledge.type
    ) ===
      normalizeText(
        detection.documentType
      )
  ) {
    score += 25;

    signals.push({
      kind:
        "type_agreement",

      value:
        knowledge.type,

      weight:
        25
    });
  }

  /*
   * ===================================================
   * ENTITES EXTRAITES
   * ===================================================
   */

  const organizations =
    safeArray(
      extraction?.entities
        ?.organizations
    );

  for (
    const extractedOrganization
    of organizations
  ) {
    const extracted =
      normalizeText(
        typeof extractedOrganization ===
          "string"
          ? extractedOrganization
          : extractedOrganization
              ?.value
      );

    if (!extracted) {
      continue;
    }

    const knowledgeOrganizations =
      safeArray(
        knowledge?.organizations
      )
        .map(
          normalizeText
        );

    if (
      knowledgeOrganizations.some(
        (organization) =>
          organization &&
          (
            extracted.includes(
              organization
            ) ||
            organization.includes(
              extracted
            )
          )
      )
    ) {
      score += 20;

      signals.push({
        kind:
          "extracted_organization",

        value:
          extractedOrganization,

        weight:
          20
      });
    }
  }

  /*
   * ===================================================
   * SECURITE : TROP PEU DE SIGNAUX
   * ===================================================
   */

  const strongSignalCount =
    signals.filter(
      (signal) =>
        Number(
          signal?.weight || 0
        ) >= 20
    ).length;

  /*
   * Beaucoup de vocabulaire isolé
   * ne doit pas suffire.
   */

  if (
    strongSignalCount === 0 &&
    vocabularyHits < 3
  ) {
    score =
      Math.min(
        score,
        20
      );
  }

  return {
    family:
      knowledge?.family ||
      null,

    type:
      knowledge?.type ||
      null,

    intent:
      knowledge?.intent ||
      null,

    situation:
      knowledge?.situation ||
      null,

    actionRequired:
      knowledge?.actionRequired ??
      null,

    summary:
      knowledge?.summary ||
      null,

    importantFields:
      safeArray(
        knowledge?.importantFields
      ),

    ignoredFields:
      safeArray(
        knowledge?.ignoredFields
      ),

    score:
      Math.max(
        0,
        Math.round(
          score
        )
      ),

    signals
  };
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateConfidence({
  score,
  margin
}) {
  let confidence = 0;

  if (
    score >= 140
  ) {
    confidence = 96;
  } else if (
    score >= 110
  ) {
    confidence = 92;
  } else if (
    score >= 85
  ) {
    confidence = 86;
  } else if (
    score >= 65
  ) {
    confidence = 78;
  } else if (
    score >= 45
  ) {
    confidence = 66;
  } else if (
    score >= 30
  ) {
    confidence = 52;
  } else {
    confidence =
      Math.min(
        40,
        score
      );
  }

  /*
   * Deux fiches presque identiques :
   * prudence.
   */

  if (
    margin >= 0 &&
    margin < 10
  ) {
    confidence -= 12;
  } else if (
    margin >= 10 &&
    margin < 20
  ) {
    confidence -= 5;
  }

  return Math.max(
    0,
    Math.min(
      98,
      confidence
    )
  );
}

/**
 * =====================================================
 * RECHERCHE D'UN TERME
 * =====================================================
 */

function containsKnowledgeTerm(
  source,
  term
) {
  /*
   * Expressions composées.
   */

  if (
    term.includes(
      " "
    )
  ) {
    return source.includes(
      term
    );
  }

  /*
   * Mot simple :
   * éviter au maximum les inclusions parasites.
   */

  const escaped =
    escapeRegExp(
      term
    );

  try {
    return new RegExp(
      `(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,
      "i"
    ).test(
      source
    );
  } catch {
    return source.includes(
      term
    );
  }
}

/**
 * =====================================================
 * TABLEAU SECURISE
 * =====================================================
 */

function safeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

/**
 * =====================================================
 * REGEX
 * =====================================================
 */

function escapeRegExp(
  value
) {
  return String(
    value || ""
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
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
