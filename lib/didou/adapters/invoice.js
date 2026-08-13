/**
 * E — Adaptateur facture V3.
 *
 * Objectifs :
 * - distinguer paiement / prélèvement / déjà payé / remboursement
 * - ne jamais prendre le capital social comme montant principal
 * - choisir le VRAI montant d'un remboursement
 * - rester compatible avec les factures simples type Sosh
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  const text = String(ctx.text || "");
  const lowerText = text.toLowerCase();

  const amounts = Array.isArray(extraction?.amounts)
    ? extraction.amounts
    : [];

  const dates = Array.isArray(extraction?.dates)
    ? extraction.dates
    : [];

  const organizations =
    extraction?.entities?.organizations || [];

  const issuer = pickIssuer(organizations, text);

  const paymentStatus =
    detectGlobalPaymentStatus(lowerText);

  const selectedAmount =
    pickAmountForStatus(
      amounts,
      paymentStatus,
      lowerText
    );

  /*
   * Facture simple :
   * on cherche un montant clairement présenté
   * comme "votre facture", même si roles.js l'a
   * classé invoiceLineAmount à cause de l'OCR.
   */
  const simpleInvoiceAmount =
    pickSimpleInvoiceAmount(amounts);

  /*
   * Ancien fallback amountDue.
   */
  const fallbackDue =
    amounts.find(
      (amount) =>
        amount.role === "amountDue" &&
        amount.important
    ) ||
    amounts.find((amount) =>
      /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|montant dû|montant du|total à régler|total a regler/.test(
        String(amount.context || "").toLowerCase()
      )
    ) ||
    null;

  let amount = selectedAmount;

  let effectiveStatus = paymentStatus;

  /*
   * Aucun statut explicite :
   * facture classique.
   */
  if (
    effectiveStatus === "unknown"
  ) {
    if (fallbackDue) {
      amount = fallbackDue;
      effectiveStatus = "to_pay";
    } else if (simpleInvoiceAmount) {
      amount = simpleInvoiceAmount;

      /*
       * Comportement historique :
       * une facture simple sans autre indication
       * est présentée comme montant à régler.
       */
      effectiveStatus = "to_pay";
    }
  }

  const relevantDate =
    pickRelevantDate(
      dates,
      effectiveStatus
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
   * 1 — À PAYER
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

    attentionLevel =
      relevantDate
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
   * 2 — PRÉLÈVEMENT AUTOMATIQUE
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

    /*
     * Il y a éventuellement une chose à surveiller,
     * mais PAS de bouton / action "Régler".
     */
    attentionLevel = "none";

    actions.push({
      action:
        "Vérifier que le compte sera suffisamment approvisionné",
      how:
        "Le règlement doit être effectué automatiquement par prélèvement.",
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
   * 3 — DÉJÀ PAYÉ
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

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du paiement",
        meaning:
          relevantDate.context ||
          "Date du paiement ou du prélèvement",
        role: "paymentDate"
      };
    }
  }

  /*
   * =====================================================
   * 4 — REMBOURSEMENT DÉJÀ EFFECTUÉ
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
        confidence: 95
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

    if (relevantDate) {
      mainDate = {
        date: relevantDate.raw,
        label: "Date du remboursement",
        meaning:
          relevantDate.context ||
          "Date du remboursement effectué",
        role: "refundDate"
      };
    }
  }

  /*
   * =====================================================
   * 5 — REMBOURSEMENT À VENIR
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
        confidence: 95
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
     * Aucun paiement manuel.
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
          relevantDate.confidence || 80
      });
    }
  }

  /*
   * =====================================================
   * 6 — INCONNU
   * =====================================================
   */

  else {
    /*
     * V3 :
     * on ne choisit PLUS le montant le plus élevé.
     *
     * Capital social, TVA, lignes de facture,
     * mensualités, etc. sont exclus.
     */
    const candidate =
      pickSafeNeutralAmount(amounts);

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
      "Ce document contient des informations de facturation, mais Didou n’a pas identifié avec suffisamment de certitude s’il s’agit d’un paiement, d’un prélèvement ou d’un remboursement.";

    documentPurpose =
      "Présenter votre situation de facturation.";

    attentionLevel = "uncertain";

    uncertainties.push(
      "Le statut exact du paiement doit être vérifié."
    );
  }

  /*
   * Émetteur.
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
   * Preuves.
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

/*
 * =====================================================
 * STATUT GLOBAL
 * =====================================================
 */

