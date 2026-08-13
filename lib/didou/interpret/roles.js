/**
 * D — Interprétation des rôles.
 *
 * Une valeur détectée n'est pas forcément
 * une information importante pour l'utilisateur.
 */

/**
 * Attribue un rôle probable à un montant selon son contexte.
 *
 * @param {object} amount
 * @param {{ family?: string, documentType?: string|null }} meta
 */
export function interpretAmountRole(
  amount,
  meta = {}
) {
  const ctx =
    String(amount?.context || "")
      .toLowerCase();

  const family =
    String(meta.family || "")
      .toLowerCase();

  const type =
    String(meta.documentType || "")
      .toLowerCase();
const hints =
  Array.isArray(amount?.hints)
    ? amount.hints
    : [];

const line =
  String(amount?.line || "")
    .toLowerCase();

const before =
  String(amount?.before || "")
    .toLowerCase();

const after =
  String(amount?.after || "")
    .toLowerCase();

const paragraph =
  String(amount?.paragraph || "")
    .toLowerCase();

const fullContext =
  [
    ctx,
    line,
    before,
    after,
    paragraph
  ]
    .join(" ")
    .toLowerCase();
  /*
 * =====================================================
 * PRIORITÉS V4 BASÉES SUR LES HINTS
 * =====================================================
 */

if (hints.includes("company_legal")) {
  return {
    role: "companyLegalAmount",
    confidence: 99,
    important: false
  };
}


if (hints.includes("automatic_debit")) {
  return {
    role: "automaticDebitAmount",
    confidence: 95,
    important: true
  };
}

if (hints.includes("already_paid")) {
  return {
    role: "paidAmount",
    confidence: 95,
    important: true
  };
}

if (hints.includes("payment_due")) {
  return {
    role: "amountDue",
    confidence: 95,
    important: true
  };
}

if (hints.includes("installment")) {
  return {
    role: "installmentAmount",
    confidence: 92,
    important: false
  };
}

if (hints.includes("invoice_line")) {
  return {
    role: "invoiceLineAmount",
    confidence: 88,
    important: false
  };
}

if (hints.includes("vat")) {
  return {
    role: "vat",
    confidence: 90,
    important: false
  };
}

if (hints.includes("ht")) {
  return {
    role: "ht",
    confidence: 90,
    important: false
  };
}
  /*
   * =====================================================
   * 1 — INFORMATIONS LÉGALES / SOCIÉTÉ
   * =====================================================
   *
   * Exemple :
   * "Orange SA au capital de 10 640 226 396 €"
   *
   * Ce montant ne doit JAMAIS devenir le montant
   * principal d'une facture.
   */
  const nearBefore =
  String(amount?.before || "")
    .slice(-100)
    .toLowerCase();

const nearAfter =
  String(amount?.after || "")
    .slice(0, 60)
    .toLowerCase();

const legalLocalContext =
  `${nearBefore} ${nearAfter}`;

if (
  /capital social|au capital de|capital de la société|capital de la societe|capital\s*[:-]|capital souscrit|capital détenu|capital detenu/.test(
    legalLocalContext
  )
) {
  return {
    role: "companyLegalAmount",
    confidence: 95,
    important: false
  };
}

  /*
   * Autres mentions légales contenant éventuellement
   * des valeurs monétaires.
   */
  if (
    /rcs|registre du commerce|siren|siret|siège social|siege social|mentions légales|mentions legales/.test(
      ctx
    )
  ) {
    return {
      role: "legalInformationAmount",
      confidence: 88,
      important: false
    };
  }

  /*
   * =====================================================
   * 2 — EXEMPLES / INFORMATIONS INDICATIVES
   * =====================================================
   */
  if (
    /exemple|sample|pour information|à titre indicatif|a titre indicatif/.test(
      ctx
    )
  ) {
    return {
      role: "example",
      confidence: 40,
      important: false
    };
  }

  /*
   * =====================================================
   * 3 — TABLEAUX FISCAUX
   * =====================================================
   */
  if (
    /tableau|ligne|case|rubrique/.test(fullContext) &&
    family === "fiscal"
  ) {
    return {
      role: "table_value",
      confidence: 45,
      important: false
    };
  }

  /*
   * =====================================================
   * 4 — REMBOURSEMENT
   * =====================================================
   *
   * Cette règle doit passer AVANT TTC / amountDue.
   *
   * Exemple :
   * "Nous vous rembourserons 397,63 €"
   */
  if (
    /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement prévu|remboursement prevu|à vous rembourser|a vous rembourser|montant remboursé|montant rembourse|rembours|avoir en votre faveur|crédit en votre faveur|credit en votre faveur/.test(
      ctx
    )
  ) {
    return {
      role: "refundAmount",
      confidence: 95,
      important: true
    };
  }

  /*
   * =====================================================
   * 5 — REMBOURSEMENT DÉJÀ EFFECTUÉ
   * =====================================================
   */
  if (
    /vous avez été remboursé|vous avez ete rembourse|remboursement effectué|remboursement effectue|remboursé le|rembourse le/.test(
      ctx
    )
  ) {
    return {
      role: "refundedAmount",
      confidence: 95,
      important: true
    };
  }

  /*
   * =====================================================
   * 6 — DÉJÀ PAYÉ / DÉJÀ PRÉLEVÉ
   * =====================================================
   */
  if (
    /facture acquittée|facture acquittee|déjà payé|deja paye|déjà réglé|deja regle|paiement reçu|paiement recu|paiement effectué|paiement effectue|a été prélevé|a ete preleve|déjà prélevé|deja preleve|prélevé le|preleve le/.test(
      ctx
    )
  ) {
    return {
      role: "paidAmount",
      confidence: 92,
      important: true
    };
  }

  /*
   * =====================================================
   * 7 — PRÉLÈVEMENT AUTOMATIQUE FUTUR
   * =====================================================
   */
  if (
    /sera prélevé|sera preleve|prélèvement automatique|prelevement automatique|prélevé automatiquement|preleve automatiquement|nous prélèverons|nous preleverons|sera débité|sera debite|prélèvement prévu|prelevement prevu|débit automatique|debit automatique|paiement par prélèvement|paiement par prelevement/.test(
      ctx
    )
  ) {
    return {
      role: "automaticDebitAmount",
      confidence: 92,
      important: true
    };
  }

  /*
   * =====================================================
   * 8 — QUITTANCES / LOYER PAYÉ
   * =====================================================
   */
  if (
    /quittanc|loyer\s+payé|loyer\s+perçu|montant\s+perçu|reçu la somme|recu la somme|atteste.+paiement/.test(
      ctx
    ) ||
    /quittance/.test(type)
  ) {
    if (
      /loyer|quittanc|payé|paye|perçu|percu|reglé|réglé/.test(
        ctx
      ) ||
      /quittance/.test(type)
    ) {
      return {
        role: "paymentAmount",
        confidence: 85,
        important: true
      };
    }
  }

  /*
   * =====================================================
   * 9 — MENSUALITÉS / ÉCHÉANCIER / LIGNES INTERMÉDIAIRES
   * =====================================================
   *
   * Exemple :
   * "Mensualités facturées : 1 175,00 €"
   *
   * Ce n'est pas automatiquement le montant à payer.
   */
  if (
    /mensualité|mensualites|mensualités|échéancier|echeancier|échéances facturées|echeances facturees|mensualités facturées|mensualites facturees/.test(
      ctx
    )
  ) {
    return {
      role: "installmentAmount",
      confidence: 88,
      important: false
    };
  }

  /*
   * =====================================================
   * 10 — LIGNES DE DÉTAIL DE FACTURE
   * =====================================================
   */
  if (
    /abonnement|forfait|part fixe|part variable|option|service|consommation|régularisation|regularisation|sous-total|sous total/.test(
      ctx
    )
  ) {
    return {
      role: "invoiceLineAmount",
      confidence: 82,
      important: false
    };
  }

  /*
   * =====================================================
   * 11 — MONTANT À PAYER
   * =====================================================
   *
   * On arrive ici seulement si les règles plus spécifiques
   * ci-dessus n'ont pas déjà identifié le montant.
   */
  if (
    /montant à payer|montant a payer|net à payer|net a payer|reste à payer|reste a payer|montant dû|montant du|total à régler|total a regler|somme à régler|somme a regler|à payer|a payer/.test(
      ctx
    )
  ) {
    return {
      role: "amountDue",
      confidence: 92,
      important: true
    };
  }

  /*
   * Total TTC :
   * important, mais moins fort qu'un "net à payer"
   * ou un statut explicite de remboursement/prélèvement.
   */
  if (
    /total ttc|montant ttc|montant du \(?ttc\)?/.test(
      ctx
    )
  ) {
    return {
      role: "amountDue",
      confidence: 82,
      important: true
    };
  }

  /*
   * Un simple "TTC" n'est PAS suffisant pour décider
   * que le montant doit être payé.
   *
   * Il peut s'agir d'une mensualité, d'un détail
   * ou d'une valeur historique.
   */
  if (
    /\bttc\b/.test(fullContext)
  ) {
    return {
      role: "ttcAmount",
      confidence: 65,
      important: false
    };
  }

  /*
   * =====================================================
   * 12 — HT / TVA
   * =====================================================
   */
  if (
    /\bht\b/.test(fullContext)
  ) {
    return {
      role: "ht",
      confidence: 70,
      important: false
    };
  }

  if (
    /\btva\b/.test(fullContext)
  ) {
    return {
      role: "vat",
      confidence: 70,
      important: false
    };
  }

  /*
   * =====================================================
   * 13 — SALAIRE
   * =====================================================
   */
  if (
    /salaire|net à payer|net a payer/.test(
      ctx
    )
  ) {
    return {
      role: "salary",
      confidence: 75,
      important: true
    };
  }

  /*
   * =====================================================
   * 14 — ACOMPTE / DÉPÔT
   * =====================================================
   */
  if (
    /acompte|dépôt|depot/.test(fullContext)
  ) {
    return {
      role: "deposit",
      confidence: 65,
      important: false
    };
  }

  /*
   * =====================================================
   * 15 — PÉNALITÉ / AMENDE
   * =====================================================
   */
  if (
    /pénalité|penalite|majoration|amende/.test(
      ctx
    )
  ) {
    return {
      role: "penalty",
      confidence: 70,
      important: true
    };
  }

  /*
   * Aucun rôle suffisamment fiable.
   */
  return {
    role: "unknown",
    confidence: 35,
    important: false
  };
}

