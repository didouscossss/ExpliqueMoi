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

function applyNegativeMoneyContext(
  reasons: ScoreReason[],
  L: ReturnType<typeof lex>,
  role: string
): void {
  const invoiceLike = [
    "amountHT",
    "amountTTC",
    "amountDue",
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
    labelHit(reasons, L, /\bht\b|hors\s*taxes?/, "HT");
    if (/\btva\b/.test(L.next) || /\btva\b/.test(L.same)) {
      pushReason(reasons, "nearVATBlock", SCORE_WEIGHTS.nearLabelProximity);
    }
  } else if (role === "amountTTC" || role === "amountDue") {
    labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC");
    if (role === "amountDue") {
      labelHit(
        reasons,
        L,
        /a\s*payer|montant\s*(?:du\s*)?prelevement|net\s*a\s*payer|somme\s*a\s*payer/,
        "payable",
        SCORE_WEIGHTS.payableKeyword,
        SCORE_WEIGHTS.previousLineLabel,
        SCORE_WEIGHTS.nextLineLabel
      );
    }
    if (/\btotal\b/.test(L.same) || /\btotal\b/.test(L.before)) {
      pushReason(reasons, "lexical:total", SCORE_WEIGHTS.totalKeyword);
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
      labelHit(reasons, L, /\btva\b|\bvat\b|montant\s+tva/, "TVA");
      // « TVA 20 % : 4,33 » — le % voisin ne doit pas voler le rôle montant
      if (/%/.test(L.same) && /\btva\b/.test(L.same)) {
        pushReason(reasons, "nearVATRate", SCORE_WEIGHTS.nearLabelProximity);
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
  } else if (role === "dueDate" || role === "deadline") {
    labelHit(
      reasons,
      L,
      /echeance|a\s+payer\s+avant|au\s+plus\s+tard|avant\s+le|dans\s+un\s+delai|merci\s+de|date\s+limite|limite\s+de\s+paiement/,
      "deadline"
    );
  } else if (role === "documentDate") {
    labelHit(reasons, L, /\bdate\b/, "date");
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
