/**
 * V4-W — Registre et versionnement des règles / formules fiscales sourcées.
 *
 * Distinct du catalogue de formulaires `fr/tax/registry/` (V4-M).
 */

export {
  buildTaxRuleRegistry,
  listRegistryRuleIds,
  entryFromFormula,
  entryFromApplicabilityRule,
  sortRegistryEntries,
  formulaVersion,
  applicabilityVersion,
  mapVerificationToRegistryStatus,
  type BuildTaxRuleRegistryOptions
} from "./buildEntries.js";

export {
  resolveTaxRule,
  resolveTaxFormula,
  entryCoversYear,
  emptyRuleRegistryInvariants,
  type ResolveTaxRuleOptions,
  type ResolveTaxFormulaOptions
} from "./resolve.js";

export {
  auditTaxRuleRegistry,
  type TaxRuleRegistryAuditReport,
  type TaxRuleRegistryAuditIssue
} from "./audit.js";
