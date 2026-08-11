/**
 * C — Personnes, organismes, adresses, références.
 */

const ORG_HINTS =
  /\b(SCI|SAS|SARL|SA|EURL|syndic|CAF|CPAM|URSSAF|DGFIP|imp[oô]ts|Free|Orange|EDF|Engie|assurance|banque|crédit)\b/gi;

const LABELED_ORG_INLINE_RE =
  /\b(?:organisme(?:\s+de\s+gestion)?|service public|émetteur|emetteur|créancier|creancier)\s*[:\-]?\s+([A-Z][A-Z0-9À-ÖØ-Ý&' .-]{2,40})/gi;

const REF_PATTERNS = [
  { type: "invoice", re: /\b(?:facture|n[°o]|num(?:éro)?)\s*[:\s-]?\s*([A-Z0-9][-A-Z0-9\/]{4,})\b/gi },
  { type: "file", re: /\b(?:dossier|réf(?:érence)?|ref)\s*[:\s-]?\s*([A-Z0-9][-A-Z0-9\/]{3,})\b/gi },
  { type: "form", re: /\b(2031(?:-SD)?|2035(?:-SD)?|2042|Cerfa\s*\d{4,})\b/gi },
  { type: "siret", re: /\bSIRET\s*[:\s]?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/gi },
  { type: "iban", re: /\b(FR\d{2}(?:\s?\d{4}){5}\s?\d{3})\b/gi }
];

const ADDRESS_RE =
  /\b(\d{1,4}\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av\.|bd|boulevard|chemin|impasse|place|allée|allee)[^,\n]{5,60},\s*\d{5}\s+[A-ZÉÈÊÀÂÎÔÛÇa-zéèêàâîôûç' -]{2,40})\b/gi;

/**
 * @param {string} text
 * @returns {{ organizations: string[], addresses: string[], references: object[], people: string[] }}
 */
export function extractEntities(text) {
  const source = String(text || "");
  const organizations = new Set();
  const addresses = new Set();
  const people = new Set();
  const references = [];
  const seenRef = new Set();

  let match;
  // Lignes type "Organisme : ..." / "Bailleur : ..." (prioritaires)
  for (const line of source.split(/\n/)) {
    const labeled = line.match(
      /^\s*(organisme|émetteur|emetteur|bailleur|syndic|destinataire|locataire|propriétaire|proprietaire)\s*[:\-]\s*(.+)$/i
    );
    if (!labeled) continue;
    const role = labeled[1].toLowerCase();
    const value = labeled[2].trim();
    if (!value) continue;
    if (/locataire|destinataire/.test(role)) people.add(value);
    else organizations.add(value);
  }

  LABELED_ORG_INLINE_RE.lastIndex = 0;
  while ((match = LABELED_ORG_INLINE_RE.exec(source))) {
    const value = String(match[1] || "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+-.*$/, "")
      .trim();
    if (value && value.length <= 45) organizations.add(value);
  }

  ORG_HINTS.lastIndex = 0;
  while ((match = ORG_HINTS.exec(source))) {
    const token = match[0].trim();
    // Évite de capturer le titre "QUITTANCE DE LOYER" comme organisme
    if (/quittance|loyer|facture/i.test(token)) continue;
    if (organizations.size >= 8) break;
    organizations.add(token);
  }

  ADDRESS_RE.lastIndex = 0;
  while ((match = ADDRESS_RE.exec(source))) {
    addresses.add(match[1].replace(/\s+/g, " ").trim());
  }

  for (const pattern of REF_PATTERNS) {
    pattern.re.lastIndex = 0;
    while ((match = pattern.re.exec(source))) {
      const value = (match[1] || match[0]).replace(/\s+/g, " ").trim();
      const key = `${pattern.type}:${value.toLowerCase()}`;
      if (seenRef.has(key)) continue;
      seenRef.add(key);
      references.push({
        type: pattern.type,
        value,
        context: snippetAround(source, match.index, 60),
        confidence: 70
      });
    }
  }

  return {
    organizations: [...organizations].slice(0, 12),
    addresses: [...addresses].slice(0, 8),
    references: references.slice(0, 20),
    people: [...people].slice(0, 12)
  };
}

function snippetAround(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
