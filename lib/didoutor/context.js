/**
 * Frontière Didou → Didoutor.
 * Didoutor reçoit un contexte stable, pas le pipeline interne Didou.
 * Aucun appel IA ici — préparation uniquement.
 */

/**
 * @param {object} didouResult
 * @returns {object|null}
 */
export function buildDidoutorContext(didouResult) {
  if (!didouResult || typeof didouResult !== "object") {
    return null;
  }

  return {
    sourceEngine: "didou",
    sourceVersion: didouResult.version || null,
    family: didouResult.family || null,
    documentType: didouResult.documentType || null,
    confidence: didouResult.confidence ?? null,
    understandingLevel: didouResult.understandingLevel || null,
    issuer: didouResult.issuer || null,
    recipient: didouResult.recipient || null,
    userSummary: didouResult.userSummary || null,
    whyReceived: didouResult.whyReceived || null,
    documentPurpose: didouResult.documentPurpose || null,
    mainDate: didouResult.mainDate || null,
    mainAmount: didouResult.mainAmount || null,
    importantFacts: didouResult.importantFacts || [],
    actions: didouResult.actions || [],
    deadlines: didouResult.deadlines || [],
    references: didouResult.references || [],
    entities: didouResult.entities || {},
    evidence: didouResult.evidence || [],
    warnings: didouResult.warnings || [],
    uncertainties: didouResult.uncertainties || [],
    attentionLevel: didouResult.attentionLevel || null
    // Intentionnellement OMIS : extraction brute, regex internes, scores de signaux
  };
}
