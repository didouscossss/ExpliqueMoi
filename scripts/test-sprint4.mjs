#!/usr/bin/env node
import assert from "assert";
import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  planPdfChunks,
  mergeChunkAnalyses,
  MAX_DOCUMENT_SIZE,
  buildTooLargeMessage,
  formatBytesFr
} from "../lib/pdfChunking.js";
import { inspectPdf } from "../lib/pdfProcessing.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

const cases = [
  {
    id: "S4-no-page-limit-plan-11",
    run() {
      const plan = planPdfChunks({
        pageCount: 11,
        fileSize: 800_000,
        textLength: 11 * 400,
        scanned: false,
        pageTexts: Array.from({ length: 11 }, (_, i) => ({
          pageNumber: i + 1,
          text: `Page ${i + 1} contenu facture`
        }))
      });
      assert.equal(plan.mode, "chunked");
      assert.ok(plan.chunkCount >= 2);
      assert.equal(
        plan.chunks[plan.chunks.length - 1].endPage,
        11
      );
    }
  },
  {
    id: "S4-no-page-limit-plan-25",
    run() {
      const plan = planPdfChunks({
        pageCount: 25,
        fileSize: 1_200_000,
        textLength: 25 * 350,
        scanned: false,
        pageTexts: Array.from({ length: 25 }, (_, i) => ({
          pageNumber: i + 1,
          text: `Page ${i + 1}`
        }))
      });
      assert.equal(plan.mode, "chunked");
      assert.ok(plan.chunkCount >= 3);
      const covered = plan.chunks.flatMap((c) => c.pageNumbers);
      assert.equal(covered.length, 25);
      assert.equal(covered[0], 1);
      assert.equal(covered.at(-1), 25);
    }
  },
  {
    id: "S4-merge-chunks",
    run() {
      const merged = mergeChunkAnalyses([
        {
          ok: true,
          processedPages: [1, 2, 3],
          failedPages: [],
          analysis: {
            document_type: "Facture",
            issuer: "EDF",
            plain_summary: "C'est une facture page 1 à 3.",
            request: "Payer",
            why_received: "Consommation",
            actions: [{ action: "Payer", how: "En ligne" }],
            dates: [{ date: "30/09/2026", label: "date limite", meaning: "paiement" }],
            amount: { value: "100 €", meaning: "TTC" },
            tables: [
              {
                title: "Montants",
                columns: ["L", "M"],
                rows: [["HT", "80"]],
                page: "Page 1",
                confidence: 80,
                totals: {}
              }
            ],
            evidence: [{ page: "Page 1", quote: "100 €", explanation: "total" }],
            confidence: 80,
            reading_quality: "full",
            warnings: []
          }
        },
        {
          ok: true,
          processedPages: [4, 5],
          failedPages: [6],
          analysis: {
            document_type: "Facture",
            issuer: "EDF",
            plain_summary: "Suite échéancier pages 4-5.",
            request: "Payer",
            why_received: "Consommation",
            actions: [{ action: "Conserver le reçu", how: "PDF" }],
            dates: [{ date: "01/10/2026", label: "prélèvement", meaning: "auto" }],
            amount: { value: "100 €", meaning: "TTC" },
            tables: [
              {
                title: "Montants",
                columns: ["L", "M"],
                rows: [["TVA", "20"]],
                page: "Page 4",
                confidence: 75,
                totals: { "Total TTC": "100 €" }
              }
            ],
            form_fields: [
              {
                id: "field_1",
                label: "Nom",
                type: "text",
                required: true,
                page: 5,
                help: "Nom"
              }
            ],
            required_documents: [
              { id: "d1", label: "RIB", reason: "demandé", required: true }
            ],
            evidence: [{ page: "Page 4", quote: "échéancier", explanation: "suite" }],
            confidence: 70,
            reading_quality: "partial",
            warnings: []
          }
        }
      ]);

      assert.equal(merged.ok, true);
      assert.ok(merged.analysis.actions.length >= 2);
      assert.ok(merged.analysis.dates.length >= 2);
      assert.equal(merged.failedPages.includes(6), true);
      assert.ok(
        merged.warnings.some((w) => /page 6|pages 6/i.test(w))
      );
      assert.ok(merged.analysis.tables[0].rows.length >= 2);
      assert.ok(merged.analysis.form_fields.length >= 1);
      assert.ok(merged.analysis.required_documents.length >= 1);
    }
  },
  {
    id: "S4-size-limit-message",
    run() {
      const msg = buildTooLargeMessage(4.1 * 1024 * 1024);
      assert.match(msg, /4 Mo/);
      assert.match(msg, /4,1 Mo|4.1/);
      assert.equal(MAX_DOCUMENT_SIZE, 4 * 1024 * 1024);
      assert.ok(formatBytesFr(MAX_DOCUMENT_SIZE).includes("4"));
    }
  }
];

for (const test of cases) {
  try {
    test.run();
    pass(test.id);
  } catch (error) {
    fail(test.id, error.message);
  }
}

// Fixture-based inspect if available
const fixtures = [
  ["A_1page", "/tmp/pdf-fixtures/A_text_simple.pdf"],
  ["B_11pages", "/tmp/pdf-fixtures/S4_11_pages.pdf"],
  ["C_25pages", "/tmp/pdf-fixtures/S4_25_pages.pdf"],
  ["F_3_9mb", "/tmp/pdf-fixtures/S4_3_9mb.pdf"],
  ["G_4_1mb", "/tmp/pdf-fixtures/S4_4_1mb.pdf"]
];

for (const [id, file] of fixtures) {
  try {
    if (!existsSync(file)) {
      fail(`S4-fixture-${id}`, `missing ${file}`);
      continue;
    }

    const bytes = readFileSync(file);
    const size = bytes.length;

    if (id === "G_4_1mb") {
      assert.ok(size > MAX_DOCUMENT_SIZE, `expected >4Mo got ${size}`);
      pass(`S4-fixture-${id}`, `size=${size} rejected_by_size_rule`);
      continue;
    }

    assert.ok(size <= MAX_DOCUMENT_SIZE, `size ${size} exceeds 4Mo`);
    const meta = await inspectPdf(bytes);
    assert.equal(meta.ok, true, meta.message || meta.code);
    if (id === "B_11pages") assert.ok(meta.pageCount >= 11);
    if (id === "C_25pages") assert.ok(meta.pageCount >= 25);
    pass(`S4-fixture-${id}`, `pages=${meta.pageCount} size=${size}`);
  } catch (error) {
    fail(`S4-fixture-${id}`, error.message);
  }
}

console.log(
  JSON.stringify({
    summary: process.exitCode ? "FAIL" : "PASS",
    app_version_target: "2.4.0"
  })
);
