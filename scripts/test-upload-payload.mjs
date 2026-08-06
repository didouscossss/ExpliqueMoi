#!/usr/bin/env node
/**
 * Tests garde-fou upload → /api/analyze (limite sûre 3,2 Mo, pas de double append).
 */
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  SAFE_UPLOAD_BYTES,
  MAX_ANNOUNCED_FILE_BYTES,
  estimateMultipartBytes,
  evaluateUploadGate,
  reevaluateAfterCompression,
  planFormDataFields,
  BLOCKED_UPLOAD_MESSAGE
} from "../lib/uploadGate.js";
import { compressPdfForUpload } from "../lib/clientPdfCompression.js";
import { COMPRESSION_THRESHOLDS } from "../lib/imageCompression.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

async function makeTextPdf(targetBytes, name = "text.pdf") {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (let i = 0; i < 35; i += 1) {
    page.drawText(
      `Document texte dense ${i} — CAF CPAM impôts références ${"A".repeat(20)}`,
      { x: 40, y, size: 10, font }
    );
    y -= 18;
  }

  // Padding binaire pour atteindre la taille cible sans perdre le caractère « texte »
  let bytes = await pdf.save({ useObjectStreams: false });
  if (bytes.length < targetBytes) {
    const pad = Buffer.alloc(targetBytes - bytes.length, 0x20);
    // Commentaire PDF trailing — reste un PDF valide pour nos tests de taille
    bytes = Buffer.concat([
      Buffer.from(bytes),
      Buffer.from("\n% pad "),
      pad,
      Buffer.from("\n")
    ]);
  }

  return fileLike(bytes.subarray(0, Math.max(targetBytes, bytes.length)), name, "application/pdf");
}

async function makeImageHeavyPdf(targetBytes, name = "scan.pdf") {
  // Préférer la fixture réelle ~3,5–3,9 Mo si disponible
  const fs = await import("node:fs");
  const candidates = [
    "/tmp/pdf-fixtures/G_3to4mb.pdf",
    "/tmp/pdf-fixtures/S4_3_9mb.pdf"
  ];

  for (const path of candidates) {
    if (!fs.existsSync(path)) continue;
    const bytes = fs.readFileSync(path);
    if (
      bytes.length >= 3.5 * 1024 * 1024 &&
      bytes.length <= MAX_ANNOUNCED_FILE_BYTES
    ) {
      return fileLike(bytes, name, "application/pdf");
    }
  }

  throw new Error(
    `Fixture PDF image-heavy ~${targetBytes} o introuvable sous /tmp/pdf-fixtures`
  );
}

function fileLike(bytes, name, type) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    type,
    size: u8.length,
    mimeType: type,
    arrayBuffer: async () =>
      u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
    _bytes: u8
  };
}

/** Simule la construction FormData côté front (sans API FormData navigateur). */
function buildUploadPlan(pages) {
  const plan = planFormDataFields(pages);
  const appended = plan.fields.map((field) => field.field);
  if (plan.appendLegacyFile) {
    appended.push("file");
  }
  return { plan, appended };
}

