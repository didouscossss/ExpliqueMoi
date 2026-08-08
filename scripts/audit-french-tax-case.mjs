/**
 * npm run knowledge:tax:case:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditDocumentCase,
  buildDocumentCase,
  resetRequirementFactIdsForTests
} from "../lib/v4/index.ts";
import { CASE_DOCS } from "../lib/v4/__fixtures__/fiscal/caseFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:case:audit (V4-R) ===");
  resetRequirementFactIdsForTests();
  const docCase = buildDocumentCase(
    [
      CASE_DOCS.form2042,
      CASE_DOCS.form2042Rici,
      CASE_DOCS.attestation7DB,
      CASE_DOCS.unknownDoc
    ],
    { resetIds: true }
  );
  const report = auditDocumentCase(docCase);
  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-case-audit.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        caseId: docCase.caseId,
        metrics: docCase.metrics,
        ...report
      },
      null,
      2
    ) + "\n"
  );
  console.log(JSON.stringify({ caseId: docCase.caseId, metrics: docCase.metrics, ...report }, null, 2));
  if (!report.ok) {
    console.error("AUDIT FAILED");
    process.exit(1);
  }
  console.log("AUDIT OK");
}

main();
