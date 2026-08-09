/**
 * npm run knowledge:tax:requirements:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxFieldRequirementsRegistry,
  loadFrenchTaxFieldRequirementsRegistry,
  resetFrenchTaxFieldRequirementsCacheForTests
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:requirements:audit (V4-Q) ===");
  resetFrenchTaxFieldRequirementsCacheForTests();
  const registry = loadFrenchTaxFieldRequirementsRegistry();
  const report = auditTaxFieldRequirementsRegistry(registry);

  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-field-requirements-audit.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        version: registry.version,
        ...report
      },
      null,
      2
    ) + "\n"
  );

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error("AUDIT FAILED");
    process.exit(1);
  }
  console.log("AUDIT OK");
}

main();
