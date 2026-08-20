/**
 * E — Adaptateur convocation AG V3.1.
 *
 * Objectifs :
 * - identifier la vraie date de l'assemblée ;
 * - distinguer la date du courrier de la date de l'AG ;
 * - détecter correctement l'heure ;
 * - détecter un lieu propre et court ;
 * - éviter les annexes / pièces jointes / textes comptables ;
 * - produire un résumé très court et utile ;
 * - produire des actions concrètes ;
 * - ne pas inventer si une donnée reste incertaine.
 */

export function adaptCondoMeeting(ctx) {
  const text =
    String(ctx?.text || "");

  const extraction =
    ctx?.extraction || {};

  const detection =
    ctx?.detection || {};

  const dates =
    Array.isArray(extraction.dates)
      ? extraction.dates
      : [];

  const organizations =
    Array.isArray(
      extraction?.entities?.organizations
    )
      ? extraction.entities.organizations
      : [];

  /*
   * =====================================================
   * DATE DE L'AG
   * =====================================================
   */

  const meetingDate =
    pickMeetingDate(
      dates,
      text
    );

  /*
   * =====================================================
   * HEURE
   * =====================================================
   */

  const meetingTime =
    extractMeetingTime(
      text
    );

  /*
   * =====================================================
   * LIEU
   * =====================================================
   */

  const meetingPlace =
    extractMeetingPlace(
      text
    );

  /*
   * =====================================================
   * ORGANISATEUR / SYNDIC
   * =====================================================
   */

  const issuer =
    pickMeetingIssuer(
      organizations,
      text
    );

  /*
   * =====================================================
   * ACTIONS
   * =====================================================
   */

  const actions =
    buildMeetingActions({
      text,
      meetingDate,
      meetingTime,
      meetingPlace
    });

  /*
   * =====================================================
   * ORDRE DU JOUR
   *
   * Conservé uniquement pour une éventuelle vue détaillée.
   * Il n'est PAS injecté dans le résumé principal.
   * =====================================================
   */

  const agenda =
    extractAgenda(
      text
    );

  /*
   * =====================================================
   * FAITS IMPORTANTS
   * =====================================================
   */

  const importantFacts = [];

  if (meetingDate) {
    importantFacts.push({
      kind:
        "date",

      label:
        "Date de l’assemblée",

      value:
        meetingDate.raw,

      confidence:
        meetingDate.confidence || 90
    });
  }

  if (meetingTime) {
    importantFacts.push({
      kind:
        "time",

      label:
        "Heure",

      value:
        meetingTime.value,

      confidence:
        meetingTime.confidence
    });
  }

  if (meetingPlace) {
    importantFacts.push({
      kind:
        "place",

      label:
        "Lieu",

      value:
        meetingPlace.value,

      confidence:
        meetingPlace.confidence
    });
  }

  if (issuer) {
    importantFacts.push({
      kind:
        "issuer",

      label:
        "Syndic / organisateur",

      value:
        issuer,

      confidence:
        80
    });
  }

  /*
   * =====================================================
   * NIVEAU DE COMPRÉHENSION
   * =====================================================
   */

  let understandingLevel =
    "extraction";

  let confidence =
    40;

  if (
    meetingDate &&
    meetingTime &&
    meetingPlace
  ) {
    understandingLevel =
      "strong";

    confidence =
      Math.max(
        detection.confidence || 0,
        92
      );
  } else if (
    meetingDate &&
    (
      meetingTime ||
      meetingPlace
    )
  ) {
    understandingLevel =
      "strong";

    confidence =
      Math.max(
        detection.confidence || 0,
        86
      );
  } else if (
    meetingDate
  ) {
    understandingLevel =
      "probable";

    confidence =
      Math.max(
        detection.confidence || 0,
        72
      );
  }

  /*
   * =====================================================
   * RÉSUMÉ COURT
   * =====================================================
   */

  const summary =
    buildMeetingSummary({
      meetingDate,
      meetingTime,
      meetingPlace,
      issuer
    });

  /*
   * =====================================================
   * RETOUR FINAL
   * =====================================================
   */

  return {
    family:
      "copropriete",

    documentType:
      detection.documentType ||
      "Convocation à une assemblée générale de copropriété",

    understandingLevel,

    confidence,

    issuer:
      issuer || null,

    recipient:
      null,

 mainDate: meetingDate
  ? {
      date: meetingDate.raw,

      time:
        meetingTime?.value ||
        null,

      place:
        meetingPlace?.value ||
        null,

      label:
        "Date de l’assemblée",

      meaning:
        buildMeetingDateMeaning(
          meetingTime,
          meetingPlace
        ),

      role:
        "meetingDate"
    }
  : null,

    mainAmount:
      null,

    /*
     * Maximum 4 faits :
     * date / heure / lieu / organisateur.
     */
    importantFacts:
      importantFacts.slice(
        0,
        4
      ),

    actions:
      actions.slice(
        0,
        3
      ),

    deadlines:
      meetingDate
        ? [
            {
              date:
                meetingDate.raw,

              label:
                "Date de l’AG",

              meaning:
                meetingTime
                  ? `Assemblée prévue à ${meetingTime.value}`
                  : "Date de tenue de l’assemblée générale",

              confidence:
                meetingDate.confidence || 90
            }
          ]
        : [],

    whyReceived:
      summary,

    documentPurpose:
      "Vous convoquer à une assemblée générale de copropriété et vous indiquer comment y participer ou voter.",

    attentionLevel:
      meetingDate
        ? "soon"
        : "uncertain",

    /*
     * Ordre du jour gardé uniquement en donnée détaillée.
     */
    tables:
      agenda.length
        ? [
            {
              type:
                "agenda",

              label:
                "Principaux sujets de l’ordre du jour",

              rows:
                agenda
                  .slice(0, 5)
                  .map(
                    (item) => ({
                      label:
                        item
                    })
                  )
            }
          ]
        : [],

    evidence:
      buildEvidence({
        meetingDate,
        meetingTime,
        meetingPlace,
        text
      }),

    warnings:
      [],

    uncertainties:
      [
        !meetingDate &&
          "La date de l’assemblée n’a pas pu être identifiée avec suffisamment de certitude.",

        !meetingTime &&
          "L’heure de l’assemblée n’a pas été identifiée avec suffisamment de certitude.",

        !meetingPlace &&
          "Le lieu de l’assemblée n’a pas été identifié avec suffisamment de certitude."
      ].filter(Boolean)
  };
}

