/**
 * HypothesisEngine — attribue plusieurs rôles scorés à chaque candidat.
 * Aucun winner définitif. Aucun calcul métier HT+TVA=TTC.
 */

import type { EntityCandidate, RoleHypothesis } from "../../types/entityCandidate.js";
import { ROLES_BY_TYPE } from "./roles.js";
import { scoreRole } from "./scorer.js";

export interface HypothesisEngineOptions {
  /** Score minimum pour conserver une hypothèse (défaut 0.05). */
  minScore?: number;
  /** Nombre max d’hypothèses conservées par candidat. */
  maxHypotheses?: number;
}

export class HypothesisEngine {
  private readonly minScore: number;
  private readonly maxHypotheses: number;

  constructor(options: HypothesisEngineOptions = {}) {
    this.minScore = options.minScore ?? 0.05;
    this.maxHypotheses = options.maxHypotheses ?? 8;
  }

  /**
   * Enrichit les candidats avec des hypothèses scorées (copie shallow).
   */
  assign(candidates: readonly EntityCandidate[]): EntityCandidate[] {
    return candidates.map((c) => this.assignOne(c));
  }

  assignOne(candidate: EntityCandidate): EntityCandidate {
    const roles = ROLES_BY_TYPE[candidate.type] || ["other"];
    const hypotheses: RoleHypothesis[] = roles
      .map((role) => scoreRole(candidate, role))
      .filter((h) => h.score >= this.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxHypotheses);

    return {
      ...candidate,
      hypotheses
    };
  }
}

export function assignHypotheses(
  candidates: readonly EntityCandidate[],
  options?: HypothesisEngineOptions
): EntityCandidate[] {
  return new HypothesisEngine(options).assign(candidates);
}