function detectGlobalPaymentStatus(text) {
  const source =
    String(text || "").toLowerCase();

  if (
    /vous avez été remboursé|vous avez ete rembourse|remboursement effectué|remboursement effectue|remboursé le|rembourse le/.test(
      source
    )
  ) {
    return "refunded";
  }

  if (
    /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement prévu|remboursement prevu|à vous rembourser|a vous rembourser|avoir en votre faveur|crédit en votre faveur|credit en votre faveur/.test(
      source
    )
  ) {
    return "refund_expected";
  }

  if (
    /facture acquittée|facture acquittee|déjà payé|deja paye|déjà réglé|deja regle|paiement reçu|paiement recu|a été prélevé|a ete preleve|déjà prélevé|deja preleve|paiement effectué|paiement effectue|réglé le|regle le/.test(
      source
    )
  ) {
    return "already_paid";
  }

  if (
    /sera\s+prélevé|sera\s+preleve|prélèvement\s+automatique|prelevement\s+automatique|prélevé\s+automatiquement|preleve\s+automatiquement|nous\s+prélèverons|nous\s+preleverons|sera\s+débité|sera\s+debite|prélèvement\s+prévu|prelevement\s+prevu|débit\s+automatique|debit\s+automatique|paiement\s+par\s+prélèvement|paiement\s+par\s+prelevement/.test(
      source
    )
  ) {
    return "automatic_debit";
  }

  if (
    /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|montant dû|montant du|total à régler|total a regler|à régler avant|a regler avant|payable sous|payable avant|merci de régler|merci de regler/.test(
      source
    )
  ) {
    return "to_pay";
  }

  return "unknown";
}

/*
 * =====================================================
 * SÉLECTION DU MONTANT
 * =====================================================
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
   * REMBOURSEMENT FUTUR
   *
   * IMPORTANT :
   * 1 175 € et 397,63 € peuvent tous deux avoir
   * role=refundAmount car leurs contextes se chevauchent.
   *
   * On choisit prioritairement celui situé APRÈS
   * "nous vous rembourserons".
   */
  if (status === "refund_expected") {
    const candidates =
      list.filter(
        (amount) =>
          amount.role === "refundAmount"
      );

    const afterPhrase =
      candidates.find((amount) =>
        triggerAppearsBeforeAmount(
          amount,
          /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement prévu|remboursement prevu|à vous rembourser|a vous rembourser/
        )
      );

    if (afterPhrase) {
      return afterPhrase;
    }

    return (
      candidates.find(
        (amount) =>
          amount.important
      ) ||
      candidates[0] ||
      null
    );
  }

  /*
   * REMBOURSEMENT DÉJÀ EFFECTUÉ
   */
  if (status === "refunded") {
    const candidates =
      list.filter(
        (amount) =>
          amount.role === "refundedAmount" ||
          amount.role === "refundAmount"
      );

    const afterPhrase =
      candidates.find((amount) =>
        triggerAppearsBeforeAmount(
          amount,
          /vous avez été remboursé|vous avez ete rembourse|remboursement effectué|remboursement effectue|remboursé le|rembourse le/
        )
      );

    return (
      afterPhrase ||
      candidates[0] ||
      null
    );
  }

  /*
   * DÉJÀ PAYÉ
   */
  if (status === "already_paid") {
    return (
      list.find(
        (amount) =>
          amount.role === "paidAmount" &&
          amount.important
      ) ||

      list.find((amount) =>
        /déjà payé|deja paye|payé|paye|réglé|regle|prélevé|preleve|acquitt/.test(
          String(amount.context || "")
            .toLowerCase()
        )
      ) ||

      null
    );
  }

  /*
   * PRÉLÈVEMENT AUTOMATIQUE
   */
  if (status === "automatic_debit") {
    return (
      list.find(
        (amount) =>
          amount.role ===
            "automaticDebitAmount" &&
          amount.important
      ) ||

      list.find((amount) =>
        /prélèvement|prelevement|sera prélevé|sera preleve|prélevé automatiquement|preleve automatiquement|sera débité|sera debite/.test(
          String(amount.context || "")
            .toLowerCase()
        )
      ) ||

      list.find(
        (amount) =>
          amount.role === "amountDue" &&
          amount.important
      ) ||

      pickSimpleInvoiceAmount(list) ||

      null
    );
  }

  /*
   * À PAYER
   */
  if (status === "to_pay") {
    return (
      list.find(
        (amount) =>
          amount.role === "amountDue" &&
          amount.important
      ) ||

      list.find((amount) =>
        /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|total à régler|total a regler|montant dû|montant du/.test(
          String(amount.context || "")
            .toLowerCase()
        )
      ) ||

      pickSimpleInvoiceAmount(list) ||

      null
    );
  }

  return null;
}

