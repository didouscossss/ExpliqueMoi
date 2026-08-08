/**
 * Contrats communs des source adapters (build-time).
 */

import type { OfficialDocumentCandidate } from "../../../../types/knowledge.js";

export interface SourceAdapterResult {
  sourceId: string;
  retrievedAt: string;
  candidates: OfficialDocumentCandidate[];
  notes?: string[];
}

export interface SourceAdapter {
  id: string;
  /** true si nécessite le réseau. */
  requiresNetwork: boolean;
  discover(): Promise<SourceAdapterResult> | SourceAdapterResult;
}
