/**
 * ExpliqueMoi V4 — Document Intelligence Engine
 *
 * V4-A : types + DocumentSession
 * V4-B : CandidateExtractor + HypothesisEngine + scoring
 * V4-C : RelationEngine + GlobalConsistencyEngine
 * V4-D : DocumentSchemaRouter + SchemaProfile
 * V4-E : DocumentProfileRegistry + FieldExpectation + résolution
 * V4-F : DocumentUnderstanding + synthèse structurée evidence-first
 * V4-G : DocumentExplanation déterministe et traçable
 * V4-H : UserPresentation — formulation utilisateur déterministe
 * V4-I : Pipeline end-to-end + diagnostics
 * V3 / V2 inchangées. Aucun branchement UI. Aucun provider IA.
 */

export * from "./types/index.js";
export * from "./candidates/index.js";
export * from "./relations/index.js";
export * from "./classification/index.js";
export * from "./profiles/index.js";
export * from "./understanding/index.js";
export * from "./explanation/index.js";
export * from "./presentation/index.js";
export * from "./pipeline/index.js";
