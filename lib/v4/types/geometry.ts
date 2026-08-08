/**
 * Géométrie légère pour blocs texte / evidence (pdf.js / OCR).
 * Optionnelle : absente si la source ne fournit pas de bbox.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
