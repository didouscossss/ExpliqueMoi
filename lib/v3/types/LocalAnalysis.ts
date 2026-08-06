/**
 * Analyse locale déterministe V3 (sans IA).
 * Signatures uniquement — aucun traitement métier.
 */

export interface LocalDateFinding {
  raw: string;
  iso?: string | null;
  label?: string | null;
  page?: number | null;
}

export interface LocalAmountFinding {
  raw: string;
  value?: number | null;
  currency?: string | null;
  label?: string | null;
  page?: number | null;
}

export interface LocalReferenceFinding {
  kind: string;
  value: string;
  page?: number | null;
}

export interface LocalContactFinding {
  kind: "phone" | "email" | "address" | string;
  value: string;
  page?: number | null;
}

export interface LocalAnalysis {
  documentType: string | null;
  issuer: string | null;
  dates: LocalDateFinding[];
  deadlines: LocalDateFinding[];
  amounts: LocalAmountFinding[];
  references: LocalReferenceFinding[];
  contacts: LocalContactFinding[];
  requiredDocuments: string[];
  detectedActions: string[];
  warnings: string[];
}
