/**
 * ============================================================
 * DIDOU — SEMANTIC RELEVANCE ENGINE V1
 * ============================================================
 *
 * OBJECTIF
 * -------
 * Déterminer ce qui est réellement important POUR L'UTILISATEUR
 * dans n'importe quel document.
 *
 * Ce moteur ne résume pas.
 * Ce moteur ne génère pas le texte utilisateur.
 * Ce moteur ne remplace pas le Decision Engine.
 *
 * Il répond à une question :
 *
 * "Parmi toutes les informations extraites du document,
 * lesquelles sont réellement importantes, pourquoi,
 * et quel rôle jouent-elles ?"
 *
 * PRINCIPES
 * ----------
 * - aucune date codée en dur
 * - aucun montant codé en dur
 * - aucun nom codé en dur
 * - aucun document personnel codé en dur
 * - raisonnement par contexte et rôle sémantique
 * - conservation de la provenance
 * - gestion de l'incertitude
 * - distinction fait / action / option / référence
 * - distinction information utilisateur / information tierce
 * - détection du bruit documentaire
 *
 * ============================================================
 */


/* ============================================================
 * 1. CONSTANTES
 * ============================================================
 */

const RELEVANCE = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NOISE: "noise"
});


const INFORMATION_KIND = Object.freeze({
  DATE: "date",
  AMOUNT: "amount",
  ACTION: "action",
  EVENT: "event",
  DECISION: "decision",
  OBLIGATION: "obligation",
  OPTION: "option",
  RIGHT: "right",
  CONTACT: "contact",
  PERSON: "person",
  ORGANIZATION: "organization",
  ADDRESS: "address",
  REFERENCE: "reference",
  STATUS: "status",
  FACT: "fact",
  UNKNOWN: "unknown"
});


const DATE_ROLE = Object.freeze({
  DEADLINE: "deadline",
  EVENT_DATE: "eventDate",
  MEETING_DATE: "meetingDate",
  PAYMENT_DUE: "paymentDueDate",
  ISSUE_DATE: "issueDate",
  START_DATE: "startDate",
  END_DATE: "endDate",
  COVERAGE_START: "coverageStart",
  COVERAGE_END: "coverageEnd",
  SIGNATURE_DATE: "signatureDate",
  DECISION_DATE: "decisionDate",
  REFERENCE_DATE: "referenceDate",
  HISTORICAL_DATE: "historicalDate",
  LEGAL_REFERENCE_DATE: "legalReferenceDate",
  ANNEX_DATE: "annexDate",
  UNKNOWN: "unknown"
});


const AMOUNT_ROLE = Object.freeze({
  AMOUNT_DUE: "amountDue",
  TOTAL_AMOUNT: "totalAmount",
  REFUND_AMOUNT: "refundAmount",
  MONTHLY_AMOUNT: "monthlyAmount",
  INSTALLMENT_AMOUNT: "installmentAmount",
  TAX_AMOUNT: "taxAmount",
  QUOTED_AMOUNT: "quotedAmount",
  APPROVED_AMOUNT: "approvedAmount",
  ESTIMATED_AMOUNT: "estimatedAmount",
  REFERENCE_AMOUNT: "referenceAmount",
  ANNEX_AMOUNT: "annexAmount",
  UNKNOWN: "unknown"
});


const ACTION_ROLE = Object.freeze({
  REQUIRED: "required",
  RECOMMENDED: "recommended",
  OPTIONAL: "optional",
  CONDITIONAL: "conditional",
  INFORMATIONAL: "informational",
  THIRD_PARTY: "thirdParty",
  PROCEDURAL: "procedural",
  UNKNOWN: "unknown"
});


const TARGET = Object.freeze({
  USER: "user",
  THIRD_PARTY: "thirdParty",
  ORGANIZATION: "organization",
  GENERAL: "general",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 2. OUTILS
 * ============================================================
 */

function clamp(value, min = 0, max = 100) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, n)
  );
}


function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}


function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}


