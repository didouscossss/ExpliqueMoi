/**
 * C — Extraction générique des dates / périodes V2.
 *
 * Objectifs :
 * - détecter les vraies dates utiles ;
 * - détecter les périodes ;
 * - éviter qu'une date légale / historique devienne principale ;
 * - éviter "Janvier 1978" provenant d'une mention réglementaire ;
 * - éviter de transformer "20 juillet 2026" en
 *   date + période "Juillet 2026" ;
 * - conserver suffisamment de contexte pour roles.js.
 */

import {
  normalizeDateKey,
  toDigitDate
} from "../normalize/text.js";

/**
 * Exemples :
 * 20/07/2026
 * 20-07-2026
 * 20.07.2026
 */
const DATE_RE =
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;

/**
 * Exemple :
 * 20 juillet 2026
 */
const VERBAL_DATE_RE =
  /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/gi;

/**
 * Exemple :
 * juillet 2026
 *
 * ATTENTION :
 * ne doit pas récupérer "juillet 2026"
 * dans "20 juillet 2026".
 */
const PERIOD_MONTH_RE =
  /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/gi;

/**
 * Exemples :
 * du 01/01/2025 au 31/12/2025
 * période du 01/01/2025 au 31/12/2025
 */
const PERIOD_RANGE_RE =
  /\b(?:du|période(?:\s+du)?)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(?:au|à)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/gi;

/**
 * @param {string} text
 * @returns {{ dates: object[], periods: object[] }}
 */
