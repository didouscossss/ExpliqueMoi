/**
 * OFFLINE — npm run knowledge:tax:fields:audit
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxFieldRegistry,
  loadFrenchTaxFieldRegistry,
  resetFrenchTaxFieldRegistryCacheForTests
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:fields:audit (OFFLINE V4-P) ===");
  resetFrenchTaxFieldRegistryCacheForTests();
  const registry = loadFrenchTaxFieldRegistry();
  const report = auditTaxFieldRegistry(registry);

  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-field-audit-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        registryVersion: registry.version,
        ...report
      },
      null,
      2
    ) + "\n"
  );

  console.log("totalEntries:", report.totalEntries);
  console.log("verified:", report.verified);
  console.log("partiallyVerified:", report.partiallyVerified);
  console.log("needsReview:", report.needsReview);
  console.log("missingProvenance:", report.missingProvenance.length);
  console.log("invalidRelatedFields:", report.invalidRelatedFields.length);
  console.log("duplicateKeys:", report.duplicateKeys.length);
  console.log("ok:", report.ok);

  if (!report.ok) {
    console.error(report);
    process.exit(1);
  }
  console.log("✓ fields audit OK (offline)");
}

main();
