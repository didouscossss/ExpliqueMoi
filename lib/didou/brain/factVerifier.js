/**
 * Didou Brain — Fact Verifier V2
 *
 * Objectifs :
 * - vérifier les montants à partir de leur contexte réel ;
 * - vérifier les dates à partir de leur contexte réel ;
 * - pénaliser fortement les informations légales / historiques ;
 * - détecter les contradictions de rôle ;
 * - ne pas considérer un fait comme vérifié uniquement
 *   parce que roles.js lui a donné un rôle ;
 * - préparer une future Fusion V2 fiable.
 */

export function verifyBrainFacts(brain) {
  if (
    !brain ||
    typeof brain !== "object"
  ) {
    return brain;
  }

  verifyAmounts(brain);
  verifyDates(brain);
  verifyEvents(brain);
  verifyIssuer(brain);
  verifyImportantFacts(brain);
  enrichContradictions(brain);
  computeGlobalScore(brain);

  brain.meta = {
    ...(brain.meta || {}),
    verifierVersion: "2.0"
  };

  return brain;
}

/**
 * =====================================================
 * MONTANTS
 * =====================================================
 */

function verifyAmounts(brain) {
  const amounts =
    Array.isArray(brain.amounts)
      ? brain.amounts
      : [];

  for (const amount of amounts) {
    const role =
      normalizeRole(
        amount?.role
      );

    const hints =
      Array.isArray(amount?.hints)
        ? amount.hints
        : [];

    const context =
      normalizeText(
        [
          amount?.before
            ? String(amount.before).slice(-120)
            : "",

          amount?.line || "",

          amount?.after
            ? String(amount.after).slice(0, 120)
            : "",

          amount?.evidence?.quote || ""
        ].join(" ")
      );

    let confidence =
      clamp(
        amount?.confidence || 0,
        0,
        100
      );

    let verificationReason =
      null;

    let contradicted =
      false;

    /*
     * ===================================================
     * CAPITAL SOCIAL / INFORMATION LÉGALE
     * ===================================================
     */

    if (
      isLegalAmountRole(role) ||
      hints.includes("company_legal") ||
      /capital social|au capital de|capital de la societe|capital souscrit/.test(
        context
      )
    ) {
      amount.verified = true;

      amount.userRelevant = false;

      amount.verificationState =
        "verified_secondary";

      amount.verificationReason =
        "Montant identifié comme information légale ou capital social.";

      amount.confidence =
        clamp(
          Math.max(
            confidence,
            90
          ),
          0,
          100
        );

      continue;
    }

    /*
     * ===================================================
     * REMBOURSEMENT
     * ===================================================
     */

    if (
      isRefundRole(role)
    ) {
      let score =
        confidence;

      if (
        hints.includes("refund")
      ) {
        score += 15;
      }

      if (
        /nous vous rembourserons|vous serez rembourse|remboursement prevu|a vous rembourser|avoir en votre faveur|credit en votre faveur|solde crediteur/.test(
          context
        )
      ) {
        score += 30;

        verificationReason =
          "Le montant est directement associé à un remboursement.";
      }

      /*
       * Un montant de mensualité ne doit pas
       * devenir remboursement uniquement parce
       * qu'un remboursement existe ailleurs.
       */
      if (
        /mensualite|mensualites|echeancier/.test(
          context
        )
      ) {
        score -= 45;
      }

      if (
        hints.includes("installment")
      ) {
        score -= 45;
      }

      /*
       * Capital social proche = rejet.
       */
      if (
        /capital social|au capital de/.test(
          context
        )
      ) {
        score -= 70;
        contradicted = true;
      }

      finalizeAmountVerification(
        amount,
        score,
        {
          verificationReason:
            verificationReason ||
            "Rôle remboursement plausible mais preuve locale limitée.",

          contradicted
        }
      );

      continue;
    }

    /*
     * ===================================================
     * PRÉLÈVEMENT AUTOMATIQUE
     * ===================================================
     */

    if (
      isAutomaticDebitRole(role)
    ) {
      let score =
        confidence;

      if (
        hints.includes(
          "automatic_debit"
        )
      ) {
        score += 15;
      }

      if (
        /prelevement automatique|sera preleve|sera debite|nous preleverons|montant du prelevement|montant preleve/.test(
          context
        )
      ) {
        score += 30;

        verificationReason =
          "Le montant est associé à un prélèvement automatique.";
      }

      /*
       * Un prélèvement ne doit pas devenir
       * paiement manuel.
       */
      if (
        /montant a payer|net a payer|reste a payer/.test(
          context
        ) &&
        !/sera preleve|prelevement automatique/.test(
          context
        )
      ) {
        score -= 30;
      }

      finalizeAmountVerification(
        amount,
        score,
        {
          verificationReason:
            verificationReason ||
            "Rôle prélèvement plausible mais preuve locale limitée."
        }
      );

      continue;
    }

    /*
     * ===================================================
     * MONTANT À PAYER
     * ===================================================
     */

    if (
      isAmountDueRole(role)
    ) {
      let score =
        confidence;

      if (
        hints.includes(
          "payment_due"
        )
      ) {
        score += 15;
      }

      if (
        /montant a payer|net a payer|reste a payer|solde a payer|total a regler|somme a regler/.test(
          context
        )
      ) {
        score += 30;

        verificationReason =
          "Le montant est directement associé à une somme à payer.";
      }

      /*
       * Si le document précise que le montant
       * sera prélevé automatiquement, il ne faut
       * pas le présenter comme action manuelle.
       */
      if (
        /sera preleve|prelevement automatique|sera debite|nous preleverons/.test(
          context
        )
      ) {
        score -= 35;

        contradicted = true;

        verificationReason =
          "Le montant semble lié à un prélèvement automatique plutôt qu’à un paiement manuel.";
      }

      /*
       * Remboursement = forte contradiction.
       */
      if (
        /nous vous rembourserons|vous serez rembourse|avoir en votre faveur|solde crediteur/.test(
          context
        )
      ) {
        score -= 60;

        contradicted = true;
      }

      finalizeAmountVerification(
        amount,
        score,
        {
          verificationReason:
            verificationReason ||
            "Montant à payer plausible mais preuve locale limitée.",

          contradicted
        }
      );

      continue;
    }

    /*
     * ===================================================
     * DÉJÀ PAYÉ
     * ===================================================
     */

    if (
      isPaidRole(role)
    ) {
      let score =
        confidence;

      if (
        hints.includes(
          "already_paid"
        )
      ) {
        score += 15;
      }

      if (
        /deja paye|deja regle|paiement effectue|paiement recu|facture acquittee|a ete preleve/.test(
          context
        )
      ) {
        score += 25;

        verificationReason =
          "Le document indique que le paiement a déjà été effectué.";
      }

      finalizeAmountVerification(
        amount,
        score,
        {
          verificationReason:
            verificationReason ||
            "Montant payé plausible mais preuve locale limitée."
        }
      );

      continue;
    }

    /*
     * ===================================================
     * MENSUALITÉS
     * ===================================================
     */

    if (
      role.includes("installment")
    ) {
      let score =
        confidence;

      if (
        hints.includes(
          "installment"
        )
      ) {
        score += 20;
      }

      if (
        /mensualite|mensualites|echeancier/.test(
          context
        )
      ) {
        score += 20;
      }

      amount.confidence =
        clamp(
          score,
          0,
          100
        );

      amount.verified =
        score >= 65;

      amount.userRelevant =
        false;

      amount.verificationState =
        amount.verified
          ? "verified_secondary"
          : "unverified";

      amount.verificationReason =
        "Montant correspondant probablement à une mensualité ou un échéancier.";

      continue;
    }

    /*
     * ===================================================
     * TVA / HT / LIGNES DE FACTURE
     * ===================================================
     */

    if (
      isSecondaryAmountRole(
        role
      )
    ) {
      amount.confidence =
        clamp(
          confidence,
          0,
          100
        );

      amount.verified =
        confidence >= 60;

      amount.userRelevant =
        false;

      amount.verificationState =
        amount.verified
          ? "verified_secondary"
          : "unverified";

      amount.verificationReason =
        "Montant secondaire du document.";

      continue;
    }

    /*
     * ===================================================
     * UNKNOWN
     * ===================================================
     */

    amount.confidence =
      clamp(
        confidence - 15,
        0,
        100
      );

    amount.verified =
      false;

    amount.userRelevant =
      false;

    amount.verificationState =
      "unverified";

    amount.verificationReason =
      "Le rôle exact du montant n’est pas suffisamment établi.";
  }
}

