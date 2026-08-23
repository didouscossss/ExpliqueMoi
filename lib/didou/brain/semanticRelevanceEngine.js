/**
 * ============================================================
 * DIDOU — SEMANTIC RELEVANCE ENGINE V2
 * ============================================================
 *
 * OBJECTIF
 * -------
 *
 * Comprendre quelles informations d'un document sont réellement
 * importantes pour son destinataire.
 *
 * Ce moteur ne cherche PAS simplement :
 *
 * - une date
 * - un montant
 * - une phrase avec "doit"
 * - une phrase avec "vous"
 *
 * Il cherche à comprendre le ROLE de chaque information
 * dans le document.
 *
 * Une information peut être :
 *
 * - centrale
 * - importante
 * - secondaire
 * - conditionnelle
 * - historique
 * - juridique
 * - illustrative
 * - liée à un tiers
 * - purement documentaire
 *
 * ============================================================
 *
 * PRINCIPES V2
 *
 * 1. Aucune donnée personnelle codée en dur.
 * 2. Aucun type de document traité par une règle spéciale.
 * 3. Aucun montant ou date privilégié par sa valeur.
 * 4. Raisonnement par contexte.
 * 5. Raisonnement par rôle.
 * 6. Raisonnement par destinataire.
 * 7. Raisonnement par conséquence.
 * 8. Raisonnement par centralité documentaire.
 * 9. Gestion de l'incertitude.
 * 10. Conservation de la provenance.
 *
 * ============================================================
 */


/* ============================================================
 * 1. NIVEAUX DE PERTINENCE
 * ============================================================
 */

export const RELEVANCE = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NOISE: "noise"
});


/* ============================================================
 * 2. TYPES D'INFORMATION
 * ============================================================
 */