export function extractDatesAndPeriods(text) {
  const source =
    String(text || "");

  const dates = [];
  const periods = [];

  const seen =
    new Set();

  /*
   * On garde les zones déjà reconnues comme
   * dates verbales complètes.
   *
   * Exemple :
   * "20 juillet 2026"
   *
   * Ainsi "juillet 2026" ne sera PAS ajouté
   * une seconde fois comme période.
   */
  const verbalDateSpans = [];

  /**
   * =====================================================
   * AJOUT DATE
   * =====================================================
   */

  const pushDate = (
    raw,
    index,
    suppliedHint = ""
  ) => {
    const value =
      String(raw || "")
        .trim();

    const key =
      normalizeDateKey(value);

    if (!key) {
      return;
    }

    /*
     * Vérification calendrier pour les dates numériques.
     */
    if (
      looksNumericDate(value) &&
      !isValidNumericDate(value)
    ) {
      return;
    }

    const context =
      snippetAroundClippedToNeighboringDate(
        source,
        index,
        value.length,
        120
      );

    const detectedHint =
      suppliedHint ||
      detectDateHint(
        context
      );

    /*
     * Même date + même rôle approximatif :
     * une seule occurrence.
     */
    const dedupeKey =
      `d:${key}:${detectedHint}`;

    if (
      seen.has(dedupeKey)
    ) {
      return;
    }

    seen.add(
      dedupeKey
    );

    dates.push({
      raw:
        toDigitDate(
          value
        ),

      key,

      index,

      context,

      hint:
        detectedHint,

      confidence:
        calculateDateConfidence({
          context,
          hint:
            detectedHint
        })
    });
  };

  /*
   * =====================================================
   * 1 — DATES NUMÉRIQUES
   * =====================================================
   */

  DATE_RE.lastIndex = 0;

  let match;

  while (
    (
      match =
        DATE_RE.exec(source)
    )
  ) {
    const year =
      normalizeYear(
        match[3]
      );

    const normalized =
      `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${year}`;

    pushDate(
      normalized,
      match.index
    );
  }

  /*
   * =====================================================
   * 2 — DATES VERBALES
   * =====================================================
   */

  VERBAL_DATE_RE.lastIndex = 0;

  while (
    (
      match =
        VERBAL_DATE_RE.exec(source)
    )
  ) {
    const start =
      match.index;

    const end =
      match.index +
      match[0].length;

    verbalDateSpans.push({
      start,
      end
    });

    pushDate(
      match[0],
      match.index
    );
  }

  /*
   * =====================================================
   * 3 — PÉRIODES DATE → DATE
   * =====================================================
   */

  PERIOD_RANGE_RE.lastIndex = 0;

  while (
    (
      match =
        PERIOD_RANGE_RE.exec(source)
    )
  ) {
    const startValue =
      normalizeNumericDate(
        match[1]
      );

    const endValue =
      normalizeNumericDate(
        match[2]
      );

    if (
      !startValue ||
      !endValue
    ) {
      continue;
    }

    if (
      !isValidNumericDate(
        startValue
      ) ||
      !isValidNumericDate(
        endValue
      )
    ) {
      continue;
    }

    const value =
      `${startValue} → ${endValue}`;

    const key =
      `${normalizeDateKey(startValue)}_${normalizeDateKey(endValue)}`;

    if (
      seen.has(
        `p:${key}`
      )
    ) {
      continue;
    }

    const context =
      snippetAround(
        source,
        match.index,
        140
      );

    /*
     * Une période explicitement "du ... au ..."
     * est généralement fiable.
     */
    seen.add(
      `p:${key}`
    );

    periods.push({
      raw:
        value,

      key,

      kind:
        "range",

      start:
        startValue,

      end:
        endValue,

      index:
        match.index,

      context,

      hint:
        detectPeriodHint(
          context
        ),

      confidence:
        isLegalOrHistoricalContext(
          context
        )
          ? 45
          : 85
    });
  }

  /*
   * =====================================================
   * 4 — MOIS + ANNÉE
   * =====================================================
   */

  PERIOD_MONTH_RE.lastIndex = 0;

  while (
    (
      match =
        PERIOD_MONTH_RE.exec(source)
    )
  ) {
    const start =
      match.index;

    const end =
      match.index +
      match[0].length;

    /*
     * IMPORTANT :
     *
     * "20 juillet 2026"
     *
     * a déjà été extrait comme date complète.
     * On ne crée donc pas en plus :
     *
     * "Juillet 2026"
     */
    if (
      overlapsAnySpan(
        start,
        end,
        verbalDateSpans
      )
    ) {
      continue;
    }

    const value =
      `${capitalize(match[1])} ${match[2]}`;

    const key =
      normalizeDateKey(
        value
      );

    if (
      !key ||
      seen.has(
        `p:${key}`
      )
    ) {
      continue;
    }

    const context =
      snippetAround(
        source,
        match.index,
        130
      );

    /*
     * =================================================
     * FILTRE PRINCIPAL CONTRE "JANVIER 1978"
     * =================================================
     *
     * Une simple mention mois+année dans une loi,
     * un décret, une notice ou une référence
     * historique n'est PAS une période utilisateur.
     */
    if (
      isLegalOrHistoricalContext(
        context
      )
    ) {
      continue;
    }

    /*
     * Si le mois+année n'est relié à aucun concept
     * de période, on reste prudent.
     *
     * On accepte néanmoins les cas usuels :
     * loyer de janvier 2026,
     * période janvier 2026,
     * salaire janvier 2026,
     * échéance janvier 2026, etc.
     */
    const periodHint =
      detectPeriodHint(
        context
      );

    if (
      !periodHint &&
      !hasMonthPeriodSignal(
        context
      )
    ) {
      /*
       * Un mois + année isolé n'est pas assez fiable
       * pour devenir une période principale.
       */
      continue;
    }

    seen.add(
      `p:${key}`
    );

    periods.push({
      raw:
        value,

      key,

      kind:
        "month",

      index:
        match.index,

      context,

      hint:
        periodHint ||
        "monthPeriod",

      confidence:
        periodHint
          ? 80
          : 65
    });
  }

  return {
    dates,
    periods
  };
}

/**
 * =====================================================
 * CLASSIFICATION CONTEXTUELLE DES DATES
 * =====================================================
 */

