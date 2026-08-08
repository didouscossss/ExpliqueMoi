/**
 * Enrichissements curatés (Cerfa, relations, titres officiels) —
 * uniquement lorsque la source officielle les établit.
 * Ne remplacent pas la découverte : ils l’enrichissent.
 */

import type { KnowledgeRelationType } from "../../../../types/knowledge.js";

export interface CuratedEnrichment {
  normalizedReference: string;
  officialTitle?: string;
  cerfaNumbers?: string[];
  cerfaVersion?: string | null;
  applicableYears?: number[];
  aliases?: string[];
  description?: string;
  purpose?: string;
  relations?: Array<{
    targetRef: string;
    relationType: KnowledgeRelationType;
    source: string;
    confidence: number;
  }>;
  pageUrl?: string;
}

const SRC = "https://www.impots.gouv.fr";

/** Enrichissements vérifiés (échantillon + V4-L + Cerfa search 2026-08-08). */
export const CURATED_ENRICHMENTS: readonly CuratedEnrichment[] = [
  {
    normalizedReference: "2042",
    officialTitle: "Déclaration des revenus",
    cerfaNumbers: ["10330"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    aliases: ["déclaration des revenus", "formulaire 2042"],
    purpose: "Établissement de l'impôt sur le revenu.",
    relations: [
      { targetRef: "2042-C", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2042-C-PRO", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2042-RICI", relationType: "annexOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2044", relationType: "relatedTo", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.7 },
      { targetRef: "2047", relationType: "relatedTo", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.7 }
    ]
  },
  {
    normalizedReference: "2042-C",
    officialTitle: "Déclaration de revenus complémentaire",
    cerfaNumbers: ["11222"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    // Page dédiée absente du sitemap — provenance via fiche 2042 + recherche officielle
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-C-PRO",
    officialTitle: "Déclaration de revenus complémentaire des professions non salariées",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-RICI",
    officialTitle: "Déclaration des réductions et crédits d'impôt",
    cerfaNumbers: ["15637"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "annexOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-IFI",
    officialTitle: "Déclaration d'impôt sur la fortune immobilière",
    cerfaNumbers: ["15798"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024],
    pageUrl: `${SRC}/formulaire/2042-ifi/declaration-dimpot-sur-la-fortune-immobiliere`
  },
  {
    normalizedReference: "2042-NR",
    officialTitle: "Déclaration des revenus complémentaire",
    cerfaNumbers: ["11942"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025],
    pageUrl: `${SRC}/formulaire/2042-nr/declaration-des-revenus-complementaire`
  },
  {
    normalizedReference: "2044",
    officialTitle: "Déclaration des revenus fonciers",
    cerfaNumbers: ["10334"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2044/declaration-des-revenus-fonciers`,
    relations: [
      { targetRef: "2042", relationType: "relatedTo", source: `${SRC}/formulaire/2044/declaration-des-revenus-fonciers`, confidence: 0.75 }
    ]
  },
  {
    normalizedReference: "2047",
    officialTitle: "Déclaration des revenus encaissés à l'étranger",
    cerfaNumbers: ["11226"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`,
    relations: [
      { targetRef: "2042", relationType: "relatedTo", source: `${SRC}/recherche-de-formulaire`, confidence: 0.7 }
    ]
  },
  {
    normalizedReference: "2074",
    officialTitle: "Déclaration des plus ou moins values",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "3916",
    officialTitle: "Déclaration par un résident d'un compte ouvert hors de France",
    cerfaNumbers: ["11916"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2735",
    officialTitle: "Déclaration de dons manuels et de sommes d'argent",
    cerfaNumbers: ["11278"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2025],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2065-SD",
    officialTitle: "Impôt sur les sociétés",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "3310-CA3-SD",
    officialTitle: "Déclaration de TVA et taxes assimilées (CA3)",
    cerfaNumbers: ["10963"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "2031-SD",
    officialTitle: "Déclaration de résultat — BIC (2031-SD)",
    cerfaNumbers: ["11194"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2026]
  },
  {
    normalizedReference: "2035-SD",
    officialTitle: "Déclaration de résultat — BNC (2035-SD)",
    applicableYears: [2025]
  },
  {
    normalizedReference: "2561",
    officialTitle: "Déclaration récapitulative des opérations sur valeurs mobilières",
    cerfaNumbers: ["11428"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2023, 2024, 2025],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2777",
    officialTitle: "Revenus de capitaux mobiliers — prélèvement et retenue à la source",
    cerfaNumbers: ["10024"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "1330-CVAE-SD",
    officialTitle: "Formulaire 1330-CVAE-SD",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "2572-SD",
    officialTitle: "Formulaire 2572-SD",
    applicableYears: [2024, 2025, 2026]
  }
];

export function enrichmentByRef(): Map<string, CuratedEnrichment> {
  const m = new Map<string, CuratedEnrichment>();
  for (const e of CURATED_ENRICHMENTS) m.set(e.normalizedReference, e);
  return m;
}
