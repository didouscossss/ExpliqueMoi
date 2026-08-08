/**
 * Détection de langue légère (sans fournisseur IA).
 * Heuristique FR / EN à partir du texte déjà extrait.
 */

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  method: "heuristic" | "empty";
}

const FR_MARKERS = [
  "le",
  "la",
  "les",
  "des",
  "une",
  "un",
  "et",
  "est",
  "pour",
  "dans",
  "vous",
  "nous",
  "votre",
  "facture",
  "échéance",
  "montant",
  "madame",
  "monsieur",
  "bonjour",
  "cordialement",
  "règlement",
  "impôt",
  "urssaf",
  "siret"
];

const EN_MARKERS = [
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "invoice",
  "payment",
  "amount",
  "please",
  "dear",
  "regards",
  "account",
  "number",
  "total"
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9àâäéèêëïîôùûüç]+/i)
    .filter((token) => token.length >= 2);
}

/**
 * Détecte principalement `fra` ou `eng` (codes proches Tesseract).
 */
export function detectLanguageFromText(text: string): LanguageDetectionResult {
  const normalized = String(text || "").trim();
  if (normalized.replace(/\s+/g, "").length < 8) {
    return { language: "und", confidence: 0, method: "empty" };
  }

  const tokens = tokenize(normalized);
  if (!tokens.length) {
    return { language: "und", confidence: 0, method: "empty" };
  }

  const set = new Set(tokens);
  let fr = 0;
  let en = 0;

  for (const marker of FR_MARKERS) {
    if (set.has(marker)) {
      fr += 1;
    }
  }
  for (const marker of EN_MARKERS) {
    if (set.has(marker)) {
      en += 1;
    }
  }

  // Accents / caractères typiquement français
  if (/[àâäéèêëïîôùûüçœ]/i.test(normalized)) {
    fr += 2;
  }

  const total = fr + en;
  if (total === 0) {
    return { language: "und", confidence: 0.2, method: "heuristic" };
  }

  if (fr >= en) {
    return {
      language: "fra",
      confidence: Math.min(0.99, 0.45 + fr / (total + 2)),
      method: "heuristic"
    };
  }

  return {
    language: "eng",
    confidence: Math.min(0.99, 0.45 + en / (total + 2)),
    method: "heuristic"
  };
}
