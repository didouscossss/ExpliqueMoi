/**
 * RelationEngine — construit des relations entre EntityCandidate.
 * Types : arithmetic, spatial, semantic, temporal, ownership,
 * actionDeadline, tableMembership, sameSection, sender/recipient/issuer…
 */

import type { EntityCandidate } from "../types/entityCandidate.js";
import type { Contradiction, Relation } from "../types/relation.js";
import { scanActionDeadlineRelations } from "./actionDeadline.js";
import { scanArithmeticRelations } from "./arithmetic.js";
import { scanSemanticRelations } from "./semantic.js";
import { scanSpatialRelations } from "./spatial.js";

export interface RelationEngineResult {
  relations: Relation[];
  contradictions: Contradiction[];
  coherentBundles: ReturnType<typeof scanArithmeticRelations>["coherentBundles"];
}

export class RelationEngine {
  build(candidates: readonly EntityCandidate[]): RelationEngineResult {
    const arithmetic = scanArithmeticRelations(candidates);
    const spatial = scanSpatialRelations(candidates);
    const semantic = scanSemanticRelations(candidates);
    const actionDeadline = scanActionDeadlineRelations(candidates);

    // temporal ≈ sous-ensemble actionDeadline + dates adjacentes déjà couvertes
    const temporal = actionDeadline.map((r) => ({
      ...r,
      // conserver actionDeadline comme type principal ; dupliquer signal temporal via reasons
      reasons: [
        ...r.reasons,
        { signal: "temporal:linked", delta: 0 }
      ]
    }));

    const ownership: Relation[] = semantic
      .filter((r) => r.type === "organizationPerson")
      .map((r) => ({
        ...r,
        id: `${r.id}_own`,
        type: "ownership" as const,
        label: "ownership(org→person)",
        reasons: [
          ...r.reasons,
          { signal: "ownership:fromOrganizationPerson", delta: 0.05 }
        ]
      }));

    // tableMembership : placeholder structurel si plusieurs montants sameSection
    const tableMembership: Relation[] = [];
    const sectionRels = spatial.filter((r) => r.type === "sameSection");
    for (const r of sectionRels) {
      if (
        candidates.find((c) => c.id === r.sourceCandidateId)?.type === "money" &&
        candidates.find((c) => c.id === r.targetCandidateId)?.type === "money"
      ) {
        tableMembership.push({
          ...r,
          id: `${r.id}_tbl`,
          type: "tableMembership",
          label: "tableMembership(heuristic)",
          reasons: [
            { signal: "table:sameSectionMoneyPair", delta: 0.1 }
          ]
        });
      }
    }

    const relations = [
      ...arithmetic.relations,
      ...spatial,
      ...semantic,
      ...temporal,
      ...ownership,
      ...tableMembership
    ];

    return {
      relations,
      contradictions: arithmetic.contradictions,
      coherentBundles: arithmetic.coherentBundles
    };
  }
}

export function buildRelations(
  candidates: readonly EntityCandidate[]
): RelationEngineResult {
  return new RelationEngine().build(candidates);
}
