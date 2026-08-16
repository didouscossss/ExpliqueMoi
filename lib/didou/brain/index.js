/**
 * Didou Brain
 * Index V3
 *
 * Ordre :
 * 1. construction du Brain
 * 2. vérification des faits
 * 3. construction du Knowledge Graph
 * 4. exécution du Decision Engine
 *
 * Chaque couche est protégée :
 * une erreur ne doit pas casser l'analyse principale.
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
   *
   * Le Decision Engine produit la conclusion générale :
   *
   * - situation principale
   * - montant principal
   * - date principale
   * - action nécessaire ou non
   * - confiance globale
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
   * 5 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    brainIndexVersion:
      "3.0",

    knowledgeGraphEnabled:
      true,

    decisionEngineEnabled:
      true,

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
      null
  };

  return verifiedBrain;
}
