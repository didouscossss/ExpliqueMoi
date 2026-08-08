export { CLASSIFICATION_WEIGHTS } from "./weights.js";
export type { SchemaProfile, SchemaSignal, SignalMatcher } from "./schemaProfile.js";
export {
  listSchemaProfiles,
  registerSchemaProfile,
  getSchemaProfile,
  supportedDocumentTypes
} from "./profiles/registry.js";
export {
  buildClassificationContext,
  type ClassificationContext,
  type StructureFlags
} from "./context.js";
export { scoreSchemaProfile } from "./scorer.js";
export {
  DocumentSchemaRouter,
  classifyDocument,
  explainClassification
} from "./DocumentSchemaRouter.js";
export type { SchemaRouterInput } from "./DocumentSchemaRouter.js";
export {
  ClassificationPipeline,
  classifyDocumentText
} from "./pipeline.js";
export type { ClassificationPipelineResult } from "./pipeline.js";
export {
  detectSecondarySections,
  isSecondarySectionKind
} from "./secondarySections.js";
