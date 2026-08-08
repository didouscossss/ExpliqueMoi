/**
 * BUILD / MAINTENANCE — npm run knowledge:tax:update
 *
 * N'EST PAS exécuté pendant l'analyse utilisateur.
 * Runtime reste 0 fetch : lit le seed curated + écrit l'artefact local.
 *
 * Mode réseau (optionnel) : --fetch-official
 *   → GET limité des pages formulaire publiques impots.gouv.fr
 *   → ne scrape pas massivement, ne contourne pas anti-bot
 *   → si indisponible / bloqué : conserve le seed et documente
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegistryFromSeed,
  FRENCH_TAX_REGISTRY_VERSION,
  FISCAL_EXTERNAL_SOURCES
} from "../lib/v4/knowledge/index.ts";
import { validateFrenchTaxRegistry } from "../lib/v4/knowledge/fr/tax/registry/validateRegistry.ts";
import { diffFrenchTaxRegistries } from "../lib/v4/knowledge/fr/tax/registry/diffRegistry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "generated");
const OUT_FILE = join(OUT_DIR, "french-tax-registry.json");
const REPORT_FILE = join(OUT_DIR, "french-tax-registry-diff.json");
const FETCH_REPORT = join(OUT_DIR, "french-tax-fetch-report.json");

const wantFetch = process.argv.includes("--fetch-official");

async function optionalOfficialProbe() {
  if (!wantFetch) {
    return {
      attempted: false,
      reason: "offline-curated-default",
      pages: []
    };
  }

  const urls = [
    "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
    "https://www.impots.gouv.fr/recherche-de-formulaire"
  ];
  const pages = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "ExpliqueMoiKnowledgeBuild/1.0 (curated registry refresh; contact: local-dev)",
          Accept: "text/html"
        },
        redirect: "follow"
      });
      const text = await res.text();
      pages.push({
        url,
        ok: res.ok,
        status: res.status,
        bytes: text.length,
        has2042: /2042/.test(text),
        titleMatch: /d[eé]claration\s+des\s+revenus/i.test(text)
      });
    } catch (err) {
      pages.push({
        url,
        ok: false,
        status: 0,
        error: String(err?.message || err),
        note: "Récupération non disponible — seed curated conservé. Pas de contournement anti-bot."
      });
    }
  }
  return {
    attempted: true,
    reason: "limited-official-html-probe",
    license: FISCAL_EXTERNAL_SOURCES.find((s) => s.id === "impots-gouv-fr"),
    pages,
    note:
      "Pas d'aspiration massive PDF. Métadonnées du seed restent la source runtime."
  };
}

function loadPrevious() {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== knowledge:tax:update (V4-L build) ===");
  console.log("registry version seed:", FRENCH_TAX_REGISTRY_VERSION);

  const fetchReport = await optionalOfficialProbe();
  if (wantFetch) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(FETCH_REPORT, JSON.stringify(fetchReport, null, 2));
    console.log("fetch report →", FETCH_REPORT);
    for (const p of fetchReport.pages || []) {
      console.log(" ", p.url, p.ok ? `OK ${p.status}` : `FAIL ${p.status || p.error}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const next = buildRegistryFromSeed(generatedAt);
  const issues = validateFrenchTaxRegistry(next);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    console.error("Validation FAILED:");
    for (const e of errors) console.error(`  [${e.level}] ${e.path}: ${e.message}`);
    process.exit(1);
  }
  for (const w of issues.filter((i) => i.level === "warning")) {
    console.warn(`  [warn] ${w.path}: ${w.message}`);
  }

  const previous = loadPrevious();
  const diff = diffFrenchTaxRegistries(previous, next);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(next, null, 2) + "\n");
  writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        generatedAt,
        previousVersion: previous?.version ?? null,
        nextVersion: next.version,
        entryCount: next.entries.length,
        diff,
        fetch: fetchReport,
        sources: FISCAL_EXTERNAL_SOURCES
      },
      null,
      2
    ) + "\n"
  );

  console.log("wrote", OUT_FILE);
  console.log("wrote", REPORT_FILE);
  console.log("entries:", next.entries.length);
  console.log("diff:", {
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
    newVersion: diff.newVersion,
    sourceChanged: diff.sourceChanged.length
  });
  console.log("OK — artefact local prêt (runtime offline).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
