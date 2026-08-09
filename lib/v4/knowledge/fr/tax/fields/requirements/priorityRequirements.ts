/**
 * Packs requirements cases fiscales prioritaires — V4-Q.
 * Sources officielles DGFiP uniquement pour le normatif.
 * Aucune éligibilité, aucun montant inventé, aucun conseil personnalisé.
 */

import type {
  FrenchTaxFieldRequirements,
  GeneralFieldCondition,
  InformationRequirement,
  KnowledgeProvenance,
  SupportingDocumentHint,
  TaxFieldValueType
} from "../../../../../types/knowledge.js";

const RETRIEVED = "2026-08-08";
const YEARS_STABLE = [2024, 2025, 2026];

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

const SRC_2042_NOTICE = src(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice — Remplir la déclaration de revenus 2024 (formulaire 2042)",
  [
    "informationRequirements",
    "possibleSupportingDocuments",
    "generalConditions",
    "expectedValueType"
  ]
);

const SRC_SALAIRES_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR — Traitements et salaires",
  ["informationRequirements", "possibleSupportingDocuments"]
);

const SRC_FONCIERS_BROCHURE = src(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR — Revenus fonciers",
  ["informationRequirements", "generalConditions", "possibleSupportingDocuments"]
);

const SRC_FONCIERS_AIDE = src(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR — revenus fonciers (cases 4BA à 4EA)",
  ["informationRequirements", "generalConditions", "relatedFields"]
);

const SRC_2044_FORM = src(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n°2044 — Déclaration des revenus fonciers",
  ["possibleSupportingDocuments", "documentRefs"]
);

const SRC_2042_FORM = src(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n°2042 — Déclaration des revenus",
  ["documentRefs"]
);

function req(
  partial: InformationRequirement
): InformationRequirement {
  return partial;
}

function support(
  partial: SupportingDocumentHint
): SupportingDocumentHint {
  return partial;
}

function cond(partial: GeneralFieldCondition): GeneralFieldCondition {
  return partial;
}

function pack(
  partial: Omit<
    FrenchTaxFieldRequirements,
    "id" | "normalizedCode" | "country" | "yearStable" | "lastVerifiedAt"
  > & {
    yearStable?: boolean;
    lastVerifiedAt?: string | null;
  }
): FrenchTaxFieldRequirements {
  const normalizedCode = partial.fieldCode.toUpperCase().replace(/\s+/g, "");
  return {
    id: `fr-tax-req-${normalizedCode.toLowerCase()}`,
    documentRef: partial.documentRef,
    documentRefs: partial.documentRefs,
    fieldCode: normalizedCode,
    normalizedCode,
    applicableYears: partial.applicableYears,
    yearStable: partial.yearStable ?? true,
    expectedValueType: partial.expectedValueType,
    informationRequirements: partial.informationRequirements,
    possibleSupportingDocuments: partial.possibleSupportingDocuments,
    generalConditions: partial.generalConditions,
    relatedFields: partial.relatedFields,
    provenance: partial.provenance,
    qualityStatus: partial.qualityStatus,
    lastVerifiedAt: partial.lastVerifiedAt ?? RETRIEVED
  };
}