/*
 * Vérifie que le déclencheur apparaît AVANT
 * le montant dans le contexte.
 *
 * C'est ce qui sépare :
 *
 * 1175 € ... Nous vous rembourserons ... 397,63 €
 *
 * de :
 *
 * Nous vous rembourserons ... 397,63 €
 */
function triggerAppearsBeforeAmount(
  amount,
  triggerRegex
) {
  const context =
    String(amount?.context || "")
      .toLowerCase();

  if (!context) {
    return false;
  }

  const triggerMatch =
    context.match(triggerRegex);

  if (!triggerMatch) {
    return false;
  }

  const triggerIndex =
    triggerMatch.index ?? -1;

  const amountIndex =
    findAmountIndexInContext(
      context,
      amount
    );

  return (
    triggerIndex >= 0 &&
    amountIndex >= 0 &&
    triggerIndex < amountIndex
  );
}

/*
 * Retrouve la position du montant dans son contexte.
 */
function findAmountIndexInContext(
  context,
  amount
) {
  const numeric =
    Number(amount?.numeric);

  const variants = [];

  if (Number.isFinite(numeric)) {
    variants.push(
      numeric.toFixed(2)
        .replace(".", ",")
    );

    variants.push(
      numeric.toFixed(2)
    );

    variants.push(
      String(numeric)
        .replace(".", ",")
    );
  }

  const value =
    String(amount?.value || "")
      .replace(/\s*€\s*/g, "")
      .trim()
      .toLowerCase();

  if (value) {
    variants.push(value);
  }

  for (const variant of variants) {
    const index =
      context.indexOf(
        String(variant)
          .toLowerCase()
      );

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

/*
 * =====================================================
 * FACTURE SIMPLE TYPE SOSH
 * =====================================================
 */

function pickSimpleInvoiceAmount(
  amounts
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  /*
   * On exclut d'abord tous les montants
   * qui ne peuvent pas représenter la facture.
   */
  const candidates =
    list.filter(
      (amount) =>
        !isForbiddenMainAmount(amount)
    );

  /*
   * Exemple visible dans tes logs :
   *
   * "Votre facture mobile ... Forfait Sosh 25,99 €"
   */
  const explicitInvoice =
    candidates.find((amount) =>
      /votre facture|facture mobile|montant de la facture|total facture|facture\s+[0-9]/.test(
        String(amount.context || "")
          .toLowerCase()
      )
    );

  if (explicitInvoice) {
    return explicitInvoice;
  }

  /*
   * Montant amountDue interprété ailleurs.
   */
  const due =
    candidates.find(
      (amount) =>
        amount.role === "amountDue"
    );

  if (due) {
    return due;
  }

  return null;
}

/*
 * =====================================================
 * FALLBACK SÛR
 * =====================================================
 */

function pickSafeNeutralAmount(
  amounts
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  /*
   * On ne reprend JAMAIS :
   * - capital social
   * - TVA
   * - HT
   * - ligne de facture
   * - mensualité
   * - simple TTC
   * - exemples
   * - tableaux
   */
  return (
    list.find(
      (amount) =>
        amount.important &&
        !isForbiddenMainAmount(amount)
    ) ||
    null
  );
}

function isForbiddenMainAmount(
  amount
) {
  const role =
    String(amount?.role || "");

  return [
    "companyLegalAmount",
    "legalInformationAmount",
    "invoiceLineAmount",
    "installmentAmount",
    "vat",
    "ht",
    "ttcAmount",
    "example",
    "table_value",
    "deposit"
  ].includes(role);
}

/*
 * =====================================================
 * DATES
 * =====================================================
 */

function pickRelevantDate(
  dates,
  status
) {
  const list =
    Array.isArray(dates)
      ? dates
      : [];

  if (!list.length) {
    return null;
  }

  if (
    status === "refund_expected" ||
    status === "refunded"
  ) {
    return (
      list.find(
        (date) =>
          date.role === "refundDate"
      ) ||

      list.find((date) =>
        /rembours/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||

      null
    );
  }

  if (status === "already_paid") {
    return (
      list.find(
        (date) =>
          date.role === "paymentDate"
      ) ||
      null
    );
  }

  if (status === "automatic_debit") {
    return (
      list.find(
        (date) =>
          date.role === "debitDate"
      ) ||

      list.find((date) =>
        /prélèvement|prelevement|prélevé|preleve|débité|debite/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||

      null
    );
  }

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

/*
 * =====================================================
 * ÉMETTEUR
 * =====================================================
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

/*
 * =====================================================
 * EXPLICATION DES PREUVES
 * =====================================================
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
