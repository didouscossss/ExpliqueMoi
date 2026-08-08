/**
 * BUILD — npm run knowledge:tax:requirements:update
 * Génère l’artefact offline des requirements fiscaux.
 * N’est PAS exécuté à l’analyse utilisateur.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxFieldRequirementsRegistry,
  buildSeedRequirementsRegistry,
  FRENCH_TAX_FIELD_REQUIREMENTS_VERSION
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "generated");

function main() {
  console.log("=== knowledge:tax:requirements:update (V4-Q) ===");
  console.log("version:", FRENCH_TAX_FIELD_REQUIREMENTS_VERSION);

  const registry = buildSeedRequirementsRegistry(new Date().toISOString());
  const report = auditTaxFieldRequirementsRegistry(registry);

  if (!report.ok) {
    console.error("Quality gate FAILED:", report);
    process.exit(1);
  }

  const index = {
    version: registry.version,
    generatedAt: registry.generatedAt,
    byCode: Object.fromEntries(
      registry.entries.map((e) => [e.normalizedCode, e.id])
    ),
    counts: {
      entries: registry.entries.length,
      verified: report.verified,
      partiallyVerified: report.partiallyVerified,
      needsReview: report.needsReview,
      requirements: registry.entries.reduce(
        (n, e) => n + e.informationRequirements.length,
        0
      ),
      supportingDocuments: registry.entries.reduce(
        (n, e) => n + e.possibleSupportingDocuments.length,
        0
      ),
      generalConditions: registry.entries.reduce(
        (n, e) => n + e.generalConditions.length,
        0
      )
    }
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "french-tax-field-requirements.json"),
    JSON.stringify(registry, null, 2) + "\n"
  );
  writeFileSync(
    join(OUT_DIR, "french-tax-field-requirements-index.json"),
    JSON.stringify(index, null, 2) + "\n"
  );
  writeFileSync(
    join(OUT_DIR, "french-tax-field-requirements-audit.json"),
    JSON.stringify({ generatedAt: registry.generatedAt, ...report }, null, 2) +
      "\n"
  );

  console.log("entries:", registry.entries.length);
  console.log("verified:", report.verified);
  console.log("requirements:", index.counts.requirements);
  console.log("OK — artefact requirements prêt (runtime offline).");
}

main();
