/**
 * Normalisation robuste des références fiscales FR.
 * rawReference ≠ normalizedReference — ne fusionne pas des refs distinctes.
 */

export type TaxVariantKind =
  | "base"
  | "complement"
  | "pro"
  | "rici"
  | "sd"
  | "nr"
  | "ifi"
  | "iom"
  | "other"
  | "unknown";

export interface NormalizedTaxReference {
  rawReference: string;
  normalizedReference: string;
  baseReference: string;
  variantKind: TaxVariantKind;
  suffixes: string[];
  /** Segments après la base numérique. */
  variantParts: string[];
}

const VARIANT_MAP: Record<string, TaxVariantKind> = {
  C: "complement",
  PRO: "pro",
  RICI: "rici",
  SD: "sd",
  NR: "nr",
  IFI: "ifi",
  IOM: "iom"
};

/**
 * Normalise une référence formulaire.
 * Ex. "2042 C PRO" → 2042-C-PRO ; "3310 CA3 SD" → 3310-CA3-SD
 */
export function normalizeTaxReference(raw: string): NormalizedTaxReference {
  const rawReference = String(raw || "").trim();
  let s = rawReference.toUpperCase();
  s = s
    .replace(/[–—]/g, "-")
    .replace(/[_./]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/N[°ºO]\s*/g, "")
    .replace(/FORMULAIRE-?/g, "")
    .replace(/CERFA-?/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // 2042CPRO → 2042-C-PRO etc. (conservative known patterns)
  s = s
    .replace(/^(2042)CPRO$/, "$1-C-PRO")
    .replace(/^(2042)C$/, "$1-C")
    .replace(/^(2042)RICI$/, "$1-RICI")
    .replace(/^(2042)IFI$/, "$1-IFI")
    .replace(/^(2042)NR$/, "$1-NR")
    .replace(/^(2042)IOM$/, "$1-IOM")
    .replace(/^(3310)CA3SD$/, "$1-CA3-SD")
    .replace(/^(3310)CA3$/, "$1-CA3")
    .replace(/^(1330)CVAESD$/, "$1-CVAE-SD")
    .replace(/^(2065)SD$/, "$1-SD")
    .replace(/^(2572)SD$/, "$1-SD")
    .replace(/^(2031)SD$/, "$1-SD")
    .replace(/^(2035)SD$/, "$1-SD");

  // Insert hyphens between digit block and letter block if missing: 2042C-PRO already handled
  s = s.replace(/^(\d{3,4})([A-Z])/, "$1-$2");

  const parts = s.split("-").filter(Boolean);
  const baseReference = parts[0] || s;
  const variantParts = parts.slice(1);
  const suffixes = [...variantParts];

  let variantKind: TaxVariantKind = "base";
  if (variantParts.length === 0) variantKind = "base";
  else if (variantParts.includes("PRO")) variantKind = "pro";
  else if (variantParts.includes("RICI")) variantKind = "rici";
  else if (variantParts.includes("IFI")) variantKind = "ifi";
  else if (variantParts.includes("NR")) variantKind = "nr";
  else if (variantParts.includes("IOM")) variantKind = "iom";
  else if (variantParts.includes("C") && !variantParts.includes("CA3") && !variantParts.includes("CFE") && !variantParts.includes("CET"))
    variantKind = "complement";
  else if (variantParts.includes("SD")) variantKind = "sd";
  else variantKind = VARIANT_MAP[variantParts[0]!] || "other";

  return {
    rawReference,
    normalizedReference: parts.join("-"),
    baseReference,
    variantKind,
    suffixes,
    variantParts
  };
}

/**
 * Correction OCR conservative O↔0 / I↔1 uniquement si le candidat
 * matche une référence connue après correction ET contexte fiscal fort.
 */
export function ocrRepairTaxReference(
  raw: string,
  knownNormalized: ReadonlySet<string>
): { candidate: string; reason: string } | null {
  const upper = raw.toUpperCase();
  // Only attempt if looks like form-ish (digits+letters, has O or I ambiguity)
  if (!/[OIoi]/.test(raw) && !/\d/.test(raw)) return null;
  if (!/(?:\d|[O]){3,}/.test(upper)) return null;

  const attempts = [
    upper.replace(/O/g, "0"),
    upper.replace(/I/g, "1"),
    upper.replace(/O/g, "0").replace(/I/g, "1")
  ];
  for (const a of attempts) {
    const n = normalizeTaxReference(a).normalizedReference;
    if (knownNormalized.has(n)) {
      return { candidate: n, reason: "ocr:O/I→digit in known formReference" };
    }
  }
  return null;
}

export function referencesEquivalent(a: string, b: string): boolean {
  return (
    normalizeTaxReference(a).normalizedReference ===
    normalizeTaxReference(b).normalizedReference
  );
}
