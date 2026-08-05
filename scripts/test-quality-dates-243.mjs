#!/usr/bin/env node
/**
 * Tests A–L : qualité d’analyse + dates (v2.4.3)
 */
import assert from "assert";
import { determineAnalysisQuality } from "../lib/analysisQuality.js";
import {
  normalizeDateEntries,
  mergeDates,
  extractDatesFromTables,
  parseFlexibleDate
} from "../lib/dateNormalization.js";
import { mergeChunkAnalyses } from "../lib/pdfChunking.js";

const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id} — ${detail}`);
}

function pass(id, detail) {
  record(id, "PASS", detail);
}

function fail(id, detail) {
  record(id, "FAIL", detail);
}

// A — PDF simple parfaitement lisible → SUCCESS
{
  const q = determineAnalysisQuality({
    document_type: "Facture EDF",
    issuer: "EDF",
    plain_summary:
      "C’est une facture d’électricité demandant le paiement de 89,40 EUR avant le 20 août 2026.",
    request: "Régler la facture",
    actions: [{ action: "Payer 89,40 EUR", how: "Par prélèvement ou carte" }],
    dates: [{ raw: "20/08/2026", type: "deadline", label: "Date limite" }],
    amount: { value: "89,40 €", meaning: "Total TTC" },
    evidence: [{ quote: "Montant à payer 89,40 EUR", page: "1" }],
    confidence: 90,
    warnings: ["Une signature est difficile à lire."]
  }, { failedPages: [], warnings: ["Une signature est difficile à lire."] });

  if (q.status === "success") pass("A", `status=${q.status} conf=${q.confidence}`);
  else fail("A", JSON.stringify(q));
}

// B — petite note illisible → SUCCESS (pas faux partiel)
{
  const q = determineAnalysisQuality({
    document_type: "Courrier administratif",
    issuer: "CAF",
    plain_summary:
      "C’est un courrier de la CAF qui demande de transmettre un justificatif de domicile.",
    request: "Envoyer un justificatif de domicile",
    actions: [{ action: "Envoyer le justificatif", how: "Via le compte CAF" }],
    confidence: 82,
    warnings: ["Petite note de bas de page illisible."]
  }, { failedPages: [] });

  if (q.status === "success") pass("B", `status=${q.status}`);
  else fail("B", JSON.stringify(q));
}

// C — page blanche (failed page isolée mais contenu principal OK) → SUCCESS
{
  const q = determineAnalysisQuality({
    document_type: "Contrat",
    issuer: "Assureur",
    plain_summary:
      "C’est un contrat d’assurance habitation qui précise les garanties et la cotisation.",
    request: "Prendre connaissance du contrat",
    actions: [{ action: "Conserver le contrat", how: "Aucun paiement immédiat" }],
    confidence: 88
  }, { failedPages: [4], totalPages: 4 });

  // Une seule page échouée avec résumé OK → success (page secondaire)
  if (q.status === "success") pass("C", `status=${q.status}`);
  else fail("C", JSON.stringify(q));
}

// D — page importante illisible + demande absente → WARNING
{
  const q = determineAnalysisQuality({
    document_type: "Mise en demeure",
    issuer: "Huissier",
    plain_summary:
      "C’est une mise en demeure qui semble exiger un paiement, mais la page principale est illisible.",
    request: "Information non trouvée avec certitude",
    actions: [],
    confidence: 50
  }, { failedPages: [1, 2], totalPages: 2 });

  if (q.status === "warning") pass("D", `status=${q.status} reasons=${q.reasons.join(" | ")}`);
  else fail("D", JSON.stringify(q));
}

// E — aucun contenu → ERROR
{
  const q = determineAnalysisQuality({
    document_type: "Document non identifié",
    plain_summary: "Résumé indisponible.",
    request: "Information non trouvée avec certitude",
    actions: [],
    confidence: 10
  }, {});

  if (q.status === "error") pass("E", `status=${q.status}`);
  else fail("E", JSON.stringify(q));
}

// F — date limite paragraphe
{
  const dates = normalizeDateEntries([
    {
      raw: "15 septembre 2026",
      type: "deadline",
      label: "Date limite de réponse",
      page: 1,
      source: "paragraphe",
      context: "Vous devez répondre avant le 15 septembre 2026.",
      confidence: 96
    }
  ]);
  if (
    dates.length === 1 &&
    dates[0].type === "deadline" &&
    dates[0].normalized === "2026-09-15"
  ) {
    pass("F", JSON.stringify(dates[0]));
  } else fail("F", JSON.stringify(dates));
}

// G — date dans un tableau
{
  const fromTable = extractDatesFromTables([
    {
      title: "Échéancier",
      page: 2,
      columns: ["Échéance", "Montant"],
      rows: [["05/09/2026", "120,00 €"], ["05/10/2026", "120,00 €"]]
    }
  ]);
  if (
    fromTable.length >= 2 &&
    fromTable.every((d) => d.source === "tableau") &&
    fromTable[0].normalized === "2026-09-05"
  ) {
    pass("G", `count=${fromTable.length} first=${fromTable[0].normalized}`);
  } else fail("G", JSON.stringify(fromTable));
}

// H — plusieurs dates différentes conservées
{
  const merged = mergeDates([
    { raw: "01/08/2026", type: "document_date", label: "Date du courrier", page: 1 },
    { raw: "15/09/2026", type: "deadline", label: "Date limite", page: 1 },
    { raw: "20/09/2026", type: "appointment_date", label: "Rendez-vous", page: 2 }
  ]);
  if (merged.length === 3) pass("H", `count=${merged.length}`);
  else fail("H", JSON.stringify(merged));
}

// I — PDF long chunks : aucune date perdue
{
  const merged = mergeChunkAnalyses([
    {
      ok: true,
      processedPages: [1, 2],
      failedPages: [],
      analysis: {
        document_type: "Dossier",
        plain_summary: "C’est la première partie du dossier administratif complet.",
        request: "Compléter le dossier",
        actions: [{ action: "Fournir les pièces", how: "Par courrier" }],
        dates: [
          { raw: "01/07/2026", type: "document_date", label: "Date du courrier", page: 1 }
        ],
        confidence: 85,
        reading_quality: "full",
        tables: []
      }
    },
    {
      ok: true,
      processedPages: [3, 4],
      failedPages: [],
      analysis: {
        document_type: "Dossier",
        plain_summary: "C’est la suite du dossier avec l’échéancier de paiement.",
        request: "Respecter l’échéancier",
        actions: [{ action: "Payer chaque échéance", how: "Virement" }],
        dates: [
          { raw: "15/09/2026", type: "deadline", label: "Date limite", page: 3 }
        ],
        tables: [
          {
            title: "Échéances",
            page: "4",
            columns: ["Date", "Montant"],
            rows: [["05/10/2026", "50 €"]]
          }
        ],
        confidence: 80,
        reading_quality: "partial"
      }
    }
  ]);

  const dates = merged.analysis?.dates || [];
  const hasDoc = dates.some((d) => d.type === "document_date");
  const hasDeadline = dates.some((d) => d.type === "deadline");
  const hasTable = dates.some((d) => d.source === "tableau" || d.normalized === "2026-10-05");
  const qualityOk = merged.analysis?.quality?.status === "success";

  if (hasDoc && hasDeadline && hasTable && qualityOk) {
    pass(
      "I",
      `dates=${dates.length} quality=${merged.analysis.quality.status} rq=${merged.analysis.reading_quality}`
    );
  } else {
    fail(
      "I",
      JSON.stringify({
        dates,
        quality: merged.analysis?.quality,
        reading_quality: merged.analysis?.reading_quality
      }).slice(0, 500)
    );
  }
}

// J — date relative
{
  const dates = normalizeDateEntries([
    { raw: "dans un délai de 30 jours", label: "Délai de réponse" }
  ]);
  if (
    dates[0]?.relativeValue === 30 &&
    dates[0]?.relativeUnit === "days" &&
    dates[0]?.normalized == null &&
    dates[0]?.needsUserConfirmation
  ) {
    pass("J", JSON.stringify(dates[0]));
  } else fail("J", JSON.stringify(dates));
}

// K — même date, deux rôles
{
  const merged = mergeDates([
    { raw: "05/09/2026", type: "document_date", label: "Date du courrier", page: 1 },
    { raw: "05/09/2026", type: "start_date", label: "Date de début", page: 1 }
  ]);
  if (merged.length === 2) pass("K", `count=${merged.length}`);
  else fail("K", JSON.stringify(merged));
}

// L — document sans date → aucune inventée
{
  const dates = normalizeDateEntries([]);
  const parsed = parseFlexibleDate("");
  if (dates.length === 0 && parsed.normalized == null) {
    pass("L", "no invented dates");
  } else fail("L", JSON.stringify({ dates, parsed }));
}

const essential = ["A", "F", "G", "H", "I", "L"];
const failedEssential = essential.filter(
  (id) => results.find((r) => r.id === id)?.status !== "PASS"
);

console.log("\n=== SUMMARY ===");
for (const row of results) console.log(`${row.status}\t${row.id}\t${row.detail}`);

if (failedEssential.length) {
  console.error("Essential FAIL:", failedEssential.join(", "));
  process.exit(1);
}

console.log("Essential PASS:", essential.join(", "));
