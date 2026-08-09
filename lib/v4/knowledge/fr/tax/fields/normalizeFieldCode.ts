/**
 * Normalisation des codes de cases fiscales FR.
 */

const FIELD_CODE_RE = /^([1-9])([A-Z]{1,2})$/;

export function normalizeTaxFieldCode(raw: string): {
  normalizedCode: string;
  valid: boolean;
} {
  const cleaned = String(raw || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z0-9]/g, "");
  if (!FIELD_CODE_RE.test(cleaned)) {
    return { normalizedCode: cleaned, valid: false };
  }
  return { normalizedCode: cleaned, valid: true };
}

export function looksLikeTaxFieldCode(raw: string): boolean {
  return normalizeTaxFieldCode(raw).valid;
}
