/**
 * Client front V3 — OCR local puis POST /api/v3/analyze (texte uniquement).
 */

import {
  DocumentSession,
  destroyDocumentSession
} from "./documentSession.js";
import { extractOcrFromFiles, terminateTesseract } from "./ocrBrowser.js";
import { mapV3ResponseToUiAnalysis } from "./mapToUiAnalysis.js";

export {
  DocumentSession,
  destroyDocumentSession,
  extractOcrFromFiles,
  mapV3ResponseToUiAnalysis
};

/** Exposition navigateur pour index.html (script non-module). */
if (typeof window !== "undefined") {
  window.ExpliqueMoiV3 = {
    DocumentSession,
    destroyDocumentSession,
    extractOcrFromFiles,
    mapV3ResponseToUiAnalysis,
    analyzeFilesWithV3,
    analyzeTextWithV3
  };
}

/**
 * Analyse V3 à partir de fichiers locaux (PDF / images).
 * N’envoie jamais le PDF/image brut à l’API — uniquement ocrResult.
 */
export async function analyzeFilesWithV3(files, options = {}) {
  const session = options.session || new DocumentSession();
  const signal = options.signal;
  let ocr = null;

  try {
    ocr = await extractOcrFromFiles(files, session);
    session.ocr = ocr;
    session.text = ocr.fullText;

    const data = await postV3Analyze(
      {
        action: "analyze",
        ocrResult: {
          pages: ocr.pages,
          fullText: ocr.fullText,
          warnings: ocr.warnings || []
        }
      },
      { signal, requestId: options.requestId, analysisId: options.analysisId }
    );

    session.localAnalysis = data.localAnalysis || null;
    session.analysisResult = data.result || null;

    return {
      ok: true,
      raw: data,
      uiAnalysis: mapV3ResponseToUiAnalysis(data),
      ocr
    };
  } finally {
    // Fin de traitement : détruire buffers / OCR / fichiers de session.
    // L’UI conserve uniquement uiAnalysis mappé côté appelant.
    destroyDocumentSession(session);
    await terminateTesseract();
    ocr = null;
  }
}

/**
 * Analyse V3 à partir d’un texte déjà saisi (aucune pièce jointe).
 */
export async function analyzeTextWithV3(text, options = {}) {
  const session = options.session || new DocumentSession();
  const cleanText = String(text || "").trim();
  session.text = cleanText;

  try {
    const data = await postV3Analyze(
      {
        action: "analyze",
        text: cleanText,
        ocrResult: {
          pages: [
            { pageNumber: 1, text: cleanText, confidence: 100 }
          ],
          fullText: cleanText,
          warnings: []
        }
      },
      { signal: options.signal, requestId: options.requestId, analysisId: options.analysisId }
    );

    session.localAnalysis = data.localAnalysis || null;
    session.analysisResult = data.result || null;

    return {
      ok: true,
      raw: data,
      uiAnalysis: mapV3ResponseToUiAnalysis(data)
    };
  } finally {
    destroyDocumentSession(session);
  }
}

async function postV3Analyze(body, meta = {}) {
  const response = await fetch(
    `/api/v3/analyze?request=${encodeURIComponent(
      meta.requestId || ""
    )}&analysis=${encodeURIComponent(meta.analysisId || "")}&time=${Date.now()}`,
    {
      method: "POST",
      cache: "no-store",
      signal: meta.signal,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-ExpliqueMoi-Request": String(meta.requestId || ""),
        "X-ExpliqueMoi-Analysis": String(meta.analysisId || ""),
        "X-ExpliqueMoi-Engine": "v3"
      },
      body: JSON.stringify(body)
    }
  );

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(
      "La réponse du service d’analyse V3 est illisible."
    );
    error.code = "INVALID_AI_RESPONSE";
    throw error;
  }

  if (!response.ok || data?.ok === false) {
    const error = new Error(
      data?.error?.message ||
        "Échec de l’analyse V3."
    );
    error.code = data?.error?.code || "EMPTY_AI_RESPONSE";
    error.httpStatus = data?.error?.httpStatus || response.status;
    error.provider = data?.error?.provider || "openai";
    error.details = data?.error || null;
    throw error;
  }

  return data;
}
