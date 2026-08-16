/**
 * Didou Brain
 * Knowledge Graph V2
 *
 * Objectifs :
 * - représenter le document sous forme de graphe ;
 * - relier les faits entre eux ;
 * - connecter événements ↔ montants ↔ dates ↔ acteurs ;
 * - préparer le futur Decision Engine ;
 * - éviter de raisonner uniquement avec des tableaux séparés.
 */

export function buildKnowledgeGraph(
  brain
) {
  const graph = {
    nodes: [],
    edges: [],
    meta: {
      version: "2.0"
    }
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

        data: {
          ...(brain?.document || {}),

          family:
            brain?.document
              ?.family ||
            null,

          confidence:
            brain?.document
              ?.confidence ||
            0
        }
      }
    );

  /*
   * =====================================================
   * EMETTEUR
   * =====================================================
   */

  let issuerId =
    null;

  if (
    brain?.issuer
  ) {
    issuerId =
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
              brain.issuer,

            verified:
              Boolean(
                brain?.issuerVerified
              )
          }
        }
      );

    addEdge(
      graph,
      documentId,
      issuerId,
      "issued_by",
      {
        confidence:
          brain?.issuerVerified
            ? 90
            : 60
      }
    );
  }

  /*
   * =====================================================
   * DESTINATAIRE
   * =====================================================
   */

  let recipientId =
    null;

  if (
    brain?.recipient
  ) {
    recipientId =
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
              brain.recipient,

            verified:
              Boolean(
                brain?.recipientVerified
              )
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
   * INTENTION
   * =====================================================
   */

  let intentId =
    null;

  if (
    brain?.intent
  ) {
    intentId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "intent",

          label:
            brain.intent.label ||
            brain.intent.type ||
            "Intent",

          data:
            brain.intent
        }
      );

    addEdge(
      graph,
      documentId,
      intentId,
      "has_intent",
      {
        confidence:
          brain?.intent
            ?.confidence ||
          0
      }
    );
  }

  /*
   * =====================================================
   * SITUATION
   * =====================================================
   */

  let situationId =
    null;

  if (
    brain?.situation
  ) {
    situationId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "situation",

          label:
            brain.situation.label ||
            brain.situation.type ||
            "Situation",

          data:
            brain.situation
        }
      );

    addEdge(
      graph,
      documentId,
      situationId,
      "describes_situation",
      {
        confidence:
          brain?.situation
            ?.confidence ||
          0
      }
    );

    if (
      intentId
    ) {
      addEdge(
        graph,
        intentId,
        situationId,
        "expressed_through"
      );
    }
  }

  /*
   * =====================================================
   * DATES
   * =====================================================
   */

  const dateNodeMap =
    new Map();

  for (
    const date
    of Array.isArray(
      brain?.dates
    )
      ? brain.dates
      : []
  ) {
    if (
      !date?.value
    ) {
      continue;
    }

    const dateId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "date",

          label:
            String(
              date.value
            ),

          data:
            date
        }
      );

    dateNodeMap.set(
      buildComparableValue(
        date.value
      ),
      dateId
    );

    addEdge(
      graph,
      documentId,
      dateId,
      date?.userRelevant
        ? "has_relevant_date"
        : "contains_date",
      {
        role:
          date?.role ||
          null,

        confidence:
          date?.confidence ||
          0,

        verified:
          Boolean(
            date?.verified
          )
      }
    );
  }

  /*
   * =====================================================
   * MONTANTS
   * =====================================================
   */

  const amountNodeMap =
    new Map();

  for (
    const amount
    of Array.isArray(
      brain?.amounts
    )
      ? brain.amounts
      : []
  ) {
    if (
      !amount?.value
    ) {
      continue;
    }

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

    amountNodeMap.set(
      buildComparableValue(
        amount.value
      ),
      amountId
    );

    addEdge(
      graph,
      documentId,
      amountId,
      amount?.userRelevant
        ? "has_relevant_amount"
        : "contains_amount",
      {
        role:
          amount?.role ||
          null,

        confidence:
          amount?.confidence ||
          0,

        verified:
          Boolean(
            amount?.verified
          )
      }
    );
  }

  /*
   * =====================================================
   * ACTIONS
   * =====================================================
   */

  const actionNodeMap =
    new Map();

  for (
    const action
    of Array.isArray(
      brain?.actions
    )
      ? brain.actions
      : []
  ) {
    if (
      !action?.action
    ) {
      continue;
    }

    const actionId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "action",

          label:
            String(
              action.action
            ),

          data:
            action
        }
      );

    actionNodeMap.set(
      buildComparableValue(
        action.action
      ),
      actionId
    );

    addEdge(
      graph,
      documentId,
      actionId,
      "mentions_action",
      {
        confidence:
          action?.confidence ||
          0,

        verified:
          Boolean(
            action?.verified
          )
      }
    );

    /*
     * Si l'intention globale indique une action,
     * on la relie.
     */

    if (
      brain?.intent
        ?.actionRequired === true
    ) {
      addEdge(
        graph,
        intentId ||
        documentId,
        actionId,
        "requires_action"
      );
    }
  }

  /*
   * =====================================================
   * EVENEMENTS
   * =====================================================
   */

  const eventNodeIds =
    [];

  for (
    const event
    of Array.isArray(
      brain?.events
    )
      ? brain.events
      : []
  ) {
    const eventId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "event",

          label:
            event?.label ||
            event?.type ||
            "Événement",

          data:
            event
        }
      );

    eventNodeIds.push(
      eventId
    );

    addEdge(
      graph,
      documentId,
      eventId,
      "contains_event",
      {
        confidence:
          event?.confidence ||
          0,

        verified:
          Boolean(
            event?.verified
          )
      }
    );

    /*
     * ===================================================
     * EVENT → MONTANT
     * ===================================================
     */

    if (
      event?.amount?.value
    ) {
      const amountKey =
        buildComparableValue(
          event.amount.value
        );

      let amountId =
        amountNodeMap.get(
          amountKey
        );

      /*
       * Sécurité :
       * événement contenant un montant
       * absent de brain.amounts.
       */

      if (
        !amountId
      ) {
        amountId =
          addNode(
            graph,
            nodeIndex,
            {
              type:
                "amount",

              label:
                String(
                  event.amount.value
                ),

              data:
                event.amount
            }
          );

        amountNodeMap.set(
          amountKey,
          amountId
        );
      }

      addEdge(
        graph,
        eventId,
        amountId,
        "has_amount",
        {
          linkScore:
            event?.linkScore ||
            null,

          confidence:
            event?.amount
              ?.confidence ||
            0
        }
      );
    }

    /*
     * ===================================================
     * EVENT → DATE
     * ===================================================
     */

    if (
      event?.date?.value
    ) {
      const dateKey =
        buildComparableValue(
          event.date.value
        );

      let dateId =
        dateNodeMap.get(
          dateKey
        );

      if (
        !dateId
      ) {
        dateId =
          addNode(
            graph,
            nodeIndex,
            {
              type:
                "date",

              label:
                String(
                  event.date.value
                ),

              data:
                event.date
            }
          );

        dateNodeMap.set(
          dateKey,
          dateId
        );
      }

      addEdge(
        graph,
        eventId,
        dateId,
        "occurs_on",
        {
          linkScore:
            event?.linkScore ||
            null,

          confidence:
            event?.date
              ?.confidence ||
            0
        }
      );
    }

    /*
     * ===================================================
     * EVENT → EMETTEUR
     * ===================================================
     */

    if (
      issuerId
    ) {
      addEdge(
        graph,
        eventId,
        issuerId,
        "involves_issuer"
      );
    }

    /*
     * ===================================================
     * EVENT → DESTINATAIRE
     * ===================================================
     */

    if (
      recipientId
    ) {
      addEdge(
        graph,
        eventId,
        recipientId,
        "concerns_recipient"
      );
    }

    /*
     * ===================================================
     * EVENT → SITUATION
     * ===================================================
     */

    if (
      situationId &&
      normalizeComparable(
        brain?.situation?.type
      ) ===
        normalizeComparable(
          event?.type
        )
    ) {
      addEdge(
        graph,
        situationId,
        eventId,
        "represented_by"
      );
    }

    /*
     * ===================================================
     * EVENT → ACTION
     * ===================================================
     */

    if (
      event?.actionRequired === true
    ) {
      const actionCandidates =
        Array.isArray(
          brain?.actions
        )
          ? brain.actions
          : [];

      for (
        const action
        of actionCandidates
      ) {
        if (
          !action?.action
        ) {
          continue;
        }

        const actionId =
          actionNodeMap.get(
            buildComparableValue(
              action.action
            )
          );

        if (
          actionId
        ) {
          addEdge(
            graph,
            eventId,
            actionId,
            "may_require"
          );
        }
      }
    }
  }

  /*
   * =====================================================
   * IMPORTANT FACTS
   * =====================================================
   */

  for (
    const fact
    of Array.isArray(
      brain?.importantFacts
    )
      ? brain.importantFacts
      : []
  ) {
    if (
      !fact?.value
    ) {
      continue;
    }

    const factId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "important_fact",

          label:
            fact.label ||
            fact.kind ||
            "Fait important",

          data:
            fact
        }
      );

    addEdge(
      graph,
      documentId,
      factId,
      "has_important_fact",
      {
        confidence:
          fact?.confidence ||
          0,

        verified:
          Boolean(
            fact?.verified
          )
      }
    );

    /*
     * Relier un fact au montant correspondant.
     */

    if (
      fact?.kind ===
        "amount"
    ) {
      const amountId =
        amountNodeMap.get(
          buildComparableValue(
            fact.value
          )
        );

      if (
        amountId
      ) {
        addEdge(
          graph,
          factId,
          amountId,
          "refers_to"
        );
      }
    }

    /*
     * Relier un fact à la date correspondante.
     */

    if (
      fact?.kind ===
        "date"
    ) {
      const dateId =
        dateNodeMap.get(
          buildComparableValue(
            fact.value
          )
        );

      if (
        dateId
      ) {
        addEdge(
          graph,
          factId,
          dateId,
          "refers_to"
        );
      }
    }

    /*
     * Intent.
     */

    if (
      fact?.kind ===
        "intent" &&
      intentId
    ) {
      addEdge(
        graph,
        factId,
        intentId,
        "refers_to"
      );
    }

    /*
     * Issuer.
     */

    if (
      fact?.kind ===
        "issuer" &&
      issuerId
    ) {
      addEdge(
        graph,
        factId,
        issuerId,
        "refers_to"
      );
    }
  }

  /*
   * =====================================================
   * CONTRADICTIONS
   * =====================================================
   */

  for (
    const contradiction
    of Array.isArray(
      brain?.contradictions
    )
      ? brain.contradictions
      : []
  ) {
    const contradictionId =
      addNode(
        graph,
        nodeIndex,
        {
          type:
            "contradiction",

          label:
            contradiction?.type ||
            "Contradiction",

          data:
            contradiction
        }
      );

    addEdge(
      graph,
      documentId,
      contradictionId,
      "has_contradiction",
      {
        severity:
          contradiction?.severity ||
          "unknown"
      }
    );
  }

  /*
   * =====================================================
   * META
   * =====================================================
   */

  graph.meta = {
    version:
      "2.0",

    nodeCount:
      graph.nodes.length,

    edgeCount:
      graph.edges.length,

    documentNode:
      documentId,

    eventCount:
      eventNodeIds.length,

    generatedAt:
      null
  };

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

  /*
   * Node déjà existant.
   */

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

    type:
      node?.type ||
      "unknown",

    label:
      String(
        node?.label ||
        ""
      ),

    data:
      node?.data ||
      {}
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
  relation,
  data = {}
) {
  if (
    !from ||
    !to ||
    !relation
  ) {
    return;
  }

  /*
   * Éviter les doublons exacts.
   */

  const exists =
    graph.edges.some(
      (edge) =>
        edge.from === from &&
        edge.to === to &&
        edge.relation === relation
    );

  if (
    exists
  ) {
    return;
  }

  graph.edges.push({
    from,
    to,
    relation,
    data
  });
}

/**
 * =====================================================
 * CLE UNIQUE NODE
 * =====================================================
 */

function buildNodeKey(
  node
) {
  return [
    normalizeComparable(
      node?.type
    ),

    normalizeComparable(
      node?.label
    )
  ]
    .join(
      "::"
    );
}

/**
 * =====================================================
 * COMPARAISON
 * =====================================================
 */

function buildComparableValue(
  value
) {
  return normalizeComparable(
    value
  );
}

function normalizeComparable(
  value
) {
  return String(
    value || ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[’']/g,
      "'"
    )
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /,/g,
      "."
    )
    .trim();
}
