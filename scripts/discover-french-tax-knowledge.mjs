/**
 * ONLINE maintenance — npm run knowledge:tax:discover
 * Fetch sitemap + catalogue (limité). Ne tourne PAS au runtime utilisateur.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "generated/knowledge-snapshots");

const UA = "ExpliqueMoiKnowledgeBuild/1.0 (registry discovery; contact: local-dev)";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/xml,text/html,*/*" },
    redirect: "follow"
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, url };
}

function humanizeSlug(slug) {
  const fix = {
    declaration: "déclaration",
    dimpot: "d'impôt",
    impot: "impôt",
    impots: "impôts",
    fonciere: "foncière",
    immobiliere: "immobilière",
    prelevement: "prélèvement",
    societes: "sociétés",
    credit: "crédit",
    reduction: "réduction",
    complementary: "complémentaire",
    complementaire: "complémentaire",
    ndeg: "n°"
  };
  const title = slug
    .split("-")
    .map((w) => fix[w] || w)
    .join(" ");
  return title ? title[0].toUpperCase() + title.slice(1) : title;
}

function isNotice(ref, title, slug) {
  const r = ref.toUpperCase();
  const tl = title.toLowerCase();
  const sl = slug.toLowerCase();
  if (tl.includes("notice") || sl.includes("notice")) return true;
  if (r.includes("-NOT") || r.endsWith("NOT")) return true;
  if (/\bavis\b/.test(tl) && /(taxe|impôt|impot)/.test(tl)) return true;
  return false;
}

async function main() {
  console.log("=== knowledge:tax:discover (ONLINE) ===");
  mkdirSync(OUT, { recursive: true });

  const sm = await fetchText("https://www.impots.gouv.fr/sitemap.xml");
  if (!sm.ok) {
    console.error("sitemap fetch failed", sm.status);
    process.exit(1);
  }
  const formUrls = [
    ...new Set(
      [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => m[1].replace("http://", "https://"))
        .filter((u) => u.includes("/formulaire/"))
    )
  ].sort();

  const cat = await fetchText("https://www.impots.gouv.fr/recherche-de-formulaire");
  const plain = cat.text.replace(/<[^>]+>/g, " ");
  const idx = plain.indexOf("Liste des formulaires");
  const chunk = idx >= 0 ? plain.slice(idx, idx + 12000) : "";
  const catalogRefs = [];
  const seen = new Set();
  for (const r of chunk.match(/\b\d{3,4}(?:-[A-Z0-9]+){0,5}\b|\bDAS2\b|\bPFT-SD\b/g) || []) {
    if (!seen.has(r)) {
      seen.add(r);
      catalogRefs.push(r);
    }
  }

  const candidates = [];
  for (const u of formUrls) {
    const m = u.match(/\/formulaire\/([^/]+)\/([^/?#]+)/);
    if (!m) continue;
    const raw = m[1];
    const ref = raw.toUpperCase();
    const slug = m[2];
    const title = humanizeSlug(slug);
    const kind = isNotice(ref, title, slug) ? "notice" : "form";
    const metadataHash = createHash("sha256")
      .update(`${ref}|${title}|${u}`)
      .digest("hex")
      .slice(0, 16);
    candidates.push({
      rawReference: raw,
      reference: ref,
      title,
      url: u,
      authority: "DGFiP",
      source: "impots.gouv.fr-sitemap",
      retrievedAt: new Date().toISOString(),
      documentKindGuess: kind,
      cerfa: null,
      year: null,
      metadataHash
    });
  }

  const sitemapRefs = new Set(candidates.map((c) => c.reference));
  const catalogOnly = catalogRefs.filter((r) => !sitemapRefs.has(r.toUpperCase()));

  const stamp = new Date().toISOString().slice(0, 10);
  const path = join(OUT, `impots-forms-${stamp}.json`);
  const snapshot = {
    version: `${stamp}-v4m-discover`,
    retrievedAt: new Date().toISOString(),
    sources: [
      { id: "impots-sitemap", url: "https://www.impots.gouv.fr/sitemap.xml", count: candidates.length },
      {
        id: "impots-form-catalog",
        url: "https://www.impots.gouv.fr/recherche-de-formulaire",
        catalogRefs: catalogRefs.length,
        catalogOnlyNotInSitemap: catalogOnly.length
      }
    ],
    candidates,
    catalogReferences: catalogRefs,
    catalogOnlyReferences: catalogOnly
  };
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  // also refresh stable name used by adapter
  writeFileSync(
    join(OUT, "impots-forms-2026-08-08.json"),
    JSON.stringify(snapshot, null, 2) + "\n"
  );

  console.log("sitemap forms:", candidates.length);
  console.log("catalog refs:", catalogRefs.length, "catalog-only:", catalogOnly.length);
  console.log("wrote", path);
  console.log("OK — lancer ensuite: npm run knowledge:tax:update");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
