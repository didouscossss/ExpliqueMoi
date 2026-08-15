/**
 * Pipeline Didou A→G
 *
 * A — Normalisation
 * B — Détection
 * C — Extraction
 * D — Interprétation
 * E — Didou Brain (mode observation)
 * F — Adaptateur métier
 * G — Explication utilisateur
 *
 * 100 % local.
 * Aucun LLM distant.
 */

import {
  emptyDidouResult,
  DIDOU_ENGINE,
  DIDOU_VERSION
} from "./types.js";

import {
  normalizeDocumentText
} from "./normalize/text.js";

import {
  extractGenericSignals
} from "./extract/index.js";

import {
  detectDocumentFamily
} from "./detect/family.js";

import {
  interpretExtraction
} from "./interpret/roles.js";

import {
  runFamilyAdapter
} from "./adapters/index.js";

import {
  buildUserFacingExplanation
} from "./explain/userSummary.js";

/**
 * Didou Brain.
 *
 * IMPORTANT :
 * pour le moment le Brain fonctionne en parallèle.
 * Il observe et vérifie mais ne remplace
 * aucune décision des adaptateurs.
 */
import {
  runBrain
} from "./brain/index.js";

/**
 * @param {{
 *   text?: string,
 *   pastedText?: string,
 *   pages?: Array<{
 *     page?: number,
 *     text?: string
 *   }>,
 *   fileName?: string|null
 * }} input
 */
