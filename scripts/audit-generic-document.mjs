/**
 * npm run knowledge:generic:audit
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeGenericDocument,
  assertGenericSafetyClean,
  resetCandidateIdsForTests,
  resetGenericClarificationIdsForTests,
  resetGenericExplanationIdsForTests,
  resetGenericFactIdsForTests,
  resetRelationIdsForTests
} from "../lib/v4/index.ts";
import { RENEWAL_NOTICE_FULL } from "../lib/v4/__fixtures__/generic/renewalNoticeFixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const GENERIC_DIR = join(ROOT, "lib/v4/generic");

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".ts")) out.push(join(dir, name));
  }
  return out;
}

function main() {
  console.log("=== knowledge:generic:audit (V4-Y) ===");
  resetCandidateIdsForTests();
  resetRelationIdsForTests();
  resetGenericFactIdsForTests();
  resetGenericExplanationIdsForTests();
  resetGenericClarificationIdsForTests();

  const u = analyzeGenericDocument(RENEWAL_NOTICE_FULL, { resetIds: true });
  const safety = assertGenericSafetyClean(u.safety);

  const taxImports = [];
  for (const file of listTsFiles(GENERIC_DIR)) {
    const src = readFileSync(file, "utf8");
    if (/from\s+["'][^"']*fr\/tax[^"']*["']/.test(src)) {
      taxImports.push(file.replace(ROOT + "/", ""));
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    documentType: u.documentType,
    documentTypeConfidence: u.documentTypeConfidence,
    factCount: u.facts.length,
    importantCount: u.importantFacts.length,
    facts: u.facts.map((f) => ({
      kind: f.kind,
      label: f.label,
      rawValue: f.rawValue,
      normalizedValue: f.normalizedValue,
      importance: f.importance,
      roleAmbiguous: Boolean(f.roleAmbiguous),
      structuralRole: f.structuralRole || null
    })),
    primaryExplanation: u.explanations.find((e) => e.importance === "primary"),
    preview: u.preview,
    safety: u.safety,
    safetyClean: safety.ok,
    taxImportsInGenericLayer: taxImports,
    taxRulesTriggered: u.taxRulesTriggered,
    taxCalculations: u.taxCalculations,
    fetchCount: u.fetchCount,
    llmCount: u.llmCount
  };

  const outDir = join(ROOT, "artifacts");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "generic-document-audit.json");
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`wrote ${outPath}`);
  console.log(
    `type=${u.documentType} facts=${u.facts.length} safety_ok=${safety.ok} tax_imports=${taxImports.length}`
  );
  if (taxImports.length) {
    throw new Error(`generic/ importe fr/tax: ${taxImports.join(", ")}`);
  }
  if (!safety.ok) {
    throw new Error(`safety violations: ${safety.violations.join(", ")}`);
  }
}

main();
