/**
 * Pack de règles d’applicabilité sourcées — V4-T.
 * Qualité > quantité. Pas de règle sans provenance officielle.
 */

import type {
  KnowledgeProvenance,
  TaxApplicabilityRule
} from "../../../../types/knowledge.js";

const RETRIEVED = "2026-08-08";
const YEARS = [2024, 2025, 2026];

function src(
  url: string,
  title: string,
  supports: string[] = ["applicability"]
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

const SRC_2042_NOTICE = src(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice — Remplir la déclaration de revenus 2024 (formulaire 2042)"
);

const SRC_SALAIRES = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR — Traitements et salaires"
);

const SRC_FONCIERS_AIDE = src(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR — revenus fonciers (cases 4BA à 4EA)"
);

const SRC_FONCIERS_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR — Revenus fonciers"
);

const SRC_2044 = src(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n°2044 — Déclaration des revenus fonciers"
);

/**
 * Règles vérifiées.
 * NON modélisées faute de preuve suffisante pour une conclusion forte :
 * - éligibilité crédit d’impôt 7DB / 7DR ;
 * - imputation déficit 4BB/4BC (seuils, conditions numériques) ;
 * - obligation de déclarer un salaire détecté « quelque part ».
 */
export const TAX_APPLICABILITY_RULES: readonly TaxApplicabilityRule[] = [
  {
    ruleId: "1aj-declarant1-scope",
    fieldCode: "1AJ",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: "declarant1",
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE, SRC_SALAIRES],
    sourceExcerpt:
      "La case 1AJ concerne les traitements et salaires du déclarant 1 selon la notice 2042 / brochure salaires.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      op: "allOf",
      conditions: [
        {
          predicate: "roleIs",
          role: "declarant1",
          fieldCode: "1AJ",
          allowUserFact: true,
          missingInformationId: "1aj-role",
          missingQuestion:
            "Ce montant de traitements et salaires concerne-t-il le déclarant 1 ?",
          expectedAnswerType: "declarant"
        },
        {
          predicate: "amountPresent",
          fieldCode: "1AJ",
          allowUserFact: true,
          missingInformationId: "1aj-amount",
          missingQuestion:
            "Disposez-vous du montant des traitements et salaires du déclarant 1 ?",
          expectedAnswerType: "amount"
        }
      ]
    }
  },
  {
    ruleId: "1bj-declarant2-scope",
    fieldCode: "1BJ",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: "declarant2",
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE, SRC_SALAIRES],
    sourceExcerpt:
      "La case 1BJ concerne les traitements et salaires du déclarant 2 selon la notice 2042 / brochure salaires.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      op: "allOf",
      conditions: [
        {
          predicate: "roleIs",
          role: "declarant2",
          fieldCode: "1BJ",
          allowUserFact: true,
          missingInformationId: "1bj-role",
          missingQuestion:
            "Ce montant de traitements et salaires concerne-t-il le déclarant 2 ?",
          expectedAnswerType: "declarant"
        },
        {
          predicate: "amountPresent",
          fieldCode: "1BJ",
          allowUserFact: true,
          missingInformationId: "1bj-amount",
          missingQuestion:
            "Disposez-vous du montant des traitements et salaires du déclarant 2 ?",
          expectedAnswerType: "amount"
        }
      ]
    }
  },
  {
    ruleId: "4ba-regime-reel",
    fieldCode: "4BA",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE, SRC_FONCIERS_BROCHURE, SRC_2044],
    sourceExcerpt:
      "La case 4BA sert au report du revenu net foncier déterminé selon le régime réel ; le régime (micro/réel) conditionne cette rubrique.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BA",
      allowUserFact: true,
      missingInformationId: "4ba-regime",
      missingQuestion:
        "Vos revenus fonciers relèvent-ils du régime réel (et non du micro-foncier) ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "4bb-regime-reel",
    fieldCode: "4BB",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    sourceExcerpt:
      "Les cases de déficit foncier (dont 4BB) s’inscrivent dans le cadre du régime réel et des règles d’imputation de la notice ; aucune conclusion chiffrée d’avantage fiscal n’est tirée ici.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BB",
      allowUserFact: true,
      missingInformationId: "4bb-regime",
      missingQuestion:
        "Vos revenus fonciers relèvent-ils du régime réel ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "4bc-regime-reel",
    fieldCode: "4BC",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    sourceExcerpt:
      "La case 4BC concerne un déficit pouvant s’imputer sur le revenu global dans les conditions du régime réel ; les seuils d’imputation ne sont pas modélisés ici.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BC",
      allowUserFact: true,
      missingInformationId: "4bc-regime",
      missingQuestion:
        "Vos revenus fonciers relèvent-ils du régime réel ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "7db-no-aids-only-unknown",
    fieldCode: "7DB",
    documentRef: "2042-RICI",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE],
    sourceExcerpt:
      "La notice décrit des conditions relatives au crédit d’impôt pour l’emploi à domicile ; la seule présence d’un justificatif ne permet pas de conclure à l’applicabilité.",
    // Cette règle ne produit JAMAIS applicable/notApplicable forte seule :
    // conditions volontairement « always unknown » via prédicat sans fait.
    effectWhenTrue: "applicable",
    effectWhenFalse: "unknown",
    conditions: {
      // Prédicat qui reste unknown sans inventer notApplicable
      predicate: "factExists",
      fieldCode: "7DB__applicability_gate_never_auto",
      allowUserFact: false,
      missingInformationId: "7db-situation",
      missingQuestion:
        "Disposez-vous d’éléments sur des dépenses d’emploi à domicile pour l’année concernée ?",
      expectedAnswerType: "yesNo"
    }
  },
  {
    ruleId: "7dr-aids-scope",
    fieldCode: "7DR",
    documentRef: "2042-RICI",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE],
    sourceExcerpt:
      "La case 7DR concerne les aides perçues pour financer les dépenses d’emploi à domicile, à indiquer séparément des dépenses (7DB).",
    effectWhenTrue: "applicable",
    effectWhenFalse: "needsInformation",
    conditions: {
      predicate: "amountPresent",
      fieldCode: "7DR",
      allowUserFact: true,
      missingInformationId: "7dr-amount",
      missingQuestion:
        "Avez-vous perçu des aides pour financer l’emploi à domicile (souvent case 7DR) ?",
      expectedAnswerType: "yesNo"
    }
  }
];

/** Cases pour lesquelles aucune règle forte n’est modélisée → unknown explicite. */
export const FIELDS_WITHOUT_STRONG_APPLICABILITY: readonly string[] = [
  // 7DB : définition + conditions générales, pas de gate d’applicabilité sûre
];

export function getApplicabilityRulesForField(
  fieldCode: string
): TaxApplicabilityRule[] {
  const code = fieldCode.toUpperCase();
  return TAX_APPLICABILITY_RULES.filter((r) => r.fieldCode === code);
}

export function listApplicabilityRuleIds(): string[] {
  return TAX_APPLICABILITY_RULES.map((r) => r.ruleId).sort();
}
