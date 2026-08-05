#!/usr/bin/env node
/**
 * Sprint 3 tests — local document context + chat answering (no Gemini required for core cases).
 */
import assert from "assert";
import {
  normalizeTables,
  buildDocumentContext,
  tryAnswerLocally
} from "../lib/documentContext.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

const invoiceAnalysis = {
  documentType: "Facture EDF",
  issuer: "EDF",
  summary:
    "C'est une facture EDF de 128,50 € TTC à régler avant le 30 septembre 2026.",
  request: "Payer la facture",
  whyReceived: "Relevé de consommation de la période",
  amount: { value: "128,50 €", meaning: "Total TTC" },
  amountsDetail: [
    { label: "HT", value: "107,08 €", kind: "HT", page: "Page 1" },
    { label: "TVA", value: "21,42 €", kind: "TVA", page: "Page 1" },
    { label: "TTC", value: "128,50 €", kind: "TTC", page: "Page 1" }
  ],
  dates: [
    {
      date: "30/09/2026",
      label: "date limite",
      meaning: "Date limite de paiement"
    }
  ],
  timeline: [
    {
      date: "30/09/2026",
      label: "échéance",
      meaning: "Paiement attendu"
    }
  ],
  actions: [
    { action: "Payer 128,50 €", how: "Espace client EDF" }
  ],
  evidence: [
    {
      page: "Page 1",
      quote: "Montant TTC à payer : 128,50 €",
      explanation: "Montant dû"
    }
  ],
  tables: normalizeTables([
    {
      title: "Détail des montants",
      columns: ["Libellé", "Montant"],
      rows: [
        ["HT", "107,08 €"],
        ["TVA 20%", "21,42 €"],
        ["TTC", "128,50 €"]
      ],
      page: "Page 1",
      confidence: 90,
      totals: { "Total TTC": "128,50 €" },
      notes: "",
      kind: "invoice"
    },
    {
      title: "Échéancier",
      columns: ["Échéance", "Montant"],
      rows: [
        ["30/09/2026", "128,50 €"]
      ],
      page: "Page 1",
      confidence: 85,
      totals: {},
      kind: "schedule"
    }
  ]),
  entities: {
    people: ["Dupont"],
    addresses: ["12 rue de la Paix"],
    references: ["FAC-9988"],
    signatures: [],
    organizations: ["EDF"]
  },
  confidence: 88,
  readingQuality: "full"
};

const cases = [
  {
    id: "S3-tables-normalize",
    run() {
      assert.equal(invoiceAnalysis.tables.length, 2);
      assert.equal(invoiceAnalysis.tables[0].columns.length, 2);
      assert.equal(invoiceAnalysis.tables[0].totals["Total TTC"], "128,50 €");
    }
  },
  {
    id: "S3-context-enriched",
    run() {
      const ctx = buildDocumentContext(invoiceAnalysis);
      assert.ok(ctx.tables.length === 2);
      assert.ok(ctx.amounts_detail.length === 3);
      assert.ok(ctx.entities.organizations.includes("EDF"));
    }
  },
  {
    id: "S3-q-summary",
    run() {
      const a = tryAnswerLocally("Résume-moi ce document", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /facture EDF/i);
      assert.match(a.source, /résumé/i);
    }
  },
  {
    id: "S3-q-deadline",
    run() {
      const a = tryAnswerLocally("Quelle est la date limite ?", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /30\/09\/2026/);
    }
  },
  {
    id: "S3-q-amount",
    run() {
      const a = tryAnswerLocally("Quel montant dois-je payer ?", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /128,50/);
    }
  },
  {
    id: "S3-q-table-total",
    run() {
      const a = tryAnswerLocally("Quel est le total ?", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /128,50/);
      assert.match(a.source, /tableau/i);
    }
  },
  {
    id: "S3-q-explain-table",
    run() {
      const a = tryAnswerLocally("Explique ce tableau", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /Détail des montants|colonnes/i);
    }
  },
  {
    id: "S3-q-sender",
    run() {
      const a = tryAnswerLocally("Qui est l'expéditeur ?", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /EDF/);
    }
  },
  {
    id: "S3-q-actions",
    run() {
      const a = tryAnswerLocally("Que dois-je faire ?", invoiceAnalysis);
      assert.equal(a.found, true);
      assert.match(a.answer, /Payer/);
    }
  },
  {
    id: "S3-q-why",
    run() {
      const a = tryAnswerLocally(
        "Pourquoi ai-je reçu ce courrier ?",
        invoiceAnalysis
      );
      assert.equal(a.found, true);
      assert.match(a.answer, /consommation/i);
    }
  },
  {
    id: "S3-q-missing",
    run() {
      const a = tryAnswerLocally(
        "Quelle est la date limite ?",
        {
          ...invoiceAnalysis,
          dates: [],
          timeline: []
        }
      );
      assert.equal(a.found, false);
      assert.match(
        a.answer,
        /Je ne trouve pas cette information dans le document/
      );
    }
  },
  {
    id: "S3-new-document-isolation",
    run() {
      const a1 = tryAnswerLocally("Qui est l'expéditeur ?", invoiceAnalysis);
      const other = {
        ...invoiceAnalysis,
        issuer: "URSSAF",
        summary: "C'est un courrier URSSAF."
      };
      const a2 = tryAnswerLocally("Qui est l'expéditeur ?", other);
      assert.match(a1.answer, /EDF/);
      assert.match(a2.answer, /URSSAF/);
      assert.notEqual(a1.answer, a2.answer);
    }
  },
  {
    id: "S3-schedule-table",
    run() {
      const schedule = invoiceAnalysis.tables.find(
        (table) => table.kind === "schedule"
      );
      assert.ok(schedule);
      assert.equal(schedule.rows[0][0], "30/09/2026");
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

console.log(
  JSON.stringify({
    summary: process.exitCode ? "FAIL" : "PASS",
    app_version_target: "2.3.0"
  })
);
