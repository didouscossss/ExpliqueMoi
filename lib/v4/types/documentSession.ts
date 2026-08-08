/**
 * Session documentaire temporaire (confidentialité).
 * - aucun stockage permanent
 * - destruction explicite après rendu
 * - texte / blocs / candidats restent en mémoire volatile uniquement
 */

import type { DocumentClassification } from "./documentClassification.js";
import type { EntityCandidate } from "./entityCandidate.js";
import type { Relation } from "./relation.js";
import type { TextBlock } from "./textBlock.js";

let sessionSeq = 0;

function nextSessionId(): string {
  sessionSeq += 1;
  return `v4sess_${Date.now().toString(36)}_${sessionSeq}`;
}

export interface DocumentSessionInit {
  /** Texte brut optionnel (source text / agrégat OCR). */
  rawText?: string | null;
  blocks?: TextBlock[];
  meta?: Record<string, unknown>;
}

/**
 * Conteneur volatile de l’analyse V4.
 * Après `destroy()`, toute lecture / écriture lève.
 */
export class DocumentSession {
  readonly id: string;
  readonly createdAt: number;
  private _destroyed = false;
  private _rawText: string | null = null;
  private _blocks: TextBlock[] = [];
  private _candidates: EntityCandidate[] = [];
  private _relations: Relation[] = [];
  private _classification: DocumentClassification | null = null;
  private _meta: Record<string, unknown> = {};

  private constructor(id: string, init?: DocumentSessionInit) {
    this.id = id;
    this.createdAt = Date.now();
    if (init?.rawText != null) this._rawText = String(init.rawText);
    if (init?.blocks?.length) this._blocks = [...init.blocks];
    if (init?.meta) this._meta = { ...init.meta };
  }

  static create(init?: DocumentSessionInit): DocumentSession {
    return new DocumentSession(nextSessionId(), init);
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Garde-fou interne — à appeler avant tout accès. */
  assertAlive(): void {
    if (this._destroyed) {
      throw new Error(
        "DocumentSession destroyed — données documentaires indisponibles (confidentialité V4)."
      );
    }
  }

  get rawText(): string | null {
    this.assertAlive();
    return this._rawText;
  }

  setRawText(text: string | null): void {
    this.assertAlive();
    this._rawText = text == null ? null : String(text);
  }

  get blocks(): readonly TextBlock[] {
    this.assertAlive();
    return this._blocks;
  }

  setBlocks(blocks: TextBlock[]): void {
    this.assertAlive();
    this._blocks = [...blocks];
  }

  addBlocks(blocks: TextBlock[]): void {
    this.assertAlive();
    this._blocks.push(...blocks);
  }

  get candidates(): readonly EntityCandidate[] {
    this.assertAlive();
    return this._candidates;
  }

  setCandidates(candidates: EntityCandidate[]): void {
    this.assertAlive();
    this._candidates = [...candidates];
  }

  addCandidates(candidates: EntityCandidate[]): void {
    this.assertAlive();
    this._candidates.push(...candidates);
  }

  get relations(): readonly Relation[] {
    this.assertAlive();
    return this._relations;
  }

  setRelations(relations: Relation[]): void {
    this.assertAlive();
    this._relations = [...relations];
  }

  addRelations(relations: Relation[]): void {
    this.assertAlive();
    this._relations.push(...relations);
  }

  get classification(): DocumentClassification | null {
    this.assertAlive();
    return this._classification;
  }

  setClassification(classification: DocumentClassification | null): void {
    this.assertAlive();
    this._classification = classification;
  }

  getMeta(key: string): unknown {
    this.assertAlive();
    return this._meta[key];
  }

  setMeta(key: string, value: unknown): void {
    this.assertAlive();
    this._meta[key] = value;
  }

  /**
   * Destruction explicite : efface texte, blocs, candidats, relations.
   * Obligatoire après rendu UI (politique confidentialité V4).
   */
  destroy(): void {
    if (this._destroyed) return;
    this._rawText = null;
    this._blocks.length = 0;
    this._candidates.length = 0;
    this._relations.length = 0;
    this._classification = null;
    this._meta = {};
    this._destroyed = true;
  }
}
