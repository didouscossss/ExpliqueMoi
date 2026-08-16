/**
 * Didou Brain
 * Index V2
 *
 * Ordre :
 * 1. construction du brain
 * 2. vérification des faits
 * 3. construction du graphe de connaissances
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

export function runBrain({
  text,
  extraction,
  detection
}) {
  /*
   * =====================================================
   * 1 — REASONING
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
   * 2 — VERIFICATION
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
   *
   * On construit le graphe après la vérification,
   * pour que les nodes contiennent déjà :
   *
   * verified
   * userRelevant
   * confidence
   * verificationState
   */

  try {
    verifiedBrain.graph =
      buildKnowledgeGraph(
        verifiedBrain
      );
  } catch (error) {
    /*
     * Le graphe ne doit jamais casser
     * l'analyse principale.
     */

    console.error(
      "DIDOU_KNOWLEDGE_GRAPH_ERROR",
      error
    );

    verifiedBrain.graph = {
      nodes: [],
      edges: []
    };
  }

  /*
   * =====================================================
   * 4 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    brainIndexVersion:
      "2.0",

    knowledgeGraphEnabled:
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
        : 0
  };

  return verifiedBrain;
}
