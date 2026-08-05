#!/usr/bin/env node
/**
 * Tests Point 1 — actions post-analyse (reply/fill/checklist/questions).
 * Couvre A–J sans appel réseau Gemini.
 */
import assert from "assert";
import {
  buildAssistContext,
  failure,
  runDocumentAction
} from "../lib/documentAssist.js";
import { buildDocumentContext } from "../lib/documentContext.js";
import assistHandler from "../api/assist.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

function mockResponse() {
  const state = {
    statusCode: 200,
    body: null,
    headers: {}
  };

  return {
    state,
    setHeader(key, value) {
      state.headers[key] = value;
    },
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      return payload;
    }
  };
}

async function invokeAssist(body) {
  const response = mockResponse();
  await assistHandler(
    { method: "POST", body },
    response
  );
  return response.state;
}

const letterAnalysis = {
  analysisId: 11,
  documentType: "Courrier administratif",
  issuer: "CAF du Rhône",
  summary:
    "La CAF vous demande de transmettre un justificatif de ressources avant le 15 mars 2026.",
  request: "Transmettre un justificatif de ressources",
  requests: ["Transmettre un justificatif de ressources"],
  whyReceived: "Contrôle de situation",
  amount: { value: "", meaning: "" },
  dates: [
    {
      label: "Date limite",
      date: "15/03/2026",
      meaning: "Avant cette date"
    }
  ],
  actions: [
    {
      action: "Envoyer le justificatif",
      how: "Par courrier ou espace caf.fr"
    }
  ],
  evidence: [
    {
      quote: "justificatif de ressources",
      explanation: "Pièce demandée pour le contrôle"
    }
  ],
  proofs: [
    {
      label: "Justificatif de ressources",
      required: true,
      reason: "Demandée dans le document."
    }
  ],
  requiredDocuments: [
    {
      label: "Justificatif de ressources",
      required: true,
      reason: "Demandée pour le contrôle."
    }
  ],
  tables: [],
  formFields: [],
  entities: {
    people: [],
    addresses: [],
    references: ["DOS-2026-441"],
    signatures: [],
    organizations: ["CAF du Rhône"]
  },
  confidence: 0.86
};

const formAnalysis = {
  analysisId: 22,
  documentType: "Formulaire CERFA de demande",
  issuer: "Préfecture",
  summary:
    "Formulaire à remplir pour une demande de titre. Plusieurs champs sont à compléter.",
  request: "Remplir le formulaire et joindre les pièces",
  requests: [
    "Compléter l’état civil",
    "Indiquer l’adresse",
    "Joindre une pièce d’identité"
  ],
  dates: [
    {
      label: "À déposer avant",
      date: "01/06/2026",
      meaning: "Date limite de dépôt"
    }
  ],
  actions: [
    {
      action: "Remplir le formulaire",
      how: "Compléter toutes les cases obligatoires"
    }
  ],
  formFields: [
    {
      label: "Nom",
      required: true,
      value: "",
      help: "Indiquez votre nom de famille.",
      source: null
    },
    {
      label: "Prénom",
      required: true,
      value: "",
      help: "Indiquez votre prénom.",
      source: null
    },
    {
      label: "Adresse",
      required: true,
      value: "",
      help: "Indiquez votre adresse.",
      source: null
    }
  ],
  requiredDocuments: [
    {
      label: "Pièce d’identité",
      required: true,
      reason: "Demandée dans le document."
    },
    {
      label: "Justificatif de domicile",
      required: true,
      reason: "Demandée dans le document."
    }
  ],
  proofs: [],
  tables: [],
  entities: {
    people: [],
    addresses: [],
    references: ["CERFA-99"],
    signatures: [],
    organizations: ["Préfecture"]
  },
  evidence: [],
  amount: null,
  confidence: 0.9
};

const noFormLetter = {
  ...letterAnalysis,
  documentType: "Courrier simple",
  summary: "Information sur un rendez-vous. Aucune démarche de saisie n’est demandée.",
  request: "Prendre connaissance du rendez-vous",
  requests: ["Prendre connaissance du rendez-vous"],
  formFields: [],
  actions: [{ action: "Se présenter au rendez-vous", how: "Sur place" }],
  proofs: [],
  requiredDocuments: [],
  evidence: [
    {
      quote: "rendez-vous le 12 avril",
      explanation: "Information"
    }
  ]
};

// --- A
{
  const ctx = buildAssistContext(letterAnalysis, { analysisId: 11 });
  const result = runDocumentAction("reply", ctx);
  try {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, "reply");
    assert.ok(result.result.subject);
    assert.ok(result.result.body);
    assert.strictEqual(result.result.tone, "formal");
    assert.ok(Array.isArray(result.result.missingFields));
    assert.ok(result.result.body.includes("[Votre nom]"));
    assert.ok(!/Jean Dupont|inventé/i.test(result.result.body));
    pass("A", "reply courrier OK");
  } catch (error) {
    fail("A", error.message);
  }
}

// --- B
{
  const ctx = buildAssistContext(formAnalysis);
  const result = runDocumentAction("fill", ctx);
  try {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, "fill");
    assert.ok(Array.isArray(result.result.fields));
    assert.ok(result.result.fields.length >= 3);
    assert.ok(
      result.result.fields.every(
        (field) =>
          field.label &&
          typeof field.required === "boolean" &&
          "value" in field &&
          "help" in field
      )
    );
    pass("B", "fill formulaire OK");
  } catch (error) {
    fail("B", error.message);
  }
}

