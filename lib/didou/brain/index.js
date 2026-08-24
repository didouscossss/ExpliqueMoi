/**
 * Didou Brain
 * Index V7
 *
 * Ordre :
 *
 * 1. construction du Brain
 * 2. vérification des faits
 * 3. Knowledge Graph
 * 4. Decision Engine — hypothèse initiale
 * 5. Knowledge Reasoner
 * 6. Consensus Engine
 * 7. Decision Engine — décision finale contextuelle
 * 8. Learning Engine
 *
 * Architecture :
 *
 * Document Reasoner
 *      ↓
 * Fact Verifier
 *      ↓
 * Knowledge Graph
 *      ↓
 * Decision PASS 1
 *      ↓
 * Knowledge Reasoner
 *      ↓
 * Consensus Engine
 *      ↓
 * Decision PASS 2
 *      ↓
 * Learning Engine
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
import {
  buildSemanticRelevanceProfile,
  debugSemanticRelevance
} from "./semanticRelevanceEngine.js";
import {
  buildDocumentStructure
} from "./documentStructureEngine.js";
/**
 * =====================================================
 * POINT D'ENTREE
 * =====================================================
 */

export function runBrain({
  text,
  pages = [],
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
 * 2.5 — DOCUMENT STRUCTURE ENGINE
 * =====================================================
 *
 * Diagnostic uniquement pour le moment.
 * N'influence pas encore les décisions du Brain.
 */

try {
  verifiedBrain.documentStructure =
    buildDocumentStructure({
      pages,

      documentType:
        verifiedBrain
          ?.document
          ?.type ||
        detection
          ?.documentType ||
        null
    });

  console.log(
    "[DOCUMENT STRUCTURE]",
    verifiedBrain.documentStructure
  );
} catch (error) {
  console.error(
    "DIDOU_DOCUMENT_STRUCTURE_ERROR",
    error
  );

  verifiedBrain.documentStructure =
    null;
}


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
   *     PASS 1 : HYPOTHESE INITIALE
   * =====================================================
   *
   * IMPORTANT :
   *
   * Cette première décision est volontairement
   * conservée.
   *
   * Elle sert d'hypothèse initiale au :
   *
   * - Knowledge Reasoner
   * - Consensus Engine
   *
   * Exemple :
   *
   * Brain historique :
   * proof / assurance
   *
   * Knowledge :
   * convocation AG
   *
   * Le Consensus pourra comparer les deux.
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

    verifiedBrain.decision =
      createEmptyDecision();
  }

  /*
   * =====================================================
   * SAUVEGARDE DECISION INITIALE
   * =====================================================
   *
   * On garde une copie avant que la deuxième passe
   * ne remplace brain.decision.
   */

  verifiedBrain.initialDecision =
    cloneDecision(
      verifiedBrain.decision
    );

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
   *
   * - ancien détecteur
   * - Brain
   * - première Decision
   * - Knowledge Reasoner
   *
   * Il peut corriger un type historique uniquement
   * quand Knowledge dispose d'indices suffisamment
   * solides.
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

    verifiedBrain.consensus =
      createConsensusFallback({
        verifiedBrain,
        detection
      });
  }

  /*
   * =====================================================
   * DEBUG CONSENSUS
   * =====================================================
   *
   * Temporaire.
   * À retirer une fois les tests terminés.
   */
/*
 * =====================================================
 * 6.5 — SEMANTIC RELEVANCE ENGINE
 * =====================================================
 *
 * Cette couche analyse toutes les informations
 * extraites et détermine leur importance réelle
 * pour l'utilisateur.
 *
 * Elle travaille APRES le Consensus afin de connaître
 * le contexte documentaire final.
 *
 * Elle travaille AVANT la deuxième passe du
 * Decision Engine afin que la décision finale puisse
 * utiliser cette hiérarchie sémantique.
 *
 * IMPORTANT :
 *
 * Aucun nom, montant, date ou document particulier
 * n'est codé ici.
 *
 * Le moteur raisonne à partir :
 *
 * - du rôle des informations
 * - de leur contexte
 * - de leur pertinence utilisateur
 * - de leur provenance
 * - de leur confiance
 * - de leur centralité documentaire
 */

