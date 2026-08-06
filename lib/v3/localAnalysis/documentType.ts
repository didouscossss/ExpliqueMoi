/**
 * Classification déterministe du type de document.
 */

import type { LocalDocumentType } from "../types/LocalAnalysis.js";
import { normalizeCompact } from "./normalize.js";

export interface DocumentTypeGuess {
  documentType: LocalDocumentType;
  confidence: number;
  matched: string[];
}

interface Rule {
  type: LocalDocumentType;
  weight: number;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    type: "facture",
    weight: 3,
    patterns: [
      /\bfacture\b/i,
      /\binvoice\b/i,
      /n[°o]\s*(de\s*)?facture/i,
      /montant\s*ttc/i,
      /facture\s*n[°o]/i
    ]
  },
  {
    type: "devis",
    weight: 3,
    patterns: [
      /\bdevis\b/i,
      /\bquotation\b/i,
      /proposition\s+commerciale/i,
      /devis\s*n[°o]/i,
      /valable\s+jusqu/i
    ]
  },
  {
    type: "contrat",
    weight: 3,
    patterns: [
      /\bcontrat\b/i,
      /\bconvention\b/i,
      /entre\s+les\s+soussign/i,
      /article\s+1\b/i,
      /lu\s+et\s+approuv/i
    ]
  },
  {
    type: "bulletin_de_salaire",
    weight: 4,
    patterns: [
      /bulletin\s+de\s+(salaire|paie)/i,
      /salaire\s+net/i,
      /salaire\s+brut/i,
      /net\s+[àa]\s+payer/i,
      /\burssaf\b/i,
      /conges\s+payes|congés\s+payés/i
    ]
  },
  {
    type: "releve_bancaire",
    weight: 4,
    patterns: [
      /relev[ée]\s+(de\s+)?compte/i,
      /relev[ée]\s+bancaire/i,
      /\biban\b/i,
      /solde\s+(crediteur|débiteur|crediteur)/i,
      /banque\s+populaire|crédit\s+agricole|bnp|société\s+générale|lcl/i
    ]
  },
  {
    type: "ordonnance",
    weight: 4,
    patterns: [
      /\bordonnance\b/i,
      /\bprescrit\b/i,
      /\bposologie\b/i,
      /\bpharmacie\b/i,
      /\bmg\b.*\bjour\b/i,
      /docteur|dr\s+[A-ZÉÈÊ]/
    ]
  },
  {
    type: "courrier",
    weight: 2,
    patterns: [
      /\bobjet\s*:/i,
      /madame[,.]?\s*monsieur/i,
      /je\s+vous\s+prie\s+d/i,
      /cordialement/i,
      /courrier/i,
      /nous\s+vous\s+informons/i
    ]
  }
];

export function detectDocumentType(text: string): DocumentTypeGuess {
  const compact = normalizeCompact(text);
  const scores = new Map<LocalDocumentType, { score: number; matched: string[] }>();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text) || pattern.test(compact)) {
        const current = scores.get(rule.type) || { score: 0, matched: [] };
        current.score += rule.weight;
        current.matched.push(pattern.source);
        scores.set(rule.type, current);
      }
    }
  }

  let best: LocalDocumentType = "document_inconnu";
  let bestScore = 0;
  let matched: string[] = [];

  for (const [type, info] of scores.entries()) {
    if (info.score > bestScore) {
      best = type;
      bestScore = info.score;
      matched = info.matched;
    }
  }

  // Ambiguïté facture vs devis : privilégier le mot exact dominant
  if (
    scores.has("facture") &&
    scores.has("devis") &&
    Math.abs((scores.get("facture")?.score || 0) - (scores.get("devis")?.score || 0)) <= 3
  ) {
    const factureHits = (text.match(/\bfacture\b/gi) || []).length;
    const devisHits = (text.match(/\bdevis\b/gi) || []).length;
    if (devisHits > factureHits) {
      best = "devis";
      bestScore = scores.get("devis")?.score || bestScore;
      matched = scores.get("devis")?.matched || matched;
    } else if (factureHits > 0) {
      best = "facture";
      bestScore = scores.get("facture")?.score || bestScore;
      matched = scores.get("facture")?.matched || matched;
    }
  }

  if (bestScore === 0) {
    return { documentType: "document_inconnu", confidence: 0.15, matched: [] };
  }

  const confidence = Math.min(0.98, 0.35 + bestScore / 20);
  return { documentType: best, confidence, matched };
}