function salaryRequirements(
  code: string,
  role: "declarant1" | "declarant2",
  roleLabel: string,
  related: string[]
): FrenchTaxFieldRequirements {
  return pack({
    documentRef: "2042",
    documentRefs: ["2042"],
    fieldCode: code,
    applicableYears: YEARS_STABLE,
    expectedValueType: "amount",
    relatedFields: related,
    provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: `${code.toLowerCase()}-amount`,
        kind: "amount",
        label: `Montant des traitements et salaires du ${roleLabel}`,
        description:
          "Les sources officielles indiquent que cette case concerne le montant des traitements et salaires imposables pour le rôle fiscal concerné.",
        priority: "blocking",
        expectedValueType: "amount",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: [code],
            declarantRoleHints: [role],
            documentTypeHints: ["incomeTaxReturn", "taxForm"],
            rejectDocumentTypes: ["invoice", "bankStatement", "contract"],
            rejectKeywords: ["facture", "ttc", "sku", "commande"]
          }
        ],
        provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE],
        questionTemplate: `Disposez-vous du montant des traitements et salaires du ${roleLabel} pour l’année concernée ?`,
        expectedAnswerType: "amount"
      }),
      req({
        id: `${code.toLowerCase()}-year`,
        kind: "year",
        label: "Année des revenus",
        description:
          "L’année des revenus doit correspondre au millésime de la déclaration pour interpréter correctement cette case.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true,
            documentTypeHints: ["incomeTaxReturn", "taxForm", "payslip"]
          }
        ],
        provenance: [SRC_2042_NOTICE],
        questionTemplate: "De quelle année de revenus ce document / ce montant relève-t-il ?",
        expectedAnswerType: "year"
      }),
      req({
        id: `${code.toLowerCase()}-role`,
        kind: "declarantRole",
        label: `Rôle fiscal (${roleLabel})`,
        description: `Cette case est associée au ${roleLabel} selon la notice. Il convient de vérifier que le montant concerne bien ce rôle.`,
        priority: "declarantUnknown",
        expectedValueType: "text",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["declarantRole", "fieldValue"],
            fieldCodeHints: [code],
            declarantRoleHints: [role],
            keywords: [roleLabel, role === "declarant1" ? "déclarant 1" : "déclarant 2"]
          }
        ],
        provenance: [SRC_2042_NOTICE],
        questionTemplate: `Le montant concerne-t-il bien le ${roleLabel} ?`,
        expectedAnswerType: "declarant"
      }),
      req({
        id: `${code.toLowerCase()}-employer-doc`,
        kind: "documentPresence",
        label: "Justificatif employeur / prérempli",
        description:
          "Les montants de salaires peuvent figurer sur des documents employeur ou dans les données préremplies ; leur présence aide à comprendre la case, sans déterminer automatiquement ce qu’il faut déclarer.",
        priority: "supportingDocument",
        expectedValueType: "unknown",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["documentPresence", "amount"],
            documentTypeHints: ["payslip", "taxCertificate", "employerDocument"],
            keywords: [
              "bulletin de paie",
              "attestation fiscale",
              "rémunération",
              "salaire net imposable"
            ],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture ttc", "bon de commande"]
          }
        ],
        provenance: [SRC_SALAIRES_BROCHURE, SRC_2042_NOTICE],
        questionTemplate:
          "Avez-vous un bulletin de paie ou une attestation fiscale employeur correspondant à cette période ?",
        expectedAnswerType: "document"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: `${code.toLowerCase()}-sup-payslip`,
        label: "Bulletin de paie / document employeur",
        description:
          "Document pouvant contenir le salaire net imposable ou des éléments utiles pour comprendre les traitements et salaires.",
        documentTypeHints: ["payslip", "employerDocument"],
        normative: true,
        provenance: [SRC_SALAIRES_BROCHURE]
      }),
      support({
        id: `${code.toLowerCase()}-sup-prefilled`,
        label: "Données préremplies / attestation fiscale",
        description:
          "Les sources officielles évoquent des montants préremplis et des éléments issus de déclarations sociales ; utiles pour vérifier, pas pour conclure automatiquement.",
        documentTypeHints: ["taxCertificate", "incomeTaxReturn"],
        normative: true,
        provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE]
      }),
      support({
        id: `${code.toLowerCase()}-sup-generic-bank`,
        label: "Relevé bancaire (suggestion générique)",
        description:
          "Suggestion générique non normative : un relevé peut parfois aider à situer des versements, sans prouver le montant à reporter en case.",
        documentTypeHints: ["bankStatement"],
        normative: false,
        provenance: [SRC_2042_NOTICE]
      })
    ],
    generalConditions: [
      cond({
        id: `${code.toLowerCase()}-cond-taxable`,
        statement:
          "Cette rubrique concerne généralement les traitements et salaires imposables selon les règles de la déclaration des revenus ; certaines situations particulières sont détaillées dans la notice.",
        provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE]
      })
    ]
  });
}

