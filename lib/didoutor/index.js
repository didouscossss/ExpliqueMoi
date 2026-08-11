/**
 * Didoutor — couche IA premium (non branchée).
 * Les fonctions chat / aide / rédaction arriveront plus tard.
 * Elles consommeront exclusivement DidoutorContext.
 */

export { buildDidoutorContext } from "./context.js";

export const DIDOUTOR_STATUS = "reserved";
export const DIDOUTOR_CAPABILITIES_PLANNED = [
  "contextual_chat",
  "deep_qa",
  "personalized_explanations",
  "form_fill_help",
  "supporting_documents",
  "question_prep",
  "mail_drafting",
  "response_prep",
  "step_by_step_guidance",
  "advanced_analysis"
];
