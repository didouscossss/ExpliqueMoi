/**
 * E — Adaptateur convocation AG V2.
 *
 * Objectifs :
 * - détecter correctement date / heure / lieu ;
 * - éviter de transformer une phrase quelconque en lieu ;
 * - fonctionner même quand l'OCR met toute la page sur une ligne ;
 * - produire des actions concrètes ;
 * - rester prudent si une information n'est pas fiable.
 */

const TIME_RE =
  /\b(?:à|a|vers)\s+(\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/i;

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
    extraction?.entities?.organizations || [];

  const actionPhrases =
    Array.isArray(extraction.actionPhrases)
      ? extraction.actionPhrases
      : [];

  /*
   * =====================================================
   * DATE
   * =====================================================
   */

  const meetingDate =
    dates.find(
      (date) =>
        date.role === "meetingDate" &&
        date.important
    ) ||

    dates.find(
      (date) =>
        /assemblée|assemblee|ag\b|réunion|reunion|convocation/.test(
          normalizeText(
            date?.context || ""
          )
        )
    ) ||

    null;

  /*
   * =====================================================
   * HEURE
   * =====================================================
   */

  const meetingTime =
    extractMeetingTime(text);

  /*
   * =====================================================
   * LIEU
   * =====================================================
   */

  const meetingPlace =
    extractMeetingPlace(text);

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
   * =====================================================
   */

  const agenda =
    extractAgenda(text);

  /*
   * =====================================================
   * FAITS IMPORTANTS
   * =====================================================
   */

  const importantFacts = [];

  if (meetingDate) {
    importantFacts.push({
      kind: "date",
      label: "Date de l’assemblée",
      value: meetingDate.raw,
      confidence:
        meetingDate.confidence || 85
    });
  }

  if (meetingTime) {
    importantFacts.push({
      kind: "time",
      label: "Heure",
      value: meetingTime.value,
      confidence:
        meetingTime.confidence
    });
  }

  if (meetingPlace) {
    importantFacts.push({
      kind: "place",
      label: "Lieu",
      value: meetingPlace.value,
      confidence:
        meetingPlace.confidence
    });
  }

  if (issuer) {
    importantFacts.push({
      kind: "issuer",
      label: "Syndic / organisateur",
      value: issuer,
      confidence: 75
    });
  }

 
  

  /*
   * =====================================================
   * RÉSUMÉ
   * =====================================================
   */

  const summary =
    buildMeetingSummary({
      meetingDate,
      meetingTime,
      meetingPlace
    });

  /*
   * =====================================================
   * COMPRÉHENSION
   * =====================================================
   */

  const usefulCount =
    [
      meetingDate,
      meetingTime,
      meetingPlace,
      issuer,
      agenda.length
        ? true
        : null
    ].filter(Boolean).length;

  let understandingLevel =
    "extraction";

  if (
    meetingDate &&
    usefulCount >= 2
  ) {
    understandingLevel =
      "strong";
  } else if (
    usefulCount >= 1
  ) {
    understandingLevel =
      "probable";
  }

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    family:
      "copropriete",

    documentType:
      detection.documentType ||
      "Convocation à une assemblée générale",

    understandingLevel,

    confidence:
      understandingLevel === "strong"
        ? Math.max(
            detection.confidence || 0,
            86
          )
        : understandingLevel === "probable"
          ? Math.max(
              detection.confidence || 0,
              60
            )
          : Math.min(
              detection.confidence || 40,
              45
            ),

    issuer,

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

    importantFacts:
      importantFacts.slice(
        0,
        6
      ),

    actions:
      actions.slice(
        0,
        4
      ),

    /*
     * Une AG n'est pas vraiment une "deadline".
     * On garde néanmoins la date dans cette structure
     * afin que l'interface puisse la mettre en avant.
     */
    deadlines:
      meetingDate
        ? [
            {
              date:
                meetingDate.raw,

              label:
                "Date de l’AG",

              meaning:
                "Date de tenue de l’assemblée générale",

              confidence:
                meetingDate.confidence ||
                85
            }
          ]
        : [],

    whyReceived:
      summary,

    documentPurpose:
      "Vous informer de la tenue d’une assemblée générale et des modalités de participation.",

    attentionLevel:
      meetingDate
        ? "soon"
        : "uncertain",

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
          "L’heure de l’assemblée n’a pas été identifiée.",

        !meetingPlace &&
          "Le lieu de l’assemblée n’a pas été identifié avec suffisamment de certitude."
      ].filter(Boolean)
  };
}

