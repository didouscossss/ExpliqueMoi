import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { EvidenceSpan } from "../types/evidence.js";
import { clamp01 } from "../types/confidence.js";
import { normalizeLex } from "../candidates/normalize.js";

export function pushReason(
  reasons: ScoreReason[],
  signal: string,
  delta: number
): void {
  if (!delta) return;
  reasons.push({ signal, delta });
}

export function sumReasons(reasons: ScoreReason[]): number {
  return clamp01(reasons.reduce((a, r) => a + r.delta, 0));
}

export function evidenceOf(...candidates: EntityCandidate[]): EvidenceSpan[] {
  const out: EvidenceSpan[] = [];
  for (const c of candidates) {
    for (const e of c.evidence || []) out.push(e);
  }
  return out;
}

export function roleScore(c: EntityCandidate, role: string): number {
  return c.hypotheses.find((h) => h.role === role)?.score ?? 0;
}

export function bestRole(c: EntityCandidate): string | null {
  return c.hypotheses[0]?.role ?? null;
}

export function moneyCandidates(candidates: readonly EntityCandidate[]): EntityCandidate[] {
  return candidates.filter((c) => c.type === "money");
}

export function percentCandidates(
  candidates: readonly EntityCandidate[]
): EntityCandidate[] {
  return candidates.filter((c) => c.type === "percentage");
}

export function nearlyEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

export function samePage(a: EntityCandidate, b: EntityCandidate): boolean {
  return a.page === b.page;
}

export function adjacentBlocks(a: EntityCandidate, b: EntityCandidate): boolean {
  const ai = Number((a.blockIds?.[0] || "").replace(/\D/g, "")) || 0;
  const bi = Number((b.blockIds?.[0] || "").replace(/\D/g, "")) || 0;
  if (!ai || !bi) {
    // fallback: compare evidence line proximity via context
    return false;
  }
  return Math.abs(ai - bi) <= 1;
}

export function contextHas(c: EntityCandidate, re: RegExp): boolean {
  const blob = normalizeLex(
    [c.context?.previousLine, c.context?.sameLine, c.context?.nextLine]
      .filter(Boolean)
      .join(" ")
  );
  return re.test(blob);
}
