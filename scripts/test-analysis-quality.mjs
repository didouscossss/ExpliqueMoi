#!/usr/bin/env node
/**
 * Tests 2.3.4 — qualité de compréhension (enrichissement, contradictions, qualité).
 */
import assert from "assert";
import {
  enrichAnalysisResult,
  detectContradictions,
  deriveReadingQuality,
  normalizeDateType,
  normalizeAmountKind,
  inferRefType
} from "../lib/analysisEnrichment.js";
import { buildAnalysisPrompt } from "../lib/analysisPrompt.js";
import { ANALYSIS_SCHEMA } from "../lib/geminiAnalysis.js";

function pass(id, detail = "") {
  console.log(JSON.stringify({ id, result: "PASS", detail }));
}

function fail(id, detail) {
  console.log(JSON.stringify({ id, result: "FAIL", detail }));
  process.exitCode = 1;
}

function baseDoc(overrides = {}) {
  return {
    document_type: "Document test",
    issuer: "Organisme Test",
    plain_summary:
      "C’est un document de test administratif pour vérifier l’extraction.",
    request: "Transmettre un justificatif",
    why_received: "Contrôle de situation",
    urgency: { level: "soon", message: "Délai à respecter" },
    actions: [
      {
        action: "Envoyer le justificatif",
        how: "Via l’espace en ligne",
        page: "Page 1",
        context: "Demande principale",
        confidence: 90
      }
    ],
    dates: [],
    amounts: [],
    tables: [],
    references: [],
    persons: [],
    deadlines: [],
    requiredDocuments: [],
    risks: [],
    evidence: [
      {
        page: "Page 1",
        quote: "merci de transmettre",
        explanation: "Demande explicite"
      }
    ],
    confidence: 88,
    reading_quality: "full",
    warnings: [],
    ...overrides
  };
}

