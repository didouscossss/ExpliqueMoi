/**
 * Didou Brain
 * Index V6
 *
 * Ordre :
 * 1. construction du Brain
 * 2. vérification des faits
 * 3. Knowledge Graph
 * 4. Decision Engine
 * 5. Knowledge Reasoner
 * 6. Consensus Engine
 * 7. Learning Engine
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

import {
  buildConsensus
} from "./consensusEngine.js";

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
   * 6 — CONSENSUS ENGINE
   * =====================================================
   *
   * Le consensus arbitre entre :
   * - ancien détecteur
   * - Brain
   * - Knowledge Reasoner
   *
   * Il peut corriger un type historique
   * uniquement quand Knowledge est suffisamment fort.
   */

  try {
    verifiedBrain.consensus =
      buildConsensus({
        detection,

        brain:
          verifiedBrain,

        knowledge:
          verifiedBrain.knowledge
      });
  } catch (error) {
    console.error(
      "DIDOU_CONSENSUS_ERROR",
      error
    );

    verifiedBrain.consensus = {
      winner:
        "fallback",

      corrected:
        false,

      family:
        verifiedBrain?.document
          ?.family ||
        detection?.family ||
        null,

      documentType:
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
        null,

      actionRequired:
        verifiedBrain?.decision
          ?.actionRequired ??
        null,

      confidence:
        verifiedBrain?.decision
          ?.confidence ||
        detection?.confidence ||
        0,

      summary:
        null,

      reason:
        "consensus_error"
    };
  }

  /*
   * =====================================================
   * DEBUG CONSENSUS
   * =====================================================
   *
   * Temporaire :
   * à retirer une fois les tests terminés.
   */

  console.log(
    "[BRAIN CONSENSUS]",
    verifiedBrain.consensus
  );

  /*
   * =====================================================
   * 7 — LEARNING ENGINE
   * =====================================================
   */

  try {
    verifiedBrain.learning =
      getLearningBonus({
        type:
          verifiedBrain?.consensus
            ?.documentType ||
          (
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
                null
          ),

        intent:
          verifiedBrain?.consensus
            ?.intent ||
          (
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
                null
          ),

        situation:
          verifiedBrain?.consensus
            ?.situation ||
          (
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
          )
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
   * 8 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    brainIndexVersion:
      "6.0",

    /*
     * Modules actifs.
     */

    knowledgeGraphEnabled:
      true,

    decisionEngineEnabled:
      true,

    knowledgeReasonerEnabled:
      true,

    consensusEngineEnabled:
      true,

    learningEngineEnabled:
      true,

    /*
     * Modes.
     */

    knowledgeMode:
      "active-with-consensus",

    consensusMode:
      "conservative",

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

    knowledgeScore:
      verifiedBrain
        ?.knowledge
        ?.score ??
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
     * Consensus Engine.
     */

    consensusWinner:
      verifiedBrain
        ?.consensus
        ?.winner ||
      null,

    consensusCorrected:
      Boolean(
        verifiedBrain
          ?.consensus
          ?.corrected
      ),

    consensusDocumentType:
      verifiedBrain
        ?.consensus
        ?.documentType ||
      null,

    consensusFamily:
      verifiedBrain
        ?.consensus
        ?.family ||
      null,

    consensusIntent:
      verifiedBrain
        ?.consensus
        ?.intent ||
      null,

    consensusSituation:
      verifiedBrain
        ?.consensus
        ?.situation ||
      null,

    consensusConfidence:
      verifiedBrain
        ?.consensus
        ?.confidence ??
      0,

    consensusReason:
      verifiedBrain
        ?.consensus
        ?.reason ||
      null,

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