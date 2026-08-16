/**
 * Pipeline Didou A→H
 *
 * A — Normalisation
 * B — Détection
 * C — Extraction
 * D — Interprétation
 * E — Didou Brain
 * F — Adaptateur métier Legacy
 * G — Fusion Brain + Legacy
 * H — Explication utilisateur
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

import {
  runBrain
} from "./brain/index.js";

import {
  fuseBrainAndAdapted
} from "./brain/fusion.js";

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
   * Le Brain travaille en parallèle.
   *
   * IMPORTANT :
   * une erreur du Brain ne doit jamais empêcher
   * Didou Legacy de produire un résultat.
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
   * F — ADAPTATEUR MÉTIER LEGACY
   * =====================================================
   *
   * Facture / AG / fiscal / générique...
   *
   * Cette couche reste notre filet de sécurité.
   */

  const adaptedLegacy =
    runFamilyAdapter({
      text,

      lines:
        normalized.lines,

      extraction,

      detection,

      fileName:
        input.fileName ||
        null
    });

  /*
   * =====================================================
   * G — FUSION BRAIN + LEGACY
   * =====================================================
   *
   * La Fusion V2 est volontairement prudente.
   *
   * Si elle plante :
   * retour automatique au résultat Legacy.
   */

  let adapted =
    adaptedLegacy;

  let fusionApplied =
    false;

  let fusionError =
    null;

  try {
    adapted =
      fuseBrainAndAdapted({
        brain,

        adapted:
          adaptedLegacy,

        detection
      });

    fusionApplied =
      Boolean(
        brain
      );
  } catch (error) {
    console.error(
      "DIDOU_FUSION_ERROR",
      error
    );

    fusionError =
      error?.message ||
      String(error);

    adapted =
      adaptedLegacy;

    fusionApplied =
      false;
  }

  /*
   * =====================================================
   * H — EXPLICATION UTILISATEUR
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
   * DIAGNOSTIC
   * =====================================================
   */

  const brainDiagnostics =
    buildBrainDiagnostics({
      brain,
      adaptedLegacy,
      adapted,
      detection,
      fusionApplied,
      fusionError
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
      adapted.documentType ||
      detection.documentType ||
      null,

    understandingLevel:
      adapted.understandingLevel ||
      detection.understandingLevel ||
      "partial",

    confidence:
      adapted.confidence ??
      detection.confidence ??
      0,

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
     * Conservé pour diagnostic et future IA locale.
     *
     * Ton interface peut l'ignorer.
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

      brainEnabled:
        Boolean(brain),

      brainScore:
        brain?.score?.global ??
        null,

      fusionEnabled:
        true,

      fusionApplied,

      fusionError,

      brainDiagnostics
    }
  };
}

/**
 * =====================================================
 * DIAGNOSTIC BRAIN / LEGACY / FUSION
 * =====================================================
 */

