#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { randomUUID } from "crypto";

const ANALYZE_URL =
  process.env.ANALYZE_URL ||
  "https://explique-moi-gules.vercel.app/api/analyze";

const files = process.argv.slice(2);
const defaults = [
  "/tmp/pdf-fixtures/A_text_simple.pdf",
  "/tmp/pdf-fixtures/invoice_table.pdf",
  "/tmp/pdf-fixtures/B_page1.jpg",
  "/tmp/pdf-fixtures/H_scan_image.png",
  "/tmp/pdf-fixtures/I_formulaire.pdf"
];

const targets = (files.length ? files : defaults).filter((p) =>
  existsSync(p)
);

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

for (const filePath of targets) {
  const { body, headers } = multipart(filePath);
  const t0 = Date.now();
  try {
    const res = await fetch(ANALYZE_URL, {
      method: "POST",
      headers,
      body
    });
    const text = await res.text();
    let parsed = null;
    let parseErr = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      parseErr = error.message;
    }

    console.log(
      JSON.stringify(
        {
          file: basename(filePath),
          status: res.status,
          ms: Date.now() - t0,
          contentType: res.headers.get("content-type"),
          parseOk: !parseErr,
          parseErr,
          ok: parsed?.ok ?? null,
          error: parsed?.error || null,
          head: text.slice(0, 350).replace(/\s+/g, " "),
          analysisKeys: parsed?.analysis
            ? Object.keys(parsed.analysis)
            : null
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          file: basename(filePath),
          networkError: error.message,
          ms: Date.now() - t0
        },
        null,
        2
      )
    );
  }
}