export const INFORMATION_KIND = Object.freeze({
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
  CONDITION: "condition",
  CONSEQUENCE: "consequence",
  PROCEDURE: "procedure",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 3. ROLES POSSIBLES D'UNE DATE
 * ============================================================
 */

export const DATE_ROLE = Object.freeze({
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


/* ============================================================
 * 4. ROLES POSSIBLES D'UN MONTANT
 * ============================================================
 */

export const AMOUNT_ROLE = Object.freeze({
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
  INFORMATIONAL_AMOUNT: "informationalAmount",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 5. ROLES POSSIBLES D'UNE ACTION
 * ============================================================
 */

export const ACTION_ROLE = Object.freeze({
  REQUIRED: "required",
  RECOMMENDED: "recommended",
  OPTIONAL: "optional",
  CONDITIONAL: "conditional",
  INFORMATIONAL: "informational",
  THIRD_PARTY: "thirdParty",
  PROCEDURAL: "procedural",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 6. CIBLE D'UNE INFORMATION
 * ============================================================
 */

export const TARGET = Object.freeze({
  USER: "user",
  THIRD_PARTY: "thirdParty",
  ORGANIZATION: "organization",
  MULTIPLE: "multiple",
  GENERAL: "general",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 7. CENTRALITE DOCUMENTAIRE
 * ============================================================
 *
 * La centralité répond à :
 *
 * "Cette information fait-elle partie de la raison principale
 * pour laquelle ce document existe ?"
 *
 * Exemple abstrait :
 *
 * document principal
 *      |
 *      +--- objet central
 *      |
 *      +--- informations nécessaires
 *      |
 *      +--- références historiques
 *      |
 *      +--- annexes
 *
 * Une information peut donc être parfaitement vraie,
 * mais peu centrale.
 * ============================================================
 */

export const CENTRALITY = Object.freeze({
  CORE: "core",
  STRONG: "strong",
  SUPPORTING: "supporting",
  PERIPHERAL: "peripheral",
  REFERENCE: "reference",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 8. APPLICABILITE
 * ============================================================
 *
 * Répond à :
 *
 * "Cette information concerne-t-elle réellement
 * le destinataire du document ?"
 *
 * C'est volontairement différent de TARGET.
 *
 * TARGET :
 *   qui réalise l'action ?
 *
 * APPLICABILITY :
 *   à qui cette information produit-elle un effet ?
 * ============================================================
 */

export const APPLICABILITY = Object.freeze({
  DIRECT: "direct",
  LIKELY: "likely",
  CONDITIONAL: "conditional",
  INDIRECT: "indirect",
  THIRD_PARTY: "thirdParty",
  GENERAL: "general",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 9. CONDITIONNALITE
 * ============================================================
 *
 * Une phrase peut décrire :
 *
 * - quelque chose de certain
 * - une possibilité
 * - quelque chose qui dépend d'une condition
 * - une hypothèse
 *
 * Didou ne doit pas transformer une possibilité en obligation.
 * ============================================================
 */

export const CONDITIONALITY = Object.freeze({
  UNCONDITIONAL: "unconditional",
  CONDITIONAL: "conditional",
  OPTIONAL: "optional",
  HYPOTHETICAL: "hypothetical",
  EXCEPTION: "exception",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 10. TYPE DE CONSEQUENCE
 * ============================================================
 *
 * Une information devient souvent importante parce qu'elle
 * entraîne une conséquence.
 * ============================================================
 */

export const CONSEQUENCE_TYPE = Object.freeze({
  PAYMENT: "payment",
  DEADLINE: "deadline",
  ATTENDANCE: "attendance",
  RESPONSE: "response",
  SIGNATURE: "signature",
  DOCUMENT_TO_SEND: "documentToSend",
  DOCUMENT_TO_KEEP: "documentToKeep",
  DECISION: "decision",
  RIGHT: "right",
  LOSS_OF_RIGHT: "lossOfRight",
  PENALTY: "penalty",
  INTERRUPTION: "interruption",
  TERMINATION: "termination",
  RENEWAL: "renewal",
  INFORMATION_ONLY: "informationOnly",
  NONE: "none",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 11. FORCE D'UNE CONSEQUENCE
 * ============================================================
 */

export const CONSEQUENCE_STRENGTH = Object.freeze({
  CRITICAL: "critical",
  STRONG: "strong",
  MODERATE: "moderate",
  WEAK: "weak",
  NONE: "none",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 12. TYPE DE CONTEXTE DOCUMENTAIRE
 * ============================================================
 */

export const CONTEXT_TYPE = Object.freeze({
  MAIN_CONTENT: "mainContent",
  HEADER: "header",
  FOOTER: "footer",
  TABLE: "table",
  ANNEX: "annex",
  LEGAL_REFERENCE: "legalReference",
  HISTORICAL: "historical",
  EXAMPLE: "example",
  INSTRUCTION: "instruction",
  SIGNATURE: "signature",
  UNKNOWN: "unknown"
});


/* ============================================================
 * 13. OUTILS GENERIQUES
 * ============================================================
 */

function clamp(value, min = 0, max = 100) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, number)
  );
}


function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
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


function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function containsAny(text, patterns = []) {
  const normalized =
    normalizeText(text);

  return patterns.some((pattern) =>
    normalized.includes(
      normalizeText(pattern)
    )
  );
}


function matchesAny(text, patterns = []) {
  const normalized =
    normalizeText(text);

  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(normalized);
    }

    return normalized.includes(
      normalizeText(pattern)
    );
  });
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
 * 14. CREATION D'UN CONTEXTE GLOBAL
 * ============================================================
 *
 * Le moteur V1 étudiait surtout le contexte immédiat
 * de chaque information.
 *
 * V2 ajoute le contexte du DOCUMENT ENTIER.
 *
 * Cela permet de comparer une information :
 *
 * - au titre
 * - à l'objet
 * - au résumé
 * - à l'intention détectée
 * - à la situation détectée
 *
 * ============================================================
 */

function buildDocumentContext(input = {}) {
  const pieces = [
    input.documentType,
    input.family,

    input.title,
    input.subject,
    input.object,

    input.summary,
    input.shortSummary,

    input.intent,
    input.brainIntent,

    input.situation,
    input.brainSituation,

    input.consensus?.documentType,
    input.consensus?.family,
    input.consensus?.intent,
    input.consensus?.situation,

    input.decision?.documentType,
    input.decision?.intent,
    input.decision?.situation
  ]
    .filter(Boolean)
    .map(cleanText);

  return {
    documentType:
      input.documentType ||
      input.consensus?.documentType ||
      input.decision?.documentType ||
      null,

    family:
      input.family ||
      input.consensus?.family ||
      null,

    title:
      cleanText(
        input.title ||
        input.subject ||
        input.object ||
        ""
      ),

    intent:
      cleanText(
        input.brainIntent ||
        input.intent ||
        input.consensus?.intent ||
        input.decision?.intent ||
        ""
      ),

    situation:
      cleanText(
        input.brainSituation ||
        input.situation ||
        input.consensus?.situation ||
        input.decision?.situation ||
        ""
      ),

    summary:
      cleanText(
        input.summary ||
        input.shortSummary ||
        input.decision?.summary ||
        ""
      ),

    combinedText:
      cleanText(
        pieces.join(" ")
      )
  };
}


/* ============================================================
 * 15. EXTRACTION DU CONTEXTE D'UN ELEMENT
 * ============================================================
 */

function buildItemContext(item = {}) {
  return cleanText(
    [
      item.label,
      item.title,
      item.text,
      item.action,
      item.description,
      item.value,
      item.meaning,
      item.context,
      item.sourceText,
      item.before,
      item.after,
      item.sectionTitle,
      item.section
    ]
      .filter(Boolean)
      .join(" ")
  );
}


/* ============================================================
 * 16. MOTS SIGNIFICATIFS
 * ============================================================
 *
 * On ne cherche pas une égalité exacte entre deux phrases.
 *
 * On cherche leurs concepts communs.
 * ============================================================
 */

const GENERIC_STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "a",
  "au",
  "aux",
  "et",
  "ou",
  "en",
  "dans",
  "sur",
  "pour",
  "par",
  "avec",
  "sans",
  "ce",
  "cet",
  "cette",
  "ces",
  "est",
  "sont",
  "etre",
  "sera",
  "seront",
  "il",
  "elle",
  "ils",
  "elles",
  "vous",
  "nous",
  "votre",
  "vos",
  "notre",
  "nos",
  "qui",
  "que",
  "quoi",
  "dont",
  "se",
  "sa",
  "son",
  "ses"
]);


function extractMeaningfulTokens(text) {
  const normalized =
    normalizeText(text);

  if (!normalized) {
    return [];
  }

  return uniqueBy(
    normalized
      .replace(/[^a-z0-9à-ÿ'-]/gi, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token.length >= 3)
      .filter(
        (token) =>
          !GENERIC_STOP_WORDS.has(token)
      ),
    (token) => token
  );
}


/* ============================================================
 * 17. SIMILARITE CONTEXTUELLE
 * ============================================================
 *
 * ATTENTION :
 *
 * Ce n'est pas un moteur d'embeddings.
 *
 * Il s'agit d'un signal local supplémentaire.
 * La décision finale ne dépendra jamais uniquement
 * de cette fonction.
 * ============================================================
 */

function calculateContextOverlap(
  itemText,
  documentText
) {
  const itemTokens =
    extractMeaningfulTokens(itemText);

  const documentTokens =
    new Set(
      extractMeaningfulTokens(
        documentText
      )
    );

  if (
    !itemTokens.length ||
    !documentTokens.size
  ) {
    return 0;
  }

  let matches = 0;

  for (const token of itemTokens) {
    if (documentTokens.has(token)) {
      matches += 1;
    }
  }

  return clamp(
    Math.round(
      (matches / itemTokens.length) * 100
    )
  );
}


/* ============================================================
 * 18. DETECTION DU BRUIT DOCUMENTAIRE
 * ============================================================
 */

function detectReferenceContext(text) {
  const context = normalizeText(text || "");

  if (!context) {
    return false;
  }

  /*
   * ========================================================
   * REFERENCE JURIDIQUE — V2
   * ========================================================
   *
   * IMPORTANT :
   *
   * La simple présence du mot "article" ne suffit PAS.
   *
   * Exemple à ne PAS considérer comme date juridique :
   *
   *   Article 24
   *   Approbation des comptes de l'exercice
   *   01/01/2025 au 31/12/2025
   *
   * Les dates sont celles de l'exercice comptable,
   * pas celles de l'article.
   */


  /*
   * --------------------------------------------------------
   * 1 — CONTEXTES COMPTABLES / BUDGETAIRES
   * --------------------------------------------------------
   *
   * Ils ont priorité sur un simple "Article 24/25/etc."
   */

  const accountingContext = matchesAny(context, [
    /\bexercice\b/,
    /\bexercice clos\b/,
    /\bcomptes? de l[' ]exercice\b/,
    /\bapprobation des comptes\b/,
    /\bbudget previsionnel\b/,
    /\badoption du budget\b/,
    /\bexamen et adoption du budget\b/,
    /\bperiode du\b/,
    /\bcharges\b/,
    /\breleve de compte\b/,
    /\bappels? de fonds\b/,
    /\bappels? provisionnels\b/,
    /\bcotisation\b/,
    /\bprovision\b/
  ]);

  /*
   * Si on est clairement dans un contexte comptable,
   * "Article 24" ou "Article 25" ne doit pas suffire
   * à transformer la date en legalReferenceDate.
   *
   * ATTENTION :
   * une vraie formulation "loi du JJ/MM/AAAA"
   * reste juridique et sera détectée plus bas.
   */


  /*
   * --------------------------------------------------------
   * 2 — REFERENCES JURIDIQUES FORTES
   * --------------------------------------------------------
   *
   * Ces formulations peuvent réellement porter une date.
   */

  const strongLegalReference = matchesAny(context, [
    /\bconformement a (?:la|l[' ])?\s*(?:loi|decret|arrete|ordonnance|reglement)\b/,
    /\ben application de (?:la|l[' ])?\s*(?:loi|decret|arrete|ordonnance|reglement)\b/,
    /\ben vertu de (?:la|l[' ])?\s*(?:loi|decret|arrete|ordonnance|reglement)\b/,

    /\bloi\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{2,4}\b/,
    /\bdecret\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{2,4}\b/,
    /\barrete\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{2,4}\b/,
    /\bordonnance\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{2,4}\b/,

    /\bloi\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}\s+[a-z]+\s+\d{4}\b/,
    /\bdecret\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}\s+[a-z]+\s+\d{4}\b/,
    /\barrete\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}\s+[a-z]+\s+\d{4}\b/,
    /\bordonnance\s+(?:n[°o]?\s*[\w.-]+\s+)?du\s+\d{1,2}\s+[a-z]+\s+\d{4}\b/,

    /\breference legislative\b/,
    /\breference reglementaire\b/,
    /\bjurisprudence\b/
  ]);

  if (strongLegalReference) {
    return true;
  }


  /*
   * --------------------------------------------------------
   * 3 — PROTECTION DES DATES COMPTABLES
   * --------------------------------------------------------
   */

  if (accountingContext) {
    return false;
  }


  /*
   * --------------------------------------------------------
   * 4 — AUTRES REFERENCES JURIDIQUES
   * --------------------------------------------------------
   *
   * Ici on accepte les formulations juridiques générales,
   * mais PAS le mot "article" tout seul.
   */

  return matchesAny(context, [
    /\bconformement a\b/,
    /\ben application de\b/,
    /\ben vertu de\b/,
    /\barrete du\b/,
    /\bdecret du\b/,
    /\bloi du\b/,
    /\bordonnance du\b/,
    /\breference legislative\b/,
    /\breference reglementaire\b/,
    /\bjurisprudence\b/
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


function detectHistoricalContext(text) {
  return containsAny(text, [
    "precedemment",
    "anciennement",
    "historique",
    "avait ete",
    "a l'epoque",
    "anterieurement",
    "pour memoire"
  ]);
}


function detectExampleContext(text) {
  return containsAny(text, [
    "par exemple",
    "exemple :",
    "a titre d'exemple",
    "illustration",
    "cas fictif",
    "exemple fictif"
  ]);
}


/* ============================================================
 * 19. DETECTION DES CONTEXTES IMPORTANTS
 * ============================================================
 */

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
  const context =
    normalizeText(
      cleanText(text)
    );

  if (!context) {
    return false;
  }

  /*
   * On cherche uniquement des formulations
   * qui décrivent réellement la tenue d'un événement.
   *
   * La simple présence de "assemblée",
   * "réunion" ou "convocation" ne suffit plus.
   */

  return matchesAny(context, [
    /\brendez[- ]vous\b.{0,40}\b(?:le|du|a|à)\b/,
    /\breunion\b.{0,40}\b(?:le|du|a|à)\b/,
    /\bassemblee\b.{0,40}\b(?:le|du|a|à)\b/,
    /\baudience\b.{0,40}\b(?:le|du|a|à)\b/,
    /\bentretien\b.{0,40}\b(?:le|du|a|à)\b/,

    /\bse tiendra\b/,
    /\baura lieu\b/,
    /\best prevu(?:e)?\b/,
    /\best programme(?:e)?\b/,
    /\best fixe(?:e)?\b/,
    /\bconvoque(?:e|s|es)?\b.{0,40}\b(?:le|pour le)\b/
  ]);
}

function detectPaymentContext(text) {
  return containsAny(text, [
    "a payer",
    "montant a payer",
    "regler",
    "paiement",
    "prelevement",
    "solde",
    "reste a payer",
    "total a payer"
  ]);
}


/* ============================================================
 * 20. DETECTION DE CONDITION
 * ============================================================
 */

function inferConditionality(text) {
  const t =
    normalizeText(text);

  if (
    matchesAny(t, [
      /\bsi vous souhaitez\b/,
      /\bsi vous desirez\b/,
      /\bvous pouvez\b/,
      /\bfacultatif\b/,
      /\bau choix\b/
    ])
  ) {
    return CONDITIONALITY.OPTIONAL;
  }

  if (
    matchesAny(t, [
      /\ben cas de\b/,
      /\ba condition que\b/,
      /\bsous reserve de\b/,
      /\bdans l'hypothese ou\b/,
      /\bsi\b/
    ])
  ) {
    return CONDITIONALITY.CONDITIONAL;
  }

  if (
    matchesAny(t, [
      /\bsauf\b/,
      /\ba l'exception de\b/,
      /\bexception\b/
    ])
  ) {
    return CONDITIONALITY.EXCEPTION;
  }

  if (
    matchesAny(t, [
      /\bpourrait\b/,
      /\bserait\b/,
      /\beventuellement\b/,
      /\bhypothese\b/
    ])
  ) {
    return CONDITIONALITY.HYPOTHETICAL;
  }

  if (cleanText(text)) {
    return CONDITIONALITY.UNCONDITIONAL;
  }

  return CONDITIONALITY.UNKNOWN;
}


/* ============================================================
 * 21. CENTRALITE — PREMIER NIVEAU
 * ============================================================
 *
 * Cette fonction ne décide PAS seule de la pertinence.
 *
 * Elle mesure uniquement :
 *
 * "A quel point cet élément semble connecté au sujet
 * principal du document ?"
 *
 * ============================================================
 */

function inferCentrality(
  item,
  documentContext
) {
  const itemContext =
    buildItemContext(item);

  if (!itemContext) {
    return {
      level: CENTRALITY.UNKNOWN,
      score: 0,
      reasons: [
        "missing-item-context"
      ]
    };
  }

  const reasons = [];

  let score = 40;

  /*
   * --------------------------------------------------------
   * SIGNAL 1
   * Information déjà identifiée comme principale
   * par une couche précédente.
   *
   * Ce n'est PAS une vérité absolue.
   * --------------------------------------------------------
   */

  if (item.isPrimary) {
    score += 15;
    reasons.push(
      "upstream-primary-signal"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 2
   * Correspondance avec le contexte global du document.
   * --------------------------------------------------------
   */

  const overlap =
    calculateContextOverlap(
      itemContext,
      documentContext?.combinedText
    );

  if (overlap >= 70) {
    score += 25;
    reasons.push(
      "strong-document-context-overlap"
    );
  } else if (overlap >= 40) {
    score += 15;
    reasons.push(
      "document-context-overlap"
    );
  } else if (overlap >= 20) {
    score += 5;
    reasons.push(
      "weak-document-context-overlap"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 3
   * L'information apparaît dans un contexte qui indique
   * une conséquence concrète.
   * --------------------------------------------------------
   */

  if (
    detectDeadlineContext(itemContext) ||
    detectEventContext(itemContext) ||
    detectPaymentContext(itemContext)
  ) {
    score += 10;
    reasons.push(
      "consequence-bearing-context"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 4
   * Référence juridique.
   *
   * Une référence juridique peut être importante juridiquement,
   * mais n'est pas forcément le sujet principal du document.
   * --------------------------------------------------------
   */

  if (
    detectReferenceContext(itemContext)
  ) {
    score -= 25;
    reasons.push(
      "legal-reference-context"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 5
   * Annexe.
   * --------------------------------------------------------
   */

  if (
    detectAnnexContext(itemContext)
  ) {
    score -= 20;
    reasons.push(
      "annex-context"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 6
   * Historique.
   * --------------------------------------------------------
   */

  if (
    detectHistoricalContext(itemContext)
  ) {
    score -= 25;
    reasons.push(
      "historical-context"
    );
  }


  /*
   * --------------------------------------------------------
   * SIGNAL 7
   * Exemple.
   *
   * Très important :
   * une date ou un montant présent dans un exemple ne doit
   * jamais être présenté comme une obligation réelle
   * simplement parce qu'il a été extrait.
   * --------------------------------------------------------
   */

  if (
    detectExampleContext(itemContext)
  ) {
    score -= 35;
    reasons.push(
      "example-context"
    );
  }


  score =
    clamp(
      Math.round(score)
    );


  let level =
    CENTRALITY.UNKNOWN;

  if (score >= 80) {
    level =
      CENTRALITY.CORE;
  } else if (score >= 65) {
    level =
      CENTRALITY.STRONG;
  } else if (score >= 45) {
    level =
      CENTRALITY.SUPPORTING;
  } else if (score >= 25) {
    level =
      CENTRALITY.PERIPHERAL;
  } else {
    level =
      CENTRALITY.REFERENCE;
  }


  return {
    level,
    score,
    overlap,
    reasons
  };
}


/* ============================================================
 * 22. DEBUG CENTRALITE
 * ============================================================
 */

function debugCentrality(
  item,
  documentContext
) {
  const result =
    inferCentrality(
      item,
      documentContext
    );

  console.log(
    "[DIDOU CENTRALITY]",
    {
      item:
        item?.text ||
        item?.label ||
        item?.value ||
        item?.date ||
        item?.amount,

      centrality:
        result.level,

      score:
        result.score,

      overlap:
        result.overlap,

      reasons:
        result.reasons
    }
  );

  return result;
}


/* ============================================================
 * FIN PARTIE 1
 * ============================================================
 *
 * PARTIE 2 :
 *
 * - applicabilité réelle à l'utilisateur
 * - identification robuste de la cible
 * - obligation / option / recommandation
 * - détection des conséquences
 * - distinction action utilisateur / action d'un tiers
 *
 * ============================================================
 */
/* ============================================================
 * 23. CIBLE D'UNE INFORMATION / ACTION
 * ============================================================
 *
 * On cherche à savoir QUI est concerné directement.
 * ============================================================
 */

function inferTarget(text) {
  const t =
    normalizeText(text);

  if (!t) {
    return TARGET.UNKNOWN;
  }

  /*
   * Destinataire explicite.
   */
  if (
    matchesAny(t, [
      /\bvous devez\b/,
      /\bveuillez\b/,
      /\bmerci de\b/,
      /\bnous vous demandons\b/,
      /\bnous vous invitons\b/,
      /\bvous pouvez\b/,
      /\bvous etes invite\b/,
      /\bvotre\b/
    ])
  ) {
    return TARGET.USER;
  }

  /*
   * Tiers explicite.
   */
  if (
    matchesAny(t, [
      /\ble syndic doit\b/,
      /\bl'entreprise doit\b/,
      /\ble bailleur doit\b/,
      /\ble proprietaire doit\b/,
      /\ble prestataire doit\b/,
      /\bl'assureur doit\b/,
      /\ble locataire doit\b/,
      /\ble vendeur doit\b/,
      /\bl'acheteur doit\b/
    ])
  ) {
    return TARGET.THIRD_PARTY;
  }

  /*
   * Organisation / administration.
   */
  if (
    matchesAny(t, [
      /\bl'administration\b/,
      /\bl'organisme\b/,
      /\bla societe\b/,
      /\bl'employeur\b/,
      /\bla banque\b/
    ])
  ) {
    return TARGET.ORGANIZATION;
  }

  return TARGET.UNKNOWN;
}


/* ============================================================
 * 24. ROLE D'UNE ACTION
 * ============================================================
 */

function inferActionRole(text) {
  const t =
    normalizeText(text);

  if (!t) {
    return ACTION_ROLE.UNKNOWN;
  }

  if (
    matchesAny(t, [
      /\bvous devez\b/,
      /\bveuillez\b/,
      /\bobligatoire\b/,
      /\best tenu de\b/,
      /\bdoit etre\b/,
      /\bdoit transmettre\b/,
      /\bdoit fournir\b/,
      /\bdoit payer\b/,
      /\bdoit regler\b/
    ])
  ) {
    return ACTION_ROLE.REQUIRED;
  }

  if (
    matchesAny(t, [
      /\bil est recommande\b/,
      /\bnous vous conseillons\b/,
      /\bil est conseille\b/
    ])
  ) {
    return ACTION_ROLE.RECOMMENDED;
  }

  if (
    matchesAny(t, [
      /\bsi vous souhaitez\b/,
      /\bsi vous desirez\b/,
      /\bvous pouvez\b/,
      /\bfacultatif\b/,
      /\bau choix\b/
    ])
  ) {
    return ACTION_ROLE.OPTIONAL;
  }

  if (
    matchesAny(t, [
      /\ben cas de\b/,
      /\ba condition que\b/,
      /\bsous reserve de\b/,
      /\bsi\b/
    ])
  ) {
    return ACTION_ROLE.CONDITIONAL;
  }

  return ACTION_ROLE.UNKNOWN;
}


/* ============================================================
 * 25. APPLICABILITE UTILISATEUR
 * ============================================================
 *
 * Répond à :
 *
 * "Même si cette information est vraie,
 * concerne-t-elle réellement l'utilisateur ?"
 * ============================================================
 */

function inferApplicability(
  item,
  documentContext
) {
  const context =
    buildItemContext(item);

  const target =
    item.target ||
    inferTarget(context);

  const conditionality =
    inferConditionality(context);

  let score = 45;

  const reasons = [];

  /*
   * Cible explicite utilisateur.
   */
  if (
    target === TARGET.USER
  ) {
    score += 30;
    reasons.push(
      "explicit-user-target"
    );
  }

  /*
   * Cible tierce.
   */
  if (
    target === TARGET.THIRD_PARTY
  ) {
    score -= 45;
    reasons.push(
      "third-party-target"
    );
  }

  /*
   * Organisation.
   */
  if (
    target === TARGET.ORGANIZATION
  ) {
    score -= 20;
    reasons.push(
      "organization-target"
    );
  }

  /*
   * Contexte global proche.
   */
  const overlap =
    calculateContextOverlap(
      context,
      documentContext?.combinedText
    );

  if (
    overlap >= 60
  ) {
    score += 15;
    reasons.push(
      "strong-document-alignment"
    );
  } else if (
    overlap >= 30
  ) {
    score += 8;
    reasons.push(
      "document-alignment"
    );
  }

  /*
   * Condition.
   */
  if (
    conditionality ===
      CONDITIONALITY.CONDITIONAL ||
    conditionality ===
      CONDITIONALITY.HYPOTHETICAL ||
    conditionality ===
      CONDITIONALITY.EXCEPTION
  ) {
    score -= 15;
    reasons.push(
      "conditional-applicability"
    );
  }

  if (
    conditionality ===
    CONDITIONALITY.OPTIONAL
  ) {
    score -= 10;
    reasons.push(
      "optional-applicability"
    );
  }

  /*
   * Référence juridique.
   */
  if (
    detectReferenceContext(
      context
    )
  ) {
    score -= 15;
    reasons.push(
      "reference-context"
    );
  }

  /*
   * Annexe.
   */
  if (
    detectAnnexContext(
      context
    )
  ) {
    score -= 10;
    reasons.push(
      "annex-context"
    );
  }

  score =
    clamp(
      Math.round(score)
    );

  let level =
    APPLICABILITY.UNKNOWN;

  if (
    score >= 80
  ) {
    level =
      APPLICABILITY.DIRECT;
  } else if (
    score >= 65
  ) {
    level =
      APPLICABILITY.LIKELY;
  } else if (
    score >= 45
  ) {
    level =
      APPLICABILITY.CONDITIONAL;
  } else if (
    score >= 25
  ) {
    level =
      APPLICABILITY.INDIRECT;
  } else {
    level =
      APPLICABILITY.THIRD_PARTY;
  }

  return {
    level,
    score,
    target,
    conditionality,
    reasons
  };
}


/* ============================================================
 * 26. TYPE DE CONSEQUENCE
 * ============================================================
 */

function inferConsequenceType(text) {
  const t =
    normalizeText(text);

  if (!t) {
    return CONSEQUENCE_TYPE.UNKNOWN;
  }

  if (
    matchesAny(t, [
      /\ba payer\b/,
      /\bregler\b/,
      /\bpaiement\b/,
      /\bprelevement\b/,
      /\bsolde\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.PAYMENT;
  }

  if (
    matchesAny(t, [
      /\bdate limite\b/,
      /\bau plus tard\b/,
      /\bavant le\b/,
      /\becheance\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.DEADLINE;
  }

  if (
    matchesAny(t, [
      /\bse presenter\b/,
      /\bparticiper\b/,
      /\bassister\b/,
      /\bconvocation\b/,
      /\breunion\b/,
      /\brendez-vous\b/,
      /\baudience\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.ATTENDANCE;
  }

  if (
    matchesAny(t, [
      /\brepondre\b/,
      /\bconfirmer\b/,
      /\bretourner\b/,
      /\btransmettre\b/,
      /\benvoyer\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.RESPONSE;
  }

  if (
    matchesAny(t, [
      /\bsigner\b/,
      /\bsignature\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.SIGNATURE;
  }

  if (
    matchesAny(t, [
      /\bfournir\b/,
      /\bjoindre\b/,
      /\btransmettre\b/,
      /\benvoyer\b/,
      /\bpiece justificative\b/,
      /\bjustificatif\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.DOCUMENT_TO_SEND;
  }

  if (
    matchesAny(t, [
      /\bconserver\b/,
      /\bgarder\b/,
      /\ba archiver\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.DOCUMENT_TO_KEEP;
  }

  if (
    matchesAny(t, [
      /\bdecision\b/,
      /\badopte\b/,
      /\brejete\b/,
      /\bvote\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.DECISION;
  }

  if (
    matchesAny(t, [
      /\bdroit\b/,
      /\bbeneficie\b/,
      /\bpeut demander\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.RIGHT;
  }

  if (
    matchesAny(t, [
      /\bperdre le benefice\b/,
      /\bdecheance\b/,
      /\bperte de droit\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.LOSS_OF_RIGHT;
  }

  if (
    matchesAny(t, [
      /\bpenalite\b/,
      /\bmajoration\b/,
      /\bindemnite\b/,
      /\bfrais de retard\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.PENALTY;
  }

  if (
    matchesAny(t, [
      /\bsuspendu\b/,
      /\bsuspension\b/,
      /\binterrompu\b/,
      /\binterruption\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.INTERRUPTION;
  }

  if (
    matchesAny(t, [
      /\bresiliation\b/,
      /\bprend fin\b/,
      /\btermine\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.TERMINATION;
  }

  if (
    matchesAny(t, [
      /\brenouvellement\b/,
      /\breconduction\b/
    ])
  ) {
    return CONSEQUENCE_TYPE.RENEWAL;
  }

  return CONSEQUENCE_TYPE.INFORMATION_ONLY;
}


/* ============================================================
 * 27. FORCE DE CONSEQUENCE
 * ============================================================
 */

function inferConsequenceStrength(
  consequenceType,
  role,
  conditionality
) {
  let score = 30;

  if (
    consequenceType ===
      CONSEQUENCE_TYPE.PAYMENT ||
    consequenceType ===
      CONSEQUENCE_TYPE.DEADLINE ||
    consequenceType ===
      CONSEQUENCE_TYPE.LOSS_OF_RIGHT ||
    consequenceType ===
      CONSEQUENCE_TYPE.PENALTY ||
    consequenceType ===
      CONSEQUENCE_TYPE.TERMINATION
  ) {
    score += 35;
  }

  if (
    consequenceType ===
      CONSEQUENCE_TYPE.ATTENDANCE ||
    consequenceType ===
      CONSEQUENCE_TYPE.RESPONSE ||
    consequenceType ===
      CONSEQUENCE_TYPE.SIGNATURE ||
    consequenceType ===
      CONSEQUENCE_TYPE.DOCUMENT_TO_SEND
  ) {
    score += 25;
  }

  if (
    role === ACTION_ROLE.REQUIRED
  ) {
    score += 20;
  }

  if (
    role === ACTION_ROLE.RECOMMENDED
  ) {
    score += 10;
  }

  if (
    role === ACTION_ROLE.OPTIONAL
  ) {
    score -= 15;
  }

  if (
    conditionality ===
      CONDITIONALITY.CONDITIONAL ||
    conditionality ===
      CONDITIONALITY.HYPOTHETICAL
  ) {
    score -= 15;
  }

  score =
    clamp(
      score
    );

  let strength =
    CONSEQUENCE_STRENGTH.UNKNOWN;

  if (
    score >= 80
  ) {
    strength =
      CONSEQUENCE_STRENGTH.CRITICAL;
  } else if (
    score >= 65
  ) {
    strength =
      CONSEQUENCE_STRENGTH.STRONG;
  } else if (
    score >= 45
  ) {
    strength =
      CONSEQUENCE_STRENGTH.MODERATE;
  } else if (
    score >= 20
  ) {
    strength =
      CONSEQUENCE_STRENGTH.WEAK;
  } else {
    strength =
      CONSEQUENCE_STRENGTH.NONE;
  }

  return {
    score,
    strength
  };
}


/* ============================================================
 * 28. ANALYSE D'UNE ACTION
 * ============================================================
 */

function analyzeActionSemantics(
  item,
  documentContext
) {
  const context =
    buildItemContext(item);

  const target =
    item.target ||
    inferTarget(
      context
    );

  const role =
    item.role &&
    item.role !== "unknown"
      ? item.role
      : inferActionRole(
          context
        );

  const conditionality =
    inferConditionality(
      context
    );

  const applicability =
    inferApplicability(
      {
        ...item,
        target
      },
      documentContext
    );

  const consequenceType =
    inferConsequenceType(
      context
    );

  const consequenceStrength =
    inferConsequenceStrength(
      consequenceType,
      role,
      conditionality
    );

  return {
    target,
    role,
    conditionality,
    applicability,
    consequence: {
      type:
        consequenceType,

      strength:
        consequenceStrength.strength,

      score:
        consequenceStrength.score
    }
  };
}


/* ============================================================
 * 29. SCORE ACTION UTILISATEUR
 * ============================================================
 *
 * Ce score sera utilisé plus tard dans le score final.
 * ============================================================
 */

function calculateActionUserImpactScore(
  semantics
) {
  let score = 40;

  const {
    target,
    role,
    conditionality,
    applicability,
    consequence
  } = semantics;

  if (
    target === TARGET.USER
  ) {
    score += 25;
  }

  if (
    target === TARGET.THIRD_PARTY
  ) {
    score -= 50;
  }

  if (
    role === ACTION_ROLE.REQUIRED
  ) {
    score += 20;
  }

  if (
    role === ACTION_ROLE.RECOMMENDED
  ) {
    score += 10;
  }

  if (
    role === ACTION_ROLE.OPTIONAL
  ) {
    score -= 10;
  }

  if (
    role === ACTION_ROLE.INFORMATIONAL
  ) {
    score -= 25;
  }

  if (
    conditionality ===
      CONDITIONALITY.CONDITIONAL ||
    conditionality ===
      CONDITIONALITY.HYPOTHETICAL
  ) {
    score -= 15;
  }

  if (
    applicability?.level ===
    APPLICABILITY.DIRECT
  ) {
    score += 20;
  }

  if (
    applicability?.level ===
    APPLICABILITY.THIRD_PARTY
  ) {
    score -= 35;
  }

  if (
    consequence?.strength ===
    CONSEQUENCE_STRENGTH.CRITICAL
  ) {
    score += 20;
  } else if (
    consequence?.strength ===
    CONSEQUENCE_STRENGTH.STRONG
  ) {
    score += 12;
  }

  return clamp(
    Math.round(score)
  );
}


/* ============================================================
 * 30. ACTION REELLEMENT DESTINEE A L'UTILISATEUR
 * ============================================================
 */

function isRealUserAction(
  semantics,
  centrality = null
) {
  if (!semantics) {
    return false;
  }

  /*
   * Tiers explicite => non
   */
  if (
    semantics.target ===
    TARGET.THIRD_PARTY
  ) {
    return false;
  }

  /*
   * Applicabilité trop faible => non
   */
  if (
    semantics.applicability?.level ===
      APPLICABILITY.THIRD_PARTY ||
    semantics.applicability?.score < 45
  ) {
    return false;
  }

  /*
   * Information pure => non
   */
  if (
    semantics.role ===
    ACTION_ROLE.INFORMATIONAL
  ) {
    return false;
  }

  /*
   * Action inconnue + peu centrale => non
   */
 if (
  semantics.role ===
  ACTION_ROLE.UNKNOWN
) {
  return (
    semantics.target === TARGET.USER &&
    semantics.applicability?.score >= 45 &&
    (
      centrality?.score >= 50 ||
      semantics.score >= 55
    )
  );
}

  /*
   * Action obligatoire :
   * elle doit être suffisamment centrale
   */
  if (
    semantics.role ===
    ACTION_ROLE.REQUIRED
  ) {
    return (
      centrality?.score >= 55 &&
      semantics.applicability?.score >= 55
    );
  }

  /*
   * Recommandée :
   * on demande encore plus de centralité
   */
  if (
    semantics.role ===
    ACTION_ROLE.RECOMMENDED
  ) {
    return (
      centrality?.score >= 60 &&
      semantics.applicability?.score >= 55
    );
  }

  /*
   * Optionnelle :
   * on la garde seulement si elle est
   * clairement liée au document principal.
   */
  if (
    semantics.role ===
    ACTION_ROLE.OPTIONAL
  ) {
    return (
      centrality?.score >= 65 &&
      semantics.applicability?.score >= 55
    );
  }

  /*
   * Conditionnelle :
   * elle doit être vraiment pertinente.
   */
  if (
    semantics.role ===
    ACTION_ROLE.CONDITIONAL
  ) {
    return (
      centrality?.score >= 65 &&
      semantics.applicability?.score >= 60
    );
  }

  return (
    centrality?.score >= 60 &&
    semantics.applicability?.score >= 55
  );
}
function inferDateRole(item = {}) {
  /*
   * --------------------------------------------------------
   * PROTECTION DES ROLES AMONT FIABLES
   * --------------------------------------------------------
   *
   * Si une couche précédente a déjà identifié un rôle
   * précis, on évite de le réinterpréter avec une règle
   * plus générique.
   */

  const upstreamRole =
    cleanText(
      item?.role ||
      ""
    );
const protectedUpstreamRoles =
  new Set([
    "deadline",
    "paymentDue",
    "paymentDate",
    "dueDate",
    "issueDate",
    "signatureDate",
    "effectiveDate",
    "legalReferenceDate",
    "coverageStart",
    "coverageEnd",
    "startDate",
    "endDate"
  ]);


  if (
    upstreamRole &&
    upstreamRole !== DATE_ROLE.UNKNOWN &&
    protectedUpstreamRoles.has(
      upstreamRole
    )
  ) {
    return upstreamRole;
  }

  const context =
    normalizeText(
      buildItemContext(item)
    );

  if (!context) {
    return DATE_ROLE.UNKNOWN;
  }


  /*
   * --------------------------------------------------------
   * DEADLINE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bdate limite\b/,
      /\bau plus tard\b/,
      /\bavant le\b/,
      /\bdernier delai\b/,
      /\bdoit parvenir\b/,
      /\bdoit etre recu\b/,
      /\bdoit etre retourne\b/,
      /\bdoit etre transmis\b/,
      /\becheance\b/
    ])
  ) {
    return DATE_ROLE.DEADLINE;
  }


/*
 * --------------------------------------------------------
 * PAIEMENT / EXIGIBILITE — V2.6
 * --------------------------------------------------------
 *
 * On relie la notion d'exigibilité à LA date analysée.
 */

const paymentDateValue =
  cleanText(
    item?.date ||
    item?.value ||
    ""
  );

const escapedPaymentDate =
  paymentDateValue
    ? paymentDateValue.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    : "";

if (escapedPaymentDate) {
  const paymentDatePatterns = [
    new RegExp(
      `\\bdate de paiement\\s*:?\\s*${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bdate d'echeance\\s*:?\\s*${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bpaiement avant\\s+(?:le\\s+)?${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\ba regler avant\\s+(?:le\\s+)?${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bprelevement\\s+(?:prevu\\s+)?le\\s+${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bsera preleve\\s+(?:le\\s+)?${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bexigible\\s+(?:le\\s+)?${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bexigibilite\\b.{0,60}\\b${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `\\bappels? de fonds\\b.{0,100}\\b${escapedPaymentDate}`,
      "i"
    ),

    new RegExp(
      `${escapedPaymentDate}.{0,60}\\b(?:exigible|exigibilite|appel de fonds|appels de fonds)\\b`,
      "i"
    )
  ];

  if (
    matchesAny(
      context,
      paymentDatePatterns
    )
  ) {
    return DATE_ROLE.PAYMENT_DUE;
  }
}

  /*
   * --------------------------------------------------------
   * DATE D'EMISSION
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bdate d'emission\b/,
      /\bemis le\b/,
      /\bedite le\b/,
      /\betabli le\b/,
      /\bdate du courrier\b/,
      /\bdate de la lettre\b/
    ])
  ) {
    return DATE_ROLE.ISSUE_DATE;
  }

/*
 * --------------------------------------------------------
 * DEBUT / FIN — V2.5
 * --------------------------------------------------------
 *
 * On vérifie que l'expression "commence le", "se termine le",
 * etc. est réellement reliée à LA date analysée.
 */

const analyzedDate =
  cleanText(
    item?.date ||
    item?.value ||
    ""
  );

const escapedAnalyzedDate =
  analyzedDate
    ? analyzedDate.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    : "";


/*
 * --------------------------------------------------------
 * DEBUT
 * --------------------------------------------------------
 */

if (escapedAnalyzedDate) {
  const startDatePatterns = [
    new RegExp(
      `\\ba compter du\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bprend effet le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bdebut(?:e)? le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bcommence le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bdate de debut\\s*:?\\s*${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bentre en vigueur le\\s+${escapedAnalyzedDate}`,
      "i"
    )
  ];

  if (
    matchesAny(
      context,
      startDatePatterns
    )
  ) {
    return DATE_ROLE.START_DATE;
  }
}


/*
 * --------------------------------------------------------
 * FIN
 * --------------------------------------------------------
 */

if (escapedAnalyzedDate) {
  const endDatePatterns = [
    new RegExp(
      `\\bprend fin le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bexpire le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bdate de fin\\s*:?\\s*${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bjusqu[' ]?au\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bse termine le\\s+${escapedAnalyzedDate}`,
      "i"
    ),

    new RegExp(
      `\\bexpiration\\s*:?\\s*${escapedAnalyzedDate}`,
      "i"
    )
  ];

  if (
    matchesAny(
      context,
      endDatePatterns
    )
  ) {
    return DATE_ROLE.END_DATE;
  }
}


  /*
   * --------------------------------------------------------
   * COUVERTURE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bdebut de garantie\b/,
      /\bdebut de couverture\b/,
      /\bprise d'effet de la garantie\b/
    ])
  ) {
    return DATE_ROLE.COVERAGE_START;
  }

  if (
    matchesAny(context, [
      /\bfin de garantie\b/,
      /\bfin de couverture\b/
    ])
  ) {
    return DATE_ROLE.COVERAGE_END;
  }


  /*
   * --------------------------------------------------------
   * SIGNATURE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bsigne le\b/,
      /\bsignature le\b/,
      /\bdate de signature\b/
    ])
  ) {
    return DATE_ROLE.SIGNATURE_DATE;
  }


  /*
   * --------------------------------------------------------
   * DECISION
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bdecision du\b/,
      /\bdecide le\b/,
      /\bjugement du\b/,
      /\bordonnance du\b/,
      /\bdeliberation du\b/
    ])
  ) {
    return DATE_ROLE.DECISION_DATE;
  }


  /*
   * --------------------------------------------------------
   * REFERENCE JURIDIQUE
   * --------------------------------------------------------
   */

  if (
    detectReferenceContext(
      context
    )
  ) {
    return DATE_ROLE.LEGAL_REFERENCE_DATE;
  }


  /*
   * --------------------------------------------------------
   * HISTORIQUE
   * --------------------------------------------------------
   */

  if (
    detectHistoricalContext(
      context
    )
  ) {
    return DATE_ROLE.HISTORICAL_DATE;
  }


  /*
   * --------------------------------------------------------
   * ANNEXE
   * --------------------------------------------------------
   */

  if (
    detectAnnexContext(
      context
    )
  ) {
    return DATE_ROLE.ANNEX_DATE;
  }


  /*
   * --------------------------------------------------------
   * RENDEZ-VOUS / REUNION / EVENEMENT — V2.3
   * --------------------------------------------------------
   */

  const rawDate =
    cleanText(
      item?.date ||
      item?.value ||
      ""
    );

  const localContext =
    normalizeText(
      buildItemContext(item)
    );


  /*
   * Contextes qui excluent une date de réunion.
   */

  const nonMeetingDateContext =
    matchesAny(
      localContext,
      [
        /\bexercice\s+(?:clos|du|de|pour)\b/,
        /\bcomptes?\s+de\s+l[' ]exercice\b/,
        /\bbudget\s+previsionnel\b/,
        /\bperiode\s+du\b/,
        /\bdu\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{4}\s+au\b/,
        /\bau\s+\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{4}\b/,
        /\barticle\b/,
        /\bdecret\b/,
        /\bloi\b/,
        /\barrete\b/,
        /\bcontrat\b/,
        /\bfacture\b/
      ]
    );


  if (!nonMeetingDateContext) {
    const escapedDate =
      rawDate
        ? rawDate.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )
        : "";

    if (escapedDate) {
      const strongMeetingPatterns = [
        new RegExp(
          `\\b(?:convoquee?|convoques?|convocation)\\s+(?:pour\\s+)?(?:le\\s+)?${escapedDate}`,
          "i"
        ),

        new RegExp(
          `\\b(?:assemblee|reunion|rendez-vous|rendez vous|audience|entretien)\\b.{0,35}\\b(?:le|du|pour)\\s+${escapedDate}`,
          "i"
        ),

        new RegExp(
          `\\b(?:se tiendra|aura lieu|est programmee?|est programme|est prevue?|est fixe[ée]?)\\b.{0,35}${escapedDate}`,
          "i"
        ),

        new RegExp(
          `${escapedDate}.{0,35}\\b(?:a\\s+\\d{1,2}[:h]\\d{2}|assemblee|reunion|rendez-vous|audience|entretien)\\b`,
          "i"
        )
      ];

      if (
        matchesAny(
          localContext,
          strongMeetingPatterns
        )
      ) {
        return DATE_ROLE.MEETING_DATE;
      }
    }
  }


  /*
   * --------------------------------------------------------
   * EVENEMENT GENERIQUE — V2.4
   * --------------------------------------------------------
   */

  const excludedEventContext =
    matchesAny(
      context,
      [
        /*
         * Périodes / exercices / budgets
         */
        /\bexercice\b/,
        /\bbudget previsionnel\b/,
        /\bapprobation des comptes\b/,
        /\bcomptes de l'exercice\b/,
        /\bperiode\b/,
        /\bcharges\b/,
        /\breleve de compte\b/,

        /*
         * Références juridiques
         */
        /\barticle\b/,
        /\bdecret\b/,
        /\bloi\b/,
        /\barrete\b/,
        /\bordonnance\b/,
        /\breglement\b/,

        /*
         * Opérations comptables
         */
        /\bfacture\b/,
        /\bprelevement\b/,
        /\bcotisation\b/,
        /\bprovision\b/,
        /\bhonoraires\b/,
        /\bsolde\b/
      ]
    );


  if (
    !excludedEventContext &&
    detectEventContext(
      context
    )
  ) {
    return DATE_ROLE.EVENT_DATE;
  }


  return DATE_ROLE.UNKNOWN;
}

function getDateRoleImportance(
  role
) {
  switch (role) {
    case DATE_ROLE.DEADLINE:
      return 95;

    case DATE_ROLE.PAYMENT_DUE:
      return 95;

    case DATE_ROLE.MEETING_DATE:
      return 92;

    case DATE_ROLE.EVENT_DATE:
      return 85;

    case DATE_ROLE.START_DATE:
      return 72;

    case DATE_ROLE.END_DATE:
      return 72;

    case DATE_ROLE.COVERAGE_START:
      return 68;

    case DATE_ROLE.COVERAGE_END:
      return 68;

    case DATE_ROLE.DECISION_DATE:
      return 62;

    case DATE_ROLE.SIGNATURE_DATE:
      return 58;

    case DATE_ROLE.ISSUE_DATE:
      return 45;

    case DATE_ROLE.HISTORICAL_DATE:
      return 20;

    case DATE_ROLE.LEGAL_REFERENCE_DATE:
      return 12;

    case DATE_ROLE.ANNEX_DATE:
      return 10;

    default:
      return 35;
  }
}


/* ============================================================
 * 33. ANALYSE SEMANTIQUE COMPLETE D'UNE DATE
 * ============================================================
 */
function calculateDateIntentAlignment(
  role,
  documentContext
) {
  const normalizedRole =
    normalizeText(role);

  const intent =
    normalizeText(
      documentContext?.intent
    );

  const situation =
    normalizeText(
      documentContext?.situation
    );

  const globalIntent =
    cleanText(
      `${intent} ${situation}`
    );

  if (
    !normalizedRole ||
    !globalIntent
  ) {
    return 0;
  }

  if (
    globalIntent.includes("meeting")
  ) {
    if (
      normalizedRole.includes("meetingdate") ||
      normalizedRole.includes("eventdate")
    ) {
      return 28;
    }

    if (
      normalizedRole.includes("deadline")
    ) {
      return 3;
    }
  }

  if (
    globalIntent.includes("payment")
  ) {
    if (
      normalizedRole.includes("paymentdue") ||
      normalizedRole.includes("debitdate") ||
      normalizedRole.includes("deadline")
    ) {
      return 25;
    }
  }

  if (
    globalIntent.includes("automatic_debit")
  ) {
    if (
      normalizedRole.includes("debitdate") ||
      normalizedRole.includes("paymentdue")
    ) {
      return 28;
    }
  }

  return 0;
}
function analyzeDateSemantics(
item,
  documentContext
) {
  console.log(
    "[DATE BEFORE SEMANTIC ANALYSIS]",
    {
      date:
        item?.date ||
        item?.value,

      incomingRole:
        item?.role,

      source:
        item?.source,

      label:
        item?.label,

      meaning:
        item?.meaning,

      context:
        buildItemContext(item)
    }
  );

  const context =
    buildItemContext(item);

 

  /*
   * ========================================================
   * V2.2 — VALIDATION INDEPENDANTE DU ROLE
   * ========================================================
   *
   * Semantic Relevance ne fait plus confiance aveuglément
   * au rôle fourni par une couche précédente.
   *
   * Il réanalyse lui-même le contexte local de la date.
   *
   * Si aucune fonction sémantique n'est identifiable,
   * la date reste UNKNOWN plutôt que de conserver
   * potentiellement une mauvaise classification.
   */

  const inferredRole =
    inferDateRole(item);
console.log(
  "[DATE AFTER SEMANTIC ANALYSIS]",
  {
    date:
      item?.date ||
      item?.value,

    upstreamRole:
      item?.role,

    inferredRole,

    context:
      buildItemContext(item)
  }
);
  const upstreamRole =
    item?.role &&
    item.role !== DATE_ROLE.UNKNOWN
      ? item.role
      : DATE_ROLE.UNKNOWN;

  let role =
    inferredRole;


  /*
   * On conserve exceptionnellement un rôle amont
   * uniquement si Semantic Relevance arrive lui-même
   * à confirmer quelque chose.
   *
   * Une absence de preuve locale ne doit pas transformer
   * une date comptable ou historique en date de réunion.
   */

  if (
    role === DATE_ROLE.UNKNOWN &&
    upstreamRole !== DATE_ROLE.UNKNOWN
  ) {
    role =
      DATE_ROLE.UNKNOWN;
  }


  const centrality =
    inferCentrality(
      item,
      documentContext
    );

  const applicability =
    inferApplicability(
      item,
      documentContext
    );

  const conditionality =
    inferConditionality(
      context
    );

  const roleImportance =
    getDateRoleImportance(
      role
    );

  const intentAlignment =
    calculateDateIntentAlignment(
      role,
      documentContext
    );

  return {
    role,
    upstreamRole,
    inferredRole,
    roleImportance,
    intentAlignment,
    centrality,
    applicability,
    conditionality
  };
}

function calculateDateRelevanceScore(
  item,
  semantics
) {
  let score = 25;

  const confidence =
    clamp(
      safeNumber(
        item?.confidence,
        50
      )
    );

  /*
   * Confiance extraction.
   */
  score +=
    confidence * 0.15;


  /*
   * Importance intrinsèque du rôle.
   */
  score +=
    safeNumber(
      semantics?.roleImportance,
      35
    ) * 0.25;


  /*
   * Centralité documentaire.
   */
  score +=
    safeNumber(
      semantics?.centrality?.score,
      40
    ) * 0.35;


  /*
   * Applicabilité utilisateur.
   */
  score +=
    safeNumber(
      semantics?.applicability?.score,
      40
    ) * 0.20;


  /*
   * --------------------------------------------------------
   * PENALITES
   * --------------------------------------------------------
   */
score +=
  safeNumber(
    semantics?.intentAlignment,
    0
  );
  if (
    semantics?.role ===
    DATE_ROLE.LEGAL_REFERENCE_DATE
  ) {
    score -= 25;
  }

  if (
    semantics?.role ===
    DATE_ROLE.HISTORICAL_DATE
  ) {
    score -= 20;
  }

  if (
    semantics?.role ===
    DATE_ROLE.ANNEX_DATE
  ) {
    score -= 22;
  }

  if (
    semantics?.conditionality ===
    CONDITIONALITY.HYPOTHETICAL
  ) {
    score -= 15;
  }

  if (
    semantics?.applicability?.level ===
    APPLICABILITY.THIRD_PARTY
  ) {
    score -= 20;
  }

  return clamp(
    Math.round(score)
  );
}


/* ============================================================
 * 35. ROLE SEMANTIQUE D'UN MONTANT — V2
 * ============================================================
 */

function inferAmountRole(item = {}) {
  const context =
    normalizeText(
      buildItemContext(item)
    );

  if (!context) {
    return AMOUNT_ROLE.UNKNOWN;
  }


  /*
   * --------------------------------------------------------
   * REMBOURSEMENT
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bremboursement\b/,
      /\brembourser\b/,
      /\bsera rembourse\b/,
      /\bmontant rembourse\b/,
      /\bcredit en votre faveur\b/
    ])
  ) {
    return AMOUNT_ROLE.REFUND_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * MONTANT A PAYER
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bmontant a payer\b/,
      /\breste a payer\b/,
      /\bnet a payer\b/,
      /\btotal a payer\b/,
      /\bsomme due\b/,
      /\bmontant du\b/,
      /\bvous devez regler\b/,
      /\bvous devez payer\b/,
      /\ba regler\b/
    ])
  ) {
    return AMOUNT_ROLE.AMOUNT_DUE;
  }


  /*
   * --------------------------------------------------------
   * MENSUALITE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bmensualite\b/,
      /\bpar mois\b/,
      /\bmensuel\b/,
      /\bchaque mois\b/
    ])
  ) {
    return AMOUNT_ROLE.MONTHLY_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * ECHEANCE / VERSEMENT
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\becheance de\b/,
      /\bversement de\b/,
      /\bacompte de\b/,
      /\bpar echeance\b/
    ])
  ) {
    return AMOUNT_ROLE.INSTALLMENT_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * TAXE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\btaxe\b/,
      /\btva\b/,
      /\bimpot\b/,
      /\bcotisation\b/
    ])
  ) {
    return AMOUNT_ROLE.TAX_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * DEVIS / PROPOSITION
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bdevis\b/,
      /\bproposition\b/,
      /\boffre\b/,
      /\bprix propose\b/,
      /\bestimation\b/
    ])
  ) {
    return AMOUNT_ROLE.QUOTED_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * MONTANT APPROUVE / DECIDE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bmontant approuve\b/,
      /\bmontant adopte\b/,
      /\bmontant vote\b/,
      /\bmontant accepte\b/,
      /\bmontant accorde\b/
    ])
  ) {
    return AMOUNT_ROLE.APPROVED_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * ESTIMATION
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\bestime a\b/,
      /\bestimation\b/,
      /\bmontant estimatif\b/,
      /\benviron\b/,
      /\bapproximativement\b/
    ])
  ) {
    return AMOUNT_ROLE.ESTIMATED_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * ANNEXE
   * --------------------------------------------------------
   */

  if (
    detectAnnexContext(
      context
    )
  ) {
    return AMOUNT_ROLE.ANNEX_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * REFERENCE
   * --------------------------------------------------------
   */

  if (
    detectReferenceContext(
      context
    ) ||
    detectHistoricalContext(
      context
    ) ||
    detectExampleContext(
      context
    )
  ) {
    return AMOUNT_ROLE.REFERENCE_AMOUNT;
  }


  /*
   * --------------------------------------------------------
   * TOTAL GENERIQUE
   * --------------------------------------------------------
   */

  if (
    matchesAny(context, [
      /\btotal\b/,
      /\bmontant total\b/
    ])
  ) {
    return AMOUNT_ROLE.TOTAL_AMOUNT;
  }

  return AMOUNT_ROLE.UNKNOWN;
}


/* ============================================================
 * 36. FORCE DU ROLE D'UN MONTANT
 * ============================================================
 */

function getAmountRoleImportance(
  role
) {
  switch (role) {
    case AMOUNT_ROLE.AMOUNT_DUE:
      return 100;

    case AMOUNT_ROLE.REFUND_AMOUNT:
      return 92;

    case AMOUNT_ROLE.INSTALLMENT_AMOUNT:
      return 88;

    case AMOUNT_ROLE.MONTHLY_AMOUNT:
      return 85;

    case AMOUNT_ROLE.TOTAL_AMOUNT:
      return 78;

    case AMOUNT_ROLE.APPROVED_AMOUNT:
      return 72;

    case AMOUNT_ROLE.QUOTED_AMOUNT:
      return 58;

    case AMOUNT_ROLE.ESTIMATED_AMOUNT:
      return 52;

    case AMOUNT_ROLE.TAX_AMOUNT:
      return 50;

    case AMOUNT_ROLE.INFORMATIONAL_AMOUNT:
      return 30;

    case AMOUNT_ROLE.REFERENCE_AMOUNT:
      return 18;

    case AMOUNT_ROLE.ANNEX_AMOUNT:
      return 12;

    default:
      return 35;
  }
}


/* ============================================================
 * 37. DETECTION D'UN MONTANT CONDITIONNEL
 * ============================================================
 *
 * C'est une protection essentielle.
 *
 * Une somme peut exister dans le document sans être
 * actuellement due.
 *
 * Exemple abstrait :
 *
 * "En cas de X, des frais de Y peuvent être appliqués."
 *
 * Y existe réellement dans le texte.
 * Mais Y n'est PAS automatiquement une dette utilisateur.
 * ============================================================
 */

function detectConditionalAmount(
  item
) {
  const context =
    normalizeText(
      buildItemContext(item)
    );

  if (!context) {
    return false;
  }

  return matchesAny(context, [
    /\ben cas de\b/,
    /\bsi\b/,
    /\bpeut etre facture\b/,
    /\bpeuvent etre factures\b/,
    /\bpourra etre facture\b/,
    /\bpourront etre factures\b/,
    /\bserait facture\b/,
    /\bsous reserve\b/,
    /\ba condition\b/,
    /\ble cas echeant\b/,
    /\beventuellement\b/
  ]);
}


/* ============================================================
 * 38. DETECTION D'UN MONTANT PERIODIQUE / TARIFAIRE
 * ============================================================
 *
 * Un tarif n'est pas automatiquement un montant dû.
 *
 * "25 € par jour"
 * "40 € / heure"
 * "X € par unité"
 *
 * décrit souvent une règle de calcul et non une dette
 * déjà exigible.
 * ============================================================
 */

function detectRateAmount(
  item
) {
  const context =
    normalizeText(
      buildItemContext(item)
    );

  if (!context) {
    return false;
  }

  return matchesAny(context, [
    /\bpar jour\b/,
    /\bpar heure\b/,
    /\bpar semaine\b/,
    /\bpar unite\b/,
    /\bpar kilometre\b/,
    /\bpar km\b/,
    /\b\/\s*jour\b/,
    /\b\/\s*h\b/,
    /\b\/\s*heure\b/,
    /\b\/\s*km\b/
  ]);
}


/* ============================================================
 * 39. MONTANT EXPLICITEMENT EXIGIBLE
 * ============================================================
 *
 * On cherche ici un signal plus fort que la simple présence
 * d'un mot comme "paiement".
 * ============================================================
 */

function detectExplicitAmountDue(
  item
) {
  const directContext =
    normalizeText(
      cleanText(
        [
          item?.label,
          item?.text,
          item?.meaning,
          item?.sourceText,
          item?.evidence?.quote
        ]
          .filter(Boolean)
          .join(" ")
      )
    );

  if (!directContext) {
    return false;
  }

  /*
   * --------------------------------------------------------
   * SIGNAUX FORTS DE MONTANT REELLEMENT EXIGIBLE
   * --------------------------------------------------------
   *
   * On demande des formulations vraiment explicites.
   */

  const strongDueSignal =
    matchesAny(
      directContext,
      [
        /\bnet a payer\b/,
        /\breste a payer\b/,
        /\btotal a payer\b/,
        /\bmontant a payer\b/,
        /\bsomme due\b/,
        /\bvous devez payer\b/,
        /\bvous devez regler\b/,
        /\best exigible\b/,
        /\bsera preleve\b/,
        /\bmontant preleve\b/
      ]
    );

  if (!strongDueSignal) {
    return false;
  }

  /*
   * --------------------------------------------------------
   * PROTECTION : TARIF / BAREME
   * --------------------------------------------------------
   */

  if (
    detectRateAmount(item)
  ) {
    return false;
  }

  /*
   * --------------------------------------------------------
   * PROTECTION : CONDITION
   * --------------------------------------------------------
   */

  if (
    detectConditionalAmount(item)
  ) {
    return false;
  }

  /*
   * --------------------------------------------------------
   * PROTECTION : EXEMPLE / ANNEXE / REFERENCE
   * --------------------------------------------------------
   */

  if (
    detectExampleContext(
      directContext
    ) ||
    detectAnnexContext(
      directContext
    ) ||
    detectReferenceContext(
      directContext
    )
  ) {
    return false;
  }

  return true;
}

function analyzeAmountSemantics(
  item,
  documentContext
) {
  let role =
    item.role &&
    item.role !== AMOUNT_ROLE.UNKNOWN
      ? item.role
      : inferAmountRole(item);

  const context =
    buildItemContext(item);

  const conditionality =
    inferConditionality(
      context
    );

  const conditionalAmount =
    detectConditionalAmount(
      item
    );

  const rateAmount =
    detectRateAmount(
      item
    );

  const explicitlyDue =
    detectExplicitAmountDue(
      item
    );

  const centrality =
    inferCentrality(
      item,
      documentContext
    );

  const applicability =
    inferApplicability(
      item,
      documentContext
    );


  /*
   * ========================================================
   * CORRECTION SEMANTIQUE DU ROLE
   * ========================================================
   *
   * Très important :
   *
   * une couche précédente peut avoir classé un montant
   * "amountDue".
   *
   * V2 est autorisée à corriger cette interprétation si
   * le contexte montre clairement qu'il s'agit d'un tarif,
   * d'une hypothèse ou d'une information conditionnelle.
   * ========================================================
   */

if (
  role === AMOUNT_ROLE.AMOUNT_DUE &&
  !explicitlyDue
) {
  if (
    conditionalAmount ||
    rateAmount
  ) {
    role =
      AMOUNT_ROLE.INFORMATIONAL_AMOUNT;
  } else {
    role =
      AMOUNT_ROLE.TOTAL_AMOUNT;
  }
}


  return {
    role,

    roleImportance:
      getAmountRoleImportance(
        role
      ),

    centrality,
    applicability,
    conditionality,

    conditionalAmount,
    rateAmount,
    explicitlyDue
  };
}


/* ============================================================
 * 41. SCORE FINAL D'UN MONTANT
 * ============================================================
 */

function calculateAmountRelevanceScore(
  item,
  semantics
) {
  let score = 20;

  const confidence =
    clamp(
      safeNumber(
        item?.confidence,
        50
      )
    );

  /*
   * Confiance de l'extraction.
   */
  score +=
    confidence * 0.12;


  /*
   * Importance du rôle.
   */
  score +=
    safeNumber(
      semantics?.roleImportance,
      35
    ) * 0.25;


  /*
   * Centralité.
   */
  score +=
    safeNumber(
      semantics?.centrality?.score,
      40
    ) * 0.35;


  /*
   * Applicabilité.
   */
  score +=
    safeNumber(
      semantics?.applicability?.score,
      40
    ) * 0.20;


  /*
   * ========================================================
   * BONUS
   * ========================================================
   */

  if (
    semantics?.explicitlyDue
  ) {
    score += 15;
  }


  /*
   * ========================================================
   * PENALITES
   * ========================================================
   */

  if (
    semantics?.conditionalAmount
  ) {
    score -= 22;
  }

  if (
    semantics?.rateAmount &&
    !semantics?.explicitlyDue
  ) {
    score -= 20;
  }

  if (
    semantics?.role ===
    AMOUNT_ROLE.REFERENCE_AMOUNT
  ) {
    score -= 22;
  }

  if (
    semantics?.role ===
    AMOUNT_ROLE.ANNEX_AMOUNT
  ) {
    score -= 25;
  }

  if (
    semantics?.role ===
    AMOUNT_ROLE.INFORMATIONAL_AMOUNT
  ) {
    score -= 15;
  }

  if (
    semantics?.applicability?.level ===
    APPLICABILITY.THIRD_PARTY
  ) {
    score -= 25;
  }

  if (
    semantics?.conditionality ===
    CONDITIONALITY.HYPOTHETICAL
  ) {
    score -= 12;
  }

  return clamp(
    Math.round(score)
  );
}


/* ============================================================
 * 42. NIVEAU DE PERTINENCE A PARTIR DU SCORE
 * ============================================================
 */

function scoreToRelevance(
  score
) {
  const value =
    clamp(score);

  if (
    value >= 82
  ) {
    return RELEVANCE.CRITICAL;
  }

  if (
    value >= 68
  ) {
    return RELEVANCE.HIGH;
  }

  if (
    value >= 50
  ) {
    return RELEVANCE.MEDIUM;
  }

  if (
    value >= 30
  ) {
    return RELEVANCE.LOW;
  }

  return RELEVANCE.NOISE;
}


/* ============================================================
 * 43. ENRICHISSEMENT D'UNE DATE
 * ============================================================
 */

function enrichDateCandidate(
  item,
  documentContext
) {
  const semantics =
    analyzeDateSemantics(
      item,
      documentContext
    );

  const semanticScore =
    calculateDateRelevanceScore(
      item,
      semantics
    );

  return {
    ...item,

    role:
      semantics.role,

    semanticRole:
      semantics.role,

    semanticScore,

    semanticRelevance:
      scoreToRelevance(
        semanticScore
      ),

    relevance:
      scoreToRelevance(
        semanticScore
      ),

    centrality:
      semantics.centrality,

    applicability:
      semantics.applicability,

    conditionality:
      semantics.conditionality,

    semanticMeta: {
      engine:
        "semantic-relevance-v2",

      kind:
        INFORMATION_KIND.DATE,

      roleImportance:
        semantics.roleImportance
    }
  };
}


/* ============================================================
 * 44. ENRICHISSEMENT D'UN MONTANT
 * ============================================================
 */

function enrichAmountCandidate(
  item,
  documentContext
) {
  const semantics =
    analyzeAmountSemantics(
      item,
      documentContext
    );

  const semanticScore =
    calculateAmountRelevanceScore(
      item,
      semantics
    );

  return {
    ...item,

    role:
      semantics.role,

    semanticRole:
      semantics.role,

    semanticScore,

    semanticRelevance:
      scoreToRelevance(
        semanticScore
      ),

    relevance:
      scoreToRelevance(
        semanticScore
      ),

    centrality:
      semantics.centrality,

    applicability:
      semantics.applicability,

    conditionality:
      semantics.conditionality,

    conditionalAmount:
      semantics.conditionalAmount,

    rateAmount:
      semantics.rateAmount,

    explicitlyDue:
      semantics.explicitlyDue,

    semanticMeta: {
      engine:
        "semantic-relevance-v2",

      kind:
        INFORMATION_KIND.AMOUNT,

      roleImportance:
        semantics.roleImportance
    }
  };
}


/* ============================================================
 * 45. ENRICHISSEMENT D'UNE ACTION
 * ============================================================
 */

function enrichActionCandidate(
  item,
  documentContext
) {
  const semantics =
    analyzeActionSemantics(
      item,
      documentContext
    );

  const centrality =
    inferCentrality(
      item,
      documentContext
    );

  const userImpactScore =
    calculateActionUserImpactScore(
      semantics
    );

  /*
   * On combine :
   *
   * - impact utilisateur
   * - centralité documentaire
   *
   * Une phrase impérative perd donc de l'importance
   * si elle appartient à une annexe ou concerne un tiers.
   */

  const semanticScore =
    clamp(
      Math.round(
        (
          userImpactScore * 0.65
        ) +
        (
          safeNumber(
            centrality?.score,
            40
          ) * 0.35
        )
      )
    );

  return {
    ...item,

    target:
      semantics.target,

    role:
      semantics.role,

    semanticRole:
      semantics.role,

    semanticScore,

    semanticRelevance:
      scoreToRelevance(
        semanticScore
      ),

    relevance:
      scoreToRelevance(
        semanticScore
      ),

    centrality,

    applicability:
      semantics.applicability,

    conditionality:
      semantics.conditionality,

    consequence:
      semantics.consequence,

   isRealUserAction:
  isRealUserAction(
    semantics,
    centrality
  ),

    semanticMeta: {
      engine:
        "semantic-relevance-v2",

      kind:
        INFORMATION_KIND.ACTION,

      userImpactScore
    }
  };
}


/* ============================================================
 * 46. UNE DATE PEUT-ELLE ETRE PRINCIPALE ?
 * ============================================================
 */

function canBePrimaryDate(
  item
) {
  if (!item) {
    return false;
  }

  if (
    item.semanticRelevance ===
    RELEVANCE.NOISE
  ) {
    return false;
  }

  if (
    item.role ===
      DATE_ROLE.LEGAL_REFERENCE_DATE ||
    item.role ===
      DATE_ROLE.HISTORICAL_DATE ||
    item.role ===
      DATE_ROLE.ANNEX_DATE
  ) {
    return false;
  }

  if (
    item.centrality?.level ===
    CENTRALITY.REFERENCE
  ) {
    return false;
  }

  if (
    item.applicability?.level ===
    APPLICABILITY.THIRD_PARTY
  ) {
    return false;
  }

  return true;
}


/* ============================================================
 * 47. UN MONTANT PEUT-IL ETRE PRINCIPAL ?
 * ============================================================
 */


function canBePrimaryAmount(
  item
) {
  if (!item) {
    return false;
  }

  if (
    item.semanticRelevance ===
    RELEVANCE.NOISE
  ) {
    return false;
  }

  if (
    item.role ===
      AMOUNT_ROLE.REFERENCE_AMOUNT ||
    item.role ===
      AMOUNT_ROLE.ANNEX_AMOUNT ||
    item.role ===
      AMOUNT_ROLE.INFORMATIONAL_AMOUNT
  ) {
    return false;
  }

  /*
   * Tarif ou montant conditionnel non exigible
   * => jamais montant principal.
   */
  if (
    (
      item.rateAmount ||
      item.conditionalAmount
    ) &&
    !item.explicitlyDue
  ) {
    return false;
  }

  /*
   * Montant explicitement dû :
   * il peut être principal.
   */
  if (
    item.explicitlyDue === true &&
    item.semanticScore >= 65
  ) {
    return true;
  }

  /*
   * Sinon on demande des signaux très forts :
   *
   * - central
   * - directement applicable
   * - score élevé
   */
  const strongCentrality =
    item.centrality?.level ===
      CENTRALITY.CORE ||
    item.centrality?.level ===
      CENTRALITY.STRONG;

  const strongApplicability =
    item.applicability?.level ===
      APPLICABILITY.DIRECT ||
    item.applicability?.level ===
      APPLICABILITY.LIKELY;

  return (
    item.semanticScore >= 80 &&
    strongCentrality &&
    strongApplicability
  );
}

function sortBySemanticImportance(
  items
) {
  return [...asArray(items)]
    .sort(
      (a, b) => {
        const scoreDifference =
          safeNumber(
            b?.semanticScore
          ) -
          safeNumber(
            a?.semanticScore
          );

        if (
          scoreDifference !== 0
        ) {
          return scoreDifference;
        }

        /*
         * En cas d'égalité :
         * la centralité départage.
         */

        const centralityDifference =
          safeNumber(
            b?.centrality?.score
          ) -
          safeNumber(
            a?.centrality?.score
          );

        if (
          centralityDifference !== 0
        ) {
          return centralityDifference;
        }

        /*
         * Puis la confiance extraction.
         */

        return (
          safeNumber(
            b?.confidence
          ) -
          safeNumber(
            a?.confidence
          )
        );
      }
    );
}


/* ============================================================
 * 49. SELECTION DATE PRINCIPALE — V2
 * ============================================================
 */
function deduplicatePrimaryDates(dates) {
  const map = new Map();

  for (const item of asArray(dates)) {
    const rawValue = cleanText(
      item?.date ||
      item?.value ||
      ""
    );

    if (!rawValue) {
      continue;
    }

    /*
     * On extrait d'abord une vraie date calendrier.
     *
     * Exemples :
     * 20/07/2026
     * 20-07-2026
     * 20 07 2026
     * "Assemblée le 20/07/2026 à 17:00"
     *
     * => clé identique : 20072026
     */
    const dateMatch = rawValue.match(
      /\b(\d{1,2})[\/\-\s.](\d{1,2})[\/\-\s.](\d{4})\b/
    );

    let key;

    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const month = dateMatch[2].padStart(2, "0");
      const year = dateMatch[3];

      key = `${day}${month}${year}`;
    } else {
      /*
       * Fallback pour ne pas casser les autres
       * formats éventuellement supportés.
       */
      key = rawValue
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    const existing = map.get(key);

    if (
      !existing ||
      safeNumber(item?.semanticScore) >
        safeNumber(existing?.semanticScore)
    ) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}
function selectPrimaryDateV2(
  dates
) {
  const candidates =
    sortBySemanticImportance(
      deduplicatePrimaryDates(
        asArray(dates)
          .filter(
            canBePrimaryDate
          )
      )
    );

  return (
    candidates[0] ||
    null
  );
}

function selectPrimaryAmountV2(
  amounts
) {
  const candidates =
    sortBySemanticImportance(
      asArray(amounts)
        .filter(
          canBePrimaryAmount
        )
    );

  return (
    candidates[0] ||
    null
  );
}


/* ============================================================
 * 51. SELECTION DES ACTIONS UTILISATEUR — V2
 * ============================================================
 */
function selectUserActionsV2(
  actions
) {
  const candidates =
    sortBySemanticImportance(
      asArray(actions)
        .filter(
          (item) =>
            item?.isRealUserAction ===
            true
        )
        .filter(
          (item) =>
            safeNumber(
              item?.semanticScore
            ) >= 55
        )
    );

  return candidates.slice(
    0,
    3
  );
}

/* ============================================================
 * FIN PARTIE 3
 * ============================================================
 *
 * PARTIE 4 :
 *
 * - récupération robuste des données provenant du Brain
 * - normalisation des anciennes structures V1
 * - collecte dates / montants / actions
 * - déduplication
 * - construction du profil global
 * - comparaison des candidats entre eux
 *
 * Puis la dernière partie remettra l'API publique :
 *
 * buildSemanticRelevanceProfile(...)
 *
 * pour que DecisionEngine continue à fonctionner sans devoir
 * changer tous les autres fichiers.
 *
 * ============================================================
 */
/* ============================================================
 * 52. CLE SEMANTIQUE GENERIQUE
 * ============================================================
 */

function buildSemanticKey(item) {
  if (!item) {
    return "";
  }

  const kind =
    cleanText(
      item.kind ||
      item.type ||
      item.semanticMeta?.kind ||
      ""
    );

  const role =
    cleanText(
      item.semanticRole ||
      item.role ||
      ""
    );

  const value =
    cleanText(
      item.date ||
      item.amount ||
      item.value ||
      item.text ||
      item.action ||
      item.label ||
      ""
    );

  if (!value) {
    return "";
  }

  return [
    normalizeText(kind),
    normalizeText(role),
    normalizeText(value)
  ].join("|");
}


/* ============================================================
 * 53. DEDUPLICATION SEMANTIQUE
 * ============================================================
 */

function deduplicateSemanticItems(
  items
) {
  return uniqueBy(
    asArray(items),
    buildSemanticKey
  );
}


/* ============================================================
 * 54. MEILLEURE VERSION D'UN ELEMENT
 * ============================================================
 *
 * Plusieurs couches peuvent produire la même information.
 *
 * On préfère :
 * - information vérifiée
 * - meilleure confiance
 * - meilleur contexte
 * - signal important
 * ============================================================
 */

function chooseBestVersion(
  first,
  second
) {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  const firstScore =
    safeNumber(
      first?.confidence
    ) +
    (
      first?.verified === true
        ? 25
        : 0
    ) +
    (
      first?.important === true
        ? 10
        : 0
    ) +
    (
      buildItemContext(first)
        .length > 40
        ? 8
        : 0
    );

  const secondScore =
    safeNumber(
      second?.confidence
    ) +
    (
      second?.verified === true
        ? 25
        : 0
    ) +
    (
      second?.important === true
        ? 10
        : 0
    ) +
    (
      buildItemContext(second)
        .length > 40
        ? 8
        : 0
    );

  const winner =
    secondScore >
    firstScore
      ? second
      : first;

  const loser =
    winner === second
      ? first
      : second;

  return {
    ...loser,
    ...winner,

    context:
      cleanText(
        [
          loser?.context,
          loser?.evidence?.quote,
          winner?.context,
          winner?.evidence?.quote
        ]
          .filter(Boolean)
          .join(" ")
      )
  };
}


/* ============================================================
 * 55. DEDUPLICATION AVEC FUSION
 * ============================================================
 */

function mergeDuplicateItems(
  items
) {
  const map =
    new Map();

  for (const item of asArray(items)) {
    const key =
      buildSemanticKey(item);

    if (!key) {
      continue;
    }

    const existing =
      map.get(key);

    if (!existing) {
      map.set(
        key,
        item
      );

      continue;
    }

    map.set(
      key,
      chooseBestVersion(
        existing,
        item
      )
    );
  }

  return Array.from(
    map.values()
  );
}


/* ============================================================
 * 56. NORMALISATION DATE EN ENTREE
 * ============================================================
 */

function normalizeDateInput(
  item
) {
  if (!item) {
    return null;
  }

  if (
    typeof item === "string"
  ) {
    return {
      value:
        cleanText(item),

      date:
        cleanText(item),

      confidence:
        50,

      verified:
        false
    };
  }

  const value =
    cleanText(
      item.value ||
      item.date ||
      item.raw ||
      ""
    );

  if (!value) {
    return null;
  }

  return {
    ...item,

    value,

    date:
      item.date ||
      value,

    confidence:
      safeNumber(
        item.confidence,
        50
      )
  };
}


/* ============================================================
 * 57. NORMALISATION MONTANT EN ENTREE
 * ============================================================
 */

function normalizeAmountInput(
  item
) {
  if (!item) {
    return null;
  }

  if (
    typeof item === "number"
  ) {
    return {
      value:
        String(item),

      numeric:
        item,

      confidence:
        50,

      verified:
        false
    };
  }

  if (
    typeof item === "string"
  ) {
    return {
      value:
        cleanText(item),

      confidence:
        50,

      verified:
        false
    };
  }

  const value =
    cleanText(
      item.value ||
      item.amount ||
      item.raw ||
      ""
    );

  if (
    !value &&
    item.numeric === undefined
  ) {
    return null;
  }

  return {
    ...item,

    value:
      value ||
      String(
        item.numeric
      ),

    confidence:
      safeNumber(
        item.confidence,
        50
      )
  };
}


/* ============================================================
 * 58. NORMALISATION ACTION EN ENTREE
 * ============================================================
 */

function normalizeActionInput(
  item
) {
  if (!item) {
    return null;
  }

  if (
    typeof item === "string"
  ) {
    return {
      action:
        cleanText(item),

      text:
        cleanText(item),

      confidence:
        50
    };
  }

  const text =
    cleanText(
      item.text ||
      item.action ||
      item.label ||
      item.description ||
      ""
    );

  if (!text) {
    return null;
  }

  return {
    ...item,

    action:
      item.action ||
      text,

    text,

    confidence:
      safeNumber(
        item.confidence,
        50
      )
  };
}


/* ============================================================
 * 59. COLLECTE DATES
 * ============================================================
 */

function collectDatesV2(
  input
) {
  const result = [];

  result.push(
    ...asArray(
      input?.dates
    )
  );

  result.push(
    ...asArray(
      input?.brain?.dates
    )
  );

  result.push(
    ...asArray(
      input?.decision?.dates
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

  if (
    input?.decision
      ?.primaryDate
  ) {
    result.push({
      ...input.decision.primaryDate,
      isPrimary: true
    });
  }

  result.push(
    ...asArray(
      input?.facts
    )
      .filter(
        (fact) =>
          normalizeText(
            fact?.kind ||
            fact?.type
          ) === "date"
      )
  );

  return mergeDuplicateItems(
    result
      .map(
        normalizeDateInput
      )
      .filter(Boolean)
  );
}


/* ============================================================
 * 60. COLLECTE MONTANTS
 * ============================================================
 */

function collectAmountsV2(
  input
) {
  const result = [];

  result.push(
    ...asArray(
      input?.amounts
    )
  );

  result.push(
    ...asArray(
      input?.brain?.amounts
    )
  );

  result.push(
    ...asArray(
      input?.decision?.amounts
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

  if (
    input?.decision
      ?.primaryAmount
  ) {
    result.push({
      ...input.decision.primaryAmount,
      isPrimary: true
    });
  }

  result.push(
    ...asArray(
      input?.facts
    )
      .filter(
        (fact) => {
          const type =
            normalizeText(
              fact?.kind ||
              fact?.type
            );

          return (
            type === "amount" ||
            type === "montant"
          );
        }
      )
  );

  return mergeDuplicateItems(
    result
      .map(
        normalizeAmountInput
      )
      .filter(Boolean)
  );
}


/* ============================================================
 * 61. COLLECTE ACTIONS
 * ============================================================
 */

function collectActionsV2(
  input
) {
  const result = [];

  result.push(
    ...asArray(
      input?.actions
    )
  );

  result.push(
    ...asArray(
      input?.brain?.actions
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

  result.push(
    ...asArray(
      input?.consensus?.actions
    )
  );

  return mergeDuplicateItems(
    result
      .map(
        normalizeActionInput
      )
      .filter(Boolean)
  );
}


/* ============================================================
 * 62. COLLECTE AUTRES FAITS
 * ============================================================
 */

function collectGenericFactsV2(
  input
) {
  const facts =
    asArray(
      input?.facts
    );

  return facts.filter(
    (fact) => {
      const type =
        normalizeText(
          fact?.kind ||
          fact?.type
        );

      return (
        type !== "date" &&
        type !== "amount" &&
        type !== "montant" &&
        type !== "action"
      );
    }
  );
}


/* ============================================================
 * 63. ENRICHISSEMENT DATES
 * ============================================================
 */

function enrichDatesV2(
  dates,
  documentContext
) {
  return sortBySemanticImportance(
    deduplicateSemanticItems(
      asArray(dates)
        .map(
          (item) =>
            enrichDateCandidate(
              item,
              documentContext
            )
        )
    )
  );
}


/* ============================================================
 * 64. ENRICHISSEMENT MONTANTS
 * ============================================================
 */

function enrichAmountsV2(
  amounts,
  documentContext
) {
  return sortBySemanticImportance(
    deduplicateSemanticItems(
      asArray(amounts)
        .map(
          (item) =>
            enrichAmountCandidate(
              item,
              documentContext
            )
        )
    )
  );
}


/* ============================================================
 * 65. ENRICHISSEMENT ACTIONS
 * ============================================================
 */

function enrichActionsV2(
  actions,
  documentContext
) {
  return sortBySemanticImportance(
    deduplicateSemanticItems(
      asArray(actions)
        .map(
          (item) =>
            enrichActionCandidate(
              item,
              documentContext
            )
        )
    )
  );
}


/* ============================================================
 * 66. ENRICHISSEMENT DES FAITS GENERIQUES
 * ============================================================
 */

function enrichGenericFactV2(
  item,
  documentContext
) {
  const centrality =
    inferCentrality(
      item,
      documentContext
    );

  const applicability =
    inferApplicability(
      item,
      documentContext
    );

  const confidence =
    clamp(
      safeNumber(
        item?.confidence,
        50
      )
    );

  const score =
    clamp(
      Math.round(
        (
          confidence * 0.20
        ) +
        (
          centrality.score * 0.50
        ) +
        (
          applicability.score * 0.30
        )
      )
    );

  return {
    ...item,

    kind:
      item?.kind ||
      item?.type ||
      INFORMATION_KIND.FACT,

    semanticScore:
      score,

    relevance:
      scoreToRelevance(
        score
      ),

    semanticRelevance:
      scoreToRelevance(
        score
      ),

    centrality,
    applicability,

    semanticMeta: {
      engine:
        "semantic-relevance-v2",

      kind:
        INFORMATION_KIND.FACT
    }
  };
}


function enrichGenericFactsV2(
  facts,
  documentContext
) {
  return sortBySemanticImportance(
    deduplicateSemanticItems(
      asArray(facts)
        .map(
          (item) =>
            enrichGenericFactV2(
              item,
              documentContext
            )
        )
    )
  );
}


/* ============================================================
 * 67. PARTITION GENERIQUE
 * ============================================================
 */

function partitionByRelevance(
  items
) {
  const important = [];
  const secondary = [];
  const ignored = [];

  for (
    const item
    of asArray(items)
  ) {
    const score =
      safeNumber(
        item?.semanticScore
      );

    if (
      score >= 68
    ) {
      important.push(
        item
      );

      continue;
    }

    if (
      score >= 42
    ) {
      secondary.push(
        item
      );

      continue;
    }

    ignored.push(
      item
    );
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
 * 68. QUALITE DU PROFIL
 * ============================================================
 *
 * Donne une idée globale de la qualité de compréhension
 * du Semantic Relevance Engine lui-même.
 * ============================================================
 */

function calculateProfileConfidence({
  primaryDate,
  primaryAmount,
  userActions,
  dates,
  amounts,
  actions
}) {
  let score = 55;

  if (
    primaryDate &&
    safeNumber(
      primaryDate.semanticScore
    ) >= 70
  ) {
    score += 12;
  }

  if (
    primaryAmount &&
    safeNumber(
      primaryAmount.semanticScore
    ) >= 70
  ) {
    score += 10;
  }

  if (
    asArray(userActions)
      .some(
        (action) =>
          safeNumber(
            action?.semanticScore
          ) >= 70
      )
  ) {
    score += 10;
  }

  /*
   * Trop d'éléments "critiques" peut signifier
   * que le moteur n'a pas assez hiérarchisé.
   */

  const criticalCount =
    [
      ...asArray(dates),
      ...asArray(amounts),
      ...asArray(actions)
    ]
      .filter(
        (item) =>
          item?.relevance ===
          RELEVANCE.CRITICAL
      )
      .length;

  if (
    criticalCount > 8
  ) {
    score -= 10;
  }

  if (
    criticalCount > 15
  ) {
    score -= 15;
  }

  return clamp(
    score
  );
}


/* ============================================================
 * 69. STABILITE D'UN ELEMENT PRINCIPAL
 * ============================================================
 *
 * Si le premier et le deuxième candidat sont presque ex aequo,
 * on le signale.
 * ============================================================
 */

function evaluatePrimaryStability(
  items
) {
  const sorted =
    sortBySemanticImportance(
      items
    );

  const first =
    sorted[0] ||
    null;

  const second =
    sorted[1] ||
    null;

  if (!first) {
    return {
      stable: false,
      gap: 0
    };
  }

  if (!second) {
    return {
      stable: true,
      gap: 100
    };
  }

  const gap =
    safeNumber(
      first.semanticScore
    ) -
    safeNumber(
      second.semanticScore
    );

  return {
    stable:
      gap >= 8,

    gap
  };
}


/* ============================================================
 * 70. DIAGNOSTIC INTERNE
 * ============================================================
 */

function buildSemanticDiagnostics({
  dates,
  amounts,
  actions,
  primaryDate,
  primaryAmount,
  userActions
}) {
 const dateStability =
  evaluatePrimaryStability(
    deduplicatePrimaryDates(
      asArray(dates)
        .filter(
          canBePrimaryDate
        )
    )
  );
  const amountStability =
    evaluatePrimaryStability(
      asArray(amounts)
        .filter(
          canBePrimaryAmount
        )
    );
console.log(
  "[SEMANTIC CRITICAL DATES DEBUG]",
  deduplicatePrimaryDates(
    asArray(dates).filter(
      (item) =>
        item?.relevance ===
        RELEVANCE.CRITICAL
    )
  ).map((item) => ({
    date: item?.date,
    value: item?.value,
    role: item?.role,
    semanticRole: item?.semanticRole,
    semanticScore: item?.semanticScore,
    score: item?.score,
    relevance: item?.relevance,
    centrality: item?.centrality,
    applicability: item?.applicability,
    context: item?.context
  }))
);
  return {
    datePrimaryStable:
      dateStability.stable,

    dateScoreGap:
      dateStability.gap,

    amountPrimaryStable:
      amountStability.stable,

    amountScoreGap:
      amountStability.gap,

    userActionCount:
      asArray(
        userActions
      ).length,

    criticalDates:
  deduplicatePrimaryDates(
    asArray(dates)
      .filter(
        (item) =>
          item?.relevance ===
          RELEVANCE.CRITICAL
      )
  ).length,

    criticalAmounts:
      asArray(amounts)
        .filter(
          (item) =>
            item?.relevance ===
            RELEVANCE.CRITICAL
        )
        .length,

    criticalActions:
      asArray(actions)
        .filter(
          (item) =>
            item?.relevance ===
            RELEVANCE.CRITICAL
        )
        .length
  };
}


/* ============================================================
 * FIN PARTIE 4
 * ============================================================
 *
 * PARTIE 5 :
 *
 * - buildSemanticRelevanceProfile(...)
 * - structure finale compatible avec DecisionEngine
 * - primary.date / primary.amount / primary.actions
 * - dates / amounts / actions / facts
 * - diagnostics
 * - confidence
 * - debug
 * - export default
 *
 * Après PARTIE 5 :
 * fichier complet, prêt à déployer.
 *
 * ============================================================
 */
/* ============================================================
 * 71. CONSTRUCTION DU PROFIL SEMANTIQUE V2
 * ============================================================
 */

export function buildSemanticRelevanceProfile(
  input = {}
) {
  /*
   * ========================================================
   * 1 — CONTEXTE GLOBAL DU DOCUMENT
   * ========================================================
   */

  const documentContext =
    buildDocumentContext(
      input
    );


  /*
   * ========================================================
   * 2 — COLLECTE DES INFORMATIONS
   * ========================================================
   */

  const rawDates =
    collectDatesV2(
      input
    );

  const rawAmounts =
    collectAmountsV2(
      input
    );

  const rawActions =
    collectActionsV2(
      input
    );

  const rawFacts =
    collectGenericFactsV2(
      input
    );


  /*
   * ========================================================
   * 3 — ANALYSE SEMANTIQUE
   * ========================================================
   */

  const analyzedDates =
    enrichDatesV2(
      rawDates,
      documentContext
    );

  const analyzedAmounts =
    enrichAmountsV2(
      rawAmounts,
      documentContext
    );

  const analyzedActions =
    enrichActionsV2(
      rawActions,
      documentContext
    );

  const analyzedFacts =
    enrichGenericFactsV2(
      rawFacts,
      documentContext
    );


  /*
   * ========================================================
   * 4 — ELEMENTS PRINCIPAUX
   * ========================================================
   */

  const primaryDate =
    selectPrimaryDateV2(
      analyzedDates
    );

  const primaryAmount =
    selectPrimaryAmountV2(
      analyzedAmounts
    );

  const userActions =
    selectUserActionsV2(
      analyzedActions
    );


  /*
   * ========================================================
   * 5 — PARTITIONS
   * ========================================================
   */

  const datePartition =
    partitionByRelevance(
      analyzedDates
    );

  const amountPartition =
    partitionByRelevance(
      analyzedAmounts
    );

  const actionPartition =
    partitionByRelevance(
      analyzedActions
    );

  const factPartition =
    partitionByRelevance(
      analyzedFacts
    );


  /*
   * ========================================================
   * 6 — DIAGNOSTIC
   * ========================================================
   */

  const diagnostics =
    buildSemanticDiagnostics({
      dates:
        analyzedDates,

      amounts:
        analyzedAmounts,

      actions:
        analyzedActions,

      primaryDate,

      primaryAmount,

      userActions
    });


  /*
   * ========================================================
   * 7 — CONFIANCE DU PROFIL
   * ========================================================
   */

  const confidence =
    calculateProfileConfidence({
      primaryDate,

      primaryAmount,

      userActions,

      dates:
        analyzedDates,

      amounts:
        analyzedAmounts,

      actions:
        analyzedActions
    });


  /*
   * ========================================================
   * 8 — RESULTAT PUBLIC
   * ========================================================
   *
   * On conserve une structure compatible avec V1
   * pour ne pas casser DecisionEngine.
   * ========================================================
   */

  return {
    version:
      "semantic-relevance-v2",

    confidence,


    /*
     * -----------------------------------------------------
     * CONTEXTE DOCUMENTAIRE
     * -----------------------------------------------------
     */

    documentContext: {
      documentType:
        documentContext
          ?.documentType ||
        null,

      family:
        documentContext
          ?.family ||
        null,

      title:
        documentContext
          ?.title ||
        null,

      intent:
        documentContext
          ?.intent ||
        null,

      situation:
        documentContext
          ?.situation ||
        null,

      summary:
        documentContext
          ?.summary ||
        null
    },


    /*
     * -----------------------------------------------------
     * INFORMATIONS PRINCIPALES
     * -----------------------------------------------------
     */

    primary: {
      date:
        primaryDate,

      amount:
        primaryAmount,

      actions:
        userActions
    },


    /*
     * -----------------------------------------------------
     * DATES
     * -----------------------------------------------------
     */

    dates: {
      all:
        analyzedDates,

      important:
        datePartition
          .important,

      secondary:
        datePartition
          .secondary,

      ignored:
        datePartition
          .ignored
    },


    /*
     * -----------------------------------------------------
     * MONTANTS
     * -----------------------------------------------------
     */

    amounts: {
      all:
        analyzedAmounts,

      important:
        amountPartition
          .important,

      secondary:
        amountPartition
          .secondary,

      ignored:
        amountPartition
          .ignored
    },


    /*
     * -----------------------------------------------------
     * ACTIONS
     * -----------------------------------------------------
     */

    actions: {
      all:
        analyzedActions,

      user:
        userActions,

      important:
        actionPartition
          .important,

      secondary:
        actionPartition
          .secondary,

      ignored:
        actionPartition
          .ignored
    },


    /*
     * -----------------------------------------------------
     * AUTRES FAITS
     * -----------------------------------------------------
     */

    facts: {
      all:
        analyzedFacts,

      important:
        factPartition
          .important,

      secondary:
        factPartition
          .secondary,

      ignored:
        factPartition
          .ignored
    },


    /*
     * -----------------------------------------------------
     * DIAGNOSTIC INTERNE
     * -----------------------------------------------------
     */

    diagnostics
  };
}


/* ============================================================
 * 72. DEBUG DATE
 * ============================================================
 */

function buildDateDebugView(
  item
) {
  if (!item) {
    return null;
  }

  return {
    value:
      item.date ||
      item.value ||
      null,

    role:
      item.role ||
      null,

    score:
      item.semanticScore ||
      0,

    relevance:
      item.relevance ||
      null,

    centrality:
      item.centrality
        ?.level ||
      null,

    centralityScore:
      item.centrality
        ?.score ||
      0,

    applicability:
      item.applicability
        ?.level ||
      null,

    applicabilityScore:
      item.applicability
        ?.score ||
      0,

    conditionality:
      item.conditionality ||
      null
  };
}


/* ============================================================
 * 73. DEBUG MONTANT
 * ============================================================
 */

function buildAmountDebugView(
  item
) {
  if (!item) {
    return null;
  }

  return {
    value:
      item.value ||
      item.amount ||
      item.numeric ||
      null,

    role:
      item.role ||
      null,

    score:
      item.semanticScore ||
      0,

    relevance:
      item.relevance ||
      null,

    centrality:
      item.centrality
        ?.level ||
      null,

    centralityScore:
      item.centrality
        ?.score ||
      0,

    applicability:
      item.applicability
        ?.level ||
      null,

    applicabilityScore:
      item.applicability
        ?.score ||
      0,

    conditionality:
      item.conditionality ||
      null,

    conditionalAmount:
      Boolean(
        item.conditionalAmount
      ),

    rateAmount:
      Boolean(
        item.rateAmount
      ),

    explicitlyDue:
      Boolean(
        item.explicitlyDue
      )
  };
}


/* ============================================================
 * 74. DEBUG ACTION
 * ============================================================
 */

function buildActionDebugView(
  item
) {
  if (!item) {
    return null;
  }

  return {
    action:
      item.action ||
      item.text ||
      null,

    role:
      item.role ||
      null,

    target:
      item.target ||
      null,

    score:
      item.semanticScore ||
      0,

    relevance:
      item.relevance ||
      null,

    centrality:
      item.centrality
        ?.level ||
      null,

    applicability:
      item.applicability
        ?.level ||
      null,

    conditionality:
      item.conditionality ||
      null,

    consequence:
      item.consequence ||
      null,

    isRealUserAction:
      Boolean(
        item.isRealUserAction
      )
  };
}


/* ============================================================
 * 75. DEBUG PUBLIC
 * ============================================================
 */

export function debugSemanticRelevance(
  profile
) {
  if (!profile) {
    console.log(
      "[DIDOU SEMANTIC RELEVANCE V2]",
      "Profil absent."
    );

    return;
  }

  console.log(
    "[DIDOU SEMANTIC RELEVANCE V2]",
    {
      version:
        profile.version,

      confidence:
        profile.confidence,

      documentContext:
        profile.documentContext,

      primary: {
        date:
          buildDateDebugView(
            profile
              ?.primary
              ?.date
          ),

        amount:
          buildAmountDebugView(
            profile
              ?.primary
              ?.amount
          ),

        actions:
          asArray(
            profile
              ?.primary
              ?.actions
          )
            .map(
              buildActionDebugView
            )
      },

      dates: {
        important:
          asArray(
            profile
              ?.dates
              ?.important
          )
            .map(
              buildDateDebugView
            ),

        secondary:
          asArray(
            profile
              ?.dates
              ?.secondary
          )
            .map(
              buildDateDebugView
            ),

        ignored:
          asArray(
            profile
              ?.dates
              ?.ignored
          )
            .map(
              buildDateDebugView
            )
      },

      amounts: {
        important:
          asArray(
            profile
              ?.amounts
              ?.important
          )
            .map(
              buildAmountDebugView
            ),

        secondary:
          asArray(
            profile
              ?.amounts
              ?.secondary
          )
            .map(
              buildAmountDebugView
            ),

        ignored:
          asArray(
            profile
              ?.amounts
              ?.ignored
          )
            .map(
              buildAmountDebugView
            )
      },

      actions: {
        user:
          asArray(
            profile
              ?.actions
              ?.user
          )
            .map(
              buildActionDebugView
            ),

        ignored:
          asArray(
            profile
              ?.actions
              ?.ignored
          )
            .map(
              buildActionDebugView
            )
      },

      diagnostics:
        profile.diagnostics
    }
  );
}


/* ============================================================
 * 76. EXPORT DEFAULT
 * ============================================================
 */

export default {
  buildSemanticRelevanceProfile,
  debugSemanticRelevance
};


/* ============================================================
 * FIN — DIDOU SEMANTIC RELEVANCE ENGINE V2
 * ============================================================
 */
