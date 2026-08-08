/**
 * Session documentaire V3 — mémoire volatile uniquement.
 * Gère les références ; aucun traitement métier (OCR/IA) ici.
 */

import type { DocumentInput } from "../types/DocumentInput.js";
import type { OCRResult } from "../types/OCRResult.js";
import type { LocalAnalysis } from "../types/LocalAnalysis.js";
import type { AIContext } from "../types/AIContext.js";
import type { AnalysisResult } from "../types/AnalysisResult.js";

export interface DocumentChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export class DocumentSession {
  document: DocumentInput | null = null;
  ocr: OCRResult | null = null;
  /** Texte consolidé (souvent OCR.fullText). */
  text: string | null = null;
  localAnalysis: LocalAnalysis | null = null;
  aiContext: AIContext | null = null;
  analysisResult: AnalysisResult | null = null;
  chat: DocumentChatMessage[] = [];

  /** Object URLs créés pendant la session (previews, blobs). */
  objectUrls: string[] = [];

  /** Canvas temporaires à détacher / libérer. */
  canvases: HTMLCanvasElement[] = [];

  /** Contrôleurs d’annulation (fetch, OCR workers, etc.). */
  abortControllers: AbortController[] = [];

  /** Buffers binaires temporaires. */
  buffers: ArrayBuffer[] = [];

  /** Références génériques à nullifier (workers, handles…). */
  extras: unknown[] = [];

  setDocument(document: DocumentInput | null): void {
    this.document = document;
  }

  setOcr(ocr: OCRResult | null): void {
    this.ocr = ocr;
    this.text = ocr?.fullText ?? null;
  }

  setText(text: string | null): void {
    this.text = text;
  }

  setLocalAnalysis(localAnalysis: LocalAnalysis | null): void {
    this.localAnalysis = localAnalysis;
  }

  setAiContext(aiContext: AIContext | null): void {
    this.aiContext = aiContext;
  }

  setAnalysisResult(result: AnalysisResult | null): void {
    this.analysisResult = result;
  }

  addChatMessage(message: DocumentChatMessage): void {
    this.chat.push(message);
  }

  trackObjectUrl(url: string): void {
    this.objectUrls.push(url);
  }

  trackCanvas(canvas: HTMLCanvasElement): void {
    this.canvases.push(canvas);
  }

  trackAbortController(controller: AbortController): void {
    this.abortControllers.push(controller);
  }

  trackBuffer(buffer: ArrayBuffer): void {
    this.buffers.push(buffer);
  }
}
