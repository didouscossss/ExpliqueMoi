/**
 * Session documentaire V3 (navigateur) — mémoire volatile uniquement.
 */

export class DocumentSession {
  constructor() {
    this.document = null;
    this.ocr = null;
    this.text = null;
    this.localAnalysis = null;
    this.aiContext = null;
    this.analysisResult = null;
    this.chat = [];
    this.objectUrls = [];
    this.canvases = [];
    this.abortControllers = [];
    this.buffers = [];
    this.extras = [];
    this.files = [];
  }

  trackObjectUrl(url) {
    if (url) this.objectUrls.push(url);
  }

  trackCanvas(canvas) {
    if (canvas) this.canvases.push(canvas);
  }

  trackAbortController(controller) {
    if (controller) this.abortControllers.push(controller);
  }

  trackFile(file) {
    if (file) this.files.push(file);
  }
}

function revokeObjectUrl(url) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function clearCanvas(canvas) {
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

/**
 * Nettoyage intégral : texte, OCR, buffers, chat, contextes,
 * ObjectURL, canvas, AbortController, fichiers.
 */
export function destroyDocumentSession(session) {
  if (!session) return;

  for (const controller of session.abortControllers || []) {
    try {
      if (!controller.signal.aborted) controller.abort();
    } catch {
      // ignore
    }
  }
  session.abortControllers = [];

  for (const url of session.objectUrls || []) {
    revokeObjectUrl(url);
  }
  session.objectUrls = [];

  for (const canvas of session.canvases || []) {
    clearCanvas(canvas);
  }
  session.canvases = [];

  session.buffers = [];
  session.extras = [];
  session.files = [];
  session.document = null;
  session.ocr = null;
  session.text = null;
  session.localAnalysis = null;
  session.aiContext = null;
  session.analysisResult = null;
  session.chat = [];
}
