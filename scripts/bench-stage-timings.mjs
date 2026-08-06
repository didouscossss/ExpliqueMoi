#!/usr/bin/env node
/**
 * Mesure stage-par-stage : upload, OCR, prompt, Gemini, parse, enrich.
 * Docs : PDF 5p, PDF >10p, photo.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { randomUUID } from "crypto";

const ANALYZE_URL =
  process.env.ANALYZE_URL || "http://127.0.0.1:8787/api/analyze";
const GEMINI_LIMIT_MS = Number(process.env.GEMINI_LIMIT_MS) || 45000;
const outDir =
  process.env.REPORT_DIR || "/opt/cursor/artifacts/stage-timings";

const CASES = [
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
    label: "Photo"
  }
];

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

const results = [];

for (const testCase of CASES) {
  if (!existsSync(testCase.path)) {
    results.push({ ...testCase, error: "missing" });
    continue;
  }

  const { body, headers, fileBytes } = multipart(testCase.path);
  const reqHeaders = { ...headers };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    reqHeaders["x-vercel-protection-bypass"] = bypass;
  }

  const wallStart = Date.now();
  let entry = {
    file: basename(testCase.path),
    kind: testCase.kind,
    label: testCase.label,
    file_bytes: fileBytes,
    url: ANALYZE_URL
  };

  try {
    const res = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: reqHeaders,
      body
    });
    const raw = await res.text();
    const wall_ms = Date.now() - wallStart;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      entry = {
        ...entry,
        pass: false,
        status: res.status,
        wall_ms,
        parseOk: false,
        head: raw.slice(0, 240).replace(/\s+/g, " "),
        contentType: res.headers.get("content-type")
      };
      results.push(entry);
      console.log(JSON.stringify(entry, null, 2));
      continue;
    }

    const t = parsed?.timings || parsed?.error?.details?.timings || {};
    const gemini_ms = Number(t.gemini_ms) || 0;
    const pass =
      res.status === 200 &&
      parsed?.ok === true &&
      Boolean(parsed?.analysis?.document_type || parsed?.analysis?.plain_summary);

    entry = {
      ...entry,
      pass,
      status: res.status,
      ok: parsed?.ok ?? null,
      error: parsed?.error || null,
      document_type: parsed?.analysis?.document_type || null,
      wall_ms,
      stages: {
        upload_ms: t.upload_ms ?? null,
        ocr_ms: t.ocr_ms ?? null,
        prompt_ms: t.prompt_ms ?? null,
        gemini_ms: t.gemini_ms ?? null,
        gemini_started_at: t.gemini_started_at ?? null,
        gemini_ended_at: t.gemini_ended_at ?? null,
        parse_ms: t.parse_ms ?? null,
        enrich_ms: t.enrich_ms ?? null,
        total_ms: t.total_ms ?? null
      },
      gemini_over_45s: gemini_ms >= GEMINI_LIMIT_MS,
      gemini_over_50s: gemini_ms >= 50000
    };
  } catch (error) {
    entry = {
      ...entry,
      pass: false,
      networkError: error.message,
      wall_ms: Date.now() - wallStart
    };
  }

  results.push(entry);
  console.log(JSON.stringify(entry, null, 2));
}

const geminiBottleneck = results.some(
  (r) => r.stages && Number(r.stages.gemini_ms) >= GEMINI_LIMIT_MS
);
const anyPass = results.some((r) => r.pass);
const allPass = results.length === CASES.length && results.every((r) => r.pass);

const report = {
  generatedAt: new Date().toISOString(),
  analyzeUrl: ANALYZE_URL,
  geminiLimitMs: GEMINI_LIMIT_MS,
  allPass,
  anyPass,
  geminiBottleneck,
  verdict: geminiBottleneck
    ? "GEMINI_BOTTLENECK — stop sync opts, migrate async"
    : anyPass
      ? "CODE_OR_MIXED — inspect stage table"
      : "NO_SUCCESSFUL_RUN — need GEMINI_API_KEY or reachable endpoint",
  results
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));

const lines = [
  `# Stage timings`,
  ``,
  `- URL: \`${ANALYZE_URL}\``,
  `- Verdict: **${report.verdict}**`,
  `- Gemini bottleneck (≥${GEMINI_LIMIT_MS} ms): ${geminiBottleneck}`,
  ``,
  `| Doc | upload | OCR | prompt | Gemini | parse | enrich | total | wall | PASS |`,
  `|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|`
];

for (const r of results) {
  const s = r.stages || {};
  lines.push(
    `| ${r.file} | ${s.upload_ms ?? "—"} | ${s.ocr_ms ?? "—"} | ${s.prompt_ms ?? "—"} | ${s.gemini_ms ?? "—"} | ${s.parse_ms ?? "—"} | ${s.enrich_ms ?? "—"} | ${s.total_ms ?? "—"} | ${r.wall_ms ?? "—"} | ${r.pass ? "PASS" : "FAIL"} |`
  );
}

writeFileSync(join(outDir, "REPORT.md"), lines.join("\n"));
console.log("\n" + lines.join("\n"));
process.exit(allPass ? 0 : geminiBottleneck ? 2 : 1);
