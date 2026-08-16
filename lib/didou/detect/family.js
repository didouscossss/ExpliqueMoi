/**
 * B — Détection documentaire multi-signaux V2.
 *
 * Objectifs :
 * - ne jamais classifier sur un mot isolé ;
 * - faire concourir plusieurs familles ;
 * - utiliser des signaux positifs ET négatifs ;
 * - distinguer type de document et domaine ;
 * - éviter qu'une attestation devienne une facture ;
 * - rester générique : assurance, emploi, fiscal,
 *   logement, administratif, etc.
 */

/**
 * @param {{
 *   text: string,
 *   lines: string[],
 *   extraction: object
 * }} input
 *
 * @returns {{
 *   family: string,
 *   documentType: string|null,
 *   confidence: number,
 *   signals: string[],
 *   understandingLevel: string
 * }}
 */
export function detectDocumentFamily(input) {
  const text =
    String(
      input?.text || ""
    );

  const lower =
    normalizeText(
      text
    );

  const lines =
    Array.isArray(
      input?.lines
    )
      ? input.lines
      : [];

  const title =
    normalizeText(
      lines[0] || ""
    );

  const head =
    normalizeText(
      lines
        .slice(0, 12)
        .join(" \n ")
    );

  const refs =
    input?.extraction
      ?.entities
      ?.references || [];

  /**
   * Candidats.
   */
  const candidates = [];

  const push = (
    family,
    documentType,
    score,
    signals = []
  ) => {
    const safeScore =
      Math.max(
        0,
        Math.round(
          Number(score) || 0
        )
      );

    if (
      safeScore <= 0
    ) {
      return;
    }

    candidates.push({
      family,
      documentType,
      score:
        safeScore,
      signals
    });
  };

  /*
   * =====================================================
   * SIGNAUX GLOBAUX
   * =====================================================
   */

  const proofSignals =
    detectProofSignals({
      lower,
      title,
      head
    });

  const insuranceSignals =
    detectInsuranceSignals({
      lower,
      title,
      head
    });

  const invoiceSignals =
    detectInvoiceSignals({
      lower,
      title,
      head
    });

  /*
   * =====================================================
   * ATTESTATION / JUSTIFICATIF
   * =====================================================
   *
   * Ce candidat est générique.
   *
   * On détermine ensuite le domaine :
   * assurance, emploi, santé, administratif...
   */

  {
    let score =
      proofSignals.score;

    const signals =
      [...proofSignals.signals];

    /*
     * Une attestation explicitement placée
     * dans le titre est un signal très fort.
     */

    if (
      /attestation|certificat|justificatif/.test(
        title
      )
    ) {
      score += 35;

      signals.push(
        "title:proof"
      );
    }

    /*
     * "atteste que" / "certifie que"
     * est beaucoup plus structurant qu'un
     * simple mot présent dans les CGV.
     */

    if (
      /atteste que|certifie que|certifions que|nous attestons/.test(
        head
      )
    ) {
      score += 30;

      signals.push(
        "structure:certification"
      );
    }

    /*
     * Domaine assurance.
     */

    if (
      insuranceSignals.score >= 25
    ) {
      const domainScore =
        Math.min(
          35,
          insuranceSignals.score
        );

      score +=
        domainScore;

      signals.push(
        ...insuranceSignals.signals
      );

      push(
        "assurance",
        score >= 65
          ? "Attestation d’assurance"
          : "Attestation / justificatif d’assurance",
        score,
        signals
      );
    } else {
      /*
       * Preuve générique.
       */

      push(
        "administratif",
        score >= 65
          ? inferProofDocumentType(
              lower,
              title
            )
          : null,
        score,
        signals
      );
    }
  }

  /*
   * =====================================================
   * QUITTANCE DE LOYER
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /quittance/.test(
        lower
      )
    ) {
      score += 45;

      signals.push(
        "vocab:quittance"
      );
    }

    if (
      /loyer/.test(
        lower
      )
    ) {
      score += 20;

      signals.push(
        "vocab:loyer"
      );
    }

    if (
      /bailleur|locataire|\bbail\b/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "vocab:bail"
      );
    }

    if (
      /recu|atteste|paiement/.test(
        lower
      ) &&
      /loyer|quittance/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "structure:preuve-paiement"
      );
    }

    if (
      /quittance de loyer/.test(
        title
      ) ||
      /quittance de loyer/.test(
        head
      )
    ) {
      score += 25;

      signals.push(
        "title:quittance"
      );
    }

    push(
      "logement",
      score >= 50
        ? "Quittance de loyer"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * FACTURE
   * =====================================================
   *
   * IMPORTANT :
   *
   * "facture" seul ne suffit plus.
   *
   * On exige une structure financière cohérente.
   */

  {
    let score =
      invoiceSignals.score;

    const signals =
      [...invoiceSignals.signals];

    /*
     * Titre explicite.
     */

    if (
      /^facture\b/.test(
        title
      ) ||
      /\bfacture\s+n[°o]/.test(
        head
      )
    ) {
      score += 35;

      signals.push(
        "title:facture"
      );
    }

    /*
     * Plusieurs signaux financiers cohérents.
     */

    const strongFinancialSignals =
      countTrue([
        /net a payer|montant a payer|montant du|reste a payer|total a regler/.test(
          lower
        ),

        /\btotal ttc\b/.test(
          lower
        ),

        /\bn[°o]\s*(?:de\s*)?facture\b|reference facture|ref facture/.test(
          lower
        ),

        /date de facture|facture du/.test(
          lower
        ),

        /prelevement automatique|sera preleve|sera debite/.test(
          lower
        ),

        /mode de paiement|moyen de paiement|reglement/.test(
          lower
        )
      ]);

    if (
      strongFinancialSignals >= 2
    ) {
      score += 25;

      signals.push(
        "structure:invoice-strong"
      );
    }

    if (
      strongFinancialSignals >= 3
    ) {
      score += 20;

      signals.push(
        "structure:invoice-confirmed"
      );
    }

    /*
     * ===================================================
     * PÉNALITÉS GÉNÉRIQUES
     * ===================================================
     */

    /*
     * Attestation très forte :
     * une référence à une facture dans le texte
     * ne doit pas transformer le document en facture.
     */

    if (
      proofSignals.score >= 60
    ) {
      score -= 55;

      signals.push(
        "negative:strong-proof-document"
      );
    }

    /*
     * "attestation" dans le titre.
     */

    if (
      /attestation|certificat|justificatif/.test(
        title
      )
    ) {
      score -= 60;

      signals.push(
        "negative:proof-title"
      );
    }

    /*
     * Un contrat peut parler de facturation,
     * TVA, cotisations, paiement, etc.
     *
     * Sans structure de facture forte,
     * il ne faut pas basculer en facture.
     */

    if (
      /conditions generales|conditions particulieres|\bcontrat\b|souscripteur/.test(
        head
      ) &&
      strongFinancialSignals < 2
    ) {
      score -= 30;

      signals.push(
        "negative:contract-context"
      );
    }

    push(
      "facture",
      score >= 60
        ? "Facture"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * ASSURANCE — CONTRAT / COURRIER
   * =====================================================
   *
   * Candidat distinct de l'attestation.
   */

  {
    let score =
      insuranceSignals.score;

    const signals =
      [...insuranceSignals.signals];

    let documentType =
      null;

    if (
      /conditions particulieres|conditions generales/.test(
        lower
      ) &&
      /\bcontrat\b|souscripteur|assure/.test(
        lower
      )
    ) {
      score += 35;

      documentType =
        "Contrat d’assurance";

      signals.push(
        "structure:insurance-contract"
      );
    }

    /*
     * Si c'est clairement une attestation,
     * le candidat assurance générique ne doit
     * pas concurrencer l'attestation.
     */

    if (
      proofSignals.score >= 60
    ) {
      score -= 25;

      signals.push(
        "negative:proof-priority"
      );
    }

    push(
      "assurance",
      score >= 55
        ? documentType ||
          "Document d’assurance"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * LIASSE / FISCAL
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /liasse fiscale/.test(
        lower
      )
    ) {
      score += 50;

      signals.push(
        "vocab:liasse"
      );
    }

    if (
      /\b2031(?:-sd)?\b/i.test(
        text
      ) ||
      refs.some(
        (r) =>
          /2031/i.test(
            String(
              r?.value || ""
            )
          )
      )
    ) {
      score += 40;

      signals.push(
        "form:2031"
      );
    }

    if (
      /declaration de resultats/.test(
        lower
      )
    ) {
      score += 25;

      signals.push(
        "vocab:declaration-resultats"
      );
    }

    if (
      /benefices?\s+(industriels|professionnels|commerciaux)|\bbic\b|\bbnc\b/.test(
        lower
      )
    ) {
      score += 12;

      signals.push(
        "rubric:bic"
      );
    }

    if (
      /dgfip|direction generale des finances|impots\.gouv/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "issuer:dgfip"
      );
    }

    const type =
      score >= 55
        ? /\b2031/i.test(
            text
          )
          ? "Liasse fiscale — formulaire 2031-SD"
          : /liasse/.test(
              lower
            )
            ? "Liasse fiscale"
            : "Déclaration de résultats"
        : null;

    push(
      "fiscal",
      type,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * CONVOCATION AG COPROPRIÉTÉ
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /convocation/.test(
        lower
      )
    ) {
      score += 30;

      signals.push(
        "vocab:convocation"
      );
    }

    if (
      /assemblee generale|\bag\b/.test(
        lower
      )
    ) {
      score += 30;

      signals.push(
        "vocab:ag"
      );
    }

    if (
      /copropriete|syndic/.test(
        lower
      )
    ) {
      score += 25;

      signals.push(
        "vocab:copro"
      );
    }

    if (
      /ordre du jour|procuration|pouvoir/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "structure:ag"
      );
    }

    push(
      "copropriete",
      score >= 55
        ? "Convocation à une assemblée générale de copropriété"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * EMPLOI
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /bulletin de (?:paie|salaire)|salaire net/.test(
        lower
      )
    ) {
      score += 65;

      signals.push(
        "vocab:paie"
      );
    }

    /*
     * Attestation employeur.
     */

    if (
      proofSignals.score >= 50 &&
      /employeur|emploi|salarie|salariee|travail/.test(
        lower
      )
    ) {
      score +=
        proofSignals.score * 0.7;

      signals.push(
        "proof:employment"
      );
    }

    let type =
      null;

    if (
      /bulletin de (?:paie|salaire)/.test(
        lower
      )
    ) {
      type =
        "Bulletin de salaire";
    } else if (
      proofSignals.score >= 50 &&
      /employeur|emploi|salarie|travail/.test(
        lower
      )
    ) {
      type =
        "Attestation employeur";
    }

    push(
      "emploi",
      type,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * BANCAIRE
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /releve de compte/.test(
        lower
      )
    ) {
      score += 45;

      signals.push(
        "vocab:releve-compte"
      );
    }

    if (
      /\biban\b|\bbic\b/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "vocab:iban"
      );
    }

    if (
      /banque|credit agricole|credit mutuel|societe generale|bnp|boursobank/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "domain:bank"
      );
    }

    push(
      "bancaire",
      score >= 50
        ? "Relevé bancaire"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * SOCIAL
   * =====================================================
   */

  if (
    /\bcaf\b/.test(
      lower
    ) &&
    /allocation|dossier|prestation/.test(
      lower
    )
  ) {
    push(
      "social",
      "Courrier CAF",
      55,
      [
        "issuer:caf"
      ]
    );
  }

  /*
   * =====================================================
   * SANTÉ
   * =====================================================
   */

  if (
    /\bcpam\b|\bameli\b/.test(
      lower
    )
  ) {
    let score =
      50;

    const signals =
      ["issuer:cpam"];

    if (
      proofSignals.score >= 50
    ) {
      score += 25;

      signals.push(
        "proof:health"
      );

      push(
        "sante",
        "Attestation de droits",
        score,
        signals
      );
    } else {
      push(
        "sante",
        "Courrier CPAM",
        score,
        signals
      );
    }
  }

  /*
   * =====================================================
   * CONTRAT GÉNÉRIQUE
   * =====================================================
   */

  {
    let score = 0;

    const signals = [];

    if (
      /\bcontrat\b/.test(
        lower
      )
    ) {
      score += 25;

      signals.push(
        "vocab:contrat"
      );
    }

    if (
      /soussign|article\s+\d|conditions generales|conditions particulieres/.test(
        lower
      )
    ) {
      score += 25;

      signals.push(
        "structure:contract"
      );
    }

    if (
      /date d effet|duree du contrat|resiliation/.test(
        lower
      )
    ) {
      score += 15;

      signals.push(
        "structure:contract-life"
      );
    }

    /*
     * Une attestation peut mentionner le contrat
     * qu'elle atteste.
     *
     * Le mot "contrat" ne doit donc pas lui voler
     * la classification.
     */

    if (
      proofSignals.score >= 60
    ) {
      score -= 35;

      signals.push(
        "negative:proof-document"
      );
    }

    push(
      "contrat",
      score >= 55
        ? "Contrat"
        : null,
      score,
      signals
    );
  }

  /*
   * =====================================================
   * CLASSEMENT
   * =====================================================
   */

  candidates.sort(
    (a, b) => {
      /*
       * Score principal.
       */
      if (
        b.score !== a.score
      ) {
        return (
          b.score -
          a.score
        );
      }

      /*
       * À score égal :
       * type précis avant famille seule.
       */
      if (
        b.documentType &&
        !a.documentType
      ) {
        return 1;
      }

      if (
        a.documentType &&
        !b.documentType
      ) {
        return -1;
      }

      return 0;
    }
  );

  const best =
    candidates[0];

  const second =
    candidates[1] ||
    null;

  /*
   * =====================================================
   * RIEN DE SUFFISANT
   * =====================================================
   */

  if (
    !best ||
    best.score < 25
  ) {
    return {
      family:
        "autre",

      documentType:
        null,

      confidence:
        Math.max(
          10,
          best?.score || 0
        ),

      signals:
        best?.signals || [],

      understandingLevel:
        "extraction"
    };
  }

  /*
   * =====================================================
   * AMBIGUÏTÉ ENTRE DEUX FAMILLES
   * =====================================================
   *
   * Exemple :
   * assurance 70
   * facture 68
   *
   * On ne prétend pas être certain.
   */

  const margin =
    second
      ? best.score -
        second.score
      : best.score;

  /*
   * Type fort + bonne avance.
   */

  if (
    best.documentType &&
    best.score >= 75 &&
    margin >= 12
  ) {
    return {
      family:
        best.family,

      documentType:
        best.documentType,

      confidence:
        Math.min(
          96,
          best.score
        ),

      signals:
        best.signals,

      understandingLevel:
        "strong"
    };
  }

  /*
   * Type probable.
   */

  if (
    best.documentType &&
    best.score >= 55
  ) {
    let confidence =
      Math.min(
        88,
        best.score
      );

    /*
     * Deux candidats très proches :
     * prudence.
     */

    if (
      margin < 10
    ) {
      confidence =
        Math.min(
          confidence,
          72
        );
    }

    return {
      family:
        best.family,

      documentType:
        best.documentType,

      confidence,

      signals:
        best.signals,

      understandingLevel:
        margin >= 8
          ? "probable"
          : "family"
    };
  }

  /*
   * Famille seulement.
   */

  return {
    family:
      best.family,

    documentType:
      null,

    confidence:
      Math.min(
        70,
        best.score
      ),

    signals:
      best.signals,

    understandingLevel:
      "family"
  };
}

