/**
 * Evidence-first : toute donnée finale doit pointer vers des passages sources.
 * Ne jamais inventer une preuve.
 */

import type { BoundingBox } from "./geometry.js";
import type { Confidence } from "./confidence.js";

/** Passage source brut (extrait du document, non synthétisé). */
export interface EvidenceSpan {
  text: string;
  page: number;
  bbox?: BoundingBox | null;
  /** Référence vers un TextBlock.id si connu. */
  blockId?: string | null;
  /** Identifiant de ligne / bloc layout si disponible. */
  lineId?: string | null;
}

/**
 * Valeur finale liée à un champ, avec confiance et preuves.
 * Les passages importants UI doivent provenir de `evidence`.
 */
export interface FieldEvidence<T = unknown> {
  field: string;
  value: T;
  confidence: Confidence;
  evidence: EvidenceSpan[];
  /** Candidats entités ayant contribué (ids). */
  candidateIds?: string[];
}