/**
 * =====================================================
 * HEURE
 * =====================================================
 */

function extractMeetingTime(text) {
  const source =
    String(text || "");

  /*
   * Recherche d'abord autour des expressions AG.
   */
  const contexts =
    findContextsAroundPatterns(
      source,
      [
        /assemblée générale/gi,
        /assemblee generale/gi,
        /\bAG\b/g,
        /réunion/gi,
        /reunion/gi,
        /se tiendra/gi,
        /aura lieu/gi
      ],
      180
    );

  for (
    const context
    of contexts
  ) {
    const match =
      context.match(TIME_RE);

    if (match) {
      return {
        value:
          normalizeTime(
            match[1]
          ),

        confidence:
          90
      };
    }
  }

  /*
   * Fallback document complet.
   */
  const match =
    source.match(TIME_RE);

  if (!match) {
    return null;
  }

  return {
    value:
      normalizeTime(
        match[1]
      ),

    confidence:
      70
  };
}

/**
 * =====================================================
 * LIEU
 * =====================================================
 */

function extractMeetingPlace(text) {
  const source =
    String(text || "");

  const normalized =
    normalizeText(source);

  if (!normalized) {
    return null;
  }

  const candidates = [];

  /*
   * =====================================================
   * 1 — LABELS EXPLICITES
   * =====================================================
   */

  collectPlaceCandidates(
    source,
    /\b(?:lieu de (?:l['’])?(?:assemblée|assemblee|ag|réunion|reunion)|lieu de la réunion|adresse de la réunion|adresse de l['’]assemblée)\s*[:\-]\s*/gi,
    130,
    110,
    candidates
  );

  /*
   * "Lieu :" seul est accepté,
   * mais avec un score légèrement inférieur.
   */
  collectPlaceCandidates(
    source,
    /\blieu\s*[:\-]\s*/gi,
    110,
    85,
    candidates
  );

  /*
   * =====================================================
   * 2 — FORMULATIONS NATURELLES
   * =====================================================
   */

  collectPlaceCandidates(
    source,
    /\b(?:l['’]assemblée générale|l['’]assemblee generale|l['’]AG|la réunion|la reunion)\s+(?:se tiendra|aura lieu)\s+(?:à|a|au|aux)\s+/gi,
    130,
    105,
    candidates
  );

  collectPlaceCandidates(
    source,
    /\b(?:se tiendra|aura lieu)\s+(?:à|a|au|aux)\s+/gi,
    130,
    95,
    candidates
  );

  /*
   * =====================================================
   * 3 — VALIDATION / SCORE
   * =====================================================
   */

  const ranked =
    candidates
      .map(
        (candidate) => ({
          ...candidate,
          score:
            candidate.baseScore +
            scorePlaceCandidate(
              candidate.value
            )
        })
      )
      .filter(
        (candidate) =>
          candidate.score >= 75
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!ranked.length) {
    return null;
  }

  return {
    value:
      ranked[0].value,

    confidence:
      Math.min(
        96,
        Math.max(
          65,
          ranked[0].score
        )
      )
  };
}

/**
 * Récupère uniquement une petite zone après
 * une expression indiquant un lieu.
 */
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
        regex.exec(source)
    )
  ) {
    const start =
      match.index +
      match[0].length;

    const raw =
      source.slice(
        start,
        start + maxLength
      );

    const value =
      cleanPlaceCandidate(raw);

    if (!value) {
      continue;
    }

    output.push({
      value,
      baseScore
    });
  }
}

/**
 * Nettoie le texte trouvé après "Lieu :"
 * ou "se tiendra à".
 */