function uniqueBy(items, keyBuilder) {
  const seen = new Set();

  return items.filter((item) => {
    const key =
      keyBuilder(item);

    if (!key) {
      return true;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}


/* ============================================================
 * 3. ANALYSE DU CONTEXTE TEXTUEL
 * ============================================================
 */

function containsAny(text, patterns) {
  const normalized =
    normalizeText(text);

  return patterns.some((pattern) =>
    normalized.includes(
      normalizeText(pattern)
    )
  );
}


function detectReferenceContext(text) {
  return containsAny(text, [
    "conformement a",
    "en application de",
    "en vertu de",
    "arrete du",
    "decret du",
    "loi du",
    "article",
    "jurisprudence",
    "reference",
    "historique",
    "precedemment",
    "anciennement"
  ]);
}


function detectAnnexContext(text) {
  return containsAny(text, [
    "annexe",
    "piece jointe",
    "piece n°",
    "piece no",
    "tableau annexe",
    "document joint",
    "voir annexe"
  ]);
}


function detectDeadlineContext(text) {
  return containsAny(text, [
    "avant le",
    "au plus tard",
    "date limite",
    "delai",
    "echeance",
    "doit etre recu",
    "doit parvenir",
    "dernier delai"
  ]);
}


function detectEventContext(text) {
  return containsAny(text, [
    "rendez-vous",
    "reunion",
    "assemblee",
    "audience",
    "convocation",
    "se tiendra",
    "aura lieu",
    "prevu le",
    "rendez vous"
  ]);
}


function detectPaymentContext(text) {
  return containsAny(text, [
    "a payer",
    "montant du",
    "regler",
    "paiement",
    "prelevement",
    "echeance",
    "solde",
    "reste a payer",
    "total a payer"
  ]);
}


/* ============================================================
 * 4. CIBLE D'UNE ACTION
 * ============================================================
 */

function inferActionTarget(text) {
  const t =
    normalizeText(text);

  /*
   * Formulations généralement adressées
   * directement au destinataire.
   */
  if (
    /\bvous devez\b/.test(t) ||
    /\bveuillez\b/.test(t) ||
    /\bmerci de\b/.test(t) ||
    /\bnous vous invitons\b/.test(t) ||
    /\bvous pouvez\b/.test(t) ||
    /\bvous etes invite\b/.test(t)
  ) {
    return TARGET.USER;
  }

  /*
   * Instructions explicitement concernant
   * une autre personne / organisation.
   */
  if (
    /\ble syndic doit\b/.test(t) ||
    /\ble proprietaire doit\b/.test(t) ||
    /\bl'entreprise doit\b/.test(t) ||
    /\ble bailleur doit\b/.test(t) ||
    /\ble prestataire doit\b/.test(t) ||
    /\bl'assureur doit\b/.test(t)
  ) {
    return TARGET.THIRD_PARTY;
  }

  return TARGET.UNKNOWN;
}


/* ============================================================
 * 5. ROLE D'UNE ACTION
 * ============================================================
 */

function inferActionRole(text) {
  const t =
    normalizeText(text);

  if (
    /\bvous devez\b/.test(t) ||
    /\bveuillez\b/.test(t) ||
    /\bobligatoire\b/.test(t) ||
    /\best tenu de\b/.test(t) ||
    /\bdoit etre\b/.test(t)
  ) {
    return ACTION_ROLE.REQUIRED;
  }

  if (
    /\bsi vous souhaitez\b/.test(t) ||
    /\bsi vous desirez\b/.test(t) ||
    /\bvous pouvez\b/.test(t) ||
    /\bfacultatif\b/.test(t)
  ) {
    return ACTION_ROLE.OPTIONAL;
  }

  if (
    /\ben cas de\b/.test(t) ||
    /\bsi\b/.test(t) ||
    /\ba condition\b/.test(t)
  ) {
    return ACTION_ROLE.CONDITIONAL;
  }

  if (
    /\bil est recommande\b/.test(t) ||
    /\bnous vous conseillons\b/.test(t)
  ) {
    return ACTION_ROLE.RECOMMENDED;
  }

  return ACTION_ROLE.UNKNOWN;
}


/* ============================================================
 * 6. ROLE D'UNE DATE
 * ============================================================
 */

function inferDateRole(item) {
  const context =
    [
      item?.label,
      item?.meaning,
      item?.context,
      item?.text,
      item?.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const t =
    normalizeText(context);

  if (
    detectDeadlineContext(t)
  ) {
    return DATE_ROLE.DEADLINE;
  }

  if (
    containsAny(t, [
      "assemblee generale",
      "assemblee",
      "reunion"
    ])
  ) {
    return DATE_ROLE.MEETING_DATE;
  }

  if (
    containsAny(t, [
      "date de paiement",
      "paiement avant",
      "a regler avant",
      "date d'echeance"
    ])
  ) {
    return DATE_ROLE.PAYMENT_DUE;
  }

  if (
    containsAny(t, [
      "date d'emission",
      "emis le",
      "etabli le"
    ])
  ) {
    return DATE_ROLE.ISSUE_DATE;
  }

  if (
    containsAny(t, [
      "prise d'effet",
      "debut de garantie",
      "a compter du"
    ])
  ) {
    return DATE_ROLE.START_DATE;
  }

  if (
    containsAny(t, [
      "fin de garantie",
      "expire le",
      "expiration"
    ])
  ) {
    return DATE_ROLE.END_DATE;
  }

  if (
    detectReferenceContext(t)
  ) {
    return DATE_ROLE.LEGAL_REFERENCE_DATE;
  }

  if (
    detectAnnexContext(t)
  ) {
    return DATE_ROLE.ANNEX_DATE;
  }

  if (
    detectEventContext(t)
  ) {
    return DATE_ROLE.EVENT_DATE;
  }

  return DATE_ROLE.UNKNOWN;
}


/* ============================================================
 * 7. ROLE D'UN MONTANT
 * ============================================================
 */

function inferAmountRole(item) {
  const context =
    [
      item?.label,
      item?.meaning,
      item?.context,
      item?.text,
      item?.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const t =
    normalizeText(context);

  if (
    containsAny(t, [
      "reste a payer",
      "montant a payer",
      "total a payer",
      "a regler"
    ])
  ) {
    return AMOUNT_ROLE.AMOUNT_DUE;
  }

  if (
    containsAny(t, [
      "remboursement",
      "rembourser",
      "montant rembourse"
    ])
  ) {
    return AMOUNT_ROLE.REFUND_AMOUNT;
  }

  if (
    containsAny(t, [
      "mensuel",
      "par mois",
      "mensualite"
    ])
  ) {
    return AMOUNT_ROLE.MONTHLY_AMOUNT;
  }

  if (
    containsAny(t, [
      "montant total",
      "total ttc",
      "total"
    ])
  ) {
    return AMOUNT_ROLE.TOTAL_AMOUNT;
  }

  if (
    containsAny(t, [
      "devis",
      "proposition",
      "offre"
    ])
  ) {
    return AMOUNT_ROLE.QUOTED_AMOUNT;
  }

  if (
    containsAny(t, [
      "approuve",
      "vote",
      "adopte",
      "budget"
    ])
  ) {
    return AMOUNT_ROLE.APPROVED_AMOUNT;
  }

  if (
    detectAnnexContext(t)
  ) {
    return AMOUNT_ROLE.ANNEX_AMOUNT;
  }

  if (
    detectReferenceContext(t)
  ) {
    return AMOUNT_ROLE.REFERENCE_AMOUNT;
  }

  return AMOUNT_ROLE.UNKNOWN;
}


/* ============================================================
 * 8. SCORE SEMANTIQUE
 * ============================================================
 */

function calculateSemanticScore({
  kind,
  role,
  target,
  confidence,
  context,
  isPrimary,
  explicit
}) {
  let score = 30;

  /*
   * Confiance extraction / compréhension
   */
  const confidenceValue =
    clamp(confidence);

  score +=
    confidenceValue * 0.25;

  /*
   * Information explicitement identifiée
   */
  if (explicit) {
    score += 10;
  }

  /*
   * Élément déjà considéré comme principal
   * par une couche amont.
   *
   * Important :
   * ce n'est qu'un signal.
   * Ce moteur garde le droit de le déclasser.
   */
  if (isPrimary) {
    score += 15;
  }

  /*
   * Actions destinées à l'utilisateur.
   */
  if (
    kind === INFORMATION_KIND.ACTION
  ) {
    if (
      target === TARGET.USER
    ) {
      score += 20;
    }

    if (
      target === TARGET.THIRD_PARTY
    ) {
      score -= 35;
    }

    if (
      role === ACTION_ROLE.REQUIRED
    ) {
      score += 15;
    }

    if (
      role === ACTION_ROLE.OPTIONAL
    ) {
      score -= 5;
    }

    if (
      role === ACTION_ROLE.INFORMATIONAL
    ) {
      score -= 15;
    }
  }

  /*
   * Dates.
   */
  if (
    kind === INFORMATION_KIND.DATE
  ) {
    if (
      role === DATE_ROLE.DEADLINE ||
      role === DATE_ROLE.MEETING_DATE ||
      role === DATE_ROLE.PAYMENT_DUE
    ) {
      score += 20;
    }

    if (
      role === DATE_ROLE.ISSUE_DATE
    ) {
      score -= 5;
    }

    if (
      role === DATE_ROLE.LEGAL_REFERENCE_DATE ||
      role === DATE_ROLE.HISTORICAL_DATE ||
      role === DATE_ROLE.ANNEX_DATE
    ) {
      score -= 30;
    }
  }

  /*
   * Montants.
   */
  if (
    kind === INFORMATION_KIND.AMOUNT
  ) {
    if (
      role === AMOUNT_ROLE.AMOUNT_DUE ||
      role === AMOUNT_ROLE.REFUND_AMOUNT
    ) {
      score += 25;
    }

    if (
      role === AMOUNT_ROLE.REFERENCE_AMOUNT ||
      role === AMOUNT_ROLE.ANNEX_AMOUNT
    ) {
      score -= 25;
    }
  }

  /*
   * Bruit documentaire.
   */
  if (
    detectReferenceContext(context)
  ) {
    score -= 20;
  }

  if (
    detectAnnexContext(context)
  ) {
    score -= 15;
  }

  return clamp(
    Math.round(score)
  );
}


/* ============================================================
 * 9. NIVEAU DE PERTINENCE
 * ============================================================
 */

function scoreToRelevance(score) {
  if (score >= 85) {
    return RELEVANCE.CRITICAL;
  }

  if (score >= 70) {
    return RELEVANCE.HIGH;
  }

  if (score >= 50) {
    return RELEVANCE.MEDIUM;
  }

  if (score >= 30) {
    return RELEVANCE.LOW;
  }

  return RELEVANCE.NOISE;
}


/* ============================================================
 * 10. NORMALISATION DATE
 * ============================================================
 */

function analyzeDate(item = {}) {
  const role =
    item.role &&
    item.role !== "unknown"
      ? item.role
      : inferDateRole(item);

  const context =
    [
      item.label,
      item.meaning,
      item.context,
      item.text,
      item.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const score =
    calculateSemanticScore({
      kind:
        INFORMATION_KIND.DATE,

      role,

      target:
        TARGET.GENERAL,

      confidence:
        item.confidence,

      context,

      isPrimary:
        Boolean(item.isPrimary),

      explicit:
        Boolean(
          item.date ||
          item.value
        )
    });

  return {
    ...item,

    kind:
      INFORMATION_KIND.DATE,

    role,

    semanticScore:
      score,

    relevance:
      scoreToRelevance(score),

    contextFlags: {
      deadline:
        detectDeadlineContext(
          context
        ),

      event:
        detectEventContext(
          context
        ),

      reference:
        detectReferenceContext(
          context
        ),

      annex:
        detectAnnexContext(
          context
        )
    }
  };
}


/* ============================================================
 * 11. NORMALISATION MONTANT
 * ============================================================
 */

function analyzeAmount(item = {}) {
  const role =
    item.role &&
    item.role !== "unknown"
      ? item.role
      : inferAmountRole(item);

  const context =
    [
      item.label,
      item.meaning,
      item.context,
      item.text,
      item.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const score =
    calculateSemanticScore({
      kind:
        INFORMATION_KIND.AMOUNT,

      role,

      target:
        TARGET.GENERAL,

      confidence:
        item.confidence,

      context,

      isPrimary:
        Boolean(item.isPrimary),

      explicit:
        item.amount !== undefined ||
        item.value !== undefined
    });

  return {
    ...item,

    kind:
      INFORMATION_KIND.AMOUNT,

    role,

    semanticScore:
      score,

    relevance:
      scoreToRelevance(score),

    contextFlags: {
      payment:
        detectPaymentContext(
          context
        ),

      reference:
        detectReferenceContext(
          context
        ),

      annex:
        detectAnnexContext(
          context
        )
    }
  };
}


/* ============================================================
 * 12. NORMALISATION ACTION
 * ============================================================
 */

function analyzeAction(item = {}) {
  const text =
    cleanText(
      item.text ||
      item.action ||
      item.label ||
      item.description
    );

  const context =
    [
      text,
      item.context,
      item.meaning,
      item.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const target =
    item.target ||
    inferActionTarget(
      context
    );

  const role =
    item.role &&
    item.role !== "unknown"
      ? item.role
      : inferActionRole(
          context
        );

  const score =
    calculateSemanticScore({
      kind:
        INFORMATION_KIND.ACTION,

      role,

      target,

      confidence:
        item.confidence,

      context,

      isPrimary:
        Boolean(item.isPrimary),

      explicit:
        Boolean(text)
    });

  return {
    ...item,

    text,

    kind:
      INFORMATION_KIND.ACTION,

    target,

    role,

    semanticScore:
      score,

    relevance:
      scoreToRelevance(score),

    contextFlags: {
      deadline:
        detectDeadlineContext(
          context
        ),

      reference:
        detectReferenceContext(
          context
        ),

      annex:
        detectAnnexContext(
          context
        )
    }
  };
}


/* ============================================================
 * 13. FAITS GENERIQUES
 * ============================================================
 */

function analyzeFact(item = {}) {
  const context =
    [
      item.text,
      item.label,
      item.value,
      item.meaning,
      item.context,
      item.sourceText
    ]
      .filter(Boolean)
      .join(" ");

  const score =
    calculateSemanticScore({
      kind:
        item.kind ||
        INFORMATION_KIND.FACT,

      role:
        item.role ||
        "unknown",

      target:
        item.target ||
        TARGET.GENERAL,

      confidence:
        item.confidence,

      context,

      isPrimary:
        Boolean(item.isPrimary),

      explicit:
        Boolean(context)
    });

  return {
    ...item,

    kind:
      item.kind ||
      INFORMATION_KIND.FACT,

    semanticScore:
      score,

    relevance:
      scoreToRelevance(score),

    contextFlags: {
      reference:
        detectReferenceContext(
          context
        ),

      annex:
        detectAnnexContext(
          context
        )
    }
  };
}


/* ============================================================
 * 14. DEDUPLICATION SEMANTIQUE SIMPLE
 * ============================================================
 */

function semanticKey(item) {
  const value =
    item.date ||
    item.amount ||
    item.value ||
    item.text ||
    item.label ||
    "";

  return [
    item.kind || "",
    item.role || "",
    normalizeText(value)
  ].join("|");
}


function deduplicate(items) {
  return uniqueBy(
    items,
    semanticKey
  );
}


/* ============================================================
 * 15. CLASSEMENT
 * ============================================================
 */

function sortBySemanticImportance(items) {
  return [...items].sort(
    (a, b) =>
      Number(
        b.semanticScore || 0
      ) -
      Number(
        a.semanticScore || 0
      )
  );
}


/* ============================================================
 * 16. SEPARATION IMPORTANT / SECONDAIRE / BRUIT
 * ============================================================
 */

function partition(items) {
  const important = [];
  const secondary = [];
  const ignored = [];

  for (const item of items) {
    const score =
      Number(
        item.semanticScore || 0
      );

    if (score >= 70) {
      important.push(item);
      continue;
    }

    if (score >= 45) {
      secondary.push(item);
      continue;
    }

    ignored.push(item);
  }

  return {
    important:
      sortBySemanticImportance(
        important
      ),

    secondary:
      sortBySemanticImportance(
        secondary
      ),

    ignored:
      sortBySemanticImportance(
        ignored
      )
  };
}


/* ============================================================
 * 17. EXTRACTION FLEXIBLE DES SOURCES
 * ============================================================
 */

function collectDates(input) {
  const result = [];

  result.push(
    ...asArray(
      input?.dates
    )
  );

  if (
    input?.mainDate
  ) {
    result.push({
      ...input.mainDate,
      isPrimary: true
    });
  }

  result.push(
    ...asArray(
      input?.decision?.dates
    )
  );

  result.push(
    ...asArray(
      input?.facts
    ).filter(
      (fact) =>
        fact?.kind === "date" ||
        fact?.type === "date"
    )
  );

  return result;
}


function collectAmounts(input) {
  const result = [];

  result.push(
    ...asArray(
      input?.amounts
    )
  );

  if (
    input?.mainAmount
  ) {
    result.push({
      ...input.mainAmount,
      isPrimary: true
    });
  }

  result.push(
    ...asArray(
      input?.decision?.amounts
    )
  );

  result.push(
    ...asArray(
      input?.facts
    ).filter(
      (fact) =>
        fact?.kind === "amount" ||
        fact?.type === "amount"
    )
  );

  return result;
}


function collectActions(input) {
  const result = [];

  result.push(
    ...asArray(
      input?.actions
    )
  );

  result.push(
    ...asArray(
      input?.decision?.actions
    )
  );

  result.push(
    ...asArray(
      input?.brainFusion?.actions
    )
  );

  return result;
}


/* ============================================================
 * 18. DETERMINATION DES ELEMENTS PRINCIPAUX
 * ============================================================
 */

function firstRelevant(
  items,
  minimumScore = 70
) {
  return (
    sortBySemanticImportance(
      items
    ).find(
      (item) =>
        Number(
          item.semanticScore || 0
        ) >= minimumScore
    ) ||
    null
  );
}


function selectPrimaryDate(dates) {
  /*
   * Priorité aux rôles ayant une conséquence
   * immédiate pour l'utilisateur.
   *
   * Mais le score reste déterminant.
   */

  const rolePriority = [
    DATE_ROLE.DEADLINE,
    DATE_ROLE.MEETING_DATE,
    DATE_ROLE.PAYMENT_DUE,
    DATE_ROLE.EVENT_DATE,
    DATE_ROLE.END_DATE,
    DATE_ROLE.START_DATE,
    DATE_ROLE.ISSUE_DATE
  ];

  for (
    const role
    of rolePriority
  ) {
    const candidates =
      dates.filter(
        (item) =>
          item.role === role &&
          item.semanticScore >= 65
      );

    if (
      candidates.length
    ) {
      return (
        sortBySemanticImportance(
          candidates
        )[0]
      );
    }
  }

  return firstRelevant(
    dates
  );
}


function selectPrimaryAmount(
  amounts
) {
  const rolePriority = [
    AMOUNT_ROLE.AMOUNT_DUE,
    AMOUNT_ROLE.REFUND_AMOUNT,
    AMOUNT_ROLE.MONTHLY_AMOUNT,
    AMOUNT_ROLE.INSTALLMENT_AMOUNT,
    AMOUNT_ROLE.TOTAL_AMOUNT,
    AMOUNT_ROLE.APPROVED_AMOUNT
  ];

  for (
    const role
    of rolePriority
  ) {
    const candidates =
      amounts.filter(
        (item) =>
          item.role === role &&
          item.semanticScore >= 65
      );

    if (
      candidates.length
    ) {
      return (
        sortBySemanticImportance(
          candidates
        )[0]
      );
    }
  }

  return firstRelevant(
    amounts
  );
}


/* ============================================================
 * 19. ACTIONS REELLEMENT UTILES
 * ============================================================
 */

function selectUserActions(actions) {
  return sortBySemanticImportance(
    actions.filter(
      (action) => {
        /*
         * Une action attribuée explicitement
         * à un tiers ne devient jamais une
         * action utilisateur.
         */
        if (
          action.target ===
          TARGET.THIRD_PARTY
        ) {
          return false;
        }

        /*
         * On demande un niveau de confiance
         * sémantique suffisant.
         */
        if (
          action.semanticScore < 65
        ) {
          return false;
        }

        /*
         * Une information purement procédurale
         * ou informative n'est pas nécessairement
         * quelque chose "à faire".
         */
        if (
          action.role ===
          ACTION_ROLE.INFORMATIONAL
        ) {
          return false;
        }

        return true;
      }
    )
  );
}


/* ============================================================
 * 20. CONSTRUCTION DU PROFIL SEMANTIQUE
 * ============================================================
 */

export function buildSemanticRelevanceProfile(
  input = {}
) {
  /*
   * --------------------------------------------------------
   * DATES
   * --------------------------------------------------------
   */

  const analyzedDates =
    deduplicate(
      collectDates(input)
        .map(analyzeDate)
    );


  /*
   * --------------------------------------------------------
   * MONTANTS
   * --------------------------------------------------------
   */

  const analyzedAmounts =
    deduplicate(
      collectAmounts(input)
        .map(analyzeAmount)
    );


  /*
   * --------------------------------------------------------
   * ACTIONS
   * --------------------------------------------------------
   */

  const analyzedActions =
    deduplicate(
      collectActions(input)
        .map(analyzeAction)
    );


  /*
   * --------------------------------------------------------
   * AUTRES FAITS
   * --------------------------------------------------------
   */

  const analyzedFacts =
    deduplicate(
      asArray(
        input?.facts
      )
        .filter(
          (fact) =>
            fact?.kind !== "date" &&
            fact?.type !== "date" &&
            fact?.kind !== "amount" &&
            fact?.type !== "amount"
        )
        .map(
          analyzeFact
        )
    );


  /*
   * --------------------------------------------------------
   * PARTITIONS
   * --------------------------------------------------------
   */

  const datePartition =
    partition(
      analyzedDates
    );

  const amountPartition =
    partition(
      analyzedAmounts
    );

  const actionPartition =
    partition(
      analyzedActions
    );

  const factPartition =
    partition(
      analyzedFacts
    );


  /*
   * --------------------------------------------------------
   * PRINCIPAUX ELEMENTS
   * --------------------------------------------------------
   */

  const primaryDate =
    selectPrimaryDate(
      analyzedDates
    );

  const primaryAmount =
    selectPrimaryAmount(
      analyzedAmounts
    );

  const userActions =
    selectUserActions(
      analyzedActions
    );


  /*
   * --------------------------------------------------------
   * RESULTAT
   * --------------------------------------------------------
   */

  return {
    version:
      "semantic-relevance-v1",

    documentContext: {
      documentType:
        input?.documentType ||
        input?.consensus?.documentType ||
        null,

      family:
        input?.family ||
        input?.consensus?.family ||
        null,

      intent:
        input?.brainIntent ||
        input?.intent ||
        null,

      situation:
        input?.brainSituation ||
        input?.situation ||
        null
    },

    primary: {
      date:
        primaryDate,

      amount:
        primaryAmount,

      actions:
        userActions
    },

    dates: {
      all:
        sortBySemanticImportance(
          analyzedDates
        ),

      important:
        datePartition.important,

      secondary:
        datePartition.secondary,

      ignored:
        datePartition.ignored
    },

    amounts: {
      all:
        sortBySemanticImportance(
          analyzedAmounts
        ),

      important:
        amountPartition.important,

      secondary:
        amountPartition.secondary,

      ignored:
        amountPartition.ignored
    },

    actions: {
      all:
        sortBySemanticImportance(
          analyzedActions
        ),

      user:
        userActions,

      important:
        actionPartition.important,

      secondary:
        actionPartition.secondary,

      ignored:
        actionPartition.ignored
    },

    facts: {
      important:
        factPartition.important,

      secondary:
        factPartition.secondary,

      ignored:
        factPartition.ignored
    }
  };
}


/* ============================================================
 * 21. HELPER DEBUG
 * ============================================================
 */

export function debugSemanticRelevance(
  profile
) {
  if (!profile) {
    return;
  }

  console.log(
    "[DIDOU SEMANTIC RELEVANCE]",
    {
      primary:
        profile.primary,

      importantDates:
        profile.dates?.important,

      ignoredDates:
        profile.dates?.ignored,

      importantAmounts:
        profile.amounts?.important,

      ignoredAmounts:
        profile.amounts?.ignored,

      userActions:
        profile.actions?.user,

      ignoredActions:
        profile.actions?.ignored
    }
  );
}


/* ============================================================
 * 22. EXPORT DEFAULT
 * ============================================================
 */

export default {
  buildSemanticRelevanceProfile,
  debugSemanticRelevance
};
