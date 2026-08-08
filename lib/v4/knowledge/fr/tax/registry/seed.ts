/**
 * Seed curated V4-L — métadonnées fiscales françaises.
 * Sources : pages publiques impots.gouv.fr (Licence Ouverte Etalab 2.0).
 * Aucune donnée personnelle. Aucun PDF embarqué.
 */

import type {
  FrenchTaxDocumentEntry,
  KnowledgeProvenance
} from "../../../../types/knowledge.js";

const RETRIEVED = "2026-08-08";

function official(
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

const SRC_2042 = official(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n°2042 — Déclaration des revenus",
  ["officialTitle", "purpose", "reference", "relatedDocuments", "applicableYears"]
);

const SRC_2044 = official(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n°2044 — Déclaration des revenus fonciers",
  ["officialTitle", "purpose", "reference", "applicableYears"]
);

const SRC_AVIS = official(
  "https://www.impots.gouv.fr/particulier/jai-besoin-dun-document-avis-dimpot-formulaire",
  "J'ai besoin d'un document (avis d'impôt, formulaire…)",
  ["officialTitle", "purpose", "family"]
);

const SRC_TF = official(
  "https://www.impots.gouv.fr/particulier/questions/quelle-date-vais-je-recevoir-mon-avis-de-taxe-fonciere-et-quand-dois-je-la",
  "Avis de taxe foncière — dates de mise à disposition et paiement",
  ["officialTitle", "purpose", "family"]
);

const SRC_FORMS = official(
  "https://www.impots.gouv.fr/recherche-de-formulaire",
  "Recherche de formulaire | impots.gouv.fr",
  ["reference"]
);

function entry(
  partial: Omit<FrenchTaxDocumentEntry, "country" | "authority" | "provenance"> & {
    provenance?: KnowledgeProvenance[];
  }
): FrenchTaxDocumentEntry {
  return {
    country: "FR",
    authority: "DGFiP",
    provenance: partial.provenance || partial.officialSources,
    ...partial
  };
}

/** Entrées curated — première fondation, non exhaustive. */
export const FRENCH_TAX_REGISTRY_SEED: readonly FrenchTaxDocumentEntry[] = [
  entry({
    id: "fr-tax-2042",
    family: "incomeTaxReturn",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2042"],
    cerfaNumbers: [],
    aliases: ["déclaration des revenus", "declaration des revenus", "formulaire 2042"],
    officialTitle: "Déclaration des revenus",
    description:
      "Formulaire permettant de déclarer les revenus perçus par les membres du foyer fiscal.",
    purpose: "Établissement de l'impôt sur le revenu.",
    applicableYears: [2024, 2025, 2026],
    documentVersion: null,
    expectedSignals: [
      "declaration des revenus",
      "formulaire 2042",
      "foyer fiscal",
      "impot sur le revenu"
    ],
    negativeSignals: ["voir votre declaration 2042", "reportez", "reportez-vous"],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042-c",
        relationType: "supplement",
        source: SRC_2042.url,
        confidence: 0.9
      },
      {
        targetId: "fr-tax-2042-c-pro",
        relationType: "supplement",
        source: SRC_2042.url,
        confidence: 0.9
      },
      {
        targetId: "fr-tax-2042-rici",
        relationType: "annex",
        source: SRC_2042.url,
        confidence: 0.9
      },
      {
        targetId: "fr-tax-2044",
        relationType: "relatedDeclaration",
        source: SRC_2042.url,
        confidence: 0.7
      },
      {
        targetId: "fr-tax-2047",
        relationType: "relatedDeclaration",
        source: SRC_2042.url,
        confidence: 0.7
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: [
      "documentReference",
      "fiscalYear",
      "incomeYear",
      "taxpayer",
      "declarants"
    ],
    officialSources: [SRC_2042, SRC_FORMS],
    confidence: 0.95
  }),
  entry({
    id: "fr-tax-2042-c",
    family: "incomeTaxReturn",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2042-C", "2042C"],
    cerfaNumbers: [],
    aliases: ["declaration de revenus complementaire", "2042 C"],
    officialTitle: "Déclaration de revenus complémentaire",
    description: "Annexe complémentaire à la déclaration des revenus n°2042.",
    purpose: "Déclarer des éléments complémentaires de revenus.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2042-c", "declaration complementaire"],
    negativeSignals: [],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "supplement",
        source: SRC_2042.url,
        confidence: 0.9
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: ["documentReference", "fiscalYear"],
    officialSources: [SRC_2042],
    confidence: 0.9
  }),
  entry({
    id: "fr-tax-2042-c-pro",
    family: "professionalIncomeDeclaration",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2042-C-PRO", "2042C-PRO", "2042 C PRO"],
    cerfaNumbers: [],
    aliases: ["professions non salariees", "2042-c-pro"],
    officialTitle:
      "Déclaration de revenus complémentaire des professions non salariées",
    description: "Annexe 2042 pour revenus professionnels non salariés.",
    purpose: "Déclarer les revenus des professions non salariées.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2042-c-pro", "professions non salariees"],
    negativeSignals: [],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "supplement",
        source: SRC_2042.url,
        confidence: 0.9
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: ["documentReference", "fiscalYear"],
    officialSources: [SRC_2042],
    confidence: 0.9
  }),
  entry({
    id: "fr-tax-2042-rici",
    family: "taxCreditReduction",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2042-RICI", "2042RICI"],
    cerfaNumbers: [],
    aliases: ["reductions et credits d'impot", "2042 rici"],
    officialTitle: "Déclaration des réductions et crédits d'impôt",
    description:
      "Annexe permettant de déclarer les réductions d'impôt et crédits d'impôt les plus fréquents.",
    purpose: "Déclarer réductions et crédits d'impôt.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2042-rici", "credit d'impot", "reduction d'impot"],
    negativeSignals: [],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "annex",
        source: SRC_2042.url,
        confidence: 0.9
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: ["documentReference", "fiscalYear", "taxCredits", "taxReductions"],
    officialSources: [SRC_2042],
    confidence: 0.9
  }),
  entry({
    id: "fr-tax-2044",
    family: "rentalIncomeDeclaration",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2044"],
    cerfaNumbers: [],
    aliases: ["revenus fonciers", "declaration des revenus fonciers"],
    officialTitle: "Déclaration des revenus fonciers",
    description:
      "Déclare les revenus provenant de la location de locaux non meublés et certains revenus fonciers.",
    purpose: "Déclarer les revenus fonciers au régime réel.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2044", "revenus fonciers", "loyers"],
    negativeSignals: [],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "relatedDeclaration",
        source: SRC_2044.url,
        confidence: 0.75
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: ["documentReference", "fiscalYear"],
    officialSources: [SRC_2044, SRC_FORMS],
    confidence: 0.92
  }),
  entry({
    id: "fr-tax-2047",
    family: "foreignIncomeDeclaration",
    documentType: "incomeTaxReturn",
    referenceNumbers: ["2047"],
    cerfaNumbers: [],
    aliases: ["revenus de l'etranger", "revenus etrangers"],
    officialTitle: "Déclaration des revenus en provenance de l'étranger",
    description:
      "Formulaire pour déclarer des revenus provenant de l'étranger (référence catalogue DGFiP).",
    purpose: "Déclarer les revenus de source étrangère.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2047", "revenus de l'etranger", "etranger"],
    negativeSignals: [],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "relatedDeclaration",
        source: SRC_2042.url,
        confidence: 0.7
      }
    ],
    profileId: "incomeTaxReturn",
    expectedFields: ["documentReference", "fiscalYear"],
    officialSources: [SRC_FORMS, SRC_2042],
    confidence: 0.85
  }),
  entry({
    id: "fr-tax-income-notice",
    family: "incomeTaxNotice",
    documentType: "incomeTaxNotice",
    referenceNumbers: [],
    cerfaNumbers: [],
    aliases: [
      "avis d'impot sur les revenus",
      "avis d'imposition",
      "avis de situation declarative"
    ],
    officialTitle: "Avis d'impôt sur les revenus",
    description:
      "Document restitué par l'administration indiquant l'impôt calculé, les prélèvements et le solde (à payer ou à rembourser).",
    purpose: "Informer le contribuable du résultat de l'impôt sur le revenu.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: [
      "avis d'impot",
      "impot sur le revenu",
      "revenu fiscal de reference",
      "prelevement a la source",
      "reste a payer",
      "remboursement"
    ],
    negativeSignals: ["declaration des revenus n° 2042", "formulaire 2042"],
    relatedDocuments: [
      {
        targetId: "fr-tax-2042",
        relationType: "relatedDeclaration",
        source: SRC_AVIS.url,
        confidence: 0.6
      }
    ],
    profileId: "incomeTaxNotice",
    expectedFields: [
      "taxpayer",
      "fiscalYear",
      "incomeYear",
      "noticeReference",
      "referenceIncome",
      "taxableIncome",
      "taxAmount",
      "withholdingAlreadyPaid",
      "amountDue",
      "refundAmount",
      "paymentSchedule",
      "paymentDeadline"
    ],
    officialSources: [SRC_AVIS],
    confidence: 0.9
  }),
  entry({
    id: "fr-tax-property-notice",
    family: "propertyTax",
    documentType: "propertyTax",
    referenceNumbers: [],
    cerfaNumbers: [],
    aliases: ["avis de taxe fonciere", "taxes foncieres", "taxe fonciere"],
    officialTitle: "Avis de taxe foncière",
    description:
      "Avis d'imposition de taxe foncière mis à disposition par la DGFiP.",
    purpose: "Informer du montant de taxe foncière et des modalités de paiement.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: [
      "taxe fonciere",
      "avis de taxe fonciere",
      "propriete batie",
      "date limite de paiement"
    ],
    negativeSignals: ["total ht", "total ttc", "tva"],
    relatedDocuments: [],
    profileId: "propertyTax",
    expectedFields: [
      "taxpayer",
      "fiscalYear",
      "taxAmount",
      "amountDue",
      "paymentDeadline",
      "paymentInformation"
    ],
    officialSources: [SRC_TF, SRC_AVIS],
    confidence: 0.9
  }),
  entry({
    id: "fr-tax-2065-sd",
    family: "corporateTax",
    documentType: "taxForm",
    referenceNumbers: ["2065-SD", "2065"],
    cerfaNumbers: [],
    aliases: ["impot sur les societes", "liasse fiscale"],
    officialTitle: "Déclaration de résultat / impôt sur les sociétés (2065-SD)",
    description: "Formulaire catalogue DGFiP relatif à l'impôt sur les sociétés.",
    purpose: "Déclarer le résultat fiscal des sociétés.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2065", "impot sur les societes"],
    negativeSignals: [],
    relatedDocuments: [],
    profileId: "taxDocument",
    expectedFields: ["documentReference", "fiscalYear", "taxAmount"],
    officialSources: [SRC_FORMS],
    confidence: 0.8
  }),
  entry({
    id: "fr-tax-3310-ca3",
    family: "vatDeclaration",
    documentType: "taxForm",
    referenceNumbers: ["3310-CA3-SD", "3310-CA3", "CA3"],
    cerfaNumbers: [],
    aliases: ["declaration de tva", "ca3"],
    officialTitle: "Déclaration de TVA (3310-CA3-SD)",
    description: "Formulaire catalogue DGFiP de déclaration de TVA.",
    purpose: "Déclarer la TVA.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["3310", "ca3", "tva"],
    negativeSignals: [],
    relatedDocuments: [],
    profileId: "taxDocument",
    expectedFields: ["documentReference", "fiscalYear", "taxAmount"],
    officialSources: [SRC_FORMS],
    confidence: 0.8
  }),
  entry({
    id: "fr-tax-2572-sd",
    family: "businessTax",
    documentType: "taxForm",
    referenceNumbers: ["2572-SD", "2572"],
    cerfaNumbers: [],
    aliases: ["retenue a la source", "2572"],
    officialTitle: "Formulaire 2572-SD",
    description: "Formulaire catalogue DGFiP (référence officielle recherche de formulaire).",
    purpose: "Déclaration / formalité fiscale professionnelle (détail selon notice officielle).",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["2572"],
    negativeSignals: [],
    relatedDocuments: [],
    profileId: "taxDocument",
    expectedFields: ["documentReference"],
    officialSources: [SRC_FORMS],
    confidence: 0.7
  }),
  entry({
    id: "fr-tax-1330-cvae",
    family: "businessTax",
    documentType: "taxForm",
    referenceNumbers: ["1330-CVAE-SD", "1330-CVAE"],
    cerfaNumbers: [],
    aliases: ["cvae"],
    officialTitle: "Formulaire 1330-CVAE-SD",
    description: "Formulaire catalogue DGFiP relatif à la CVAE.",
    purpose: "Formalité CVAE.",
    applicableYears: [2024, 2025, 2026],
    expectedSignals: ["1330", "cvae"],
    negativeSignals: [],
    relatedDocuments: [],
    profileId: "taxDocument",
    expectedFields: ["documentReference", "fiscalYear"],
    officialSources: [SRC_FORMS],
    confidence: 0.75
  }),
  entry({
    id: "fr-tax-unknown",
    family: "unknownTaxDocument",
    documentType: "unknownTaxDocument",
    referenceNumbers: [],
    cerfaNumbers: [],
    aliases: ["document fiscal"],
    officialTitle: "Document fiscal non identifié précisément",
    description:
      "Type de repli lorsqu'un document est clairement fiscal mais non rattaché à une référence/famille connue.",
    purpose: "Éviter une fausse classification précise.",
    applicableYears: [],
    expectedSignals: ["impot", "fiscal", "dgfip"],
    negativeSignals: [],
    relatedDocuments: [],
    profileId: "unknownTaxDocument",
    expectedFields: [],
    officialSources: [SRC_AVIS],
    confidence: 0.5
  })
];

export const FRENCH_TAX_REGISTRY_VERSION = "2026.08.08-v4l1";
