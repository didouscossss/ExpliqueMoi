/**
 * GlobalConsistencyEngine — compare des combinaisons de candidats.
 * Score global explicable = locaux + relations − contradictions.
 * Peut retourner ambiguous / contradictory.
 */

import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type {
  ConsistencyResult,
  ConsistencySolution,
  ConsistencyStatus,
  Contradiction,
  FieldAssignment,
  Relation
} from "../types/relation.js";
import { clamp01 } from "../types/confidence.js";
import { bestRole, contextHas, nearlyEqual, roleScore } from "./helpers.js";
import { nextRelationId } from "./ids.js";
import { buildRelations } from "./RelationEngine.js";
import { RELATION_WEIGHTS as W } from "./weights.js";

function assignment(role: string, c: EntityCandidate): FieldAssignment {
  return {
    role,
    candidateId: c.id,
    value: c.value,
    localScore: roleScore(c, role)
  };
}

function avgLocal(assignments: FieldAssignment[]): number {
  if (!assignments.length) return 0;
  return assignments.reduce((a, x) => a + x.localScore, 0) / assignments.length;
}

function explainSolution(
  assignments: FieldAssignment[],
  relations: Relation[],
  contradictions: Contradiction[],
  extras: ScoreReason[] = []
): { score: number; reasons: ScoreReason[]; status: ConsistencyStatus } {
  const reasons: ScoreReason[] = [...extras];
  const local = avgLocal(assignments);
  const localPart = local * W.localScoreWeight;
  reasons.push({
    signal: `global:localScores(avg=${local.toFixed(2)})`,
    delta: localPart
  });

  const arith = relations.filter((r) => r.type === "arithmetic");
  const relPool = arith.length ? arith : relations;
  const relScore =
    relPool.reduce((a, r) => a + r.score, 0) / Math.max(1, relPool.length);
  const relPart = relScore * W.relationScoreWeight;
  reasons.push({
    signal: `global:relations(avg=${relScore.toFixed(2)},n=${relPool.length},arith=${arith.length})`,
    delta: relPart
  });

  let contraPart = 0;
  for (const c of contradictions) {
    const p = c.penalty * W.contradictionWeight;
    contraPart += p;
    reasons.push({ signal: `global:contradiction:${c.kind}`, delta: p });
  }

  const ttc = assignments.find((a) => a.role === "amountTTC");
  if (ttc && typeof ttc.value === "number" && ttc.value >= 100_000) {
    reasons.push({
      signal: "global:negative:capitalLikeTotal",
      delta: W.capitalAsTotal
    });
    contraPart += W.capitalAsTotal;
  }

  const score = clamp01(localPart + relPart + contraPart);
  let status: ConsistencyStatus = "resolved";
  if (contradictions.length) status = "contradictory";
  else if (!arith.length && assignments.length >= 2) status = "partial";
  return { score, reasons, status };
}

function idsOf(assignments: FieldAssignment[]): Set<string> {
  return new Set(assignments.map((a) => a.candidateId));
}

function bundleRelations(all: Relation[], ids: Set<string>): Relation[] {
  return all.filter((r) => {
    if (r.type !== "arithmetic") {
      return ids.has(r.sourceCandidateId) && ids.has(r.targetCandidateId);
    }
    if (!ids.has(r.sourceCandidateId) || !ids.has(r.targetCandidateId)) {
      return false;
    }
    return (r.via || []).every((v) => ids.has(v));
  });
}

function bundleContradictions(
  all: Contradiction[],
  assignments: FieldAssignment[]
): Contradiction[] {
  const byRole = new Map(assignments.map((a) => [a.role, a]));
  const ht = byRole.get("amountHT");
  const vat = byRole.get("vatAmount");
  const ttc = byRole.get("amountTTC");
  const rate = byRole.get("vatRate");
  return all.filter((c) => {
    if (c.kind !== "arithmeticMismatch") {
      return c.subjectIds.every((id) =>
        assignments.some((a) => a.candidateId === id)
      );
    }
    // Ne rattacher que si la contradiction parle de LA même affectation de rôles
    const ids = new Set(c.subjectIds);
    const usesHtVatTtc =
      ht &&
      vat &&
      ttc &&
      ids.has(ht.candidateId) &&
      ids.has(vat.candidateId) &&
      ids.has(ttc.candidateId) &&
      c.message.includes(String(ht.value)) &&
      c.message.includes(String(vat.value)) &&
      c.message.includes(String(ttc.value));
    const usesHtRateTtc =
      ht &&
      rate &&
      ttc &&
      ids.has(ht.candidateId) &&
      ids.has(rate.candidateId) &&
      ids.has(ttc.candidateId);
    return Boolean(usesHtVatTtc || usesHtRateTtc);
  });
}

