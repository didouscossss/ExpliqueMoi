/**
 * Adapter ImpotsGouv — BUILD TIME.
 * Préfère le snapshot sitemap local ; fetch réseau optionnel.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OfficialDocumentCandidate } from "../../../../types/knowledge.js";
import type { SourceAdapter, SourceAdapterResult } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_CANDIDATES = [
  join(HERE, "../../../../../../generated/knowledge-snapshots/impots-forms-2026-08-08.json"),
  join(process.cwd(), "generated/knowledge-snapshots/impots-forms-2026-08-08.json")
];

interface SnapshotFile {
  retrievedAt: string;
  candidates: Array<{
    rawReference: string;
    reference: string;
    title: string;
    url: string;
    authority: string;
    source: string;
    retrievedAt: string;
    documentKindGuess?: string;
    cerfa?: string | null;
    year?: number | null;
    metadataHash?: string;
  }>;
  catalogOnlyReferences?: string[];
}

function loadSnapshot(): SnapshotFile | null {
  for (const p of SNAPSHOT_CANDIDATES) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as SnapshotFile;
    } catch {
      /* continue */
    }
  }
  return null;
}

export class ImpotsGouvSource implements SourceAdapter {
  id = "impots-gouv-fr";
  requiresNetwork = false;

  discover(): SourceAdapterResult {
    const snap = loadSnapshot();
    if (!snap) {
      return {
        sourceId: this.id,
        retrievedAt: new Date().toISOString(),
        candidates: [],
        notes: ["snapshot manquant — lancer knowledge:tax:discover"]
      };
    }
    const candidates: OfficialDocumentCandidate[] = snap.candidates.map((c) => ({
      rawReference: c.rawReference,
      reference: c.reference,
      title: c.title,
      url: c.url,
      authority: c.authority || "DGFiP",
      cerfa: c.cerfa ?? null,
      year: c.year ?? null,
      source: c.source || "impots.gouv.fr-sitemap",
      retrievedAt: c.retrievedAt || snap.retrievedAt,
      documentKindGuess: (c.documentKindGuess as OfficialDocumentCandidate["documentKindGuess"]) || "form",
      metadataHash: c.metadataHash
    }));
    return {
      sourceId: this.id,
      retrievedAt: snap.retrievedAt,
      candidates,
      notes: [
        `snapshot offline: ${candidates.length} candidats sitemap`,
        `catalog-only sans page: ${(snap.catalogOnlyReferences || []).length}`
      ]
    };
  }
}

export class ServicePublicSource implements SourceAdapter {
  id = "service-public-fr";
  requiresNetwork = false;
  discover(): SourceAdapterResult {
    return {
      sourceId: this.id,
      retrievedAt: new Date().toISOString(),
      candidates: [],
      notes: [
        "Non utilisé comme source primaire V4-M — licence/redistribution UNKNOWN",
        "impots.gouv.fr sitemap prioritaire"
      ]
    };
  }
}

export class DataGouvSource implements SourceAdapter {
  id = "data-gouv-fr";
  requiresNetwork = false;
  discover(): SourceAdapterResult {
    return {
      sourceId: this.id,
      retrievedAt: new Date().toISOString(),
      candidates: [],
      notes: [
        "Aucun dataset DGFiP de catalogue de formulaires adopté en V4-M",
        "À réévaluer si un jeu structuré Licence Ouverte apparaît"
      ]
    };
  }
}
