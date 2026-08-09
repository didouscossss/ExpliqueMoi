/**
 * npm run knowledge:tax:rule-registry:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxRuleRegistry,
  buildTaxRuleRegistry,
  listRegistryRuleIds,
  TAX_FORMULAS
} from "../lib/v4/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:rule-registry:audit (V4-W) ===");
  const entries = buildTaxRuleRegistry();
  const report = auditTaxRuleRegistry(entries);
  const payload = {
    generatedAt: new Date().toISOString(),
    ruleIds: listRegistryRuleIds(entries),
    formulasCount: TAX_FORMULAS.length,
    firstFormula: TAX_FORMULAS[0]
      ? {
          formulaId: TAX_FORMULAS[0].formulaId,
          version: TAX_FORMULAS[0].version || "1",
          taxYears: TAX_FORMULAS[0].taxYears,
          status: TAX_FORMULAS[0].registryStatus || "verified"
        }
      : null,
    entries: entries.map((e) => ({
      ruleId: e.ruleId,
      kind: e.kind,
      version: e.version,
      status: e.status,
      fieldCodes: e.fieldCodes,
      taxYears: e.taxYears,
      formulaId: e.formulaId,
      sourceRefs: e.sourceRefs.length
    })),
    notes: [
      "Distinct du catalogue de formulaires fr/tax/registry (V4-M).",
      "verified = provenance présente — pas une vérité inventée.",
      "Pas de sélection last-wins ; overlap → ambiguous."
    ],
    ...report
  };
  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-rule-registry-audit.json"),
    JSON.stringify(payload, null, 2) + "\n"
  );
  console.log(JSON.stringify(payload, null, 2));
  if (!report.ok) {
    console.error("AUDIT FAILED");
    process.exit(1);
  }
  console.log("AUDIT OK");
}

main();
