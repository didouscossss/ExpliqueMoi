export { createDocumentProfile, type ProfileDefinition } from "./baseProfile.js";
export { field, required, na } from "./fieldHelpers.js";
export {
  resolveProfileFields,
  validateProfile,
  computeCompleteness,
  resolutionToAnalysis
} from "./resolver.js";
export {
  DocumentProfileRegistry,
  listDocumentProfiles,
  getDocumentProfile,
  resolveProfileForType,
  registerDocumentProfile
} from "./registry.js";
export {
  ProfilePipeline,
  resolveDocumentProfileText,
  resolveWithForcedProfile,
  type ProfilePipelineResult
} from "./pipeline.js";

export { invoiceProfile } from "./definitions/invoice.js";
export { administrativeLetterProfile } from "./definitions/administrativeLetter.js";
export { taxDocumentProfile } from "./definitions/taxDocument.js";
export { bankStatementProfile } from "./definitions/bankStatement.js";
export { contractProfile } from "./definitions/contract.js";
export { payslipProfile } from "./definitions/payslip.js";
export { formProfile } from "./definitions/form.js";
export { certificateProfile } from "./definitions/certificate.js";
export { financialStatementProfile } from "./definitions/financialStatement.js";
export { explanatoryDocumentProfile } from "./definitions/explanatory.js";
export { unknownProfile } from "./definitions/unknown.js";
export { receiptProfile } from "./definitions/receipt.js";
