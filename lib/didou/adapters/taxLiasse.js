/**
 * E — Adaptateur liasse fiscale / déclaration de résultats V3.
 *
 * Objectifs :
 * - reconnaître un formulaire fiscal ;
 * - distinguer un formulaire vierge d'une déclaration remplie ;
 * - ne jamais inventer de date ou de montant ;
 * - ignorer les dates de loi, notice, modèle, version ou exemple ;
 * - ne retenir une période fiscale que si son contexte est explicite ;
 * - éviter les dumps de tableaux fiscaux.
 */

export function adaptTaxLiasse(ctx) {
  const text =
    String(ctx?.text || "");

  const extraction =
    ctx?.extraction || {};

  const detection =
    ctx?.detection || {};

  const references =
    extraction?.entities?.references || [];

  const organizations =
    extraction?.entities?.organizations || [];

  const amounts =
    Array.isArray(extraction?.amounts)
      ? extraction.amounts
      : [];

  /*
   * =====================================================
   * FORMULAIRE
   * =====================================================
   */

  const formRef =
    references.find(
      (ref) =>
        /2031|2035|2042|2065|cerfa/i.test(
          String(ref?.value || "")
        )
    ) ||
    findFormReference(text);

  /*
   * =====================================================
   * PÉRIODE FISCALE
   * =====================================================
   */

  const period =
    pickFiscalPeriod(
      extraction,
      text
    );

  /*
   * =====================================================
   * MONTANT PRINCIPAL
   * =====================================================
   */

  const reliableAmount =
    pickReliableFiscalAmount(
      amounts
    );

  /*
   * =====================================================
   * ÉMETTEUR
   * =====================================================
   */

  const issuer =
    organizations.find(
      (organization) =>
        /dgfip|finances publiques|imp[oô]t/i.test(
          String(organization || "")
        )
    ) ||
    (
      /dgfip|direction générale des finances publiques|direction generale des finances publiques|impots\.gouv/i.test(
        text
      )
        ? "Direction générale des Finances publiques"
        : null
    );

  /*
   * =====================================================
   * TYPE DU DOCUMENT
   * =====================================================
   */

  const documentType =
    buildFiscalDocumentType({
      detection,
      formRef,
      text
    });

  /*
   * =====================================================
   * FORMULAIRE VIERGE ?
   * =====================================================
   */

  const blankForm =
    isProbablyBlankFiscalForm({
      text,
      formRef,
      period,
      reliableAmount
    });

  /*
   * =====================================================
   * FAITS IMPORTANTS
   * =====================================================
   */

  const importantFacts = [];

  importantFacts.push({
    kind:
      "type",

    label:
      "Type de document",

    value:
      documentType,

    confidence:
      Math.max(
        detection?.confidence || 0,
        formRef ? 90 : 70
      )
  });

  if (formRef) {
    importantFacts.push({
      kind:
        "reference",

      label:
        "Formulaire",

      value:
        formRef.value,

      confidence:
        92
    });
  }

  /*
   * Sur un formulaire vierge :
   * PAS de période.
   */
  if (
    period &&
    !blankForm
  ) {
    importantFacts.push({
      kind:
        "period",

      label:
        "Exercice / période",

      value:
        period.raw,

      confidence:
        period.confidence || 85
    });
  }

  if (
    /bénéfices?\s+(industriels|professionnels|commerciaux)|\bbic\b/i.test(
      text
    )
  ) {
    importantFacts.push({
      kind:
        "rubric",

      label:
        "Rubrique",

      value:
        "Bénéfices industriels et commerciaux",

      confidence:
        78
    });
  }

  /*
   * =====================================================
   * NIVEAU DE COMPRÉHENSION
   * =====================================================
   */

  let understandingLevel =
    "probable";

  let confidence =
    Math.max(
      detection?.confidence || 0,
      formRef ? 88 : 65
    );

  if (
    formRef &&
    !blankForm &&
    (
      period ||
      reliableAmount
    )
  ) {
    understandingLevel =
      "strong";

    confidence =
      Math.max(
        confidence,
        92
      );
  }

  /*
   * Un formulaire vierge peut être parfaitement
   * identifié sans pour autant contenir de données
   * utilisateur.
   */
  if (
    blankForm &&
    formRef
  ) {
    understandingLevel =
      "strong";

    confidence =
      Math.max(
        confidence,
        90
      );
  }

  /*
   * =====================================================
   * RETOUR
   * =====================================================
   */

  return {
    family:
      "fiscal",

    documentType,

    understandingLevel,

    confidence,

    issuer,

    recipient:
      null,

    /*
     * FORMULAIRE VIERGE :
     * aucune date principale.
     */
    mainDate:
      !blankForm &&
      period
        ? {
            date:
              period.raw,

            label:
              "Exercice fiscal",

            meaning:
              "Période fiscale renseignée dans le document",

            role:
              "coveredPeriod"
          }
        : null,

    /*
     * FORMULAIRE VIERGE :
     * aucun montant principal.
     */
    mainAmount:
      !blankForm &&
      reliableAmount
        ? {
            value:
              reliableAmount.value,

            label:
              fiscalAmountLabel(
                reliableAmount.role
              ),

            meaning:
              "Montant fiscal suffisamment contextualisé",

            role:
              reliableAmount.role
          }
        : null,

    importantFacts:
      importantFacts.slice(
        0,
        4
      ),

    actions:
      [],

    deadlines:
      [],

    whyReceived:
      blankForm
        ? buildBlankFormSummary(
            formRef
          )
        : "Ce document concerne une déclaration fiscale professionnelle.",

    documentPurpose:
      blankForm
        ? "Servir de formulaire pour déclarer les résultats professionnels."
        : "Déclarer ou présenter les résultats professionnels d’un exercice fiscal.",

    attentionLevel:
      "none",

    tables:
      [],

    evidence:
      [
        formRef && {
          page:
            "Page 1",

          quote:
            formRef.context ||
            formRef.value,

          explanation:
            "Référence du formulaire fiscal"
        },

        !blankForm &&
        period && {
          page:
            "Page 1",

          quote:
            period.context ||
            period.raw,

          explanation:
            "Période fiscale retenue"
        }
      ].filter(Boolean),

    warnings:
      [],

    uncertainties:
      blankForm
        ? [
            "Le formulaire ne contient pas de période fiscale personnelle suffisamment renseignée.",
            "Aucun montant fiscal principal n’a été identifié."
          ]
        : [
            !period &&
              "Aucune période fiscale suffisamment fiable n’a été identifiée.",

            !reliableAmount &&
              "Aucun montant principal suffisamment fiable n’a été retenu."
          ].filter(Boolean)
  };
}