const fixtures = {
  CAF: baseDoc({
    document_type: "Courrier CAF — contrôle de ressources",
    issuer: "CAF du Rhône",
    plain_summary:
      "C’est un courrier de la CAF qui demande un justificatif de ressources avant le 15/03/2026.",
    dates: [
      {
        date: "01/03/2026",
        type: "letter_date",
        label: "Date du courrier",
        page: "Page 1",
        context: "En-tête",
        confidence: 90
      },
      {
        date: "15/03/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 1",
        context: "Avant le 15/03/2026",
        confidence: 95
      }
    ],
    deadlines: [
      {
        date: "15/03/2026",
        label: "Date limite",
        page: "Page 1",
        context: "Justificatif à transmettre",
        confidence: 95
      }
    ],
    amounts: [
      {
        value: "0 €",
        label: "Aucun montant à payer",
        kind: "other",
        page: "Page 1",
        context: "Contrôle sans paiement",
        confidence: 60
      }
    ],
    references: [
      {
        value: "DOS-CAF-44127",
        type: "caf",
        page: "Page 1",
        context: "Numéro allocataire / dossier",
        confidence: 92
      }
    ],
    persons: [
      {
        name: "CAF du Rhône",
        role: "sender",
        page: "Page 1",
        context: "Expéditeur",
        confidence: 95
      },
      {
        name: "Marie Dupont",
        role: "recipient",
        page: "Page 1",
        context: "Destinataire",
        confidence: 88
      }
    ],
    requiredDocuments: [
      {
        label: "Justificatif de ressources",
        required: true,
        reason: "Demandé pour le contrôle",
        page: "Page 1",
        context: "Pièces à joindre",
        confidence: 90
      }
    ],
    risks: [
      {
        label: "Suspension possible des droits",
        severity: "high",
        page: "Page 1",
        context: "Conséquences",
        confidence: 80
      }
    ]
  }),

  CPAM: baseDoc({
    document_type: "Relevé CPAM",
    issuer: "CPAM",
    plain_summary:
      "C’est un relevé de la CPAM indiquant un remboursement de soins.",
    amounts: [
      {
        value: "42,50 €",
        label: "Montant remboursé",
        kind: "refund",
        page: "Page 1",
        context: "Remboursement",
        confidence: 93
      }
    ],
    references: [
      {
        value: "1 85 03 75 123 456 78",
        type: "cpam",
        page: "Page 1",
        context: "Numéro de sécurité sociale",
        confidence: 85
      }
    ],
    dates: [
      {
        date: "10/02/2026",
        type: "issue_date",
        label: "Date d’émission",
        page: "Page 1",
        context: "Émis le",
        confidence: 88
      }
    ]
  }),

  Impots: baseDoc({
    document_type: "Avis d’impôt",
    issuer: "Direction générale des Finances publiques",
    plain_summary:
      "C’est un avis d’impôt indiquant un montant à payer avant échéance.",
    amounts: [
      {
        value: "812,00 €",
        label: "Montant à payer",
        kind: "to_pay",
        page: "Page 1",
        context: "Reste à payer",
        confidence: 95
      },
      {
        value: "812,00 €",
        label: "Impôt",
        kind: "tax",
        page: "Page 1",
        context: "Impôt sur le revenu",
        confidence: 90
      }
    ],
    dates: [
      {
        date: "15/05/2026",
        type: "due_date",
        label: "Échéance",
        page: "Page 1",
        context: "Date limite de paiement",
        confidence: 94
      }
    ],
    references: [
      {
        value: "19 1234567890",
        type: "tax_id",
        page: "Page 1",
        context: "Numéro fiscal",
        confidence: 90
      }
    ]
  }),

  Banque: baseDoc({
    document_type: "Relevé bancaire",
    issuer: "Banque Populaire",
    plain_summary:
      "C’est un relevé bancaire avec IBAN et opérations.",
    references: [
      {
        value: "FR76 3000 6000 0112 3456 7890 189",
        type: "iban",
        page: "Page 1",
        context: "IBAN",
        confidence: 96
      },
      {
        value: "AGRIFRPP",
        type: "bic",
        page: "Page 1",
        context: "BIC",
        confidence: 90
      }
    ],
    tables: [
      {
        title: "Opérations",
        columns: ["Date", "Libellé", "Montant"],
        rows: [
          ["01/02/2026", "Salaire", "+2 100,00 €"],
          ["03/02/2026", "Prélèvement", "-45,00 €"]
        ],
        page: "Page 1",
        confidence: 85,
        totals: { Solde: "1 230,00 €" },
        kind: "table"
      }
    ],
    dates: [
      {
        date: "01/02/2026",
        type: "table_date",
        label: "Date opération",
        page: "Page 1",
        context: "Tableau opérations",
        confidence: 80
      }
    ],
    amounts: [
      {
        value: "2 100,00 €",
        label: "Salaire",
        kind: "salary",
        page: "Page 1",
        context: "Crédit salaire",
        confidence: 88
      }
    ]
  }),

  Assurance: baseDoc({
    document_type: "Attestation d’assurance",
    issuer: "MAIF",
    plain_summary:
      "C’est une attestation d’assurance habitation.",
    references: [
      {
        value: "CONTRAT-HAB-90877",
        type: "contract",
        page: "Page 1",
        context: "Numéro de contrat",
        confidence: 92
      }
    ],
    persons: [
      {
        name: "MAIF",
        role: "company",
        page: "Page 1",
        context: "Assureur",
        confidence: 95
      }
    ],
    dates: [
      {
        date: "01/01/2026",
        type: "period",
        label: "Période de validité",
        page: "Page 1",
        context: "Du 01/01/2026 au 31/12/2026",
        confidence: 90
      }
    ]
  }),

  Facture: baseDoc({
    document_type: "Facture EDF",
    issuer: "EDF",
    plain_summary:
      "C’est une facture EDF avec montants HT, TVA et TTC.",
    amounts: [
      {
        value: "100,00 €",
        label: "Montant HT",
        kind: "ht",
        page: "Page 1",
        context: "Base HT",
        confidence: 95
      },
      {
        value: "20,00 €",
        label: "TVA",
        kind: "vat",
        page: "Page 1",
        context: "TVA 20%",
        confidence: 95
      },
      {
        value: "120,00 €",
        label: "Montant TTC",
        kind: "ttc",
        page: "Page 1",
        context: "Total TTC",
        confidence: 95
      },
      {
        value: "120,00 €",
        label: "Montant à payer",
        kind: "to_pay",
        page: "Page 1",
        context: "Net à payer",
        confidence: 95
      }
    ],
    tables: [
      {
        title: "Détail facture",
        columns: ["Libellé", "Montant"],
        rows: [
          ["HT", "100,00 €"],
          ["TVA", "20,00 €"],
          ["TTC", "120,00 €"]
        ],
        page: "Page 1",
        confidence: 90,
        totals: { "Total TTC": "120,00 €" },
        kind: "invoice"
      }
    ],
    references: [
      {
        value: "FA-2026-8891",
        type: "invoice",
        page: "Page 1",
        context: "Référence facture",
        confidence: 90
      },
      {
        value: "55208131766528",
        type: "siret",
        page: "Page 1",
        context: "SIRET",
        confidence: 85
      }
    ],
    dates: [
      {
        date: "28/02/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 1",
        context: "À payer avant le",
        confidence: 92
      }
    ]
  }),

  Contrat: baseDoc({
    document_type: "Contrat de prestation",
    issuer: "Société Alpha",
    plain_summary:
      "C’est un contrat de prestation à signer.",
    references: [
      {
        value: "CTR-2026-12",
        type: "contract",
        page: "Page 1",
        context: "Numéro de contrat",
        confidence: 90
      }
    ],
    persons: [
      {
        name: "Société Alpha",
        role: "company",
        page: "Page 1",
        context: "Partie prestataire",
        confidence: 90
      },
      {
        name: "Jean Martin",
        role: "signatory",
        page: "Page 2",
        context: "Signataire",
        confidence: 80
      }
    ],
    dates: [
      {
        date: "01/04/2026",
        type: "issue_date",
        label: "Date d’émission",
        page: "Page 1",
        context: "Fait à Lyon le",
        confidence: 85
      }
    ]
  }),

  Amende: baseDoc({
    document_type: "Avis de contravention",
    issuer: "ANTAI",
    plain_summary:
      "C’est une amende à régler avec majoration possible.",
    amounts: [
      {
        value: "135 €",
        label: "Montant à payer",
        kind: "to_pay",
        page: "Page 1",
        context: "Amende forfaitaire",
        confidence: 95
      },
      {
        value: "375 €",
        label: "Pénalité / majoration",
        kind: "penalty",
        page: "Page 1",
        context: "Si paiement hors délai",
        confidence: 90
      }
    ],
    dates: [
      {
        date: "20/03/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 1",
        context: "Paiement minoré",
        confidence: 93
      }
    ],
    risks: [
      {
        label: "Majoration en cas de retard",
        severity: "high",
        page: "Page 1",
        context: "Conséquences",
        confidence: 90
      }
    ]
  }),

  BulletinSalaire: baseDoc({
    document_type: "Bulletin de salaire",
    issuer: "Entreprise Beta",
    plain_summary:
      "C’est un bulletin de salaire avec net à payer.",
    amounts: [
      {
        value: "2 150,40 €",
        label: "Salaire",
        kind: "salary",
        page: "Page 1",
        context: "Net à payer",
        confidence: 96
      }
    ],
    dates: [
      {
        date: "31/01/2026",
        type: "period",
        label: "Période",
        page: "Page 1",
        context: "Période de paie",
        confidence: 90
      }
    ],
    persons: [
      {
        name: "Entreprise Beta",
        role: "company",
        page: "Page 1",
        context: "Employeur",
        confidence: 90
      },
      {
        name: "Sophie Leroy",
        role: "recipient",
        page: "Page 1",
        context: "Salarié",
        confidence: 90
      }
    ],
    tables: [
      {
        title: "Éléments de paie",
        columns: ["Libellé", "Base", "Montant"],
        rows: [
          ["Salaire de base", "2000", "2000,00"],
          ["Net à payer", "", "2150,40"]
        ],
        page: "Page 1",
        confidence: 88,
        totals: { Net: "2 150,40 €" },
        kind: "table"
      }
    ]
  }),

  Tableau: baseDoc({
    document_type: "Échéancier de paiement",
    issuer: "Organisme de crédit",
    plain_summary:
      "C’est un échéancier présentant les dates et montants à payer.",
    tables: [
      {
        title: "Échéances",
        columns: ["Échéance", "Montant", "Référence"],
        rows: [
          ["01/04/2026", "210,00 €", "ECH-1"],
          ["01/05/2026", "210,00 €", "ECH-2"]
        ],
        page: "Page 1",
        confidence: 91,
        totals: { Total: "420,00 €" },
        kind: "schedule"
      }
    ],
    dates: [
      {
        date: "01/04/2026",
        type: "due_date",
        label: "Échéance",
        page: "Page 1",
        context: "Tableau échéances",
        confidence: 90
      },
      {
        date: "01/05/2026",
        type: "table_date",
        label: "Échéance",
        page: "Page 1",
        context: "Tableau échéances",
        confidence: 90
      }
    ],
    amounts: [
      {
        value: "210,00 €",
        label: "Montant à payer",
        kind: "to_pay",
        page: "Page 1",
        context: "Mensualité",
        confidence: 90
      },
      {
        value: "420,00 €",
        label: "Total",
        kind: "total",
        page: "Page 1",
        context: "Total échéancier",
        confidence: 88
      }
    ]
  }),

  Formulaire: baseDoc({
    document_type: "Formulaire CERFA de demande",
    issuer: "Préfecture",
    plain_summary:
      "C’est un formulaire à remplir pour une demande administrative.",
    request: "Compléter le formulaire et joindre les pièces",
    requiredDocuments: [
      {
        label: "Pièce d’identité",
        required: true,
        reason: "Obligatoire",
        page: "Page 1",
        context: "Liste des pièces",
        confidence: 90
      },
      {
        label: "Justificatif de domicile",
        required: true,
        reason: "Obligatoire",
        page: "Page 1",
        context: "Liste des pièces",
        confidence: 90
      }
    ],
    persons: [
      {
        name: "Préfecture",
        role: "administration",
        page: "Page 1",
        context: "Autorité destinataire",
        confidence: 90
      }
    ],
    dates: [
      {
        date: "30/06/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 1",
        context: "Dépôt avant le",
        confidence: 85
      }
    ]
  })
};

