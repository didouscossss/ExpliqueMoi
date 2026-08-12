/**
 * E — Adaptateur facture.
 *
 * Didou distingue :
 * - montant à payer
 * - prélèvement automatique prévu
 * - facture déjà payée / déjà prélevée
 * - remboursement attendu
 * - situation incertaine
 */

export function adaptInvoice(ctx) {
  const { extraction, detection } = ctx;

  /*
   * IMPORTANT :
   * ctx n'existe qu'à l'intérieur de cette fonction.
   */
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

  const issuer = pickIssuer(
    organizations,
    text
  );

  /*
   * On commence par détecter la situation globale
   * de paiement à partir du texte complet.
   */
  const paymentStatus =
    detectGlobalPaymentStatus(lowerText);

  /*
   * Puis on cherche le montant le plus cohérent
   * pour cette situation.
   */
  const selectedAmount =
    pickAmountForStatus(
      amounts,
      paymentStatus,
      lowerText
    );

  /*
   * Fallback :
   * si aucun statut n'est identifié mais qu'un
   * montant à payer classique est clairement présent.
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
   * Si aucun statut global n'a été trouvé,
   * mais qu'un montant dû fiable existe,
   * on considère une facture à payer.
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
      confidence:
        Math.max(
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
   * PRÉLÈVEMENT AUTOMATIQUE À VENIR
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
        confidence:
          Math.max(
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

    actions.push({
      action:
        "Aucun paiement manuel nécessaire",
      how:
        "Vérifiez simplement que votre compte sera suffisamment approvisionné.",
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
        confidence:
          Math.max(
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

    actions.push({
      action:
        "Aucun paiement supplémentaire nécessaire",
      how:
        "Conservez ce document comme justificatif.",
      confidence: 90
    });

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
   * REMBOURSEMENT ATTENDU
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
        confidence:
          Math.max(
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

    actions.push({
      action:
        "Aucun paiement à effectuer",
      how:
        "Surveillez simplement votre compte pour vérifier la réception du remboursement.",
      confidence: 90
    });

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
   * INCERTAIN
   * =====================================================
   */
  else {
    /*
     * Contrairement à la version précédente,
     * on ne fait pas disparaître tous les montants.
     *
     * On peut montrer un montant détecté mais
     * sans prétendre qu'il faut le payer.
     */
    const candidate =
      pickBestNeutralAmount(amounts);

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
        confidence:
          Math.min(
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
   * ÉMETTEUR
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
   * PREUVES
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
 *
 * On utilise ici le texte COMPLET du document,
 * et non uniquement les 80 caractères autour
 * d'un montant.
 */
function detectGlobalPaymentStatus(text) {
  const source = String(text || "").toLowerCase();

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
   * 2 — Remboursement prévu / avoir en votre faveur.
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
 * Cherche le montant le plus cohérent
 * avec la situation identifiée.
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
   * =====================================================
   * 1 — REMBOURSEMENT DÉJÀ EFFECTUÉ
   * =====================================================
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
   * =====================================================
   * 2 — REMBOURSEMENT À VENIR
   * =====================================================
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
   * =====================================================
   * 3 — DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
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
   * =====================================================
   * 4 — PRÉLÈVEMENT AUTOMATIQUE FUTUR
   * =====================================================
   */
  if (status === "automatic_debit") {
    return (
      findAmountByContext(
        list,
        /prélèvement|prelevement|sera prélevé|sera preleve|prélevé automatiquement|preleve automatiquement|sera débité|sera debite|débit automatique|debit automatique/
      ) ||

      /*
       * Si le document annonce clairement un prélèvement
       * mais que le contexte OCR du montant est incomplet,
       * on peut reprendre le montant marqué amountDue.
       */
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
   * =====================================================
   * 5 — MONTANT À PAYER MANUELLEMENT
   * =====================================================
   */
  if (status === "to_pay") {
    return (
      /*
       * Priorité au montant que l'interpréteur
       * a déjà reconnu comme montant dû.
       */
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

  /*
   * Statut non identifié :
   * on ne transforme aucun montant en montant à payer.
   */
  return null;
}
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
 * Fallback prudent utilisant le texte complet.
 *
 * On ne choisit jamais automatiquement
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

  const match = source.match(
    phraseRegex
  );

  if (!match) {
    return null;
  }

  /*
   * Lorsque les contextes OCR ne permettent
   * pas une correspondance fiable,
   * ne pas inventer.
   */
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
 * En cas de statut inconnu,
 * conserve un candidat sans lui donner
 * arbitrairement le rôle "à payer".
 */
function pickBestNeutralAmount(amounts) {
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
 * Date adaptée au statut.
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

  if (status === "refund_expected") {
    return (
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
      list.find((date) =>
        /payé|paye|prélevé|preleve/.test(
          String(date.context || "")
            .toLowerCase()
        )
      ) ||
      null
    );
  }

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
 * Émetteur.
 *
 * Plus de règle spécifique SIMER.
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
   * Quelques marques / organismes peuvent
   * être présents clairement dans le texte
   * mais absents de entities.organizations.
   *
   * Ici on reste générique :
   * acronymes majuscules uniquement.
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

function getAmountExplanation(
  status
) {
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
