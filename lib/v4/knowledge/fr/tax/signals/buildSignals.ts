/**
 * KnowledgeSignals — preuves pour classification, pas décision absolue.
 */

import { normalizeLex } from "../../../../candidates/normalize.js";
import type { TextBlock } from "../../../../types/textBlock.js";
import type {
  DetectedFiscalReference,
  FiscalKnowledgeSignal,
  FrenchTaxDocumentRegistry,
  FrenchTaxFamily
} from "../../../../types/knowledge.js";
import { lookupById } from "../registry/loadRegistry.js";

function blob(blocks: readonly TextBlock[]): string {
  return normalizeLex(blocks.map((b) => b.text).join("\n"));
}

export function buildFiscalKnowledgeSignals(
  blocks: readonly TextBlock[],
  refs: readonly DetectedFiscalReference[],
  registry: FrenchTaxDocumentRegistry
): FiscalKnowledgeSignal[] {
  const signals: FiscalKnowledgeSignal[] = [];
  const text = blob(blocks);

  for (const ref of refs) {
    if (ref.kind === "formReference" && ref.registryId) {
      const entry = lookupById(registry, ref.registryId);
      if (!entry) continue;
      if (ref.role === "documentIdentity") {
        signals.push({
          signal: `knowledge:formIdentity:${ref.normalized}`,
          family: entry.family,
          weight: 0.55,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      } else if (ref.role === "mentionedDocument") {
        // Mention ≠ identité — signal faible + négatif pour reclassification
        signals.push({
          signal: `knowledge:formMentioned:${ref.normalized}`,
          family: "negative",
          weight: 0.05,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
        signals.push({
          signal: `knowledge:mentionedNotIdentity:${ref.normalized}`,
          family: "negative",
          weight: -0.35,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      } else if (ref.role === "relatedDocument") {
        signals.push({
          signal: `knowledge:formRelated:${ref.normalized}`,
          family: entry.family,
          weight: 0.2,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      }
    }

    if (ref.kind === "taxpayerIdentifier") {
      signals.push({
        signal: "knowledge:taxpayerIdentifier",
        family: "tax",
        weight: 0.15,
        referenceRole: "unknown",
        evidence: ref.evidence
      });
    }

    if (ref.kind === "noticeReference") {
      signals.push({
        signal: "knowledge:noticeReference",
        family: "incomeTaxNotice",
        weight: 0.35,
        referenceRole: ref.role,
        evidence: ref.evidence
      });
    }
  }

  // Lexical famille (complément, pas hardcode absolu)
  const familyLex: Array<{ family: FrenchTaxFamily; re: RegExp; w: number }> = [
    {
      family: "incomeTaxNotice",
      re: /avis\s+d['’]?impot\s+sur\s+le[s]?\s+revenu[s]?|avis\s+d['’]?imposition/,
      w: 0.45
    },
    {
      family: "incomeTaxReturn",
      re: /declaration\s+des\s+revenus|formulaire\s+n[°o]?\s*2042/,
      w: 0.4
    },
    {
      family: "propertyTax",
      re: /avis\s+de\s+taxe\s+fonciere|taxe\s+fonciere\s+sur\s+les\s+proprietes/,
      w: 0.45
    },
    {
      family: "withholdingTax",
      re: /prelevement\s+a\s+la\s+source|taux\s+de\s+prelevement/,
      w: 0.25
    },
    {
      family: "corporateTax",
      re: /impot\s+sur\s+les\s+societes|2065/,
      w: 0.4
    },
    {
      family: "vatDeclaration",
      re: /declaration\s+de\s+tva|3310|ca3/,
      w: 0.4
    },
    {
      family: "rentalIncomeDeclaration",
      re: /revenus\s+fonciers|formulaire\s+n[°o]?\s*2044/,
      w: 0.4
    }
  ];

  for (const f of familyLex) {
    if (f.re.test(text)) {
      signals.push({
        signal: `knowledge:lexical:${f.family}`,
        family: f.family,
        weight: f.w,
        evidence: blocks
          .filter((b) => f.re.test(normalizeLex(b.text)))
          .slice(0, 2)
          .map((b) => ({
            text: b.text,
            page: b.page,
            bbox: b.bbox ?? null,
            blockId: b.id,
            lineId: b.lineId ?? null
          }))
      });
    }
  }

  // Négatifs structure facture
  if (/\btotal\s+ht\b|\btotal\s+ttc\b|\btva\s+\d/.test(text) && /taxe\s+fonciere/.test(text)) {
    signals.push({
      signal: "knowledge:negative:invoiceMarksOnProperty",
      family: "negative",
      weight: -0.4,
      evidence: []
    });
  }

  return signals;
}

export function suggestFamilyFromSignals(
  signals: readonly FiscalKnowledgeSignal[],
  refs: readonly DetectedFiscalReference[]
): FrenchTaxFamily | null {
  // Mention seule → ne pas suggérer la famille du formulaire mentionné comme type courant
  const identityRef = refs.find(
    (r) => r.kind === "formReference" && r.role === "documentIdentity" && r.family
  );
  if (identityRef?.family) return identityRef.family;

  const scores = new Map<string, number>();
  for (const s of signals) {
    if (s.family === "negative" || s.family === "tax") continue;
    if (s.referenceRole === "mentionedDocument") continue;
    scores.set(s.family, (scores.get(s.family) || 0) + s.weight);
  }
  let best: FrenchTaxFamily | null = null;
  let bestScore = 0;
  for (const [fam, sc] of scores) {
    if (sc > bestScore) {
      bestScore = sc;
      best = fam as FrenchTaxFamily;
    }
  }
  return bestScore >= 0.35 ? best : null;
}