function buildBrainDiagnostics({
  brain,
  adaptedLegacy,
  adapted,
  detection,
  fusionApplied,
  fusionError
}) {
  if (!brain) {
    return {
      enabled:
        false,

      fusionApplied:
        false,

      fusionError:
        fusionError ||
        null,

      status:
        "brain_unavailable",

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

  compareDiagnosticField({
    field:
      "documentType",

    brain:
      brain?.document?.type,

    legacy:
      adaptedLegacy?.documentType ||
      detection?.documentType,

    result:
      adapted?.documentType,

    output:
      disagreements
  });

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  compareDiagnosticField({
    field:
      "issuer",

    brain:
      brain?.issuer,

    legacy:
      adaptedLegacy?.issuer,

    result:
      adapted?.issuer,

    output:
      disagreements
  });

  /*
   * =====================================================
   * MONTANT
   * =====================================================
   */

  const brainAmount =
    pickDiagnosticBrainAmount(
      brain
    );

  compareDiagnosticField({
    field:
      "mainAmount",

    brain:
      brainAmount?.value ||
      null,

    legacy:
      adaptedLegacy?.mainAmount
        ?.value ||
      null,

    result:
      adapted?.mainAmount
        ?.value ||
      null,

    output:
      disagreements
  });

  /*
   * =====================================================
   * DATE
   * =====================================================
   */

  const brainDate =
    pickDiagnosticBrainDate(
      brain
    );

  compareDiagnosticField({
    field:
      "mainDate",

    brain:
      brainDate?.value ||
      null,

    legacy:
      adaptedLegacy?.mainDate
        ?.date ||
      null,

    result:
      adapted?.mainDate
        ?.date ||
      null,

    output:
      disagreements
  });

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    enabled:
      true,

    fusionApplied:
      Boolean(
        fusionApplied
      ),

    fusionError:
      fusionError ||
      null,

    status:
      fusionError
        ? "fusion_fallback"
        : disagreements.length
          ? "disagreement"
          : "consistent",

    score:
      brain?.score ||
      null,

    situation:
      brain?.situation ||
      null,

    contradictions:
      brain?.contradictions ||
      [],

    disagreements
  };
}

/**
 * =====================================================
 * COMPARAISON DIAGNOSTIQUE
 * =====================================================
 */

function compareDiagnosticField({
  field,
  brain,
  legacy,
  result,
  output
}) {
  const brainValue =
    normalizeComparable(
      brain
    );

  const legacyValue =
    normalizeComparable(
      legacy
    );

  const resultValue =
    normalizeComparable(
      result
    );

  /*
   * Aucun désaccord intéressant.
   */
  if (
    !brainValue &&
    !legacyValue
  ) {
    return;
  }

  if (
    brainValue ===
    legacyValue
  ) {
    return;
  }

  output.push({
    field,

    brain:
      brain ||
      null,

    legacy:
      legacy ||
      null,

    result:
      result ||
      null,

    changedByFusion:
      Boolean(
        resultValue &&
        resultValue !==
          legacyValue
      )
  });
}

/**
 * =====================================================
 * MEILLEUR MONTANT BRAIN
 * =====================================================
 */

function pickDiagnosticBrainAmount(
  brain
) {
  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  return (
    amounts
      .filter(
        (amount) =>
          amount?.verified ===
            true &&
          amount?.userRelevant ===
            true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
}

/**
 * =====================================================
 * MEILLEURE DATE BRAIN
 * =====================================================
 */

function pickDiagnosticBrainDate(
  brain
) {
  const dates =
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : [];

  return (
    dates
      .filter(
        (date) =>
          date?.verified ===
            true &&
          date?.userRelevant ===
            true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
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
      ""
    )
    .replace(
      /,/g,
      "."
    )
    .trim();
}
/**
 * Pipeline Didou A→H
 *
 * A — Normalisation
 * B — Détection
 * C — Extraction
 * D — Interprétation
 * E — Didou Brain
 * F — Adaptateur métier Legacy
 * G — Fusion Brain + Legacy
 * H — Explication utilisateur
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

import {
  runBrain
} from "./brain/index.js";

import {
  fuseBrainAndAdapted
} from "./brain/fusion.js";

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
   * Le Brain travaille en parallèle.
   *
   * IMPORTANT :
   * une erreur du Brain ne doit jamais empêcher
   * Didou Legacy de produire un résultat.
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
   * F — ADAPTATEUR MÉTIER LEGACY
   * =====================================================
   *
   * Facture / AG / fiscal / générique...
   *
   * Cette couche reste notre filet de sécurité.
   */

  const adaptedLegacy =
    runFamilyAdapter({
      text,

      lines:
        normalized.lines,

      extraction,

      detection,

      fileName:
        input.fileName ||
        null
    });

  /*
   * =====================================================
   * G — FUSION BRAIN + LEGACY
   * =====================================================
   *
   * La Fusion V2 est volontairement prudente.
   *
   * Si elle plante :
   * retour automatique au résultat Legacy.
   */

  let adapted =
    adaptedLegacy;

  let fusionApplied =
    false;

  let fusionError =
    null;

  try {
    adapted =
      fuseBrainAndAdapted({
        brain,

        adapted:
          adaptedLegacy,

        detection
      });

    fusionApplied =
      Boolean(
        brain
      );
  } catch (error) {
    console.error(
      "DIDOU_FUSION_ERROR",
      error
    );

    fusionError =
      error?.message ||
      String(error);

    adapted =
      adaptedLegacy;

    fusionApplied =
      false;
  }

  /*
   * =====================================================
   * H — EXPLICATION UTILISATEUR
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
   * DIAGNOSTIC
   * =====================================================
   */

  const brainDiagnostics =
    buildBrainDiagnostics({
      brain,
      adaptedLegacy,
      adapted,
      detection,
      fusionApplied,
      fusionError
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
      adapted.documentType ||
      detection.documentType ||
      null,

    understandingLevel:
      adapted.understandingLevel ||
      detection.understandingLevel ||
      "partial",

    confidence:
      adapted.confidence ??
      detection.confidence ??
      0,

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
     * Conservé pour diagnostic et future IA locale.
     *
     * Ton interface peut l'ignorer.
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

      brainEnabled:
        Boolean(brain),

      brainScore:
        brain?.score?.global ??
        null,

      fusionEnabled:
        true,

      fusionApplied,

      fusionError,

      brainDiagnostics
    }
  };
}

/**
 * =====================================================
 * DIAGNOSTIC BRAIN / LEGACY / FUSION
 * =====================================================
 */

function buildBrainDiagnostics({
  brain,
  adaptedLegacy,
  adapted,
  detection,
  fusionApplied,
  fusionError
}) {
  if (!brain) {
    return {
      enabled:
        false,

      fusionApplied:
        false,

      fusionError:
        fusionError ||
        null,

      status:
        "brain_unavailable",

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

  compareDiagnosticField({
    field:
      "documentType",

    brain:
      brain?.document?.type,

    legacy:
      adaptedLegacy?.documentType ||
      detection?.documentType,

    result:
      adapted?.documentType,

    output:
      disagreements
  });

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  compareDiagnosticField({
    field:
      "issuer",

    brain:
      brain?.issuer,

    legacy:
      adaptedLegacy?.issuer,

    result:
      adapted?.issuer,

    output:
      disagreements
  });

  /*
   * =====================================================
   * MONTANT
   * =====================================================
   */

  const brainAmount =
    pickDiagnosticBrainAmount(
      brain
    );

  compareDiagnosticField({
    field:
      "mainAmount",

    brain:
      brainAmount?.value ||
      null,

    legacy:
      adaptedLegacy?.mainAmount
        ?.value ||
      null,

    result:
      adapted?.mainAmount
        ?.value ||
      null,

    output:
      disagreements
  });

  /*
   * =====================================================
   * DATE
   * =====================================================
   */

  const brainDate =
    pickDiagnosticBrainDate(
      brain
    );

  compareDiagnosticField({
    field:
      "mainDate",

    brain:
      brainDate?.value ||
      null,

    legacy:
      adaptedLegacy?.mainDate
        ?.date ||
      null,

    result:
      adapted?.mainDate
        ?.date ||
      null,

    output:
      disagreements
  });

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    enabled:
      true,

    fusionApplied:
      Boolean(
        fusionApplied
      ),

    fusionError:
      fusionError ||
      null,

    status:
      fusionError
        ? "fusion_fallback"
        : disagreements.length
          ? "disagreement"
          : "consistent",

    score:
      brain?.score ||
      null,

    situation:
      brain?.situation ||
      null,

    contradictions:
      brain?.contradictions ||
      [],

    disagreements
  };
}

/**
 * =====================================================
 * COMPARAISON DIAGNOSTIQUE
 * =====================================================
 */

function compareDiagnosticField({
  field,
  brain,
  legacy,
  result,
  output
}) {
  const brainValue =
    normalizeComparable(
      brain
    );

  const legacyValue =
    normalizeComparable(
      legacy
    );

  const resultValue =
    normalizeComparable(
      result
    );

  /*
   * Aucun désaccord intéressant.
   */
  if (
    !brainValue &&
    !legacyValue
  ) {
    return;
  }

  if (
    brainValue ===
    legacyValue
  ) {
    return;
  }

  output.push({
    field,

    brain:
      brain ||
      null,

    legacy:
      legacy ||
      null,

    result:
      result ||
      null,

    changedByFusion:
      Boolean(
        resultValue &&
        resultValue !==
          legacyValue
      )
  });
}

/**
 * =====================================================
 * MEILLEUR MONTANT BRAIN
 * =====================================================
 */

function pickDiagnosticBrainAmount(
  brain
) {
  const amounts =
    Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : [];

  return (
    amounts
      .filter(
        (amount) =>
          amount?.verified ===
            true &&
          amount?.userRelevant ===
            true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
}

/**
 * =====================================================
 * MEILLEURE DATE BRAIN
 * =====================================================
 */

function pickDiagnosticBrainDate(
  brain
) {
  const dates =
    Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : [];

  return (
    dates
      .filter(
        (date) =>
          date?.verified ===
            true &&
          date?.userRelevant ===
            true
      )
      .sort(
        (a, b) =>
          Number(
            b?.confidence || 0
          ) -
          Number(
            a?.confidence || 0
          )
      )[0] ||
    null
  );
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
      ""
    )
    .replace(
      /,/g,
      "."
    )
    .trim();
}