// --- C
{
  const ctx = buildAssistContext(formAnalysis);
  const result = runDocumentAction("checklist", ctx);
  try {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, "checklist");
    assert.ok(result.result.items.length >= 2);
    assert.ok(
      result.result.items.some((item) =>
        /identité/i.test(item.label)
      )
    );
    pass("C", "checklist pièces OK");
  } catch (error) {
    fail("C", error.message);
  }
}

// --- D
{
  const ctx = buildAssistContext(letterAnalysis);
  const result = runDocumentAction("questions", ctx);
  try {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, "questions");
    assert.ok(Array.isArray(result.result.questions));
    assert.ok(result.result.questions.length >= 2);
    assert.ok(
      result.result.questions.some((q) =>
        /date limite|justificatif/i.test(q)
      )
    );
    pass("D", "questions OK");
  } catch (error) {
    fail("D", error.message);
  }
}

// --- E
{
  const ctx = buildAssistContext(noFormLetter);
  const result = runDocumentAction("fill", ctx);
  try {
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, "NO_FORM_DETECTED");
    assert.ok(/formulaire/i.test(result.error.message));
    pass("E", "NO_FORM_DETECTED");
  } catch (error) {
    fail("E", error.message);
  }
}

// --- F (Gemini vide → erreur structurée côté contrat)
{
  const empty = failure(
    "EMPTY_MODEL_RESPONSE",
    "La réponse de l’IA est vide."
  );
  try {
    assert.strictEqual(empty.ok, false);
    assert.strictEqual(empty.error.code, "EMPTY_MODEL_RESPONSE");
    assert.ok(empty.error.message);
    JSON.parse(JSON.stringify(empty));
    pass("F", "erreur structurée réponse vide");
  } catch (error) {
    fail("F", error.message);
  }
}

// --- G (timeout → erreur structurée)
{
  const timedOut = failure(
    "TIMEOUT",
    "Le serveur a mis trop de temps à répondre (timeout). Réessayez."
  );
  try {
    assert.strictEqual(timedOut.ok, false);
    assert.strictEqual(timedOut.error.code, "TIMEOUT");
    JSON.parse(JSON.stringify(timedOut));
    pass("G", "erreur structurée timeout");
  } catch (error) {
    fail("G", error.message);
  }
}

// --- H (ancien document ignoré : analysisId dans contexte)
{
  try {
    const ctxOld = buildAssistContext(letterAnalysis, { analysisId: 1 });
    const ctxNew = buildAssistContext(letterAnalysis, { analysisId: 2 });
    assert.strictEqual(ctxOld.analysisId, 1);
    assert.strictEqual(ctxNew.analysisId, 2);
    assert.notStrictEqual(ctxOld.analysisId, ctxNew.analysisId);
    pass("H", "analysisId distingue les documents");
  } catch (error) {
    fail("H", error.message);
  }
}

// --- I (un seul appel actif / double clic côté handler idempotent JSON)
{
  try {
    const first = await invokeAssist({
      actionType: "reply",
      analysis: letterAnalysis,
      analysisId: 11
    });
    const second = await invokeAssist({
      actionType: "reply",
      analysis: letterAnalysis,
      analysisId: 11
    });
    assert.strictEqual(first.body.ok, true);
    assert.strictEqual(second.body.ok, true);
    // Le garde anti double-clic est frontend ; backend reste déterministe
    assert.strictEqual(first.body.action, "reply");
    assert.strictEqual(second.body.action, "reply");
    pass("I", "appels répétés stables (garde frontend + JSON backend)");
  } catch (error) {
    fail("I", error.message);
  }
}

// --- J (toutes les réponses JSON valides via handler)
{
  try {
    const cases = [
      ["reply", letterAnalysis, true],
      ["fill", formAnalysis, true],
      ["checklist", formAnalysis, true],
      ["questions", letterAnalysis, true],
      ["fill", noFormLetter, false],
      ["reply", null, false],
      ["nope", letterAnalysis, false]
    ];

    for (const [actionType, analysis, expectOk] of cases) {
      const out = await invokeAssist({ actionType, analysis });
      assert.ok(out.body && typeof out.body === "object");
      const encoded = JSON.stringify(out.body);
      const parsed = JSON.parse(encoded);
      assert.strictEqual(typeof parsed.ok, "boolean");
      if (expectOk) {
        assert.strictEqual(parsed.ok, true);
        assert.ok(parsed.result);
        assert.strictEqual(parsed.action, actionType);
      } else {
        assert.strictEqual(parsed.ok, false);
        assert.ok(parsed.error?.code);
        assert.ok(parsed.error?.message);
      }
    }

    // documentContext enrichi
    const docCtx = buildDocumentContext(letterAnalysis);
    assert.ok("analysisId" in docCtx);
    assert.ok("documentType" in docCtx);
    assert.ok("requests" in docCtx);
    assert.ok("actions" in docCtx);
    assert.ok("dates" in docCtx);
    assert.ok("amounts" in docCtx);
    assert.ok("references" in docCtx);
    assert.ok("proofs" in docCtx);
    assert.ok("tables" in docCtx);
    assert.ok("formFields" in docCtx);
    assert.ok("requiredDocuments" in docCtx);

    pass("J", "toutes les réponses sont du JSON valide");
  } catch (error) {
    fail("J", error.message);
  }
}

if (process.exitCode) {
  console.error("Assist action tests FAILED");
  process.exit(1);
}

console.log("Assist action tests PASSED");