function ttcOf(s: ConsistencySolution): unknown {
  return s.assignments.find((a) => a.role === "amountTTC")?.value;
}

function rankScore(s: ConsistencySolution): number {
  // Bonus fort si arithmétique cohérente sans contradiction
  const arith = s.relations.some((r) => r.type === "arithmetic");
  let bonus = 0;
  if (arith && s.contradictions.length === 0) bonus += 0.35;
  if (s.status === "contradictory") bonus -= 0.5;
  return s.score + bonus;
}

export class GlobalConsistencyEngine {
  analyze(candidates: readonly EntityCandidate[]): ConsistencyResult {
    const relResult = buildRelations(candidates);
    const solutions: ConsistencySolution[] = [];

    // 1) Bundles arithmétiques cohérents — priorité
    for (const bundle of relResult.coherentBundles) {
      const assignments: FieldAssignment[] = [
        assignment("amountHT", bundle.ht),
        assignment("amountTTC", bundle.ttc)
      ];
      if (bundle.vatAmount) {
        assignments.push(assignment("vatAmount", bundle.vatAmount));
      }
      if (bundle.vatRate) {
        assignments.push(assignment("vatRate", bundle.vatRate));
      }
      const ids = idsOf(assignments);
      const relations = bundleRelations(relResult.relations, ids);
      const contradictions = bundleContradictions(
        relResult.contradictions,
        assignments
      );
      const explained = explainSolution(assignments, relations, contradictions, [
        { signal: "global:coherentArithmeticBundle", delta: 0.2 }
      ]);
      solutions.push({
        id: nextRelationId("sol"),
        status: contradictions.length ? "contradictory" : "resolved",
        assignments,
        score: clamp01(Math.max(explained.score, 0.85)),
        reasons: explained.reasons,
        relations,
        contradictions
      });
    }

    // 2) Solutions TTC « libres » — seulement si cohérentes localement
    //    ou pour exposer ambiguïté / capital parasite.
    const money = candidates.filter((c) => c.type === "money");
    const rates = candidates.filter((c) => c.type === "percentage");

    for (const ttc of money) {
      if (roleScore(ttc, "amountTTC") < 0.35 && roleScore(ttc, "amountDue") < 0.45) {
        continue;
      }
      // Déjà couvert par un bundle gagnant ?
      const covered = solutions.some(
        (s) =>
          ttcOf(s) === ttc.value &&
          s.status === "resolved" &&
          s.relations.some((r) => r.type === "arithmetic")
      );
      if (covered) continue;

      const ht = money
        .filter((c) => c.id !== ttc.id && bestRole(c) === "amountHT")
        .sort((a, b) => roleScore(b, "amountHT") - roleScore(a, "amountHT"))[0];

      const vat = money
        .filter(
          (c) =>
            c.id !== ttc.id &&
            c.id !== ht?.id &&
            bestRole(c) === "vatAmount"
        )
        .sort(
          (a, b) => roleScore(b, "vatAmount") - roleScore(a, "vatAmount")
        )[0];

      const rate = rates
        .filter((c) => bestRole(c) === "vatRate")
        .sort((a, b) => roleScore(b, "vatRate") - roleScore(a, "vatRate"))[0];

      const assignments: FieldAssignment[] = [
        assignment(
          roleScore(ttc, "amountTTC") >= roleScore(ttc, "amountDue")
            ? "amountTTC"
            : "amountDue",
          ttc
        )
      ];
      // Normalise role name to amountTTC for comparison
      assignments[0] = assignment("amountTTC", ttc);
      if (ht) assignments.push(assignment("amountHT", ht));
      if (vat) assignments.push(assignment("vatAmount", vat));
      if (rate) assignments.push(assignment("vatRate", rate));

      const ids = idsOf(assignments);
      const relations = bundleRelations(relResult.relations, ids);
      let contradictions = bundleContradictions(
        relResult.contradictions,
        assignments
      );

      if (
        contextHas(ttc, /capital\s+social|au\s+capital/) ||
        (typeof ttc.value === "number" && ttc.value >= 100_000)
      ) {
        contradictions = [
          ...contradictions,
          {
            id: nextRelationId("contra"),
            subjectIds: [ttc.id],
            kind: "capitalAsTotal",
            message: "Montant type capital social écarté comme total TTC",
            penalty: W.capitalAsTotal,
            reasons: [
              { signal: "contradiction:capitalAsTotal", delta: W.capitalAsTotal }
            ],
            evidence: ttc.evidence
          }
        ];
      }

      // Si HT+TVA fournis mais n’égalent pas TTC → contradiction locale
      if (
        ht &&
        vat &&
        typeof ht.value === "number" &&
        typeof vat.value === "number" &&
        typeof ttc.value === "number" &&
        !nearlyEqual(ht.value + vat.value, ttc.value, W.moneyTolerance)
      ) {
        const already = contradictions.some((c) => c.kind === "arithmeticMismatch");
        if (!already) {
          contradictions.push({
            id: nextRelationId("contra"),
            subjectIds: [ht.id, vat.id, ttc.id],
            kind: "arithmeticMismatch",
            message: `HT (${ht.value}) + TVA (${vat.value}) ≠ TTC (${ttc.value})`,
            penalty: W.arithmeticMismatch,
            reasons: [
              {
                signal: `contradiction:HT+TVA≠TTC (${ht.value}+${vat.value}≠${ttc.value})`,
                delta: W.arithmeticMismatch
              }
            ],
            evidence: [...ht.evidence, ...vat.evidence, ...ttc.evidence]
          });
        }
      }

      const explained = explainSolution(assignments, relations, contradictions);
      solutions.push({
        id: nextRelationId("sol"),
        status: explained.status,
        assignments,
        score: explained.score,
        reasons: explained.reasons,
        relations,
        contradictions
      });
    }

    // 3) S’il n’y a que des contradictions (Test C)
    if (
      !solutions.some((s) => s.status === "resolved") &&
      relResult.contradictions.length
    ) {
      const ht = money
        .filter((c) => roleScore(c, "amountHT") >= 0.4)
        .sort((a, b) => roleScore(b, "amountHT") - roleScore(a, "amountHT"))[0];
      const ttc = money
        .filter((c) => roleScore(c, "amountTTC") >= 0.4)
        .sort((a, b) => roleScore(b, "amountTTC") - roleScore(a, "amountTTC"))[0];
      const vat = money
        .filter((c) => roleScore(c, "vatAmount") >= 0.4)
        .sort((a, b) => roleScore(b, "vatAmount") - roleScore(a, "vatAmount"))[0];
      const rate = rates
        .filter((c) => roleScore(c, "vatRate") >= 0.4)
        .sort((a, b) => roleScore(b, "vatRate") - roleScore(a, "vatRate"))[0];
      if (ht && ttc) {
        const assignments = [
          assignment("amountHT", ht),
          assignment("amountTTC", ttc)
        ];
        if (vat) assignments.push(assignment("vatAmount", vat));
        if (rate) assignments.push(assignment("vatRate", rate));
        const ids = idsOf(assignments);
        const explained = explainSolution(
          assignments,
          bundleRelations(relResult.relations, ids),
          relResult.contradictions
        );
        solutions.push({
          id: nextRelationId("sol"),
          status: "contradictory",
          assignments,
          score: explained.score,
          reasons: explained.reasons,
          relations: bundleRelations(relResult.relations, ids),
          contradictions: relResult.contradictions
        });
      }
    }

    solutions.sort((a, b) => rankScore(b) - rankScore(a));

    // Ambiguïté : deux TTC distincts, scores proches, non contradictoires
    const viable = solutions.filter((s) => s.status !== "contradictory");
    if (viable.length >= 2) {
      const a = viable[0];
      const b = viable[1];
      const ttcA = ttcOf(a);
      const ttcB = ttcOf(b);
      const aHasArith = a.relations.some((r) => r.type === "arithmetic");
      const bHasArith = b.relations.some((r) => r.type === "arithmetic");
      // Si l’un a l’arithmétique et pas l’autre → pas d’ambiguïté
      if (!(aHasArith && !bHasArith)) {
        if (
          ttcA != null &&
          ttcB != null &&
          ttcA !== ttcB &&
          Math.abs(rankScore(a) - rankScore(b)) <
            W.ambiguityMargin + (aHasArith ? 0 : 0.25)
        ) {
          a.status = "ambiguous";
          b.status = "ambiguous";
          a.alternatives = [b];
        }
      }
    }

    solutions.sort((a, b) => rankScore(b) - rankScore(a));
    const best = solutions[0] || null;
    const hasResolved = solutions.some((s) => s.status === "resolved");
    const hasAmbiguous = solutions.some((s) => s.status === "ambiguous");
    const hasContra =
      relResult.contradictions.length > 0 ||
      solutions.some((s) => s.contradictions.length > 0);

    let status: ConsistencyStatus = best?.status || "partial";
    if (hasResolved) status = "resolved";
    else if (hasAmbiguous) status = "ambiguous";
    else if (hasContra) status = "contradictory";

    return {
      status,
      best,
      solutions,
      relations: relResult.relations,
      contradictions: relResult.contradictions
    };
  }
}

export function analyzeConsistency(
  candidates: readonly EntityCandidate[]
): ConsistencyResult {
  return new GlobalConsistencyEngine().analyze(candidates);
}
