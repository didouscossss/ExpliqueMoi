/**
 * E — Adaptateur convocation AG V3.
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

  const actionPhrases =
    Array.isArray(
      extraction.actionPhrases
    )
      ? extraction.actionPhrases
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
      actionPhrases,
      meetingDate,
      meetingTime,
      meetingPlace
    });

  /*
   * =====================================================
   * ORDRE DU JOUR
   *
   * Conservé pour une éventuelle vue détaillée,
   * mais PAS injecté dans le résumé principal.
   * =====================================================
   */

  const agenda =
    extractAgenda(
      text
    );

  /*
   * =====================================================
   * FAITS IMPORTANTS
   *
   * On ne conserve volontairement que les informations
   * dont l'utilisateur a besoin immédiatement.
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

    mainDate:
      meetingDate
        ? {
            date:
              meetingDate.raw,

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

    /*
     * IMPORTANT :
     * whyReceived reste une phrase courte.
     */
    whyReceived:
      summary,

    documentPurpose:
      "Vous convoquer à une assemblée générale de copropriété et vous indiquer comment y participer ou voter.",

    attentionLevel:
      meetingDate
        ? "soon"
        : "uncertain",

    /*
     * On garde l'ordre du jour seulement en donnée
     * structurée éventuelle.
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

  if (!list.length) {
    return findMeetingDateDirectly(
      source
    );
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
         * =================================================
         * TRÈS FORT : rôle déjà meetingDate
         * =================================================
         */

        if (
          date.role ===
            "meetingDate"
        ) {
          score += 180;
        }

        /*
         * =================================================
         * TRÈS FORT :
         * formulations directement liées à l'AG
         * =================================================
         */

        if (
          /date de l assemblee/.test(
            context
          )
        ) {
          score += 220;
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
          score += 240;
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
          score += 180;
        }

        /*
         * =================================================
         * BON SIGNAL :
         * assemblée + heure proche
         * =================================================
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
          score += 120;
        }

        /*
         * =================================================
         * TRÈS MAUVAIS :
         * date d'émission / courrier
         * =================================================
         */

        if (
          /poitiers le|tours le|paris le|fait le|edite le|edite, le|emis le|émis le|date du courrier|date de facture/.test(
            context
          )
        ) {
          score -= 240;
        }

        /*
         * =================================================
         * MAUVAIS :
         * dates comptables / historiques
         * =================================================
         */

        if (
          /exercice|budget|charges|releve|facture|echeance|appel de fonds|travaux|contrat/.test(
            context
          )
        ) {
          score -= 140;
        }

        /*
         * =================================================
         * Cherche aussi le contexte DIRECT dans le texte
         * =================================================
         */

        const directScore =
          scoreMeetingDateInSource(
            normalizedSource,
            raw
          );

        score +=
          directScore;

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

  /*
   * Si aucune date extraite n'est assez fiable,
   * on cherche directement dans le texte.
   */
  if (
    !scored.length ||
    scored[0].score < 100
  ) {
    return (
      findMeetingDateDirectly(
        source
      ) ||
      null
    );
  }

  const winner =
    scored[0];

  return {
    ...winner.date,

    role:
      "meetingDate",

    important:
      true,

    confidence:
      winner.score >= 300
        ? 98
        : winner.score >= 220
          ? 95
          : winner.score >= 150
            ? 90
            : 80
  };
}