function foncierRequirements(
  code: string,
  label: string,
  description: string,
  valueType: TaxFieldValueType,
  related: string[],
  extraConditions: GeneralFieldCondition[] = []
): FrenchTaxFieldRequirements {
  return pack({
    documentRef: "2042",
    documentRefs: ["2042", "2044"],
    fieldCode: code,
    applicableYears: YEARS_STABLE,
    expectedValueType: valueType,
    relatedFields: related,
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE, SRC_FONCIERS_BROCHURE],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: `${code.toLowerCase()}-amount`,
        kind: "amount",
        label,
        description,
        priority: "blocking",
        expectedValueType: valueType,
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: [code],
            documentTypeHints: ["incomeTaxReturn", "taxForm", "rentalIncomeDeclaration"],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture", "ttc", "commande"]
          }
        ],
        provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
        questionTemplate: `Disposez-vous du montant concerné par la case ${code} pour l’année des revenus ?`,
        expectedAnswerType: "amount"
      }),
      req({
        id: `${code.toLowerCase()}-year`,
        kind: "year",
        label: "Année des revenus fonciers",
        description:
          "Les revenus fonciers se rapportent à une année précise ; un millésime différent ne doit pas être appliqué silencieusement.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true,
            documentTypeHints: [
              "incomeTaxReturn",
              "taxForm",
              "rentalIncomeDeclaration"
            ]
          }
        ],
        provenance: [SRC_2042_NOTICE],
        questionTemplate: "De quelle année de revenus fonciers s’agit-il ?",
        expectedAnswerType: "year"
      }),
      req({
        id: `${code.toLowerCase()}-2044`,
        kind: "documentPresence",
        label: "Déclaration annexe 2044 (régime réel)",
        description:
          "Pour le régime réel, les sources officielles indiquent souvent un calcul via la déclaration n°2044 avant report sur la 2042.",
        priority: "supportingDocument",
        expectedValueType: "unknown",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["documentPresence", "fieldValue", "amount"],
            documentTypeHints: ["rentalIncomeDeclaration", "taxForm"],
            keywords: ["2044", "revenus fonciers", "régime réel"],
            rejectDocumentTypes: ["invoice"]
          }
        ],
        provenance: [SRC_2042_NOTICE, SRC_2044_FORM, SRC_FONCIERS_AIDE],
        questionTemplate:
          "Avez-vous une déclaration n°2044 (ou un document de calcul des revenus fonciers au régime réel) pour cette année ?",
        expectedAnswerType: "document"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: `${code.toLowerCase()}-sup-2044`,
        label: "Déclaration n°2044 — revenus fonciers",
        description:
          "Formulaire officiel souvent utilisé pour déterminer les montants reportés en cases foncières au régime réel.",
        documentTypeHints: ["rentalIncomeDeclaration", "taxForm"],
        normative: true,
        provenance: [SRC_2044_FORM, SRC_FONCIERS_AIDE]
      }),
      support({
        id: `${code.toLowerCase()}-sup-rent`,
        label: "Justificatif immobilier / loyers (suggestion générique)",
        description:
          "Suggestion générique non normative : quittances ou décomptes peuvent aider à comprendre la situation, sans fixer seuls le montant de la case.",
        documentTypeHints: ["propertyDocument", "bankStatement"],
        normative: false,
        provenance: [SRC_FONCIERS_BROCHURE]
      })
    ],
    generalConditions: [
      cond({
        id: `${code.toLowerCase()}-cond-regime`,
        statement:
          "Cette rubrique peut dépendre du régime d’imposition des revenus fonciers (notamment micro-foncier ou régime réel) et des règles de report prévues par la notice.",
        provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE, SRC_FONCIERS_BROCHURE]
      }),
      ...extraConditions
    ]
  });
}