/**
 * Finalisation d'un montant utilisateur.
 */
function finalizeAmountVerification(
  amount,
  score,
  {
    verificationReason,
    contradicted = false
  } = {}
) {
  const finalScore =
    clamp(
      score,
      0,
      100
    );

  amount.confidence =
    finalScore;

  if (
    contradicted &&
    finalScore < 70
  ) {
    amount.verified =
      false;

    amount.userRelevant =
      false;

    amount.verificationState =
      "contradicted";
  } else {
    amount.verified =
      finalScore >= 75;

    amount.userRelevant =
      amount.verified;

    amount.verificationState =
      amount.verified
        ? "verified"
        : "probable";
  }

  amount.verificationReason =
    verificationReason ||
    null;
}

/**
 * =====================================================
 * DATES
 * =====================================================
 */

function verifyDates(brain) {
  const dates =
    Array.isArray(brain.dates)
      ? brain.dates
      : [];

  for (const date of dates) {
    const role =
      normalizeRole(
        date?.role
      );

    const context =
      normalizeText(
        [
          date?.context || "",
          date?.evidence?.quote || ""
        ].join(" ")
      );

    let score =
      clamp(
        date?.confidence || 0,
        0,
        100
      );

    let userRelevant =
      false;

    let reason =
      null;

    /*
     * ===================================================
     * DATE LÉGALE / HISTORIQUE
     * ===================================================
     */

    if (
      isLegalHistoricalDate(
        role,
        context
      )
    ) {
      date.confidence =
        clamp(
          Math.min(
            score,
            35
          ),
          0,
          100
        );

      date.verified =
        true;

      date.userRelevant =
        false;

      date.verificationState =
        "verified_secondary";

      date.verificationReason =
        "Date légale, historique ou réglementaire : non pertinente comme date principale.";

      continue;
    }

    /*
     * ===================================================
     * RÉUNION
     * ===================================================
     */

    if (
      role.includes(
        "meeting"
      )
    ) {
      if (
        /assemblee generale|assemblee|convocation|se tiendra|reunion|date de l assemblee/.test(
          context
        )
      ) {
        score += 25;

        userRelevant =
          true;

        reason =
          "Date directement associée à une réunion ou assemblée.";
      }

      if (
        /\b\d{1,2}(?:h\d{0,2}|:\d{2})\b/.test(
          context
        )
      ) {
        score += 10;
      }
    }

    /*
     * ===================================================
     * DATE LIMITE
     * ===================================================
     */

    if (
      role.includes(
        "deadline"
      )
    ) {
      if (
        /date limite|avant le|au plus tard|echeance|doit etre adresse|date limite de reception/.test(
          context
        )
      ) {
        score += 25;

        userRelevant =
          true;

        reason =
          "Date associée à une échéance ou une date limite.";
      }
    }

    /*
     * ===================================================
     * REMBOURSEMENT
     * ===================================================
     */

    if (
      role.includes(
        "refund"
      )
    ) {
      if (
        /rembours|avoir en votre faveur|credit en votre faveur/.test(
          context
        )
      ) {
        score += 25;

        userRelevant =
          true;

        reason =
          "Date associée à un remboursement.";
      }
    }

    /*
     * ===================================================
     * PRÉLÈVEMENT
     * ===================================================
     */

    if (
      role.includes(
        "debit"
      )
    ) {
      if (
        /prelevement|sera preleve|sera debite/.test(
          context
        )
      ) {
        score += 25;

        userRelevant =
          true;

        reason =
          "Date associée à un prélèvement.";
      }
    }

    /*
     * ===================================================
     * PAIEMENT
     * ===================================================
     */

    if (
      role.includes(
        "payment"
      )
    ) {
      if (
        /paiement|paye le|regle le/.test(
          context
        )
      ) {
        score += 20;

        userRelevant =
          true;

        reason =
          "Date associée à un paiement.";
      }
    }

    /*
     * ===================================================
     * PÉRIODE COUVERTE
     * ===================================================
     */

    if (
      role.includes(
        "coveredperiod"
      )
    ) {
      if (
        /periode|exercice|du .* au|mois de|facturation/.test(
          context
        )
      ) {
        score += 15;

        userRelevant =
          true;

        reason =
          "Date ou période correspondant à la période couverte.";
      }
    }

    /*
     * ===================================================
     * DATE D'ÉMISSION
     * ===================================================
     */

    if (
      role.includes(
        "issue"
      )
    ) {
      /*
       * Date valable mais secondaire.
       */
      date.confidence =
        clamp(
          score,
          0,
          100
        );

      date.verified =
        score >= 60;

      date.userRelevant =
        false;

      date.verificationState =
        date.verified
          ? "verified_secondary"
          : "unverified";

      date.verificationReason =
        "Date d’émission du document : information secondaire.";

      continue;
    }

    /*
     * ===================================================
     * FINALISATION
     * ===================================================
     */

    score =
      clamp(
        score,
        0,
        100
      );

    date.confidence =
      score;

    date.verified =
      score >= 70;

    date.userRelevant =
      date.verified &&
      userRelevant;

    date.verificationState =
      date.verified
        ? (
            userRelevant
              ? "verified"
              : "verified_secondary"
          )
        : "unverified";

    date.verificationReason =
      reason ||
      (
        date.verified
          ? "Date plausible mais rôle utilisateur secondaire."
          : "Le rôle de cette date n’est pas suffisamment prouvé."
      );
  }
}

