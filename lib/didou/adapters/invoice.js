/**
 * E — Adaptateur facture.
 *
 * Didou distingue :
 * - montant à payer
 * - prélèvement automatique prévu
 * - facture déjà payée / déjà prélevée
 * - remboursement déjà effectué
 * - remboursement attendu
 * - situation incertaine
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  const text = String(ctx.text || "");
  const lowerText = text.toLowerCase();

  const amounts = Array.isArray(extraction?.amounts)
    ? extraction.amounts
    : [];
console.log("=== DIDOU AMOUNTS ===");
for (const amount of amounts) {
  console.log("AMOUNT", {
    value: amount.value,
    numeric: amount.numeric,
    role: amount.role,
    important: amount.important,
    context: amount.context
  });
}
  const dates = Array.isArray(extraction?.dates)
    ? extraction.dates
    : [];

  const organizations =
    extraction?.entities?.organizations || [];

  const issuer = pickIssuer(
    organizations,
    text
  );

  /*
   * 1 — Comprendre la situation globale.
   */
  const paymentStatus =
    detectGlobalPaymentStatus(lowerText);

  /*
   * 2 — Trouver le montant correspondant.
   */
  const selectedAmount =
    pickAmountForStatus(
      amounts,
      paymentStatus,
      lowerText
    );

  /*
   * Fallback pour une facture classique à payer.
   */
  const fallbackDue =
    amounts.find(
      (amount) =>
        amount.role === "amountDue" &&
        amount.important
    ) ||
    amounts.find((amount) =>
      /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|total ttc|montant dû|montant du|à régler|a regler/.test(
        String(amount.context || "")
          .toLowerCase()
      )
    ) ||
    null;

  const amount =
    selectedAmount ||
    (
      paymentStatus === "unknown"
        ? fallbackDue
        : null
    );

  /*
   * Si aucun statut global n'est identifié,
   * mais qu'un vrai montant dû existe,
   * on garde le comportement historique.
   */
  const effectiveStatus =
    paymentStatus === "unknown" &&
    amount
      ? "to_pay"
      : paymentStatus;

  const relevantDate =
    pickRelevantDate(
      dates,
      effectiveStatus,
      text
    );

  const actions = [];
  const importantFacts = [];
  const deadlines = [];
  const evidence = [];
  const warnings = [];
  const uncertainties = [];

  let mainAmount = null;
  let mainDate = null;

  let whyReceived =
    "Ce document présente votre situation de facturation.";

  let documentPurpose =
    "Présenter une facture et les informations liées à son paiement.";

  let attentionLevel = "uncertain";

  /*
   * =====================================================
   * À PAYER
   * =====================================================
   */
  if (
    effectiveStatus === "to_pay" &&
    amount
  ) {
    mainAmount = {
      value: amount.value,
      label: "Montant à payer",
      meaning:
        amount.context ||
        "Montant restant à régler",
      role: "amountDue"
    };

    importantFacts.push({
      kind: "amount",
      label: "Montant à payer",
      value: amount.value,
      confidence: Math.max(
        Number(amount.confidence) || 0,
        80
      )
    });

    actions.push({
      action: `Régler ${amount.value}`,
      how:
        "Selon le moyen de paiement indiqué sur la facture",
      confidence: 85
    });

    whyReceived =
      `Cette facture vous demande de régler ${amount.value}.`;

    documentPurpose =
      "Demander le paiement d’une prestation ou d’un service.";

    attentionLevel = relevantDate
      ? "urgent"
      : "soon";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Échéance de paiement",
        meaning:
          relevantDate.context ||
          "Date limite pour régler la facture",
        role: "deadline"
      };

      deadlines.push({
        date: relevantDate.raw,
        label: "Date limite de paiement",
        meaning:
          relevantDate.context ||
          "Date limite pour régler la facture",
        confidence:
          relevantDate.confidence || 75
      });

      importantFacts.push({
        kind: "date",
        label: "Échéance",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT AUTOMATIQUE FUTUR
   * =====================================================
   */
  else if (
    effectiveStatus === "automatic_debit"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant qui sera prélevé",
        meaning:
          amount.context ||
          "Prélèvement automatique prévu",
        role: "automaticDebit"
      };

      importantFacts.push({
        kind: "amount",
        label: "Prélèvement automatique",
        value: amount.value,
        confidence: Math.max(
          Number(amount.confidence) || 0,
          80
        )
      });

      whyReceived =
        `Cette facture indique qu’un prélèvement automatique de ${amount.value} est prévu.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un prélèvement automatique est prévu.";
    }

    documentPurpose =
      "Vous informer d’un prélèvement automatique.";

    attentionLevel = "none";

    /*
     * Ce n'est PAS une action de paiement.
     * L'utilisateur ne doit surtout pas voir "Régler X €".
     */
    actions.push({
      action:
        "Vérifier que le compte sera suffisamment approvisionné",
      how:
        "Le paiement doit être effectué automatiquement par prélèvement.",
      confidence: 90
    });

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du prélèvement",
        meaning:
          relevantDate.context ||
          "Date prévue du prélèvement automatique",
        role: "debitDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du prélèvement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */
  else if (
    effectiveStatus === "already_paid"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant déjà payé",
        meaning:
          amount.context ||
          "Paiement déjà effectué",
        role: "paidAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Déjà payé",
        value: amount.value,
        confidence: Math.max(
          Number(amount.confidence) || 0,
          80
        )
      });

      whyReceived =
        `Cette facture indique que ${amount.value} a déjà été payé ou prélevé.`;
    } else {
      whyReceived =
        "Cette facture indique que le paiement a déjà été effectué.";
    }

    documentPurpose =
      "Confirmer ou récapituler un paiement déjà effectué.";

    attentionLevel = "none";

    /*
     * Pas d'action : le paiement est terminé.
     */

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du paiement",
        meaning:
          relevantDate.context ||
          "Date du paiement ou du prélèvement",
        role: "paymentDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du paiement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT DÉJÀ EFFECTUÉ
   * =====================================================
   */
  else if (
    effectiveStatus === "refunded"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Montant remboursé",
        meaning:
          amount.context ||
          "Remboursement déjà effectué",
        role: "refundedAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Montant remboursé",
        value: amount.value,
        confidence: Math.max(
          Number(amount.confidence) || 0,
          80
        )
      });

      whyReceived =
        `Cette facture indique que ${amount.value} vous a déjà été remboursé.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un remboursement a déjà été effectué.";
    }

    documentPurpose =
      "Confirmer un remboursement déjà effectué.";

    attentionLevel = "none";

    /*
     * Aucune action utilisateur.
     */

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du remboursement",
        meaning:
          relevantDate.context ||
          "Date à laquelle le remboursement a été effectué",
        role: "refundDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du remboursement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * REMBOURSEMENT À VENIR
   * =====================================================
   */
  else if (
    effectiveStatus === "refund_expected"
  ) {
    if (amount) {
      mainAmount = {
        value: amount.value,
        label: "Remboursement attendu",
        meaning:
          amount.context ||
          "Montant qui doit vous être remboursé",
        role: "refundAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Remboursement attendu",
        value: amount.value,
        confidence: Math.max(
          Number(amount.confidence) || 0,
          80
        )
      });

      whyReceived =
        `Cette facture indique qu’un remboursement de ${amount.value} est prévu en votre faveur.`;
    } else {
      whyReceived =
        "Cette facture indique qu’un remboursement est prévu en votre faveur.";
    }

    documentPurpose =
      "Vous informer d’un remboursement ou d’un avoir.";

    attentionLevel = "none";

    /*
     * Pas d'action de paiement.
     */

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date prévue du remboursement",
        meaning:
          relevantDate.context ||
          "Date annoncée pour le remboursement",
        role: "refundDate"
      };

      importantFacts.push({
        kind: "date",
        label: "Date du remboursement",
        value: relevantDate.raw,
        confidence:
          relevantDate.confidence || 75
      });
    }
  }

  /*
   * =====================================================
   * SITUATION INCERTAINE
   * =====================================================
   */
  else {
    const candidate =
      pickBestNeutralAmount(amounts);

    /*
     * On ne fait pas disparaître tous les montants.
     * Mais on ne prétend pas non plus qu'il faut payer.
     */
    if (candidate) {
      mainAmount = {
        value: candidate.value,
        label: "Montant détecté",
        meaning:
          "Didou n’a pas identifié avec suffisamment de certitude le rôle exact de ce montant.",
        role: "unknownAmount"
      };

      importantFacts.push({
        kind: "amount",
        label: "Montant à vérifier",
        value: candidate.value,
        confidence: Math.min(
          Number(candidate.confidence) || 60,
          65
        )
      });
    }

    whyReceived =
      "Ce document contient des informations de facturation, mais Didou n’a pas identifié avec assez de certitude s’il s’agit d’un paiement, d’un prélèvement ou d’un remboursement.";

    documentPurpose =
      "Présenter votre situation de facturation.";

    attentionLevel = "uncertain";

    uncertainties.push(
      "Le statut exact du paiement doit être vérifié."
    );
  }

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */
  if (issuer) {
    importantFacts.push({
      kind: "issuer",
      label: "Émetteur",
      value: issuer,
      confidence: 70
    });
  }

  /*
   * =====================================================
   * PREUVES
   * =====================================================
   */
  if (amount) {
    evidence.push({
      page: "Page 1",
      quote:
        amount.context ||
        amount.value,
      explanation:
        getAmountExplanation(
          effectiveStatus
        )
    });
  }

  if (relevantDate) {
    evidence.push({
      page: "Page 1",
      quote:
        relevantDate.context ||
        relevantDate.raw,
      explanation:
        getDateExplanation(
          effectiveStatus
        )
    });
  }

  return {
    family: "facture",

    documentType:
      detection?.documentType ||
      "Facture",

    understandingLevel:
      effectiveStatus === "unknown"
        ? detection?.understandingLevel ||
          "probable"
        : "strong",

    confidence:
      effectiveStatus === "unknown"
        ? Math.max(
            detection?.confidence || 0,
            60
          )
        : Math.max(
            detection?.confidence || 0,
            85
          ),

    issuer,
    recipient: null,

    mainDate,
    mainAmount,

    importantFacts,
    actions,
    deadlines,

    whyReceived,
    documentPurpose,
    attentionLevel,

    evidence,
    warnings,
    uncertainties
  };
}

