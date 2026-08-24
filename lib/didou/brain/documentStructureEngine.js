/**
 * =====================================================
 * DIDOU — DOCUMENT STRUCTURE ENGINE V1
 * =====================================================
 *
 * Objectif :
 * détecter les blocs / sous-documents d'un PDF multi-pages
 * sans encore influencer la décision finale.
 *
 * Mode actuel :
 * DIAGNOSTIC UNIQUEMENT.
 */

export function buildDocumentStructure({
  pages = [],
  documentType = null
} = {}) {
  const normalizedPages =
    Array.isArray(pages)
      ? pages
          .map(normalizePage)
          .filter(Boolean)
      : [];

  const classifiedPages =
    normalizedPages.map(
      (page) =>
        classifyPage({
          page,
          documentType
        })
    );

  const segments =
    groupConsecutivePages(
      classifiedPages
    );

  return {
    version:
      "document-structure-v1",

    pageCount:
      normalizedPages.length,

    primaryDocumentType:
      documentType ||
      null,

    pages:
      classifiedPages,

    segments,

    diagnostics: {
      segmentCount:
        segments.length,

      annexPageCount:
        classifiedPages.filter(
          (page) =>
            page.role === "annex"
        ).length,

      primaryPageCount:
        classifiedPages.filter(
          (page) =>
            page.role === "primary"
        ).length
    }
  };
}


/**
 * =====================================================
 * NORMALISATION PAGE
 * =====================================================
 */

function normalizePage(
  page
) {
  const text =
    cleanText(
      page?.text
    );

  if (!text) {
    return null;
  }

  return {
    page:
      Number(
        page?.page ||
        page?.pageNumber ||
        0
      ) || null,

    text,

    source:
      page?.source ||
      null,

    uncertain:
      Boolean(
        page?.uncertain
      )
  };
}


/**
 * =====================================================
 * CLASSIFICATION PAGE
 * =====================================================
 */