/**
 * =====================================================
 * SIGNAUX PREUVE / ATTESTATION
 * =====================================================
 */

function detectProofSignals({
  lower,
  title,
  head
}) {
  let score = 0;

  const signals = [];

  if (
    /\battestation\b/.test(
      lower
    )
  ) {
    score += 40;

    signals.push(
      "vocab:attestation"
    );
  }

  if (
    /\bcertificat\b/.test(
      lower
    )
  ) {
    score += 35;

    signals.push(
      "vocab:certificat"
    );
  }

  if (
    /\bjustificatif\b/.test(
      lower
    )
  ) {
    score += 30;

    signals.push(
      "vocab:justificatif"
    );
  }

  if (
    /atteste que|certifie que|certifions que|nous attestons/.test(
      lower
    )
  ) {
    score += 35;

    signals.push(
      "structure:certify"
    );
  }

  if (
    /pour servir et valoir ce que de droit|fait foi/.test(
      lower
    )
  ) {
    score += 25;

    signals.push(
      "structure:legal-proof"
    );
  }

  if (
    /attestation|certificat|justificatif/.test(
      title
    )
  ) {
    score += 30;

    signals.push(
      "title:proof"
    );
  } else if (
    /attestation|certificat|justificatif/.test(
      head
    )
  ) {
    score += 15;

    signals.push(
      "head:proof"
    );
  }

  return {
    score:
      Math.min(
        score,
        120
      ),

    signals
  };
}