function cleanPlaceCandidate(value) {
  let text =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return null;
  }

  /*
   * Coupe dès qu'une nouvelle rubrique commence.
   */
  const stopPatterns = [
    /\bordre du jour\b/i,
    /\brésolution\b/i,
    /\bresolution\b/i,
    /\bprocuration\b/i,
    /\bpouvoir\b/i,
    /\bvote par correspondance\b/i,
    /\bmodalités de participation\b/i,
    /\bmodalites de participation\b/i,
    /\bremboursement\b/i,
    /\bremboursé\b/i,
    /\brembourse\b/i,
    /\bpaiement\b/i,
    /\bmontant\b/i,
    /\bcotisation\b/i,
    /\béchéance\b/i,
    /\becheance\b/i,
    /\bsyndicat rembourse\b/i,
    /\bpièces jointes\b/i,
    /\bpieces jointes\b/i
  ];

  let cutAt =
    text.length;

  for (
    const pattern
    of stopPatterns
  ) {
    const match =
      text.match(pattern);

    if (
      match &&
      typeof match.index ===
        "number"
    ) {
      cutAt =
        Math.min(
          cutAt,
          match.index
        );
    }
  }

  text =
    text
      .slice(
        0,
        cutAt
      )
      .trim();

  /*
   * Coupe à certains séparateurs OCR.
   */
  text =
    text
      .split(
        /\s+[|•]\s+/
      )[0]
      .trim();

  /*
   * Une adresse / salle ne doit pas être
   * une phrase gigantesque.
   */
  if (
    text.length > 100
  ) {
    text =
      text
        .slice(0, 100)
        .trim();
  }

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
    text.length < 3
  ) {
    return null;
  }

  return text;
}

/**
 * Évalue si le candidat ressemble vraiment à un lieu.
 */
function scorePlaceCandidate(value) {
  const text =
    normalizeText(value);

  let score = 0;

  /*
   * Signaux d'adresse.
   */
  if (
    /\b\d{1,4}\s+(?:rue|avenue|av\b|boulevard|bd\b|route|chemin|impasse|allée|allee|place|quai|cours)\b/.test(
      text
    )
  ) {
    score += 55;
  }

  if (
    /\b\d{5}\b/.test(
      text
    )
  ) {
    score += 35;
  }

  /*
   * Types de lieux fréquents.
   */
  if (
    /\bsalle\b|\bmairie\b|\bhôtel de ville\b|\bhotel de ville\b|\bsiège\b|\bsiege\b|\blocal\b|\bcentre\b|\bclub\b|\brestaurant\b|\bhôtel\b|\bhotel\b|\brésidence\b|\bresidence\b|\bimmeuble\b|\bagence\b/.test(
      text
    )
  ) {
    score += 45;
  }

  /*
   * Nom propre / lieu court :
   * peut être valable même sans adresse complète.
   */
  if (
    value.length >= 4 &&
    value.length <= 70
  ) {
    score += 15;
  }

  /*
   * Rejets forts.
   */
  if (
    /rembours|paiement|facture|montant|cotisation|procuration|résolution|resolution|ordre du jour/.test(
      text
    )
  ) {
    score -= 150;
  }

  if (
    /vous devez|vous pouvez|merci de|afin de|veuillez|sera rembours|a payer|à payer/.test(
      text
    )
  ) {
    score -= 120;
  }

  /*
   * Une phrase avec trop de verbes ressemble plus
   * à une instruction qu'à un lieu.
   */
  if (
    /\b(?:est|sera|serez|devez|devrez|pouvez|pourrez|faire|envoyer|retourner|payer|rembourser)\b/.test(
      text
    )
  ) {
    score -= 65;
  }

  return score;
}

/**
 * =====================================================
 * ORGANISATEUR
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

  const explicit =
    findLabeled(
      text,
      /(?:syndic|organisateur)\s*[:\-]\s*([^\n]{3,100})/i
    );

  if (explicit) {
    return cleanEntity(explicit);
  }

  const syndic =
    list.find(
      (value) =>
        /syndic/i.test(
          String(value || "")
        )
    );

  if (syndic) {
    return syndic;
  }

  return (
    list.find(
      (value) =>
        String(value || "")
          .trim()
          .length >= 4
    ) ||
    null
  );
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
  const seen = new Set();

  for (
    const phrase
    of actionPhrases
  ) {
    const source =
      String(
        phrase?.phrase || ""
      );

    if (
      !/procuration|pouvoir|participer|voter|correspondance|présence|presence/.test(
        normalizeText(source)
      )
    ) {
      continue;
    }

    const action =
      cleanAction(source);

    const key =
      normalizeText(action);

    if (
      !action ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    actions.push({
      action,

      how:
        "Selon les modalités indiquées dans la convocation",

      confidence:
        phrase.confidence ||
        70
    });
  }

  /*
   * Action principale générique.
   */
  if (
    meetingDate
  ) {
    const details = [];

    details.push(
      meetingDate.raw
    );

    if (
      meetingTime
    ) {
      details.push(
        `à ${meetingTime.value}`
      );
    }

    if (
      meetingPlace
    ) {
      details.push(
        `au lieu indiqué : ${meetingPlace.value}`
      );
    }

    actions.unshift({
      action:
        "Participer à l’assemblée générale ou vous faire représenter",

      how:
        details.length
          ? details.join(" ")
          : "Consultez la convocation pour les modalités de participation.",

      confidence:
        90
    });
  }

  if (
    !actions.length &&
    /procuration|pouvoir/.test(
      normalizeText(text)
    )
  ) {
    actions.push({
      action:
        "Participer à l’AG ou donner procuration",

      how:
        "Utilisez le formulaire de pouvoir joint s’il est disponible.",

      confidence:
        75
    });
  }

  return actions;
}

