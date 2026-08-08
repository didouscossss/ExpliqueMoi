/**
 * Contexte minimal envoyé au fournisseur IA V3.
 * Jamais le document brut lorsque le texte local est exploitable.
 * Signatures uniquement — aucun traitement métier.
 */

import type { LocalAnalysis } from "./LocalAnalysis.js";

export interface AIContext {
  /** Texte OCR / extraction nettoyé (ou extraits utiles). */
  text: string;
  localAnalysis: LocalAnalysis | null;
  /** Passages utiles uniquement — pas le document entier à chaque action. */
  excerpts?: string[];
  /** Métadonnées non personnelles (nb pages, etc.). */
  meta?: {
    pageCount?: number;
    hasOcr?: boolean;
    warnings?: string[];
  };
}
