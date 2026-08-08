/**
 * Scoring générique traçable : chaque delta a un signal nommé.
 * Poids centralisés dans weights.ts.
 */

import type {
  CandidateContext,
  EntityCandidate,
  RoleHypothesis,
  ScoreReason
} from "../../types/entityCandidate.js";
import { clamp01 } from "../../types/confidence.js";
import { contextBlob } from "../context.js";
import { normalizeLex } from "../normalize.js";
import { SCORE_WEIGHTS } from "../weights.js";

function pushReason(
  reasons: ScoreReason[],
  signal: string,
  delta: number
): void {
  if (!delta) return;
  reasons.push({ signal, delta });
}

function sumScore(reasons: ScoreReason[]): number {
  const total = reasons.reduce((acc, r) => acc + r.delta, 0);
  return clamp01(total);
}

function lex(ctx: CandidateContext): {
  same: string;
  prev: string;
  next: string;
  before: string;
  after: string;
  blob: string;
} {
  return {
    same: normalizeLex(ctx.sameLine),
    prev: normalizeLex(ctx.previousLine),
    next: normalizeLex(ctx.nextLine),
    before: normalizeLex(ctx.before),
    after: normalizeLex(ctx.after),
    blob: normalizeLex(contextBlob(ctx))
  };
}

function labelHit(
  reasons: ScoreReason[],
  L: ReturnType<typeof lex>,
  pattern: RegExp,
  signalBase: string,
  weightSame: number = SCORE_WEIGHTS.sameLineLabel,
  weightPrev: number = SCORE_WEIGHTS.previousLineLabel,
  weightNext: number = SCORE_WEIGHTS.nextLineLabel
): boolean {
  let hit = false;
  if (pattern.test(L.same) || pattern.test(L.before) || pattern.test(L.after)) {
    pushReason(reasons, `sameLineLabel:${signalBase}`, weightSame);
    hit = true;
  } else if (pattern.test(L.prev)) {
    pushReason(reasons, `previousLineLabel:${signalBase}`, weightPrev);
    hit = true;
  } else if (pattern.test(L.next)) {
    pushReason(reasons, `nextLineLabel:${signalBase}`, weightNext);
    hit = true;
  }
  return hit;
}

/** Zone locale autour du montant (évite qu’un HT distant vole un TTC). */
function localTaxZone(L: ReturnType<typeof lex>): string {
  return `${L.before.slice(-40)} ${L.after.slice(0, 40)}`;
}

function applyNegativeMoneyContext(
  reasons: ScoreReason[],
  L: ReturnType<typeof lex>,
  role: string
): void {
  const invoiceLike = [
    "amountHT",
    "amountTTC",
    "amountDue",
    "refundAmount",
    "vatAmount",
    "netToPay",
    "linePrice",
    "offerPrice"
  ].includes(role);

  if (/capital\s+social|au\s+capital/.test(L.blob)) {
    if (role === "capitalSocial") {
      pushReason(reasons, "positive:capitalSocial", SCORE_WEIGHTS.sameLineLabel);
    } else if (invoiceLike) {
      pushReason(
        reasons,
        "negative:capitalSocial",
        SCORE_WEIGHTS.capitalSocialPenalty
      );
    }
  }
  if (/plafond/.test(L.blob) && invoiceLike) {
    pushReason(reasons, "negative:plafond", SCORE_WEIGHTS.plafondPenalty);
  }
  if (/\bexemple\b|par\s+exemple/.test(L.blob) && invoiceLike) {
    pushReason(reasons, "negative:exemple", SCORE_WEIGHTS.exemplePenalty);
  }
  if (
    /titre\s+d['’]?exemple|a\s+titre\s+illustratif|uniquement\s+a\s+titre|montants?\s+sont\s+donnes/.test(
      L.blob
    ) &&
    invoiceLike
  ) {
    pushReason(reasons, "negative:illustratif", SCORE_WEIGHTS.illustratifPenalty);
  }
  if (/tarif\s+indicatif|prix\s+indicatif/.test(L.blob) && invoiceLike) {
    pushReason(
      reasons,
      "negative:tarifIndicatif",
      SCORE_WEIGHTS.tarifIndicatifPenalty
    );
  }
  if (/ancien\s+montant|ancien\s+solde|solde\s+anterieur/.test(L.blob) && invoiceLike) {
    pushReason(
      reasons,
      "negative:ancienMontant",
      SCORE_WEIGHTS.ancienMontantPenalty
    );
  }
  if (
    (role === "amountDue" || role === "amountTTC" || role === "netToPay") &&
    /deja\s+(paye|prelev)|acompte|sous[-\s]?total|remise\b|mensualit/.test(L.same)
  ) {
    pushReason(reasons, "negative:alreadyPaidOrPartial", SCORE_WEIGHTS.alreadyPaidPenalty);
  }

  // Phrase explicative / sous-composante (« représente X sur cette facture », réseau…)
  // ≠ total / dû / remboursement principal
  const explanatoryComponent =
    /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement|contribution\s+au\s+service/.test(
      L.same
    );
  if (explanatoryComponent) {
    if (
      role === "amountHT" ||
      role === "amountTTC" ||
      role === "amountDue" ||
      role === "netToPay" ||
      role === "refundAmount" ||
      role === "amountPaid"
    ) {
      pushReason(
        reasons,
        "negative:explanatoryComponent",
        SCORE_WEIGHTS.explanatoryComponentPenalty
      );
    } else if (role === "linePrice") {
      pushReason(reasons, "positive:componentLine", 0.35);
    }
  }

  // Remboursement ≠ montant dû / prélèvement sortant
  if (
    (role === "amountDue" || role === "netToPay") &&
    /rembours|solde\s+crediteur|a\s+votre\s+credit|rien\s+a\s+faire/.test(L.blob)
  ) {
    pushReason(
      reasons,
      "negative:refundNotDue",
      SCORE_WEIGHTS.refundNotDuePenalty
    );
  }
}

function scoreMoneyRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  if (!ctx) {
    pushReason(reasons, "base:money", SCORE_WEIGHTS.baseMoney);
    return { role, score: sumScore(reasons), reasons };
  }
  const L = lex(ctx);
  pushReason(reasons, "base:money", SCORE_WEIGHTS.baseMoney);

  if (/€|eur/.test(normalizeLex(candidate.raw || "")) || /€|eur/.test(L.same)) {
    pushReason(reasons, "currency:EUR", SCORE_WEIGHTS.currencyEur);
  }
  if (typeof candidate.value === "number" && Number.isInteger(candidate.value) === false) {
    pushReason(reasons, "form:decimals", SCORE_WEIGHTS.moneyDecimals);
  }

  if (role === "amountHT") {
    const zone = localTaxZone(L);
    const htLocal = /\bhtva\b|\bht\b|hors\s*taxes?/.test(zone);
    const ttcLocal = /\bttc\b|toutes\s*taxes/.test(zone);
    if (htLocal && !ttcLocal) {
      pushReason(reasons, "localLabel:HT", SCORE_WEIGHTS.sameLineLabel);
    } else if (htLocal && ttcLocal) {
      // Préférer le marqueur adjacent au montant
      if (/^\s*(€|eur)?\s*(htva|\bht\b)/i.test(L.after) || /(htva|\bht\b)\s*$/i.test(L.before)) {
        pushReason(reasons, "localLabel:HT:adjacent", SCORE_WEIGHTS.sameLineLabel);
      } else if (/^\s*(€|eur)?\s*ttc/i.test(L.after)) {
        pushReason(reasons, "negative:localTTCnotHT", -0.55);
      } else {
        labelHit(reasons, L, /\bhtva\b|\bht\b|hors\s*taxes?|net\s+ht/, "HT", 0.25, 0.2, 0.1);
      }
    } else {
      labelHit(reasons, L, /\bhtva\b|\bht\b|hors\s*taxes?|net\s+ht/, "HT");
    }
    // Sous-total / remise / composante : moins crédible comme HT final
    if (/sous[-\s]?total|remise\b|acheminement|services?\b|abonnement/.test(L.same)) {
      pushReason(reasons, "negative:partialHt", -0.45);
    }
    if (/net\s+ht|total\s+htva|total\s+ht\b/.test(L.same)) {
      pushReason(reasons, "lexical:netHT", 0.2);
    }
    // Proximité TVA utile pour un HT de bundle — pas pour la ligne « TVA : X € »
    if (
      (/\btva\b/.test(L.next) || /\btva\b/.test(L.prev)) &&
      !/^\s*tva\b/.test(L.same) &&
      /\bhtva\b|\bht\b|hors\s*taxes?|total\s+ht/.test(L.same)
    ) {
      pushReason(reasons, "nearVATBlock", SCORE_WEIGHTS.nearLabelProximity);
    }
  } else if (role === "amountTTC") {
    const zone = localTaxZone(L);
    const htLocal = /\bhtva\b|\bht\b|hors\s*taxes?/.test(zone);
    const ttcLocal = /\bttc\b|toutes\s*taxes/.test(zone);
    if (ttcLocal && !htLocal) {
      pushReason(reasons, "localLabel:TTC", SCORE_WEIGHTS.sameLineLabel);
    } else if (ttcLocal && htLocal) {
      if (/^\s*(€|eur)?\s*ttc/i.test(L.after) || /\bttc\s*$/i.test(L.before)) {
        pushReason(reasons, "localLabel:TTC:adjacent", SCORE_WEIGHTS.sameLineLabel);
      } else if (/^\s*(€|eur)?\s*(htva|\bht\b)/i.test(L.after)) {
        pushReason(reasons, "negative:localHTnotTTC", -0.55);
      } else {
        labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC", 0.25, 0.2, 0.1);
      }
    } else {
      labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC");
    }
    if (
      (/\btotal\b/.test(L.same) || /\btotal\b/.test(L.before)) &&
      !/represente|sur\s+cette\s+facture|acheminement|reseaux?\s+publics/.test(L.blob)
    ) {
      pushReason(reasons, "lexical:total", SCORE_WEIGHTS.totalKeyword);
    }
  } else if (role === "refundAmount") {
    // Même ligne (ou précédente) uniquement — la ligne suivante
    // « nous rembourserons » ne doit pas transformer les mensualités précédentes.
    labelHit(
      reasons,
      L,
      /rembourser|remboursement|nous\s+vous\s+rembourser|solde\s+crediteur|a\s+votre\s+credit|montant\s+rembourse|sera\s+rembourse/,
      "refund",
      SCORE_WEIGHTS.sameLineLabel,
      SCORE_WEIGHTS.previousLineLabel * 0.5,
      0
    );
    if (
      /nous\s+vous\s+rembourser|rembourserons|remboursement\b|sera\s+rembourse/.test(
        L.same
      )
    ) {
      pushReason(reasons, "lexical:refund", SCORE_WEIGHTS.refundKeyword);
    }
    if (/mensualit|deja\s+(paye|prelev|facture)|paiements?\s+anterieurs/.test(L.same)) {
      pushReason(reasons, "negative:mensualitesNotRefund", -0.85);
    }
  } else if (role === "amountPaid") {
    labelHit(
      reasons,
      L,
      /mensualit|deja\s+(paye|prelev|facture)|paiements?\s+(anterieurs|factures)|acomptes?\s+factures/,
      "paid"
    );
    if (/mensualit/.test(L.same)) {
      pushReason(reasons, "lexical:mensualites", 0.35);
    }
  } else if (role === "amountDue") {
    // « à payer » / reste dû : même ligne ou précédente — PAS la ligne suivante
    // (évite qu’un montant « déjà prélevé » hérite du « reste à payer » suivant)
    labelHit(
      reasons,
      L,
      /reste\s+a\s+payer|montant\s+restant|net\s*a\s*payer|somme\s*a\s*payer|devez\s+regler|(?<!deja\s+)a\s*payer/,
      "payable",
      SCORE_WEIGHTS.sameLineLabel,
      SCORE_WEIGHTS.previousLineLabel,
      0
    );
    if (/reste\s+a\s+payer|montant\s+restant\s+du/.test(L.same)) {
      pushReason(reasons, "lexical:resteAPayer", SCORE_WEIGHTS.resteAPayerBoost);
    } else if (/(?<!deja\s+)a\s*payer|devez\s+regler/.test(L.same)) {
      pushReason(reasons, "lexical:aPayer", SCORE_WEIGHTS.payableKeyword);
    }
    // Prélèvement prévu sortant (pas « déjà prélevé », pas remboursement)
    if (
      /montant\s+(du\s+)?prelevement|prelevement\s+de/.test(L.same) &&
      !/deja\s+prelev|rembours/.test(L.blob)
    ) {
      pushReason(reasons, "lexical:prelevementDue", SCORE_WEIGHTS.payableKeyword);
    }
    // Mode prélèvement + remboursement ≠ dû sortant
    if (
      /prelevement\s+automatique/.test(L.blob) &&
      /rembours|rien\s+a\s+faire/.test(L.blob)
    ) {
      pushReason(reasons, "negative:directDebitMethodNotOutgoing", -0.55);
    }
    // Total TTC sans libellé payable : faible candidat « dû » seulement
    if (/\bttc\b/.test(L.same) && !/a\s*payer|restant|du\b|regler/.test(L.same)) {
      pushReason(reasons, "lexical:totalTtcAsDue", SCORE_WEIGHTS.totalKeyword * 0.35);
    }
  } else if (role === "vatAmount") {
    // Montant TVA — JAMAIS un pourcentage
    if (candidate.type === "percentage") {
      pushReason(
        reasons,
        "negative:percentAsMoney",
        SCORE_WEIGHTS.percentAsMoneyPenalty
      );
    } else {
      // Exiger un libellé TVA proche du montant (tolère OCR « TVA2O% »)
      const vatCue = /\btva\b|\btva\d|\bvat\b|montant\s+tva/;
      const vatLocal = vatCue.test(
        `${L.before.slice(-30)} ${L.after.slice(0, 30)} ${L.same}`
      );
      if (vatLocal && vatCue.test(L.same)) {
        pushReason(reasons, "sameLineLabel:TVA", SCORE_WEIGHTS.sameLineLabel);
      } else if (
        vatCue.test(L.prev) &&
        !/\btotal\b|\bttc\b|\bhtva\b|\bht\b|rembours|mensualit/.test(L.same)
      ) {
        pushReason(
          reasons,
          "previousLineLabel:TVA",
          SCORE_WEIGHTS.previousLineLabel * 0.5
        );
      }
      // Ligne HT explicite ≠ montant TVA
      if (/\bht\b|\bhtva\b|hors\s*taxes?/.test(L.same) && !vatCue.test(L.same)) {
        pushReason(reasons, "negative:htLineNotVat", -0.6);
      }
      // « TVA 20 % : 4,33 » — le % voisin ne doit pas voler le rôle montant
      if (/%/.test(L.same) && /\btva\b/.test(L.same)) {
        pushReason(reasons, "nearVATRate", SCORE_WEIGHTS.nearLabelProximity);
      }
      // Totaux / HT / remboursement / mensualités ≠ montant de TVA
      if (
        /\btotal\b|\bttc\b|\bhtva\b|net\s+ht|sous[-\s]?total|remise\b|deja\s+(paye|prelev)|rembours|mensualit|represente/.test(
          L.same
        )
      ) {
        pushReason(reasons, "negative:nonVatLine", -0.55);
      }
    }
  } else if (role === "linePrice") {
    labelHit(reasons, L, /prix\s*unitaire|\bpu\b|ligne|detail/, "line");
  } else if (role === "offerPrice") {
    labelHit(reasons, L, /\boffre\b|forfait|abonnement|promo/, "offer");
  } else if (role === "capitalSocial") {
    labelHit(reasons, L, /capital\s+social|au\s+capital/, "capital");
  } else if (role === "balance") {
    labelHit(reasons, L, /\bsolde\b/, "balance");
  } else if (role === "netToPay") {
    labelHit(reasons, L, /net\s*a\s*payer/, "net");
  } else if (role === "other") {
    pushReason(reasons, "base:other", 0.05);
  }

  applyNegativeMoneyContext(reasons, L, role);

  // Gros montants ronds (type capital) moins crédibles comme total facture
  if (
    typeof candidate.value === "number" &&
    candidate.value >= 100_000 &&
    Number.isInteger(candidate.value) &&
    (role === "amountTTC" || role === "amountDue" || role === "amountHT")
  ) {
    pushReason(
      reasons,
      "negative:largeRoundCapitalLike",
      SCORE_WEIGHTS.largeRoundCapitalLike
    );
  }

  return { role, score: sumScore(reasons), reasons };
}

function scorePercentageRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:percentage", SCORE_WEIGHTS.basePercentage);
  pushReason(reasons, "unit:percent", SCORE_WEIGHTS.percentUnit);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "vatRate") {
    labelHit(reasons, L, /\btva\b|\bvat\b|taux/, "TVA");
    // Un % près de TVA est un taux, pas un montant
    pushReason(reasons, "notMoneyAmount", 0.1);
  } else if (role === "discountRate") {
    labelHit(reasons, L, /remise|rabais|reduction/, "discount");
  }
  return { role, score: sumScore(reasons), reasons };
}

function scoreReferenceRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:reference", SCORE_WEIGHTS.baseReference);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "clientNumber") {
    if (/n[°o]?\s*client|numero\s+client/.test(L.same) || /n[°o]?\s*client/.test(L.prev)) {
      pushReason(
        reasons,
        "sameLineLabel:clientNumber",
        SCORE_WEIGHTS.clientNumberKeyword
      );
    }
  } else if (role === "invoiceNumber") {
    labelHit(reasons, L, /n[°o]?\s*(de\s*)?facture|facture\s*n/, "invoiceNumber");
  } else if (role === "accountIdentifier") {
    labelHit(reasons, L, /n[°o]?\s*compte|identifiant/, "accountId");
  } else if (role === "dossierReference") {
    labelHit(reasons, L, /dossier|reference|ref\b/, "dossier");
  }
  // Jamais une personne
  pushReason(reasons, "notPerson", 0.05);
  return { role, score: sumScore(reasons), reasons };
}

function scorePersonRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:person", SCORE_WEIGHTS.basePerson);
  const value = String(candidate.value || "");
  if (/^\d+$/.test(value.replace(/\s/g, ""))) {
    pushReason(
      reasons,
      "negative:numericAsPerson",
      SCORE_WEIGHTS.numericAsPersonPenalty
    );
  }
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (/n[°o]?\s*client/.test(L.blob)) {
    pushReason(
      reasons,
      "negative:clientNumberContext",
      SCORE_WEIGHTS.numericAsPersonPenalty
    );
  }
  if (/\b(m\.?|mme|mr|monsieur|madame)\b/.test(L.same)) {
    pushReason(reasons, "civility", SCORE_WEIGHTS.personCivility);
  }
  if (role === "recipient") {
    labelHit(reasons, L, /client|destinataire|vos\s+coordonnees|adressees?\s+a/, "recipient");
  } else if (role === "sender") {
    labelHit(reasons, L, /emetteur|expediteur|de la part/, "sender");
  }
  return { role, score: sumScore(reasons), reasons };
}

function scoreOrganizationRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:organization", SCORE_WEIGHTS.baseOrganization);
  if (/\b(sas|sarl|sa|sci|eurl)\b/i.test(String(candidate.value))) {
    pushReason(reasons, "legalForm", SCORE_WEIGHTS.organizationLegalForm);
  }
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "legalIssuer") {
    labelHit(reasons, L, /mentions\s+legales|rcs|siren|siret/, "legal");
  } else if (role === "issuer") {
    labelHit(reasons, L, /emetteur|facture\s+de|bienvenue\s+chez/, "issuer");
  }
  return { role, score: sumScore(reasons), reasons };
}

function scoreDateRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:date", SCORE_WEIGHTS.baseDate);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "invoiceDate") {
    labelHit(reasons, L, /date\s+(de\s+)?facture|date\s+d['’]?emission|emise\s+le/, "invoiceDate");
  } else if (role === "refundDate") {
    labelHit(
      reasons,
      L,
      /rembourser|remboursement|sera\s+rembourse|rembourse\s+le|au\s+\d{1,2}/,
      "refundDate"
    );
    if (/rembourserons?\s+(au|le)|sera\s+rembourse/.test(L.blob)) {
      pushReason(reasons, "lexical:refundDate", 0.35);
    }
  } else if (role === "paymentDate") {
    labelHit(
      reasons,
      L,
      /prelevement|sera\s+prelev|preleve\s+le|date\s+de\s+prelevement|paiement\s+le/,
      "paymentDate"
    );
    // Date de remboursement ≠ date de prélèvement sortant
    if (/rembours/.test(L.blob) && !/sera\s+prelev|preleve\s+automatiquement/.test(L.blob)) {
      pushReason(reasons, "negative:refundNotPaymentDate", -0.5);
    }
  } else if (role === "dueDate" || role === "deadline") {
    labelHit(
      reasons,
      L,
      /echeance|arrive\s+a\s+echeance|a\s+payer\s+avant|au\s+plus\s+tard|avant\s+le|dans\s+un\s+delai|merci\s+de|date\s+limite|limite\s+de\s+paiement|reglez|effectuez\s+le\s+virement/,
      "deadline"
    );
    // Date de prélèvement automatique / remboursement ≠ deadline d'action
    if (
      (/prelevement\s+automatique|sera\s+prelev|preleve\s+automatiquement|date\s+de\s+prelevement/.test(
        L.blob
      ) ||
        (/rembours/.test(L.blob) && /rien\s+a\s+faire/.test(L.blob))) &&
      !/avant\s+le|a\s+payer\s+avant|reglez|merci\s+de/.test(L.blob)
    ) {
      pushReason(reasons, "negative:autoDebitNotDeadline", -0.6);
    }
    // « arrive à échéance » = dueDate informative, pas actionDeadline
    if (/arrive\s+a\s+echeance/.test(L.blob) && role === "deadline") {
      pushReason(reasons, "negative:dueDateNotActionDeadline", -0.35);
    }
  } else if (role === "documentDate") {
    labelHit(reasons, L, /\bdate\b/, "date");
  }
  // Mentions légales / création société ≠ date de facture
  if (
    (role === "invoiceDate" || role === "documentDate" || role === "dueDate") &&
    /date\s+de\s+creation|creation\s+de\s+(la\s+)?societe|capital\s+social/.test(
      L.blob
    )
  ) {
    pushReason(reasons, "negative:companyCreationDate", -0.55);
  }
  return { role, score: sumScore(reasons), reasons };
}

function scoreActionRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:action", 0.25);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "requestedAction") {
    if (
      /merci\s+de|remercions\s+de|veuillez|vous\s+devez|nous\s+vous\s+prions|transmettre/.test(
        L.same
      )
    ) {
      pushReason(reasons, "sameLineLabel:imperative", 0.45);
    }
    if (/avant\s+le|au\s+plus\s+tard|dans\s+un\s+delai/.test(L.same)) {
      pushReason(reasons, "nearDeadlineCue", 0.2);
    }
  }
  return { role, score: sumScore(reasons), reasons };
}

function scoreGeneric(
  candidate: EntityCandidate,
  role: string,
  baseSignal: string,
  baseWeight: number
): RoleHypothesis {
  const reasons: ScoreReason[] = [];
  pushReason(reasons, baseSignal, baseWeight);
  if (candidate.type === "iban" && role.includes("iban")) {
    pushReason(reasons, "type:iban", SCORE_WEIGHTS.ibanKeyword);
  }
  return { role, score: sumScore(reasons), reasons };
}

export function scoreRole(
  candidate: EntityCandidate,
  role: string
): RoleHypothesis {
  switch (candidate.type) {
    case "money":
      return scoreMoneyRole(candidate, role);
    case "percentage":
      return scorePercentageRole(candidate, role);
    case "reference":
      return scoreReferenceRole(candidate, role);
    case "person":
      return scorePersonRole(candidate, role);
    case "organization":
      return scoreOrganizationRole(candidate, role);
    case "date":
      return scoreDateRole(candidate, role);
    case "action":
      return scoreActionRole(candidate, role);
    case "iban":
      return scoreGeneric(candidate, role, "base:iban", SCORE_WEIGHTS.baseIban);
    case "bic":
      return scoreGeneric(candidate, role, "base:bic", SCORE_WEIGHTS.baseIban);
    case "siren":
      return scoreGeneric(candidate, role, "base:siren", SCORE_WEIGHTS.baseSiren);
    case "siret":
      return scoreGeneric(candidate, role, "base:siret", SCORE_WEIGHTS.baseSiret);
    case "email":
      return scoreGeneric(candidate, role, "base:email", SCORE_WEIGHTS.baseEmail);
    case "phone":
      return scoreGeneric(candidate, role, "base:phone", SCORE_WEIGHTS.basePhone);
    case "address":
      return scoreGeneric(
        candidate,
        role,
        "base:address",
        SCORE_WEIGHTS.baseAddress
      );
    default:
      return scoreGeneric(candidate, role, "base:other", 0.1);
  }
}