async function simulatePrepareAndMaybeFetch(files, { fetchSpy }) {
  const originalBytes = files.reduce((s, f) => s + f.size, 0);
  let working = files.map((f) => ({ ...f }));

  const manifest = {
    pageCount: working.length,
    pages: working.map((f, order) => ({
      order,
      name: f.name,
      field: `page_${order}`
    }))
  };

  let gate = evaluateUploadGate({
    files: working,
    originalBytes,
    manifestJson: JSON.stringify(manifest)
  });

  if (gate.needsPdfCompression) {
    working = await Promise.all(
      working.map(async (file) => {
        if (file.type !== "application/pdf") return file;
        if (file.size < SAFE_UPLOAD_BYTES * 0.85) return file;
        const result = await compressPdfForUpload(file._bytes || file, {
          name: file.name,
          targetBytes: SAFE_UPLOAD_BYTES
        });
        if (result.compressed && result.file) {
          return {
            ...file,
            size: result.afterBytes,
            _bytes: result.file._bytes || (await result.file.arrayBuffer().then((b) => new Uint8Array(b)))
          };
        }
        return file;
      })
    );

    gate = reevaluateAfterCompression(working, {
      originalBytes,
      manifestJson: JSON.stringify(manifest)
    });
  }

  const log = {
    upload_original_bytes: originalBytes,
    upload_final_bytes: gate.upload_final_bytes,
    file_count: working.length,
    transport: "multipart",
    blocked_before_upload: Boolean(gate.blocked_before_upload)
  };

  const { appended } = buildUploadPlan(
    working.map((f, i) => ({
      id: `p${i}`,
      name: f.name,
      mimeType: f.type,
      size: f.size,
      rotation: 0
    }))
  );

  if (gate.blocked_before_upload) {
    return {
      sent: false,
      log,
      message: gate.message,
      appended,
      duplicateFileField: appended.includes("file") && appended.includes("page_0")
    };
  }

  fetchSpy.calls += 1;
  return {
    sent: true,
    log,
    message: null,
    appended,
    duplicateFileField: appended.includes("file") && appended.includes("page_0"),
    working
  };
}

