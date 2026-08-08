/**
 * npm run knowledge:tax:applicability:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxApplicability,
  buildDocumentCase,
  listApplicabilityRuleIds,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests,
  TAX_APPLICABILITY_RULES
} from "../lib/v4/index.ts";
import { APP_FIXTURES as F } from "../lib/v4/__fixtures__/fiscal/applicabilityFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:applicability:audit (V4-T) ===");
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
  const docCase = buildDocumentCase(
    [F.salary1AJComplete, F.foncierReel, F.riciEmpty7DB, F.attestation7DB],
    { resetIds: true }
  );
  const report = auditTaxApplicability(docCase);
  const payload = {
    generatedAt: new Date().toISOString(),
    caseId: docCase.caseId,
    ruleIds: listApplicabilityRuleIds(),
    rulesCount: TAX_APPLICABILITY_RULES.length,
    evaluations: (docCase.applicabilityEvaluations || []).map((e) => ({
      fieldCode: e.fieldCode,
      status: e.status,
      ruleId: e.ruleId,
      yearPolicy: e.yearPolicy,
      sources: e.sources.length
    })),
    notModeledNotes: [
      "Éligibilité crédit d’impôt 7DB/7DR non modélisée (unknown/needsInformation).",
      "Seuils d’imputation déficit 4BB/4BC non modélisés.",
      "Obligation de déclarer un salaire détecté hors case non modélisée."
    ],
    ...report
  };
  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-applicability-audit.json"),
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
