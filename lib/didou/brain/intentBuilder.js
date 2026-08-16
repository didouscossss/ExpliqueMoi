/**
 * Didou Brain
 * Intent Builder V1
 *
 * Comprend la fonction générale du document.
 *
 * Contrairement aux événements :
 * un document peut avoir une intention claire
 * sans contenir de paiement, réunion ou échéance.
 */

export const DOCUMENT_INTENTS = {
  PROOF: "proof",
  INFORMATION: "information",
  REQUEST: "request",
  DECISION: "decision",
  PAYMENT: "payment",
  REFUND: "refund",
  MEETING: "meeting",
  DECLARATION: "declaration",
  CONTRACT: "contract",
  NOTIFICATION: "notification",
  UNKNOWN: "unknown"
};

export function buildDocumentIntent({
  text,
  brain,
  detection
} = {}) {
  const source =
    normalizeText(
      text
    );

  const candidates = [];

  /*
   * =====================================================
   * 1 — ATTESTATION / JUSTIFICATIF / CERTIFICAT
   * =====================================================
   *
   * Très important :
   * ce n'est PAS spécifique à l'assurance.
   */

  let proofScore = 0;

  if (
    /\battestation\b/.test(
      source
    )
  ) {
    proofScore += 55;
  }

  if (
    /\bcertificat\b/.test(
      source
    )
  ) {
    proofScore += 45;
  }

  if (
    /\bjustificatif\b/.test(
      source
    )
  ) {
    proofScore += 40;
  }

  if (
    /atteste que|certifie que|certifions que|nous attestons|fait foi|pour servir et valoir ce que de droit/.test(
      source
    )
  ) {
    proofScore += 40;
  }

  if (
    /est assure|est couverte|est couvert|garantit|garantie|droits ouverts|situation professionnelle/.test(
      source
    )
  ) {
    proofScore += 15;
  }

  if (
    proofScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.PROOF,

      label:
        "Attestation / justificatif",

      confidence:
        clamp(
          proofScore,
          0,
          98
        ),

      actionRequired:
        false,

      reason:
        "Le document sert principalement à certifier ou justifier une situation."
    });
  }

  /*
   * =====================================================
   * 2 — DEMANDE
   * =====================================================
   */

  let requestScore = 0;

  if (
    /nous vous demandons|merci de|veuillez|vous devez|il vous appartient de/.test(
      source
    )
  ) {
    requestScore += 55;
  }

  if (
    /transmettre|envoyer|retourner|completer|signer|fournir|joindre/.test(
      source
    )
  ) {
    requestScore += 25;
  }

  if (
    Array.isArray(
      brain?.actions
    ) &&
    brain.actions.length
  ) {
    requestScore += 20;
  }

  if (
    requestScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.REQUEST,

      label:
        "Action demandée",

      confidence:
        clamp(
          requestScore,
          0,
          98
        ),

      actionRequired:
        true,

      reason:
        "Le document demande explicitement une action au destinataire."
    });
  }

  /*
   * =====================================================
   * 3 — DÉCISION
   * =====================================================
   */

  let decisionScore = 0;

  if (
    /\bdecision\b|\bdécision\b|nous avons decide|nous avons décidé|accorde|accordée|refuse|refusée|rejete|rejetée/.test(
      source
    )
  ) {
    decisionScore += 60;
  }

  if (
    /notification de decision|notification de décision/.test(
      source
    )
  ) {
    decisionScore += 30;
  }

  if (
    decisionScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.DECISION,

      label:
        "Décision",

      confidence:
        clamp(
          decisionScore,
          0,
          98
        ),

      actionRequired:
        null,

      reason:
        "Le document communique une décision."
    });
  }

  /*
   * =====================================================
   * 4 — CONTRAT
   * =====================================================
   */

  let contractScore = 0;

  if (
    /\bcontrat\b/.test(
      source
    )
  ) {
    contractScore += 50;
  }

  if (
    /conditions particulieres|conditions générales|conditions generales|souscripteur|cocontractant/.test(
      source
    )
  ) {
    contractScore += 30;
  }

  if (
    /date d effet|date d'effet|duree du contrat|durée du contrat|resiliation|résiliation/.test(
      source
    )
  ) {
    contractScore += 20;
  }

  if (
    contractScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.CONTRACT,

      label:
        "Contrat",

      confidence:
        clamp(
          contractScore,
          0,
          98
        ),

      actionRequired:
        null,

      reason:
        "Le document définit ou confirme une relation contractuelle."
    });
  }

  /*
   * =====================================================
   * 5 — DÉCLARATION
   * =====================================================
   */

  let declarationScore = 0;

  if (
    /declaration|déclaration/.test(
      source
    )
  ) {
    declarationScore += 40;
  }

  if (
    /a declarer|à déclarer|formulaire fiscal|declaration de resultats|déclaration de résultats/.test(
      source
    )
  ) {
    declarationScore += 40;
  }

  if (
    brain?.document?.family ===
      "fiscal"
  ) {
    declarationScore += 20;
  }

  if (
    declarationScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.DECLARATION,

      label:
        "Déclaration",

      confidence:
        clamp(
          declarationScore,
          0,
          98
        ),

      actionRequired:
        null,

      reason:
        "Le document sert à déclarer ou présenter des informations."
    });
  }

  /*
   * =====================================================
   * 6 — ÉVÉNEMENTS DÉJÀ COMPRIS PAR LE BRAIN
   * =====================================================
   */

  const situation =
    brain?.situation?.type ||
    null;

  if (
    situation === "refund"
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.REFUND,

      label:
        "Remboursement",

      confidence:
        brain?.situation?.confidence ||
        80,

      actionRequired:
        false,

      reason:
        "Un remboursement constitue la situation principale du document."
    });
  }

  if (
    situation ===
      "automatic_debit" ||
    situation ===
      "payment_due"
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.PAYMENT,

      label:
        "Paiement / règlement",

      confidence:
        brain?.situation?.confidence ||
        80,

      actionRequired:
        situation ===
        "payment_due",

      reason:
        "Le document concerne principalement un règlement."
    });
  }

  if (
    situation ===
    "meeting"
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.MEETING,

      label:
        "Convocation / réunion",

      confidence:
        brain?.situation?.confidence ||
        80,

      actionRequired:
        true,

      reason:
        "Le document concerne principalement une réunion ou une convocation."
    });
  }

  /*
   * =====================================================
   * 7 — NOTIFICATION
   * =====================================================
   */

  let notificationScore = 0;

  if (
    /nous vous informons|nous vous informons que|notification|information importante/.test(
      source
    )
  ) {
    notificationScore += 50;
  }

  if (
    notificationScore > 0
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.NOTIFICATION,

      label:
        "Notification",

      confidence:
        clamp(
          notificationScore,
          0,
          90
        ),

      actionRequired:
        false,

      reason:
        "Le document vise principalement à informer le destinataire."
    });
  }

  /*
   * =====================================================
   * 8 — FALLBACK INFORMATION
   * =====================================================
   */

  if (
    brain?.document?.type ||
    detection?.documentType
  ) {
    candidates.push({
      type:
        DOCUMENT_INTENTS.INFORMATION,

      label:
        "Information",

      confidence:
        Math.min(
          Number(
            brain?.document
              ?.confidence ||
            detection?.confidence ||
            50
          ),
          75
        ),

      actionRequired:
        false,

      reason:
        "Le document est identifié mais aucune intention plus spécifique n’est suffisamment établie."
    });
  }

  /*
   * =====================================================
   * CLASSEMENT
   * =====================================================
   */

  const ranked =
    candidates
      .map(
        (candidate) => ({
          ...candidate,

          score:
            scoreIntent(
              candidate
            )
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  if (
    !ranked.length
  ) {
    return {
      type:
        DOCUMENT_INTENTS.UNKNOWN,

      label:
        "Intention inconnue",

      confidence:
        20,

      actionRequired:
        null,

      reason:
        "La fonction principale du document n’a pas été déterminée.",

      alternatives:
        []
    };
  }

  const winner =
    ranked[0];

  return {
    type:
      winner.type,

    label:
      winner.label,

    confidence:
      clamp(
        winner.score,
        0,
        98
      ),

    actionRequired:
      winner.actionRequired,

    reason:
      winner.reason,

    alternatives:
      ranked
        .slice(
          1,
          4
        )
        .map(
          (candidate) => ({
            type:
              candidate.type,

            label:
              candidate.label,

            confidence:
              clamp(
                candidate.score,
                0,
                98
              )
          })
        )
  };
}

/**
 * =====================================================
 * SCORE
 * =====================================================
 */

function scoreIntent(
  candidate
) {
  let score =
    Number(
      candidate?.confidence || 0
    );

  /*
   * Une attestation explicite est extrêmement
   * structurante et ne doit pas être battue
   * facilement par le fallback information.
   */

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.PROOF
  ) {
    score += 15;
  }

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.DECISION
  ) {
    score += 12;
  }

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.REQUEST
  ) {
    score += 10;
  }

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.INFORMATION
  ) {
    score -= 15;
  }

  return score;
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

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

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(
      value
    );

  const safe =
    Number.isFinite(
      numeric
    )
      ? numeric
      : 0;

  return Math.max(
    min,
    Math.min(
      max,
      safe
    )
  );
}