function classifyPage({
  page,
  documentType
}) {
  const text =
    normalizeText(
      page.text
    );

  const type =
    normalizeText(
      documentType
    );

  /*
   * =====================================================
   * SIGNAUX
   * =====================================================
   *
   * On détecte d'abord tous les signaux.
   * Ensuite seulement on décide.
   *
   * Cela évite qu'un simple mot comme "devis" ou "pouvoir"
   * écrase une convocation clairement identifiée.
   */

  const signals = {
    convocation:
      containsAny(text, [
        "convocation assemblee generale",
        "assemblee generale ordinaire",
        "nous vous invitons a participer",
        "nous vous invitons a participer a l'assemblee generale",
        "elle se tiendra le"
      ]),

    agenda:
      containsAny(text, [
        "ordre du jour",
        "projets de resolutions",
        "projet de resolution",
        "resolutions soumises"
      ]),

    resolutions:
      containsAny(text, [
        "projets de resolutions",
        "resolution 1",
        "resolution 2",
        "apres en avoir delibere",
        "l'assemblee generale approuve",
        "l'assemblee generale decide"
      ]),

    postalVote:
      containsAny(text, [
        "formulaire de vote par correspondance",
        "vote par correspondance",
        "intention de vote",
        "pour* contre* abstention*",
        "cocher la case correspondante"
      ]),

    proxy:
      containsAny(text, [
        "p o u v o i r",
        "donne, par le present, tous pouvoirs",
        "donne pouvoir a",
        "bon pour pouvoir"
      ]),

    financial:
      containsAny(text, [
        "releve de compte",
        "charges de copropriete",
        "charges courantes",
        "decompte de charges",
        "avance tresorerie"
      ]),

    commercial:
      containsAny(text, [
        "bon pour accord",
        "conditions generales de vente",
        "total ttc",
        "devis n°",
        "devis numero",
        "facture n°",
        "facture numero"
      ]),

    legal:
      containsAny(text, [
        "rappel des dispositions legales",
        "rappel des dispositions legales et reglementaires",
        "mentions legales"
      ])
  };


  /*
   * =====================================================
   * PRIORITE 1 — CONVOCATION
   * =====================================================
   *
   * Une vraie convocation reste le document principal,
   * même si elle énumère des devis, pouvoirs, annexes,
   * formulaires ou pièces jointes.
   */

  if (
    signals.convocation
  ) {
    return makeClassification({
      page,
      role:
        "primary",
      subDocumentType:
        "meeting-convocation",
      confidence:
        type.includes("assemblee")
          ? 98
          : 95,
      reasons: [
        "meeting-convocation-signals",
        ...(type.includes("assemblee")
          ? [
              "matches-global-document-type"
            ]
          : [])
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 2 — FORMULAIRE DE VOTE
   * =====================================================
   */

  if (
    signals.postalVote
  ) {
    return makeClassification({
      page,
      role:
        "supporting",
      subDocumentType:
        "postal-vote-form",
      confidence:
        92,
      reasons: [
        "postal-vote-signals"
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 3 — POUVOIR
   * =====================================================
   *
   * Signaux volontairement stricts.
   * Le simple mot "pouvoir" ne suffit plus.
   */

  if (
    signals.proxy
  ) {
    return makeClassification({
      page,
      role:
        "supporting",
      subDocumentType:
        "proxy-form",
      confidence:
        92,
      reasons: [
        "proxy-signals"
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 4 — ORDRE DU JOUR / RESOLUTIONS
   * =====================================================
   *
   * Ces pages appartiennent au coeur documentaire d'une AG.
   * Ce ne sont pas de simples annexes parasites.
   */

  if (
    signals.agenda ||
    signals.resolutions
  ) {
    return makeClassification({
      page,
      role:
        "primary",
      subDocumentType:
        signals.resolutions
          ? "meeting-resolutions"
          : "meeting-agenda",
      confidence:
        signals.agenda &&
        signals.resolutions
          ? 95
          : 88,
      reasons: [
        ...(signals.agenda
          ? [
              "meeting-agenda-signals"
            ]
          : []),

        ...(signals.resolutions
          ? [
              "meeting-resolution-signals"
            ]
          : [])
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 5 — DOCUMENT COMPTABLE
   * =====================================================
   */

  if (
    signals.financial
  ) {
    return makeClassification({
      page,
      role:
        "annex",
      subDocumentType:
        "financial-annex",
      confidence:
        88,
      reasons: [
        "financial-signals"
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 6 — DOCUMENT COMMERCIAL
   * =====================================================
   *
   * On n'utilise volontairement plus le simple mot "devis".
   * Une résolution peut parler d'un devis sans être elle-même
   * un devis.
   */

  if (
    signals.commercial
  ) {
    return makeClassification({
      page,
      role:
        "annex",
      subDocumentType:
        "commercial-annex",
      confidence:
        85,
      reasons: [
        "commercial-document-signals"
      ]
    });
  }


  /*
   * =====================================================
   * PRIORITE 7 — REFERENCE JURIDIQUE
   * =====================================================
   */

  if (
    signals.legal
  ) {
    return makeClassification({
      page,
      role:
        "supporting",
      subDocumentType:
        "legal-reference",
      confidence:
        80,
      reasons: [
        "legal-reference-signals"
      ]
    });
  }


  /*
   * =====================================================
   * AUCUNE CLASSIFICATION FIABLE
   * =====================================================
   *
   * Important :
   * on préfère UNKNOWN à une mauvaise classification.
   */

  return makeClassification({
    page,
    role:
      "unknown",
    subDocumentType:
      null,
    confidence:
      40,
    reasons: []
  });
}

/**
 * =====================================================
 * REGROUPEMENT DE PAGES CONSECUTIVES
 * =====================================================
 */
function makeClassification({
  page,
  role,
  subDocumentType,
  confidence,
  reasons = []
}) {
  return {
    ...page,

    role:
      role ||
      "unknown",

    subDocumentType:
      subDocumentType ||
      null,

    confidence:
      clamp(
        confidence
      ),

    reasons:
      Array.isArray(reasons)
        ? reasons
        : []
  };
}
function groupConsecutivePages(
  pages
) {
  const result = [];

  let current =
    null;

  for (
    const page
    of pages
  ) {
    const key =
      `${page.role}|${page.subDocumentType || "unknown"}`;

    if (
      !current ||
      current.key !== key
    ) {
      current = {
        key,

        role:
          page.role,

        subDocumentType:
          page.subDocumentType,

        startPage:
          page.page,

        endPage:
          page.page,

        pages: [
          page.page
        ],

        confidence:
          page.confidence
      };

      result.push(
        current
      );

      continue;
    }

    current.endPage =
      page.page;

    current.pages.push(
      page.page
    );

    current.confidence =
      Math.max(
        current.confidence,
        page.confidence
      );
  }

  return result.map(
    ({
      key,
      ...segment
    }) =>
      segment
  );
}


/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function containsAny(
  text,
  patterns = []
) {
  return patterns.some(
    (pattern) =>
      text.includes(
        normalizeText(
          pattern
        )
      )
  );
}


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


function cleanText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function clamp(
  value,
  min = 0,
  max = 100
) {
  return Math.max(
    min,
    Math.min(
      max,
      Number(
        value || 0
      )
    )
  );
}