/**
 * Détecte l'état global du paiement.
 */
function detectGlobalPaymentStatus(text) {
  const source =
    String(text || "").toLowerCase();

  /*
   * 1 — Remboursement déjà effectué.
   */
  if (
    /vous avez été remboursé|vous avez ete rembourse|remboursement effectué|remboursement effectue|remboursé le|rembourse le/.test(
      source
    )
  ) {
    return "refunded";
  }

  /*
   * 2 — Remboursement prévu.
   */
  if (
    /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement prévu|remboursement prevu|à vous rembourser|a vous rembourser|avoir en votre faveur|crédit en votre faveur|credit en votre faveur/.test(
      source
    )
  ) {
    return "refund_expected";
  }

  /*
   * 3 — Déjà payé / déjà prélevé.
   */
  if (
    /facture acquittée|facture acquittee|déjà payé|deja paye|déjà réglé|deja regle|paiement reçu|paiement recu|a été prélevé|a ete preleve|déjà prélevé|deja preleve|paiement effectué|paiement effectue|réglé le|regle le/.test(
      source
    )
  ) {
    return "already_paid";
  }

  /*
   * 4 — Prélèvement automatique futur.
   */
  if (
    /sera\s+prélevé|sera\s+preleve|prélèvement\s+automatique|prelevement\s+automatique|prélevé\s+automatiquement|preleve\s+automatiquement|nous\s+prélèverons|nous\s+preleverons|sera\s+débité|sera\s+debite|prélèvement\s+prévu|prelevement\s+prevu|débit\s+automatique|debit\s+automatique|paiement\s+par\s+prélèvement|paiement\s+par\s+prelevement/.test(
      source
    )
  ) {
    return "automatic_debit";
  }

  /*
   * 5 — Paiement manuel clairement demandé.
   */
  if (
    /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|montant dû|montant du|total à régler|total a regler|à régler avant|a regler avant|payable sous|payable avant|merci de régler|merci de regler|à acquitter|a acquitter/.test(
      source
    )
  ) {
    return "to_pay";
  }

  /*
   * 6 — Aucune preuve suffisante.
   */
  return "unknown";
}

