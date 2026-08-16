/**
 * Didou Brain
 * Index V5
 *
 * Ordre :
 * 1. construction du Brain
 * 2. vérification des faits
 * 3. Knowledge Graph
 * 4. Decision Engine
 * 5. Knowledge Reasoner
 * 6. Learning Engine
 *
 * IMPORTANT :
 *
 * Le Knowledge Reasoner est pour l'instant
 * en mode observation.
 *
 * Il peut reconnaître un document grâce
 * à la bibliothèque locale, mais il ne modifie
 * pas encore automatiquement la décision finale.
 */

import {
  runDocumentReasoner
} from "./documentReasoner.js";

import {
  verifyBrainFacts
} from "./factVerifier.js";

import {
  buildKnowledgeGraph
} from "./knowledgeGraph.js";

import {
  runDecisionEngine
} from "./decisionEngine.js";

import {
  getLearningBonus
} from "./learningEngine.js";

import {
  runKnowledgeReasoner
} from "../knowledge/knowledgeReasoner.js";

/**
 * =====================================================
 * POINT D'ENTREE
 * =====================================================
 */

export function runBrain({
  text,
  extraction,
  detection
}) {
  /*
   * =====================================================
   * 1 — DOCUMENT REASONER
   * =====================================================
   */

  const brain =
    runDocumentReasoner({
      text,
      extraction,
      detection
    });

  /*
   * =====================================================
   * 2 — FACT VERIFIER
   * =====================================================
   */

  const verifiedBrain =
    verifyBrainFacts(
      brain
    );

  /*
   * =====================================================
   * 3 — KNOWLEDGE GRAPH
   * =====================================================
   */

  try {
    verifiedBrain.graph =
      buildKnowledgeGraph(
        verifiedBrain
      );
  } catch (error) {
    console.error(
      "DIDOU_KNOWLEDGE_GRAPH_ERROR",
      error
    );

    verifiedBrain.graph = {
      nodes: [],
      edges: [],

      meta: {
        version:
          "fallback",

        nodeCount:
          0,

        edgeCount:
          0
      }
    };
  }

  /*
   * =====================================================
   * 4 — DECISION ENGINE
   * =====================================================
   */

  try {
    verifiedBrain.decision =
      runDecisionEngine(
        verifiedBrain
      );
  } catch (error) {
    console.error(
      "DIDOU_DECISION_ENGINE_ERROR",
      error
    );

    verifiedBrain.decision = {
      intent:
        null,

      primarySituation:
        null,

      primaryAmount:
        null,

      primaryDate:
        null,

      actionRequired:
        null,

      actions:
        [],

      contradictions:
        [],

      confidence:
        0,

      reason:
        null
    };
  }

  /*
   * =====================================================
   * 5 — KNOWLEDGE REASONER
   * =====================================================
   *
   * Le Brain demande maintenant à sa bibliothèque :
   *
   * "Est-ce que ce document ressemble à quelque chose
   *  que je connais déjà ?"
   *
   * Pour le moment :
   *
   * - aucune correction automatique ;
   * - aucune modification du résultat utilisateur ;
   * - observation + diagnostic uniquement.
   */

  try {
    verifiedBrain.knowledge =
      runKnowledgeReasoner({
        text,

        brain:
          verifiedBrain,

        detection,

        extraction
      });
  } catch (error) {
    console.error(
      "DIDOU_KNOWLEDGE_REASONER_ERROR",
      error
    );

    verifiedBrain.knowledge =
      createEmptyKnowledgeResult();
  }

  /*
   * =====================================================
   * 6 — LEARNING ENGINE
   * =====================================================
   *
   * Toujours en mode observation.
   */

  try {
    verifiedBrain.learning =
      getLearningBonus({
        type:
          verifiedBrain?.knowledge
            ?.canStronglyInfluence &&
          verifiedBrain?.knowledge
            ?.documentType
            ? verifiedBrain
                .knowledge
                .documentType
            : verifiedBrain
                ?.document
                ?.type ||
              detection
                ?.documentType ||
              null,

        intent:
          verifiedBrain?.knowledge
            ?.canStronglyInfluence &&
          verifiedBrain?.knowledge
            ?.intent
            ? verifiedBrain
                .knowledge
                .intent
            : verifiedBrain
                ?.decision
                ?.intent
                ?.type ||
              verifiedBrain
                ?.intent
                ?.type ||
              null,

        situation:
          verifiedBrain?.knowledge
            ?.canStronglyInfluence &&
          verifiedBrain?.knowledge
            ?.situation
            ? verifiedBrain
                .knowledge
                .situation
            : verifiedBrain
                ?.decision
                ?.primarySituation
                ?.type ||
              verifiedBrain
                ?.situation
                ?.type ||
              null
      });
  } catch (error) {
    console.error(
      "DIDOU_LEARNING_ENGINE_ERROR",
      error
    );

    verifiedBrain.learning = {
      typeBonus:
        0,

      intentBonus:
        0,

      situationBonus:
        0
    };
  }

  /*
   * =====================================================
   * 7 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    /*
     * Version.
     */

    brainIndexVersion:
      "5.0",

    /*
     * Modules actifs.
     */

    knowledgeGraphEnabled:
      true,

    decisionEngineEnabled:
      true,

    knowledgeReasonerEnabled:
      true,

    learningEngineEnabled:
      true,

    /*
     * Modes.
     */

    knowledgeMode:
      "observation",

    learningMode:
      "observation",

    /*
     * Graphe.
     */

    graphNodeCount:
      Array.isArray(
        verifiedBrain
          ?.graph
          ?.nodes
      )
        ? verifiedBrain
            .graph
            .nodes
            .length
        : 0,

    graphEdgeCount:
      Array.isArray(
        verifiedBrain
          ?.graph
          ?.edges
      )
        ? verifiedBrain
            .graph
            .edges
            .length
        : 0,

    /*
     * Decision Engine.
     */

    decisionConfidence:
      verifiedBrain
        ?.decision
        ?.confidence ??
      null,

    decisionSituation:
      verifiedBrain
        ?.decision
        ?.primarySituation
        ?.type ||
      verifiedBrain
        ?.decision
        ?.intent
        ?.type ||
      null,

    decisionActionRequired:
      verifiedBrain
        ?.decision
        ?.actionRequired ??
      null,

    /*
     * Knowledge Reasoner.
     */

    knowledgeMatched:
      Boolean(
        verifiedBrain
          ?.knowledge
          ?.matched
      ),

    knowledgeDocumentType:
      verifiedBrain
        ?.knowledge
        ?.documentType ||
      null,

    knowledgeFamily:
      verifiedBrain
        ?.knowledge
        ?.family ||
      null,

    knowledgeIntent:
      verifiedBrain
        ?.knowledge
        ?.intent ||
      null,

    knowledgeSituation:
      verifiedBrain
        ?.knowledge
        ?.situation ||
      null,

    knowledgeConfidence:
      verifiedBrain
        ?.knowledge
        ?.confidence ??
      0,

    knowledgeCanInfluence:
      Boolean(
        verifiedBrain
          ?.knowledge
          ?.canInfluence
      ),

    knowledgeCanStronglyInfluence:
      Boolean(
        verifiedBrain
          ?.knowledge
          ?.canStronglyInfluence
      ),

    knowledgeAgreements:
      Array.isArray(
        verifiedBrain
          ?.knowledge
          ?.agreements
      )
        ? verifiedBrain
            .knowledge
            .agreements
            .length
        : 0,

    knowledgeDisagreements:
      Array.isArray(
        verifiedBrain
          ?.knowledge
          ?.disagreements
      )
        ? verifiedBrain
            .knowledge
            .disagreements
            .length
        : 0,

    /*
     * Learning.
     */

    learningBonuses: {
      type:
        verifiedBrain
          ?.learning
          ?.typeBonus ||
        0,

      intent:
        verifiedBrain
          ?.learning
          ?.intentBonus ||
        0,

      situation:
        verifiedBrain
          ?.learning
          ?.situationBonus ||
        0
    }
  };

  return verifiedBrain;
}

/**
 * =====================================================
 * KNOWLEDGE FALLBACK
 * =====================================================
 */

function createEmptyKnowledgeResult() {
  return {
    matched:
      false,

    family:
      null,

    documentType:
      null,

    intent:
      null,

    situation:
      null,

    actionRequired:
      null,

    summary:
      null,

    importantFields:
      [],

    ignoredFields:
      [],

    confidence:
      0,

    score:
      0,

    signals:
      [],

    agreements:
      [],

    disagreements:
      [],

    canInfluence:
      false,

    canStronglyInfluence:
      false,

    alternatives:
      []
  };
}
