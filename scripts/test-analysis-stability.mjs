#!/usr/bin/env node
/**
 * Stability proof: 3 PDFs + 2 photos against a live /api/analyze.
 * Usage:
 *   ANALYZE_URL=https://... node scripts/test-analysis-stability.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { randomUUID } from "crypto";

const ANALYZE_URL =
  process.env.ANALYZE_URL ||
  "https://explique-ofyv53n9y-didouscossss-projects.vercel.app/api/analyze";

const VERCEL_LIMIT_MS = Number(process.env.VERCEL_LIMIT_MS) || 60000;

const CASES = [
  {
    path: "/tmp/pdf-fixtures/A_text_simple.pdf",
    kind: "pdf_small",
    label: "PDF petit (1 page texte)"
  },
  {
    path: "/tmp/pdf-fixtures/C_five_pages.pdf",
    kind: "pdf_medium",
    label: "PDF moyen (5 pages)"
  },
  {
    path: "/tmp/pdf-fixtures/S4_11_pages.pdf",
    kind: "pdf_gt10",
    label: "PDF >10 pages (11)"
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
  process.env.REPORT_DIR || "/opt/cursor/artifacts/stability-2.3.5";
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
    }
  };
}

const results = [];

for (const testCase of CASES) {
  if (!existsSync(testCase.path)) {
    results.push({
      ...testCase,
      pass: false,
      error: "fixture missing"
    });
    continue;
  }

  const { body, headers: multipartHeaders } = multipart(testCase.path);
  const t0 = Date.now();
  let entry = {
    file: basename(testCase.path),
    kind: testCase.kind,
    label: testCase.label,
    url: ANALYZE_URL
  };

  try {
    const headers = { ...multipartHeaders };
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      headers["x-vercel-protection-bypass"] = bypass;
      headers["x-vercel-set-bypass-cookie"] = "true";
    }
    const res = await fetch(ANALYZE_URL, { method: "POST", headers, body });
    const raw = await res.text();
    const wallMs = Date.now() - t0;
    let parsed = null;
    let parseOk = false;
    let parseErr = null;
    try {
      parsed = JSON.parse(raw);
      parseOk = true;
    } catch (error) {
      parseErr = error.message;
    }

    const timings = parsed?.timings || null;
    const analysis = parsed?.ok === true ? parsed.analysis : null;
    const pass =
      res.status === 200 &&
      parseOk &&
      parsed?.ok === true &&
      Boolean(analysis?.document_type || analysis?.plain_summary) &&
      wallMs < VERCEL_LIMIT_MS;

    entry = {
      ...entry,
      pass,
      status: res.status,
      contentType: res.headers.get("content-type"),
      parseOk,
      parseErr,
      ok: parsed?.ok ?? null,
      error: parsed?.error || null,
      document_type: analysis?.document_type || null,
      reading_quality: analysis?.reading_quality || null,
      mode: parsed?.pdfProcessing?.mode || null,
      wall_ms: wallMs,
      timings,
      under_vercel_limit: wallMs < VERCEL_LIMIT_MS,
      head: String(raw).slice(0, 280).replace(/\s+/g, " ")
    };
  } catch (error) {
    entry = {
      ...entry,
      pass: false,
      networkError: error.message,
      wall_ms: Date.now() - t0
    };
  }

  results.push(entry);
  console.log(JSON.stringify(entry, null, 2));
}

const passed = results.filter((r) => r.pass).length;
const allPass = passed === CASES.length;

const report = {
  generatedAt: new Date().toISOString(),
  analyzeUrl: ANALYZE_URL,
  vercelLimitMs: VERCEL_LIMIT_MS,
  passed,
  total: CASES.length,
  allPass,
  results
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

const lines = [
  `# Stability proof 2.3.5`,
  ``,
  `- URL: \`${ANALYZE_URL}\``,
  `- Result: **${allPass ? "ALL PASS" : "FAIL"}** (${passed}/${CASES.length})`,
  `- Vercel limit: ${VERCEL_LIMIT_MS} ms`,
  ``,
  `| Document | Kind | Status | wall_ms | ocr_ms | gemini_ms | parse_ms | enrich_ms | total_ms | PASS |`,
  `|---|---|---:|---:|---:|---:|---:|---:|---:|:---:|`
];

for (const r of results) {
  const t = r.timings || {};
  lines.push(
    `| ${r.file} | ${r.kind} | ${r.status ?? "—"} | ${r.wall_ms ?? "—"} | ${t.ocr_ms ?? "—"} | ${t.gemini_ms ?? "—"} | ${t.parse_ms ?? "—"} | ${t.enrich_ms ?? "—"} | ${t.total_ms ?? "—"} | ${r.pass ? "PASS" : "FAIL"} |`
  );
}

lines.push(``);
lines.push(`## Root cause (final)`);
lines.push(
  `v2.3.4 schema/prompt trop large → génération Gemini lente → timeout Vercel 504 text/plain → frontend « réponse illisible ». Fix 2.3.5: schéma lean 2.3.3 + parse/repair + erreurs JSON.`
);

writeFileSync(join(outDir, "REPORT.md"), lines.join("\n"));
console.log(`\nWrote ${join(outDir, "report.json")}`);
console.log(`Wrote ${join(outDir, "REPORT.md")}`);
console.log(allPass ? "ALL PASS" : "NOT ALL PASS");
process.exit(allPass ? 0 : 1);
