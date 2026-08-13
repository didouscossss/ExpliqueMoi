/**
 * Frontière Document → Didoutor V2.
 *
 * Objectifs :
 * - Didoutor reçoit le contenu OCR brut du document ;
 * - Didoutor peut relire le document indépendamment ;
 * - l'analyse Didou n'est qu'un indice secondaire ;
 * - aucune regex / score interne Didou n'est exposé ;
 * - aucune analyse IA n'est effectuée ici.
 */

/**
 * @param {object} didouResult
 * @returns {object|null}
 */
export function buildDidoutorContext(
  didouResult
) {
  if (
    !didouResult ||
    typeof didouResult !== "object"
  ) {
    return null;
  }

  /*
   * =====================================================
   * 1 — DOCUMENT BRUT
   * =====================================================
   *
   * pageProvenance est construit AVANT
   * l'interprétation finale de Didou.
   *
   * Il contient le texte réellement extrait
   * du PDF / OCR image.
   */

  const provenance =
    Array.isArray(
      didouResult?.meta?.pageProvenance
    )
      ? didouResult.meta.pageProvenance
      : [];

  const pages =
    provenance
      .map(
        (item, index) => {
          const text =
            cleanRawText(
              item?.text
            );

          if (!text) {
            return null;
          }

          return {
            page:
              Number(
                item?.page
              ) ||
              index + 1,

            text,

            source:
              String(
                item?.source ||
                ""
              ) ||
              null,

            uncertain:
              item?.uncertain ===
              true
          };
        }
      )
      .filter(Boolean);

  /*
   * Texte complet du document.
   *
   * C'est CE TEXTE que Didoutor devra
   * analyser en priorité.
   */

  const rawText =
    pages
      .map(
        (page) =>
          page.text
      )
      .join("\n\n")
      .trim();

  /*
   * =====================================================
   * 2 — QUALITÉ DE LA SOURCE
   * =====================================================
   */

  const ocrUncertain =
    didouResult?.meta
      ?.ocrUncertain === true ||
    pages.some(
      (page) =>
        page.uncertain
    );

  const extractionMethods =
    Array.isArray(
      didouResult?.meta
        ?.extractionMethods
    )
      ? [
          ...didouResult
            .meta
            .extractionMethods
        ]
      : [];

  /*
   * =====================================================
   * 3 — DOCUMENT SOURCE DIDOUTOR
   * =====================================================
   *
   * Cette partie est indépendante des conclusions
   * de Didou.
   */

  const sourceDocument = {
    rawText,

    pages,

    pageCount:
      pages.length ||
      Number(
        didouResult?.meta
          ?.pageCount
      ) ||
      0,

    fileName:
      didouResult?.meta
        ?.fileName ||
      null,

    extractionMethods,

    ocrUncertain,

    hasUsableText:
      rawText.length >= 12,

    charCount:
      rawText.length
  };

  /*
   * =====================================================
   * 4 — INDICES DIDOU
   * =====================================================
   *
   * IMPORTANT :
   *
   * Didoutor ne doit PAS considérer ces données
   * comme la vérité.
   *
   * Elles servent uniquement de repères facultatifs
   * après lecture du document brut.
   */

  const didouHints = {
    sourceEngine:
      "didou",

    sourceVersion:
      didouResult.version ||
      null,

    family:
      didouResult.family ||
      null,

    documentType:
      didouResult.documentType ||
      null,

    confidence:
      didouResult.confidence ??
      null,

    understandingLevel:
      didouResult
        .understandingLevel ||
      null,

    issuer:
      didouResult.issuer ||
      null,

    recipient:
      didouResult.recipient ||
      null,

    mainDate:
      didouResult.mainDate ||
      null,

    mainAmount:
      didouResult.mainAmount ||
      null,

    importantFacts:
      safeArray(
        didouResult
          .importantFacts
      ),

    actions:
      safeArray(
        didouResult.actions
      ),

    deadlines:
      safeArray(
        didouResult.deadlines
      ),

    references:
      safeArray(
        didouResult.references
      ),

    warnings:
      safeArray(
        didouResult.warnings
      ),

    uncertainties:
      safeArray(
        didouResult
          .uncertainties
      ),

    attentionLevel:
      didouResult
        .attentionLevel ||
      null
  };

  /*
   * =====================================================
   * 5 — INSTRUCTIONS POUR DIDOUTOR
   * =====================================================
   *
   * Ces règles pourront être utilisées directement
   * par api/assist.js lors de la construction
   * du prompt système.
   */

  const analysisPolicy = {
    primarySource:
      "sourceDocument",

    didouHintsAreAuthoritative:
      false,

    rereadDocument:
      true,

    verifyAmounts:
      true,

    verifyDates:
      true,

    verifyActions:
      true,

    verifyPaymentStatus:
      true,

    allowCorrectionOfDidou:
      true,

    requireEvidence:
      true,

    refuseToInventMissingFacts:
      true
  };

  /*
   * =====================================================
   * RETOUR DIDOUTOR
   * =====================================================
   */

  return {
    version:
      "didoutor-context-v2",

    /*
     * SOURCE PRINCIPALE
     */
    sourceDocument,

    /*
     * INDICES SECONDAIRES
     */
    didouHints,

    /*
     * RÈGLES D'ANALYSE
     */
    analysisPolicy
  };
}

/**
 * =====================================================
 * NETTOYAGE TEXTE OCR
 * =====================================================
 */

function cleanRawText(
  value
) {
  return String(
    value ||
    ""
  )
    .replace(
      /\u0000/g,
      ""
    )
    .replace(
      /\r\n/g,
      "\n"
    )
    .replace(
      /\r/g,
      "\n"
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n{4,}/g,
      "\n\n\n"
    )
    .trim();
}

/**
 * =====================================================
 * TABLEAUX SÛRS
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
