/**
 * Couche document V3 — signatures uniquement (étape C+).
 */

import type { DocumentInput } from "../types/DocumentInput.js";

/** Prépare un DocumentInput à partir de fichiers bruts — non implémenté. */
export async function prepareDocumentInput(
  _files: File[]
): Promise<DocumentInput> {
  throw new Error("prepareDocumentInput — non implémenté (étape C).");
}