/**
 * =====================================================
 * ÉVÉNEMENTS
 * =====================================================
 */

function verifyEvents(brain) {
  const events =
    Array.isArray(brain.events)
      ? brain.events
      : [];

  for (const event of events) {
    let score =
      clamp(
        event?.confidence || 0,
        0,
        100
      );

    const amount =
      event?.amount ||
      null;

    const date =
      event?.date ||
      null;

    /*
     * Montant vérifié.
     */
    if (
      amount?.verified &&
      amount?.userRelevant !== false
    ) {
      score += 10;
    }

    /*
     * Date vérifiée.
     */
    if (
      date?.verified &&
      date?.userRelevant !== false
    ) {
      score += 8;
    }

    /*
     * Montant contredit.
     */
    if (
      amount?.verificationState ===
        "contradicted"
    ) {
      score -= 35;
    }

    event.confidence =
      clamp(
        score,
        0,
        100
      );

    event.verified =
      event.confidence >= 75;

    event.verificationState =
      event.verified
        ? "verified"
        : event.confidence >= 55
          ? "probable"
          : "unverified";
  }
}

/**
 * =====================================================
 * ÉMETTEUR
 * =====================================================
 */

function verifyIssuer(brain) {
  const issuer =
    cleanText(
      brain?.issuer
    );

  if (!issuer) {
    brain.issuerVerified =
      false;

    return;
  }

  /*
   * Une forme juridique seule n'est jamais
   * un émetteur.
   */
  if (
    /^(sa|sas|sarl|eurl|sasu|sci|snc)$/i.test(
      issuer
    )
  ) {
    brain.issuerVerified =
      false;

    return;
  }

  /*
   * Trop court.
   */
  if (
    issuer.length < 3
  ) {
    brain.issuerVerified =
      false;

    return;
  }

  brain.issuerVerified =
    true;
}