/**
 * Cherche le montant correspondant
 * au statut détecté.
 */
function pickAmountForStatus(
  amounts,
  status,
  fullText
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  if (!list.length) {
    return null;
  }

  /*
   * Remboursement déjà effectué.
   */
  if (status === "refunded") {
    return (
      findAmountByContext(
        list,
        /remboursé|rembourse|remboursement effectué|remboursement effectue|remboursé le|rembourse le/
      ) ||
      findAmountNearPhrase(
        list,
        fullText,
        /vous avez été remboursé|vous avez ete rembourse|remboursement effectué|remboursement effectue/
      ) ||
      null
    );
  }

  /*
   * Remboursement à venir.
   */
  if (status === "refund_expected") {
    return (
      findAmountByContext(
        list,
        /rembours|avoir|crédit|credit/
      ) ||
      findAmountNearPhrase(
        list,
        fullText,
        /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement|à vous rembourser|a vous rembourser/
      ) ||
      null
    );
  }

  /*
   * Déjà payé / déjà prélevé.
   */
  if (status === "already_paid") {
    return (
      findAmountByContext(
        list,
        /déjà payé|deja paye|payé|paye|réglé|regle|prélevé|preleve|acquitt|paiement reçu|paiement recu/
      ) ||
      null
    );
  }

  /*
   * Prélèvement automatique futur.
   */
  if (status === "automatic_debit") {
    return (
      findAmountByContext(
        list,
        /prélèvement|prelevement|sera prélevé|sera preleve|prélevé automatiquement|preleve automatiquement|sera débité|sera debite|débit automatique|debit automatique/
      ) ||

      list.find(
        (amount) =>
          amount.role === "amountDue" &&
          amount.important
      ) ||

      list.find(
        (amount) =>
          amount.role === "amountDue"
      ) ||

      null
    );
  }

  /*
   * Montant à payer.
   */
  if (status === "to_pay") {
    return (
      list.find(
        (amount) =>
          amount.role === "amountDue" &&
          amount.important
      ) ||

      findAmountByContext(
        list,
        /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|total à régler|total a regler|somme à régler|somme a regler|montant dû|montant du|à régler|a regler/
      ) ||

      list.find(
        (amount) =>
          amount.role === "amountDue"
      ) ||

      null
    );
  }

  return null;
}

