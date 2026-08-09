/**
 * Détection prudente doublons / versions — V4-R.
 * Ne supprime jamais silencieusement une version distincte.
 */

import type { DuplicateStatus } from "../../../../types/knowledge.js";
import { hashDocumentContent, textSimilarity } from "./hash.js";

export interface DuplicateAssessment {
  contentHash: string;
  duplicateStatus: DuplicateStatus;
  duplicateOf: string | null;
  isPrimaryCopy: boolean;
}

export interface DocumentSeed {
  documentId: string;
  text: string;
  fileName?: string | null;
  detectedReference?: string | null;
  detectedFields?: Array<{ normalizedCode: string; detectedValue: string | null }>;
}

/**
 * Évalue doublons après tri déterministe des seeds.
 * Même hash → possibleDuplicate (une seule copie primaire pour l’index faits).
 * Similarité haute + refs/fields proches mais hash différent → possibleVersion (conserver les deux).
 */
export function assessDuplicates(
  seeds: readonly DocumentSeed[]
): Map<string, DuplicateAssessment> {
  const out = new Map<string, DuplicateAssessment>();
  const byHash = new Map<string, string[]>();

  for (const s of seeds) {
    const h = hashDocumentContent(s.text);
    const list = byHash.get(h) || [];
    list.push(s.documentId);
    byHash.set(h, list);
  }

  for (const s of seeds) {
    const h = hashDocumentContent(s.text);
    const group = byHash.get(h) || [s.documentId];
    if (group.length > 1) {
      const primary = group[0];
      out.set(s.documentId, {
        contentHash: h,
        duplicateStatus: "possibleDuplicate",
        duplicateOf: s.documentId === primary ? null : primary,
        isPrimaryCopy: s.documentId === primary
      });
      continue;
    }

    // Version possible ?
    let versionOf: string | null = null;
    for (const other of seeds) {
      if (other.documentId === s.documentId) continue;
      const oh = hashDocumentContent(other.text);
      if (oh === h) continue;
      const sim = textSimilarity(s.text, other.text);
      const sameRef =
        s.detectedReference &&
        other.detectedReference &&
        s.detectedReference === other.detectedReference;
      const sharedFields = shareFieldCodes(s, other);
      if (sim >= 0.72 && (sameRef || sharedFields >= 1)) {
        // conserver les deux — pointer vers l’id lexicographiquement plus petit
        versionOf =
          s.documentId < other.documentId ? null : other.documentId;
        out.set(s.documentId, {
          contentHash: h,
          duplicateStatus: "possibleVersion",
          duplicateOf: versionOf,
          isPrimaryCopy: true
        });
        break;
      }
    }

    if (!out.has(s.documentId)) {
      out.set(s.documentId, {
        contentHash: h,
        duplicateStatus: "distinct",
        duplicateOf: null,
        isPrimaryCopy: true
      });
    }
  }

  return out;
}

function shareFieldCodes(a: DocumentSeed, b: DocumentSeed): number {
  const sa = new Set((a.detectedFields || []).map((f) => f.normalizedCode));
  let n = 0;
  for (const f of b.detectedFields || []) {
    if (sa.has(f.normalizedCode)) n += 1;
  }
  return n;
}