/**
 * =====================================================
 * IMPORTANT FACTS
 * =====================================================
 */

function verifyImportantFacts(brain) {
  const facts =
    Array.isArray(
      brain.importantFacts
    )
      ? brain.importantFacts
      : [];

  for (const fact of facts) {
    const kind =
      String(
        fact?.kind || ""
      );

    if (
      kind === "amount"
    ) {
      const amount =
        brain.amounts.find(
          (candidate) =>
            normalizeComparable(
              candidate?.value
            ) ===
            normalizeComparable(
              fact?.value
            )
        );

      fact.verified =
        Boolean(
          amount?.verified &&
          amount?.userRelevant !== false
        );

      if (amount) {
        fact.confidence =
          amount.confidence;
      }

      continue;
    }

    if (
      kind === "date"
    ) {
      const date =
        brain.dates.find(
          (candidate) =>
            normalizeComparable(
              candidate?.value
            ) ===
            normalizeComparable(
              fact?.value
            )
        );

      fact.verified =
        Boolean(
          date?.verified &&
          date?.userRelevant !== false
        );

      if (date) {
        fact.confidence =
          date.confidence;
      }

      continue;
    }

    if (
      kind === "issuer"
    ) {
      fact.verified =
        Boolean(
          brain.issuerVerified
        );

      continue;
    }
  }

  /*
   * Les faits non vérifiés restent dans le Brain
   * pour diagnostic, mais pourront être exclus
   * par Fusion V2.
   */
}

