/**
 * Contexte d’évaluation pour le scorer de classification.
 */

import type { EntityCandidate } from "../types/entityCandidate.js";
import type { Relation } from "../types/relation.js";
import type { ConsistencyResult } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";
import { normalizeLex } from "../candidates/normalize.js";

export interface StructureFlags {
  hasTransactionTable: boolean;
  hasHtTvaTtc: boolean;
  hasLetterFormulas: boolean;
  hasFormFields: boolean;
  hasPayslipMarks: boolean;
  hasContractMarks: boolean;
  hasTaxMarks: boolean;
  hasFinancialStatementMarks: boolean;
  hasCertificateMarks: boolean;
  hasReceiptMarks: boolean;
  hasNoticeMarks: boolean;
  hasExplanatoryMarks: boolean;
  hasIban: boolean;
  hasPrelevement: boolean;
}

export interface ClassificationContext {
  text: string;
  lex: string;
  blocks: readonly TextBlock[];
  candidates: readonly EntityCandidate[];
  relations: readonly Relation[];
  consistency: ConsistencyResult | null;
  structures: StructureFlags;
}

export function buildClassificationContext(input: {
  blocks: readonly TextBlock[];
  candidates: readonly EntityCandidate[];
  relations: readonly Relation[];
  consistency?: ConsistencyResult | null;
}): ClassificationContext {
  const text = input.blocks.map((b) => b.text).join("\n");
  const lex = normalizeLex(text);
  const structures = detectStructures(lex, input.candidates, input.relations);
  return {
    text,
    lex,
    blocks: input.blocks,
    candidates: input.candidates,
    relations: input.relations,
    consistency: input.consistency ?? null,
    structures
  };
}

function detectStructures(
  lex: string,
  candidates: readonly EntityCandidate[],
  relations: readonly Relation[]
): StructureFlags {
  const hasTransactionTable =
    /\bsolde\s+precedent\b/.test(lex) ||
    (/\bdebit\b/.test(lex) &&
      /\bcredit\b/.test(lex) &&
      (/\blibelle\b/.test(lex) || /\boperation/.test(lex))) ||
    (/\bnouveau\s+solde\b/.test(lex) && /\bdate\s+valeur\b/.test(lex)) ||
    (/\bmouvements?\b/.test(lex) && /\bcompte\b/.test(lex));

  const hasHtTvaTtc =
    (/\bht\b|hors\s*taxes?|hors\s*tva/.test(lex) &&
      /\btva\b/.test(lex) &&
      /\bttc\b|toutes\s*taxes/.test(lex)) ||
    relations.some((r) => r.type === "arithmetic");

  const hasLetterFormulas =
    /\bobjet\s*:/.test(lex) ||
    /madame[,.]?\s*monsieur/.test(lex) ||
    /je\s+vous\s+prie/.test(lex) ||
    /nous\s+vous\s+informons/.test(lex);

  const hasFormFields =
    /\bnom\s*:/.test(lex) &&
    (/\bprenom\s*:/.test(lex) || /\bdate\s+de\s+naissance/.test(lex)) &&
    (/\bsignature\b/.test(lex) || /\bcase\s+a\s+cocher|\b\[[ x]\]/.test(lex));

  const hasPayslipMarks =
    /bulletin\s+de\s+(salaire|paie)/.test(lex) ||
    (/salaire\s+(brut|net)/.test(lex) && /\burssaf\b/.test(lex));

  const hasContractMarks =
    /\bcontrat\b/.test(lex) &&
    (/entre\s+les\s+soussign/.test(lex) ||
      /article\s+\d/.test(lex) ||
      /resiliation|préavis|preavis/.test(lex));

  const hasTaxMarks =
    /avis\s+d['’]?impot|impot\s+sur\s+le\s+revenu|direction\s+generale\s+des\s+finances|dgfip|revenu\s+fiscal|taxe\s+fonciere|numero\s+fiscal/.test(
      lex
    );

  const hasFinancialStatementMarks =
    /bilan|compte\s+de\s+resultat|actif|passif|chiffre\s+d['’]?affaires|liasse\s+fiscale/.test(
      lex
    );

  const hasCertificateMarks =
    /attestation|certifie|certificat|je\s+soussigne/.test(lex);

  const hasReceiptMarks =
    /\breçu\b|\brecu\b|ticket\s+de\s+caisse|justificatif\s+de\s+paiement/.test(
      lex
    );

  const hasNoticeMarks =
    /\bavis\b|\bnotice\b|information\s+importante|porte\s+a\s+votre\s+connaissance/.test(
      lex
    );

  const hasExplanatoryMarks =
    /mode\s+d['’]?emploi|comment\s+faire|explication|guide\s+pratique|foire\s+aux\s+questions|\bfaq\b|a\s+titre\s+d['’]?exemple|titre\s+illustratif|montants?\s+sont\s+donnes/.test(
      lex
    );

  const hasIban = candidates.some((c) => c.type === "iban") || /\biban\b/.test(lex);
  const hasPrelevement =
    /prelevement|prélèvement|mandat\s+sepa|sera\s+prelev|preleve\s+automatiquement/.test(
      lex
    );

  return {
    hasTransactionTable,
    hasHtTvaTtc,
    hasLetterFormulas,
    hasFormFields,
    hasPayslipMarks,
    hasContractMarks,
    hasTaxMarks,
    hasFinancialStatementMarks,
    hasCertificateMarks,
    hasReceiptMarks,
    hasNoticeMarks,
    hasExplanatoryMarks,
    hasIban,
    hasPrelevement
  };
}
