#!/usr/bin/env node
/**
 * Benchmark 50s budget vs production.
 * Usage:
 *   GEMINI_API_KEY=... node scripts/run-local-analyze.mjs &
 *   ANALYZE_URL=http://127.0.0.1:8787/api/analyze node scripts/bench-speed-50s.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { randomUUID } from "crypto";

const LOCAL_URL =
  process.env.ANALYZE_URL || "http://127.0.0.1:8787/api/analyze";
const PROD_URL =
  process.env.PROD_URL ||
  "https://explique-moi-gules.vercel.app/api/analyze";
const BUDGET_MS = 50_000;

const CASES = [
  {
    path: "/tmp/pdf-fixtures/A_text_simple.pdf",
    kind: "pdf_small_text",
    label: "Petit PDF texte"
  },
  {
    path: "/tmp/pdf-fixtures/G_3to4mb.pdf",
    kind: "pdf_heavy_scan",
    label: "PDF scanné/image lourd (~3.5 Mo)"
  },
  {
    path: "/tmp/pdf-fixtures/C_five_pages.pdf",
    kind: "pdf_5p",
    label: "PDF 5 pages"
  },
  {
    path: "/tmp/pdf-fixtures/S4_11_pages.pdf",
    kind: "pdf_gt10",
    label: "PDF >10 pages"
  },
  {
    path: "/tmp/reg-fixtures/PHOTO_facture.jpg",
    kind: "photo",
    label: "Photo facture"
  },
  {
    path: "/tmp/reg-fixtures/PHOTO_phone.jpg",
    kind: "photo",
    label: "Photo téléphone"
  }
];

const outDir =
  process.env.REPORT_DIR || "/opt/cursor/artifacts/speed-50s-2.3.6";
mkdirSync(outDir, { recursive: true });

function multipart(filePath) {
  const data = readFileSync(filePath);
  const name = basename(filePath);
  const mime = name.endsWith(".png")
    ? "image/png"
    : name.endsWith(".jpg") || name.endsWith(".jpeg")
      ? "image/jpeg"
      : "application/pdf";
  const boundary = `----bound${randomUUID().replace(/-/g, "")}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${name}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length)
    },
    fileBytes: data.length
  };
}

async function runOne(url, testCase) {
  if (!existsSync(testCase.path)) {
    return { ...testCase, pass: false, error: "missing fixture" };
  }

  const { body, headers, fileBytes } = multipart(testCase.path);
  const t0 = Date.now();
  try {
    const reqHeaders = { ...headers };
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      reqHeaders["x-vercel-protection-bypass"] = bypass;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body
    });
    const raw = await res.text();
    const wallMs = Date.now() - t0;
    let parsed = null;
    let parseOk = false;
    try {
      parsed = JSON.parse(raw);
      parseOk = true;
    } catch (error) {
      return {
        file: basename(testCase.path),
        kind: testCase.kind,
        label: testCase.label,
        url,
        pass: false,
        status: res.status,
        contentType: res.headers.get("content-type"),
        parseOk: false,
        parseErr: error.message,
        wall_ms: wallMs,
        under_50s: wallMs < BUDGET_MS,
        file_bytes: fileBytes,
        head: String(raw).slice(0, 220).replace(/\s+/g, " ")
      };
    }

    const timings = parsed?.timings || parsed?.error?.details?.timings || null;
    const analysis = parsed?.ok === true ? parsed.analysis : null;
    const pass =
      res.status === 200 &&
      parseOk &&
      parsed?.ok === true &&
      Boolean(analysis?.document_type || analysis?.plain_summary) &&
      wallMs < BUDGET_MS;

    return {
      file: basename(testCase.path),
      kind: testCase.kind,
      label: testCase.label,
      url,
      pass,
      status: res.status,
      contentType: res.headers.get("content-type"),
      parseOk,
      ok: parsed?.ok ?? null,
      error: parsed?.error || null,
      document_type: analysis?.document_type || null,
      wall_ms: wallMs,
      under_50s: wallMs < BUDGET_MS,
      file_bytes: fileBytes,
      timings,
      compressed: timings?.compressed ?? parsed?.pdfProcessing?.compressed,
      before_bytes: timings?.before_bytes ?? null,
      after_bytes: timings?.after_bytes ?? null
    };
  } catch (error) {
    return {
      file: basename(testCase.path),
      kind: testCase.kind,
      label: testCase.label,
      url,
      pass: false,
      networkError: error.message,
      wall_ms: Date.now() - t0,
      under_50s: false,
      file_bytes: fileBytes
    };
  }
}

const targets = process.env.BENCH_TARGET === "prod" ? [PROD_URL] : [LOCAL_URL];
if (process.env.BENCH_COMPARE === "1") {
  targets.push(PROD_URL);
}

const report = {
  generatedAt: new Date().toISOString(),
  budgetMs: BUDGET_MS,
  targets,
  results: {}
};

for (const url of targets) {
  const key = url.includes("vercel.app") ? "prod" : "local";
  report.results[key] = [];
  for (const testCase of CASES) {
    // Only 5 required: skip 6th photo from "pass all 5" if needed — user asked 2 photos so keep both
    const entry = await runOne(url, testCase);
    report.results[key].push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }
}

const local = report.results.local || [];
const required = local.filter((r) =>
  ["pdf_small_text", "pdf_heavy_scan", "pdf_5p", "pdf_gt10", "photo"].includes(
    r.kind
  )
);
// Count unique kinds: need 1 of each kind except photo needs 2
const photos = local.filter((r) => r.kind === "photo");
const core = [
  local.find((r) => r.kind === "pdf_small_text"),
  local.find((r) => r.kind === "pdf_heavy_scan"),
  local.find((r) => r.kind === "pdf_5p"),
  local.find((r) => r.kind === "pdf_gt10"),
  ...photos.slice(0, 2)
].filter(Boolean);

const allPass = core.length >= 5 && core.every((r) => r.pass);
report.allPass = allPass;
report.coreCount = core.length;
report.passed = core.filter((r) => r.pass).length;

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

const lines = [
  `# Speed budget 50s — 2.3.6`,
  ``,
  `- allPass: **${allPass}** (${report.passed}/${core.length})`,
  `- budget: ${BUDGET_MS} ms`,
  ``,
  `| Env | File | wall_ms | upload | prep | gemini | before→after | PASS |`,
  `|---|---|---:|---:|---:|---:|---|:---:|`
];

for (const [env, rows] of Object.entries(report.results)) {
  for (const r of rows) {
    const t = r.timings || {};
    lines.push(
      `| ${env} | ${r.file} | ${r.wall_ms ?? "—"} | ${t.upload_ms ?? "—"} | ${t.prep_ms ?? "—"} | ${t.gemini_ms ?? "—"} | ${t.before_bytes ?? r.file_bytes ?? "—"}→${t.after_bytes ?? "—"} | ${r.pass ? "PASS" : "FAIL"} |`
    );
  }
}

writeFileSync(join(outDir, "REPORT.md"), lines.join("\n"));
console.log(allPass ? "\nALL 5+ PASS under 50s" : "\nNOT ALL PASS under 50s");
process.exit(allPass ? 0 : 1);