export function runDidouPipeline(
  input = {}
) {
  /*
   * =====================================================
   * A — NORMALISATION
   * =====================================================
   */

  const normalized =
    normalizeDocumentText(
      input
    );

  const text =
    normalized.text;

  /*
   * =====================================================
   * DOCUMENT ILLISIBLE
   * =====================================================
   */

  if (
    !text ||
    text
      .replace(
        /\s+/g,
        ""
      )
      .length < 12
  ) {
    return emptyDidouResult({
      understandingLevel:
        "extraction",

      confidence:
        5,

      warnings: [
        "Aucun texte exploitable n’a pu être extrait localement (PDF scanné sans couche texte ou image sans OCR)."
      ],

      uncertainties: [
        "Didou n’a pas pu lire le contenu. Ajoutez un PDF avec texte sélectionnable ou collez le texte."
      ],

      userSummary: {
        document_label:
          "Document illisible localement",

        one_sentence:
          "C’est un document dont le texte n’a pas pu être extrait localement.",

        important_points:
          []
      },

      attentionLevel:
        "uncertain"
    });
  }

  /*
   * =====================================================
   * C — EXTRACTION GÉNÉRIQUE
   * =====================================================
   */

  const rawExtraction =
    extractGenericSignals(
      text
    );

  /*
   * =====================================================
   * B — DÉTECTION DOCUMENTAIRE
   * =====================================================
   */

  const detection =
    detectDocumentFamily({
      text,

      lines:
        normalized.lines,

      extraction:
        rawExtraction
    });

  /*
   * =====================================================
   * D — INTERPRÉTATION DES RÔLES
   * =====================================================
   */

  const extraction =
    interpretExtraction(
      rawExtraction,
      {
        family:
          detection.family,

        documentType:
          detection.documentType
      }
    );

  /*
   * =====================================================
   * E — DIDOU BRAIN
   * =====================================================
   *
   * MODE OBSERVATION.
   *
   * Le Brain analyse le même document mais
   * ne modifie PAS encore les résultats.
   *
   * S'il plante, Didou classique continue.
   */

  let brain =
    null;

  try {
    brain =
      runBrain({
        text,
        extraction,
        detection
      });
  } catch (error) {
    console.error(
      "DIDOU_BRAIN_ERROR",
      error
    );

    brain =
      null;
  }

  /*
   * =====================================================
   * F — ADAPTATEUR MÉTIER
   * =====================================================
   *
   * IMPORTANT :
   *
   * Pas de fusion ici pour le moment.
   *
   * invoice.js / condoMeeting.js / taxLiasse.js
   * restent responsables du résultat principal.
   */

  const adapted =
    runFamilyAdapter({
      text,

      lines:
        normalized.lines,

      extraction,

      detection,

      /*
       * On peut déjà transmettre brain.
       *
       * Les adaptateurs existants l'ignorent
       * s'ils n'en ont pas besoin.
       */
      brain,

      fileName:
        input.fileName ||
        null
    });

  /*
   * =====================================================
   * G — EXPLICATION UTILISATEUR
   * =====================================================
   */

  const userSummary =
    buildUserFacingExplanation(
      adapted
    );

  /*
   * =====================================================
   * RÉFÉRENCES
   * =====================================================
   */

  const references =
    extraction?.entities
      ?.references ||
    [];

  /*
   * =====================================================
   * DIAGNOSTIC DU BRAIN
   * =====================================================
   *
   * Diagnostic seulement.
   *
   * Ne modifie rien dans le résultat utilisateur.
   */

  const brainDiagnostics =
    buildBrainDiagnostics({
      brain,
      adapted,
      detection
    });

  /*
   * =====================================================
   * RÉSULTAT FINAL
   * =====================================================
   */

  return {
    engine:
      DIDOU_ENGINE,

    version:
      DIDOU_VERSION,

    /*
     * -----------------------------------------------------
     * TYPE / COMPRÉHENSION
     * -----------------------------------------------------
     */

    family:
      adapted.family ||
      detection.family,

    documentType:
      adapted.documentType,

    understandingLevel:
      adapted.understandingLevel ||
      detection.understandingLevel,

    confidence:
      adapted.confidence ??
      detection.confidence,

    /*
     * -----------------------------------------------------
     * ACTEURS
     * -----------------------------------------------------
     */

    issuer:
      adapted.issuer ||
      null,

    recipient:
      adapted.recipient ||
      null,

    /*
     * -----------------------------------------------------
     * FAITS PRINCIPAUX
     * -----------------------------------------------------
     */

    mainDate:
      adapted.mainDate ||
      null,

    mainAmount:
      adapted.mainAmount ||
      null,

    importantFacts:
      adapted.importantFacts ||
      [],

    /*
     * -----------------------------------------------------
     * ACTIONS / ÉCHÉANCES
     * -----------------------------------------------------
     */

    actions:
      adapted.actions ||
      [],

    deadlines:
      adapted.deadlines ||
      [],

    /*
     * -----------------------------------------------------
     * RÉFÉRENCES / ENTITÉS
     * -----------------------------------------------------
     */

    references,

    entities: {
      people:
        extraction?.entities
          ?.people ||
        [],

      organizations:
        extraction?.entities
          ?.organizations ||
        [],

      addresses:
        extraction?.entities
          ?.addresses ||
        [],

      contacts:
        []
    },

    /*
     * -----------------------------------------------------
     * TABLEAUX
     * -----------------------------------------------------
     */

    tables:
      adapted.tables ||
      [],

    /*
     * -----------------------------------------------------
     * PREUVES
     * -----------------------------------------------------
     */

    evidence:
      adapted.evidence ||
      [],

    /*
     * -----------------------------------------------------
     * AVERTISSEMENTS
     * -----------------------------------------------------
     */

    warnings:
      adapted.warnings ||
      [],

    uncertainties:
      adapted.uncertainties ||
      [],

    /*
     * -----------------------------------------------------
     * RÉSUMÉ UTILISATEUR
     * -----------------------------------------------------
     */

    userSummary,

    whyReceived:
      adapted.whyReceived ||
      null,

    documentPurpose:
      adapted.documentPurpose ||
      null,

    attentionLevel:
      adapted.attentionLevel ||
      "uncertain",

    /*
     * -----------------------------------------------------
     * EXTRACTION STRUCTURÉE
     * -----------------------------------------------------
     */

    extraction: {
      dates:
        extraction?.dates ||
        [],

      amounts:
        extraction?.amounts ||
        [],

      periods:
        extraction?.periods ||
        [],

      rawSignals:
        detection?.signals ||
        []
    },

    /*
     * -----------------------------------------------------
     * DIDOU BRAIN
     * -----------------------------------------------------
     *
     * Stocké uniquement pour diagnostic / futur usage.
     *
     * L'interface n'a pas besoin de l'afficher.
     */

    brain,

    /*
     * -----------------------------------------------------
     * META
     * -----------------------------------------------------
     */

    meta: {
      charCount:
        rawExtraction.charCount,

      fileName:
        input.fileName ||
        null,

      pageCount:
        normalized.pages.length ||
        (
          text
            ? 1
            : 0
        ),

      brainDiagnostics
    }
  };
}

