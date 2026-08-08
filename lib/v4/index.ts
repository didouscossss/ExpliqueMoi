/**
 * ExpliqueMoi V4 — Document Intelligence Engine
 *
 * V4-A : types + DocumentSession
 * V4-B : CandidateExtractor + HypothesisEngine + scoring
 * V4-C : RelationEngine + GlobalConsistencyEngine
 * V4-D : DocumentSchemaRouter + SchemaProfile
 * V4-E : DocumentProfileRegistry + FieldExpectation + résolution
 * V3 / V2 inchangées. Aucun branchement UI. Aucun provider IA.
 */

export * from "./types/index.js";
export * from "./candidates/index.js";
export * from "./relations/index.js";
export * from "./classification/index.js";
export * from "./profiles/index.js";
