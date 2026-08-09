import type { EntityCandidate, ScoreReason } from "../types/entityCandidate.js";
import type { Relation } from "../types/relation.js";
import { contextHas, evidenceOf, pushReason, roleScore, sumReasons } from "./helpers.js";
import { nextRelationId } from "./ids.js";
import { RELATION_WEIGHTS as W } from "./weights.js";

/**
 * Relations sémantiques génériques : issuer / sender / recipient / organizationPerson.
 */
export function scanSemanticRelations(
  candidates: readonly EntityCandidate[]
): Relation[] {
  const relations: Relation[] = [];
  const orgs = candidates.filter((c) => c.type === "organization");
  const persons = candidates.filter((c) => c.type === "person");

  for (const org of orgs) {
    if (
      roleScore(org, "issuer") > 0.3 ||
      contextHas(org, /emetteur|expediteur/)
    ) {
      const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
      pushReason(reasons, "semantic:issuerLabel", W.semanticIssuer);
      pushReason(reasons, "local:issuer", roleScore(org, "issuer") * 0.2);
      relations.push({
        id: nextRelationId("sem"),
        sourceCandidateId: org.id,
        targetCandidateId: org.id,
        type: "issuer",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(org),
        label: "issuer"
      });
      // alias sender si libellé émetteur/expéditeur
      if (contextHas(org, /emetteur|expediteur/)) {
        relations.push({
          id: nextRelationId("sem"),
          sourceCandidateId: org.id,
          targetCandidateId: org.id,
          type: "sender",
          score: W.semanticSender,
          reasons: [{ signal: "semantic:senderLabel", delta: W.semanticSender }],
          evidence: evidenceOf(org),
          label: "sender"
        });
      }
    }
  }

  for (const person of persons) {
    if (
      roleScore(person, "recipient") > 0.3 ||
      contextHas(person, /destinataire|client/)
    ) {
      const reasons: import("../types/entityCandidate.js").ScoreReason[] = [];
      pushReason(reasons, "semantic:recipientLabel", W.semanticRecipient);
      pushReason(reasons, "local:recipient", roleScore(person, "recipient") * 0.2);
      relations.push({
        id: nextRelationId("sem"),
        sourceCandidateId: person.id,
        targetCandidateId: person.id,
        type: "recipient",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(person),
        label: "recipient"
      });
    }
  }

  // organizationPerson : org émetteur ↔ personne destinataire
  for (const org of orgs) {
    for (const person of persons) {
      if (
        (roleScore(org, "issuer") > 0.25 || contextHas(org, /emetteur/)) &&
        (roleScore(person, "recipient") > 0.25 ||
          contextHas(person, /destinataire/))
      ) {
        relations.push({
          id: nextRelationId("sem"),
          sourceCandidateId: org.id,
          targetCandidateId: person.id,
          type: "organizationPerson",
          score: W.organizationPerson,
          reasons: [
            { signal: "semantic:orgIssuer+personRecipient", delta: W.organizationPerson }
          ],
          evidence: evidenceOf(org, person),
          label: "issuer → recipient"
        });
      }
    }
  }

  return relations;
}
