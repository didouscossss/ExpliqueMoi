/**
 * Sections structurelles (docs explicatifs / notices).
 */

import { toConfidence } from "../types/confidence.js";
import type { ResolvedField } from "../types/documentProfile.js";
import type { SectionUnderstanding } from "../types/documentUnderstanding.js";
import type { TextBlock } from "../types/textBlock.js";
import { enrichEvidence } from "./evidence.js";

export function buildSections(
  fields: readonly ResolvedField[],
  blocks: readonly TextBlock[]
): SectionUnderstanding[] {
  const sections: SectionUnderstanding[] = [];

  const sectionField = fields.find(
    (f) =>
      f.field === "sections" &&
      (f.status === "resolved" || f.status === "ambiguous")
  );
  if (sectionField && Array.isArray(sectionField.value)) {
    for (const title of sectionField.value) {
      const evidence = enrichEvidence(sectionField.evidence, blocks).filter(
        (e) => e.text.includes(String(title)) || String(title).includes(e.text)
      );
      const ev =
        evidence.length > 0
          ? evidence
          : enrichEvidence(sectionField.evidence, blocks).slice(0, 1);
      if (!ev.length) continue;
      sections.push({
        title: String(title),
        kind: "section",
        items: [
          {
            kind: "sectionTitle",
            value: title,
            confidence: sectionField.confidence || toConfidence(0.5),
            status: sectionField.status,
            importance: "high",
            evidence: ev,
            derivedFrom: ["field:sections"],
            reasoning: sectionField.reasons || []
          }
        ],
        evidence: ev
      });
    }
  }

  const keyPoints = fields.find(
    (f) =>
      f.field === "keyPoints" &&
      (f.status === "resolved" || f.status === "ambiguous")
  );
  if (keyPoints && Array.isArray(keyPoints.value)) {
    const evidence = enrichEvidence(keyPoints.evidence, blocks);
    if (evidence.length) {
      sections.push({
        title: "keyPoints",
        kind: "keyPoints",
        items: keyPoints.value.map((v) => ({
          kind: "keyPoint",
          value: v,
          confidence: keyPoints.confidence || toConfidence(0.5),
          status: keyPoints.status,
          importance: "high" as const,
          evidence,
          derivedFrom: ["field:keyPoints"],
          reasoning: keyPoints.reasons || []
        })),
        evidence
      });
    }
  }

  const procedures = fields.find(
    (f) =>
      (f.field === "procedures" || f.field === "instructions") &&
      (f.status === "resolved" || f.status === "ambiguous")
  );
  if (procedures && Array.isArray(procedures.value)) {
    const evidence = enrichEvidence(procedures.evidence, blocks);
    if (evidence.length) {
      sections.push({
        title: "procedures",
        kind: "procedures",
        items: procedures.value.map((v) => ({
          kind: "step",
          value: v,
          confidence: procedures.confidence || toConfidence(0.5),
          status: procedures.status,
          importance: "high" as const,
          evidence,
          derivedFrom: [`field:${procedures.field}`],
          reasoning: procedures.reasons || []
        })),
        evidence
      });
    }
  }

  return sections;
}
