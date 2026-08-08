/**
 * Packs cases fiscales prioritaires V4-P.
 * Définitions reformulées depuis notices/brochures officielles DGFiP.
 * Aucune invention de case, délai, montant ou obligation personnelle.
 */

import type {
  FrenchTaxFieldEntry,
  KnowledgeProvenance
} from "../../../../types/knowledge.js";

const RETRIEVED = "2026-08-08";

function src(
  url: string,
  title: string,
  supports: string[]
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

/** Notice « Remplir la déclaration de revenus 2024 » (millésime 2025). */
const SRC_2042_NOTICE = src(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice — Remplir la déclaration de revenus 2024 (formulaire 2042)",
  ["label", "explanation", "plainLanguageWhat", "declarantRole", "valueType"]
);

const SRC_SALAIRES_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR — Traitements et salaires",
  ["label", "explanation", "plainLanguageWhat"]
);

const SRC_FONCIERS_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR — Revenus fonciers",
  ["label", "explanation", "plainLanguageWhat"]
);

const SRC_FONCIERS_AIDE = src(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR — revenus fonciers (cases 4BA à 4EA)",
  ["label", "explanation", "plainLanguageWhat"]
);

const SRC_2042_FORM = src(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n°2042 — Déclaration des revenus",
  ["documentRefs"]
);

const SRC_2044_FORM = src(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n°2044 — Déclaration des revenus fonciers",
  ["documentRefs"]
);

const YEARS_STABLE = [2024, 2025, 2026];

function field(
  partial: Omit<
    FrenchTaxFieldEntry,
    "country" | "id" | "normalizedCode" | "aliases" | "relatedFields" | "yearStable" | "lastVerifiedAt" | "subsection"
  > & {
    id?: string;
    aliases?: string[];
    relatedFields?: string[];
    yearStable?: boolean;
    lastVerifiedAt?: string | null;
    subsection?: string | null;
  }
): FrenchTaxFieldEntry {
  const normalizedCode = partial.fieldCode.toUpperCase().replace(/\s+/g, "");
  return {
    country: "FR",
    id: partial.id || `fr-tax-field-${normalizedCode.toLowerCase()}`,
    fieldCode: normalizedCode,
    normalizedCode,
    documentRefs: partial.documentRefs,
    section: partial.section,
    subsection: partial.subsection ?? null,
    label: partial.label,
    explanation: partial.explanation,
    plainLanguageWhat: partial.plainLanguageWhat,
    declarantRole: partial.declarantRole,
    valueType: partial.valueType,
    applicableYears: partial.applicableYears,
    yearStable: partial.yearStable ?? true,
    aliases: partial.aliases || [],
    relatedFields: partial.relatedFields || [],
    officialSources: partial.officialSources,
    provenance: partial.provenance,
    confidence: partial.confidence,
    qualityStatus: partial.qualityStatus,
    lastVerifiedAt: partial.lastVerifiedAt ?? RETRIEVED
  };
}

function salaryCase(
  code: string,
  role: FrenchTaxFieldEntry["declarantRole"],
  roleLabel: string,
  related: string[]
): FrenchTaxFieldEntry {
  return field({
    fieldCode: code,
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Traitements et salaires",
    label: "Traitements et salaires",
    explanation:
      "Case de la déclaration des revenus destinée aux traitements et salaires imposables (et certains éléments assimilés indiqués par la notice), pour le rôle fiscal concerné.",
    plainLanguageWhat: `Cette case concerne généralement les traitements et salaires imposables du ${roleLabel}.`,
    declarantRole: role,
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: true,
    relatedFields: related,
    officialSources: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE, SRC_2042_FORM],
    provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE],
    confidence: 0.95,
    qualityStatus: "verified"
  });
}

function pensionCase(
  code: string,
  role: FrenchTaxFieldEntry["declarantRole"],
  roleLabel: string,
  related: string[]
): FrenchTaxFieldEntry {
  return field({
    fieldCode: code,
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Pensions, retraites, rentes",
    label: "Pensions, retraites, rentes",
    explanation:
      "Case destinée aux pensions, retraites et rentes à titre gratuit à déclarer selon la notice de la déclaration des revenus.",
    plainLanguageWhat: `Cette case concerne généralement les pensions, retraites ou rentes du ${roleLabel}.`,
    declarantRole: role,
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: true,
    relatedFields: related,
    officialSources: [SRC_2042_NOTICE, SRC_2042_FORM],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  });
}

/**
 * Cases prioritaires réellement vérifiées dans les notices officielles.
 * Qualité > quantité.
 */