try {
  verifiedBrain.semanticRelevance =
    buildSemanticRelevanceProfile({
       /*
     * Texte complet du document.
     */
    text,
      /*
       * -----------------------------------------------
       * CONTEXTE DOCUMENTAIRE FINAL
       * -----------------------------------------------
       */

      documentType:
        verifiedBrain
          ?.consensus
          ?.documentType ||
        verifiedBrain
          ?.document
          ?.type ||
        detection
          ?.documentType ||
        null,

      family:
        verifiedBrain
          ?.consensus
          ?.family ||
        verifiedBrain
          ?.document
          ?.family ||
        detection
          ?.family ||
        null,

      consensus:
        verifiedBrain
          ?.consensus ||
        null,

      /*
       * -----------------------------------------------
       * INTENTION / SITUATION
       * -----------------------------------------------
       */

      brainIntent:
        verifiedBrain
          ?.consensus
          ?.intent ||
        verifiedBrain
          ?.decision
          ?.intent
          ?.type ||
        verifiedBrain
          ?.intent
          ?.type ||
        null,

      brainSituation:
        verifiedBrain
          ?.consensus
          ?.situation ||
        verifiedBrain
          ?.decision
          ?.primarySituation
          ?.type ||
        verifiedBrain
          ?.situation
          ?.type ||
        null,

      /*
       * -----------------------------------------------
       * DECISION INITIALE
       * -----------------------------------------------
       */

      decision:
        verifiedBrain
          ?.initialDecision ||
        verifiedBrain
          ?.decision ||
        null,

      /*
       * -----------------------------------------------
       * DATES
       * -----------------------------------------------
       */

      dates:
        Array.isArray(
          verifiedBrain?.dates
        )
          ? verifiedBrain.dates
          : [],

      /*
       * -----------------------------------------------
       * MONTANTS
       * -----------------------------------------------
       */

      amounts:
        Array.isArray(
          verifiedBrain?.amounts
        )
          ? verifiedBrain.amounts
          : [],

      /*
       * -----------------------------------------------
       * ACTIONS
       * -----------------------------------------------
       */

      actions:
        Array.isArray(
          verifiedBrain?.actions
        )
          ? verifiedBrain.actions
          : [],

      /*
       * -----------------------------------------------
       * FAITS
       * -----------------------------------------------
       */

      facts:
        Array.isArray(
          verifiedBrain?.facts
        )
          ? verifiedBrain.facts
          : []
    });

  /*
   * Debug temporaire.
   */

  debugSemanticRelevance(
    verifiedBrain.semanticRelevance
  );
} catch (error) {
  console.error(
    "DIDOU_SEMANTIC_RELEVANCE_ERROR",
    error
  );

  /*
   * Une erreur du moteur sémantique ne doit
   * jamais interrompre l'analyse du document.
   */

  verifiedBrain.semanticRelevance =
    createEmptySemanticRelevance();
}
  console.log(
    "[BRAIN CONSENSUS]",
    verifiedBrain.consensus
  );

  /*
   * =====================================================
   * 7 — DECISION ENGINE
   *     PASS 2 : DECISION FINALE
   * =====================================================
   *
   * NOUVEAU V7.
   *
   * À cette étape, verifiedBrain contient désormais :
   *
   * verifiedBrain.knowledge
   * verifiedBrain.consensus
   *
   * Le Decision Engine V2 peut donc sélectionner :
   *
   * - la situation principale
   * - le montant principal
   * - la date principale
   * - l'action requise
   *
   * en tenant compte du type documentaire final.
   *
   * Exemple AG :
   *
   * PASS 1 :
   * proof
   * 25 €
   * 16/07/2026
   *
   * CONSENSUS :
   * meeting
   * copropriété
   *
   * PASS 2 :
   * meeting
   * montant = null
   * meetingDate
   */

  try {
    const finalDecision =
      runDecisionEngine(
        verifiedBrain
      );

    if (
      finalDecision &&
      typeof finalDecision ===
        "object"
    ) {
      verifiedBrain.decision =
        finalDecision;
    }
  } catch (error) {
    console.error(
      "DIDOU_FINAL_DECISION_ENGINE_ERROR",
      error
    );

    /*
     * IMPORTANT :
     *
     * Une erreur de la deuxième passe ne doit jamais
     * casser le Brain.
     *
     * On revient simplement à l'hypothèse initiale.
     */

    verifiedBrain.decision =
      verifiedBrain.initialDecision ||
      createEmptyDecision();
  }

  /*
   * =====================================================
   * DEBUG DECISION FINALE
   * =====================================================
   */

  console.log(
    "[BRAIN INITIAL DECISION]",
    verifiedBrain.initialDecision
  );

  console.log(
    "[BRAIN FINAL DECISION]",
    verifiedBrain.decision
  );

  /*
   * =====================================================
   * 8 — LEARNING ENGINE
   * =====================================================
   *
   * Learning utilise désormais en priorité :
   *
   * Consensus
   * puis Knowledge
   * puis décision finale
   * puis Brain historique.
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
   * 9 — META
   * =====================================================
   */

  verifiedBrain.meta = {
    ...(verifiedBrain.meta || {}),

    brainIndexVersion:
      "7.0",

    /*
     * -----------------------------------------------------
     * MODULES ACTIFS
     * -----------------------------------------------------
     */

    knowledgeGraphEnabled:
      true,
    
    semanticRelevanceEngineEnabled:
      true,
    
    decisionEngineEnabled:
      true,

    finalDecisionEngineEnabled:
      true,

    knowledgeReasonerEnabled:
      true,

    consensusEngineEnabled:
      true,

    learningEngineEnabled:
      true,

    /*
     * -----------------------------------------------------
     * MODES
     * -----------------------------------------------------
     */

    knowledgeMode:
      "active-with-consensus",

    consensusMode:
      "conservative",

    decisionMode:
      "two-pass-contextual",
    
    semanticRelevanceMode:
      "contextual-ranking",
    
    learningMode:
      "observation",

    /*
     * -----------------------------------------------------
     * GRAPHE
     * -----------------------------------------------------
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
     * -----------------------------------------------------
     * DECISION INITIALE
     * -----------------------------------------------------
     */

    initialDecisionConfidence:
      verifiedBrain
        ?.initialDecision
        ?.confidence ??
      null,

    initialDecisionIntent:
      verifiedBrain
        ?.initialDecision
        ?.intent
        ?.type ||
      null,

    initialDecisionSituation:
      verifiedBrain
        ?.initialDecision
        ?.primarySituation
        ?.type ||
      verifiedBrain
        ?.initialDecision
        ?.intent
        ?.type ||
      null,

    initialDecisionAmount:
      verifiedBrain
        ?.initialDecision
        ?.primaryAmount
        ?.value ||
      null,

    initialDecisionDate:
      verifiedBrain
        ?.initialDecision
        ?.primaryDate
        ?.value ||
      null,

    /*
     * -----------------------------------------------------
     * DECISION FINALE
     * -----------------------------------------------------
     */

    decisionConfidence:
      verifiedBrain
        ?.decision
        ?.confidence ??
      null,

    decisionIntent:
      verifiedBrain
        ?.decision
        ?.intent
        ?.type ||
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

    decisionAmount:
      verifiedBrain
        ?.decision
        ?.primaryAmount
        ?.value ||
      null,

    decisionDate:
      verifiedBrain
        ?.decision
        ?.primaryDate
        ?.value ||
      null,

    /*
     * -----------------------------------------------------
     * KNOWLEDGE REASONER
     * -----------------------------------------------------
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
     * -----------------------------------------------------
     * CONSENSUS ENGINE
     * -----------------------------------------------------
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

    consensusActionRequired:
      verifiedBrain
        ?.consensus
        ?.actionRequired ??
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
     * -----------------------------------------------------
     * LEARNING
     * -----------------------------------------------------
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
 * DECISION VIDE
 * =====================================================
 */

function createEmptyDecision() {
  return {
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

/**
 * =====================================================
 * COPIE DECISION
 * =====================================================
 *
 * On veut conserver la première décision sans qu'une
 * éventuelle modification ultérieure de brain.decision
 * modifie également initialDecision.
 */

function cloneDecision(
  decision
) {
  if (
    !decision ||
    typeof decision !==
      "object"
  ) {
    return createEmptyDecision();
  }

  return {
    intent:
      decision?.intent
        ? {
            ...decision.intent
          }
        : null,

    primarySituation:
      decision?.primarySituation
        ? {
            ...decision.primarySituation
          }
        : null,

    primaryAmount:
      decision?.primaryAmount
        ? {
            ...decision.primaryAmount
          }
        : null,

    primaryDate:
      decision?.primaryDate
        ? {
            ...decision.primaryDate
          }
        : null,

    actionRequired:
      decision
        ?.actionRequired ??
      null,

    actions:
      Array.isArray(
        decision?.actions
      )
        ? decision.actions.map(
            (action) =>
              action &&
              typeof action ===
                "object"
                ? {
                    ...action
                  }
                : action
          )
        : [],

    contradictions:
      Array.isArray(
        decision
          ?.contradictions
      )
        ? decision
            .contradictions
            .map(
              (item) =>
                item &&
                typeof item ===
                  "object"
                  ? {
                      ...item
                    }
                  : item
            )
        : [],

    confidence:
      Number(
        decision?.confidence ||
        0
      ),

    reason:
      decision?.reason ||
      null
  };
}

/**
 * =====================================================
 * CONSENSUS FALLBACK
 * =====================================================
 */

function createConsensusFallback({
  verifiedBrain,
  detection
}) {
  return {
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
      "consensus_error",

    knowledgeScore:
      0,

    knowledgeConfidence:
      0,

    strongSignalCount:
      0
  };
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
/**
 * =====================================================
 * SEMANTIC RELEVANCE FALLBACK
 * =====================================================
 */

function createEmptySemanticRelevance() {
  return {
    version:
      "semantic-relevance-fallback",

    documentContext: {
      documentType:
        null,

      family:
        null,

      intent:
        null,

      situation:
        null
    },

    primary: {
      date:
        null,

      amount:
        null,

      actions:
        []
    },

    dates: {
      all:
        [],

      important:
        [],

      secondary:
        [],

      ignored:
        []
    },

    amounts: {
      all:
        [],

      important:
        [],

      secondary:
        [],

      ignored:
        []
    },

    actions: {
      all:
        [],

      user:
        [],

      important:
        [],

      secondary:
        [],

      ignored:
        []
    },

    facts: {
      important:
        [],

      secondary:
        [],

      ignored:
        []
    }
  };
}
