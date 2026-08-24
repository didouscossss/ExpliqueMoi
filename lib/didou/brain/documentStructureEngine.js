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

  let role =
    "unknown";

  let subDocumentType =
    null;

  let confidence =
    40;

  const reasons = [];


  /*
   * DOCUMENT PRINCIPAL — CONVOCATION
   */

  if (
    containsAny(text, [
      "convocation assemblee generale",
      "nous vous invitons a participer",
      "assemblee generale ordinaire",
      "se tiendra le",
      "ordre du jour ci-joint"
    ])
  ) {
    role =
      "primary";

    subDocumentType =
      "meeting-convocation";

    confidence += 40;

    reasons.push(
      "meeting-convocation-signals"
    );
  }


  /*
   * ORDRE DU JOUR
   */

  if (
    containsAny(text, [
      "ordre du jour",
      "projet de resolution",
      "resolutions soumises",
      "resolution n°",
      "resolution no"
    ])
  ) {
    if (
      role !== "primary"
    ) {
      role =
        "annex";
    }

    subDocumentType =
      "meeting-agenda";

    confidence += 25;

    reasons.push(
      "meeting-agenda-signals"
    );
  }


  /*
   * VOTE PAR CORRESPONDANCE
   */

  if (
    containsAny(text, [
      "vote par correspondance",
      "formulaire de vote",
      "intention de vote",
      "cocher votre intention"
    ])
  ) {
    role =
      "annex";

    subDocumentType =
      "postal-vote-form";

    confidence += 35;

    reasons.push(
      "postal-vote-signals"
    );
  }


  /*
   * POUVOIR / PROCURATION
   */

  if (
    containsAny(text, [
      "pouvoir",
      "procuration",
      "mandat",
      "donne pouvoir"
    ])
  ) {
    role =
      "annex";

    subDocumentType =
      "proxy-form";

    confidence += 30;

    reasons.push(
      "proxy-signals"
    );
  }


  /*
   * DOCUMENT COMPTABLE
   */

  if (
    containsAny(text, [
      "releve de compte",
      "charges courantes",
      "charges de copropriete",
      "avance tresorerie",
      "cotisation fonds travaux",
      "decompte de charges"
    ])
  ) {
    role =
      "annex";

    subDocumentType =
      "financial-annex";

    confidence += 30;

    reasons.push(
      "financial-signals"
    );
  }


  /*
   * DEVIS / FACTURE
   */

  if (
    containsAny(text, [
      "devis",
      "facture",
      "bon pour accord",
      "montant total",
      "conditions generales de vente"
    ])
  ) {
    role =
      "annex";

    subDocumentType =
      "commercial-annex";

    confidence += 30;

    reasons.push(
      "commercial-document-signals"
    );
  }


  /*
   * DOCUMENT JURIDIQUE / REGLEMENTAIRE
   */

  if (
    containsAny(text, [
      "conformement a la loi",
      "en application de",
      "decret du",
      "arrete du",
      "article 54",
      "mentions legales"
    ])
  ) {
    if (
      role === "unknown"
    ) {
      role =
        "annex";
    }

    subDocumentType =
      subDocumentType ||
      "legal-reference";

    confidence += 15;

    reasons.push(
      "legal-reference-signals"
    );
  }


  /*
   * COHERENCE AVEC TYPE GLOBAL
   */

  if (
    type.includes(
      "assemblee"
    ) &&
    subDocumentType ===
      "meeting-convocation"
  ) {
    confidence += 10;

    reasons.push(
      "matches-global-document-type"
    );
  }


  confidence =
    clamp(
      confidence
    );

  return {
    ...page,

    role,
    subDocumentType,

    confidence,

    reasons
  };
}


/**
 * =====================================================
 * REGROUPEMENT DE PAGES CONSECUTIVES
 * =====================================================
 */

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
