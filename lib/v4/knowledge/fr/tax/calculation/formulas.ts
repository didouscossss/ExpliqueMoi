/**
 * Pack de formules fiscales — V4-U / V4-V / V4-W.
 *
 * QUALITÉ > QUANTITÉ.
 * Aucune formule inventée. Taux / plafonds uniquement s’ils figurent
 * dans une source officielle déjà référencée dans le repo.
 *
 * V4-V : première formule réelle —
 * revenu imposable micro-foncier = recettes 4BE × (100% − abattement 30%).
 *
 * V4-W : enregistrée dans ruleRegistry (version + millésimes + provenance).
 */

import type {
  KnowledgeProvenance,
  TaxFormula
} from "../../../../types/knowledge.js";

const RETRIEVED = "2026-08-08";

function src(
  url: string,
  title: string,
  supports: string[] = ["calculation"]
): KnowledgeProvenance {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}

const SRC_FONCIERS_AIDE = src(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR — revenus fonciers (cases 4BA à 4EA)"
);

const SRC_2042_NOTICE = src(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice — Remplir la déclaration de revenus 2024 (formulaire 2042)"
);

const SRC_FONCIERS_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR — Revenus fonciers"
);

/**
 * Formules production.
 * Une seule formule V4-V : abattement micro-foncier 30 % (source aide IR).
 */
export const TAX_FORMULAS: readonly TaxFormula[] = [
  {
    formulaId: "4be-micro-foncier-revenu-imposable",
    version: "1",
    registryStatus: "verified",
    targetFieldCode: "4BE",
    documentRef: "2042",
    taxYears: [2024, 2025, 2026],
    effectiveFrom: 2024,
    effectiveTo: 2026,
    yearPolicy: "verifiedStable",
    rolePolicy: "household",
    operation: "percentage",
    inputs: [
      {
        inputId: "recettesBrutes",
        label: "Recettes brutes micro-foncier (case 4BE)",
        fieldCode: "4BE",
        unit: "EUR",
        required: true,
        allowUserFact: true,
        role: "household"
      },
      {
        inputId: "tauxImposableApresAbattement",
        label: "Taux de revenu imposable après abattement forfaitaire",
        unit: "percentage",
        required: true,
        constantId: "taxableRetentionPercent"
      }
    ],
    unit: "EUR",
    roundingPolicy: "none",
    requiresApplicabilityField: "4BE",
    constants: [
      {
        constantId: "abatementPercent",
        label: "Abattement forfaitaire micro-foncier",
        value: 30,
        unit: "percentage",
        sourceNote:
          "Aide IR fonciers : « Un abattement de 30 % (évaluation forfaitaire de vos charges) sera appliqué pour déterminer votre revenu imposable. »"
      },
      {
        constantId: "taxableRetentionPercent",
        label: "Part imposable après abattement (100 % − 30 %)",
        value: 70,
        unit: "percentage",
        sourceNote:
          "Conséquence arithmétique directe de l’abattement forfaitaire de 30 % sur les recettes brutes."
      },
      {
        constantId: "grossCeilingEur",
        label: "Plafond de recettes brutes du régime micro-foncier",
        value: 15000,
        unit: "EUR",
        sourceNote:
          "Aide IR fonciers : recettes brutes du foyer n’excédant pas 15 000 € pour relever du micro-foncier."
      }
    ],
    formulaConditions: [
      {
        kind: "inputAtMost",
        inputId: "recettesBrutes",
        value: 15000,
        unit: "EUR",
        onFail: "notApplicable",
        message:
          "Les recettes brutes dépassent le plafond de 15 000 € du régime micro-foncier : cette formule d’abattement ne s’applique pas."
      },
      {
        kind: "userFactAccepted",
        requirementId: "4be-micro-exclusions-ok",
        fieldCode: "4BE",
        missingId: "4be-micro-exclusions-ok",
        message:
          "Les exclusions officielles du micro-foncier (amortissements spécifiques, Malraux, monuments historiques, etc.) ne sont pas encore confirmées comme absentes."
      }
    ],
    resultLabel:
      "Revenu foncier imposable après abattement forfaitaire micro-foncier (≠ montant à porter en 4BE)",
    provenance: [SRC_FONCIERS_AIDE, SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    sourceExcerpt:
      "Si vous relevez du régime micro foncier, indiquez le montant de vos loyers perçus en case 4BE. Un abattement de 30 % (évaluation forfaitaire de vos charges) sera appliqué pour déterminer votre revenu imposable. Ne le déduisez pas, il sera calculé automatiquement. Condition : revenus fonciers bruts n’excédant pas 15 000 € (aide simulateur IR — revenus fonciers).",
    verificationStatus: "verified"
  }
];

export const NON_MODELED_FORMULA_NOTES: readonly string[] = [
  "1AJ/1BJ : montants directement lus — DocumentFact, pas formule identity.",
  "4BA/4BB/4BC : report / déficit décrits, mais pas de formule arithmétique 2044 complète (lignes → cases) sourcée pour un calcul dérivé.",
  "7DB/7DR : séparation aides/dépenses décrite ; taux/plafonds du crédit d’impôt non modélisés — pas de calcul d’avantage.",
  "Micro-foncier : abattement 30 % modélisé (V4-V) ; exclusions officielles restent un gate needsInformation jusqu’à confirmation.",
  "Somme multi-documents : interdite sans TaxFormula explicite (refuseUnsafeAggregation)."
];

export function getFormulasForField(
  fieldCode: string,
  extra: readonly TaxFormula[] = []
): TaxFormula[] {
  const code = fieldCode.toUpperCase();
  return [...TAX_FORMULAS, ...extra].filter(
    (f) => f.targetFieldCode.toUpperCase() === code
  );
}

export function listFormulaIds(extra: readonly TaxFormula[] = []): string[] {
  return [...TAX_FORMULAS, ...extra].map((f) => f.formulaId).sort();
}

export function getProductionFormulaById(formulaId: string): TaxFormula | null {
  return TAX_FORMULAS.find((f) => f.formulaId === formulaId) || null;
}