function detectDateHint(
  context
) {
  const text =
    normalizeText(
      context
    );

  /*
   * Date de réunion / AG.
   *
   * "assemblee generale"/"assemblee"/"reunion" seuls ne suffisent
   * PAS : dans un procès-verbal, "L'Assemblée Générale approuve..."
   * est répété devant quasiment CHAQUE résolution (et donc près de
   * quasiment CHAQUE date du document, budgets et échéances inclus)
   * sans indiquer une date de convocation. Seuls des mots qui
   * décrivent explicitement la CONVOCATION/tenue de la réunion sont
   * de vrais signaux ("se tiendra", "réunis", "convoqué"...).
   */
  if (
    /convocation|convoque|convoquee|se tiendra|aura lieu|(?:se sont |s'est )?reunis|comparaitre|a comparaitre|rendez-vous|vous presenter|assemblee generale(?:\s+(?:ordinaire|extraordinaire|mixte))?\s+du\b|date de l assemblee/.test(
      text
    )
  ) {
    return "meetingDate";
  }

  /*
   * Échéance.
   */
  if (
    /date limite|au plus tard|avant le|jusqu'au|jusqu au|echeance|a regler avant|a payer avant|date de paiement/.test(
      text
    )
  ) {
    return "deadline";
  }

  /*
   * Paiement / prélèvement / remboursement.
   */
  if (
    /sera preleve|prelevement|sera debite/.test(
      text
    )
  ) {
    return "debitDate";
  }

  if (
    /remboursement|rembourserons|sera rembourse|sera remboursee/.test(
      text
    )
  ) {
    return "refundDate";
  }

  if (
    /paye le|regle le|paiement effectue|sera verse/.test(
      text
    ) ||
    (
      /versement|verse/.test(
        text
      ) &&
      /sera effectue|effectue le/.test(
        text
      )
    )
  ) {
    return "paymentDate";
  }

  /*
   * Date d'émission.
   */
  if (
    /emis le|emission|edite le|edite, le|fait a|fait le|poitiers le|paris le|tours le|date du courrier/.test(
      text
    )
  ) {
    return "issueDate";
  }

  /*
   * Date de début / entrée en vigueur.
   *
   * Fréquent dans les contrats (travail, location, assurance,
   * service) : la date à laquelle l'engagement prend effet,
   * distincte de la date d'émission du document.
   */
  if (
    /a compter du|prend effet|prise d'effet|entree? en vigueur|entree en fonction|date de debut|date d'effet|debute le|debutant le/.test(
      text
    )
  ) {
    return "startDate";
  }

  /*
   * Mention légale / historique.
   */
  if (
    isLegalOrHistoricalContext(
      context
    )
  ) {
    return "legalHistorical";
  }

  return "";
}

/**
 * =====================================================
 * CLASSIFICATION DES PÉRIODES
 * =====================================================
 */

function detectPeriodHint(
  context
) {
  const text =
    normalizeText(
      context
    );

  if (
    /periode|du .* au |mois de|au titre de/.test(
      text
    )
  ) {
    return "coveredPeriod";
  }

  if (
    /loyer|quittance/.test(
      text
    )
  ) {
    return "rentPeriod";
  }

  if (
    /salaire|bulletin de paie|paie/.test(
      text
    )
  ) {
    return "salaryPeriod";
  }

  if (
    /exercice fiscal|exercice comptable|exercice clos|clos le/.test(
      text
    )
  ) {
    return "fiscalPeriod";
  }

  if (
    /facturation|periode de consommation|consommation/.test(
      text
    )
  ) {
    return "billingPeriod";
  }

  return "";
}

function hasMonthPeriodSignal(
  context
) {
  const text =
    normalizeText(
      context
    );

  return (
    /periode|mois|loyer|quittance|salaire|paie|facturation|consommation|exercice|cotisation|echeance/.test(
      text
    )
  );
}

/**
 * =====================================================
 * BRUIT LÉGAL / HISTORIQUE
 * =====================================================
 */