/**
 * =====================================================
 * RÉSUMÉ
 * =====================================================
 */

function buildMeetingSummary({
  meetingDate,
  meetingTime,
  meetingPlace
}) {
  if (
    meetingDate &&
    meetingTime &&
    meetingPlace
  ) {
    return (
      `Vous êtes convoqué(e) à une assemblée générale le ${meetingDate.raw} à ${meetingTime.value}, à ${meetingPlace.value}.`
    );
  }

  if (
    meetingDate &&
    meetingTime
  ) {
    return (
      `Vous êtes convoqué(e) à une assemblée générale le ${meetingDate.raw} à ${meetingTime.value}.`
    );
  }

  if (
    meetingDate &&
    meetingPlace
  ) {
    return (
      `Vous êtes convoqué(e) à une assemblée générale le ${meetingDate.raw}, à ${meetingPlace.value}.`
    );
  }

  if (meetingDate) {
    return (
      `Vous êtes convoqué(e) à une assemblée générale prévue le ${meetingDate.raw}.`
    );
  }

  return (
    "Ce document vous convoque à une assemblée générale."
  );
}

function buildMeetingDateMeaning(
  meetingTime,
  meetingPlace
) {
  const parts = [];

  if (meetingTime) {
    parts.push(
      `à ${meetingTime.value}`
    );
  }

  if (meetingPlace) {
    parts.push(
      `à ${meetingPlace.value}`
    );
  }

  if (!parts.length) {
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

function extractAgenda(text) {
  const block =
    String(text || "")
      .match(
        /ordre du jour\s*[:\-]?\s*([\s\S]{0,900})/i
      );

  if (!block) {
    return [];
  }

 return block[1]
  .split(/\n|•|\d+[\)\.]/)
  .map((line) => line.replace(/\s+/g, " ").trim())
  .filter((line) => {
    if (
      line.length < 8 ||
      line.length > 120
    ) {
      return false;
    }

    const lower =
      normalizeText(line);

    if (
      /piece jointe|annexe|\.pdf|rgdd|formulaire de vote|pouvoir/.test(
        lower
      )
    ) {
      return false;
    }

    return true;
  })
  .slice(0, 3);
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

  if (meetingDate) {
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

  if (meetingTime) {
    evidence.push({
      page:
        "Page 1",

      quote:
        meetingTime.value,

      explanation:
        "Heure de l’assemblée"
    });
  }

  if (meetingPlace) {
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
        "ordre du jour",

      explanation:
        "Présence d’un ordre du jour"
    });
  }

  return evidence;
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function findContextsAroundPatterns(
  text,
  patterns,
  radius
) {
  const source =
    String(text || "");

  const contexts = [];

  for (
    const pattern
    of patterns
  ) {
    pattern.lastIndex = 0;

    let match;

    while (
      (
        match =
          pattern.exec(source)
      )
    ) {
      const start =
        Math.max(
          0,
          match.index -
            radius
        );

      const end =
        Math.min(
          source.length,
          match.index +
            match[0].length +
            radius
        );

      contexts.push(
        source.slice(
          start,
          end
        )
      );

      if (
        contexts.length >=
        12
      ) {
        return contexts;
      }
    }
  }

  return contexts;
}

function normalizeTime(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(
      /^(\d{1,2})h$/,
      "$1h00"
    );
}

function cleanAction(phrase) {
  const text =
    String(phrase || "")
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return text.length > 140
    ? `${text.slice(0, 137)}…`
    : text;
}

function cleanEntity(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function findLabeled(text, re) {
  const match =
    String(text || "")
      .match(re);

  return match
    ? match[1].trim()
    : null;
}

function normalizeText(value) {
  return String(value || "")
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
