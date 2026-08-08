/**
 * Relations entre entités / champs.
 * Ex. HT → vatRate → TTC ; sender → recipient ; action → deadline.
 * Participent au score final des hypothèses.
 */

import type { EvidenceSpan } from "./evidence.js";

export type RelationKind =
  | "ht_vat_ttc"
  | "ht_rate_ttc"
  | "sender_recipient"
  | "documentDate_deadline"
  | "reference_organization"
  | "action_deadline"
  | "table_totals"
  | "party_party"
  | "other";

export interface Relation {
  id: string;
  kind: RelationKind | string;
  /** Id de candidat / champ source. */
  from: string;
  /** Id de candidat / champ cible. */
  to: string;
  /** Ids intermédiaires (ex. vatRate entre HT et TTC). */
  via?: string[];
  /** Score de renforcement 0..100. */
  score?: number;
  evidence?: EvidenceSpan[];
  /** Libellé court pour debug. */
  label?: string;
}
