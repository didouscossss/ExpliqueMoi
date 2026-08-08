/**
 * Classification déterministe du type de document.
 *
 * Principes :
 * - signaux forts / secondaires / contradictoires par type ;
 * - IBAN/BIC/prélèvement = secondaires (présents aussi sur les factures) ;
 * - un relevé bancaire exige des marqueurs de mouvements/soldes, pas seulement IBAN ;
 * - une facture avec HT/TVA/TTC + « facture » pénalise fortement relevé_bancaire.
 */

import type { LocalDocumentType } from "../types/LocalAnalysis.js";
import { normalizeCompact } from "./normalize.js";

export interface DocumentTypeGuess {
  documentType: LocalDocumentType;
  confidence: number;
  matched: string[];
  /** Détail des scores (debug / tests). */
  scores?: Record<string, number>;
  signals?: Record<string, string[]>;
}

type SignalKind = "strong" | "secondary" | "negative";

interface Signal {
  kind: SignalKind;
  weight: number;
  pattern: RegExp;
  label: string;
}

interface TypeProfile {
  type: LocalDocumentType;
  signals: Signal[];
  /** Score minimum pour être éligible (évite un IBAN isolé). */
  minScore: number;
}

const PROFILES: TypeProfile[] = [
  {
    type: "facture",
    minScore: 3,
    signals: [
      { kind: "strong", weight: 8, pattern: /\bfacture\s+d['’]/i, label: "facture d'…" },
      { kind: "strong", weight: 7, pattern: /\bfacture\b/i, label: "facture" },
      { kind: "strong", weight: 6, pattern: /\binvoice\b/i, label: "invoice" },
      {
        kind: "strong",
        weight: 5,
        pattern: /(?:n[°oº]|num[eé]ro)\s*(?:de\s*)?facture|facture\s*n[°oº]/i,
        label: "n°/numéro de facture"
      },
      {
        kind: "strong",
        weight: 4,
        pattern: /date\s+(?:de\s+)?facture/i,
        label: "date de facture"
      },
      {
        kind: "strong",
        weight: 5,
        pattern: /(?:total|montant)\s*(?:ht\b|hors\s*taxes?)/i,
        label: "total/montant HT"
      },
      {
        kind: "strong",
        weight: 5,
        pattern: /(?:total|montant)\s*(?:ttc\b|toutes\s*taxes)/i,
        label: "total/montant TTC"
      },
      { kind: "strong", weight: 4, pattern: /\btva\b/i, label: "TVA" },
      {
        kind: "strong",
        weight: 5,
        pattern: /(?:montant|somme|net)\s*[àa]\s*(?:payer|r[eé]gler)|montant\s+de\s+facture/i,
        label: "montant à payer / de facture"
      },
      { kind: "secondary", weight: 3, pattern: /\babonnement\b/i, label: "abonnement" },
      {
        kind: "secondary",
        weight: 3,
        pattern: /\bconsommation\b/i,
        label: "consommation"
      },
      {
        kind: "secondary",
        weight: 3,
        pattern: /taxes?\s+et\s+contributions?/i,
        label: "taxes et contributions"
      },
      {
        kind: "secondary",
        weight: 2,
        pattern: /\b(?:ht|ttc)\b/i,
        label: "HT/TTC"
      },
      // Signaux contradictoires facture
      {
        kind: "negative",
        weight: -8,
        pattern: /relev[ée]\s+(?:de\s+)?compte|relev[ée]\s+bancaire/i,
        label: "contre: relevé de compte"
      },
      {
        kind: "negative",
        weight: -6,
        pattern: /nouveau\s+solde|solde\s+pr[eé]c[eé]dent/i,
        label: "contre: soldes de relevé"
      }
    ]
  },
  {
    type: "devis",
    minScore: 3,
    signals: [
      { kind: "strong", weight: 7, pattern: /\bdevis\b/i, label: "devis" },
      { kind: "strong", weight: 5, pattern: /\bquotation\b/i, label: "quotation" },
      {
        kind: "strong",
        weight: 5,
        pattern: /proposition\s+commerciale/i,
        label: "proposition commerciale"
      },
      { kind: "strong", weight: 4, pattern: /devis\s*n[°oº]/i, label: "devis n°" },
      {
        kind: "secondary",
        weight: 3,
        pattern: /valable\s+jusqu/i,
        label: "valable jusqu'"
      },
      {
        kind: "negative",
        weight: -5,
        pattern: /\bfacture\b/i,
        label: "contre: facture"
      }
    ]
  },
  {
    type: "contrat",
    minScore: 3,
    signals: [
      { kind: "strong", weight: 6, pattern: /\bcontrat\b/i, label: "contrat" },
      { kind: "strong", weight: 5, pattern: /\bconvention\b/i, label: "convention" },
      {
        kind: "strong",
        weight: 5,
        pattern: /entre\s+les\s+soussign/i,
        label: "soussignés"
      },
      { kind: "secondary", weight: 3, pattern: /article\s+1\b/i, label: "article 1" },
      {
        kind: "secondary",
        weight: 3,
        pattern: /lu\s+et\s+approuv/i,
        label: "lu et approuvé"
      }
    ]
  },
  {
    type: "bulletin_de_salaire",
    minScore: 4,
    signals: [
      {
        kind: "strong",
        weight: 8,
        pattern: /bulletin\s+de\s+(salaire|paie)/i,
        label: "bulletin de salaire/paie"
      },
      { kind: "strong", weight: 6, pattern: /salaire\s+net/i, label: "salaire net" },
      { kind: "strong", weight: 5, pattern: /salaire\s+brut/i, label: "salaire brut" },
      {
        kind: "strong",
        weight: 5,
        pattern: /net\s+[àa]\s+payer/i,
        label: "net à payer"
      },
      { kind: "secondary", weight: 3, pattern: /\burssaf\b/i, label: "URSSAF" },
      {
        kind: "secondary",
        weight: 3,
        pattern: /cong[eé]s\s+pay[eé]s/i,
        label: "congés payés"
      }
    ]
  },
  {
    type: "releve_bancaire",
    minScore: 8,
    signals: [
      {
        kind: "strong",
        weight: 10,
        pattern: /relev[ée]\s+(?:de\s+)?compte/i,
        label: "relevé de compte"
      },
      {
        kind: "strong",
        weight: 10,
        pattern: /relev[ée]\s+bancaire/i,
        label: "relevé bancaire"
      },
      {
        kind: "strong",
        weight: 6,
        pattern: /solde\s+pr[eé]c[eé]dent/i,
        label: "solde précédent"
      },
      {
        kind: "strong",
        weight: 6,
        pattern: /nouveau\s+solde/i,
        label: "nouveau solde"
      },
      {
        kind: "strong",
        weight: 5,
        pattern: /solde\s+(?:cr[eé]diteur|d[eé]biteur)/i,
        label: "solde créditeur/débiteur"
      },
      {
        kind: "strong",
        weight: 5,
        pattern: /date\s+valeur/i,
        label: "date valeur"
      },
      {
        kind: "strong",
        weight: 4,
        pattern: /\b(?:d[eé]bit|cr[eé]dit)\b/i,
        label: "débit/crédit"
      },
      {
        kind: "secondary",
        weight: 3,
        pattern: /mouvements?\s+(?:du\s+)?compte/i,
        label: "mouvements du compte"
      },
      {
        kind: "secondary",
        weight: 2,
        pattern: /\bop[eé]rations?\b/i,
        label: "opération(s)"
      },
      {
        kind: "secondary",
        weight: 2,
        pattern: /\blibell[eé]\b/i,
        label: "libellé"
      },
      // Secondaires bancaires — insuffisants seuls (aussi sur factures SEPA)
      { kind: "secondary", weight: 1, pattern: /\biban\b/i, label: "IBAN (secondaire)" },
      { kind: "secondary", weight: 1, pattern: /\bbic\b/i, label: "BIC (secondaire)" },
      {
        kind: "secondary",
        weight: 1,
        pattern: /pr[eé]l[eè]vement|mandat\s+sepa|titulaire\s+du\s+compte/i,
        label: "prélèvement/SEPA (secondaire)"
      },
      // Noms de banques : secondaires, pas décisifs
      {
        kind: "secondary",
        weight: 2,
        pattern:
          /banque\s+populaire|cr[eé]dit\s+agricole|\bbnp\b|soci[eé]t[eé]\s+g[eé]n[eé]rale|\blcl\b/i,
        label: "nom de banque (secondaire)"
      },
      // Contre-signaux facture
      {
        kind: "negative",
        weight: -12,
        pattern: /\bfacture\b/i,
        label: "contre: facture"
      },
      {
        kind: "negative",
        weight: -8,
        pattern: /(?:total|montant)\s*(?:ht|ttc)\b|\btva\b/i,
        label: "contre: HT/TVA/TTC"
      },
      {
        kind: "negative",
        weight: -6,
        pattern: /(?:n[°oº]|num[eé]ro)\s*(?:de\s*)?facture|date\s+(?:de\s+)?facture/i,
        label: "contre: n°/date facture"
      }
    ]
  },
  {
    type: "ordonnance",
    minScore: 4,
    signals: [
      { kind: "strong", weight: 7, pattern: /\bordonnance\b/i, label: "ordonnance" },
      { kind: "strong", weight: 5, pattern: /\bprescrit\b/i, label: "prescrit" },
      { kind: "strong", weight: 5, pattern: /\bposologie\b/i, label: "posologie" },
      { kind: "secondary", weight: 3, pattern: /\bpharmacie\b/i, label: "pharmacie" },
      {
        kind: "secondary",
        weight: 3,
        pattern: /\bmg\b.*\bjour\b/i,
        label: "mg/jour"
      },
      {
        kind: "secondary",
        weight: 3,
        pattern: /docteur|dr\s+[A-ZÉÈÊ]/,
        label: "docteur"
      }
    ]
  },
  {
    type: "courrier",
    minScore: 3,
    signals: [
      { kind: "strong", weight: 4, pattern: /\bobjet\s*:/i, label: "objet:" },
      {
        kind: "strong",
        weight: 4,
        pattern: /madame[,.]?\s*monsieur/i,
        label: "madame, monsieur"
      },
      {
        kind: "secondary",
        weight: 3,
        pattern: /je\s+vous\s+prie\s+d/i,
        label: "je vous prie"
      },
      { kind: "secondary", weight: 2, pattern: /cordialement/i, label: "cordialement" },
      { kind: "secondary", weight: 2, pattern: /\bcourrier\b/i, label: "courrier" },
      {
        kind: "secondary",
        weight: 2,
        pattern: /nous\s+vous\s+informons/i,
        label: "nous vous informons"
      },
      {
        kind: "negative",
        weight: -6,
        pattern: /\bfacture\b|\bdevis\b|relev[ée]\s+bancaire/i,
        label: "contre: types structurés"
      }
    ]
  }
];

function scoreProfile(
  text: string,
  compact: string,
  profile: TypeProfile
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  for (const signal of profile.signals) {
    const re = new RegExp(signal.pattern.source, signal.pattern.flags.replace("g", ""));
    if (re.test(text) || re.test(compact)) {
      score += signal.weight;
      matched.push(
        `${signal.kind}:${signal.label}(${signal.weight >= 0 ? "+" : ""}${signal.weight})`
      );
    }
  }
  return { score, matched };
}

export function detectDocumentType(text: string): DocumentTypeGuess {
  const compact = normalizeCompact(text);
  const scoreboard = new Map<
    LocalDocumentType,
    { score: number; matched: string[] }
  >();

  for (const profile of PROFILES) {
    scoreboard.set(profile.type, scoreProfile(text, compact, profile));
  }

  // Éligibilité : relevé bancaire nécessite score >= minScore après négatifs
  const eligible: Array<{
    type: LocalDocumentType;
    score: number;
    matched: string[];
  }> = [];

  for (const profile of PROFILES) {
    const info = scoreboard.get(profile.type) || { score: 0, matched: [] };
    if (info.score >= profile.minScore) {
      eligible.push({ type: profile.type, score: info.score, matched: info.matched });
    }
  }

  eligible.sort((a, b) => b.score - a.score);

  const scoresObj: Record<string, number> = {};
  const signalsObj: Record<string, string[]> = {};
  for (const [type, info] of scoreboard.entries()) {
    scoresObj[type] = info.score;
    signalsObj[type] = info.matched;
  }

  if (!eligible.length) {
    return {
      documentType: "document_inconnu",
      confidence: 0.15,
      matched: [],
      scores: scoresObj,
      signals: signalsObj
    };
  }

  let best = eligible[0];

  // Ambiguïté facture vs devis
  const factureInfo = scoreboard.get("facture");
  const devisInfo = scoreboard.get("devis");
  if (
    factureInfo &&
    devisInfo &&
    factureInfo.score >= 3 &&
    devisInfo.score >= 3 &&
    Math.abs(factureInfo.score - devisInfo.score) <= 4
  ) {
    const factureHits = (text.match(/\bfacture\b/gi) || []).length;
    const devisHits = (text.match(/\bdevis\b/gi) || []).length;
    if (devisHits > factureHits && devisInfo.score >= 3) {
      best = { type: "devis", score: devisInfo.score, matched: devisInfo.matched };
    } else if (factureHits > 0) {
      best = {
        type: "facture",
        score: factureInfo.score,
        matched: factureInfo.matched
      };
    }
  }

  // Si 2e type très proche → confiance basse
  const second = eligible[1];
  const margin = second ? best.score - second.score : best.score;
  let confidence = Math.min(0.98, 0.4 + best.score / 40);
  if (second && margin <= 3) {
    confidence = Math.min(confidence, 0.55);
  }

  return {
    documentType: best.type,
    confidence,
    matched: best.matched,
    scores: scoresObj,
    signals: signalsObj
  };
}
