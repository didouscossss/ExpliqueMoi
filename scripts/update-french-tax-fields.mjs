/**
 * BUILD — npm run knowledge:tax:fields:update
 * Génère l’artefact offline des cases fiscales prioritaires.
 * N’est PAS exécuté à l’analyse utilisateur.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditTaxFieldRegistry,
  buildSeedFieldRegistry,
  FRENCH_TAX_FIELD_REGISTRY_VERSION
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "generated");

function main() {
  console.log("=== knowledge:tax:fields:update (V4-P) ===");
  console.log("version:", FRENCH_TAX_FIELD_REGISTRY_VERSION);

  const registry = buildSeedFieldRegistry(new Date().toISOString());
  const report = auditTaxFieldRegistry(registry);

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
    byDocumentRef: {},
    counts: {
      entries: registry.entries.length,
      verified: report.verified,
      partiallyVerified: report.partiallyVerified,
      needsReview: report.needsReview
    }
  };
  for (const e of registry.entries) {
    for (const ref of e.documentRefs) {
      if (!index.byDocumentRef[ref]) index.byDocumentRef[ref] = [];
      index.byDocumentRef[ref].push(e.normalizedCode);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "french-tax-field-registry.json"),
    JSON.stringify(registry, null, 2) + "\n"
  );
  writeFileSync(
    join(OUT_DIR, "french-tax-field-registry-index.json"),
    JSON.stringify(index, null, 2) + "\n"
  );
  writeFileSync(
    join(OUT_DIR, "french-tax-field-quality-report.json"),
    JSON.stringify({ generatedAt: registry.generatedAt, ...report }, null, 2) +
      "\n"
  );

  console.log("entries:", registry.entries.length);
  console.log("verified:", report.verified);
  console.log("partiallyVerified:", report.partiallyVerified);
  console.log("needsReview:", report.needsReview);
  console.log("OK — artefact fields prêt (runtime offline).");
}

main();
