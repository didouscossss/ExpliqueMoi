/**
 * OFFLINE — npm run knowledge:tax:quality
 * Audit qualité sémantique V4-N (pas de triche sur les métriques).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxKnowledgeQuality,
  loadFrenchTaxRegistry,
  resetFrenchTaxRegistryCacheForTests
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:quality (OFFLINE V4-N) ===");
  resetFrenchTaxRegistryCacheForTests();
  const registry = loadFrenchTaxRegistry();
  const report = auditTaxKnowledgeQuality(registry);

  mkdirSync(join(ROOT, "generated"), { recursive: true });
  const out = join(ROOT, "generated/french-tax-quality-report.json");
  writeFileSync(
    out,
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
  console.log("verifiedEntries:", report.verifiedEntries);
  console.log("partiallyVerified:", report.partiallyVerified);
  console.log("discovered:", report.discovered);
  console.log("needsReview:", report.needsReview);
  console.log("withOfficialTitle:", report.withOfficialTitle);
  console.log("withVerifiedCerfa:", report.withVerifiedCerfa);
  console.log("withPurpose (non-generic):", report.withPurpose);
  console.log("withDescription (non-generic):", report.withDescription);
  console.log("withApplicableYears:", report.withApplicableYears);
  console.log("withRelations:", report.withRelations);
  console.log("withSemanticExplanation:", report.withSemanticExplanation);
  console.log("priorityDocumentsCoverage:", report.priorityDocumentsCoverage);
  console.log("missingProvenance:", report.missingProvenance.length);
  console.log("invalidRelations:", report.invalidRelations.length);
  console.log("duplicateReferences:", report.duplicateReferences.length);
  console.log("conflictingCerfa:", report.conflictingCerfa.length);
  console.log("slugOnlyDescriptions:", report.slugOnlyDescriptions);
  console.log("knowledgeWithoutProvenanceVerified:", report.knowledgeWithoutProvenanceVerified.length);
  console.log("wrote", out);
  console.log("ok:", report.ok);

  if (!report.ok) {
    if (report.priorityDocumentsCoverage.missingFromRegistry.length) {
      console.error(
        "  missing priority refs:",
        report.priorityDocumentsCoverage.missingFromRegistry
      );
    }
    if (report.priorityDocumentsCoverage.notEnriched.length) {
      console.error(
        "  not enriched:",
        report.priorityDocumentsCoverage.notEnriched
      );
    }
    if (report.invalidRelations.length) {
      console.error("  invalidRelations sample:", report.invalidRelations.slice(0, 10));
    }
    if (report.duplicateReferences.length) {
      console.error("  duplicates:", report.duplicateReferences.slice(0, 10));
    }
    process.exit(1);
  }
  console.log("✓ quality audit OK (offline)");
}

main();