/**
 * =====================================================
 * DATE DE L'ASSEMBLÉE
 * =====================================================
 */

function pickMeetingDate(
  dates,
  text
) {
  const list =
    Array.isArray(dates)
      ? dates
      : [];

  const source =
    String(text || "");

  const normalizedSource =
    normalizeText(source);

  /*
   * On tente d'abord une détection directe,
   * car certains extracteurs de dates donnent
   * trop d'importance à la date du courrier.
   */
  const direct =
    findMeetingDateDirectly(
      source
    );

  /*
   * Si une date est explicitement associée à
   * "date de l'assemblée", "se tiendra", etc.,
   * elle est prioritaire.
   */
  if (
    direct &&
    direct.confidence >= 98
  ) {
    return direct;
  }

  if (!list.length) {
    return direct;
  }

  const scored =
    list
      .map((date) => {
        const raw =
          String(
            date?.raw || ""
          ).trim();

        if (!raw) {
          return null;
        }

        const context =
          normalizeText(
            [
              date?.context || "",
              date?.hint || ""
            ].join(" ")
          );

        let score = 0;

        /*
         * -------------------------------------------------
         * RÔLE DÉJÀ IDENTIFIÉ
         * -------------------------------------------------
         */

        if (
          date.role ===
            "meetingDate"
        ) {
          score += 180;
        }

        if (
          date.important
        ) {
          score += 20;
        }

        /*
         * -------------------------------------------------
         * SIGNALS TRÈS FORTS
         * -------------------------------------------------
         */

        if (
          /date de l assemblee/.test(
            context
          )
        ) {
          score += 240;
        }

        if (
          /assemblee generale du/.test(
            context
          )
        ) {
          score += 220;
        }

        if (
          /elle se tiendra le|se tiendra le/.test(
            context
          )
        ) {
          score += 260;
        }

        if (
          /aura lieu le/.test(
            context
          )
        ) {
          score += 220;
        }

        if (
          /date et lieu/.test(
            context
          )
        ) {
          score += 200;
        }

        /*
         * -------------------------------------------------
         * SIGNALS POSITIFS
         * -------------------------------------------------
         */

        if (
          /assemblee generale|assemblee|\bag\b|reunion/.test(
            context
          )
        ) {
          score += 110;
        }

        if (
          /\b\d{1,2}\s*h(?:\s*\d{2})?\b|\b\d{1,2}:\d{2}\b/.test(
            context
          )
        ) {
          score += 130;
        }

        /*
         * -------------------------------------------------
         * DATE DU COURRIER / ÉMISSION
         * -------------------------------------------------
         */

        if (
          /poitiers le|tours le|paris le|fait le|edite le|edite, le|emis le|émis le|date du courrier|date de facture/.test(
            context
          )
        ) {
          score -= 280;
        }

        /*
         * -------------------------------------------------
         * DATES COMPTABLES / HISTORIQUES
         * -------------------------------------------------
         */

        if (
          /exercice|budget|charges|releve|facture|echeance|appel de fonds|travaux|contrat/.test(
            context
          )
        ) {
          score -= 140;
        }

        /*
         * -------------------------------------------------
         * CONTEXTE DIRECT DANS LE DOCUMENT
         * -------------------------------------------------
         */

        score +=
          scoreMeetingDateInSource(
            normalizedSource,
            raw
          );

        return {
          date,
          score
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  if (!scored.length) {
    return direct;
  }

  const winner =
    scored[0];

  /*
   * Si la détection directe est plus fiable,
   * on la conserve.
   */
  if (
    direct &&
    direct.confidence >= 95
  ) {
    const winnerRaw =
      normalizeText(
        winner.date?.raw || ""
      );

    const directRaw =
      normalizeText(
        direct.raw || ""
      );

    /*
     * Si les deux dates sont différentes,
     * la date explicitement liée à l'AG gagne.
     */
    if (
      directRaw &&
      winnerRaw &&
      directRaw !== winnerRaw
    ) {
      return direct;
    }
  }

  if (
    winner.score <
    100
  ) {
    return (
      direct ||
      null
    );
  }

  return {
    ...winner.date,

    role:
      "meetingDate",

    important:
      true,

    confidence:
      winner.score >= 350
        ? 98
        : winner.score >= 250
          ? 95
          : winner.score >= 170
            ? 90
            : 80
  };
}

/**
 * Cherche les occurrences d'une date
 * directement autour des mots liés à une AG.
 */
function scoreMeetingDateInSource(
  normalizedSource,
  rawDate
) {
  const raw =
    normalizeText(
      rawDate
    );

  if (
    !raw ||
    !normalizedSource
  ) {
    return 0;
  }

  let bestScore =
    0;

  let index =
    normalizedSource.indexOf(
      raw
    );

  let count =
    0;

  while (
    index >= 0 &&
    count < 12
  ) {
    const start =
      Math.max(
        0,
        index - 220
      );

    const end =
      Math.min(
        normalizedSource.length,
        index +
          raw.length +
          220
      );

    const local =
      normalizedSource.slice(
        start,
        end
      );

    let score =
      0;

    if (
      /elle se tiendra|se tiendra|assemblee generale|date de l assemblee|date et lieu/.test(
        local
      )
    ) {
      score += 190;
    }

    if (
      /\b\d{1,2}h(?:\d{2})?\b|\b\d{1,2}:\d{2}\b/.test(
        local
      )
    ) {
      score += 130;
    }

    if (
      /adresse|salle|mairie|centre|lieu/.test(
        local
      )
    ) {
      score += 60;
    }

    /*
     * Date de courrier :
     * grosse pénalité si elle n'est pas accompagnée
     * d'un signal fort d'assemblée.
     */
    if (
      /poitiers le|tours le|paris le|fait le|edite le|emis le/.test(
        local
      ) &&
      !/se tiendra|date de l assemblee|assemblee generale du/.test(
        local
      )
    ) {
      score -= 240;
    }

    bestScore =
      Math.max(
        bestScore,
        score
      );

    index =
      normalizedSource.indexOf(
        raw,
        index +
          raw.length
      );

    count += 1;
  }

  return bestScore;
}

/**
 * Détection directe de la vraie date d'AG.
 */
function findMeetingDateDirectly(
  text
) {
  const source =
    String(text || "");

  const patterns = [
    /*
     * Date de l'assemblée : 20/07/2026
     */
    {
      regex:
        /date de l['’]assemblée\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,

      confidence:
        99
    },

    /*
     * Date et lieu :
     * Le 20/07/2026
     * A 17:00
     */
    {
      regex:
        /date et lieu[\s\S]{0,80}?\ble\s+(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,50}?(?:à|a)\s+\d{1,2}:\d{2}/i,

      confidence:
        99
    },

    /*
     * Le 20/07/2026 A 17:00
     */
    {
      regex:
        /\ble\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:à|a)\s+\d{1,2}:\d{2}/i,

      confidence:
        98
    },

    /*
     * Assemblée générale ... 20/07/2026 ... 17:00
     */
    {
      regex:
        /assemblée(?:\s+générale)?[\s\S]{0,180}?(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,90}?\d{1,2}(?::\d{2}|h\d{0,2})/i,

      confidence:
        98
    },

    /*
     * lundi 20 juillet 2026 à 17h00
     */
    {
      regex:
        /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\s+(?:à|a)\s+\d{1,2}h(?:\d{2})?/i,

      confidence:
        99
    },

    /*
     * Assemblée du lundi 20 juillet 2026 à 17h00
     */
    {
      regex:
        /assemblée[\s\S]{0,40}?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\s+(?:à|a)\s+\d{1,2}h(?:\d{2})?/i,

      confidence:
        99
    }
  ];

  for (
    const item
    of patterns
  ) {
    const match =
      source.match(
        item.regex
      );

    if (
      match?.[1]
    ) {
      return {
        raw:
          match[1].trim(),

        role:
          "meetingDate",

        important:
          true,

        confidence:
          item.confidence,

        context:
          String(
            match[0] || ""
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim()
      };
    }
  }

  return null;
}

/**
 * =====================================================
 * HEURE
 * =====================================================
 */

function extractMeetingTime(
  text
) {
  const source =
    String(text || "");

  const patterns = [
    /(?:assemblée générale|assemblee generale|assemblée|assemblee|AG|réunion|reunion)[\s\S]{0,180}?\b(?:à|a)\s*(\d{1,2})\s*h\s*(\d{2})?\b/i,

    /(?:assemblée générale|assemblee generale|assemblée|assemblee|AG|réunion|reunion)[\s\S]{0,180}?\b(\d{1,2}):(\d{2})\b/i,

    /\ble\s+\d{1,2}\/\d{1,2}\/\d{4}\s+(?:à|a)\s+(\d{1,2}):(\d{2})\b/i,

    /\b(?:à|a)\s+(\d{1,2})\s*h\s*(\d{2})?\b/i,

    /\b(?:à|a)\s+(\d{1,2}):(\d{2})\b/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      source.match(
        pattern
      );

    if (!match) {
      continue;
    }

    const hour =
      Number(
        match[1]
      );

    const minutes =
      match[2]
        ? Number(
            match[2]
          )
        : 0;

    if (
      !Number.isFinite(hour) ||
      hour < 0 ||
      hour > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      continue;
    }

    return {
      value:
        `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,

      confidence:
        92
    };
  }

  return null;
}

/**
 * =====================================================
 * LIEU
 * =====================================================
 */

function extractMeetingPlace(
  text
) {
  const source =
    String(text || "");

  if (!source.trim()) {
    return null;
  }

  const candidates = [];

  /*
   * Cas très fiable :
   * Adresse : ...
   */
  collectPlaceCandidates(
    source,
    /\badresse\s*:\s*/gi,
    170,
    140,
    candidates
  );

  /*
   * se tiendra à ...
   */
  collectPlaceCandidates(
    source,
    /\b(?:se tiendra|aura lieu)[\s\S]{0,120}?\b(?:à|a|au|aux)\s+/gi,
    150,
    100,
    candidates
  );

  /*
   * Lieu :
   */
  collectPlaceCandidates(
    source,
    /\blieu(?: de (?:l['’])?(?:assemblée|assemblee|réunion|reunion|ag))?\s*:\s*/gi,
    150,
    110,
    candidates
  );

  const ranked =
    candidates
      .map(
        (candidate) => {
          const cleaned =
            cleanPlaceCandidate(
              candidate.value
            );

          if (!cleaned) {
            return null;
          }

          return {
            value:
              cleaned,

            score:
              candidate.baseScore +
              scorePlaceCandidate(
                cleaned
              )
          };
        }
      )
      .filter(Boolean)
      .filter(
        (candidate) =>
          candidate.score >=
          80
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  if (!ranked.length) {
    return null;
  }

  const best =
    ranked[0];

  return {
    value:
      best.value,

    confidence:
      Math.min(
        96,
        Math.max(
          75,
          best.score
        )
      )
  };
}

function collectPlaceCandidates(
  source,
  regex,
  maxLength,
  baseScore,
  output
) {
  regex.lastIndex = 0;

  let match;

  while (
    (
      match =
        regex.exec(
          source
        )
    )
  ) {
    const start =
      match.index +
      match[0].length;

    const raw =
      source.slice(
        start,
        start +
          maxLength
      );

    if (!raw.trim()) {
      continue;
    }

    output.push({
      value:
        raw,

      baseScore
    });

    if (
      match[0].length === 0
    ) {
      regex.lastIndex += 1;
    }
  }
}

function cleanPlaceCandidate(
  value
) {
  let text =
    String(value || "")
      .replace(
        /\r/g,
        "\n"
      )
      .trim();

  if (!text) {
    return null;
  }

  const lines =
    text
      .split(
        /\n/
      )
      .map(
        (line) =>
          line
            .replace(
              /\s+/g,
              " "
            )
            .trim()
      )
      .filter(Boolean);

  const stopPattern =
    /^(?:ce formulaire|avant la date|je soussign|ordre du jour|projets? de résolutions?|pièce jointe|piece jointe|pouvoir|formulaire de vote|une somme affectée|une somme affectee|charges|relevé|releve|résolution|resolution|syndic|remboursement|paiement|cotisation|budget|vous trouverez)/i;

  const usefulLines = [];

  for (
    const line
    of lines
  ) {
    if (
      stopPattern.test(
        line
      )
    ) {
      break;
    }

    /*
     * Date seule.
     */
    if (
      /^(?:le\s+)?\d{1,2}\/\d{1,2}\/\d{4}$/i.test(
        line
      )
    ) {
      continue;
    }

    /*
     * Heure seule.
     */
    if (
      /^(?:a|à)?\s*\d{1,2}:\d{2}$/i.test(
        normalizeText(
          line
        )
      )
    ) {
      continue;
    }

    /*
     * "Adresse :" collé au texte.
     */
    if (
      /^adresse\s*:/i.test(
        line
      )
    ) {
      const cleaned =
        line.replace(
          /^adresse\s*:\s*/i,
          ""
        );

      if (cleaned) {
        usefulLines.push(
          cleaned
        );
      }

      continue;
    }

    usefulLines.push(
      line
    );

    if (
      usefulLines.length >= 3
    ) {
      break;
    }
  }

  text =
    usefulLines
      .join(", ")
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  text =
    text
      .replace(
        /\b(?:ce formulaire|avant la date|je soussign|ordre du jour|pièce jointe|piece jointe|une somme affectée|une somme affectee|remboursement|paiement|charges|relevé|releve).*$/i,
        ""
      )
      .trim();

  text =
    text
      .replace(
        /^[,;:\-–—\s]+/,
        ""
      )
      .replace(
        /[,;:\-–—\s]+$/,
        ""
      )
      .trim();

  if (
    text.length < 4
  ) {
    return null;
  }

  if (
    text.length > 120
  ) {
    return null;
  }

  return text;
}

function scorePlaceCandidate(
  value
) {
  const text =
    normalizeText(
      value
    );

  let score =
    0;

  if (
    /\b\d{5}\b/.test(
      text
    )
  ) {
    score += 40;
  }

  if (
    /\b\d{1,4}\s+(?:rue|avenue|av|boulevard|bd|route|chemin|impasse|allee|place|quai|cours|les|le|la)\b/.test(
      text
    )
  ) {
    score += 35;
  }

  if (
    /\bsalle\b|\bmairie\b|\bhotel\b|\bcentre\b|\bresidence\b|\blocal\b|\bagence\b|\bacropolya\b/.test(
      text
    )
  ) {
    score += 45;
  }

  if (
    value.length >= 5 &&
    value.length <= 100
  ) {
    score += 15;
  }

  if (
    /rembours|paiement|facture|montant|cotisation|ordre du jour|piece jointe|annexe|decouvert bancaire/.test(
      text
    )
  ) {
    score -= 250;
  }

  if (
    /vous devez|vous pouvez|merci de|veuillez|afin de/.test(
      text
    )
  ) {
    score -= 150;
  }

  return score;
}

/**
 * =====================================================
 * ORGANISATEUR / SYNDIC
 * =====================================================
 */

function pickMeetingIssuer(
  organizations,
  text
) {
  const list =
    Array.isArray(organizations)
      ? organizations
      : [];

  const header =
    normalizeText(
      String(text || "")
        .slice(
          0,
          1800
        )
    );

  const scored =
    list
      .map(
        (organization) => {
          const value =
            String(
              organization || ""
            ).trim();

          if (
            value.length < 4
          ) {
            return null;
          }

          let score =
            0;

          const normalized =
            normalizeText(
              value
            );

          if (
            header.includes(
              normalized
            )
          ) {
            score += 80;
          }

          if (
            /syndic|gestionnaire|agence|habitat|immobilier|gestion/.test(
              normalized
            )
          ) {
            score += 35;
          }

          return {
            value,
            score
          };
        }
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  if (
    scored.length &&
    scored[0].score > 0
  ) {
    return scored[0].value;
  }

  const explicitPatterns = [
    /(?:syndic|organisateur|gestionnaire)\s*[:\-]\s*([^\n]{3,100})/i,
    /\b(SQH\s+[A-ZÀ-Ü][^\n]{3,80})/i,
    /\b(Square Habitat[^\n]{0,60})/i
  ];

  for (
    const pattern
    of explicitPatterns
  ) {
    const match =
      String(text || "")
        .match(
          pattern
        );

    if (
      match?.[1]
    ) {
      return cleanEntity(
        match[1]
      );
    }
  }

  return null;
}

/**
 * =====================================================
 * ACTIONS
 * =====================================================
 */

function buildMeetingActions({
  text,
  meetingDate,
  meetingTime,
  meetingPlace
}) {
  const actions = [];

  if (
    meetingDate
  ) {
    actions.push({
      action:
        "Participer à l’assemblée générale",

      how:
        buildParticipationHow({
          meetingDate,
          meetingTime,
          meetingPlace
        }),

      confidence:
        95
    });
  }

  if (
    /vote par correspondance/i.test(
      text
    )
  ) {
    const deadline =
      extractVoteDeadline(
        text
      );

    actions.push({
      action:
        "Voter par correspondance si vous ne pouvez pas participer",

      how:
        deadline
          ? `Envoyer le formulaire avant le ${deadline}.`
          : "Utiliser le formulaire de vote par correspondance joint à la convocation.",

      confidence:
        90
    });
  }

  if (
    /procuration|pouvoir joint/i.test(
      text
    )
  ) {
    actions.push({
      action:
        "Donner procuration si nécessaire",

      how:
        "Compléter le pouvoir joint et désigner un mandataire autorisé.",

      confidence:
        88
    });
  }

  return actions;
}

function buildParticipationHow({
  meetingDate,
  meetingTime,
  meetingPlace
}) {
  const parts = [];

  if (
    meetingDate?.raw
  ) {
    parts.push(
      `le ${meetingDate.raw}`
    );
  }

  if (
    meetingTime?.value
  ) {
    parts.push(
      `à ${meetingTime.value}`
    );
  }

  if (
    meetingPlace?.value
  ) {
    parts.push(
      `à ${meetingPlace.value}`
    );
  }

  if (!parts.length) {
    return (
      "Consultez la convocation pour les modalités pratiques."
    );
  }

  return parts.join(" ");
}

function extractVoteDeadline(
  text
) {
  const source =
    String(text || "");

  const match =
    source.match(
      /(?:date limite de réception|date limite de reception|avant la date limite)[\s\S]{0,80}?(\d{1,2}\/\d{1,2}\/\d{4})/i
    );

  return (
    match?.[1] ||
    null
  );
}

/**
 * =====================================================
 * RÉSUMÉ
 * =====================================================
 */

function buildMeetingSummary({
  meetingDate,
  meetingTime,
  meetingPlace,
  issuer
}) {
  const parts = [];

  if (
    meetingDate
  ) {
    let sentence =
      `Vous êtes convoqué(e) à une assemblée générale le ${meetingDate.raw}`;

    if (
      meetingTime
    ) {
      sentence +=
        ` à ${meetingTime.value}`;
    }

    sentence +=
      ".";

    parts.push(
      sentence
    );
  } else {
    parts.push(
      "Vous êtes convoqué(e) à une assemblée générale."
    );
  }

  if (
    meetingPlace
  ) {
    parts.push(
      `Lieu : ${meetingPlace.value}.`
    );
  }

  if (
    issuer
  ) {
    parts.push(
      `Organisateur : ${issuer}.`
    );
  }

  return parts
    .slice(
      0,
      3
    )
    .join(" ");
}

function buildMeetingDateMeaning(
  meetingTime,
  meetingPlace
) {
  const parts = [];

  if (
    meetingTime
  ) {
    parts.push(
      `à ${meetingTime.value}`
    );
  }

  if (
    meetingPlace
  ) {
    parts.push(
      `à ${meetingPlace.value}`
    );
  }

  if (
    !parts.length
  ) {
    return (
      "Date de l’assemblée générale"
    );
  }

  return (
    `Assemblée générale ${parts.join(" ")}`
  );
}

/**
 * =====================================================
 * ORDRE DU JOUR
 * =====================================================
 */

function extractAgenda(
  text
) {
  const source =
    String(text || "");

  const match =
    source.match(
      /(?:^|\n)\s*ordre du jour\s*(?:\n|:|-)([\s\S]{0,1800})/i
    );

  if (!match) {
    return [];
  }

  const block =
    match[1];

  const lines =
    block
      .split(
        /\n/
      )
      .map(
        (line) =>
          line
            .replace(
              /\s+/g,
              " "
            )
            .trim()
      )
      .filter(Boolean);

  const results = [];

  for (
    const line
    of lines
  ) {
    const normalized =
      normalizeText(
        line
      );

    if (
      /projets de resolutions|formulaire de vote|pouvoir|rappel des dispositions/.test(
        normalized
      )
    ) {
      break;
    }

    if (
      /piece jointe|annexe|\.pdf|rgdd|page \d|formulaire|pouvoir/.test(
        normalized
      )
    ) {
      continue;
    }

    const itemMatch =
      line.match(
        /^\s*(\d+(?:\.\d+)?)\s*[\)\.\-]?\s*(.+)$/i
      );

    if (
      !itemMatch
    ) {
      continue;
    }

    const label =
      itemMatch[2]
        .trim();

    if (
      label.length < 5 ||
      label.length > 140
    ) {
      continue;
    }

    results.push(
      `${itemMatch[1]}. ${label}`
    );

    if (
      results.length >= 5
    ) {
      break;
    }
  }

  return results;
}

/**
 * =====================================================
 * PREUVES
 * =====================================================
 */

function buildEvidence({
  meetingDate,
  meetingTime,
  meetingPlace,
  text
}) {
  const evidence = [];

  if (
    meetingDate
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        meetingDate.context ||
        meetingDate.raw,

      explanation:
        "Date de l’assemblée générale"
    });
  }

  if (
    meetingTime
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        meetingTime.value,

      explanation:
        "Heure de l’assemblée"
    });
  }

  if (
    meetingPlace
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        meetingPlace.value,

      explanation:
        "Lieu de l’assemblée"
    });
  }

  if (
    /ordre du jour/i.test(
      text
    )
  ) {
    evidence.push({
      page:
        "Page 1",

      quote:
        "Ordre du jour",

      explanation:
        "La convocation comporte un ordre du jour."
    });
  }

  return evidence;
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function cleanEntity(
  value
) {
  const text =
    String(value || "")
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return text
    .replace(
      /\b(?:une somme affectée|une somme affectee|ordre du jour|pièce jointe|piece jointe|charges|relevé|releve).*$/i,
      ""
    )
    .trim()
    .slice(
      0,
      100
    );
}

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