/**
 * =====================================================
 * SIGNAUX ASSURANCE
 * =====================================================
 */

function detectInsuranceSignals({
  lower,
  title,
  head
}) {
  let score = 0;

  const signals = [];

  if (
    /\bassurance\b|\bassureur\b/.test(
      lower
    )
  ) {
    score += 25;

    signals.push(
      "domain:insurance"
    );
  }

  if (
    /\bassure\b|\bassuree\b|souscripteur/.test(
      lower
    )
  ) {
    score += 15;

    signals.push(
      "insurance:insured"
    );
  }

  if (
    /police d assurance|numero de police|n° de police/.test(
      lower
    )
  ) {
    score += 25;

    signals.push(
      "insurance:policy"
    );
  }

  if (
    /garantie|garanties|responsabilite civile|multirisque|habitation|vehicule assure/.test(
      lower
    )
  ) {
    score += 20;

    signals.push(
      "insurance:coverage"
    );
  }

  if (
    /prime d assurance|cotisation d assurance/.test(
      lower
    )
  ) {
    score += 10;

    signals.push(
      "insurance:premium"
    );
  }

  if (
    /assurance|assureur/.test(
      title
    ) ||
    /assurance|assureur/.test(
      head
    )
  ) {
    score += 15;

    signals.push(
      "head:insurance"
    );
  }

  return {
    score:
      Math.min(
        score,
        100
      ),

    signals
  };
}

