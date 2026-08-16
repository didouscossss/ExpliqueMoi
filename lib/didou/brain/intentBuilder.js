/**
 * Didou Brain
 * Intent Builder V2
 *
 * Objectif :
 * comprendre la fonction générale du document.
 *
 * Exemples :
 * - proof
 * - information
 * - request
 * - decision
 * - payment
 * - refund
 * - meeting
 * - declaration
 * - contract
 * - notification
 *
 * IMPORTANT :
 * une formule de politesse n'est pas une action.
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

/**
 * =====================================================
 * POINT D'ENTRÉE
 * =====================================================
 */

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
   * 1 — PREUVE / ATTESTATION / JUSTIFICATIF
   * =====================================================
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
    /est assure|est assuree|est couvert|est couverte|garantit|garantie|droits ouverts|situation professionnelle/.test(
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
   * 2 — DEMANDE / ACTION UTILISATEUR
   * =====================================================
   *
   * IMPORTANT :
   * on ne considère plus "merci de" seul comme une demande.
   */

  let requestScore = 0;

  if (
    /nous vous demandons|veuillez|vous devez|il vous appartient de|il vous est demande|il vous est demandé/.test(
      source
    )
  ) {
    requestScore += 55;
  }

  /*
   * "Merci de" n'est une demande que si un vrai
   * verbe d'action suit.
   *
   * OK :
   * "Merci de nous transmettre le document"
   *
   * NON :
   * "Merci de votre confiance"
   */

  if (
    /merci de\s+(?:bien\s+)?(?:nous\s+)?(?:transmettre|envoyer|retourner|completer|compléter|signer|fournir|joindre|repondre|répondre|regler|régler|payer|confirmer|contacter|appeler|participer|voter)/.test(
      source
    )
  ) {
    requestScore += 40;
  }

  /*
   * Autres verbes d'action.
   */

  if (
    /transmettre|envoyer|retourner|completer|compléter|signer|fournir|joindre|repondre|répondre|regler|régler|payer|confirmer|contacter|appeler|participer|voter/.test(
      source
    )
  ) {
    requestScore += 15;
  }

  /*
   * Actions déjà extraites.
   *
   * On ne donne qu'un petit bonus.
   * Une mauvaise extraction ne doit pas suffire
   * à transformer tout le document en demande.
   */

  const meaningfulActions =
    Array.isArray(
      brain?.actions
    )
      ? brain.actions.filter(
          (action) =>
            isMeaningfulAction(
              action?.action
            )
        )
      : [];

  if (
    meaningfulActions.length
  ) {
    requestScore +=
      Math.min(
        20,
        meaningfulActions.length * 8
      );
  }

  /*
   * Une attestation forte doit résister
   * aux faux signaux de demande.
   */

  if (
    proofScore >= 70 &&
    requestScore < 80
  ) {
    requestScore -= 35;
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
    /\bdecision\b|nous avons decide|accorde|accordee|refuse|refusee|rejete|rejetee/.test(
      source
    )
  ) {
    decisionScore += 60;
  }

  if (
    /notification de decision/.test(
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
    /conditions particulieres|conditions generales|souscripteur|cocontractant/.test(
      source
    )
  ) {
    contractScore += 30;
  }

  if (
    /date d effet|duree du contrat|resiliation/.test(
      source
    )
  ) {
    contractScore += 20;
  }

  /*
   * IMPORTANT :
   *
   * Une attestation d'assurance peut contenir :
   * - numéro de contrat
   * - souscripteur
   * - conditions particulières
   *
   * sans être elle-même un contrat.
   */

  if (
    proofScore >= 55
  ) {
    contractScore -= 40;
  }

  if (
    proofScore >= 85
  ) {
    contractScore -= 20;
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
    /declaration/.test(
      source
    )
  ) {
    declarationScore += 40;
  }

  if (
    /a declarer|formulaire fiscal|declaration de resultats/.test(
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
   * 6 — ÉVÉNEMENTS COMPRIS PAR LE BRAIN
   * =====================================================
   */

  const situation =
    brain?.situation?.type ||
    null;

  /*
   * Remboursement.
   */

  if (
    situation ===
    "refund"
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

  /*
   * Paiement / prélèvement.
   */

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

  /*
   * Réunion / convocation.
   */

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
   * 7 — NOTIFICATION / INFORMATION
   * =====================================================
   */

  let notificationScore = 0;

  if (
    /nous vous informons|notification|information importante/.test(
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
            scoreIntent({
              candidate,
              proofScore,
              requestScore,
              contractScore
            })
        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  /*
   * =====================================================
   * AUCUNE INTENTION
   * =====================================================
   */

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

  /*
   * =====================================================
   * GAGNANT
   * =====================================================
   */

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
 * SCORE D'INTENTION
 * =====================================================
 */

function scoreIntent({
  candidate,
  proofScore,
  requestScore,
  contractScore
}) {
  let score =
    Number(
      candidate?.confidence || 0
    );

  /*
   * ===================================================
   * PREUVE
   * ===================================================
   */

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.PROOF
  ) {
    score += 20;

    if (
      proofScore >= 90
    ) {
      score += 10;
    }
  }

  /*
   * ===================================================
   * DÉCISION
   * ===================================================
   */

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.DECISION
  ) {
    score += 12;
  }

  /*
   * ===================================================
   * REQUEST
   * ===================================================
   */

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.REQUEST
  ) {
    /*
     * Une vraie demande explicite est importante.
     */
    if (
      requestScore >= 70
    ) {
      score += 10;
    }

    /*
     * Mais une attestation forte doit rester prioritaire
     * face à une demande faible ou parasite.
     */
    if (
      proofScore >= 70 &&
      requestScore < 80
    ) {
      score -= 25;
    }
  }

  /*
   * ===================================================
   * CONTRAT
   * ===================================================
   */

  if (
    candidate?.type ===
    DOCUMENT_INTENTS.CONTRACT
  ) {
    /*
     * Contrat clairement structuré.
     */
    if (
      contractScore >= 75
    ) {
      score += 8;
    }

    /*
     * Attestation forte :
     * le contrat devient secondaire.
     */
    if (
      proofScore >= 70
    ) {
      score -= 20;
    }
  }

  /*
   * ===================================================
   * INFORMATION
   * ===================================================
   */

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
 * ACTION RÉELLE ?
 * =====================================================
 */

function isMeaningfulAction(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (!text) {
    return false;
  }

  /*
   * Formules de politesse.
   */

  if (
    /merci de votre confiance|merci pour votre confiance|nous vous remercions de votre confiance|avec nos remerciements/.test(
      text
    )
  ) {
    return false;
  }

  /*
   * "Merci de..." sans verbe d'action.
   */

  if (
    /^merci de\b/.test(
      text
    ) &&
    !containsActionVerb(
      text
    )
  ) {
    return false;
  }

  /*
   * Une vraie action contient généralement
   * un verbe d'action.
   */

  if (
    containsActionVerb(
      text
    )
  ) {
    return true;
  }

  /*
   * Autres formulations impératives.
   */

  if (
    /vous devez|veuillez|il vous est demande|il vous appartient de/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * =====================================================
 * VERBE D'ACTION
 * =====================================================
 */

function containsActionVerb(
  value
) {
  const text =
    normalizeText(
      value
    );

  return (
    /\b(?:transmettre|envoyer|retourner|completer|signer|fournir|joindre|repondre|regler|payer|confirmer|contacter|appeler|participer|voter)\b/.test(
      text
    )
  );
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
