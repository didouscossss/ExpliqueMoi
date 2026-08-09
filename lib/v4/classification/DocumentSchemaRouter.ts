/**
 * DocumentSchemaRouter — classification multi-hypothèses, explicable.
 * Aucun if/else central par fournisseur : uniquement des SchemaProfile.
 */

import type {
  ClassificationAlternative,
  ClassificationEvidenceItem,
  ClassificationStatus,
  DocumentClassification,
  DocumentTypeId,
  DocumentTypeScores
} from "../types/documentClassification.js";
import type { ScoreReason } from "../types/entityCandidate.js";
import { toConfidence } from "../types/confidence.js";
import {
  buildClassificationContext,
  type ClassificationContext
} from "./context.js";
import { listSchemaProfiles } from "./profiles/registry.js";
import type { SchemaProfile } from "./schemaProfile.js";
import { scoreSchemaProfile } from "./scorer.js";
import { detectSecondarySections } from "./secondarySections.js";
import { CLASSIFICATION_WEIGHTS as W } from "./weights.js";
import type { EntityCandidate } from "../types/entityCandidate.js";
import type { Relation, ConsistencyResult } from "../types/relation.js";
import type { TextBlock } from "../types/textBlock.js";

export interface SchemaRouterInput {
  blocks: readonly TextBlock[];
  candidates: readonly EntityCandidate[];
  relations: readonly Relation[];
  consistency?: ConsistencyResult | null;
  /** Profils additionnels (extensibilité runtime). */
  profiles?: SchemaProfile[];
}

export class DocumentSchemaRouter {
  private readonly profiles: SchemaProfile[];

  constructor(profiles?: SchemaProfile[]) {
    this.profiles = profiles ?? listSchemaProfiles();
  }

  classify(input: SchemaRouterInput): DocumentClassification {
    const ctx = buildClassificationContext(input);
    return this.classifyContext(ctx);
  }

  classifyContext(ctx: ClassificationContext): DocumentClassification {
    const scored = this.profiles.map((p) => scoreSchemaProfile(p, ctx));
    scored.sort((a, b) => b.score - a.score);

    const scores: DocumentTypeScores = { unknown: 0 };
    for (const s of scored) scores[s.type] = s.score;

    const top = scored[0];
    const second = scored[1];
    const allEvidence: ClassificationEvidenceItem[] = scored.flatMap(
      (s) => s.evidence
    );
    const contradictions: ScoreReason[] = [];

    let status: ClassificationStatus = "resolved";
    let primary: DocumentTypeId = "unknown";
    let confidenceScore = 0;

    if (!top || top.score < W.unknownMaxScore) {
      primary = "unknown";
      status = "unknown";
      confidenceScore = top ? 1 - top.score : 0.9;
      scores.unknown = Math.max(scores.unknown || 0, 0.6);
    } else if (
      second &&
      second.score >= W.unknownMaxScore &&
      (Math.abs(top.score - second.score) < W.ambiguousMargin ||
        (top.score < 0.55 &&
          second.score / Math.max(top.score, 0.01) > 0.7 &&
          Math.abs(top.score - second.score) < 0.18))
    ) {
      primary = top.type;
      status = "ambiguous";
      confidenceScore = top.score * 0.7;
      contradictions.push({
        signal: `ambiguous:${top.type}≈${second.type}`,
        delta: -0.1
      });
    } else {
      primary = top.type;
      status = "resolved";
      confidenceScore = top.score;
    }

    // Sections fonctionnelles (contenu) — jamais des DocumentTypeId
    const secondarySections = detectSecondarySections(ctx);

    const alternatives: ClassificationAlternative[] = scored
      .filter((s) => s.type !== primary)
      .slice(0, 4)
      .map((s) => ({ type: s.type, confidence: Number(s.score.toFixed(4)) }));

    const primaryEvidence = allEvidence.filter(
      (e) => e.type === primary || (primary === "unknown" && e.delta < 0)
    );

    const strong = primaryEvidence
      .filter((e) => e.delta > 0.12)
      .map((e) => e.signal);
    const secondary = primaryEvidence
      .filter((e) => e.delta > 0 && e.delta <= 0.12)
      .map((e) => e.signal);
    const negative = allEvidence
      .filter((e) => e.type === primary && e.delta < 0)
      .map((e) => e.signal);

    return {
      primary,
      confidence: toConfidence(confidenceScore),
      status,
      scores,
      alternatives,
      secondarySections,
      evidence: primaryEvidence.length ? primaryEvidence : allEvidence.slice(0, 12),
      contradictions,
      signals: {
        strong: [...new Set(strong)].slice(0, 12),
        secondary: [...new Set(secondary)].slice(0, 12),
        negative: [...new Set(negative)].slice(0, 12),
        structural: Object.entries(ctx.structures)
          .filter(([, v]) => v)
          .map(([k]) => k)
      }
    };
  }
}

export function classifyDocument(
  input: SchemaRouterInput
): DocumentClassification {
  return new DocumentSchemaRouter(input.profiles).classify(input);
}

/** Explication textuelle conceptuelle (pour debug / tests). */
export function explainClassification(
  classification: DocumentClassification
): string[] {
  const lines: string[] = [
    `primary=${classification.primary} status=${classification.status} confidence=${classification.confidence.score.toFixed(2)}`
  ];
  for (const e of classification.evidence.slice(0, 10)) {
    const sign = e.delta >= 0 ? "+" : "";
    lines.push(
      `${sign}${e.delta.toFixed(2)} [${e.family}] ${e.signal}` +
        (e.evidence[0]?.text ? ` ← « ${e.evidence[0].text.slice(0, 80)} »` : "")
    );
  }
  for (const sec of classification.secondarySections) {
    lines.push(
      `secondarySection:${sec.kind} (${sec.confidence.toFixed(2)}) ${sec.signals.join(", ")}`
    );
  }
  return lines;
}