/**
 * =====================================================
 * SIGNAUX FACTURE
 * =====================================================
 */

function detectInvoiceSignals({
  lower,
  title,
  head
}) {
  let score = 0;

  const signals = [];

  /*
   * Le mot facture devient un signal,
   * pas une conclusion.
   */

  if (
    /\bfacture\b/.test(
      lower
    )
  ) {
    score += 20;

    signals.push(
      "vocab:facture"
    );
  }

  /*
   * Titre = plus fort.
   */

  if (
    /^facture\b/.test(
      title
    )
  ) {
    score += 30;

    signals.push(
      "title:facture"
    );
  }

  /*
   * Structure fiscale de facture.
   */

  if (
    /\btotal ttc\b|dont tva|montant ht|total ht/.test(
      lower
    )
  ) {
    score += 20;

    signals.push(
      "structure:invoice-totals"
    );
  }

  /*
   * Le simple mot TVA est trop faible :
   * beaucoup de contrats et documents
   * juridiques le contiennent.
   */

  if (
    /\btva\b/.test(
      lower
    )
  ) {
    score += 5;

    signals.push(
      "weak:tva"
    );
  }

  /*
   * Paiement.
   */

  if (
    /net a payer|montant a payer|montant du|reste a payer|total a regler|somme a regler/.test(
      lower
    )
  ) {
    score += 25;

    signals.push(
      "finance:amount-due"
    );
  }

  /*
   * Référence facture.
   */

  if (
    /n[°o]\s*(?:de\s*)?facture|reference facture|ref facture/.test(
      lower
    )
  ) {
    score += 25;

    signals.push(
      "structure:invoice-reference"
    );
  }

  /*
   * Paiement automatique.
   */

  if (
    /prelevement automatique|sera preleve|sera debite/.test(
      lower
    )
  ) {
    score += 15;

    signals.push(
      "finance:debit"
    );
  }

  /*
   * Une simple référence client reste faible.
   */

  if (
    /n[°o]\s*client|reference client/.test(
      lower
    )
  ) {
    score += 5;

    signals.push(
      "weak:client-reference"
    );
  }

  /*
   * La structure doit être principalement
   * présente vers le début du document.
   */

  if (
    /\bfacture\b/.test(
      head
    ) &&
    /total|payer|regler|ttc/.test(
      head
    )
  ) {
    score += 20;

    signals.push(
      "head:invoice-structure"
    );
  }

  return {
    score:
      Math.min(
        score,
        120
      ),

    signals
  };
}

/**
 * =====================================================
 * TYPE DE PREUVE GÉNÉRIQUE
 * =====================================================
 */

function inferProofDocumentType(
  lower,
  title
) {
  if (
    /attestation/.test(
      title
    ) ||
    /attestation/.test(
      lower
    )
  ) {
    return "Attestation";
  }

  if (
    /certificat/.test(
      title
    ) ||
    /certificat/.test(
      lower
    )
  ) {
    return "Certificat";
  }

  if (
    /justificatif/.test(
      title
    ) ||
    /justificatif/.test(
      lower
    )
  ) {
    return "Justificatif";
  }

  return "Attestation / justificatif";
}

/**
 * =====================================================
 * OUTILS
 * =====================================================
 */

function countTrue(
  values
) {
  return values.filter(
    Boolean
  ).length;
}

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