/**
 * =====================================================
 * CONTRADICTIONS
 * =====================================================
 */

function enrichContradictions(brain) {
  const contradictions =
    Array.isArray(
      brain.contradictions
    )
      ? [...brain.contradictions]
      : [];

  /*
   * ===================================================
   * Plusieurs remboursements différents
   * ===================================================
   */

  const refunds =
    brain.amounts.filter(
      (amount) =>
        amount.verified &&
        amount.userRelevant &&
        isRefundRole(
          normalizeRole(
            amount.role
          )
        )
    );

  const uniqueRefunds =
    uniqueValues(
      refunds.map(
        (amount) =>
          amount.value
      )
    );

  if (
    uniqueRefunds.length > 1
  ) {
    contradictions.push({
      type:
        "multiple_refund_amounts",

      severity:
        "medium",

      message:
        "Plusieurs montants de remboursement restent candidats."
    });
  }

  /*
   * ===================================================
   * Plusieurs montants à payer
   * ===================================================
   */

  const dues =
    brain.amounts.filter(
      (amount) =>
        amount.verified &&
        amount.userRelevant &&
        isAmountDueRole(
          normalizeRole(
            amount.role
          )
        )
    );

  const uniqueDues =
    uniqueValues(
      dues.map(
        (amount) =>
          amount.value
      )
    );

  if (
    uniqueDues.length > 1
  ) {
    contradictions.push({
      type:
        "multiple_due_amounts",

      severity:
        "medium",

      message:
        "Plusieurs montants à payer restent candidats."
    });
  }

  /*
   * ===================================================
   * Paiement manuel et prélèvement automatique
   * ===================================================
   */

  const hasDue =
    brain.events.some(
      (event) =>
        event.type ===
          "payment_due" &&
        event.verified
    );

  const hasDebit =
    brain.events.some(
      (event) =>
        event.type ===
          "automatic_debit" &&
        event.verified
    );

  if (
    hasDue &&
    hasDebit
  ) {
    contradictions.push({
      type:
        "manual_payment_and_automatic_debit",

      severity:
        "high",

      message:
        "Un paiement manuel et un prélèvement automatique semblent tous deux actifs ; vérification nécessaire."
    });
  }

  /*
   * ===================================================
   * Paiement + remboursement
   * ===================================================
   */

  const hasRefund =
    brain.events.some(
      (event) =>
        event.type ===
          "refund" &&
        event.verified
    );

  if (
    hasRefund &&
    hasDue
  ) {
    contradictions.push({
      type:
        "refund_and_payment_due",

      severity:
        "high",

      message:
        "Le document semble à la fois annoncer un remboursement et demander un paiement."
    });
  }

  brain.contradictions =
    dedupeContradictions(
      contradictions
    );
}

/**
 * =====================================================
 * SCORE GLOBAL
 * =====================================================
 */

