/**
 * Pipeline Didou A→F — 100 % local, 0 LLM.
 */

import { emptyDidouResult, DIDOU_ENGINE, DIDOU_VERSION } from "./types.js";
import { normalizeDocumentText } from "./normalize/text.js";
import { extractGenericSignals } from "./extract/index.js";
import { detectDocumentFamily } from "./detect/family.js";
import { interpretExtraction } from "./interpret/roles.js";
import { runFamilyAdapter } from "./adapters/index.js";
import { buildUserFacingExplanation } from "./explain/userSummary.js";

/**
 * @param {{ text?: string, pastedText?: string, pages?: Array<{page?: number, text?: string}>, fileName?: string|null }} input
 */
export function runDidouPipeline(input = {}) {
  // A — Normalisation
  const normalized = normalizeDocumentText(input);
  const text = normalized.text;

  if (!text || text.replace(/\s+/g, "").length < 12) {
    return emptyDidouResult({
      understandingLevel: "extraction",
      confidence: 5,
      warnings: [
        "Aucun texte exploitable n’a pu être extrait localement (PDF scanné sans couche texte ou image sans OCR)."
      ],
      uncertainties: [
        "Didou n’a pas pu lire le contenu. Ajoutez un PDF avec texte sélectionnable ou collez le texte."
      ],
      userSummary: {
        document_label: "Document illisible localement",
        one_sentence:
          "C’est un document dont le texte n’a pas pu être extrait localement.",
        important_points: []
      },
      attentionLevel: "uncertain"
    });
  }

  // C — Extraction générique
  const rawExtraction = extractGenericSignals(text);

  // B — Détection (multi-signaux)
  const detection = detectDocumentFamily({
    text,
    lines: normalized.lines,
    extraction: rawExtraction
  });

  // D — Interprétation des rôles
  const extraction = interpretExtraction(rawExtraction, {
    family: detection.family,
    documentType: detection.documentType
  });

  // E — Adaptateur famille
  const adapted = runFamilyAdapter({
    text,
    lines: normalized.lines,
    extraction,
    detection,
    fileName: input.fileName || null
  });

  // F — Explication utilisateur
  const userSummary = buildUserFacingExplanation(adapted);

  const references = extraction.entities.references || [];

  return {
    engine: DIDOU_ENGINE,
    version: DIDOU_VERSION,
    family: adapted.family || detection.family,
    documentType: adapted.documentType,
    understandingLevel: adapted.understandingLevel || detection.understandingLevel,
    confidence: adapted.confidence ?? detection.confidence,
    issuer: adapted.issuer || null,
    recipient: adapted.recipient || null,
    mainDate: adapted.mainDate || null,
    mainAmount: adapted.mainAmount || null,
    importantFacts: adapted.importantFacts || [],
    actions: adapted.actions || [],
    deadlines: adapted.deadlines || [],
    references,
    entities: {
      people: extraction.entities.people || [],
      organizations: extraction.entities.organizations || [],
      addresses: extraction.entities.addresses || [],
      contacts: []
    },
    tables: adapted.tables || [],
    evidence: adapted.evidence || [],
    warnings: adapted.warnings || [],
    uncertainties: adapted.uncertainties || [],
    userSummary,
    whyReceived: adapted.whyReceived || null,
    documentPurpose: adapted.documentPurpose || null,
    attentionLevel: adapted.attentionLevel || "uncertain",
    extraction: {
      dates: extraction.dates,
      amounts: extraction.amounts,
      periods: extraction.periods,
      rawSignals: detection.signals || []
    },
    meta: {
      charCount: rawExtraction.charCount,
      fileName: input.fileName || null,
      pageCount: normalized.pages.length || (text ? 1 : 0)
    }
  };
}
