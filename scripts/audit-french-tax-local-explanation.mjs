/**
 * npm run knowledge:tax:local-explanation:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLocalExplanations,
  buildDocumentCase,
  buildPremiumExplanationContext,
  resetCandidateIdsForTests,
  resetDerivedIdsForTests,
  resetLocalExplanationIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests
} from "../lib/v4/index.ts";
import { FIRST_FORMULA_DOCS } from "../lib/v4/__fixtures__/fiscal/firstFormulaFixtures.mjs";
import { CALC_DOCS } from "../lib/v4/__fixtures__/fiscal/calculationFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:local-explanation:audit (V4-X) ===");
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
  resetDerivedIdsForTests();
  resetLocalExplanationIdsForTests();

  const docCase = buildDocumentCase(
    [
      FIRST_FORMULA_DOCS.micro4BE_10000,
      CALC_DOCS.salary1AJ,
      FIRST_FORMULA_DOCS.reel4BA
    ],
    { resetIds: true }
  );
  const report = auditLocalExplanations(docCase);
  const premium = buildPremiumExplanationContext(docCase);
  const payload = {
    generatedAt: new Date().toISOString(),
    caseId: docCase.caseId,
    explanationCount: (docCase.localExplanations || []).length,
    explanations: (docCase.localExplanations || []).map((e) => ({
      subject: e.subject,
      status: e.status,
      title: e.title,
      summary: e.summary,
      hasCalculation: Boolean(e.calculation),
      missing: e.missingInformation.length,
      sources: e.sourceRefs.length,
      rules: e.ruleRefs.length
    })),
    premiumBoundary: {
      selectedSubjects: premium.selectedSubjects,
      note: premium.note
    },
    suggestedDeclaredAmount: docCase.suggestedDeclaredAmount,
    eligibilityDecision: docCase.eligibilityDecision,
    ...report
  };
  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-local-explanation-audit.json"),
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
