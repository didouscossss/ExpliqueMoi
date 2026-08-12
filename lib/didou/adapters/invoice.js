/**
 * E — Adaptateur facture.
 *
 * Objectif :
 * distinguer :
 * - montant à payer
 * - prélèvement automatique à venir
 * - montant déjà payé / déjà prélevé
 * - remboursement attendu
 * - situation incertaine
 */
const text = String(ctx.text || "");
console.log("[DIDOU-INVOICE-TEXT]", text.slice(0, 500));
export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  const amounts = extraction.amounts || [];
  const dates = extraction.dates || [];
  const organizations =
    extraction.entities?.organizations || [];

  const issuer = pickIssuer(organizations);

  const paymentSituation = detectPaymentSituation(
    amounts,
    dates
  );

  const {
    status,
    amount,
    relevantDate,
    confidence
  } = paymentSituation;

  const actions = [];
  const importantFacts = [];
  const deadlines = [];
  const evidence = [];
  const warnings = [];
  const uncertainties = [];

  let mainAmount = null;
  let mainDate = null;
  let attentionLevel = "none";
  let whyReceived =
    "Ce document vous informe de votre situation de facturation.";
  let documentPurpose =
    "Présenter une facture et son état de paiement.";

  /*
   * =====================================================
   * 1 — MONTANT À PAYER
   * =====================================================
   */
  if (status === "to_pay" && amount) {
    mainAmount = {
      value: amount.value,
      label: "Montant à payer",
      meaning:
        amount.context || "Montant restant à régler",
      role: "amountDue"
    };

    actions.push({
      action: `Régler ${amount.value}`,
      how:
        "Selon le moyen de paiement indiqué sur la facture",
      confidence
    });

    importantFacts.push({
      kind: "amount",
      label: "Montant à payer",
      value: amount.value,
      confidence
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
   * 2 — PRÉLÈVEMENT AUTOMATIQUE À VENIR
   * =====================================================
   */
  else if (
    status === "automatic_debit" &&
    amount
  ) {
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
      confidence
    });

    whyReceived =
      `Cette facture indique qu’un prélèvement automatique de ${amount.value} est prévu.`;

    documentPurpose =
      "Vous informer d’un montant qui sera prélevé automatiquement.";

    attentionLevel = "none";

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

    /*
     * Pas d'action "Régler".
     */
    actions.push({
      action:
        "Aucune action nécessaire si le prélèvement automatique est bien actif",
      how:
        "Vérifiez simplement que votre compte sera suffisamment approvisionné.",
      confidence
    });
  }

  /*
   * =====================================================
   * 3 — DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */
  else if (
    status === "already_paid" &&
    amount
  ) {
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
      confidence
    });

    whyReceived =
      `Cette facture indique qu’un montant de ${amount.value} a déjà été payé ou prélevé.`;

    documentPurpose =
      "Confirmer ou récapituler un paiement déjà effectué.";

    attentionLevel = "none";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du paiement",
        meaning:
          relevantDate.context ||
          "Date à laquelle le paiement a été effectué",
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

    actions.push({
      action: "Aucune action de paiement nécessaire",
      how:
        "Conservez simplement la facture comme justificatif.",
      confidence
    });
  }

  /*
   * =====================================================
   * 4 — REMBOURSEMENT ATTENDU
   * =====================================================
   */
  else if (
    status === "refund_expected" &&
    amount
  ) {
    mainAmount = {
      value: amount.value,
      label: "Montant à vous rembourser",
      meaning:
        amount.context ||
        "Remboursement attendu",
      role: "refundAmount"
    };

    importantFacts.push({
      kind: "amount",
      label: "Remboursement attendu",
      value: amount.value,
      confidence
    });

    whyReceived =
      `Cette facture indique qu’un remboursement de ${amount.value} est prévu en votre faveur.`;

    documentPurpose =
      "Vous informer d’un remboursement ou d’un avoir.";

    attentionLevel = "none";

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date prévue du remboursement",
        meaning:
          relevantDate.context ||
          "Date à laquelle le remboursement est annoncé",
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

    actions.push({
      action:
        "Aucune action nécessaire pour recevoir ce remboursement",
      how:
        "Surveillez simplement votre compte à la date indiquée.",
      confidence
    });
  }

  /*
   * =====================================================
   * 5 — SITUATION INCERTAINE
   * =====================================================
   */
  else {
    whyReceived =
      "Ce document contient des informations de facturation, mais Didou n’a pas identifié avec assez de certitude si vous devez payer, si un prélèvement est prévu ou si un remboursement est attendu.";

    documentPurpose =
      "Présenter votre situation de facturation.";

    attentionLevel = "uncertain";

    uncertainties.push(
      "Le statut exact du paiement n’a pas été identifié avec suffisamment de certitude."
    );
  }

  /*
   * Émetteur
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
   * Preuves
   */
  if (amount) {
    evidence.push({
      page: "Page 1",
      quote:
        amount.context ||
        amount.value,
      explanation:
        explainAmountEvidence(status)
    });
  }

  if (relevantDate) {
    evidence.push({
      page: "Page 1",
      quote:
        relevantDate.context ||
        relevantDate.raw,
      explanation:
        explainDateEvidence(status)
    });
  }

  return {
    family: "facture",

    documentType:
      detection.documentType || "Facture",

    understandingLevel:
      status === "unknown"
        ? detection.understandingLevel
        : "strong",

    confidence: Math.max(
      detection.confidence || 0,
      status === "unknown"
        ? 60
        : confidence
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
 * Détermine la situation de paiement.
 */
function detectPaymentSituation(
  amounts,
  dates
) {
  const candidates = (amounts || [])
    .map((amount) => ({
      amount,
      context:
        String(amount.context || "")
          .toLowerCase()
    }))
    .filter((item) => item.amount);

  /*
   * =====================================================
   * PRIORITÉ 1 — REMBOURSEMENT
   * =====================================================
   */
  const refund = candidates.find(({ context }) =>
    /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement|montant remboursé|montant rembourse|à vous rembourser|a vous rembourser|avoir en votre faveur|crédit en votre faveur|credit en votre faveur/.test(
      context
    )
  );

  if (refund) {
    return {
      status: "refund_expected",
      amount: refund.amount,
      relevantDate:
        findDateNearContext(
          dates,
          refund.amount.context,
          [
            "refundDate",
            "refund",
            "remboursement"
          ]
        ),
      confidence: 92
    };
  }

  /*
   * =====================================================
   * PRIORITÉ 2 — DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */
  const alreadyPaid = candidates.find(
    ({ context }) =>
      /déjà payé|deja paye|déjà réglé|deja regle|payé le|paye le|réglé le|regle le|prélevé le|preleve le|a été prélevé|a ete preleve|facture acquittée|facture acquittee|paiement reçu|paiement recu/.test(
        context
      )
  );

  if (alreadyPaid) {
    return {
      status: "already_paid",
      amount: alreadyPaid.amount,
      relevantDate:
        findDateNearContext(
          dates,
          alreadyPaid.amount.context,
          [
            "paymentDate",
            "paid",
            "debitDate"
          ]
        ),
      confidence: 90
    };
  }

  /*
   * =====================================================
   * PRIORITÉ 3 — PRÉLÈVEMENT AUTOMATIQUE À VENIR
   * =====================================================
   */
  const automaticDebit =
    candidates.find(({ context }) =>
      /sera prélevé|sera preleve|prélèvement automatique|prelevement automatique|prélevé automatiquement|preleve automatiquement|nous prélèverons|nous preleverons|prélèvement prévu|prelevement prevu|sera débité|sera debite/.test(
        context
      )
    );

  if (automaticDebit) {
    return {
      status: "automatic_debit",
      amount: automaticDebit.amount,
      relevantDate:
        findDateNearContext(
          dates,
          automaticDebit.amount.context,
          [
            "debitDate",
            "paymentDate"
          ]
        ),
      confidence: 90
    };
  }

  /*
   * =====================================================
   * PRIORITÉ 4 — À PAYER
   * =====================================================
   */
  const amountDue = candidates.find(
    ({ amount, context }) =>
      amount.role === "amountDue" ||
      /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|total à régler|total a regler|somme à régler|somme a regler|montant dû|montant du/.test(
        context
      )
  );

  if (amountDue) {
    return {
      status: "to_pay",
      amount: amountDue.amount,
      relevantDate:
        findDateNearContext(
          dates,
          amountDue.amount.context,
          ["deadline", "dueDate"]
        ) ||
        (dates || []).find(
          (date) =>
            date.role === "deadline" &&
            date.important
        ) ||
        null,
      confidence: 88
    };
  }

  /*
   * Aucun statut fiable.
   */
  return {
    status: "unknown",
    amount: null,
    relevantDate: null,
    confidence: 55
  };
}

/**
 * Cherche une date ayant un rôle cohérent.
 */
function findDateNearContext(
  dates,
  context,
  preferredRoles = []
) {
  const list = dates || [];

  const preferred = list.find((date) =>
    preferredRoles.includes(
      String(date.role || "")
    )
  );

  if (preferred) {
    return preferred;
  }

  const source =
    String(context || "").toLowerCase();

  return (
    list.find((date) => {
      const dateContext =
        String(date.context || "")
          .toLowerCase();

      if (!dateContext || !source) {
        return false;
      }

      return contextsOverlap(
        source,
        dateContext
      );
    }) || null
  );
}

function contextsOverlap(a, b) {
  const wordsA = new Set(
    String(a || "")
      .split(/\W+/)
      .filter((word) => word.length >= 5)
  );

  const wordsB =
    String(b || "")
      .split(/\W+/)
      .filter((word) => word.length >= 5);

  let matches = 0;

  for (const word of wordsB) {
    if (wordsA.has(word)) {
      matches += 1;
    }
  }

  return matches >= 2;
}

/**
 * Sélection de l'émetteur.
 */
function pickIssuer(organizations) {
  const list =
    (organizations || [])
      .map((value) =>
        String(value || "").trim()
      )
      .filter(Boolean);

  /*
   * Rejette les formes juridiques seules.
   */
  const plausible = list.filter(
    (value) =>
      value.length >= 4 &&
      !/^(sa|sas|sarl|eurl|sci|sasu)$/i.test(
        value
      )
  );

  /*
   * Préfère une valeur contenant plusieurs lettres
   * et évite les petits fragments OCR.
   */
  return (
    plausible.find((value) =>
      /[a-zà-ÿ]{4,}/i.test(value)
    ) ||
    plausible[0] ||
    null
  );
}

function explainAmountEvidence(status) {
  if (status === "refund_expected") {
    return "Montant annoncé comme remboursement";
  }

  if (status === "already_paid") {
    return "Montant déjà payé ou déjà prélevé";
  }

  if (status === "automatic_debit") {
    return "Montant annoncé comme prélèvement automatique";
  }

  if (status === "to_pay") {
    return "Montant restant à payer";
  }

  return "Montant présent sur la facture";
}

function explainDateEvidence(status) {
  if (status === "refund_expected") {
    return "Date annoncée pour le remboursement";
  }

  if (status === "already_paid") {
    return "Date du paiement ou du prélèvement";
  }

  if (status === "automatic_debit") {
    return "Date prévue du prélèvement automatique";
  }

  if (status === "to_pay") {
    return "Date limite de paiement";
  }

  return "Date présente sur la facture";
}
