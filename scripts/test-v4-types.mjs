/**
 * Tests V4-A — socle de types + DocumentSession.
 * Aucun LLM, aucun réseau, aucun branchement UI.
 * Usage: npm run test:v4-types
 */

import assert from "node:assert/strict";
import {
  DocumentSession,
  DOCUMENT_TYPE_IDS,
  toConfidence,
  clamp01,
  isHighConfidence,
  isDisplayableConfidence,
  CONFIDENCE_THRESHOLDS
} from "../lib/v4/index.ts";

function section(title) {
  console.log(`\n▸ ${title}`);
}

function testConfidence() {
  section("Confidence");
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(-2), 0);
  assert.equal(toConfidence(0.97).level, "high");
  assert.equal(toConfidence(0.7).level, "medium");
  assert.equal(toConfidence(0.2).level, "low");
  assert.ok(isHighConfidence(toConfidence(0.9)));
  assert.ok(isDisplayableConfidence(toConfidence(0.6)));
  assert.equal(isDisplayableConfidence(toConfidence(0.1)), false);
  assert.ok(CONFIDENCE_THRESHOLDS.high > CONFIDENCE_THRESHOLDS.medium);
  console.log("  OK high/medium/low");
}

function testMoneyCandidateHasHypothesesNotFinalRole() {
  section("MoneyCandidate = hypotheses, pas de rôle définitif");
  /** @type {import("../lib/v4/index.ts").MoneyCandidate} */
  const money = {
    id: "m1",
    type: "money",
    value: 25.99,
    raw: "25,99 €",
    hypotheses: [
      {
        role: "amountTTC",
        score: 0.72,
        reasons: [{ signal: "sameLineLabel:TTC", delta: 0.55 }]
      },
      {
        role: "offerPrice",
        score: 0.41,
        reasons: [{ signal: "sameLineLabel:offer", delta: 0.35 }]
      }
    ],
    evidence: [{ text: "Total TTC 25,99 €", page: 1 }],
    page: 1
  };
  assert.equal(money.type, "money");
  assert.equal(money.value, 25.99);
  assert.equal(money.hypotheses.length, 2);
  assert.ok(!("role" in money), "pas de rôle unique prématuré sur le candidat");
  assert.ok(money.hypotheses.every((h) => h.score >= 0 && h.score <= 1));
  assert.ok(Array.isArray(money.hypotheses[0].reasons));
  console.log("  OK", money.hypotheses.map((h) => h.role).join(", "));
}

function testReferenceNotPerson() {
  section("N° client → ReferenceCandidate, pas Person");
  /** @type {import("../lib/v4/index.ts").ReferenceCandidate} */
  const ref = {
    id: "r1",
    type: "reference",
    value: "2009682949",
    raw: "N° client : 2009682949",
    hypotheses: [
      {
        role: "clientNumber",
        score: 0.8,
        reasons: [{ signal: "sameLineLabel:clientNumber", delta: 0.5 }]
      },
      {
        role: "accountIdentifier",
        score: 0.2,
        reasons: [{ signal: "base:reference", delta: 0.2 }]
      }
    ],
    evidence: [{ text: "N° client : 2009682949", page: 1 }],
    page: 1
  };
  assert.equal(ref.type, "reference");
  assert.notEqual(ref.type, "person");
  console.log("  OK type=reference");
}

function testClassificationMultiScores() {
  section("DocumentClassification multi-scores");
  assert.ok(DOCUMENT_TYPE_IDS.includes("invoice"));
  assert.ok(DOCUMENT_TYPE_IDS.includes("bankStatement"));
  assert.ok(DOCUMENT_TYPE_IDS.includes("unknown"));
  /** @type {import("../lib/v4/index.ts").DocumentClassification} */
  const classification = {
    scores: {
      invoice: 0.91,
      bankStatement: 0.12,
      taxNotice: 0.05
    },
    primary: "invoice",
    confidence: toConfidence(0.91),
    signals: {
      strong: ["facture", "total ttc"],
      secondary: ["iban"],
      negative: ["relevé de compte"]
    }
  };
  assert.equal(classification.primary, "invoice");
  assert.ok(
    (classification.scores.invoice || 0) >
      (classification.scores.bankStatement || 0)
  );
  assert.ok((classification.scores.bankStatement || 0) < 0.5);
  console.log("  OK", classification.scores);
}

