/**
 * Entité candidate générique.
 * Une valeur détectée ne reçoit PAS immédiatement un rôle définitif :
 * MoneyCandidate → hypothèses invoiceTotal / offerPrice / taxAmount / …
 */

import type { BoundingBox } from "./geometry.js";
import type { EvidenceSpan } from "./evidence.js";

/**
 * Types d’entités du socle (extensible via string pour évolutions futures,
 * mais la liste initiale est fermée pour la V4-A).
 */
export type EntityType =
  | "person"
  | "organization"
  | "date"
  | "money"
  | "percentage"
  | "address"
  | "phone"
  | "email"
  | "reference"
  | "accountNumber"
  | "invoiceNumber"
  | "siren"
  | "siret"
  | "iban"
  | "bic"
  | "period"
  | "deadline"
  | "documentTitle"
  | "sectionTitle"
  | "action"
  | "obligation"
  | "warning"
  | "table";

/**
 * Hypothèse de rôle pour un candidat.
 * score : 0..100 (plus lisible pour le debug / ranking).
 */
export interface RoleHypothesis {
  role: string;
  score: number;
  reasons?: string[];
}

/**
 * Candidat générique. Alias sémantiques courants :
 * - type "money"  → MoneyCandidate
 * - type "person" → PersonCandidate
 * - etc.
 */
export interface EntityCandidate<T = unknown> {
  id: string;
  type: EntityType;
  /** Valeur normalisée (nombre, ISO date, string…) — pas encore un rôle métier. */
  value: T;
  /** Forme brute telle qu’extraite. */
  raw?: string;
  /** Plusieurs hypothèses de rôle ; ne pas choisir trop tôt. */
  hypotheses: RoleHypothesis[];
  evidence: EvidenceSpan[];
  page: number;
  blockIds?: string[];
  bbox?: BoundingBox | null;
}

/** Alias explicites demandés par l’architecture (même structure). */
export type MoneyCandidate = EntityCandidate<number>;
export type PersonCandidate = EntityCandidate<string>;
export type OrganizationCandidate = EntityCandidate<string>;
export type DateCandidate = EntityCandidate<string>;
export type PercentageCandidate = EntityCandidate<number>;
export type ReferenceCandidate = EntityCandidate<string>;
export type TableCandidate = EntityCandidate<unknown>;

/** Rôles monétaires fréquents (non exhaustif — le profil peut en ajouter). */
export type MoneyRole =
  | "invoiceTotal"
  | "amountDue"
  | "amountHT"
  | "vatAmount"
  | "offerPrice"
  | "taxAmount"
  | "balance"
  | "netToPay"
  | "other";