/**
 * =====================================================
 * RÉFÉRENCE FORMULAIRE
 * =====================================================
 */

function findFormReference(
  text
) {
  const source =
    String(text || "");

  const patterns = [
    /\b(2031[\s\-]?SD)\b/i,
    /\b(2035[\s\-]?SD)\b/i,
    /\b(2065[\s\-]?SD)\b/i,
    /\b(2042[\s\-]?[A-Z]{0,4})\b/i,
    /\b(CERFA\s*(?:n°|no|:)?\s*[0-9A-Z\-]+)\b/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      source.match(
        pattern
      );

    if (
      match?.[1]
    ) {
      return {
        value:
          match[1]
            .replace(
              /\s+/g,
              " "
            )
            .trim(),

        context:
          match[0]
      };
    }
  }

  return null;
}

/**
 * =====================================================
 * TYPE DOCUMENT
 * =====================================================
 */

function buildFiscalDocumentType({
  detection,
  formRef,
  text
}) {
  const detected =
    String(
      detection?.documentType || ""
    ).trim();

  /*
   * Certains détecteurs utilisent une rubrique
   * comme type de document.
   */
  if (
    detected &&
    !/bénéfices professionnels|benefices professionnels/i.test(
      detected
    )
  ) {
    return detected;
  }

  if (
    formRef?.value
  ) {
    return (
      `Déclaration de résultats — formulaire ${formRef.value}`
    );
  }

  if (
    /\b2031\b/i.test(
      text
    )
  ) {
    return (
      "Déclaration de résultats — formulaire 2031-SD"
    );
  }

  return (
    "Liasse fiscale / déclaration de résultats"
  );
}