function computeGlobalScore(brain) {
  const amounts =
    Array.isArray(brain.amounts)
      ? brain.amounts
      : [];

  const dates =
    Array.isArray(brain.dates)
      ? brain.dates
      : [];

  const events =
    Array.isArray(brain.events)
      ? brain.events
      : [];

  /*
   * Faits utilisateur réellement vérifiés.
   */
  const verifiedAmounts =
    amounts.filter(
      (amount) =>
        amount.verified &&
        amount.userRelevant
    ).length;

  const verifiedDates =
    dates.filter(
      (date) =>
        date.verified &&
        date.userRelevant
    ).length;

  const verifiedEvents =
    events.filter(
      (event) =>
        event.verified
    ).length;

  let verification =
    20;

  verification +=
    verifiedAmounts * 18;

  verification +=
    verifiedDates * 12;

  verification +=
    verifiedEvents * 15;

  if (
    brain.issuerVerified
  ) {
    verification += 8;
  }

  /*
   * Contradictions.
   */
  const highContradictions =
    (brain.contradictions || [])
      .filter(
        (item) =>
          item?.severity ===
          "high"
      )
      .length;

  const mediumContradictions =
    (brain.contradictions || [])
      .filter(
        (item) =>
          item?.severity ===
          "medium"
      )
      .length;

  verification -=
    highContradictions * 20;

  verification -=
    mediumContradictions * 8;

  verification =
    clamp(
      verification,
      0,
      100
    );

  brain.score =
    brain.score ||
    {};

  brain.score.verification =
    verification;

  const extraction =
    Number(
      brain.score.extraction || 0
    );

  const reasoning =
    Number(
      brain.score.reasoning || 0
    );

  /*
   * La vérification pèse maintenant davantage.
   */
  brain.score.global =
    Math.round(
      (
        extraction * 0.25 +
        reasoning * 0.30 +
        verification * 0.45
      )
    );
}

/**
 * =====================================================
 * ROLES MONTANTS
 * =====================================================
 */

function isRefundRole(role) {
  return (
    role.includes(
      "refund"
    ) ||
    role.includes(
      "rembours"
    )
  );
}

function isAutomaticDebitRole(role) {
  return (
    role.includes(
      "automaticdebit"
    ) ||
    role.includes(
      "automatic_debit"
    ) ||
    role === "debit"
  );
}

function isAmountDueRole(role) {
  return (
    role.includes(
      "amountdue"
    ) ||
    role.includes(
      "payment_due"
    ) ||
    role === "due"
  );
}

function isPaidRole(role) {
  return (
    role.includes(
      "paid"
    ) ||
    role.includes(
      "paymentamount"
    )
  );
}

function isLegalAmountRole(role) {
  return (
    role.includes(
      "companylegal"
    ) ||
    role.includes(
      "legalinformation"
    ) ||
    role === "legal"
  );
}

function isSecondaryAmountRole(role) {
  return (
    role === "vat" ||
    role === "ht" ||
    role === "ttc" ||
    role.includes(
      "invoiceline"
    ) ||
    role.includes(
      "table_value"
    ) ||
    role.includes(
      "example"
    )
  );
}

/**
 * =====================================================
 * DATES LÉGALES / HISTORIQUES
 * =====================================================
 */

function isLegalHistoricalDate(
  role,
  context
) {
  if (
    role.includes(
      "legal"
    ) ||
    role.includes(
      "historical"
    )
  ) {
    return true;
  }

  return (
    /loi du|loi n|decret|arrete|article \d|cerfa|notice|reference legislative|reference reglementaire|historique/.test(
      context
    )
  );
}

/**
 * =====================================================
 * NORMALISATION
 * =====================================================
 */

function normalizeRole(value) {
  return normalizeText(
    value
  )
    .replace(
      /\s+/g,
      ""
    );
}

function normalizeText(value) {
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

function normalizeComparable(value) {
  return normalizeText(
    value
  )
    .replace(
      /\s/g,
      ""
    )
    .replace(
      /,/g,
      "."
    );
}

function cleanText(value) {
  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

/**
 * =====================================================
 * UTILITAIRES
 * =====================================================
 */

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .map(
          normalizeComparable
        )
        .filter(Boolean)
    )
  ];
}

function dedupeContradictions(
  contradictions
) {
  const seen =
    new Set();

  return contradictions.filter(
    (item) => {
      const key =
        `${item?.type || ""}|${item?.message || ""}`;

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

function clamp(
  value,
  min,
  max
) {
  const numeric =
    Number(value);

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
