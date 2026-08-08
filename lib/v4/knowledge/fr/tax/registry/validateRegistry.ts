/**
 * Validation structurelle du FrenchTaxDocumentRegistry (build + runtime tests).
 */

import type {
  FrenchTaxDocumentEntry,
  FrenchTaxDocumentRegistry
} from "../../../../types/knowledge.js";

export interface RegistryValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

const FAMILIES = new Set([
  "incomeTaxReturn",
  "incomeTaxNotice",
  "propertyTax",
  "withholdingTax",
  "taxCreditReduction",
  "taxRefund",
  "taxPayment",
  "foreignIncomeDeclaration",
  "rentalIncomeDeclaration",
  "professionalIncomeDeclaration",
  "corporateTax",
  "vatDeclaration",
  "businessTax",
  "taxCertificate",
  "taxAdministrativeLetter",
  "taxForm",
  "taxNotice",
  "unknownTaxDocument"
]);

function checkEntry(
  e: FrenchTaxDocumentEntry,
  i: number,
  issues: RegistryValidationIssue[]
): void {
  const p = `entries[${i}]`;
  if (!e.id) issues.push({ level: "error", path: p, message: "id manquant" });
  if (e.country !== "FR") {
    issues.push({ level: "error", path: `${p}.country`, message: "doit être FR" });
  }
  if (!e.authority) {
    issues.push({ level: "error", path: `${p}.authority`, message: "authority manquante" });
  }
  if (!FAMILIES.has(e.family)) {
    issues.push({
      level: "error",
      path: `${p}.family`,
      message: `famille inconnue: ${e.family}`
    });
  }
  if (!e.officialTitle) {
    issues.push({ level: "error", path: `${p}.officialTitle`, message: "titre manquant" });
  }
  if (!Array.isArray(e.officialSources) || e.officialSources.length === 0) {
    issues.push({
      level: "warning",
      path: `${p}.officialSources`,
      message: "aucune source officielle"
    });
  }
  for (const src of e.officialSources || []) {
    if (src.sourceType === "official" && !/^https?:\/\//.test(src.url || "")) {
      issues.push({
        level: "error",
        path: `${p}.officialSources`,
        message: `URL officielle invalide: ${src.url}`
      });
    }
  }
  for (const rel of e.relatedDocuments || []) {
    if (!rel.targetId || !rel.relationType || !rel.source) {
      issues.push({
        level: "error",
        path: `${p}.relatedDocuments`,
        message: "relation incomplète (targetId/relationType/source)"
      });
    }
  }
  // Pas de données personnelles dans le seed
  const blob = JSON.stringify(e);
  if (/\b\d{13}\b/.test(blob) && e.family !== "unknownTaxDocument") {
    // 13 digits in metadata would be suspicious — seed shouldn't have taxpayer IDs
    const onlyYears = (blob.match(/\b\d{13}\b/g) || []).every((x) =>
      /^20\d{2}/.test(x)
    );
    if (!onlyYears && /numero\s*fiscal|1890\d{9}/i.test(blob)) {
      issues.push({
        level: "error",
        path: p,
        message: "possible donnée personnelle (numéro fiscal) dans le registre"
      });
    }
  }
}

export function validateFrenchTaxRegistry(
  registry: FrenchTaxDocumentRegistry
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  if (!registry.version) {
    issues.push({ level: "error", path: "version", message: "version manquante" });
  }
  if (registry.country !== "FR") {
    issues.push({ level: "error", path: "country", message: "doit être FR" });
  }
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) {
    issues.push({ level: "error", path: "entries", message: "entries vide" });
  }
  const ids = new Set<string>();
  for (let i = 0; i < (registry.entries || []).length; i++) {
    const e = registry.entries[i]!;
    if (ids.has(e.id)) {
      issues.push({
        level: "error",
        path: `entries[${i}].id`,
        message: `id dupliqué: ${e.id}`
      });
    }
    ids.add(e.id);
    checkEntry(e, i, issues);
  }
  // Relations doivent pointer vers des ids connus
  for (let i = 0; i < (registry.entries || []).length; i++) {
    const e = registry.entries[i]!;
    for (const rel of e.relatedDocuments || []) {
      if (!ids.has(rel.targetId)) {
        issues.push({
          level: "warning",
          path: `entries[${i}].relatedDocuments`,
          message: `cible inconnue: ${rel.targetId}`
        });
      }
    }
  }
  return issues;
}

export function assertRegistryValid(registry: FrenchTaxDocumentRegistry): void {
  const issues = validateFrenchTaxRegistry(registry);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    throw new Error(
      `Registry invalide:\n${errors.map((e) => `- ${e.path}: ${e.message}`).join("\n")}`
    );
  }
}
