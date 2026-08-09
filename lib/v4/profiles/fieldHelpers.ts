import type { FieldExpectation } from "../types/documentProfile.js";
import type { EntityType } from "../types/entityCandidate.js";

export function field(
  partial: FieldExpectation & { field: string; candidateTypes: EntityType[] }
): FieldExpectation {
  return {
    required: false,
    importance: "medium",
    cardinality: "single",
    confidenceThreshold: 0.55,
    preferredRoles: [],
    ...partial
  };
}

export function required(
  partial: FieldExpectation & { field: string; candidateTypes: EntityType[] }
): FieldExpectation {
  return field({
    importance: "high",
    confidenceThreshold: 0.6,
    ...partial,
    required: true
  });
}

export function na(
  fieldName: string,
  candidateTypes: EntityType[] = ["money"]
): FieldExpectation {
  return {
    field: fieldName,
    candidateTypes,
    required: false,
    notApplicable: true,
    importance: "low",
    cardinality: "single"
  };
}
