/**
 * OFFLINE — npm run knowledge:tax:audit
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadFrenchTaxRegistry,
  resetFrenchTaxRegistryCacheForTests,
  validateFrenchTaxRegistry,
  buildRegistryIndex
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function main() {
  console.log("=== knowledge:tax:audit (OFFLINE) ===");
  resetFrenchTaxRegistryCacheForTests();
  const registry = loadFrenchTaxRegistry();
  const issues = validateFrenchTaxRegistry(registry);
  const index = buildRegistryIndex(registry);

  const missingProvenance = registry.entries.filter(
    (e) => !e.officialSources?.length || !e.officialTitle || !e.authority
  );
  const missingFamily = registry.entries.filter((e) => !e.family);
  const unknownAuthority = registry.entries.filter(
    (e) => !e.authority || e.authority === "UNKNOWN"
  );
  const formEntries = registry.entries.filter((e) => e.documentKind === "form");
  const noticesAsForms = registry.entries.filter(
    (e) =>
      e.documentKind === "form" &&
      (/notice/i.test(e.officialTitle) || /-NOT\b/.test(e.normalizedReference))
  );

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const report = {
    offline: true,
    registryVersion: registry.version,
    entryCount: registry.entries.length,
    indexCounts: {
      references: index.byNormalizedReference.size,
      cerfa: index.byCerfa.size,
      aliases: index.byAlias.size
    },
    missingProvenance: missingProvenance.map((e) => e.id),
    missingFamily: missingFamily.map((e) => e.id),
    unknownAuthority: unknownAuthority.map((e) => e.id),
    noticesMisclassifiedAsForm: noticesAsForms.map((e) => e.id),
    formEntries: formEntries.length,
    schemaErrors: errors,
    schemaWarnings: warnings.slice(0, 50),
    ok: errors.length === 0 && missingProvenance.length === 0
  };

  mkdirSync(join(ROOT, "generated"), { recursive: true });
  writeFileSync(
    join(ROOT, "generated/french-tax-audit-report.json"),
    JSON.stringify(report, null, 2) + "\n"
  );

  console.log("entries:", registry.entries.length);
  console.log("schema errors:", errors.length);
  console.log("schema warnings:", warnings.length);
  console.log("missing provenance:", missingProvenance.length);
  console.log("notices-as-form:", noticesAsForms.length);
  console.log("ok:", report.ok);

  if (!report.ok) {
    for (const e of errors.slice(0, 30)) {
      console.error(`  ERROR ${e.path}: ${e.message}`);
    }
    process.exit(1);
  }
  console.log("✓ audit OK (offline)");
}

main();