export const PRIORITY_TAX_FIELD_REQUIREMENTS: readonly FrenchTaxFieldRequirements[] =
  [
    salaryRequirements("1AJ", "declarant1", "déclarant 1", ["1BJ", "1CJ", "1DJ"]),
    salaryRequirements("1BJ", "declarant2", "déclarant 2", ["1AJ", "1CJ", "1DJ"]),

    foncierRequirements(
      "4BA",
      "Revenu foncier net imposable (régime réel)",
      "Les sources officielles indiquent que la case 4BA sert au report du revenu net foncier déterminé selon le régime réel.",
      "amount",
      ["4BB", "4BC", "4BD", "4BE"]
    ),
    foncierRequirements(
      "4BB",
      "Déficit foncier imputable sur les revenus fonciers",
      "Les sources officielles indiquent que la case 4BB concerne un déficit imputable sur les revenus fonciers des années suivantes.",
      "amount",
      ["4BA", "4BC", "4BD"],
      [
        cond({
          id: "4bb-cond-deficit",
          statement:
            "Cette rubrique peut dépendre de l’existence d’un déficit foncier et des règles d’imputation prévues par la notice ; aucune conclusion d’éligibilité n’est tirée ici.",
          provenance: [SRC_FONCIERS_AIDE, SRC_2042_NOTICE]
        })
      ]
    ),
    foncierRequirements(
      "4BC",
      "Déficit foncier imputable sur le revenu global",
      "Les sources officielles indiquent que la case 4BC concerne un déficit pouvant s’imputer sur le revenu brut global dans les conditions prévues.",
      "amount",
      ["4BA", "4BB", "4BD"],
      [
        cond({
          id: "4bc-cond-global",
          statement:
            "Cette rubrique peut dépendre de certaines conditions d’imputation sur le revenu global décrites par les sources officielles.",
          provenance: [SRC_FONCIERS_AIDE, SRC_2042_NOTICE]
        })
      ]
    ),

    pack({
      documentRef: "2042-RICI",
      documentRefs: ["2042", "2042-RICI"],
      fieldCode: "7DB",
      applicableYears: YEARS_STABLE,
      expectedValueType: "amount",
      relatedFields: ["7DR", "7GA"],
      provenance: [SRC_2042_NOTICE],
      qualityStatus: "verified",
      informationRequirements: [
        req({
          id: "7db-amount",
          kind: "amount",
          label: "Montant total des dépenses d’emploi à domicile",
          description:
            "Les sources officielles indiquent que la case 7DB concerne le montant total des dépenses liées à l’emploi à domicile ouvrant droit à crédit d’impôt, sans déduire les aides.",
          priority: "blocking",
          expectedValueType: "amount",
          blocking: true,
          factMatchers: [
            {
              factTypes: ["fieldValue", "amount"],
              fieldCodeHints: ["7DB"],
              documentTypeHints: [
                "incomeTaxReturn",
                "taxForm",
                "taxCertificate",
                "taxCreditDocument"
              ],
              keywords: [
                "emploi à domicile",
                "services à la personne",
                "7DB",
                "dépenses"
              ],
              rejectDocumentTypes: ["invoice"],
              rejectKeywords: ["facture n", "total ttc", "sku"]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate:
            "Disposez-vous du montant total des dépenses d’emploi à domicile pour l’année concernée ?",
          expectedAnswerType: "amount"
        }),
        req({
          id: "7db-year",
          kind: "year",
          label: "Année des dépenses",
          description:
            "Les dépenses d’emploi à domicile se rapportent à une année précise.",
          priority: "yearUnknown",
          expectedValueType: "unknown",
          blocking: true,
          factMatchers: [
            {
              factTypes: ["fiscalYear", "year"],
              yearRequired: true,
              documentTypeHints: [
                "incomeTaxReturn",
                "taxForm",
                "taxCertificate"
              ]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate: "De quelle année ces dépenses d’emploi à domicile relèvent-elles ?",
          expectedAnswerType: "year"
        }),
        req({
          id: "7db-attestation",
          kind: "documentPresence",
          label: "Attestation fiscale / justificatif d’emploi à domicile",
          description:
            "Un document analysé peut contenir une information potentiellement pertinente (attestation fiscale ou relevé de dépenses) pour comprendre la case 7DB, sans conclure au montant à reporter.",
          priority: "supportingDocument",
          expectedValueType: "unknown",
          blocking: false,
          factMatchers: [
            {
              factTypes: ["documentPresence", "amount", "taxCertificate"],
              documentTypeHints: [
                "taxCertificate",
                "taxCreditDocument",
                "employerDocument"
              ],
              keywords: [
                "attestation fiscale",
                "cesu",
                "emploi à domicile",
                "services à la personne",
                "crédit d'impôt"
              ],
              rejectDocumentTypes: ["invoice"],
              rejectKeywords: ["facture n°", "bon de commande", "total ttc"]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate:
            "Avez-vous une attestation fiscale correspondant à ces dépenses d’emploi à domicile ?",
          expectedAnswerType: "document"
        }),
        req({
          id: "7db-aids",
          kind: "amount",
          label: "Aides perçues (souvent liées à la case 7DR)",
          description:
            "Les aides perçues pour financer l’emploi à domicile sont généralement indiquées séparément (case 7DR) et ne doivent pas être déduites du montant de la 7DB dans le document source.",
          priority: "secondary",
          expectedValueType: "amount",
          blocking: false,
          factMatchers: [
            {
              factTypes: ["fieldValue", "amount"],
              fieldCodeHints: ["7DR"],
              keywords: ["aides", "7DR", "apa", "pch", "cesu préfinancé"],
              rejectDocumentTypes: ["invoice"]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate:
            "Avez-vous perçu des aides pour financer l’emploi à domicile (information souvent liée à la case 7DR) ?",
          expectedAnswerType: "yesNo"
        })
      ],
      possibleSupportingDocuments: [
        support({
          id: "7db-sup-attestation",
          label: "Attestation fiscale (emploi à domicile / services à la personne)",
          description:
            "Document souvent utile pour comprendre les dépenses prises en compte pour le crédit d’impôt lié à l’emploi à domicile.",
          documentTypeHints: ["taxCertificate", "taxCreditDocument"],
          normative: true,
          provenance: [SRC_2042_NOTICE]
        }),
        support({
          id: "7db-sup-payment",
          label: "Justificatif de paiement (suggestion générique)",
          description:
            "Suggestion générique non normative : un justificatif de paiement peut aider à situer une dépense, sans établir seul le montant de la case.",
          documentTypeHints: ["bankStatement", "paymentProof"],
          normative: false,
          provenance: [SRC_2042_NOTICE]
        })
      ],
      generalConditions: [
        cond({
          id: "7db-cond-credit",
          statement:
            "Cette rubrique peut dépendre de certaines conditions relatives au crédit d’impôt pour l’emploi d’un salarié à domicile, décrites par la notice officielle.",
          provenance: [SRC_2042_NOTICE]
        }),
        cond({
          id: "7db-cond-aids",
          statement:
            "Les sources officielles indiquent de ne pas déduire les aides du montant porté en 7DB ; les aides sont généralement reportées séparément.",
          provenance: [SRC_2042_NOTICE]
        })
      ]
    }),

    pack({
      documentRef: "2042-RICI",
      documentRefs: ["2042", "2042-RICI"],
      fieldCode: "7DR",
      applicableYears: YEARS_STABLE,
      expectedValueType: "amount",
      relatedFields: ["7DB"],
      provenance: [SRC_2042_NOTICE],
      qualityStatus: "verified",
      informationRequirements: [
        req({
          id: "7dr-amount",
          kind: "amount",
          label: "Montant des aides perçues pour l’emploi à domicile",
          description:
            "Les sources officielles indiquent que la case 7DR concerne le montant des aides perçues pour financer les dépenses d’emploi à domicile.",
          priority: "blocking",
          expectedValueType: "amount",
          blocking: true,
          factMatchers: [
            {
              factTypes: ["fieldValue", "amount"],
              fieldCodeHints: ["7DR"],
              documentTypeHints: [
                "incomeTaxReturn",
                "taxForm",
                "taxCertificate"
              ],
              keywords: ["aides", "7DR", "apa", "pch"],
              rejectDocumentTypes: ["invoice"],
              rejectKeywords: ["facture", "ttc"]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate:
            "Disposez-vous du montant des aides perçues pour l’emploi à domicile ?",
          expectedAnswerType: "amount"
        }),
        req({
          id: "7dr-year",
          kind: "year",
          label: "Année des aides",
          description: "Les aides se rapportent à une année précise.",
          priority: "yearUnknown",
          expectedValueType: "unknown",
          blocking: true,
          factMatchers: [
            {
              factTypes: ["fiscalYear", "year"],
              yearRequired: true
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate: "De quelle année ces aides relèvent-elles ?",
          expectedAnswerType: "year"
        }),
        req({
          id: "7dr-link-7db",
          kind: "documentPresence",
          label: "Lien avec les dépenses (case 7DB)",
          description:
            "Comprendre la 7DR implique souvent de situer aussi les dépenses déclarées en 7DB ; aucune agrégation automatique n’est effectuée.",
          priority: "secondary",
          expectedValueType: "amount",
          blocking: false,
          factMatchers: [
            {
              factTypes: ["fieldValue", "amount"],
              fieldCodeHints: ["7DB"],
              keywords: ["7DB", "dépenses", "emploi à domicile"]
            }
          ],
          provenance: [SRC_2042_NOTICE],
          questionTemplate:
            "Disposez-vous aussi du montant des dépenses d’emploi à domicile (souvent case 7DB) ?",
          expectedAnswerType: "yesNo"
        })
      ],
      possibleSupportingDocuments: [
        support({
          id: "7dr-sup-aid",
          label: "Justificatif d’aide (APA, PCH, CESU préfinancé, etc.)",
          description:
            "Document pouvant préciser les aides perçues pour financer l’emploi à domicile.",
          documentTypeHints: ["taxCertificate", "administrativeLetter"],
          normative: true,
          provenance: [SRC_2042_NOTICE]
        })
      ],
      generalConditions: [
        cond({
          id: "7dr-cond",
          statement:
            "Cette rubrique concerne les aides perçues pour financer les dépenses d’emploi à domicile, à indiquer séparément des dépenses selon la notice.",
          provenance: [SRC_2042_NOTICE]
        })
      ]
    })
  ];

export const PRIORITY_TAX_FIELD_REQUIREMENTS_BY_CODE: ReadonlyMap<
  string,
  FrenchTaxFieldRequirements
> = new Map(
  PRIORITY_TAX_FIELD_REQUIREMENTS.map((e) => [e.normalizedCode, e])
);

export function getPriorityTaxFieldRequirements(
  code: string
): FrenchTaxFieldRequirements | null {
  return (
    PRIORITY_TAX_FIELD_REQUIREMENTS_BY_CODE.get(
      code.toUpperCase().replace(/\s+/g, "")
    ) || null
  );
}
