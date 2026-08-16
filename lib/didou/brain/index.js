/**
 * Didou Brain
 * Index V4
 *
 * Ordre :
 * 1. construction du Brain
 * 2. vérification des faits
 * 3. Knowledge Graph
 * 4. Decision Engine
 * 5. Learning Engine
 *
 * Le Learning Engine est pour l'instant
 * en mode observation :
 * il calcule des bonus mais ne modifie
 * pas encore directement les décisions.
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
        version: "fallback",
        nodeCount: 0,
        edgeCount: 0
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
      intent: null,
      primarySituation: null,
      primaryAmount: null,
      primaryDate: null,
      actionRequired: null,
      actions: [],
      contradictions: [],
      confidence: 0,
      reason: null
    };
  }

  /*
   * =====================================================
   * 5 — LEARNING ENGINE
   * =====================================================
   *
   * Mode observation uniquement.
   *
   * On demande :
   * "Que dit actuellement la mémoire ?"
   *
   * Mais on ne change encore aucun score.
   */

  try {
    verifiedBrain.learning =
      getLearningBonus({
        type:
          verifiedBrain?.document
            ?.type ||
          detection?.documentType ||
          null,

        intent:
          verifiedBrain?.decision
            ?.intent
            ?.type ||
          verifiedBrain?.intent
            ?.type ||
          null,

        situation:
          verifiedBrain?.decision
            ?.primarySituation
            ?.type ||
          verifiedBrain?.situation
            ?.type ||
          null
      });
  } catch (error) {
    console.error(
      "DIDOU_LEARNING_ENGINE_ERROR",
      error
    );

    verifiedBrain.learning = {
      typeBonus: 0,
      intentBonus: 0,
      situationBonus: 0
    };
  }

  /*
   * =====================================================
   * 6 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    brainIndexVersion:
      "4.0",

    knowledgeGraphEnabled:
      true,

    decisionEngineEnabled:
      true,

    learningEngineEnabled:
      true,

    learningMode:
      "observation",

    graphNodeCount:
      Array.isArray(
        verifiedBrain?.graph?.nodes
      )
        ? verifiedBrain.graph.nodes.length
        : 0,

    graphEdgeCount:
      Array.isArray(
        verifiedBrain?.graph?.edges
      )
        ? verifiedBrain.graph.edges.length
        : 0,

    decisionConfidence:
      verifiedBrain?.decision
        ?.confidence ??
      null,

    decisionSituation:
      verifiedBrain?.decision
        ?.primarySituation
        ?.type ||
      verifiedBrain?.decision
        ?.intent
        ?.type ||
      null,

    decisionActionRequired:
      verifiedBrain?.decision
        ?.actionRequired ??
      null,

    learningBonuses: {
      type:
        verifiedBrain?.learning
          ?.typeBonus ||
        0,

      intent:
        verifiedBrain?.learning
          ?.intentBonus ||
        0,

      situation:
        verifiedBrain?.learning
          ?.situationBonus ||
        0
    }
  };

  return verifiedBrain;
}
