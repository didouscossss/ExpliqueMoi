/**
 * Explications déterministes des changements de clarification — V4-S.
 */

import type { ClarificationChangeSet } from "../../../../types/knowledge.js";

export function explainClarificationChanges(
  changeSet: ClarificationChangeSet
): string[] {
  const out = [...(changeSet.explanations || [])];

  for (const id of changeSet.factsAdded) {
    if (!out.some((e) => e.includes(id) || /indiqué|indiquée/i.test(e))) {
      out.push("Une information fournie par vous a été enregistrée.");
    }
  }
  for (const id of changeSet.factsSuperseded) {
    if (!out.some((e) => /modifiée|modifié/i.test(e))) {
      out.push(`Une réponse précédente (${id}) a été remplacée explicitement.`);
    }
  }
  for (const id of changeSet.conflictsAdded) {
    if (/userVsUser/i.test(id)) {
      out.push(
        "Deux réponses utilisateur successives diffèrent — l’historique est conservé."
      );
    } else if (/user-doc|userVsDocument/i.test(id)) {
      out.push(
        "Une contradiction entre votre réponse et un document a été conservée sans écrasement."
      );
    }
  }
  for (const r of changeSet.requirementsChanged) {
    out.push(
      `Statut de « ${r.requirementId} » : ${r.from} → ${r.to}${
        r.evidenceSource === "providedByUser"
          ? " (indiqué par vous)"
          : r.evidenceSource === "foundInDocument"
            ? " (trouvé dans vos documents)"
            : ""
      }.`
    );
  }

  // Dédupliquer
  return [...new Set(out)];
}
