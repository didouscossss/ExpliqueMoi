/**
 * npm run knowledge:tax:clarification:audit
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyClarificationAnswer,
  auditClarification,
  buildDocumentCase,
  initClarificationState,
  resetCandidateIdsForTests,
  resetRelationIdsForTests,
  resetRequirementFactIdsForTests
} from "../lib/v4/index.ts";
import { CLARIFICATION_FIXTURES as F } from "../lib/v4/__fixtures__/fiscal/clarificationFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function reset() {
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetRequirementFactIdsForTests();
}

function main() {
  console.log("=== knowledge:tax:clarification:audit (V4-S) ===");
  reset();
  const docCase = buildDocumentCase(
    [F.missing1AJ, F.form2042RiciEmpty7DB],
    { resetIds: true }
  );
  let state = initClarificationState(docCase);
  if (state.currentQuestion) {
    state = applyClarificationAnswer(
      state,
      state.currentQuestion.questionId,
      "32450"
    ).state;
  }
  const report = auditClarification(state.documentCase, state.session);
  const payload = {
    generatedAt: new Date().toISOString(),
    caseId: state.documentCase.caseId,
    currentQuestion: state.currentQuestion?.requirementId || null,
    userFacts: state.session.activeUserFacts.length,
    conflicts: state.documentCase.conflicts.length,
    invariants: state.session.invariants,
    ...report
  };
  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-clarification-audit.json"),
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