/**
 * =====================================================
 * FORMULAIRE VIERGE
 * =====================================================
 */

function isProbablyBlankFiscalForm({
  text,
  formRef,
  period,
  reliableAmount
}) {
  const source =
    normalizeText(
      text
    );

  /*
   * Sans référence fiscale claire,
   * on évite de déclarer arbitrairement
   * le document vierge.
   */
  if (
    !formRef &&
    !/2031|2035|2065|declaration de resultats/.test(
      source
    )
  ) {
    return false;
  }

  /*
   * Si une période réellement fiable OU
   * un montant métier principal existe,
   * le formulaire est probablement renseigné.
   */
  if (
    period ||
    reliableAmount
  ) {
    return false;
  }

  /*
   * Indices typiques d'un formulaire modèle.
   */
  let templateScore =
    0;

  const signals = [
    /declaration de resultats/,
    /designation de l entreprise/,
    /designation de l'entreprise/,
    /adresse de l entreprise/,
    /adresse de l'entreprise/,
    /numero siret/,
    /n° siret/,
    /exercice clos le/,
    /date de cloture/,
    /cadre reserve/,
    /ne rien inscrire/,
    /a completer/,
    /formulaire/,
    /cerfa/,
    /benefices industriels et commerciaux/,
    /\bbic\b/
  ];

  for (
    const signal
    of signals
  ) {
    if (
      signal.test(
        source
      )
    ) {
      templateScore += 1;
    }
  }

  /*
   * Un formulaire reconnu sans aucune donnée
   * fiscale fiable est traité comme vierge
   * dès qu'on retrouve plusieurs structures
   * de formulaire.
   */
  return (
    templateScore >= 2
  );
}

/**
 * =====================================================
 * PÉRIODE FISCALE
 * =====================================================
 */

function pickFiscalPeriod(
  extraction,
  text
) {
  const periods =
    Array.isArray(
      extraction?.periods
    )
      ? extraction.periods
      : [];

  const dates =
    Array.isArray(
      extraction?.dates
    )
      ? extraction.dates
      : [];

  const candidates = [];

  /*
   * =====================================================
   * PÉRIODES
   * =====================================================
   */

  for (
    const period
    of periods
  ) {
    const context =
      normalizeText(
        period?.context || ""
      );

    let score =
      0;

    /*
     * Une vraie période date → date est
     * beaucoup plus fiable.
     */
    if (
      period?.kind === "range" &&
      period?.start &&
      period?.end
    ) {
      score += 170;
    }

    /*
     * Contexte fiscal fort.
     */
    if (
      /exercice fiscal|exercice comptable|periode fiscale|periode d imposition/.test(
        context
      )
    ) {
      score += 160;
    }

    /*
     * "exercice du 01/01/... au ..."
     */
    if (
      /exercice.{0,40}du/.test(
        context
      )
    ) {
      score += 120;
    }

    /*
     * Une simple période "Décembre 2030"
     * n'est PAS assez fiable.
     */
    if (
      period?.kind === "month"
    ) {
      score -= 120;
    }

    /*
     * Bruit du modèle.
     */
    if (
      isTemplateOrLegalContext(
        context
      )
    ) {
      score -= 350;
    }

    candidates.push({
      item:
        period,

      score
    });
  }

  /*
   * =====================================================
   * DATES ISOLÉES
   * =====================================================
   */

  for (
    const date
    of dates
  ) {
    const context =
      normalizeText(
        date?.context || ""
      );

    let score =
      0;

    /*
     * Une date seule ne doit être retenue
     * que si elle correspond réellement
     * à une clôture renseignée.
     */
    if (
      /exercice clos le\s+[^_ ]|date de cloture\s*[:\-]\s*\d/.test(
        context
      )
    ) {
      score += 180;
    }

    if (
      date?.role ===
        "coveredPeriod"
    ) {
      score += 60;
    }

    /*
     * Toute date explicitement historique
     * ou réglementaire est rejetée.
     */
    if (
      date?.hint ===
        "legalHistorical" ||
      date?.role ===
        "historical" ||
      date?.role ===
        "legalMention"
    ) {
      score -= 500;
    }

    if (
      isTemplateOrLegalContext(
        context
      )
    ) {
      score -= 400;
    }

    /*
     * Une date isolée est volontairement
     * désavantagée.
     */
    score -= 60;

    candidates.push({
      item:
        date,

      score
    });
  }

  candidates.sort(
    (a, b) =>
      b.score -
      a.score
  );

  if (
    !candidates.length
  ) {
    return null;
  }

  /*
   * Seuil élevé :
   *
   * mieux vaut aucune date
   * qu'une date fausse.
   */
  if (
    candidates[0].score <
    150
  ) {
    return null;
  }

  return candidates[0].item;
}