// --- Prompt ---
try {
  const prompt = buildAnalysisPrompt("", 2, false, "direct");
  assert.ok(/PRIORITÉ D’ANALYSE/i.test(prompt));
  assert.ok(/actions à effectuer/i.test(prompt));
  assert.ok(/deadlines/i.test(prompt));
  assert.ok(/requiredDocuments/i.test(prompt));
  assert.ok(/contradictions/i.test(prompt));
  assert.ok(/reading_quality = "full"/i.test(prompt));
  pass("PROMPT", "priorités conseiller administratif présentes");
} catch (error) {
  fail("PROMPT", error.message);
}

// --- Schema ---
try {
  const props = ANALYSIS_SCHEMA.properties;
  for (const key of [
    "dates",
    "amounts",
    "tables",
    "references",
    "persons",
    "deadlines",
    "requiredDocuments",
    "risks",
    "actions",
    "contradictions"
  ]) {
    assert.ok(props[key], `schema missing ${key}`);
  }
  pass("SCHEMA", "structure JSON enrichie présente");
} catch (error) {
  fail("SCHEMA", error.message);
}

// --- Helpers ---
try {
  assert.strictEqual(normalizeDateType("date limite"), "deadline");
  assert.strictEqual(normalizeAmountKind("Montant à payer"), "to_pay");
  assert.strictEqual(inferRefType("FR76 3000 6000 0112 3456 7890 189"), "iban");
  pass("HELPERS", "normalisation dates/montants/références");
} catch (error) {
  fail("HELPERS", error.message);
}

