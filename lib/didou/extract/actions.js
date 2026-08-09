/**
 * C — Phrases d'obligation / action / échéance.
 */

const ACTION_PATTERNS = [
  {
    re: /\b(?:vous\s+(?:devez|êtes\s+prié|etes\s+prie)|merci\s+de|veuillez|prière\s+de|il\s+vous\s+est\s+demandé)\b[^.!\n]{5,160}/gi,
    kind: "request"
  },
  {
    re: /\b(?:à\s+retourner|a\s+retourner|à\s+payer|a\s+payer|régler|regler|transmettre|envoyer|répondre|repondre|participer|donner\s+procuration|voter)\b[^.!\n]{0,120}/gi,
    kind: "action"
  },
  {
    re: /\b(?:avant\s+le|au\s+plus\s+tard\s+le|date\s+limite|échéance|echeance)\b[^.!\n]{0,100}/gi,
    kind: "deadline"
  },
  {
    re: /\b(?:ordre\s+du\s+jour|procuration|pouvoir|vote\s+par\s+correspondance)\b[^.!\n]{0,140}/gi,
    kind: "meeting"
  }
];

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractActionPhrases(text) {
  const source = String(text || "");
  const results = [];
  const seen = new Set();

  for (const pattern of ACTION_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(source))) {
      const phrase = match[0].replace(/\s+/g, " ").trim();
      const key = phrase.toLowerCase();
      if (seen.has(key) || phrase.length < 8) continue;
      seen.add(key);
      results.push({
        phrase,
        kind: pattern.kind,
        confidence: pattern.kind === "deadline" ? 75 : 65
      });
    }
  }

  return results.slice(0, 20);
}
