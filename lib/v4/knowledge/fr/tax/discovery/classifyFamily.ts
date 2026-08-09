/**
 * Classification famille depuis titre/référence officiels — conservative.
 */

import type {
  FrenchTaxFamily,
  TaxDocumentKind
} from "../../../../types/knowledge.js";
import { normalizeTaxReference } from "../normalize/normalizeReference.js";

export interface FamilyClassification {
  family: FrenchTaxFamily;
  documentKind: TaxDocumentKind;
  documentType: import("../../../../types/documentClassification.js").DocumentTypeId;
  profileId: string | null;
  confidence: number;
  needsReview: boolean;
  reason: string;
}

function mapType(
  family: FrenchTaxFamily
): import("../../../../types/documentClassification.js").DocumentTypeId {
  switch (family) {
    case "incomeTaxReturn":
    case "rentalIncomeDeclaration":
    case "foreignIncomeDeclaration":
    case "professionalIncomeDeclaration":
    case "taxCreditReduction":
    case "capitalGainsDeclaration":
    case "wealthTax":
    case "foreignAccountsDeclaration":
      return "incomeTaxReturn";
    case "incomeTaxNotice":
    case "taxNotice":
      return "incomeTaxNotice";
    case "propertyTax":
    case "housingTax":
      return "propertyTax";
    case "corporateTax":
    case "vatDeclaration":
    case "businessTax":
    case "professionalBenefits":
    case "inheritanceDonation":
    case "withholdingTax":
    case "taxForm":
      return "taxForm";
    case "taxInstruction":
      return "taxForm";
    case "taxCertificate":
      return "taxForm";
    case "unknownTaxDocument":
      return "unknownTaxDocument";
    default:
      return "taxDocument";
  }
}

