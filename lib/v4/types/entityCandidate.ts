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

/** Raison atomique et traçable d’un delta de score. */
export interface ScoreReason {
  signal: string;
  delta: number;
}

/**
 * Hypothèse de rôle pour un candidat.
 * score : 0..1 (somme clampée des deltas). Aucun winner définitif à ce stade.
 */
export interface RoleHypothesis {
  role: string;
  score: number;
  reasons: ScoreReason[];
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
  /** Fenêtre textuelle locale (ligne ± voisines) pour le scoring. */
  context?: CandidateContext;
}

/** Contexte lexical / spatial autour d’une détection. */
export interface CandidateContext {
  sameLine: string;
  previousLine: string;
  nextLine: string;
  /** Avant le match sur la même ligne. */
  before: string;
  /** Après le match sur la même ligne. */
  after: string;
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
  | "refundAmount"
  | "amountPaid"
  | "amountHT"
  | "amountTTC"
  | "vatAmount"
  | "linePrice"
  | "offerPrice"
  | "taxAmount"
  | "balance"
  | "netToPay"
  | "capitalSocial"
  | "other";
