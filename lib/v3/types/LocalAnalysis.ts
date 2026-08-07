/**
 * Analyse locale déterministe V3 (sans IA).
 */

export type LocalDocumentType =
  | "facture"
  | "devis"
  | "contrat"
  | "bulletin_de_salaire"
  | "releve_bancaire"
  | "courrier"
  | "ordonnance"
  | "document_inconnu";

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
  /** HT | TVA | TTC | net_a_payer | montant_a_payer | … */
  label?: string | null;
  /**
   * Force du libellé / contexte (plus élevé = total / à payer plutôt qu’une ligne partielle).
   * Utilisé pour choisir le montant principal sans confondre un prix unitaire avec le total.
   */
  rank?: number;
  page?: number | null;
}

export interface LocalReferenceFinding {
  kind: string;
  value: string;
  page?: number | null;
}

export interface LocalContactFinding {
  kind: "phone" | "email" | "address" | "person" | "company" | string;
  value: string;
  page?: number | null;
}

/**
 * Preuve locale : extrait verbatim du texte/OCR (jamais reformulé par l’IA).
 */
export interface LocalEvidenceSpan {
  id: string;
  /** Texte exact présent dans le document. */
  quote: string;
  /** Champ structuré lié (amountHT, amountTTC, date, invoiceNumber…). */
  field: string;
  /** Libellé humain court. */
  label: string;
  page?: number | null;
  /** Offset caractère dans fullText si trouvé. */
  start?: number | null;
  end?: number | null;
  source: "ocr" | "text";
}

/** Champs structurés demandés à l’étape D. */
export interface LocalAnalysisFields {
  companyName: string | null;
  clientName: string | null;
  date: string | null;
  amountHT: number | null;
  amountTVA: number | null;
  amountTTC: number | null;
  /** Total à payer / montant du prélèvement (facture). */
  amountToPay: number | null;
  /** Net à payer (bulletin, parfois facture). */
  netToPay: number | null;
  iban: string | null;
  siret: string | null;
  invoiceNumber: string | null;
}

export interface LocalAnalysis {
  documentType: LocalDocumentType;
  issuer: string | null;
  dates: LocalDateFinding[];
  deadlines: LocalDateFinding[];
  amounts: LocalAmountFinding[];
  references: LocalReferenceFinding[];
  contacts: LocalContactFinding[];
  requiredDocuments: string[];
  detectedActions: string[];
  warnings: string[];
  /** Accès direct aux champs clés (JSON structuré). */
  fields: LocalAnalysisFields;
  /** Score de classification 0–1. */
  documentTypeConfidence: number;
  /** Preuves locales (extraits verbatim). */
  evidence: LocalEvidenceSpan[];
  /** Résumé factuel court généré localement (sans IA). */
  factualSummary: string | null;
}