// --- Qualité : pas de faux partial ---
try {
  const enriched = enrichAnalysisResult(
    baseDoc({
      reading_quality: "full",
      confidence: 86,
      warnings: ["Détail secondaire à confirmer"]
    }),
    { extraWarnings: ["Détail secondaire à confirmer"] }
  );
  assert.strictEqual(enriched.reading_quality, "full");
  assert.ok(enriched.warnings.length >= 1);
  pass("QUALITY_FULL", "analyse complète reste full malgré warning soft");
} catch (error) {
  fail("QUALITY_FULL", error.message);
}

try {
  const q = deriveReadingQuality({
    declared: "partial",
    confidence: 80,
    summary:
      "C’est un avis clair avec actions, dates et montants bien identifiés.",
    actions: [{ action: "Payer" }],
    dates: [{ date: "01/01/2026" }],
    amounts: [{ value: "10 €" }],
    pageErrors: [],
    contradictions: []
  });
  assert.strictEqual(q, "full");
  pass("QUALITY_OVERRIDE", "partial déclaré corrigé si contenu complet");
} catch (error) {
  fail("QUALITY_OVERRIDE", error.message);
}

// --- Contradictions ---
try {
  const conflicts = detectContradictions({
    dates: [
      {
        date: "10/03/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 1",
        context: "A",
        confidence: 90
      },
      {
        date: "20/03/2026",
        type: "deadline",
        label: "Date limite",
        page: "Page 2",
        context: "B",
        confidence: 90
      }
    ],
    amounts: [
      {
        value: "100 €",
        kind: "to_pay",
        label: "Montant à payer",
        page: "Page 1",
        context: "",
        confidence: 90
      },
      {
        value: "150 €",
        kind: "to_pay",
        label: "Montant à payer",
        page: "Page 1",
        context: "",
        confidence: 90
      }
    ],
    deadlines: [],
    tables: [],
    source: {}
  });
  assert.ok(conflicts.some((item) => item.type === "deadline_conflict"));
  assert.ok(conflicts.some((item) => item.type === "amount_conflict"));
  pass("CONTRADICTIONS", "dates limites et montants incompatibles détectés");
} catch (error) {
  fail("CONTRADICTIONS", error.message);
}