function scoreDateNearMeetingWords(
  text,
  rawDate
) {
  let score = 0;

  let index =
    text.indexOf(
      rawDate
    );

  let checked = 0;

  while (
    index >= 0 &&
    checked < 8
  ) {
    const start =
      Math.max(
        0,
        index - 180
      );

    const end =
      Math.min(
        text.length,
        index +
          rawDate.length +
          180
      );

    const local =
      text.slice(
        start,
        end
      );

    if (
      /assemblee generale|assemblee|\bag\b|convocation|se tiendra|date et lieu/.test(
        local
      )
    ) {
      score =
        Math.max(
          score,
          100
        );
    }

    if (
      /\b\d{1,2}h(?:\d{2})?\b|\b\d{1,2}:\d{2}\b/.test(
        local
      )
    ) {
      score =
        Math.max(
          score,
          120
        );
    }

    if (
      /poitiers le|tours le|paris le|fait le/.test(
        local
      ) &&
      !/assemblee|se tiendra/.test(
        local
      )
    ) {
      score -= 50;
    }

    index =
      text.indexOf(
        rawDate,
        index +
          rawDate.length
      );

    checked += 1;
  }

  return score;
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
    /(?:assemblée générale|assemblee generale|assemblée|assemblee|AG|réunion|reunion)[\s\S]{0,160}?\b(?:à|a)\s*(\d{1,2})\s*h\s*(\d{2})?\b/i,

    /(?:assemblée générale|assemblee generale|assemblée|assemblee|AG|réunion|reunion)[\s\S]{0,160}?\b(\d{1,2}):(\d{2})\b/i,

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
   * -----------------------------------------------------
   * CAS 1
   *
   * Date et lieu :
   * Le 20/07/2026
   * A 17:00
   * Adresse : ACROPOLYA Salle Cristal
   * 1 Les Chaumettes
   * 86270 La Roche-Posay
   * -----------------------------------------------------
   */

  collectPlaceCandidates(
    source,
    /\badresse\s*:\s*/gi,
    170,
    140,
    candidates
  );

  /*
   * -----------------------------------------------------
   * CAS 2
   *
   * Elle se tiendra le :
   * lundi...
   * ACROPOLYA Salle Cristal...
   * -----------------------------------------------------
   */

  collectPlaceCandidates(
    source,
    /\b(?:se tiendra|aura lieu)[\s\S]{0,120}?\b(?:à|a|au|aux)\s+/gi,
    150,
    100,
    candidates
  );

  /*
   * -----------------------------------------------------
   * CAS 3
   *
   * Lieu :
   * -----------------------------------------------------
   */

  collectPlaceCandidates(
    source,
    /\blieu(?: de (?:l['’])?(?:assemblée|assemblee|réunion|reunion|ag))?\s*:\s*/gi,
    150,
    110,
    candidates
  );

  /*
   * -----------------------------------------------------
   * Validation finale.
   * -----------------------------------------------------
   */

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

    /*
     * sécurité regex globale
     */
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

  /*
   * On garde au maximum quelques lignes.
   */
  let lines =
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

  /*
   * On coupe dès qu'une rubrique suivante commence.
   */
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
     * On élimine la date et l'heure si elles ont
     * été absorbées avant l'adresse.
     */
    if (
      /^(?:le\s+)?\d{1,2}\/\d{1,2}\/\d{4}$/i.test(
        line
      )
    ) {
      continue;
    }

    if (
      /^(?:a|à)?\s*\d{1,2}:\d{2}$/i.test(
        normalizeText(
          line
        )
      )
    ) {
      continue;
    }

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

      if (
        cleaned
      ) {
        usefulLines.push(
          cleaned
        );
      }

      continue;
    }

    usefulLines.push(
      line
    );

    /*
     * Une adresse complète prend rarement
     * plus de trois lignes.
     */
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

  /*
   * Coupe encore les éventuels débuts
   * de rubrique collés par l'OCR.
   */
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
    text.length <
    4
  ) {
    return null;
  }

  if (
    text.length >
    120
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

  let score = 0;

  /*
   * Code postal.
   */
  if (
    /\b\d{5}\b/.test(
      text
    )
  ) {
    score += 40;
  }

  /*
   * Adresse.
   */
  if (
    /\b\d{1,4}\s+(?:rue|avenue|av|boulevard|bd|route|chemin|impasse|allee|place|quai|cours|les|le|la)\b/.test(
      text
    )
  ) {
    score += 35;
  }

  /*
   * Type d'établissement.
   */
  if (
    /\bsalle\b|\bmairie\b|\bhotel\b|\bcentre\b|\bresidence\b|\blocal\b|\bagence\b|\bacropolya\b/.test(
      text
    )
  ) {
    score += 45;
  }

  /*
   * Format court.
   */
  if (
    value.length >= 5 &&
    value.length <= 100
  ) {
    score += 15;
  }

  /*
   * Rejets très forts.
   */
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

  /*
   * Recherche de Square Habitat / SQH
   * sans coder une société précise :
   * on utilise d'abord l'extraction d'organisation.
   */

  const scored =
    list
      .map(
        (organization) => {
          const value =
            String(
              organization ||
              ""
            ).trim();

          if (
            value.length <
            4
          ) {
            return null;
          }

          let score = 0;

          const normalized =
            normalizeText(
              value
            );

          const header =
            normalizeText(
              String(text || "")
                .slice(
                  0,
                  1800
                )
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
    scored[0].score >
      0
  ) {
    return scored[0].value;
  }

  /*
   * Fallback sur quelques libellés explicites.
   */
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
  actionPhrases,
  meetingDate,
  meetingTime,
  meetingPlace
}) {
  const actions = [];

  /*
   * Action principale.
   */
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

  /*
   * Vote par correspondance.
   */
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

  /*
   * Procuration.
   */
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

  /*
   * On n'ajoute PAS les phrases brutes issues
   * de l'extracteur : elles peuvent être énormes.
   */
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

  return (
    parts.join(" ")
  );
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

  /*
   * Phrase principale.
   */
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

  /*
   * Lieu.
   */
  if (
    meetingPlace
  ) {
    parts.push(
      `Lieu : ${meetingPlace.value}.`
    );
  }

  /*
   * Organisateur.
   */
  if (
    issuer
  ) {
    parts.push(
      `Organisateur : ${issuer}.`
    );
  }

  /*
   * Maximum trois phrases.
   */
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

  /*
   * On cherche de préférence une vraie section
   * "ORDRE DU JOUR", pas la liste des pièces jointes.
   */
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

    /*
     * Stop si nouvelle grosse section.
     */
    if (
      /projets de resolutions|formulaire de vote|pouvoir|rappel des dispositions/.test(
        normalized
      )
    ) {
      break;
    }

    /*
     * Rejets.
     */
    if (
      /piece jointe|annexe|\.pdf|rgdd|page \d|formulaire|pouvoir/.test(
        normalized
      )
    ) {
      continue;
    }

    /*
     * Cherche surtout les points numérotés.
     */
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
      label.length <
        5 ||
      label.length >
        140
    ) {
      continue;
    }

    results.push(
      `${itemMatch[1]}. ${label}`
    );

    if (
      results.length >=
      5
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

  /*
   * Coupe les morceaux comptables ou annexes
   * accidentellement collés.
   */
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
