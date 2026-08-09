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
  "housingTax",
  "withholdingTax",
  "taxCreditReduction",
  "taxRefund",
  "taxPayment",
  "foreignIncomeDeclaration",
  "rentalIncomeDeclaration",
  "professionalIncomeDeclaration",
  "professionalBenefits",
  "capitalGainsDeclaration",
  "wealthTax",
  "inheritanceDonation",
  "foreignAccountsDeclaration",
  "corporateTax",
  "vatDeclaration",
  "businessTax",
  "taxCertificate",
  "taxAdministrativeLetter",
  "taxForm",
  "taxNotice",
  "taxInstruction",
  "unknownTaxDocument"
]);

const KINDS = new Set([
  "form",
  "notice",
  "instruction",
  "taxNotice",
  "certificate",
  "administrativeLetter",
  "other"
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
  if (!e.documentKind || !KINDS.has(e.documentKind)) {
    issues.push({
      level: "error",
      path: `${p}.documentKind`,
      message: `documentKind invalide: ${e.documentKind}`
    });
  }
  if (!e.normalizedReference) {
    issues.push({
      level: "error",
      path: `${p}.normalizedReference`,
      message: "normalizedReference manquant"
    });
  }
  if (!e.officialTitle) {
    issues.push({ level: "error", path: `${p}.officialTitle`, message: "titre manquant" });
  }
  if (!Array.isArray(e.officialSources) || e.officialSources.length === 0) {
    issues.push({
      level: "error",
      path: `${p}.officialSources`,
      message: "provenance officielle manquante"
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
  for (const y of e.applicableYears || []) {
    if (y < 1990 || y > 2100) {
      issues.push({
        level: "error",
        path: `${p}.applicableYears`,
        message: `année invalide: ${y}`
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
  const norms = new Map<string, string>();
  const cerfas = new Map<string, string[]>();

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

    if (e.normalizedReference && e.documentKind === "form") {
      const prev = norms.get(e.normalizedReference);
      if (prev && prev !== e.id) {
        issues.push({
          level: "error",
          path: `entries[${i}].normalizedReference`,
          message: `référence dupliquée: ${e.normalizedReference} (${prev})`
        });
      }
      norms.set(e.normalizedReference, e.id);
    }
    for (const c of e.cerfaNumbers || []) {
      const base = c.split(/[*#]/)[0]!;
      const list = cerfas.get(base) || [];
      list.push(e.id);
      cerfas.set(base, list);
    }
  }

  for (const [cerfa, entryIds] of cerfas) {
    const uniq = [...new Set(entryIds)];
    if (uniq.length > 1) {
      issues.push({
        level: "warning",
        path: "cerfaNumbers",
        message: `Cerfa ${cerfa} partagé par ${uniq.join(", ")} — vérifier`
      });
    }
  }

  for (let i = 0; i < (registry.entries || []).length; i++) {
    const e = registry.entries[i]!;
    for (const rel of e.relatedDocuments || []) {
      if (!ids.has(rel.targetId)) {
        issues.push({
          level: "error",
          path: `entries[${i}].relatedDocuments`,
          message: `relation cassée: ${rel.targetId}`
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