/**
 * =====================================================
 * BRUIT FORMULAIRE / LÉGAL
 * =====================================================
 */

function isTemplateOrLegalContext(
  context
) {
  const text =
    normalizeText(
      context
    );

  return (
    /cerfa/.test(text) ||
    /notice/.test(text) ||
    /loi n/.test(text) ||
    /loi du/.test(text) ||
    /decret/.test(text) ||
    /arrete/.test(text) ||
    /article \d/.test(text) ||
    /code general des impots/.test(text) ||
    /reference legislative/.test(text) ||
    /reference reglementaire/.test(text) ||
    /version du formulaire/.test(text) ||
    /mise a jour/.test(text) ||
    /modele/.test(text) ||
    /exemple/.test(text)
  );
}

/**
 * =====================================================
 * MONTANT FISCAL
 * =====================================================
 */

function pickReliableFiscalAmount(
  amounts
) {
  const list =
    Array.isArray(amounts)
      ? amounts
      : [];

  const forbiddenRoles =
    new Set([
      "table_value",
      "example",
      "unknown",
      "companyLegalAmount",
      "legalInformationAmount",
      "invoiceLineAmount",
      "vat",
      "ht"
    ]);

  const candidates =
    list
      .filter(
        (amount) =>
          amount?.important &&
          !forbiddenRoles.has(
            amount?.role
          )
      )
      .sort(
        (a, b) =>
          (b.confidence || 0) -
          (a.confidence || 0)
      );

  return (
    candidates[0] ||
    null
  );
}

/**
 * =====================================================
 * RÉSUMÉ FORMULAIRE VIERGE
 * =====================================================
 */

function buildBlankFormSummary(
  formRef
) {
  if (
    formRef?.value
  ) {
    return (
      `Il s’agit du formulaire fiscal ${formRef.value}, qui semble vierge ou non renseigné.`
    );
  }

  return (
    "Il s’agit d’un formulaire fiscal qui semble vierge ou non renseigné."
  );
}

/**
 * =====================================================
 * LABEL MONTANT
 * =====================================================
 */

function fiscalAmountLabel(
  role
) {
  const map = {
    amountDue:
      "Montant à payer",

    refundAmount:
      "Remboursement",

    paidAmount:
      "Montant payé",

    automaticDebitAmount:
      "Prélèvement",

    penalty:
      "Pénalité"
  };

  return (
    map[role] ||
    "Montant"
  );
}

/**
 * =====================================================
 * NORMALISATION
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
