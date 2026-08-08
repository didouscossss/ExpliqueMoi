/**
 * BUILD — npm run knowledge:tax:update
 * Offline sur snapshot. N'est PAS exécuté à l'analyse utilisateur.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runDiscoveryPipeline,
  validateFrenchTaxRegistry,
  diffFrenchTaxRegistries,
  buildRegistryIndex,
  enrichRegistryWithSemantics,
  FISCAL_EXTERNAL_SOURCES,
  FRENCH_TAX_REGISTRY_VERSION
} from "../lib/v4/knowledge/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "generated");
const OUT_FILE = join(OUT_DIR, "french-tax-registry.json");
const INDEX_FILE = join(OUT_DIR, "french-tax-registry-index.json");
const REPORT_FILE = join(OUT_DIR, "french-tax-registry-diff.json");
const DISCOVERY_REPORT = join(OUT_DIR, "french-tax-discovery-report.json");

function loadPrevious() {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  console.log("=== knowledge:tax:update (V4-M/N) ===");
  console.log("version:", FRENCH_TAX_REGISTRY_VERSION);

  const result = runDiscoveryPipeline({
    generatedAt: new Date().toISOString(),
    version: FRENCH_TAX_REGISTRY_VERSION
  });
  // V4-N — packs sémantiques prioritaires + qualityStatus
  const registry = enrichRegistryWithSemantics(result.registry);

  const issues = validateFrenchTaxRegistry(registry);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    console.error("Validation FAILED:");
    for (const e of errors.slice(0, 40)) {
      console.error(`  [${e.level}] ${e.path}: ${e.message}`);
    }
    process.exit(1);
  }
  for (const w of issues.filter((i) => i.level === "warning").slice(0, 20)) {
    console.warn(`  [warn] ${w.path}: ${w.message}`);
  }

  const previous = loadPrevious();
  const diff = diffFrenchTaxRegistries(previous, registry);
  const index = buildRegistryIndex(registry);

  const indexJson = {
    version: registry.version,
    generatedAt: registry.generatedAt,
    byNormalizedReference: Object.fromEntries(
      [...index.byNormalizedReference.entries()].map(([k, e]) => [k, e.id])
    ),
    byCerfa: Object.fromEntries(
      [...index.byCerfa.entries()].map(([k, arr]) => [k, arr.map((e) => e.id)])
    ),
    knownReferences: [...index.knownReferences].sort(),
    counts: {
      references: index.byNormalizedReference.size,
      cerfaKeys: index.byCerfa.size,
      aliases: index.byAlias.size
    }
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(registry, null, 2) + "\n");
  writeFileSync(INDEX_FILE, JSON.stringify(indexJson, null, 2) + "\n");
  writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        generatedAt: registry.generatedAt,
        previousVersion: previous?.version ?? null,
        nextVersion: registry.version,
        entryCount: registry.entries.length,
        diff,
        sources: FISCAL_EXTERNAL_SOURCES
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(
    DISCOVERY_REPORT,
    JSON.stringify(
      {
        discovered: result.discovered.length,
        validated: result.validated.length,
        integrated: result.integrated.length,
        rejected: result.rejected,
        needsReview: result.needsReview,
        catalogOnlyCount: result.catalogOnlyCount,
        families: [...new Set(registry.entries.map((e) => e.family))].sort(),
        documentKinds: [...new Set(registry.entries.map((e) => e.documentKind))].sort(),
        withCerfa: registry.entries.filter((e) => e.cerfaNumbers.length > 0).length,
        withYears: registry.entries.filter((e) => e.applicableYears.length > 0).length,
        withRelations: registry.entries.filter((e) => e.relatedDocuments.length > 0).length,
        notices: registry.entries.filter((e) => e.documentKind === "notice").length
      },
      null,
      2
    ) + "\n"
  );

  console.log("wrote", OUT_FILE, `(${registry.entries.length} entries)`);
  console.log("wrote", INDEX_FILE);
  console.log("wrote", REPORT_FILE);
  console.log("wrote", DISCOVERY_REPORT);
  console.log("discovery:", registry.discoveryStats);
  console.log("diff:", {
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
    titleChanged: diff.titleChanged.length,
    cerfaChanged: diff.cerfaChanged.length
  });
  console.log("OK — artefact local prêt (runtime offline).");
}

main();
