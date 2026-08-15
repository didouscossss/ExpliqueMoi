/**
 * Pipeline Didou A→G
 *
 * A — Normalisation
 * B — Détection
 * C — Extraction
 * D — Interprétation
 * E — Didou Brain
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

 {
  normalizeDocumentText
} from "./normalize/text.js";

 {
  extractGenericSignals
} from "./extract/index.js";

 {
  detectDocumentFamily
} from "./detect/family.js";

 {
  interpretExtraction
} from "./interpret/roles.js";

 {
  runFamilyAdapter
} from "./adapters/index.js";

 {
  buildUserFacingExplanation
} from "./explain/userSummary.js";

/*
 * NOUVEAU :
 * cerveau générique de Didou.
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
   * Pour le moment :
   *
   * le Brain fonctionne en parallèle.
   *
   * Il ne remplace PAS encore les adaptateurs.
   *
   * Cela nous permet de tester son comportement
   * sans casser Didou actuel.
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
    /*
     * Le Brain ne doit JAMAIS empêcher
     * l'analyse classique de fonctionner.
     */

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
   */

const adaptedRaw =
  runFamilyAdapter({
    text,
    lines: normalized.lines,
    extraction,
    detection,
    brain,
    fileName:
      input.fileName || null
  });

const adapted =
  fuseBrainAndAdapted({
    brain,
    adapted: adaptedRaw,
    detection
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
   */

  const brainDiagnostics =
    buildBrainDiagnostics(
      brain,
      adapted,
      detection
    );

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
     * COMPRÉHENSION ACTUELLE
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
     * ACTIONS
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
     * RÉFÉRENCES
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
     * PRUDENCE
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
     * AFFICHAGE UTILISATEUR
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
        extraction.dates ||
        [],

      amounts:
        extraction.amounts ||
        [],

      periods:
        extraction.periods ||
        [],

      rawSignals:
        detection.signals ||
        []
    },

    /*
     * -----------------------------------------------------
     * NOUVEAU : DIDOU BRAIN
     * -----------------------------------------------------
     *
     * Pour le moment il est retourné pour diagnostic.
     *
     * L'interface n'est pas obligée de l'afficher.
     *
     * Plus tard fusion.js utilisera cette structure
     * pour améliorer automatiquement le résultat.
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

      /*
       * Diagnostic non destiné directement
       * à l'utilisateur.
       */
      brainDiagnostics
    }
  };
}

/**
 * =====================================================
 * DIAGNOSTIC BRAIN VS ADAPTATEUR
 * =====================================================
 *
 * Cette fonction prépare déjà la future fusion.
 *
 * Elle détecte les divergences sans encore
 * modifier le résultat utilisateur.
 */

function buildBrainDiagnostics(
  brain,
  adapted,
  detection
) {
  if (!brain) {
    return {
      enabled:
        false,

      status:
        "unavailable",

      disagreements:
        []
    };
  }

  const disagreements =
    [];

  /*
   * =====================================================
   * TYPE DE DOCUMENT
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
    brainType !==
      adaptedType
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
    brainIssuer !==
      adaptedIssuer
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

  const brainImportantAmounts =
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
    brainImportantAmounts.length &&
    !brainImportantAmounts.includes(
      adaptedAmount
    )
  ) {
    disagreements.push({
      field:
        "mainAmount",

      brain:
        brainImportantAmounts,

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

  const brainImportantDates =
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
    brainImportantDates.length &&
    !brainImportantDates.includes(
      adaptedDate
    )
  ) {
    disagreements.push({
      field:
        "mainDate",

      brain:
        brainImportantDates,

      adapted:
        adapted?.mainDate
          ?.date ||
        null
    });
  }

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

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
import { fuseBrainAndAdapted }
from "./brain/fusion.js";