/**
 * =====================================================
 * DIAGNOSTIC BRAIN
 * =====================================================
 *
 * Compare le Brain à l'adaptateur sans modifier
 * le résultat.
 */
function buildBrainDiagnostics({
  brain,
  adapted,
  detection
}) {
  if (!brain) {
    return {
      enabled:
        false,

      status:
        "unavailable",

      score:
        null,

      disagreements:
        []
    };
  }

  const disagreements =
    [];

  /*
   * =====================================================
   * TYPE
   * =====================================================
   */

  const brainType =
    normalizeComparable(
      brain?.document?.type
    );

  const adaptedType =
    normalizeComparable(
      adapted?.documentType ||
      detection?.documentType
    );

  if (
    brainType &&
    adaptedType &&
    brainType !== adaptedType
  ) {
    disagreements.push({
      field:
        "documentType",

      brain:
        brain?.document?.type ||
        null,

      adapted:
        adapted?.documentType ||
        detection?.documentType ||
        null
    });
  }

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  const brainIssuer =
    normalizeComparable(
      brain?.issuer
    );

  const adaptedIssuer =
    normalizeComparable(
      adapted?.issuer
    );

  if (
    brainIssuer &&
    adaptedIssuer &&
    brainIssuer !== adaptedIssuer
  ) {
    disagreements.push({
      field:
        "issuer",

      brain:
        brain?.issuer ||
        null,

      adapted:
        adapted?.issuer ||
        null
    });
  }

  /*
   * =====================================================
   * MONTANT PRINCIPAL
   * =====================================================
   */

  const adaptedAmount =
    normalizeComparable(
      adapted?.mainAmount
        ?.value
    );

  const verifiedBrainAmounts =
    (
      brain?.amounts ||
      []
    )
      .filter(
        (amount) =>
          amount?.verified
      )
      .map(
        (amount) =>
          normalizeComparable(
            amount?.value
          )
      )
      .filter(Boolean);

  if (
    adaptedAmount &&
    verifiedBrainAmounts.length &&
    !verifiedBrainAmounts.includes(
      adaptedAmount
    )
  ) {
    disagreements.push({
      field:
        "mainAmount",

      brain:
        verifiedBrainAmounts,

      adapted:
        adapted?.mainAmount
          ?.value ||
        null
    });
  }

  /*
   * =====================================================
   * DATE PRINCIPALE
   * =====================================================
   */

  const adaptedDate =
    normalizeComparable(
      adapted?.mainDate
        ?.date
    );

  const verifiedBrainDates =
    (
      brain?.dates ||
      []
    )
      .filter(
        (date) =>
          date?.verified
      )
      .map(
        (date) =>
          normalizeComparable(
            date?.value
          )
      )
      .filter(Boolean);

  if (
    adaptedDate &&
    verifiedBrainDates.length &&
    !verifiedBrainDates.includes(
      adaptedDate
    )
  ) {
    disagreements.push({
      field:
        "mainDate",

      brain:
        verifiedBrainDates,

      adapted:
        adapted?.mainDate
          ?.date ||
        null
    });
  }

  return {
    enabled:
      true,

    status:
      disagreements.length
        ? "disagreement"
        : "consistent",

    score:
      brain?.score ||
      null,

    disagreements
  };
}

/**
 * =====================================================
 * NORMALISATION DE COMPARAISON
 * =====================================================
 */

function normalizeComparable(
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
      /\s+/g,
      " "
    )
    .trim();
}
