/**
 * Entrée documentaire V3 (fichier / photo / PDF).
 * Signatures uniquement — aucun traitement métier.
 */

export type DocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | string;

export interface DocumentPageInput {
  pageNumber: number;
  name: string;
  mimeType: DocumentMimeType;
  /** Octets en mémoire session uniquement — jamais persistés. */
  bytes?: Uint8Array | null;
  /** File navigateur éventuel — révoqué via destroyDocumentSession. */
  file?: File | null;
  sizeBytes?: number;
  rotation?: number;
}

export interface DocumentInput {
  id: string;
  pages: DocumentPageInput[];
  source: "file" | "camera" | "unknown";
  createdAt: string;
}
