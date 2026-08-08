/**
 * Extraction PDF.js alignée sur lib/v3/client/ocrBrowser.js (production).
 * Réutilisable par les tests d’intégration.
 */
import fs from "node:fs";

/** Copie comportementale de ocrBrowser.textContentToLines */
export function textContentToLines(items) {
  const rows = [];
  for (const item of items || []) {
    if (!item || typeof item.str !== "string") continue;
    const str = item.str;
    if (!str) continue;
    const transform = item.transform || [];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    rows.push({ str, x, y });
  }
  if (!rows.length) return "";

  rows.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2) return yDiff;
    return a.x - b.x;
  });

  const lines = [];
  let current = [];
  let lastY = null;
  const Y_TOL = 3;

  for (const row of rows) {
    if (lastY == null || Math.abs(row.y - lastY) <= Y_TOL) {
      current.push(row);
      lastY = lastY == null ? row.y : lastY;
    } else {
      lines.push(current);
      current = [row];
      lastY = row.y;
    }
  }
  if (current.length) lines.push(current);

  return lines
    .map((lineItems) =>
      lineItems
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(" ")
        .replace(/[ \t\u00a0]+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function extractPdfLikeBrowser(pdfPath) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = textContentToLines(content.items);
      pages.push({ pageNumber, text, confidence: text ? 100 : 0 });
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }
  const fullText = pages
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return {
    pages,
    fullText,
    warnings: [],
    textLength: fullText.replace(/\s+/g, "").length,
    pageCount: pages.length
  };
}
