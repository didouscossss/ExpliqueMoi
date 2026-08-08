/**
 * Registre extensible des SchemaProfile.
 * Ajouter un type = push dans DEFAULT_SCHEMA_PROFILES (ou registerSchemaProfile).
 */

import type { DocumentTypeId } from "../../types/documentClassification.js";
import type { SchemaProfile } from "../schemaProfile.js";
import { administrativeLetterProfile } from "./administrativeLetter.js";
import { bankStatementProfile } from "./bankStatement.js";
import { invoiceProfile } from "./invoice.js";
import {
  certificateProfile,
  contractProfile,
  explanatoryDocumentProfile,
  financialStatementProfile,
  formProfile,
  noticeProfile,
  payslipProfile,
  receiptProfile
} from "./misc.js";
import { taxDocumentProfile } from "./taxDocument.js";

const DEFAULT_SCHEMA_PROFILES: SchemaProfile[] = [
  invoiceProfile,
  bankStatementProfile,
  taxDocumentProfile,
  administrativeLetterProfile,
  contractProfile,
  payslipProfile,
  receiptProfile,
  noticeProfile,
  formProfile,
  certificateProfile,
  financialStatementProfile,
  explanatoryDocumentProfile
];

const extraProfiles: SchemaProfile[] = [];

export function registerSchemaProfile(profile: SchemaProfile): void {
  const exists = [...DEFAULT_SCHEMA_PROFILES, ...extraProfiles].some(
    (p) => p.type === profile.type
  );
  if (!exists) extraProfiles.push(profile);
}

export function listSchemaProfiles(): SchemaProfile[] {
  return [...DEFAULT_SCHEMA_PROFILES, ...extraProfiles];
}

export function getSchemaProfile(
  type: DocumentTypeId
): SchemaProfile | undefined {
  return listSchemaProfiles().find((p) => p.type === type);
}

export function supportedDocumentTypes(): DocumentTypeId[] {
  return [...listSchemaProfiles().map((p) => p.type), "unknown"];
}