function testDocumentProfileInterface() {
  section("DocumentProfile interface (stub)");
  /** @type {import("../lib/v4/index.ts").DocumentProfile} */
  const stub = {
    id: "invoice",
    supports(classification) {
      return (classification.scores.invoice || 0) >= 0.5;
    },
    analyze() {
      return { fields: [], relations: [], warnings: [] };
    },
    validate(result) {
      return result;
    }
  };
  const session = DocumentSession.create();
  const classification = {
    scores: { invoice: 0.91 },
    primary: /** @type {const} */ ("invoice"),
    confidence: toConfidence(0.91)
  };
  assert.equal(stub.supports(classification, session), true);
  const analyzed = stub.analyze({
    session,
    classification,
    candidates: [],
    blocks: []
  });
  assert.deepEqual(analyzed.fields, []);
  session.destroy();
  console.log("  OK supports/analyze/validate");
}

function testDocumentSessionLifecycle() {
  section("DocumentSession create → use → destroy");
  const session = DocumentSession.create({
    rawText: "Facture Total TTC 25,99 €",
    blocks: [
      {
        id: "b1",
        text: "Facture",
        page: 1,
        source: "text",
        bbox: { x: 0, y: 0, width: 100, height: 12 }
      }
    ]
  });
  assert.ok(session.id.startsWith("v4sess_"));
  assert.equal(session.isDestroyed, false);
  assert.match(session.rawText || "", /Facture/);
  assert.equal(session.blocks.length, 1);

  session.addCandidates([
    {
      id: "m1",
      type: "money",
      value: 25.99,
      hypotheses: [
        {
          role: "amountTTC",
          score: 0.72,
          reasons: [{ signal: "sameLineLabel:TTC", delta: 0.55 }]
        }
      ],
      evidence: [{ text: "Total TTC 25,99 €", page: 1 }],
      page: 1
    }
  ]);
  assert.equal(session.candidates.length, 1);

  session.setClassification({
    scores: { invoice: 0.9 },
    primary: "invoice",
    confidence: toConfidence(0.9)
  });
  assert.equal(session.classification?.primary, "invoice");

  session.setRelations([
    {
      id: "rel1",
      sourceCandidateId: "ht1",
      targetCandidateId: "ttc1",
      type: "arithmetic",
      score: 0.9,
      reasons: [{ signal: "arithmetic:HT+TVA≈TTC", delta: 0.55 }],
      evidence: [],
      via: ["vat1"],
      label: "HT + TVA ≈ TTC"
    }
  ]);
  assert.equal(session.relations.length, 1);

  session.destroy();
  assert.equal(session.isDestroyed, true);
  assert.throws(() => session.rawText, /destroyed/i);
  assert.throws(() => session.blocks, /destroyed/i);
  assert.throws(() => session.candidates, /destroyed/i);
  assert.throws(() => session.setRawText("leak"), /destroyed/i);
  session.destroy();
  console.log("  OK destroy efface et bloque l’accès");
}

function testFieldEvidenceShape() {
  section("FieldEvidence evidence-first");
  /** @type {import("../lib/v4/index.ts").FieldEvidence<number>} */
  const field = {
    field: "invoiceTotal",
    value: 25.99,
    confidence: toConfidence(0.96),
    evidence: [
      {
        text: "Total TTC 25,99 €",
        page: 1,
        bbox: { x: 10, y: 200, width: 120, height: 14 }
      }
    ],
    candidateIds: ["m1"]
  };
  assert.equal(field.confidence.level, "high");
  assert.equal(field.evidence[0].text.includes("25,99"), true);
  console.log("  OK");
}

console.log("=== test-v4-types (V4-A) ===");
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("fetch interdit en V4-A");
};
try {
  testConfidence();
  testMoneyCandidateHasHypothesesNotFinalRole();
  testReferenceNotPerson();
  testClassificationMultiScores();
  testDocumentProfileInterface();
  testDocumentSessionLifecycle();
  testFieldEvidenceShape();
  assert.equal(fetchCalls, 0, "aucun fetch pendant les tests V4-A");
  console.log("\n✓ V4-A types OK — 0 appel réseau");
} catch (err) {
  console.error("\n✗ Échec V4-A:", err);
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
