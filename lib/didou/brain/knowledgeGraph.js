/**
 * Didou Brain
 * Knowledge Graph V1
 *
 * Transforme le brain en graphe de connaissances.
 *
 * Objectif :
 * permettre à Didou de raisonner sur :
 * - les relations
 * - les événements
 * - les personnes
 * - les organismes
 * - les montants
 * - les dates
 *
 * au lieu d'utiliser uniquement des tableaux séparés.
 */

export function buildKnowledgeGraph(
  brain
) {
  const graph = {
    nodes: [],
    edges: []
  };

  const nodeIndex =
    new Map();

  /*
   * =====================================================
   * DOCUMENT
   * =====================================================
   */

  const documentId =
    addNode(
      graph,
      nodeIndex,
      {
        type:
          "document",

        label:
          brain?.document
            ?.type ||
          "Document",

        data:
          brain?.document ||
          {}
      }
    );

  /*
   * =====================================================
   * EMETTEUR
   * =====================================================
   */

  if (
    brain?.issuer
  ) {
    const issuerId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "issuer",

          label:
            String(
              brain.issuer
            ),

          data: {
            value:
              brain.issuer
          }
        }
      );

    addEdge(
      graph,
      documentId,
      issuerId,
      "issued_by"
    );
  }

  /*
   * =====================================================
   * DESTINATAIRE
   * =====================================================
   */

  if (
    brain?.recipient
  ) {
    const recipientId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "recipient",

          label:
            String(
              brain.recipient
            ),

          data: {
            value:
              brain.recipient
          }
        }
      );

    addEdge(
      graph,
      documentId,
      recipientId,
      "sent_to"
    );
  }

  /*
   * =====================================================
   * DATES
   * =====================================================
   */

  for (
    const date of (
      brain?.dates ||
      []
    )
  ) {
    const dateId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "date",

          label:
            date.value,

          data:
            date
        }
      );

    addEdge(
      graph,
      documentId,
      dateId,
      "contains_date"
    );
  }

  /*
   * =====================================================
   * MONTANTS
   * =====================================================
   */

  for (
    const amount of (
      brain?.amounts ||
      []
    )
  ) {
    const amountId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "amount",

          label:
            String(
              amount.value
            ),

          data:
            amount
        }
      );

    addEdge(
      graph,
      documentId,
      amountId,
      "contains_amount"
    );
  }

  /*
   * =====================================================
   * ACTIONS
   * =====================================================
   */

  for (
    const action of (
      brain?.actions ||
      []
    )
  ) {
    const actionId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "action",

          label:
            action.action,

          data:
            action
        }
      );

    addEdge(
      graph,
      documentId,
      actionId,
      "requires_action"
    );
  }

  /*
   * =====================================================
   * EVENEMENTS
   * =====================================================
   */

  for (
    const event of (
      brain?.events ||
      []
    )
  ) {
    const eventId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "event",

          label:
            event.label ||
            event.type,

          data:
            event
        }
      );

    addEdge(
      graph,
      documentId,
      eventId,
      "contains_event"
    );
  }

  /*
   * =====================================================
   * INTENTION
   * =====================================================
   */

  if (
    brain?.intent
  ) {
    const intentId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "intent",

          label:
            brain.intent.label,

          data:
            brain.intent
        }
      );

    addEdge(
      graph,
      documentId,
      intentId,
      "has_intent"
    );
  }

  return graph;
}

/**
 * =====================================================
 * NODE
 * =====================================================
 */

function addNode(
  graph,
  nodeIndex,
  node
) {
  const key =
    buildNodeKey(
      node
    );

  if (
    nodeIndex.has(
      key
    )
  ) {
    return nodeIndex.get(
      key
    );
  }

  const id =
    `node_${graph.nodes.length + 1}`;

  graph.nodes.push({
    id,
    ...node
  });

  nodeIndex.set(
    key,
    id
  );

  return id;
}

/**
 * =====================================================
 * EDGE
 * =====================================================
 */

function addEdge(
  graph,
  from,
  to,
  relation
) {
  graph.edges.push({
    from,
    to,
    relation
  });
}

/**
 * =====================================================
 * CLE UNIQUE
 * =====================================================
 */

function buildNodeKey(
  node
) {
  return [
    node.type,
    node.label
  ]
    .join("::")
    .toLowerCase();
}
