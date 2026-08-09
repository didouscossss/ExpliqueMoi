/**
 * DocumentProfileRegistry — séparé du classificateur V4-D (SchemaProfile).
 */

import { toConfidence } from "../types/confidence.js";
import type {
  DocumentClassification,
  DocumentTypeId
} from "../types/documentClassification.js";
import type { DocumentProfile } from "../types/documentProfile.js";
import { administrativeLetterProfile } from "./definitions/administrativeLetter.js";
import { bankStatementProfile } from "./definitions/bankStatement.js";
import { certificateProfile } from "./definitions/certificate.js";
import { contractProfile } from "./definitions/contract.js";
import { explanatoryDocumentProfile } from "./definitions/explanatory.js";
import { financialStatementProfile } from "./definitions/financialStatement.js";
import { formProfile } from "./definitions/form.js";
import { invoiceProfile } from "./definitions/invoice.js";
import { payslipProfile } from "./definitions/payslip.js";
import { receiptProfile } from "./definitions/receipt.js";
import { taxDocumentProfile } from "./definitions/taxDocument.js";
import { incomeTaxNoticeProfile } from "./definitions/incomeTaxNotice.js";
import { incomeTaxReturnProfile } from "./definitions/incomeTaxReturn.js";
import { propertyTaxProfile } from "./definitions/propertyTax.js";
import { unknownTaxDocumentProfile } from "./definitions/unknownTaxDocument.js";
import { unknownProfile } from "./definitions/unknown.js";

const DEFAULT_PROFILES: DocumentProfile[] = [
  invoiceProfile,
  administrativeLetterProfile,
  taxDocumentProfile,
  incomeTaxNoticeProfile,
  incomeTaxReturnProfile,
  propertyTaxProfile,
  unknownTaxDocumentProfile,
  bankStatementProfile,
  contractProfile,
  payslipProfile,
  formProfile,
  certificateProfile,
  financialStatementProfile,
  explanatoryDocumentProfile,
  receiptProfile,
  unknownProfile
];

const extra: DocumentProfile[] = [];

function stubClassification(type: DocumentTypeId): DocumentClassification {
  return {
    primary: type,
    confidence: toConfidence(1),
    status: type === "unknown" ? "unknown" : "resolved",
    scores: { [type]: 1 },
    alternatives: [],
    secondarySections: [],
    evidence: [],
    contradictions: []
  };
}

export function registerDocumentProfile(profile: DocumentProfile): void {
  if (![...DEFAULT_PROFILES, ...extra].some((p) => p.id === profile.id)) {
    extra.push(profile);
  }
}

export function listDocumentProfiles(): DocumentProfile[] {
  return [...DEFAULT_PROFILES, ...extra];
}

export function getDocumentProfile(
  type: DocumentTypeId
): DocumentProfile | undefined {
  const all = listDocumentProfiles();
  return (
    all.find((p) => p.id === type) ||
    all.find((p) => p.supports(stubClassification(type)))
  );
}

export function resolveProfileForType(type: DocumentTypeId): DocumentProfile {
  return getDocumentProfile(type) || unknownProfile;
}

export const DocumentProfileRegistry = {
  register: registerDocumentProfile,
  list: listDocumentProfiles,
  get: getDocumentProfile,
  forType: resolveProfileForType
};