async function main() {
  assert.ok(SAFE_UPLOAD_BYTES === Math.floor(3.2 * 1024 * 1024));
  assert.ok(MAX_ANNOUNCED_FILE_BYTES === 4 * 1024 * 1024);
  assert.ok(
    COMPRESSION_THRESHOLDS.BATCH_MAX_BYTES === SAFE_UPLOAD_BYTES,
    "batch photo aligné sur 3,2 Mo"
  );

  // Plan FormData : jamais de double append
  try {
    const plan = planFormDataFields([
      {
        id: "a",
        name: "doc.pdf",
        mimeType: "application/pdf",
        size: 1_500_000,
        rotation: 0
      }
    ]);
    assert.equal(plan.appendLegacyFile, false);
    assert.equal(plan.duplicateRisk, false);
    assert.deepEqual(
      plan.fields.map((f) => f.field),
      ["page_0"]
    );
    pass("NO_DOUBLE_APPEND", "page_0 only, no legacy file");
  } catch (error) {
    fail("NO_DOUBLE_APPEND", error.message);
  }

  const fetchSpy = { calls: 0 };

  // PDF 1,5 Mo : accepté
  try {
    const pdf = await makeTextPdf(1.5 * 1024 * 1024, "A_1_5mo.pdf");
    assert.ok(pdf.size >= 1.4 * 1024 * 1024 && pdf.size < SAFE_UPLOAD_BYTES);
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    assert.equal(result.sent, true);
    assert.equal(result.log.blocked_before_upload, false);
    assert.ok(result.log.upload_final_bytes <= SAFE_UPLOAD_BYTES * 1.01);
    assert.equal(result.duplicateFileField, false);
    pass("PDF_1_5MO", `${pdf.size} → final=${result.log.upload_final_bytes}`);
  } catch (error) {
    fail("PDF_1_5MO", error.message);
  }

  // PDF 3,1 Mo : accepté
  try {
    const pdf = await makeTextPdf(3.1 * 1024 * 1024, "B_3_1mo.pdf");
    assert.ok(pdf.size >= 3.0 * 1024 * 1024 && pdf.size <= SAFE_UPLOAD_BYTES);
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    assert.equal(result.sent, true);
    assert.equal(result.log.blocked_before_upload, false);
    assert.equal(result.duplicateFileField, false);
    assert.ok(result.log.upload_final_bytes < 4.2 * 1024 * 1024);
    pass(
      "PDF_3_1MO",
      `size=${pdf.size} sent=${result.sent} final=${result.log.upload_final_bytes}`
    );
  } catch (error) {
    fail("PDF_3_1MO", error.message);
  }

  // PDF 3,9 Mo compressible (image-heavy) → compressé puis accepté
  try {
    const target = Math.floor(3.9 * 1024 * 1024);
    const pdf = await makeImageHeavyPdf(target, "C_3_9mo_scan.pdf");
    assert.ok(
      pdf.size >= 3.5 * 1024 * 1024 && pdf.size <= MAX_ANNOUNCED_FILE_BYTES,
      `size=${pdf.size}`
    );
    const beforeCalls = fetchSpy.calls;
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    assert.equal(result.duplicateFileField, false);
    assert.equal(result.sent, true, `doit être envoyé après compression (log=${JSON.stringify(result.log)})`);
    assert.equal(result.log.blocked_before_upload, false);
    assert.ok(
      result.working[0].size <= SAFE_UPLOAD_BYTES,
      `after=${result.working[0].size}`
    );
    assert.ok(result.working[0].size < pdf.size);
    assert.equal(fetchSpy.calls, beforeCalls + 1);
    pass(
      "PDF_3_9MO_COMPRESSIBLE",
      `${pdf.size} → ${result.working[0].size} final=${result.log.upload_final_bytes}`
    );
  } catch (error) {
    fail("PDF_3_9MO_COMPRESSIBLE", error.message);
  }

  // PDF 3,9 Mo non compressible (texte dense) → bloqué avant requête
  try {
    const pdf = await makeTextPdf(3.9 * 1024 * 1024, "D_3_9mo_text.pdf");
    assert.ok(pdf.size >= 3.5 * 1024 * 1024 && pdf.size <= MAX_ANNOUNCED_FILE_BYTES);
    const beforeCalls = fetchSpy.calls;
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    assert.equal(result.sent, false);
    assert.equal(result.log.blocked_before_upload, true);
    assert.equal(result.message, BLOCKED_UPLOAD_MESSAGE);
    assert.equal(fetchSpy.calls, beforeCalls);
    assert.equal(result.duplicateFileField, false);
    pass(
      "PDF_3_9MO_BLOCKED",
      `blocked final=${result.log.upload_final_bytes} calls=${fetchSpy.calls}`
    );
  } catch (error) {
    fail("PDF_3_9MO_BLOCKED", error.message);
  }

  // Aucun appel analyze si > limite (PDF texte non compressible)
  try {
    const before = fetchSpy.calls;
    const fat = await makeTextPdf(3.7 * 1024 * 1024, "fat_text.pdf");
    const result = await simulatePrepareAndMaybeFetch([fat], { fetchSpy });
    assert.equal(result.sent, false);
    assert.equal(result.log.blocked_before_upload, true);
    assert.equal(fetchSpy.calls, before);
    pass(
      "NO_ANALYZE_WHEN_OVER",
      `sent=${result.sent} blocked=${result.log.blocked_before_upload}`
    );
  } catch (error) {
    fail("NO_ANALYZE_WHEN_OVER", error.message);
  }

  // Double append absent + pas de FUNCTION_PAYLOAD_TOO_LARGE simulé
  try {
    const pdf = await makeTextPdf(2 * 1024 * 1024, "E_2mo.pdf");
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    assert.equal(result.duplicateFileField, false);
    // Avec un seul exemplaire, payload estimé << 4.5 Mo Vercel
    const wire = result.log.upload_final_bytes;
    assert.ok(wire < 4.4 * 1024 * 1024, `wire ${wire} trop proche limite Vercel`);
    pass("NO_PAYLOAD_TOO_LARGE", `wire=${wire} duplicate=${result.duplicateFileField}`);
  } catch (error) {
    fail("NO_PAYLOAD_TOO_LARGE", error.message);
  }

  // Logs structure
  try {
    const pdf = await makeTextPdf(1 * 1024 * 1024, "F_log.pdf");
    const result = await simulatePrepareAndMaybeFetch([pdf], { fetchSpy });
    for (const key of [
      "upload_original_bytes",
      "upload_final_bytes",
      "file_count",
      "transport",
      "blocked_before_upload"
    ]) {
      assert.ok(key in result.log, `missing ${key}`);
    }
    assert.equal(result.log.transport, "multipart");
    pass("LOG_SHAPE", JSON.stringify(result.log));
  } catch (error) {
    fail("LOG_SHAPE", error.message);
  }

  if (process.exitCode) {
    console.error("Upload payload tests FAILED");
    process.exit(1);
  }

  console.log("Upload payload tests PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
