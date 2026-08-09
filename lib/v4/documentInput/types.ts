/**
 * V4-Z — Contrat d’entrée documentaire local (avant OCR/vision).
 * La compréhension ne doit pas connaître le futur moteur d’extraction.
 * Aucune dépendance fr/tax/.
 */

/** Origine matérielle du document — pas la méthode d’extraction. */
export type DocumentSourceType = "text" | "image" | "pdf" | "unknown";

/**
 * État d’extraction du contenu textuel.
 * needsExtraction / unsupported : aucun texte inventé.
 */
export type DocumentExtractionStatus =
  | "ready"
  | "empty"
  | "needsExtraction"
  | "unsupportedInput";

/** Méthode ayant produit le texte (ou absence). Extensible pour OCR local futur. */
export type DocumentExtractionMethod =
  | "direct-text"
  | "none"
  | "local-ocr" // réservé — non implémenté en V4-Z
  | "local-pdf"; // réservé — non implémenté en V4-Z

/**
 * Page optionnelle — prépare page/zone futures sans les exiger.
 */
export interface DocumentInputPage {
  page: number;
  text?: string | null;
  /** Segments futurs (OCR) — non utilisés en V4-Z. */
  segments?: ReadonlyArray<{
    text: string;
    /** Zone approximative future — non requise. */
    bbox?: unknown;
  }> | null;
}

export interface DocumentExtractionInfo {
  status: DocumentExtractionStatus;
  method: DocumentExtractionMethod;
  /** Note déterministe pour diagnostics / UI. */
  note: string | null;
}

/**
 * Entrée normalisée vers la compréhension (V4-Y).
 * `text` est le SEUL contenu analysable — jamais le filename.
 */
export interface DocumentInput {
  id: string;
  sourceType: DocumentSourceType;
  /** Texte réellement fourni ; null si non disponible. */
  text: string | null;
  pages?: DocumentInputPage[] | null;
  filename?: string | null;
  mimeType?: string | null;
  extraction: DocumentExtractionInfo;
}

/**
 * Acquisition brute avant normalisation.
 * Pas de binaire / buffer ici — V4-Z ne lit pas les images.
 */
export interface RawDocumentAcquisition {
  id?: string | null;
  sourceType?: DocumentSourceType | null;
  text?: string | null;
  pages?: DocumentInputPage[] | null;
  filename?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface PreparedDocumentInput {
  status: DocumentExtractionStatus;
  input: DocumentInput;
  reason: string;
  /** true uniquement si un texte non vide est prêt pour V4-Y. */
  readyForAnalysis: boolean;
}

/** Compteurs d’entrée — inventions / abus filename. */
export interface DocumentInputSafetyInvariants {
  inventedImageText: number;
  inventedPdfText: number;
  filenameUsedAsContent: number;
  unsupportedPromotedToReady: number;
  emptyPromotedToFacts: number;
}