try {
  const conflicts = detectContradictions({
    dates: [],
    amounts: [
      { value: "100 €", kind: "ht", label: "HT", page: "1", context: "", confidence: 90 },
      { value: "20 €", kind: "vat", label: "TVA", page: "1", context: "", confidence: 90 },
      { value: "150 €", kind: "ttc", label: "TTC", page: "1", context: "", confidence: 90 }
    ],
    deadlines: [],
    tables: [],
    source: {}
  });
  assert.ok(conflicts.some((item) => item.type === "totals_inconsistent"));
  pass("TOTALS", "HT+TVA≠TTC signalé");
} catch (error) {
  fail("TOTALS", error.message);
}

// --- Documents métier ---
for (const [name, fixture] of Object.entries(fixtures)) {
  try {
    const enriched = enrichAnalysisResult(fixture, {});
    assert.ok(enriched.plain_summary.startsWith("C’est") || enriched.plain_summary.startsWith("C'est"));
    assert.ok(Array.isArray(enriched.dates));
    assert.ok(Array.isArray(enriched.amounts));
    assert.ok(Array.isArray(enriched.tables));
    assert.ok(Array.isArray(enriched.references));
    assert.ok(Array.isArray(enriched.persons));
    assert.ok(Array.isArray(enriched.deadlines));
    assert.ok(Array.isArray(enriched.requiredDocuments));
    assert.ok(Array.isArray(enriched.risks));
    assert.ok(Array.isArray(enriched.actions));
    assert.strictEqual(enriched.reading_quality, "full");

    // Chaque objet enrichi a page/context/confidence quand source fournie
    for (const date of enriched.enriched_dates) {
      assert.ok(date.date);
      assert.ok(date.type);
      assert.ok("page" in date);
      assert.ok("context" in date);
      assert.ok("confidence" in date);
    }

    for (const amount of enriched.amounts) {
      assert.ok(amount.value);
      assert.ok(amount.label);
      assert.ok(amount.kind);
      assert.ok("page" in amount);
      assert.ok("context" in amount);
      assert.ok("confidence" in amount);
      // Pas de montant isolé sans contexte
      assert.ok(amount.label.length > 1);
    }

    // Compat frontend
    assert.ok(enriched.amount?.value);
    assert.ok(Array.isArray(enriched.amounts_detail));
    assert.ok(enriched.entities);

    pass(name, `${enriched.document_type} | dates=${enriched.enriched_dates.length} amounts=${enriched.amounts.length}`);
  } catch (error) {
    fail(name, error.message);
  }
}

// Montant contextualisé
try {
  const enriched = enrichAnalysisResult(fixtures.Facture);
  assert.ok(/payer|ttc/i.test(enriched.amount.meaning));
  assert.ok(
    enriched.amounts.some(
      (item) => item.kind === "to_pay" && /payer/i.test(item.label)
    )
  );
  pass("AMOUNT_CONTEXT", `principal=${enriched.amount.value} (${enriched.amount.meaning})`);
} catch (error) {
  fail("AMOUNT_CONTEXT", error.message);
}

if (process.exitCode) {
  console.error("Analysis quality tests FAILED");
  process.exit(1);
}

console.log("Analysis quality tests PASSED");