/**
 * Attribue un rôle probable à une date.
 */
export function interpretDateRole(
  date,
  meta = {}
) {
  const ctx =
    String(
      date?.context ||
      date?.hint ||
      ""
    ).toLowerCase();

  const family =
    String(meta.family || "")
      .toLowerCase();

  const type =
    String(meta.documentType || "")
      .toLowerCase();

  /*
   * =====================================================
   * REMBOURSEMENT
   * =====================================================
   */
  if (
    /nous vous rembourserons|vous serez remboursé|vous serez rembourse|remboursement prévu|remboursement prevu|date du remboursement|remboursé le|rembourse le/.test(
      ctx
    )
  ) {
    return {
      role: "refundDate",
      confidence: 92,
      important: true
    };
  }

  /*
   * =====================================================
   * PRÉLÈVEMENT AUTOMATIQUE
   * =====================================================
   */
  if (
    /sera prélevé|sera preleve|prélèvement automatique|prelevement automatique|date du prélèvement|date du prelevement|prélevé le|preleve le|sera débité|sera debite/.test(
      ctx
    )
  ) {
    return {
      role: "debitDate",
      confidence: 90,
      important: true
    };
  }

  /*
   * =====================================================
   * ASSEMBLÉE / CONVOCATION
   * =====================================================
   */
  if (
    /assemblée|assemblee|convocation|ordre du jour|réunion|reunion/.test(
      ctx
    ) ||
    family === "copropriete"
  ) {
    if (
      /assemblée|assemblee|ag\b|convocation|réunion|reunion/.test(
        ctx
      ) ||
      /assemblée|convocation/.test(type)
    ) {
      return {
        role: "meetingDate",
        confidence: 85,
        important: true
      };
    }
  }

  /*
   * =====================================================
   * DATE LIMITE / ÉCHÉANCE
   * =====================================================
   */
  if (
    /avant le|date limite|au plus tard|échéance|echeance|à retourner|a retourner|à régler avant|a regler avant|payable avant/.test(
      ctx
    )
  ) {
    return {
      role: "deadline",
      confidence: 85,
      important: true
    };
  }

  /*
   * =====================================================
   * PÉRIODE COUVERTE
   * =====================================================
   */
  if (
    /période|periode|loyer de|au titre de|mois de/.test(
      ctx
    ) ||
    /quittance/.test(type)
  ) {
    if (
      /période|periode|loyer|mois|du .+ au/.test(
        ctx
      ) ||
      /quittance/.test(type)
    ) {
      return {
        role: "coveredPeriod",
        confidence: 80,
        important: true
      };
    }
  }

  /*
   * =====================================================
   * DATE DE PAIEMENT
   * =====================================================
   */
  if (
    /payé le|paye le|reglé le|réglé le|date de paiement|paiement effectué|paiement effectue/.test(
      ctx
    )
  ) {
    return {
      role: "paymentDate",
      confidence: 80,
      important: true
    };
  }

  /*
   * =====================================================
   * DATE D'ÉMISSION
   * =====================================================
   */
  if (
    /émis|emis|emission|émission|édité|edite|fait à|fait a|date du courrier|date de facture|date de la facture/.test(
      ctx
    )
  ) {
    return {
      role: "issueDate",
      confidence: 70,
      important: false
    };
  }

  /*
   * =====================================================
   * DATE HISTORIQUE / FISCALE
   * =====================================================
   */
  if (
    /historique|exercice\s+\d{4}|année\s+\d{4}/.test(
      ctx
    ) ||
    family === "fiscal"
  ) {
    if (
      /exercice|historique|année/.test(
        ctx
      )
    ) {
      return {
        role: "historical",
        confidence: 55,
        important: false
      };
    }
  }

  /*
   * =====================================================
   * MENTIONS LÉGALES
   * =====================================================
   */
  if (
    /mention légale|mention legale|cgv|article/.test(
      ctx
    )
  ) {
    return {
      role: "legalMention",
      confidence: 40,
      important: false
    };
  }

  return {
    role: "unknown",
    confidence: 30,
    important: false
  };
}

/**
 * Enrichit l'extraction avec les rôles.
 */
export function interpretExtraction(
  extraction,
  meta
) {
  const amounts =
    (extraction.amounts || [])
      .map((item) => {
        const roleInfo =
          interpretAmountRole(
            item,
            meta
          );

        return {
          ...item,
          ...roleInfo
        };
      });

  const dates =
    (extraction.dates || [])
      .map((item) => {
        const roleInfo =
          interpretDateRole(
            item,
            meta
          );

        return {
          ...item,
          ...roleInfo
        };
      });

  const periods =
    (extraction.periods || [])
      .map((item) => ({
        ...item,
        role: "coveredPeriod",
        important: true,
        confidence: Math.max(
          item.confidence || 70,
          75
        )
      }));

  return {
    ...extraction,
    amounts,
    dates,
    periods
  };
}
