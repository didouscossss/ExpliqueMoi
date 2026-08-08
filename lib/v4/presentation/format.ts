/**
 * Formatters déterministes FR — pas de LLM.
 */

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre"
];

export function formatMoneyFR(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const formatted = n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} €`;
}

/** Accepte ISO YYYY-MM-DD ou déjà formaté. */
export function formatDateFR(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return null; // ambigu — ne pas choisir
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12) return s;
    return `${d} ${MONTHS[mo - 1]} ${y}`;
  }
  // déjà une date FR lisible
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s;
  return s.length <= 40 ? s : null;
}

export function documentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    invoice: "facture",
    bankStatement: "relevé bancaire",
    taxDocument: "document fiscal",
    administrativeLetter: "courrier administratif",
    contract: "contrat",
    payslip: "bulletin de paie",
    receipt: "reçu",
    notice: "avis",
    form: "formulaire",
    certificate: "attestation",
    financialStatement: "état financier",
    explanatoryDocument: "document explicatif",
    unknown: "document"
  };
  return map[type] || "document";
}

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isUsableFactStatus(status: string): boolean {
  return status === "supported" || status === "derived";
}

export function factKey(field: string, kind?: string): string {
  return kind && kind !== field ? `${field}:${kind}` : field;
}