export const PRIORITY_TAX_FIELDS: readonly FrenchTaxFieldEntry[] = [
  salaryCase("1AJ", "declarant1", "déclarant 1", ["1BJ", "1CJ", "1DJ"]),
  salaryCase("1BJ", "declarant2", "déclarant 2", ["1AJ", "1CJ", "1DJ"]),
  salaryCase("1CJ", "dependent1", "1re personne à charge", ["1AJ", "1BJ", "1DJ"]),
  salaryCase("1DJ", "dependent2", "2e personne à charge", ["1AJ", "1BJ", "1CJ"]),

  pensionCase("1AS", "declarant1", "déclarant 1", ["1BS", "1CS", "1DS"]),
  pensionCase("1BS", "declarant2", "déclarant 2", ["1AS", "1CS", "1DS"]),
  pensionCase("1CS", "dependent1", "1re personne à charge", ["1AS", "1BS", "1DS"]),
  pensionCase("1DS", "dependent2", "2e personne à charge", ["1AS", "1BS", "1CS"]),

  field({
    fieldCode: "1AP",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Autres revenus imposables",
    label: "Chômage, préretraite",
    explanation:
      "Case destinée à certains revenus de remplacement (notamment allocations de chômage / préretraite) imposés selon les règles des traitements et salaires, pour le déclarant 1.",
    plainLanguageWhat:
      "Cette case concerne généralement les allocations de chômage ou de préretraite du déclarant 1.",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1BP"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "1BP",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Autres revenus imposables",
    label: "Chômage, préretraite",
    explanation:
      "Case destinée à certains revenus de remplacement (notamment allocations de chômage / préretraite) pour le déclarant 2.",
    plainLanguageWhat:
      "Cette case concerne généralement les allocations de chômage ou de préretraite du déclarant 2.",
    declarantRole: "declarant2",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1AP"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),

  field({
    fieldCode: "1AK",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Frais réels",
    label: "Frais réels",
    explanation:
      "Case permettant d’indiquer les frais professionnels réels du déclarant 1 lorsque cette option est utilisée à la place de la déduction forfaitaire.",
    plainLanguageWhat:
      "Cette case sert à déclarer les frais professionnels réels du déclarant 1, lorsqu’ils sont retenus.",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1BK"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "1BK",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Frais réels",
    label: "Frais réels",
    explanation:
      "Case permettant d’indiquer les frais professionnels réels du déclarant 2.",
    plainLanguageWhat:
      "Cette case sert à déclarer les frais professionnels réels du déclarant 2, lorsqu’ils sont retenus.",
    declarantRole: "declarant2",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1AK"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),

  field({
    fieldCode: "2TR",
    documentRefs: ["2042"],
    section: "Revenus de capitaux mobiliers",
    subsection: "Produits de placement à revenu fixe",
    label: "Produits de placement à revenu fixe",
    explanation:
      "Case destinée aux produits de placement à revenu fixe (intérêts de livrets fiscalisés, comptes de dépôt / à terme, produits d’emprunt d’État, etc.) selon la notice.",
    plainLanguageWhat:
      "Cette case concerne certains intérêts et produits de placement à revenu fixe du foyer.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: [],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),

  field({
    fieldCode: "3VG",
    documentRefs: ["2042", "2042-C", "2074"],
    section: "Plus-values et gains divers",
    subsection: "Plus-values de cession",
    label: "Plus-values de cession de valeurs mobilières",
    explanation:
      "Case de report des plus-values (après imputation éventuelle de moins-values) sur la déclaration de revenus ; dans certains cas le détail se calcule sur la 2074.",
    plainLanguageWhat:
      "Cette case sert à indiquer certaines plus-values de cession de valeurs mobilières à reporter sur la déclaration.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["3VH"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "3VH",
    documentRefs: ["2042", "2042-C", "2074"],
    section: "Plus-values et gains divers",
    subsection: "Moins-values",
    label: "Moins-values à reporter",
    explanation:
      "Case utilisée pour certaines moins-values à reporter, selon les situations décrites par la notice (souvent liée au calcul 2074 / 2042-C).",
    plainLanguageWhat:
      "Cette case concerne certaines moins-values à reporter sur la déclaration.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["3VG"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.85,
    qualityStatus: "partiallyVerified"
  }),

  field({
    fieldCode: "4BA",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "Régime réel",
    label: "Revenus fonciers imposables",
    explanation:
      "Case de report du revenu net foncier déterminé selon le régime réel (souvent via la déclaration 2044) sur la déclaration des revenus.",
    plainLanguageWhat:
      "Cette case sert à reporter le revenu foncier net imposable lorsque le régime réel s’applique.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BB", "4BC", "4BD", "4BE"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE, SRC_FONCIERS_AIDE, SRC_2044_FORM],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.95,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BB",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "Régime réel",
    label: "Déficit imputable sur les revenus fonciers",
    explanation:
      "Case de report d’un déficit foncier imputable sur les revenus fonciers des années suivantes.",
    plainLanguageWhat:
      "Cette case concerne un déficit foncier qui s’impute sur les revenus fonciers ultérieurs.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BC", "4BD"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BC",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "Régime réel",
    label: "Déficit imputable sur le revenu global",
    explanation:
      "Case de report d’un déficit foncier imputable, dans les conditions prévues, sur le revenu brut global.",
    plainLanguageWhat:
      "Cette case concerne un déficit foncier pouvant s’imputer sur le revenu global, selon les règles applicables.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BB", "4BD"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BD",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "Régime réel",
    label: "Déficits antérieurs non encore imputés",
    explanation:
      "Case destinée aux déficits fonciers antérieurs non encore imputés, dans les limites de report prévues par la notice.",
    plainLanguageWhat:
      "Cette case sert à indiquer des déficits fonciers d’années antérieures non encore imputés.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BB", "4BC"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BE",
    documentRefs: ["2042"],
    section: "Revenus fonciers",
    subsection: "Micro-foncier",
    label: "Régime micro-foncier — recettes brutes",
    explanation:
      "Case du régime micro-foncier : montant brut des revenus fonciers lorsque ce régime s’applique (abattement forfaitaire appliqué ensuite).",
    plainLanguageWhat:
      "Cette case sert à indiquer les recettes brutes de locations non meublées en micro-foncier.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BZ",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "2044 spéciale",
    label: "Dépôt d’une déclaration 2044 spéciale",
    explanation:
      "Case à cocher lorsque vous déposez une déclaration n°2044 spéciale.",
    plainLanguageWhat:
      "Cette case indique que vous joignez ou utilisez une déclaration 2044 spéciale.",
    declarantRole: "household",
    valueType: "boolean",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),

  field({
    fieldCode: "7DB",
    documentRefs: ["2042", "2042-RICI"],
    section: "Réductions et crédits d’impôt",
    subsection: "Services à la personne — emploi à domicile",
    label: "Dépenses d’emploi à domicile",
    explanation:
      "Case destinée au montant total des dépenses liées à l’emploi à domicile ouvrant droit à crédit d’impôt, sans déduire les aides (à indiquer séparément).",
    plainLanguageWhat:
      "Cette case concerne les dépenses d’emploi à domicile prises en compte pour un crédit d’impôt.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DR", "7GA"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.93,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "7DR",
    documentRefs: ["2042", "2042-RICI"],
    section: "Réductions et crédits d’impôt",
    subsection: "Services à la personne — emploi à domicile",
    label: "Aides perçues pour l’emploi à domicile",
    explanation:
      "Case destinée au montant des aides perçues pour financer les dépenses d’emploi à domicile (APA, PCH, CESU préfinancé, etc.), déduit du montant déclaré en 7DB.",
    plainLanguageWhat:
      "Cette case sert à indiquer les aides reçues pour l’emploi à domicile, à déduire des dépenses.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DB"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.93,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "7GA",
    documentRefs: ["2042", "2042-RICI"],
    section: "Réductions et crédits d’impôt",
    subsection: "Frais de garde d’enfants",
    label: "Frais de garde des enfants de moins de 6 ans",
    explanation:
      "Case relative aux frais de garde d’enfants de moins de six ans à l’extérieur du domicile (assistante maternelle agréée, crèche, etc.), ouvrant droit à un crédit d’impôt dans les limites prévues.",
    plainLanguageWhat:
      "Cette case concerne les frais de garde d’enfants de moins de 6 ans à l’extérieur du domicile.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DB"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),

  field({
    fieldCode: "8UU",
    documentRefs: ["2042", "3916"],
    section: "Divers",
    subsection: "Comptes à l’étranger",
    label: "Comptes bancaires / actifs numériques à l’étranger",
    explanation:
      "Case à cocher si le foyer a ouvert, détenu, utilisé ou clôturé des comptes bancaires (ou certains comptes d’actifs numériques) à l’étranger, avec déclaration n°3916-3916 bis à joindre.",
    plainLanguageWhat:
      "Cette case signale la détention ou l’utilisation de certains comptes à l’étranger, à déclarer avec le formulaire dédié.",
    declarantRole: "household",
    valueType: "boolean",
    applicableYears: YEARS_STABLE,
    relatedFields: [],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),

  // 2047 — revenus étrangers (partiellement vérifié : rôle général officiel)
  field({
    fieldCode: "1AF",
    documentRefs: ["2042", "2047"],
    section: "Traitements et salaires",
    subsection: "Revenus de source étrangère / non-résidents",
    label: "Salaires / pensions pour calcul du PAS (situations particulières)",
    explanation:
      "Case utilisée, selon la notice, pour indiquer certains salaires, pensions ou rentes dans des situations de non-résidence ou de source étrangère afin d’ajuster le calcul du prélèvement à la source ; montants souvent aussi à reporter sur la 2047.",
    plainLanguageWhat:
      "Cette case concerne certains salaires ou pensions dans des situations internationales particulières (voir notice).",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: false,
    relatedFields: ["1AJ"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.75,
    qualityStatus: "partiallyVerified"
  }),

];

export const PRIORITY_TAX_FIELDS_BY_CODE: ReadonlyMap<string, FrenchTaxFieldEntry> =
  new Map(PRIORITY_TAX_FIELDS.map((f) => [f.normalizedCode, f]));

export function getPriorityTaxField(
  code: string
): FrenchTaxFieldEntry | null {
  return PRIORITY_TAX_FIELDS_BY_CODE.get(code.toUpperCase().replace(/\s+/g, "")) || null;
}