/**
 * Cherche un montant grâce à son contexte local.
 */
function findAmountByContext(
  amounts,
  regex
) {
  return (
    amounts.find((amount) =>
      regex.test(
        String(amount.context || "")
          .toLowerCase()
      )
    ) ||
    null
  );
}

/**
 * Fallback prudent.
 *
 * Ne choisit jamais automatiquement
 * le montant le plus élevé.
 */
function findAmountNearPhrase(
  amounts,
  fullText,
  phraseRegex
) {
  const source =
    String(fullText || "")
      .toLowerCase();

  if (!phraseRegex.test(source)) {
    return null;
  }

  return (
    amounts.find((amount) =>
      phraseRegex.test(
        String(amount.context || "")
          .toLowerCase()
      )
    ) ||
    null
  );
}

/**
 * En statut inconnu, garde éventuellement
 * un montant sans prétendre qu'il est à payer.
 */
function pickBestNeutralAmount(
  amounts
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  return (
    list.find(
      (amount) =>
        amount.important &&
        amount.role !== "example"
    ) ||

    list.find(
      (amount) =>
        amount.role !== "example"
    ) ||

    null
  );
}

/**
 * Choisit la date pertinente selon le statut.
 */
function pickRelevantDate(
  dates,
  status,
  fullText
) {
  const list =
    Array.isArray(dates)
      ? dates
      : [];

  if (!list.length) {
    return null;
  }

  /*
   * Remboursement déjà effectué.
   */
  if (status === "refunded") {
    return (
      list.find((date) =>
        /remboursé|rembourse|remboursement/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||
      null
    );
  }

  /*
   * Remboursement futur.
   */
  if (status === "refund_expected") {
    return (
      list.find((date) =>
        /rembours|avoir/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||
      null
    );
  }

  /*
   * Paiement déjà effectué.
   */
  if (status === "already_paid") {
    return (
      list.find(
        (date) =>
          date.role === "paymentDate"
      ) ||

      list.find((date) =>
        /payé|paye|prélevé|preleve|réglé|regle/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||

      null
    );
  }

  /*
   * Prélèvement futur.
   */
  if (status === "automatic_debit") {
    return (
      list.find((date) =>
        /prélèvement|prelevement|prélevé|preleve|débité|debite/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||
      null
    );
  }

  /*
   * Paiement manuel.
   */
  if (status === "to_pay") {
    return (
      list.find(
        (date) =>
          date.role === "deadline" &&
          date.important
      ) ||

      list.find(
        (date) =>
          date.role === "deadline"
      ) ||

      null
    );
  }

  return null;
}

/**
 * Sélection de l'émetteur.
 */
function pickIssuer(
  organizations,
  text
) {
  const list =
    (organizations || [])
      .map((value) =>
        String(value || "").trim()
      )
      .filter(Boolean);

  const plausible =
    list.filter((value) => {
      if (value.length < 4) {
        return false;
      }

      if (
        /^(sa|sas|sarl|eurl|sci|sasu)$/i.test(
          value
        )
      ) {
        return false;
      }

      return true;
    });

  if (plausible.length) {
    return plausible[0];
  }

  /*
   * Fallback :
   * acronyme présent dans l'en-tête.
   */
  const header =
    String(text || "")
      .split(/\n/)
      .slice(0, 15)
      .join(" ");

  const acronym =
    header.match(
      /\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{4,15}\b/
    );

  return acronym
    ? acronym[0]
    : null;
}

/**
 * Texte associé à la preuve du montant.
 */
function getAmountExplanation(
  status
) {
  if (status === "refunded") {
    return "Montant déjà remboursé";
  }

  if (status === "refund_expected") {
    return "Montant annoncé comme remboursement";
  }

  if (status === "already_paid") {
    return "Montant déjà payé ou prélevé";
  }

  if (status === "automatic_debit") {
    return "Montant annoncé comme prélèvement automatique";
  }

  if (status === "to_pay") {
    return "Montant à régler";
  }

  return "Montant détecté sur la facture";
}

/**
 * Texte associé à la preuve de date.
 */
function getDateExplanation(
  status
) {
  if (status === "refunded") {
    return "Date du remboursement effectué";
  }

  if (status === "refund_expected") {
    return "Date annoncée pour le remboursement";
  }

  if (status === "already_paid") {
    return "Date du paiement";
  }

  if (status === "automatic_debit") {
    return "Date prévue du prélèvement";
  }

  if (status === "to_pay") {
    return "Date limite de paiement";
  }

  return "Date présente sur la facture";
}