function isLegalOrHistoricalContext(
  context
) {
  const text =
    normalizeText(
      context
    );

  /*
   * Lois, décrets, arrêtés, articles...
   */
  if (
    /loi n|loi du|decret n|decret du|décret|arrete du|arrêté|article \d|code general|code civil|code de|ordonnance|journal officiel/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Références réglementaires / formulaire.
   */
  if (
    /cerfa|formulaire n|formulaire no|notice|reference legislative|reference reglementaire|texte applicable/.test(
      text
    )
  ) {
    return true;
  }

  /*
   * Expressions explicitement historiques.
   */
  if (
    /historique|ancien texte|ancienne version|depuis \d{4}|cree en|créé en|institue en|institué en/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * CONFIANCE
 * =====================================================
 */

function calculateDateConfidence({
  context,
  hint
}) {
  let confidence =
    55;

  if (
    hint === "meetingDate"
  ) {
    confidence =
      90;
  } else if (
    hint === "deadline"
  ) {
    confidence =
      88;
  } else if (
    hint === "refundDate" ||
    hint === "debitDate" ||
    hint === "paymentDate"
  ) {
    confidence =
      85;
  } else if (
    hint === "issueDate"
  ) {
    confidence =
      68;
  } else if (
    hint === "legalHistorical"
  ) {
    confidence =
      30;
  }

  const normalized =
    normalizeText(
      context
    );

  /*
   * Une heure proche renforce une date de rendez-vous.
   */
  if (
    hint === "meetingDate" &&
    /\b\d{1,2}(?:h\d{0,2}|:\d{2})\b/.test(
      normalized
    )
  ) {
    confidence += 5;
  }

  return clamp(
    confidence,
    20,
    98
  );
}

/**
 * =====================================================
 * VALIDATION DATES
 * =====================================================
 */

function looksNumericDate(
  value
) {
  return (
    /^\d{2}\/\d{2}\/\d{4}$/.test(
      String(value || "")
    )
  );
}

function isValidNumericDate(
  value
) {
  const match =
    String(value || "")
      .match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
      );

  if (!match) {
    return false;
  }

  const day =
    Number(match[1]);

  const month =
    Number(match[2]);

  const year =
    Number(match[3]);

  if (
    year < 1900 ||
    year > 2200
  ) {
    return false;
  }

  if (
    month < 1 ||
    month > 12
  ) {
    return false;
  }

  const maxDay =
    new Date(
      year,
      month,
      0
    ).getDate();

  return (
    day >= 1 &&
    day <= maxDay
  );
}

function normalizeNumericDate(
  raw
) {
  const match =
    String(raw || "")
      .match(
        /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/
      );

  if (!match) {
    return null;
  }

  return (
    `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${normalizeYear(match[3])}`
  );
}

function normalizeYear(
  value
) {
  const year =
    String(value || "");

  if (
    year.length === 4
  ) {
    return year;
  }

  /*
   * Ancienne logique conservée :
   * 26 → 2026.
   *
   * On pourra la raffiner plus tard si des documents
   * historiques avec années sur deux chiffres posent problème.
   */
  return (
    `20${year.padStart(2, "0")}`
  );
}

/**
 * =====================================================
 * OUTILS DE POSITION
 * =====================================================
 */

function overlapsAnySpan(
  start,
  end,
  spans
) {
  return (
    spans.some(
      (span) =>
        start < span.end &&
        end > span.start
    )
  );
}

/**
 * =====================================================
 * CONTEXTE
 * =====================================================
 */

function snippetAround(
  text,
  index,
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
      index + radius
    );

  return (
    text
      .slice(
        start,
        end
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
  );
}

/**
 * Repère une AUTRE date à l'intérieur d'un extrait de contexte —
 * sert uniquement à borner les fenêtres de recherche de mots-clés
 * de rôle, jamais à extraire des dates (voir DATE_RE /
 * VERBAL_DATE_RE pour ça).
 */
const NEIGHBORING_DATE_RE =
  /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b/i;

/**
 * Même principe que pour les montants (extract/amounts.js) :
 * dans un document à plusieurs dates rapprochées ("Émis le
 * 10/06/2026. [...] avant le 20/07/2026"), le contexte utilisé
 * pour deviner le RÔLE d'une date ne doit jamais déborder sur une
 * AUTRE date — sinon une échéance voisine peut faire croire
 * qu'une date d'émission est elle-même une échéance.
 *
 * On ne peut pas s'appuyer sur les retours à la ligne (un OCR
 * peut aplatir une page entière) : on coupe donc le contexte à la
 * date voisine la plus proche, dans les deux sens.
 */
function snippetAroundClippedToNeighboringDate(
  text,
  index,
  matchLength,
  radius
) {
  const beforeStart =
    Math.max(0, index - radius);

  const before =
    text.slice(beforeStart, index);

  const afterEnd =
    Math.min(text.length, index + matchLength + radius);

  const after =
    text.slice(index + matchLength, afterEnd);

  const clippedBefore =
    clipBeforeNeighboringDate(before);

  const clippedAfter =
    clipAfterNeighboringDate(after);

  const matched =
    text.slice(index, index + matchLength);

  return (
    `${clippedBefore} ${matched} ${clippedAfter}`
      .replace(/\s+/g, " ")
      .trim()
  );
}

/*
 * Un simple retour à la ligne À L'INTÉRIEUR d'une phrase (habillage
 * de texte à ~70 caractères, très fréquent dans les courriers) N'EST
 * PAS une limite de phrase — "avant le\n26/06/2026" est une seule
 * phrase coupée par la mise en page, pas deux phrases. Seul un
 * changement de PARAGRAPHE (ligne vide, \n\n) est un signal fiable ;
 * un \n isolé ne doit jamais couper le contexte d'une date.
 */
const SENTENCE_BOUNDARY_RE = /[.!?]|\n\s*\n/;

/**
 * Coupe au plus proche entre : une autre date, ou la fin de la
 * phrase courante. Une phrase qui parle d'une autre date ("Vous
 * devez régler avant le 20/07/2026") ne doit jamais teinter le
 * rôle d'une date de la phrase PRÉCÉDENTE ("émis le 10/06/2026.")
 * simplement parce qu'elle se trouve dans le rayon de 120
 * caractères.
 */
function clipAfterNeighboringDate(after) {
  const text = String(after || "");

  const boundaries = [
    text.match(NEIGHBORING_DATE_RE)?.index,
    text.match(SENTENCE_BOUNDARY_RE)?.index
  ].filter((index) => index !== undefined);

  if (!boundaries.length) {
    return text;
  }

  return text.slice(0, Math.min(...boundaries));
}

function clipBeforeNeighboringDate(before) {
  const text = String(before || "");
  let lastEnd = -1;
  const regex = new RegExp(NEIGHBORING_DATE_RE, "gi");
  let match;

  while ((match = regex.exec(text))) {
    lastEnd = match.index + match[0].length;

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  /*
   * Symétrique de clipAfterNeighboringDate : on ne remonte pas
   * plus haut que la fin de la phrase précédente non plus.
   */
  let lastSentenceEnd = -1;
  const sentenceRegex = new RegExp(SENTENCE_BOUNDARY_RE, "g");
  let sentenceMatch;

  while ((sentenceMatch = sentenceRegex.exec(text))) {
    lastSentenceEnd = sentenceMatch.index + sentenceMatch[0].length;
  }

  const start = Math.max(lastEnd, lastSentenceEnd);

  return start === -1 ? text : text.slice(start);
}

/**
 * =====================================================
 * TEXTE
 * =====================================================
 */

function normalizeText(
  value
) {
  return String(value || "")
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

function capitalize(
  value
) {
  const text =
    String(value || "");

  return (
    text.charAt(0)
      .toUpperCase() +
    text.slice(1)
      .toLowerCase()
  );
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
