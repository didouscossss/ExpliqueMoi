/**
 * Profil documentaire de classification — indépendant du routeur.
 * Ajouter un type = enregistrer un nouveau SchemaProfile.
 */

import type {
  DocumentTypeId,
  SignalFamily
} from "../types/documentClassification.js";
import type { EntityType } from "../types/entityCandidate.js";

export type SignalMatcher =
  | { kind: "regex"; pattern: RegExp; label: string }
  | { kind: "entity"; entityType: EntityType; min?: number; label: string }
  | {
      kind: "relation";
      relationType: string;
      min?: number;
      label: string;
    }
  | {
      kind: "arithmetic";
      label: string;
    }
  | {
      kind: "structure";
      /** Clé structurelle évaluée par le scorer. */
      key:
        | "hasTransactionTable"
        | "hasHtTvaTtc"
        | "hasLetterFormulas"
        | "hasFormFields"
        | "hasPayslipMarks"
        | "hasContractMarks"
        | "hasTaxMarks"
        | "hasFinancialStatementMarks"
        | "hasCertificateMarks"
        | "hasReceiptMarks"
        | "hasNoticeMarks"
        | "hasExplanatoryMarks";
      label: string;
    }
  | {
      kind: "absence";
      /** Pénalité si la structure attendue est absente. */
      key:
        | "hasTransactionTable"
        | "hasHtTvaTtc"
        | "hasLetterFormulas";
      label: string;
    };

export interface SchemaSignal {
  family: SignalFamily;
  /** Poids relatif 0..1 avant multiplication par poids de famille. */
  weight: number;
  matcher: SignalMatcher;
}

/**
 * DocumentProfile de classification (V4-D).
 * Ne pas confondre avec DocumentProfile d’analyse métier (supports/analyze).
 */
export interface SchemaProfile {
  type: DocumentTypeId;
  positiveSignals: SchemaSignal[];
  negativeSignals: SchemaSignal[];
  expectedEntities: EntityType[];
  expectedRelations: string[];
  expectedStructures: string[];
  contradictions?: string[];
}
