/**
 * Nettoyage intégral d’une session documentaire V3.
 * Aucune persistance — toutes les références mémoire sont coupées.
 */

import type { DocumentSession } from "./DocumentSession.js";

function revokeObjectUrl(url: string): void {
  try {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(url);
    }
  } catch {
    // ignore
  }
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  try {
    const ctx = canvas.getContext?.("2d");
    if (ctx && canvas.width && canvas.height) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore
  }
}

function abortController(controller: AbortController): void {
  try {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  } catch {
    // ignore
  }
}

function clearDocumentPages(session: DocumentSession): void {
  const pages = session.document?.pages;
  if (!pages) {
    return;
  }

  for (const page of pages) {
    page.bytes = null;
    page.file = null;
  }
}

/**
 * Détruit entièrement la session courante :
 * texte, OCR, buffers, chat, contextes, ObjectURL, canvas,
 * AbortController, et toutes les références mémoire suivies.
 */
export function destroyDocumentSession(session: DocumentSession | null | undefined): void {
  if (!session) {
    return;
  }

  for (const controller of session.abortControllers) {
    abortController(controller);
  }
  session.abortControllers.length = 0;

  for (const url of session.objectUrls) {
    revokeObjectUrl(url);
  }
  session.objectUrls.length = 0;

  for (const canvas of session.canvases) {
    clearCanvas(canvas);
  }
  session.canvases.length = 0;

  session.buffers.length = 0;
  session.extras.length = 0;

  clearDocumentPages(session);

  session.document = null;
  session.ocr = null;
  session.text = null;
  session.localAnalysis = null;
  session.aiContext = null;
  session.analysisResult = null;
  session.chat.length = 0;
}
