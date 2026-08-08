/**
 * Packs sémantiques prioritaires V4-N.
 * Reformulations courtes basées sur pages officielles impots.gouv.fr.
 * Ne copie pas les notices complètes. Aucune invention de cases/délais/montants.
 */

import type {
  KnowledgeProvenance,
  TaxDocumentSemanticKnowledge
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

const SRC_2042 = src(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n°2042 — Déclaration des revenus",
  ["officialTitle", "purpose", "description", "plainLanguage", "relations"]
);
const SRC_2044 = src(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n°2044 — Déclaration des revenus fonciers",
  ["officialTitle", "purpose", "description", "plainLanguage"]
);
const SRC_IFI = src(
  "https://www.impots.gouv.fr/formulaire/2042-ifi/declaration-dimpot-sur-la-fortune-immobiliere",
  "Formulaire n°2042-IFI — Déclaration d'impôt sur la fortune immobilière",
  ["officialTitle", "purpose", "description", "plainLanguage", "audience"]
);
const SRC_NR = src(
  "https://www.impots.gouv.fr/formulaire/2042-nr/declaration-des-revenus-complementaire",
  "Formulaire n°2042-NR — Déclaration des revenus complémentaire",
  ["officialTitle", "purpose", "description", "plainLanguage", "audience"]
);
const SRC_AVIS = src(
  "https://www.impots.gouv.fr/particulier/jai-besoin-dun-document-avis-dimpot-formulaire",
  "J'ai besoin d'un document (avis d'impôt, formulaire…)",
  ["officialTitle", "purpose", "family", "plainLanguage"]
);
const SRC_TF = src(
  "https://www.impots.gouv.fr/particulier/questions/quelle-date-vais-je-recevoir-mon-avis-de-taxe-fonciere-et-quand-dois-je-la",
  "Avis de taxe foncière — dates de mise à disposition et paiement",
  ["officialTitle", "purpose", "family", "plainLanguage"]
);
const SRC_FORMS = src(
  "https://www.impots.gouv.fr/recherche-de-formulaire",
  "Recherche de formulaire | impots.gouv.fr",
  ["reference", "officialTitle"]
);

function pack(
  partial: TaxDocumentSemanticKnowledge
): TaxDocumentSemanticKnowledge {
  return partial;
}

/**
 * Documents prioritaires réellement présents dans le registry V4-M
 * et enrichis depuis sources officielles vérifiées.
 */
export const PRIORITY_SEMANTIC_PACKS: readonly TaxDocumentSemanticKnowledge[] = [
  pack({
    reference: "2042",
    normalizedReference: "2042",
    officialTitle: "Déclaration des revenus",
    shortTitle: "Déclaration de revenus 2042",
    family: "incomeTaxReturn",
    documentKind: "form",
    description:
      "Formulaire principal permettant de déclarer les revenus du foyer fiscal auprès de l'administration fiscale.",
    purpose:
      "Déclarer les revenus et certaines informations nécessaires à l'établissement de l'impôt sur le revenu.",
    audience: ["particuliers", "foyer fiscal"],
    commonSituations: [
      "déclaration annuelle des revenus",
      "mise à jour des informations du foyer fiscal"
    ],
    userQuestionsAnswered: [
      "Qu'est-ce que le formulaire 2042 ?",
      "À quoi sert la déclaration de revenus ?"
    ],
    importantSections: [
      { concept: "identity", label: "Identité / foyer fiscal" },
      { concept: "income", label: "Revenus" },
      { concept: "credits", label: "Réductions et crédits (via annexes)" }
    ],
    relatedDocumentRefs: ["2042-C", "2042-C-PRO", "2042-RICI", "2044", "2047"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "10330",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.95,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit de la déclaration principale de revenus. Elle sert à déclarer les revenus et certaines informations nécessaires au calcul de l'impôt sur le revenu.",
    plainLanguagePurpose:
      "Elle permet à l'administration d'établir l'impôt sur le revenu à partir des éléments déclarés.",
    generalPossibleActions: [
      "Ce type de formulaire sert à déclarer des revenus ; toute échéance ou case à remplir doit figurer explicitement sur le document consulté."
    ],
    generalWhatToCheck: [
      "Identité des déclarants",
      "Année des revenus concernés",
      "Montants de revenus indiqués",
      "Annexes éventuellement jointes (2042-C, 2042-RICI, etc.)"
    ]
  }),
  pack({
    reference: "2042-C",
    normalizedReference: "2042-C",
    officialTitle: "Déclaration de revenus complémentaire",
    shortTitle: "Déclaration complémentaire 2042-C",
    family: "incomeTaxReturn",
    documentKind: "form",
    description:
      "Annexe complémentaire à la déclaration des revenus n°2042 pour certaines catégories de revenus ou situations.",
    purpose:
      "Déclarer des éléments complémentaires qui ne figurent pas directement sur la déclaration 2042 principale.",
    audience: ["particuliers", "foyer fiscal"],
    commonSituations: [
      "revenus ou situations à reporter en complément de la 2042"
    ],
    userQuestionsAnswered: ["Qu'est-ce que le formulaire 2042-C ?"],
    importantSections: [
      { concept: "identity", label: "Identité" },
      { concept: "complementaryIncome", label: "Éléments complémentaires" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "11222",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'une déclaration complémentaire à la déclaration de revenus principale. Elle sert pour certaines catégories de revenus ou situations qui ne figurent pas directement dans la déclaration 2042.",
    plainLanguagePurpose:
      "Compléter la déclaration 2042 lorsque des éléments doivent être déclarés sur cette annexe.",
    generalPossibleActions: [
      "Ce formulaire est en général joint ou associé à une déclaration 2042 ; les actions précises dépendent du document reçu."
    ],
    generalWhatToCheck: [
      "Lien avec la déclaration 2042",
      "Rubriques complémentaires renseignées",
      "Année des revenus"
    ]
  }),
  pack({
    reference: "2042-C-PRO",
    normalizedReference: "2042-C-PRO",
    officialTitle:
      "Déclaration de revenus complémentaire des professions non salariées",
    shortTitle: "2042-C-PRO — professions non salariées",
    family: "professionalIncomeDeclaration",
    documentKind: "form",
    description:
      "Annexe 2042 destinée à certains revenus professionnels non salariés.",
    purpose:
      "Déclarer des éléments relatifs aux professions non salariées en complément de la déclaration de revenus.",
    audience: ["professions non salariées", "particuliers concernés"],
    commonSituations: ["revenus professionnels non salariés à déclarer"],
    userQuestionsAnswered: ["À quoi sert le 2042-C-PRO ?"],
    importantSections: [
      { concept: "professionalIncome", label: "Revenus professionnels" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'une annexe de la déclaration de revenus destinée à certains revenus des professions non salariées.",
    plainLanguagePurpose:
      "Elle complète la déclaration 2042 pour des situations professionnelles non salariées.",
    generalPossibleActions: [
      "Ce type d'annexe complète une déclaration de revenus ; aucune obligation personnelle n'est déduite sans preuve dans le document."
    ],
    generalWhatToCheck: [
      "Lien avec la 2042",
      "Éléments professionnels déclarés",
      "Année concernée"
    ]
  }),
  pack({
    reference: "2042-RICI",
    normalizedReference: "2042-RICI",
    officialTitle: "Déclaration des réductions et crédits d'impôt",
    shortTitle: "2042-RICI — réductions et crédits d'impôt",
    family: "taxCreditReduction",
    documentKind: "form",
    description:
      "Annexe permettant de déclarer certaines réductions d'impôt et certains crédits d'impôt.",
    purpose:
      "Déclarer les réductions et crédits d'impôt concernés par ce formulaire.",
    audience: ["particuliers"],
    commonSituations: ["réductions ou crédits d'impôt à déclarer"],
    userQuestionsAnswered: ["À quoi sert le 2042-RICI ?"],
    importantSections: [
      { concept: "taxCredits", label: "Réductions et crédits d'impôt" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "15637",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire complémentaire concerne certaines réductions et certains crédits d'impôt.",
    plainLanguagePurpose:
      "Il sert à déclarer des réductions ou crédits d'impôt associés à la déclaration de revenus.",
    generalPossibleActions: [
      "Ce type de formulaire complète une déclaration de revenus ; les montants ou cases exacts doivent figurer sur le document."
    ],
    generalWhatToCheck: [
      "Réductions ou crédits mentionnés",
      "Lien avec la déclaration 2042",
      "Année concernée"
    ]
  }),
  pack({
    reference: "2042-IFI",
    normalizedReference: "2042-IFI",
    officialTitle: "Déclaration d'impôt sur la fortune immobilière",
    shortTitle: "2042-IFI",
    family: "wealthTax",
    documentKind: "form",
    description:
      "Formulaire de déclaration de l'impôt sur la fortune immobilière (IFI).",
    purpose:
      "Déclarer l'IFI lorsque le patrimoine immobilier net taxable au 1er janvier dépasse le seuil prévu par la réglementation.",
    audience: ["contribuables concernés par l'IFI"],
    commonSituations: [
      "patrimoine immobilier net taxable supérieur au seuil légal au 1er janvier"
    ],
    userQuestionsAnswered: ["Qu'est-ce que le formulaire 2042-IFI ?"],
    importantSections: [
      { concept: "realEstateWealth", label: "Patrimoine immobilier" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_IFI],
    cerfa: {
      number: "15798",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025],
    confidence: 0.92,
    provenance: [SRC_IFI],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit de la déclaration d'impôt sur la fortune immobilière (IFI).",
    plainLanguagePurpose:
      "Elle sert à déclarer l'IFI lorsque le patrimoine immobilier net taxable dépasse le seuil prévu.",
    generalPossibleActions: [
      "Ce formulaire concerne l'IFI ; les seuils et obligations précises dépendent de la situation et du document reçu."
    ],
    generalWhatToCheck: [
      "Patrimoine immobilier déclaré",
      "Année / millésime du formulaire",
      "Éléments de calcul indiqués sur le document"
    ]
  }),
  pack({
    reference: "2042-NR",
    normalizedReference: "2042-NR",
    officialTitle: "Déclaration des revenus complémentaire",
    shortTitle: "2042-NR",
    family: "incomeTaxReturn",
    documentKind: "form",
    description:
      "Déclaration complémentaire liée à certaines situations de départ à l'étranger ou de retour en France avec revenus de source française.",
    purpose:
      "Déclarer des revenus de source française dans les situations de départ à l'étranger ou avant retour en France durant l'année civile, lorsque ce formulaire s'applique.",
    audience: ["contribuables en départ/retour", "non-résidents concernés"],
    commonSituations: [
      "départ à l'étranger",
      "retour en France avec revenus de source française"
    ],
    userQuestionsAnswered: ["À quoi sert le 2042-NR ?"],
    importantSections: [
      { concept: "foreignSituation", label: "Situation internationale" },
      { concept: "income", label: "Revenus de source française" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_NR],
    cerfa: {
      number: "11942",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025],
    confidence: 0.9,
    provenance: [SRC_NR],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'une déclaration complémentaire de revenus utilisée dans certaines situations de départ à l'étranger ou de retour en France.",
    plainLanguagePurpose:
      "Elle sert à déclarer des revenus de source française dans ces situations, lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Ce formulaire concerne des situations internationales particulières ; aucune action personnelle n'est inventée sans preuve documentaire."
    ],
    generalWhatToCheck: [
      "Situation de départ ou retour",
      "Revenus de source française indiqués",
      "Année concernée"
    ]
  }),
  pack({
    reference: "2044",
    normalizedReference: "2044",
    officialTitle: "Déclaration des revenus fonciers",
    shortTitle: "Déclaration des revenus fonciers 2044",
    family: "rentalIncomeDeclaration",
    documentKind: "form",
    description:
      "Formulaire permettant de déclarer les revenus provenant de la location de locaux non meublés (loyers, fermages), hors cas relevant d'autres déclarations spécifiques.",
    purpose:
      "Déclarer les revenus fonciers lorsque ce formulaire est requis.",
    audience: ["propriétaires bailleurs", "particuliers concernés"],
    commonSituations: ["location de locaux non meublés"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2044 ?"],
    importantSections: [
      { concept: "rentalIncome", label: "Revenus fonciers" },
      { concept: "charges", label: "Charges / éléments de calcul" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2044],
    cerfa: {
      number: "10334",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.93,
    provenance: [SRC_2044],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Cette déclaration concerne les revenus fonciers dans les situations où ce formulaire est nécessaire.",
    plainLanguagePurpose:
      "Elle sert à déclarer les revenus issus de la location de locaux non meublés lorsqu'elle s'applique.",
    generalPossibleActions: [
      "Ce formulaire complète souvent une déclaration de revenus ; les montants et échéances doivent figurer sur le document."
    ],
    generalWhatToCheck: [
      "Loyers ou revenus fonciers indiqués",
      "Année des revenus",
      "Lien éventuel avec la déclaration 2042"
    ]
  }),
  pack({
    reference: "2047",
    normalizedReference: "2047",
    officialTitle: "Déclaration des revenus encaissés à l'étranger",
    shortTitle: "2047 — revenus de l'étranger",
    family: "foreignIncomeDeclaration",
    documentKind: "form",
    description:
      "Formulaire pour déclarer des revenus encaissés à l'étranger.",
    purpose:
      "Déclarer les revenus de source étrangère concernés par ce formulaire.",
    audience: ["particuliers percevant des revenus à l'étranger"],
    commonSituations: ["revenus encaissés hors de France"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2047 ?"],
    importantSections: [
      { concept: "foreignIncome", label: "Revenus de l'étranger" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_FORMS, SRC_2042],
    cerfa: {
      number: "11226",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.88,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire sert à déclarer certains revenus encaissés à l'étranger.",
    plainLanguagePurpose:
      "Il complète la déclaration de revenus lorsque des revenus de source étrangère doivent être déclarés via ce formulaire.",
    generalPossibleActions: [
      "Ce type de déclaration est lié à la déclaration de revenus ; aucune obligation précise n'est inventée sans le document."
    ],
    generalWhatToCheck: [
      "Pays / source des revenus",
      "Montants indiqués",
      "Lien avec la 2042"
    ]
  }),
  pack({
    reference: "2074",
    normalizedReference: "2074",
    officialTitle: "Déclaration des plus ou moins values",
    shortTitle: "2074 — plus ou moins-values",
    family: "capitalGainsDeclaration",
    documentKind: "form",
    description:
      "Formulaire relatif à la déclaration de certaines plus ou moins-values.",
    purpose:
      "Déclarer des plus ou moins-values lorsque ce formulaire s'applique.",
    audience: ["particuliers concernés par des plus ou moins-values"],
    commonSituations: ["cession d'actifs générant plus ou moins-values"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2074 ?"],
    importantSections: [
      { concept: "capitalGains", label: "Plus ou moins-values" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire de déclaration de certaines plus ou moins-values.",
    plainLanguagePurpose:
      "Il sert à déclarer ces opérations lorsque le formulaire est requis.",
    generalPossibleActions: [
      "Les opérations et montants exacts doivent figurer sur le document ; aucune plus-value n'est inventée."
    ],
    generalWhatToCheck: [
      "Opérations mentionnées",
      "Montants de plus ou moins-values",
      "Année concernée"
    ]
  }),
  pack({
    reference: "3916",
    normalizedReference: "3916",
    officialTitle:
      "Déclaration par un résident d'un compte ouvert hors de France",
    shortTitle: "3916 — comptes à l'étranger",
    family: "foreignAccountsDeclaration",
    documentKind: "form",
    description:
      "Formulaire de déclaration relative à certains comptes ouverts, détenus, utilisés ou clos hors de France.",
    purpose:
      "Déclarer certains comptes à l'étranger lorsque ce formulaire s'applique.",
    audience: ["résidents concernés par des comptes hors de France"],
    commonSituations: ["compte bancaire ou assimilé à l'étranger"],
    userQuestionsAnswered: ["À quoi sert le formulaire 3916 ?"],
    importantSections: [
      { concept: "foreignAccounts", label: "Comptes hors de France" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11916",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire concerne la déclaration de certains comptes ouverts hors de France.",
    plainLanguagePurpose:
      "Il sert à déclarer ces comptes lorsque l'obligation documentaire s'applique.",
    generalPossibleActions: [
      "Les comptes et informations exactes doivent figurer sur le document ; aucune liste de comptes n'est inventée."
    ],
    generalWhatToCheck: [
      "Identification des comptes mentionnés",
      "Pays de détention",
      "Année / période concernée"
    ]
  }),
  pack({
    reference: "2065-SD",
    normalizedReference: "2065-SD",
    officialTitle: "Impôt sur les sociétés",
    shortTitle: "2065-SD — impôt sur les sociétés",
    family: "corporateTax",
    documentKind: "form",
    description:
      "Formulaire catalogue DGFiP relatif à l'impôt sur les sociétés.",
    purpose: "Déclarer des éléments liés à l'impôt sur les sociétés.",
    audience: ["entreprises / personnes morales concernées"],
    commonSituations: ["déclaration d'impôt sur les sociétés"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2065-SD ?"],
    importantSections: [
      { concept: "corporateResult", label: "Résultat / impôt sociétés" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire fiscal relatif à l'impôt sur les sociétés.",
    plainLanguagePurpose:
      "Il sert aux déclarations liées à l'impôt sur les sociétés lorsque ce formulaire s'applique.",
    generalPossibleActions: [
      "Les échéances et montants doivent être lus sur le document ; aucune obligation n'est inventée."
    ],
    generalWhatToCheck: [
      "Exercice / période",
      "Montants déclarés",
      "Référence du formulaire"
    ]
  }),
  pack({
    reference: "3310-CA3-SD",
    normalizedReference: "3310-CA3-SD",
    officialTitle: "Déclaration de TVA et taxes assimilées (CA3)",
    shortTitle: "3310-CA3-SD — TVA",
    family: "vatDeclaration",
    documentKind: "form",
    description:
      "Formulaire de déclaration de TVA et taxes assimilées (régime concerné).",
    purpose: "Déclarer la TVA et taxes assimilées via le formulaire CA3.",
    audience: ["assujettis à la TVA concernés"],
    commonSituations: ["déclaration périodique de TVA"],
    userQuestionsAnswered: ["À quoi sert le 3310-CA3-SD ?"],
    importantSections: [
      { concept: "vat", label: "TVA et taxes assimilées" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "10963",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.88,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'une déclaration de TVA (formulaire CA3) et taxes assimilées.",
    plainLanguagePurpose:
      "Elle sert à déclarer la TVA pour les assujettis concernés par ce régime.",
    generalPossibleActions: [
      "Les périodes et montants de TVA doivent figurer sur le document ; aucun calcul n'est inventé."
    ],
    generalWhatToCheck: [
      "Période de déclaration",
      "Montants de TVA indiqués",
      "Référence CA3 / 3310"
    ]
  }),
  pack({
    reference: "INCOME-TAX-NOTICE",
    normalizedReference: "INCOME-TAX-NOTICE",
    officialTitle: "Avis d'impôt sur les revenus",
    shortTitle: "Avis d'impôt sur le revenu",
    family: "incomeTaxNotice",
    documentKind: "taxNotice",
    description:
      "Document restitué par l'administration indiquant le résultat de l'impôt sur le revenu (impôt calculé, prélèvements, solde).",
    purpose:
      "Informer le contribuable du résultat de l'impôt sur le revenu et des suites éventuelles (paiement ou remboursement) indiquées sur l'avis.",
    audience: ["particuliers / foyers fiscaux"],
    commonSituations: [
      "réception de l'avis après déclaration",
      "consultation de l'avis dans l'espace Finances publiques"
    ],
    userQuestionsAnswered: [
      "Qu'est-ce qu'un avis d'impôt sur le revenu ?",
      "Que regarder sur un avis d'impôt ?"
    ],
    importantSections: [
      { concept: "taxResult", label: "Impôt calculé" },
      { concept: "withholding", label: "Prélèvements déjà effectués" },
      { concept: "balance", label: "Reste à payer ou remboursement" },
      { concept: "dates", label: "Dates / échéances indiquées" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_AVIS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_AVIS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'un avis d'impôt sur le revenu : un document de l'administration qui indique le résultat de votre imposition.",
    plainLanguagePurpose:
      "Il informe du montant d'impôt calculé, des prélèvements déjà pris en compte et du solde (à payer ou à rembourser) lorsqu'il figure sur l'avis.",
    generalPossibleActions: [
      "Selon le contenu de l'avis, un paiement ou aucune action peut être indiqué ; seules les mentions du document font foi."
    ],
    generalWhatToCheck: [
      "Impôt calculé",
      "Prélèvement à la source déjà effectué",
      "Reste à payer ou montant à rembourser",
      "Dates limites éventuellement indiquées",
      "Référence de l'avis"
    ]
  }),
  pack({
    reference: "PROPERTY-TAX-NOTICE",
    normalizedReference: "PROPERTY-TAX-NOTICE",
    officialTitle: "Avis de taxe foncière",
    shortTitle: "Avis de taxe foncière",
    family: "propertyTax",
    documentKind: "taxNotice",
    description:
      "Avis d'imposition de taxe foncière mis à disposition par la DGFiP (papier et/ou en ligne).",
    purpose:
      "Informer du montant de taxe foncière et des modalités de mise à disposition / paiement indiquées sur l'avis.",
    audience: ["propriétaires concernés"],
    commonSituations: ["réception annuelle de l'avis de taxe foncière"],
    userQuestionsAnswered: [
      "Qu'est-ce qu'un avis de taxe foncière ?",
      "Que regarder sur un avis de taxe foncière ?"
    ],
    importantSections: [
      { concept: "taxAmount", label: "Montant de la taxe" },
      { concept: "deadline", label: "Date limite de paiement si indiquée" },
      { concept: "property", label: "Contexte de la propriété" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_TF, SRC_AVIS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_TF],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'un avis de taxe foncière adressé ou mis à disposition par l'administration fiscale.",
    plainLanguagePurpose:
      "Il indique le montant de la taxe foncière et, lorsqu'elles figurent, les informations de paiement.",
    generalPossibleActions: [
      "Un paiement peut être demandé si l'avis l'indique ; aucune échéance n'est inventée si elle est absente du document."
    ],
    generalWhatToCheck: [
      "Montant total à payer",
      "Année d'imposition",
      "Date limite de paiement si présente",
      "Référence de l'avis"
    ]
  }),
  pack({
    reference: "2572-SD",
    normalizedReference: "2572-SD",
    officialTitle: "Formulaire 2572-SD",
    shortTitle: "2572-SD",
    family: "withholdingTax",
    documentKind: "form",
    description:
      "Formulaire catalogue DGFiP (référence officielle recherche de formulaire) lié à des formalités de retenue / prélèvement selon la notice officielle.",
    purpose:
      "Formalité fiscale professionnelle de retenue/prélèvement selon le périmètre du formulaire officiel.",
    audience: ["professionnels concernés"],
    commonSituations: ["formalités de retenue à la source selon notice"],
    userQuestionsAnswered: ["Que désigne le formulaire 2572-SD ?"],
    importantSections: [],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.7,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire fiscal professionnel référencé par l'administration (2572-SD).",
    plainLanguagePurpose:
      "Son usage précis dépend de la notice officielle du formulaire ; ExpliqueMoi n'invente pas le détail des cases.",
    generalPossibleActions: [
      "Consulter la notice officielle du formulaire pour le détail des obligations."
    ],
    generalWhatToCheck: [
      "Référence du formulaire",
      "Période indiquée sur le document",
      "Montants explicitement présents"
    ]
  }),
  pack({
    reference: "1330-CVAE-SD",
    normalizedReference: "1330-CVAE-SD",
    officialTitle: "Formulaire 1330-CVAE-SD",
    shortTitle: "1330-CVAE-SD",
    family: "businessTax",
    documentKind: "form",
    description: "Formulaire catalogue DGFiP relatif à la CVAE.",
    purpose: "Formalité CVAE lorsque ce formulaire s'applique.",
    audience: ["entreprises concernées par la CVAE"],
    commonSituations: ["formalités CVAE"],
    userQuestionsAnswered: ["Que désigne le 1330-CVAE-SD ?"],
    importantSections: [],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.75,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire fiscal relatif à la CVAE (1330-CVAE-SD).",
    plainLanguagePurpose:
      "Il concerne des formalités CVAE ; le détail dépend de la notice officielle.",
    generalPossibleActions: [
      "Se reporter à la notice officielle pour toute obligation précise."
    ],
    generalWhatToCheck: [
      "Référence du formulaire",
      "Période",
      "Montants présents sur le document"
    ]
  }),
  pack({
    reference: "2735",
    normalizedReference: "2735",
    officialTitle: "Déclaration de dons manuels et de sommes d'argent",
    shortTitle: "2735 — dons manuels",
    family: "inheritanceDonation",
    documentKind: "form",
    description:
      "Formulaire de déclaration de dons manuels et de sommes d'argent.",
    purpose:
      "Déclarer certains dons manuels et sommes d'argent lorsque ce formulaire s'applique.",
    audience: ["particuliers concernés par des dons manuels"],
    commonSituations: ["don manuel / somme d'argent à déclarer"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2735 ?"],
    importantSections: [
      { concept: "gifts", label: "Dons / sommes d'argent" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11278",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2025],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire sert à déclarer certains dons manuels et sommes d'argent.",
    plainLanguagePurpose:
      "Il permet d'accomplir la formalité déclarative prévue pour ces dons lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les dons et montants exacts doivent figurer sur le document ; rien n'est inventé."
    ],
    generalWhatToCheck: [
      "Nature du don",
      "Montants indiqués",
      "Identité des parties si présente"
    ]
  }),
  pack({
    reference: "2561",
    normalizedReference: "2561",
    officialTitle:
      "Déclaration récapitulative des opérations sur valeurs mobilières",
    shortTitle: "2561 — valeurs mobilières",
    family: "withholdingTax",
    documentKind: "form",
    description:
      "Déclaration récapitulative des opérations sur valeurs mobilières et revenus de capitaux mobiliers.",
    purpose:
      "Récapituler certaines opérations sur valeurs mobilières / revenus de capitaux mobiliers.",
    audience: ["établissements / déclarants concernés"],
    commonSituations: ["opérations sur valeurs mobilières"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2561 ?"],
    importantSections: [
      { concept: "securities", label: "Opérations sur valeurs mobilières" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11428",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2023, 2024, 2025],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire récapitule certaines opérations sur valeurs mobilières et revenus de capitaux mobiliers.",
    plainLanguagePurpose:
      "Il sert à déclarer ces opérations lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les opérations listées doivent provenir du document ; aucune opération n'est inventée."
    ],
    generalWhatToCheck: [
      "Opérations mentionnées",
      "Montants",
      "Période"
    ]
  }),
  pack({
    reference: "2777",
    normalizedReference: "2777",
    officialTitle:
      "Revenus de capitaux mobiliers — prélèvement et retenue à la source",
    shortTitle: "2777 — RCM / prélèvement",
    family: "withholdingTax",
    documentKind: "form",
    description:
      "Formulaire relatif aux revenus de capitaux mobiliers (prélèvement et retenue à la source).",
    purpose:
      "Déclarer / liquider certains prélèvements et retenues sur revenus de capitaux mobiliers.",
    audience: ["déclarants concernés par les RCM"],
    commonSituations: ["prélèvement / retenue sur revenus de capitaux mobiliers"],
    userQuestionsAnswered: ["À quoi sert le formulaire 2777 ?"],
    importantSections: [
      { concept: "withholding", label: "Prélèvement / retenue" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "10024",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Ce formulaire concerne les revenus de capitaux mobiliers soumis à prélèvement ou retenue à la source.",
    plainLanguagePurpose:
      "Il sert aux formalités de prélèvement/retenue sur ces revenus lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Un prélèvement déjà effectué n'est pas automatiquement un montant dû ; se fier aux libellés du document."
    ],
    generalWhatToCheck: [
      "Montants prélevés / retenus",
      "Période",
      "Nature des revenus"
    ]
  }),
  pack({
    reference: "2031-SD",
    normalizedReference: "2031-SD",
    officialTitle: "Déclaration de résultat — BIC (2031-SD)",
    shortTitle: "2031-SD — BIC",
    family: "professionalBenefits",
    documentKind: "form",
    description:
      "Formulaire de déclaration de résultat pour certains régimes BIC.",
    purpose: "Déclarer le résultat fiscal BIC lorsque ce formulaire s'applique.",
    audience: ["professionnels BIC concernés"],
    commonSituations: ["déclaration de résultat BIC"],
    userQuestionsAnswered: ["À quoi sert le 2031-SD ?"],
    importantSections: [
      { concept: "result", label: "Résultat" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11194",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "verified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire de déclaration de résultat pour certains régimes de bénéfices industriels et commerciaux (BIC).",
    plainLanguagePurpose:
      "Il sert à déclarer ce résultat lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les montants de résultat doivent figurer sur le document ; aucun résultat n'est inventé."
    ],
    generalWhatToCheck: [
      "Exercice",
      "Résultat déclaré",
      "Référence 2031-SD"
    ]
  }),
  pack({
    reference: "2035-SD",
    normalizedReference: "2035-SD",
    officialTitle: "Déclaration de résultat — BNC (2035-SD)",
    shortTitle: "2035-SD — BNC",
    family: "professionalBenefits",
    documentKind: "form",
    description:
      "Formulaire de déclaration de résultat pour certains régimes BNC.",
    purpose: "Déclarer le résultat fiscal BNC lorsque ce formulaire s'applique.",
    audience: ["professionnels BNC concernés"],
    commonSituations: ["déclaration de résultat BNC"],
    userQuestionsAnswered: ["À quoi sert le 2035-SD ?"],
    importantSections: [
      { concept: "result", label: "Résultat" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2025],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat:
      "Il s'agit d'un formulaire de déclaration de résultat pour certains régimes de bénéfices non commerciaux (BNC).",
    plainLanguagePurpose:
      "Il sert à déclarer ce résultat lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Aucun montant de résultat n'est inventé sans preuve documentaire."
    ],
    generalWhatToCheck: [
      "Exercice",
      "Résultat déclaré",
      "Référence 2035-SD"
    ]
  })
];

export const PRIORITY_SEMANTIC_BY_REF: ReadonlyMap<
  string,
  TaxDocumentSemanticKnowledge
> = new Map(PRIORITY_SEMANTIC_PACKS.map((p) => [p.normalizedReference, p]));

export function getPrioritySemantic(
  normalizedReference: string
): TaxDocumentSemanticKnowledge | null {
  return PRIORITY_SEMANTIC_BY_REF.get(normalizedReference) || null;
}