export function classifyFromOfficialMeta(input: {
  reference: string;
  title: string;
  documentKindGuess?: TaxDocumentKind;
}): FamilyClassification {
  const norm = normalizeTaxReference(input.reference);
  const ref = norm.normalizedReference;
  const title = (input.title || "").toLowerCase();
  const kindGuess = input.documentKindGuess || "form";

  // Notices / instructions
  if (
    kindGuess === "notice" ||
    kindGuess === "instruction" ||
    /\bnotice\b/.test(title) ||
    /-NOT\b/.test(ref) ||
    ref.endsWith("-NOT")
  ) {
    let family: FrenchTaxFamily = "taxInstruction";
    if (/taxe fonci|fonci[eè]re/.test(title)) family = "propertyTax";
    else if (/taxe d['’]?habitation|habitation/.test(title)) family = "housingTax";
    else if (/avis d['’]?imp[oô]t|revenus/.test(title)) family = "incomeTaxNotice";
    else if (/ifi|fortune immobili/.test(title)) family = "wealthTax";
    return {
      family,
      documentKind: /\bnotice\b/.test(title) || /-NOT/.test(ref) ? "notice" : "instruction",
      documentType: mapType(family === "taxInstruction" ? "taxForm" : family),
      profileId:
        family === "propertyTax"
          ? "propertyTax"
          : family === "incomeTaxNotice"
            ? "incomeTaxNotice"
            : "taxDocument",
      confidence: 0.7,
      needsReview: family === "taxInstruction",
      reason: "notice/instruction from title or -NOT"
    };
  }

  // Exact / prefix rules for well-known series
  if (ref === "2042" || ref === "2042-C" || ref === "2042-C-PRO" || ref === "2042-NR") {
    const family: FrenchTaxFamily =
      ref === "2042-C-PRO" ? "professionalIncomeDeclaration" : "incomeTaxReturn";
    return {
      family,
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.95,
      needsReview: false,
      reason: "known income declaration series"
    };
  }
  if (ref === "2042-RICI") {
    return {
      family: "taxCreditReduction",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.95,
      needsReview: false,
      reason: "known RICI annex"
    };
  }
  if (ref === "2042-IFI" || /\bifi\b|fortune immobili/.test(title)) {
    return {
      family: "wealthTax",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.9,
      needsReview: false,
      reason: "IFI / wealth"
    };
  }
  if (ref === "2044" || /revenus fonciers/.test(title)) {
    return {
      family: "rentalIncomeDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.92,
      needsReview: false,
      reason: "revenus fonciers"
    };
  }
  if (ref === "2047" || /revenus.*[eé]tranger|encaiss[eé]s [aà] l['’]?[eé]tranger/.test(title)) {
    return {
      family: "foreignIncomeDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.9,
      needsReview: false,
      reason: "foreign income"
    };
  }
  if (/^2074/.test(ref) || /plus[- ]?values|moins[- ]?values/.test(title)) {
    return {
      family: "capitalGainsDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.88,
      needsReview: false,
      reason: "capital gains 2074"
    };
  }
  if (/^3916/.test(ref) || /compte.*[eé]tranger|hors de france/.test(title)) {
    return {
      family: "foreignAccountsDeclaration",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.88,
      needsReview: false,
      reason: "foreign accounts 3916"
    };
  }
  if (/^2735/.test(ref) || /dons manuels|successions|donations/.test(title)) {
    return {
      family: "inheritanceDonation",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.85,
      needsReview: /successions|donations/.test(title) && !/^2735/.test(ref),
      reason: "inheritance/donation"
    };
  }
  if (/^2065/.test(ref) || /imp[oô]t sur les soci[eé]t[eé]s/.test(title)) {
    return {
      family: "corporateTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.9,
      needsReview: false,
      reason: "corporate tax"
    };
  }
  if (
    /^3310/.test(ref) ||
    /\btva\b/.test(title) ||
    /ca3/.test(ref.toLowerCase())
  ) {
    return {
      family: "vatDeclaration",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.88,
      needsReview: false,
      reason: "VAT"
    };
  }
  if (/^2031|^2035|^2033|^2050|^2051|^2052|^2053/.test(ref) || /liasse|bnc|bic\b|b[eé]n[eé]fices/.test(title)) {
    return {
      family: "professionalBenefits",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: !/^2031|^2035|^2033/.test(ref),
      reason: "professional benefits / liasse"
    };
  }
  if (/cvae|cfe|cet\b|cotisation fonci[eè]re/.test(title) || /CVAE|CFE|CET/.test(ref)) {
    return {
      family: "businessTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.85,
      needsReview: false,
      reason: "business local tax"
    };
  }
  if (/taxe fonci|[ée]re sur les propri[eé]t/.test(title) || /^1536/.test(ref)) {
    return {
      family: "propertyTax",
      documentKind: /avis/.test(title) ? "taxNotice" : "form",
      documentType: "propertyTax",
      profileId: "propertyTax",
      confidence: 0.85,
      needsReview: false,
      reason: "property tax"
    };
  }
  if (/taxe d['’ ]?habitation|logements vacants/.test(title) || /^1535/.test(ref)) {
    return {
      family: "housingTax",
      documentKind: /avis/.test(title) ? "taxNotice" : "form",
      documentType: "taxDocument",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: false,
      reason: "housing tax"
    };
  }
  if (/pr[eé]l[eè]vement|retenue [aà] la source|pas\b/.test(title) || /^2777|^2561|^2571|^2572/.test(ref)) {
    return {
      family: "withholdingTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: false,
      reason: "withholding / RCM"
    };
  }
  if (/attestation/.test(title)) {
    return {
      family: "taxCertificate",
      documentKind: "certificate",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.75,
      needsReview: false,
      reason: "certificate"
    };
  }
  if (/d[eé]claration des revenus|formulaire n[°o]?\s*2042/.test(title)) {
    return {
      family: "incomeTaxReturn",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.85,
      needsReview: false,
      reason: "income declaration title"
    };
  }
  if (/cr[eé]dit d['’]?imp[oô]t|r[eé]duction/.test(title) || /^2069|^2079/.test(ref)) {
    return {
      family: "taxCreditReduction",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.75,
      needsReview: true,
      reason: "credit/reduction series — broad"
    };
  }

  // Default: taxForm with review if title is thin
  const thin = title.split(/\s+/).length < 3;
  return {
    family: "taxForm",
    documentKind: "form",
    documentType: "taxForm",
    profileId: "taxDocument",
    confidence: thin ? 0.55 : 0.7,
    needsReview: thin,
    reason: thin ? "generic form — thin title" : "generic official form"
  };
}
