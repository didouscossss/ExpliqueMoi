#!/usr/bin/env node
/**
 * Tests réels pipelines photo/PDF — v2.4.2
 * Requis : GEMINI_API_KEY
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIX = "/tmp/reg-fixtures";
const PORT = 8795;
const BASE = `http://127.0.0.1:${PORT}`;
const hasKey = Boolean(process.env.GEMINI_API_KEY);

const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id} — ${detail}`);
}

async function ensureFixtures() {
  fs.mkdirSync(FIX, { recursive: true });
  const require = createRequire(import.meta.url);
  const { createCanvas } = require("@napi-rs/canvas");

  async function textPdf(file, pages, label) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= pages; i += 1) {
      const page = doc.addPage([595, 842]);
      page.drawText(`${label} — page ${i}/${pages}`, {
        x: 50,
        y: 780,
        size: 16,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
      page.drawText("Contrat d'assurance. Montant : 45,90 EUR. Echeance 12/09/2026.", {
        x: 50,
        y: 740,
        size: 12,
        font
      });
      for (let line = 0; line < 18; line += 1) {
        page.drawText(
          `Ligne ${line + 1} — texte administratif lisible test ExpliqueMoi.`,
          { x: 50, y: 700 - line * 18, size: 10, font }
        );
      }
    }
    fs.writeFileSync(file, await doc.save());
  }

  await textPdf(path.join(FIX, "PDF_1page_text.pdf"), 1, "Doc 1p");
  await textPdf(path.join(FIX, "PDF_5pages_text.pdf"), 5, "Doc 5p");
  await textPdf(path.join(FIX, "PDF_25pages_text.pdf"), 25, "Doc 25p");

  // scanned
  {
    const canvas = createCanvas(1240, 1754);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1240, 1754);
    ctx.fillStyle = "#111";
    ctx.font = "28px sans-serif";
    ctx.fillText("FACTURE SCANNEE — SARL DUPONT", 80, 120);
    ctx.font = "22px sans-serif";
    ctx.fillText("Montant TTC : 1 234,56 EUR", 80, 180);
    ctx.fillText("Date limite : 20/08/2026", 80, 220);
    const jpg = canvas.toBuffer("image/jpeg", { quality: 0.85 });
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([img.width * 0.48, img.height * 0.48]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight()
    });
    fs.writeFileSync(path.join(FIX, "PDF_scanned.pdf"), await doc.save());
  }

  function docImage(file, w, h, title) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f7f4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#111";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(title, 40, 70);
    ctx.font = "22px sans-serif";
    [
      "Destinataire : Jean Martin",
      "Objet : Relance facture FAC-2026-441",
      "Montant : 289,00 EUR",
      "Date limite : 15/08/2026",
      "Paiement par virement IBAN FR76 1234 5678"
    ].forEach((t, i) => ctx.fillText(t, 40, 140 + i * 44));
    fs.writeFileSync(file, canvas.toBuffer("image/jpeg", { quality: 0.92 }));
  }

  docImage(path.join(FIX, "PHOTO_screenshot.jpg"), 1400, 900, "Capture ecran");
  docImage(path.join(FIX, "PHOTO_facture.jpg"), 1600, 2200, "FACTURE");
  docImage(path.join(FIX, "PHOTO_phone.jpg"), 1800, 2400, "Photo telephone");

  // heavy ~6MB-ish noise jpeg for compression proof (optional)
  if (!fs.existsSync(path.join(FIX, "A_photo_3mb.jpg"))) {
    const canvas = createCanvas(3000, 2200);
    const ctx = canvas.getContext("2d");
    for (let y = 0; y < 2200; y += 2) {
      for (let x = 0; x < 3000; x += 2) {
        const v = (x * y) % 255;
        ctx.fillStyle = `rgb(${v},${(v * 3) % 255},${(v * 7) % 255})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.fillStyle = "#ffff00";
    ctx.font = "28px sans-serif";
    ctx.fillText("DOCUMENT OFFICIEL — texte a conserver lisible", 40, 80);
    fs.writeFileSync(
      path.join(FIX, "A_photo_3mb.jpg"),
      canvas.toBuffer("image/jpeg", { quality: 0.93 })
    );
  }

  function padPdf(file, target) {
    const content = Buffer.from("BT /F1 12 Tf 72 720 Td (Pad) Tj ET");
    const objs = [
      Buffer.from("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"),
      Buffer.from("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"),
      Buffer.from(
        "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
      ),
      Buffer.concat([
        Buffer.from(`4 0 obj<< /Length ${content.length} >>stream\n`),
        content,
        Buffer.from("\nendstream\nendobj\n")
      ]),
      Buffer.from(
        "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
      )
    ];
    let fixed = Buffer.from("%PDF-1.4\n");
    for (const o of objs) fixed = Buffer.concat([fixed, o]);
    const padNeeded = Math.max(0, target - fixed.length - 250);
    objs.push(
      Buffer.concat([
        Buffer.from(`6 0 obj<< /Length ${padNeeded} >>stream\n`),
        Buffer.alloc(padNeeded, 0x58),
        Buffer.from("\nendstream\nendobj\n")
      ])
    );
    let body = Buffer.from("%PDF-1.4\n");
    const offsets = [0];
    for (const o of objs) {
      offsets.push(body.length);
      body = Buffer.concat([body, o]);
    }
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i += 1) {
      xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    const trailer = `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;
    fs.writeFileSync(file, Buffer.concat([body, Buffer.from(xref), Buffer.from(trailer)]));
  }

  padPdf(path.join(FIX, "PDF_39MiB.pdf"), Math.floor(3.9 * 1024 * 1024));
  padPdf(path.join(FIX, "PDF_41MiB.pdf"), 4 * 1024 * 1024 + 80000);
}

async function startServer() {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "scripts/run-local-analyze.mjs")],
    {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server timeout")), 20000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) {
          clearInterval(poll);
          clearTimeout(timer);
          resolve();
        }
      } catch {
        // wait
      }
    }, 150);
  });
  return child;
}

function fileBlob(filePath, mime) {
  const buf = fs.readFileSync(filePath);
  return new File([buf], path.basename(filePath), { type: mime });
}

async function postAnalyze(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/analyze`, { method: "POST", body: form });
  const elapsed = Date.now() - t0;
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, elapsed };
}

async function expectOk(id, filePath, mime, opts = {}) {
  const file = fileBlob(filePath, mime);
  const fields = { text: "" };
  if (opts.manifest) {
    fields.manifest = JSON.stringify({
      pageCount: 1,
      createdAt: Date.now(),
      heterogeneous: false,
      pages: [
        {
          order: 0,
          id: "p0",
          name: path.basename(filePath),
          mimeType: mime,
          rotation: 0,
          field: "page_0"
        }
      ]
    });
    fields.page_0 = file;
    fields.file = file;
  } else {
    fields.file = file;
  }
  const r = await postAnalyze(fields);
  const summary = r.json?.analysis?.plain_summary || r.json?.analysis?.document_type || "";
  if (r.json?.ok === true && r.json?.analysis) {
    record(
      id,
      "PASS",
      `HTTP ${r.status} ${r.elapsed}ms model=${r.json?.pdfProcessing?.mode || "n/a"} type=${r.json.analysis.document_type || "?"} summary=${String(summary).slice(0, 80)}`
    );
    return true;
  }
  record(
    id,
    "FAIL",
    `HTTP ${r.status} ${r.elapsed}ms ${JSON.stringify(r.json?.error || r.json).slice(0, 320)}`
  );
  return false;
}

async function probeModels() {
  const { PRIMARY_MODEL, FALLBACK_MODELS } = await import("../lib/geminiModels.js");
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  const key = process.env.GEMINI_API_KEY;
  for (const model of models) {
    const t0 = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: 'Reply JSON {"ok":true}' }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json"
            }
          })
        }
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      record(
        `MODEL_${model}`,
        res.ok && text ? "PASS" : "FAIL",
        `HTTP ${res.status} ${Date.now() - t0}ms ${text.slice(0, 60) || data?.error?.message || ""}`
      );
    } catch (error) {
      record(`MODEL_${model}`, "FAIL", String(error.message || error));
    }
  }
}

async function main() {
  console.log("hasKey=", hasKey);
  await ensureFixtures();

  if (!hasKey) {
    console.error("GEMINI_API_KEY missing — cannot run real pipeline tests");
    process.exit(2);
  }

  await probeModels();
  const server = await startServer();

  try {
    await expectOk("PHOTO_screenshot", path.join(FIX, "PHOTO_screenshot.jpg"), "image/jpeg");
    await expectOk("PHOTO_facture", path.join(FIX, "PHOTO_facture.jpg"), "image/jpeg");
    await expectOk("PHOTO_phone", path.join(FIX, "PHOTO_phone.jpg"), "image/jpeg");

    await expectOk("PDF_1page_text", path.join(FIX, "PDF_1page_text.pdf"), "application/pdf");
    await expectOk("PDF_5pages_text", path.join(FIX, "PDF_5pages_text.pdf"), "application/pdf");
    await expectOk("PDF_25pages", path.join(FIX, "PDF_25pages_text.pdf"), "application/pdf");
    await expectOk("PDF_scanned", path.join(FIX, "PDF_scanned.pdf"), "application/pdf");
    await expectOk("PDF_phone_like", path.join(FIX, "PDF_1page_text.pdf"), "application/pdf", {
      manifest: true
    });

    // 3.9 Mo — accepté (sous 4 MiB)
    {
      const r = await postAnalyze({
        file: fileBlob(path.join(FIX, "PDF_39MiB.pdf"), "application/pdf"),
        text: ""
      });
      if (r.status === 413) {
        record("PDF_39Mo", "FAIL", `should accept under 4MiB: ${JSON.stringify(r.json?.error)}`);
      } else if (r.json?.ok || r.json?.error?.code) {
        // ok or gemini-level error still means size accepted
        if (r.json?.error?.code === "FILE_TOO_LARGE") {
          record("PDF_39Mo", "FAIL", "incorrectly rejected as too large");
        } else {
          record(
            "PDF_39Mo",
            r.json?.ok ? "PASS" : "PASS",
            `accepted HTTP ${r.status} code=${r.json?.ok ? "ok" : r.json.error.code} ${r.elapsed}ms`
          );
        }
      } else {
        record("PDF_39Mo", "FAIL", JSON.stringify(r.json).slice(0, 200));
      }
    }

    // 4.1 Mo — FILE_TOO_LARGE
    {
      const r = await postAnalyze({
        file: fileBlob(path.join(FIX, "PDF_41MiB.pdf"), "application/pdf"),
        text: ""
      });
      if (r.status === 413 && r.json?.error?.code === "FILE_TOO_LARGE") {
        record("PDF_41Mo", "PASS", "FILE_TOO_LARGE");
      } else {
        record("PDF_41Mo", "FAIL", `HTTP ${r.status} ${JSON.stringify(r.json?.error || r.json)}`);
      }
    }

    // After failure → new doc
    await postAnalyze({
      file: fileBlob(path.join(FIX, "PDF_41MiB.pdf"), "application/pdf"),
      text: ""
    });
    await expectOk("AFTER_FAIL_photo", path.join(FIX, "PHOTO_facture.jpg"), "image/jpeg");
    await expectOk("PHOTO_then_PDF", path.join(FIX, "PDF_1page_text.pdf"), "application/pdf");
    await expectOk("PDF_then_photo", path.join(FIX, "PHOTO_screenshot.jpg"), "image/jpeg");
  } finally {
    server.kill("SIGTERM");
  }

  const required = [
    "PHOTO_screenshot",
    "PHOTO_facture",
    "PHOTO_phone",
    "PDF_1page_text",
    "PDF_5pages_text",
    "PDF_25pages",
    "PDF_scanned",
    "PDF_phone_like",
    "PDF_39Mo",
    "PDF_41Mo",
    "AFTER_FAIL_photo",
    "PHOTO_then_PDF",
    "PDF_then_photo"
  ];

  const failed = required.filter(
    (id) => results.find((r) => r.id === id)?.status !== "PASS"
  );

  fs.writeFileSync(
    "/tmp/reg-fixtures/TEST_RESULTS_242.json",
    JSON.stringify({ hasKey, results, failed }, null, 2)
  );
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(
    "/opt/cursor/artifacts/TEST_RESULTS_242.json",
    JSON.stringify({ hasKey, results, failed }, null, 2)
  );

  console.log("\n=== SUMMARY ===");
  for (const row of results) console.log(`${row.status}\t${row.id}\t${row.detail}`);

  if (failed.length) {
    console.error("FAILED:", failed.join(", "));
    process.exit(1);
  }
  console.log("ALL REQUIRED PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
