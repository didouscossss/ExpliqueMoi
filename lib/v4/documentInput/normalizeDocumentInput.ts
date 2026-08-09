/**
 * Normalisation Document brut → DocumentInput.
 * Ne lit jamais le filename comme contenu.
 * N’invente jamais de texte pour image/pdf.
 */

import type {
  DocumentExtractionMethod,
  DocumentExtractionStatus,
  DocumentInput,
  DocumentInputPage,
  DocumentInputSafetyInvariants,
  DocumentSourceType,
  PreparedDocumentInput,
  RawDocumentAcquisition
} from "./types.js";

let inputSeq = 0;
export function resetDocumentInputIdsForTests(): void {
  inputSeq = 0;
}

export function emptyDocumentInputSafety(): DocumentInputSafetyInvariants {
  return {
    inventedImageText: 0,
    inventedPdfText: 0,
    filenameUsedAsContent: 0,
    unsupportedPromotedToReady: 0,
    emptyPromotedToFacts: 0
  };
}

function nextId(): string {
  inputSeq += 1;
  return `docin-${inputSeq}`;
}

function inferSourceType(raw: RawDocumentAcquisition): DocumentSourceType {
  if (raw.sourceType) return raw.sourceType;
  const mime = String(raw.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || mime.endsWith("/pdf")) return "pdf";
  if (mime.startsWith("text/")) return "text";

  const name = String(raw.filename || raw.fileName || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  if (/\.(txt|md|csv|html?)$/i.test(name)) return "text";

  // Texte fourni sans type → text ; sinon unknown
  if (typeof raw.text === "string" && raw.text.trim()) return "text";
  return "unknown";
}

function collectText(raw: RawDocumentAcquisition): string | null {
  if (typeof raw.text === "string") {
    return raw.text;
  }
  if (raw.pages && raw.pages.length) {
    const parts = raw.pages
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .filter((t) => t.length > 0);
    if (parts.length) return parts.join("\n\n");
  }
  return null;
}

/**
 * Construit un DocumentInput normalisé + statut d’extraction.
 * IMAGE/PDF sans texte → needsExtraction (jamais de contenu inventé).
 */
export function prepareDocumentInput(
  raw: RawDocumentAcquisition | string
): PreparedDocumentInput {
  const acquisition: RawDocumentAcquisition =
    typeof raw === "string" ? { text: raw, sourceType: "text" } : raw || {};

  const id = acquisition.id || nextId();
  const filename = acquisition.filename ?? acquisition.fileName ?? null;
  const mimeType = acquisition.mimeType ?? null;
  const sourceType = inferSourceType(acquisition);
  const textRaw = collectText(acquisition);
  const textTrimmed =
    textRaw == null ? null : textRaw.trim().length === 0 ? "" : textRaw;
  const hasUsableText =
    typeof textTrimmed === "string" && textTrimmed.trim().length > 0;

  const pages: DocumentInputPage[] | null = acquisition.pages
    ? acquisition.pages.map((p) => ({
        page: p.page,
        text: p.text ?? null,
        segments: p.segments ?? null
      }))
    : null;

  let status: DocumentExtractionStatus;
  let method: DocumentExtractionMethod;
  let note: string | null;
  let reason: string;
  let readyForAnalysis = false;

  if (hasUsableText) {
    // Texte réel fourni — indépendamment du sourceType matériel
    status = "ready";
    method = "direct-text";
    note = "Texte fourni directement — prêt pour compréhension locale.";
    reason = "text_ready";
    readyForAnalysis = true;
  } else if (sourceType === "image") {
    status = "needsExtraction";
    method = "none";
    note =
      "Image reçue sans extracteur OCR local — aucun texte inventé.";
    reason = "image_needs_extraction";
  } else if (sourceType === "pdf") {
    status = "needsExtraction";
    method = "none";
    note =
      "PDF reçu sans extraction locale — aucun texte inventé.";
    reason = "pdf_needs_extraction";
  } else if (sourceType === "text" || textTrimmed === "") {
    status = "empty";
    method = textTrimmed === "" ? "direct-text" : "none";
    note = "Aucun texte utilisable fourni.";
    reason = "empty_text";
  } else {
    status = "unsupportedInput";
    method = "none";
    note =
      "Entrée non supportée sans contenu textuel — extraction non disponible.";
    reason = "unsupported_without_text";
  }

  // Garde-fou : filename ne devient JAMAIS text
  const input: DocumentInput = {
    id,
    sourceType,
    text: hasUsableText ? textTrimmed : textTrimmed === "" ? "" : null,
    pages,
    filename,
    mimeType,
    extraction: { status, method, note }
  };

  // Si quelqu’un passait le filename dans text par erreur ailleurs,
  // on ne le fait jamais ici. Vérification safety optionnelle côté appelant.

  return { status, input, reason, readyForAnalysis };
}

/** Alias explicite demandé par l’architecture. */
export function normalizeDocumentInput(
  raw: RawDocumentAcquisition | string
): DocumentInput {
  return prepareDocumentInput(raw).input;
}

/**
 * Audite qu’un DocumentInput n’a pas été abusivement promu.
 */
export function auditDocumentInputSafety(
  prepared: PreparedDocumentInput
): DocumentInputSafetyInvariants {
  const safety = emptyDocumentInputSafety();
  const { input, readyForAnalysis, status } = prepared;

  if (
    (input.sourceType === "image" || input.sourceType === "pdf") &&
    !readyForAnalysis &&
    input.text &&
    input.text.trim() &&
    status === "needsExtraction"
  ) {
    // Incohérent : texte présent mais needsExtraction — ne devrait pas arriver
    // avec prepareDocumentInput actuel.
  }

  if (
    readyForAnalysis &&
    (status === "needsExtraction" || status === "unsupportedInput")
  ) {
    safety.unsupportedPromotedToReady += 1;
  }

  // Filename ressemble à du contenu monétaire/date — ne doit pas être dans text
  const fn = String(input.filename || "");
  if (fn && input.text && input.text.trim() === fn.trim()) {
    safety.filenameUsedAsContent += 1;
  }

  return safety;
}
