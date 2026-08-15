import { runDocumentReasoner }
from "./documentReasoner.js";

import { verifyBrainFacts }
from "./factVerifier.js";

export function runBrain({
  text,
  extraction,
  detection
}) {
  const brain =
    runDocumentReasoner({
      text,
      extraction,
      detection
    });

  return verifyBrainFacts(
    brain
  );
}
