/**
 * Consommateurs futurs de la Knowledge Base (V4-L).
 * FREE = runtime local déterministe. PRO = interfaces seulement (pas d'LLM ici).
 */

/** Moteur gratuit local — identification / profils / evidence. */
export interface FreeLocalKnowledgeConsumer {
  kind: "free-local";
  usesRegistry: true;
  usesLlm: false;
  capabilities: readonly [
    "documentIdentification",
    "registryLookup",
    "profileSelection",
    "structuredExplanation",
    "evidence",
    "deterministicPresentation"
  ];
}

/**
 * Partie Pro future — chat / approfondissement / aide au remplissage.
 * V4-L ne fournit AUCUNE implémentation LLM.
 */
export interface ProAiKnowledgeConsumer {
  kind: "pro-ai";
  usesRegistry: true;
  /** Réservé — non branché en V4-L. */
  usesLlm: true;
  capabilities: readonly [
    "documentIdentification",
    "registryLookup",
    "deepExplanation",
    "contextualChat",
    "qa",
    "formFillAssist",
    "stepByStepGuidance"
  ];
}

export type KnowledgeConsumer =
  | FreeLocalKnowledgeConsumer
  | ProAiKnowledgeConsumer;

export const FREE_LOCAL_KNOWLEDGE_CONSUMER: FreeLocalKnowledgeConsumer = {
  kind: "free-local",
  usesRegistry: true,
  usesLlm: false,
  capabilities: [
    "documentIdentification",
    "registryLookup",
    "profileSelection",
    "structuredExplanation",
    "evidence",
    "deterministicPresentation"
  ]
};
