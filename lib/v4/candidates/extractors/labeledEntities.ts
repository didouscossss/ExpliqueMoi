/**
 * Entités introduites par un libellé structurel (Émetteur /, Destinataire /, …).
 * Générique — aucun fournisseur.
 */

import type { TextBlock } from "../../types/textBlock.js";
import type { ExtractionHit } from "./types.js";

const LABELED: Array<{
  re: RegExp;
  type: "organization" | "person";
  hint: string;
}> = [
  {
    re: /(?:emetteur|émetteur|expediteur|expéditeur)\s*[:\-]\s*(.+)$/i,
    type: "organization",
    hint: "issuer"
  },
  {
    re: /(?:destinataire|adresse\s*a|adressé\s*a|adressee?\s*a)\s*[:\-]\s*(.+)$/i,
    type: "person",
    hint: "recipient"
  },
  {
    re: /(?:client|pour)\s*[:\-]\s*((?:m\.?|mme|mr|monsieur|madame)\s+.+)$/i,
    type: "person",
    hint: "recipient"
  },
  {
    re: /(?:societe|société|organisme|entreprise)\s*[:\-]\s*(.+)$/i,
    type: "organization",
    hint: "issuer"
  }
];

export function extractLabeledEntityHits(
  blocks: readonly TextBlock[]
): ExtractionHit[] {
  const hits: ExtractionHit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text.trim();
    for (const def of LABELED) {
      const m = line.match(def.re);
      if (!m) continue;
      let value = m[1].replace(/\s+/g, " ").trim();
      if (!value || value.length < 2) continue;
      // « Société Exemple » sans forme juridique → organization si hint issuer
      if (def.type === "person" && /^société\b|^societe\b/i.test(value)) {
        hits.push({
          type: "organization",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: line.indexOf(value),
            end: line.indexOf(value) + value.length,
            raw: value
          }
        });
        continue;
      }
      // Jean Dupont sans civilité
      if (def.type === "person" && !/^\d+$/.test(value)) {
        hits.push({
          type: "person",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: Math.max(0, line.toLowerCase().indexOf(value.toLowerCase())),
            end:
              Math.max(0, line.toLowerCase().indexOf(value.toLowerCase())) +
              value.length,
            raw: value
          }
        });
        continue;
      }
      if (def.type === "organization") {
        hits.push({
          type: "organization",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: Math.max(0, line.indexOf(value)),
            end: Math.max(0, line.indexOf(value)) + value.length,
            raw: value
          }
        });
      }
    }
  }
  return hits;
}
