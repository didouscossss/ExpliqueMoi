/**
 * Scoring multi-signaux d’un SchemaProfile contre un ClassificationContext.
 */

import type {
  ClassificationEvidenceItem,
  DocumentTypeId,
  SignalFamily
} from "../types/documentClassification.js";
import type { ScoreReason } from "../types/entityCandidate.js";
import { clamp01 } from "../types/confidence.js";
import type { ClassificationContext, StructureFlags } from "./context.js";
import type { SchemaProfile, SchemaSignal } from "./schemaProfile.js";
import { CLASSIFICATION_WEIGHTS as W } from "./weights.js";

const FAMILY_WEIGHT: Record<SignalFamily, number> = {
  lexical: 1,
  structural: 1,
  entity: 1,
  relation: 1,
  arithmetic: 1,
  layout: 1,
  negativeEvidence: 1
};

function familyScale(family: SignalFamily): number {
  switch (family) {
    case "lexical":
      return W.lexicalStrong;
    case "structural":
      return W.structural;
    case "entity":
      return W.entity;
    case "relation":
      return W.relation;
    case "arithmetic":
      return W.arithmetic;
    case "layout":
      return W.layout;
    case "negativeEvidence":
      return Math.abs(W.negativeEvidence);
    default:
      return 0.1;
  }
}

function structureOn(
  flags: StructureFlags,
  key: keyof StructureFlags
): boolean {
  return Boolean(flags[key]);
}

function matchSignal(
  signal: SchemaSignal,
  ctx: ClassificationContext,
  type: DocumentTypeId,
  polarity: 1 | -1
): ClassificationEvidenceItem | null {
  const m = signal.matcher;
  let hit = false;
  let label = "";

  if (m.kind === "regex") {
    hit = m.pattern.test(ctx.text) || m.pattern.test(ctx.lex);
    label = m.label;
  } else if (m.kind === "entity") {
    const count = ctx.candidates.filter((c) => c.type === m.entityType).length;
    hit = count >= (m.min ?? 1);
    label = m.label;
  } else if (m.kind === "relation") {
    const count = ctx.relations.filter((r) => r.type === m.relationType).length;
    hit = count >= (m.min ?? 1);
    label = m.label;
  } else if (m.kind === "arithmetic") {
    hit =
      ctx.relations.some((r) => r.type === "arithmetic") ||
      Boolean(
        ctx.consistency?.best?.relations.some((r) => r.type === "arithmetic")
      );
    label = m.label;
  } else if (m.kind === "structure") {
    hit = structureOn(ctx.structures, m.key);
    label = m.label;
  } else if (m.kind === "absence") {
    // Pénalité si la structure attendue est ABSENTE
    hit = !structureOn(ctx.structures, m.key);
    label = m.label;
  }

  if (!hit) return null;

  const base =
    signal.family === "lexical" && signal.weight >= 0.75
      ? W.lexicalStrong
      : signal.family === "lexical"
        ? W.lexicalSecondary
        : familyScale(signal.family);

  let delta = polarity * base * signal.weight * (FAMILY_WEIGHT[signal.family] || 1);

  // Cap : IBAN seul ne doit pas porter bankStatement
  if (
    type === "bankStatement" &&
    label === "entity:iban" &&
    !ctx.structures.hasTransactionTable
  ) {
    delta = Math.min(delta, W.ibanAloneBankCap);
  }

  // Evidence : blocs contenant le signal lexical si possible
  const evidence = ctx.blocks
    .filter((b) => {
      if (m.kind === "regex") return m.pattern.test(b.text);
      return false;
    })
    .slice(0, 3)
    .map((b) => ({
      text: b.text.trim(),
      page: b.page,
      bbox: b.bbox ?? null,
      blockId: b.id,
      lineId: b.lineId ?? null
    }));

  if (!evidence.length && ctx.blocks[0]) {
    evidence.push({
      text: ctx.blocks[0].text.slice(0, 120),
      page: ctx.blocks[0].page,
      bbox: ctx.blocks[0].bbox ?? null,
      blockId: ctx.blocks[0].id,
      lineId: ctx.blocks[0].lineId ?? null
    });
  }

  return {
    signal: label,
    family: signal.family,
    delta,
    type,
    evidence
  };
}

export interface ProfileScoreResult {
  type: DocumentTypeId;
  score: number;
  evidence: ClassificationEvidenceItem[];
  reasons: ScoreReason[];
}

export function scoreSchemaProfile(
  profile: SchemaProfile,
  ctx: ClassificationContext
): ProfileScoreResult {
  const evidence: ClassificationEvidenceItem[] = [];
  const reasons: ScoreReason[] = [];

  for (const signal of profile.positiveSignals) {
    const item = matchSignal(signal, ctx, profile.type, 1);
    if (item) {
      evidence.push(item);
      reasons.push({ signal: item.signal, delta: item.delta });
    }
  }

  for (const signal of profile.negativeSignals) {
    const item = matchSignal(signal, ctx, profile.type, -1);
    if (item) {
      evidence.push(item);
      reasons.push({ signal: item.signal, delta: item.delta });
    }
  }

  // Pénalité générique si structures attendues absentes
  for (const key of profile.expectedStructures) {
    if (key in ctx.structures && !structureOn(ctx.structures, key as keyof StructureFlags)) {
      const delta = W.missingExpectedStructure;
      reasons.push({ signal: `missingStructure:${key}`, delta });
      evidence.push({
        signal: `missingStructure:${key}`,
        family: "negativeEvidence",
        delta,
        type: profile.type,
        evidence: []
      });
    }
  }

  // bankStatement : sans ledger, plafonner sévèrement même avec IBAN/prélèvement
  if (profile.type === "bankStatement" && !ctx.structures.hasTransactionTable) {
    const delta = -W.bankNeedsTransactionStructure;
    reasons.push({ signal: "cap:bankWithoutTransactions", delta });
    evidence.push({
      signal: "cap:bankWithoutTransactions",
      family: "negativeEvidence",
      delta,
      type: profile.type,
      evidence: []
    });
  }

  const raw = reasons.reduce((a, r) => a + r.delta, 0);
  const score = clamp01(raw);
  return { type: profile.type, score, evidence, reasons };
}
