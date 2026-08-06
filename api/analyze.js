export const config = {
  api: {
    bodyParser: false
  }
};

import {
  inspectPdf,
  rasterizePdfPages
} from "../lib/pdfProcessing.js";
import {
  callGeminiForAnalysis,
  parseGeminiJson
} from "../lib/geminiAnalysis.js";
import {
  normalizeTables,
  normalizeTimeline,
  normalizeEntities,
  normalizeAmountsDetail
} from "../lib/documentContext.js";
import {
  MAX_DOCUMENT_SIZE,
  buildTooLargeMessage
} from "../lib/pdfChunking.js";
import {
  compressPdfForAnalysis,
  shouldCompressPdf
} from "../lib/pdfCompression.js";

// Limite unique côté document : 4 Mo (pas de limite de pages PDF).
const MAX_FILE_SIZE = MAX_DOCUMENT_SIZE;
const MAX_TOTAL_SIZE = MAX_DOCUMENT_SIZE;
// Limite de fichiers dans un lot multi-photos (≠ pages internes d’un PDF).
const MAX_UPLOAD_FILES = 10;
const VERCEL_BODY_SOFT_LIMIT = 4.4 * 1024 * 1024;
/** Budget interne — répondre en JSON avant le 504 text/plain Vercel (~60s). */
const ANALYSIS_BUDGET_MS = 50_000;
const BUDGET_RESERVE_MS = 2_000;

const HETEROGENEOUS_BATCH_WARNING =
  "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément.";

const ErrorCode = {
  PDF_PROTECTED: "PDF_PROTECTED",
  PDF_CORRUPTED: "PDF_CORRUPTED",
  PDF_NO_USABLE_CONTENT: "PDF_NO_USABLE_CONTENT",
  IMAGE_UNREADABLE: "IMAGE_UNREADABLE",
  NO_USABLE_CONTENT: "NO_USABLE_CONTENT",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  NETWORK_ERROR: "NETWORK_ERROR",
  API_TIMEOUT: "API_TIMEOUT",
  ANALYSIS_TIMEOUT: "ANALYSIS_TIMEOUT",
  EMPTY_AI_RESPONSE: "EMPTY_AI_RESPONSE",
  INVALID_AI_RESPONSE: "INVALID_AI_RESPONSE",
  API_QUOTA_EXCEEDED: "API_QUOTA_EXCEEDED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
};

function fail(code, message, details) {
  const error = { code, message };

  if (details && typeof details === "object") {
    error.details = details;
  }

  return {
    ok: false,
    error,
    warnings: []
  };
}

function succeed(analysis, warnings = [], pdfProcessing = null, timings = null) {
  const payload = {
    ok: true,
    analysis,
    warnings: Array.isArray(warnings) ? warnings : []
  };

  if (pdfProcessing) {
    payload.pdfProcessing = pdfProcessing;
  }

  if (timings) {
    payload.timings = timings;
  }

  return payload;
}

function remainingBudgetMs(requestContext) {
  const started = Number(requestContext?.timings?.startedAt) || Date.now();
  return ANALYSIS_BUDGET_MS - (Date.now() - started);
}

function finalizeTimings(requestContext) {
  const t = requestContext?.timings || {};
  const startedAt = Number(t.startedAt) || Date.now();
  const result = {
    upload_ms: Number(t.upload_ms) || 0,
    ocr_ms: Number(t.ocr_ms) || 0,
    prompt_ms: Number(t.prompt_ms) || 0,
    gemini_ms: Number(t.gemini_ms) || 0,
    gemini_started_at: t.gemini_started_at || null,
    gemini_ended_at: t.gemini_ended_at || null,
    parse_ms: Number(t.parse_ms) || 0,
    enrich_ms: Number(t.enrich_ms) || 0,
    total_ms: Date.now() - startedAt,
    before_bytes: Number(t.before_bytes) || 0,
    after_bytes: Number(t.after_bytes) || Number(t.before_bytes) || 0,
    compressed: Boolean(t.compressed),
    compression_reason: t.compression_reason || null
  };
  console.info("[analyze] stage_timings", result);
  return result;
}

function failBudget(requestContext, details = {}) {
  return fail(
    ErrorCode.ANALYSIS_TIMEOUT,
    "L’analyse a dépassé le budget de 50 secondes. Réessayez avec un document plus léger, ou une architecture asynchrone sera nécessaire.",
    {
      budgetMs: ANALYSIS_BUDGET_MS,
      ...details,
      timings: finalizeTimings(requestContext)
    }
  );
}

function ensureBudget(requestContext, stage) {
  const left = remainingBudgetMs(requestContext);
  if (left < BUDGET_RESERVE_MS) {
    const error = new Error("ANALYSIS_TIMEOUT");
    error.code = ErrorCode.ANALYSIS_TIMEOUT;
    error.stage = stage;
    error.remainingMs = left;
    throw error;
  }
  return left;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json(
      fail(ErrorCode.UNSUPPORTED_FORMAT, "Méthode non autorisée.")
    );
  }

  const requestContext = {
    pages: [],
    manifest: null,
    pageErrors: [],
    warnings: [],
    rawBody: null,
    rawBodySize: 0,
    pdfMeta: [],
    rasterImages: [],
    diagnostics: [],
    timings: {
      startedAt: Date.now(),
      before_bytes: 0,
      after_bytes: 0,
      upload_ms: 0,
      ocr_ms: 0,
      prompt_ms: 0,
      gemini_ms: 0,
      gemini_started_at: null,
      gemini_ended_at: null,
      parse_ms: 0,
      enrich_ms: 0,
      compressed: false,
      compression_reason: null
    }
  };

  try {
    const uploadStarted = Date.now();
    const { formData, bodySize } = await readMultipartRequest(request);
    requestContext.rawBodySize = bodySize;
    requestContext.timings.upload_ms = Date.now() - uploadStarted;
    requestContext.timings.before_bytes = bodySize;

    requestContext.diagnostics.push({
      step: "upload",
      receivedBytes: bodySize,
      contentType: String(request.headers["content-type"] || ""),
      overVercelSoftLimit: bodySize > VERCEL_BODY_SOFT_LIMIT
    });

    if (bodySize > VERCEL_BODY_SOFT_LIMIT) {
      return response.status(413).json(
        fail(
          ErrorCode.FILE_TOO_LARGE,
          "La requête dépasse la limite de taille du serveur (≈ 4,5 Mo sur Vercel). Réduisez le fichier ou le nombre de pages.",
          {
            receivedBytes: bodySize,
            limitBytes: VERCEL_BODY_SOFT_LIMIT
          }
        )
      );
    }

    const text = String(formData.get("text") || "").trim();
    const clientBatchWarning = String(
      formData.get("batch_warning") || ""
    ).trim();

    requestContext.manifest = parseManifest(formData);

    const extraction = await extractPages(
      formData,
      requestContext.manifest
    );
    requestContext.pages = extraction.pages;
    requestContext.pageErrors = extraction.pageErrors;

    requestContext.diagnostics.push({
      step: "extract",
      pageCount: requestContext.pages.length,
      pageErrors: requestContext.pageErrors.length,
      pages: requestContext.pages.map((page) => ({
        name: page.name,
        mimeType: page.mimeType,
        size: page.size,
        order: page.order
      }))
    });

    if (!requestContext.pages.length && text.length < 20) {
      return respondEmptyInput(response, requestContext);
    }

    if (requestContext.pages.length > MAX_UPLOAD_FILES) {
      return response.status(400).json(
        fail(
          ErrorCode.UNSUPPORTED_FORMAT,
          "Le lot dépasse la limite de 10 fichiers.",
          { pageCount: requestContext.pages.length }
        )
      );
    }

    const totalSize = requestContext.pages.reduce(
      (sum, page) => sum + page.size,
      0
    );

    if (totalSize > MAX_TOTAL_SIZE) {
      return response.status(413).json(
        fail(
          ErrorCode.FILE_TOO_LARGE,
          buildTooLargeMessage(totalSize, MAX_TOTAL_SIZE),
          {
            totalSize,
            limitBytes: MAX_TOTAL_SIZE,
            title: "Fichier trop volumineux"
          }
        )
      );
    }

    for (const page of requestContext.pages) {
      if (page.size > MAX_FILE_SIZE) {
        return response.status(413).json(
          fail(
            ErrorCode.FILE_TOO_LARGE,
            buildTooLargeMessage(page.size, MAX_FILE_SIZE),
            {
              name: page.name,
              size: page.size,
              limitBytes: MAX_FILE_SIZE,
              title: "Fichier trop volumineux"
            }
          )
        );
      }
    }

    // OCR / extraction texte PDF (+ compression scannée si besoin)
    const ocrStarted = Date.now();
    const pdfGate = await inspectIncomingPdfs(requestContext);
    requestContext.timings.ocr_ms += Date.now() - ocrStarted;
    console.info("[analyze] stage_ocr_inspect", {
      ms: requestContext.timings.ocr_ms
    });

    if (pdfGate.blockingError) {
      return response.status(pdfGate.status).json(pdfGate.blockingError);
    }

    const heterogeneous =
      requestContext.manifest?.heterogeneous === true ||
      detectHeterogeneousPages(requestContext.pages);

    if (heterogeneous) {
      requestContext.warnings.push(HETEROGENEOUS_BATCH_WARNING);
    } else if (clientBatchWarning) {
      requestContext.warnings.push(clientBatchWarning);
    }

    for (const pageError of requestContext.pageErrors) {
      requestContext.warnings.push(
        pageError.message ||
          `La page « ${pageError.name || "?"} » n’a pas pu être lue.`
      );
    }

    const pdfOnly =
      requestContext.pages.length > 0 &&
      requestContext.pages.every(
        (page) => page.mimeType === "application/pdf"
      );

    const scannedPdf =
      pdfOnly &&
      requestContext.pdfMeta.length > 0 &&
      requestContext.pdfMeta.every((meta) => meta.scanned);

    const totalPdfPages = summarizePageCount(requestContext);

    let pdfProcessing = {
      mode: "direct",
      pageCount: totalPdfPages,
      totalPages: totalPdfPages,
      processedPages: 0,
      readablePages: [],
      failedPages: [],
      chunkCount: 1,
      hasText: requestContext.pdfMeta.some((meta) => meta.hasText),
      scanned: scannedPdf,
      diagnostics: requestContext.diagnostics
    };

    // -------- Compression PDF scannés / images lourdes (compté dans OCR) --------
    const compressStarted = Date.now();
    ensureBudget(requestContext, "ocr_compress");

    const compression = await prepareDocumentsForGemini(requestContext);
    requestContext.timings.ocr_ms += Date.now() - compressStarted;
    requestContext.timings.after_bytes = compression.afterBytes;
    requestContext.timings.compressed = compression.compressed;
    requestContext.timings.compression_reason = compression.reason;
    console.info("[analyze] stage_ocr_total", {
      ocr_ms: requestContext.timings.ocr_ms,
      compressed: compression.compressed,
      before: compression.beforeBytes,
      after: compression.afterBytes
    });

    if (compression.tooLarge) {
      return response.status(413).json(
        fail(
          ErrorCode.FILE_TOO_LARGE,
          buildTooLargeMessage(compression.afterBytes, MAX_FILE_SIZE),
          {
            totalSize: compression.afterBytes,
            limitBytes: MAX_FILE_SIZE,
            beforeBytes: compression.beforeBytes,
            timings: finalizeTimings(requestContext)
          }
        )
      );
    }

    // -------- Prompt + un seul appel Gemini --------
    ensureBudget(requestContext, "prompt");
    const promptStarted = Date.now();
    const geminiParts = buildDirectParts(
      text,
      requestContext.pages,
      heterogeneous
    );
    requestContext.timings.prompt_ms = Date.now() - promptStarted;

    const docBytes = requestContext.pages.reduce(
      (sum, page) => sum + (Number(page.size) || 0),
      0
    );
    const imageCount = requestContext.pages.filter((page) =>
      String(page.mimeType || "").startsWith("image/")
    ).length;
    const pdfCount = requestContext.pages.filter(
      (page) => page.mimeType === "application/pdf"
    ).length;

    // TRACE 3 + 4 — taille doc + pages/images (avant appel)
    console.info("[analyze] TRACE_3_document_size", {
      totalBytes: docBytes,
      afterCompressionBytes: compression.afterBytes,
      compressed: compression.compressed,
      pages: requestContext.pages.map((page) => ({
        name: page.name,
        mimeType: page.mimeType,
        size: page.size,
        order: page.order,
        pdfPageCount: page.pdfPageCount || null,
        pdfHasText: page.pdfHasText ?? null
      }))
    });
    console.info("[analyze] TRACE_4_pages_images", {
      uploadFileCount: requestContext.pages.length,
      imageCount,
      pdfCount,
      totalPdfPages: totalPdfPages,
      geminiPartsCount: geminiParts.length,
      promptMs: requestContext.timings.prompt_ms
    });

    ensureBudget(requestContext, "gemini_start");

    const analysisResult = await analyzeWithParts(
      geminiParts,
      {
        retries: 0,
        label: "direct",
        timeoutMs: Math.max(
          1000,
          remainingBudgetMs(requestContext) - BUDGET_RESERVE_MS
        )
      },
      requestContext
    );

    const mode = "direct";
    pdfProcessing = {
      ...pdfProcessing,
      mode,
      compressed: compression.compressed,
      beforeBytes: compression.beforeBytes,
      afterBytes: compression.afterBytes
    };

    if (!analysisResult.ok) {
      console.error("[analyze] TRACE_8_final_decision", {
        decision: "FAIL_gemini_call_not_ok",
        producesUserMessage: analysisResult.detail?.empty
          ? "Aucun contenu exploitable / EMPTY_AI_RESPONSE (via respondGeminiFailure)"
          : "erreur Gemini (timeout/quota/réseau)",
        location: "api/analyze.js:!analysisResult.ok",
        emptyOrUnusable: Boolean(analysisResult.emptyOrUnusable),
        budgetTimeout: Boolean(analysisResult.budgetTimeout),
        model: analysisResult.model || null,
        detailKeys: analysisResult.detail
          ? Object.keys(analysisResult.detail)
          : [],
        empty: Boolean(analysisResult.detail?.empty),
        timeout: Boolean(analysisResult.detail?.timeout),
        httpStatus: analysisResult.detail?.httpStatus || null,
        finishReason: analysisResult.detail?.finishReason || null,
        message: analysisResult.detail?.message || null
      });

      if (analysisResult.detail?.timeout || analysisResult.budgetTimeout) {
        return response.status(504).json(
          failBudget(requestContext, {
            mode,
            stage: "gemini",
            pageCount: pdfProcessing.pageCount
          })
        );
      }

      return respondGeminiFailure(
        response,
        analysisResult,
        pdfOnly,
        pdfProcessing,
        requestContext
      );
    }

    let result;

    try {
      ensureBudget(requestContext, "parse");
      const parseStarted = Date.now();
      // TRACE 6 + 7 émis dans parseGeminiJson
      result = parseGeminiJson(analysisResult.rawText);
      requestContext.timings.parse_ms = Date.now() - parseStarted;
      console.info("[analyze] stage_parse", {
        ms: requestContext.timings.parse_ms
      });
    } catch (parseError) {
      console.error("[analyze] TRACE_8_final_decision", {
        decision: "FAIL_json_parse",
        producesUserMessage:
          "La réponse du service d’analyse est illisible.",
        location: "api/analyze.js:parseGeminiJson catch",
        model: analysisResult.model || null,
        parseError: parseError?.message || String(parseError),
        rawPreview: String(analysisResult.rawText || "").slice(0, 2000)
      });

      return response.status(502).json(
        fail(
          ErrorCode.INVALID_AI_RESPONSE,
          "La réponse du service d’analyse est illisible.",
          {
            mode: pdfProcessing.mode,
            model: analysisResult.model || null,
            rawPreview: String(analysisResult.rawText || "").slice(0, 180),
            timings: finalizeTimings(requestContext)
          }
        )
      );
    }

    const enrichStarted = Date.now();
    const validated = validateResult(
      result,
      requestContext.warnings,
      requestContext.pageErrors,
      heterogeneous
    );
    requestContext.timings.enrich_ms = Date.now() - enrichStarted;
    console.info("[analyze] stage_enrich", {
      ms: requestContext.timings.enrich_ms
    });

    const usableDecision = explainUsableContent(validated, result);

    if (!usableDecision.usable) {
      const pageCount = pdfProcessing.pageCount || 0;
      const userMessage = pdfOnly
        ? "Aucun contenu exploitable n’a pu être extrait de ce PDF."
        : "Aucun texte exploitable n’a été détecté.";

      // TRACE 8 — décision finale qui produit le message utilisateur
      console.error("[analyze] TRACE_8_final_decision", {
        decision: "FAIL_hasUsableContent",
        producesUserMessage: userMessage,
        location: "api/analyze.js:hasUsableContent(validated) === false",
        functionLineHint:
          "hasUsableContent + defaults injectés par validateResult",
        pdfOnly,
        model: analysisResult.model || null,
        rawTextPreview: String(analysisResult.rawText || "").slice(0, 2000),
        parsedBeforeValidate: {
          document_type: result?.document_type ?? null,
          plain_summary: result?.plain_summary ?? null,
          request: result?.request ?? null,
          actionsCount: Array.isArray(result?.actions)
            ? result.actions.length
            : 0,
          evidenceCount: Array.isArray(result?.evidence)
            ? result.evidence.length
            : 0
        },
        afterValidate: {
          document_type: validated?.document_type ?? null,
          plain_summary: validated?.plain_summary ?? null,
          request: validated?.request ?? null
        },
        checks: usableDecision.checks,
        whyRejected: usableDecision.whyRejected,
        note:
          "Si parsedBeforeValidate a du contenu mais afterValidate échoue, validateResult a remplacé/écrasé des champs. Si parsed est déjà vide/générique, Gemini a renvoyé un JSON sans contenu utile — ou extractCandidateText a tronqué."
      });

      return response.status(422).json(
        fail(
          pdfOnly
            ? ErrorCode.PDF_NO_USABLE_CONTENT
            : ErrorCode.NO_USABLE_CONTENT,
          userMessage,
          {
            pageCount,
            failedPages:
              pdfProcessing.failedPages?.length
                ? pdfProcessing.failedPages
                : Array.from({ length: pageCount }, (_, i) => i + 1),
            mode: pdfProcessing.mode,
            readablePages: pdfProcessing.readablePages || [],
            timings: finalizeTimings(requestContext)
          }
        )
      );
    }

    console.info("[analyze] TRACE_8_final_decision", {
      decision: "PASS_hasUsableContent",
      location: "api/analyze.js:hasUsableContent(validated) === true",
      model: analysisResult.model || null,
      checks: usableDecision.checks
    });

    if (
      pdfProcessing.mode === "direct" &&
      pdfProcessing.readablePages.length === 0 &&
      pdfProcessing.pageCount > 0
    ) {
      pdfProcessing.readablePages = Array.from(
        { length: pdfProcessing.pageCount },
        (_, i) => i + 1
      );
    }

    return response.status(200).json(
      succeed(
        validated,
        validated.warnings || [],
        {
          mode: pdfProcessing.mode,
          pageCount: pdfProcessing.pageCount,
          readablePages: pdfProcessing.readablePages,
          failedPages: pdfProcessing.failedPages,
          hasText: pdfProcessing.hasText,
          scanned: pdfProcessing.scanned,
          compressed: compression.compressed,
          beforeBytes: compression.beforeBytes,
          afterBytes: compression.afterBytes
        },
        finalizeTimings(requestContext)
      )
    );
  } catch (error) {
    console.error(error);

    if (
      error?.code === ErrorCode.ANALYSIS_TIMEOUT ||
      error?.message === "ANALYSIS_TIMEOUT"
    ) {
      return response.status(504).json(
        failBudget(requestContext, {
          stage: error.stage || "unknown",
          remainingMs: error.remainingMs
        })
      );
    }

    const message = String(error?.message || "");

    let code = ErrorCode.UNKNOWN_ERROR;
    let textMsg = "Une erreur est survenue pendant l’analyse.";

    if (/password|mot de passe|encrypted/i.test(message)) {
      code = ErrorCode.PDF_PROTECTED;
      textMsg = "Ce PDF est protégé par un mot de passe.";
    } else if (/timeout|aborted/i.test(message)) {
      code = ErrorCode.API_TIMEOUT;
      textMsg =
        "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.";
    } else if (/pdf/i.test(message)) {
      code = ErrorCode.PDF_CORRUPTED;
      textMsg = "Le fichier semble endommagé.";
    }

    return response.status(500).json(
      fail(code, textMsg, {
        message: message.slice(0, 240),
        timings: finalizeTimings(requestContext)
      })
    );
  } finally {
    releaseRequestContext(requestContext);
  }
}

function respondEmptyInput(response, requestContext) {
  const pdfFailure = requestContext.pageErrors.find((item) =>
    /pdf/i.test(`${item.mimeType || ""} ${item.message || ""}`)
  );

  const pageMessage = requestContext.pageErrors[0]?.message || "";

  let code = ErrorCode.NO_USABLE_CONTENT;
  let message = "Aucun document ou texte exploitable n’a été reçu.";

  if (pdfFailure) {
    if (/password|mot de passe|protégé|encrypted/i.test(pageMessage)) {
      code = ErrorCode.PDF_PROTECTED;
      message = "Ce PDF est protégé par un mot de passe.";
    } else if (
      /corrompu|damaged|endommagé|malformed|invalid/i.test(pageMessage)
    ) {
      code = ErrorCode.PDF_CORRUPTED;
      message = "Le fichier semble endommagé.";
    } else {
      code = ErrorCode.PDF_CORRUPTED;
      message =
        pdfFailure.message ||
        "Le PDF n’a pas pu être lu. Envoyez un PDF valide, seul.";
    }
  } else if (requestContext.pageErrors.length) {
    code = ErrorCode.IMAGE_UNREADABLE;
    message = "Aucune page exploitable n’a pu être extraite.";
  }

  return response.status(400).json(fail(code, message));
}

async function inspectIncomingPdfs(requestContext) {
  for (const page of requestContext.pages) {
    if (page.mimeType !== "application/pdf") {
      continue;
    }

    const bytes = Buffer.from(page.base64, "base64");

    try {
      const meta = await inspectPdf(bytes);

      requestContext.pdfMeta.push({
        name: page.name,
        size: page.size,
        mimeType: page.mimeType,
        ...meta
      });

      page.pdfPageTexts = meta.pageTexts || [];
      page.pdfFullText = meta.fullText || "";

      requestContext.diagnostics.push({
        step: "pdf_inspect",
        name: page.name,
        size: page.size,
        mimeType: page.mimeType,
        pageCount: meta.pageCount,
        hasText: meta.hasText,
        textLength: meta.textLength,
        scanned: meta.scanned,
        encrypted: meta.encrypted,
        ok: meta.ok,
        code: meta.code
      });

      if (!meta.ok) {
        const status =
          meta.code === ErrorCode.PDF_PROTECTED
            ? 400
            : meta.code === ErrorCode.UNSUPPORTED_FORMAT
              ? 400
              : 400;

        return {
          blockingError: fail(
            meta.code || ErrorCode.PDF_CORRUPTED,
            meta.message || "Le PDF n’a pas pu être lu.",
            {
              pageCount: meta.pageCount,
              name: page.name,
              receivedBytes: page.size
            }
          ),
          status
        };
      }

      // Keep bytes only when needed for rasterization later
      page.bytes = bytes;
      page.pdfPageCount = meta.pageCount;
      page.pdfHasText = meta.hasText;
      page.pdfScanned = meta.scanned;
      page.pdfTextLength = meta.textLength || 0;
    } catch (error) {
      return {
        blockingError: fail(
          ErrorCode.PDF_CORRUPTED,
          "Le fichier semble endommagé.",
          {
            name: page.name,
            message: String(error?.message || "").slice(0, 200)
          }
        ),
        status: 400
      };
    }
  }

  return { blockingError: null };
}

function buildDirectParts(text, pages, heterogeneous) {
  const parts = [
    {
      text: buildPrompt(text, pages.length, heterogeneous, "direct")
    }
  ];

  for (const page of pages) {
    parts.push({
      text:
        `--- Page ${page.order + 1} / ${pages.length} ---\n` +
        `Nom: ${page.name}\n` +
        `Type: ${page.mimeType}\n` +
        `Rotation déclarée: ${page.rotation}°\n` +
        `Ordre: ${page.order}` +
        (page.pdfHasText && page.pdfFullText
          ? `\nTexte sélectionnable détecté: oui (${page.pdfPageCount || "?"} pages)`
          : page.mimeType === "application/pdf"
            ? "\nTexte sélectionnable détecté: non (PDF probablement scanné)"
            : "")
    });

    // Pour les PDF numériques, joindre aussi le texte extrait :
    // Gemini échoue parfois sur inlineData PDF même valide.
    if (
      page.mimeType === "application/pdf" &&
      page.pdfFullText &&
      page.pdfFullText.replace(/\s+/g, "").length >= 20
    ) {
      parts.push({
        text:
          "TEXTE SÉLECTIONNABLE EXTRAIT DU PDF :\n" + page.pdfFullText
      });
    }

    parts.push({
      inlineData: {
        mimeType: page.mimeType || "application/octet-stream",
        data: page.base64
      }
    });
  }

  return parts;
}

async function buildPageImageParts(text, requestContext, heterogeneous) {
  const allImages = [];
  const readablePages = [];
  const failedPages = [];
  let pageCount = 0;

  for (const page of requestContext.pages) {
    if (page.mimeType !== "application/pdf") {
      continue;
    }

    const bytes =
      page.bytes || Buffer.from(page.base64 || "", "base64");

    const raster = await rasterizePdfPages(bytes, {
      rotation: page.rotation,
      pageTexts: page.pdfPageTexts || []
    });

    pageCount += raster.pageCount || page.pdfPageCount || 0;

    requestContext.diagnostics.push({
      step: "rasterize",
      name: page.name,
      ok: raster.ok,
      pageCount: raster.pageCount,
      readablePages: raster.readablePages,
      failedPages: raster.failedPages,
      code: raster.code || null,
      imageBytes: (raster.images || []).reduce(
        (sum, img) => sum + (img.size || 0),
        0
      )
    });

    if (!raster.ok && raster.code === ErrorCode.PDF_PROTECTED) {
      return {
        ok: false,
        code: ErrorCode.PDF_PROTECTED,
        message: raster.message,
        pageCount: raster.pageCount,
        readablePages: [],
        failedPages: []
      };
    }

    for (const image of raster.images || []) {
      allImages.push({
        ...image,
        sourceName: page.name
      });
      requestContext.rasterImages.push(image);
    }

    readablePages.push(...(raster.readablePages || []));
    failedPages.push(...(raster.failedPages || []));

    if (!raster.ok && !(raster.images || []).length) {
      const total = raster.pageCount || page.pdfPageCount || 1;

      for (let i = 1; i <= total; i += 1) {
        if (!failedPages.includes(i)) {
          failedPages.push(i);
        }
      }
    }
  }

  if (!allImages.length) {
    return {
      ok: false,
      code: ErrorCode.PDF_NO_USABLE_CONTENT,
      message: "Aucune page du PDF n’a pu être convertie en image.",
      pageCount,
      readablePages,
      failedPages
    };
  }

  // Ne pas garder les buffers PDF originaux une fois rasterisés
  for (const page of requestContext.pages) {
    if (page.mimeType === "application/pdf") {
      page.bytes = null;
      page.base64 = null;
    }
  }

  const extractedTexts = requestContext.pages
    .filter((page) => page.mimeType === "application/pdf" && page.pdfFullText)
    .map((page) => page.pdfFullText)
    .join("\n\n");

  const parts = [
    {
      text: buildPrompt(
        text,
        allImages.length || pageCount,
        heterogeneous,
        "page_images"
      )
    }
  ];

  if (extractedTexts && extractedTexts.replace(/\s+/g, "").length >= 20) {
    parts.push({
      text:
        "TEXTE SÉLECTIONNABLE EXTRAIT DU PDF (à utiliser s’il est fiable) :\n" +
        extractedTexts
    });
  }

  for (const image of allImages) {
    parts.push({
      text:
        `--- Page ${image.pageNumber} / ${pageCount || allImages.length} ---\n` +
        `Nom: ${image.sourceName || "document"} (image page)\n` +
        `Type: image/jpeg\n` +
        `Source image: ${image.source || "raster"}\n` +
        `Ordre: ${image.pageNumber - 1}`
    });

    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: image.bytes.toString("base64")
      }
    });
  }

  return {
    ok: true,
    parts,
    pageCount: pageCount || allImages.length,
    readablePages: [...new Set(readablePages)].sort((a, b) => a - b),
    failedPages: [...new Set(failedPages)].sort((a, b) => a - b)
  };
}

async function prepareDocumentsForGemini(requestContext) {
  let beforeBytes = 0;
  let afterBytes = 0;
  let compressedAny = false;
  let reason = "none";

  for (const page of requestContext.pages) {
    const originalSize = Number(page.size) || 0;
    beforeBytes += originalSize;

    if (page.mimeType !== "application/pdf") {
      afterBytes += originalSize;
      continue;
    }

    const bytes =
      page.bytes || Buffer.from(page.base64 || "", "base64");
    const meta = {
      scanned: page.pdfScanned === true,
      hasText: page.pdfHasText === true,
      // Préférer la longueur « contenu » (sans en-têtes --- Page ---)
      textLength:
        Number(page.pdfTextLength) >= 0
          ? Number(page.pdfTextLength)
          : String(page.pdfFullText || "")
              .replace(/^--- Page \d+ ---\s*/gm, "")
              .replace(/\s+/g, " ")
              .trim().length,
      pageCount: page.pdfPageCount || 0,
      pageTexts: page.pdfPageTexts || []
    };

    if (!shouldCompressPdf(bytes, meta)) {
      page.bytes = bytes;
      page.base64 = bytes.toString("base64");
      page.size = bytes.length;
      afterBytes += bytes.length;
      continue;
    }

    ensureBudget(requestContext, "compress_pdf");
    const result = await compressPdfForAnalysis(bytes, meta);

    requestContext.diagnostics.push({
      step: "pdf_compress",
      name: page.name,
      compressed: result.compressed,
      beforeBytes: result.beforeBytes,
      afterBytes: result.afterBytes,
      reason: result.reason,
      durationMs: result.durationMs || null
    });

    const out = result.bytes || bytes;
    page.bytes = out;
    page.base64 = out.toString("base64");
    page.size = out.length;
    afterBytes += out.length;

    if (result.compressed) {
      compressedAny = true;
      reason = result.reason || "compressed";
      // Conserver le texte déjà extrait (ne pas le perdre après recompression image)
      if (result.pageCount) {
        page.pdfPageCount = result.pageCount;
      }
      // Marquer scanné seulement si aucun texte n’était disponible
      if (!page.pdfFullText || String(page.pdfFullText).replace(/\s+/g, "").length < 20) {
        page.pdfHasText = false;
        page.pdfScanned = true;
      }
    } else if (reason === "none") {
      reason = result.reason || "skipped";
    }
  }

  return {
    beforeBytes,
    afterBytes,
    compressed: compressedAny,
    reason,
    tooLarge: afterBytes > MAX_FILE_SIZE
  };
}

async function analyzeWithParts(parts, options, requestContext) {
  const mediaSummary = parts
    .filter((part) => part.inlineData)
    .map((part) => ({
      mimeType: part.inlineData.mimeType,
      base64Length: String(part.inlineData.data || "").length
    }));

  requestContext.diagnostics.push({
    step: `gemini_${options.label || "call"}`,
    parts: parts.length,
    media: mediaSummary,
    retries: 0
  });

  const timeoutMs = Math.max(
    1000,
    Math.min(
      Number(options.timeoutMs) || remainingBudgetMs(requestContext) - BUDGET_RESERVE_MS,
      remainingBudgetMs(requestContext) - BUDGET_RESERVE_MS
    )
  );

  if (timeoutMs < 1000) {
    return {
      ok: false,
      emptyOrUnusable: true,
      budgetTimeout: true,
      detail: { timeout: true, budget: true }
    };
  }

  const geminiStarted = Date.now();
  requestContext.timings.gemini_started_at = new Date(geminiStarted).toISOString();
  console.info("[analyze] stage_gemini_start", {
    at: requestContext.timings.gemini_started_at,
    timeoutMs
  });

  const geminiResult = await callGeminiForAnalysis(parts, {
    retries: 0,
    timeoutMs
  });
  const geminiEnded = Date.now();
  requestContext.timings.gemini_ended_at = new Date(geminiEnded).toISOString();
  const geminiMs =
    Number(geminiResult.durationMs) || geminiEnded - geminiStarted;
  requestContext.timings.gemini_ms += geminiMs;
  console.info("[analyze] stage_gemini_end", {
    at: requestContext.timings.gemini_ended_at,
    ms: geminiMs,
    ok: geminiResult.ok
  });

  requestContext.diagnostics.push({
    step: `gemini_${options.label || "call"}_result`,
    ok: geminiResult.ok,
    model: geminiResult.model || null,
    empty: Boolean(geminiResult.detail?.empty),
    timeout: Boolean(geminiResult.detail?.timeout),
    httpStatus: geminiResult.detail?.httpStatus || null,
    durationMs: geminiMs,
    errorMessage: geminiResult.detail?.error?.message
      ? String(geminiResult.detail.error.message).slice(0, 240)
      : geminiResult.detail?.message
        ? String(geminiResult.detail.message).slice(0, 240)
        : null
  });

  if (!geminiResult.ok) {
    return {
      ok: false,
      emptyOrUnusable: true,
      detail: geminiResult.detail,
      model: geminiResult.model,
      budgetTimeout: Boolean(geminiResult.detail?.timeout)
    };
  }

  let parsed = null;

  try {
    parsed = parseGeminiJson(geminiResult.rawText);
  } catch {
    return {
      ok: true,
      emptyOrUnusable: false,
      rawText: geminiResult.rawText,
      model: geminiResult.model,
      parseDeferred: true
    };
  }

  const provisional = validateResult(parsed, [], [], false);
  const usable = hasUsableContent(provisional);

  return {
    ok: true,
    emptyOrUnusable: !usable,
    rawText: geminiResult.rawText,
    model: geminiResult.model,
    provisional
  };
}

function respondGeminiFailure(
  response,
  analysisResult,
  pdfOnly,
  pdfProcessing,
  requestContext = null
) {
  const detail = analysisResult.detail || {};
  const withTimings = (payload) => {
    if (requestContext) {
      payload.timings = finalizeTimings(requestContext);
    }
    return payload;
  };

  if (detail.missingKey) {
    return response.status(500).json(
      withTimings(
        fail(
          ErrorCode.UNKNOWN_ERROR,
          "La clé Gemini n’est pas configurée.",
          { mode: pdfProcessing.mode }
        )
      )
    );
  }

  if (detail.timeout) {
    return response.status(504).json(
      requestContext
        ? failBudget(requestContext, {
            mode: pdfProcessing.mode,
            pageCount: pdfProcessing.pageCount,
            stage: "gemini_upstream"
          })
        : fail(
            ErrorCode.API_TIMEOUT,
            "Le service d’analyse n’a pas répondu à temps. Réessayez.",
            {
              mode: pdfProcessing.mode,
              pageCount: pdfProcessing.pageCount
            }
          )
    );
  }

  const upstreamMessage = String(
    detail?.error?.message || detail?.message || ""
  );

  if (
    detail.httpStatus === 429 ||
    /quota|rate limit|exceeded your current quota/i.test(upstreamMessage)
  ) {
    return response.status(429).json(
      fail(
        ErrorCode.API_QUOTA_EXCEEDED,
        "Le quota du service d’analyse est dépassé. Réessayez dans une minute.",
        {
          mode: pdfProcessing.mode,
          pageCount: pdfProcessing.pageCount,
          upstreamStatus: detail.httpStatus || 429,
          upstreamMessage: upstreamMessage.slice(0, 240)
        }
      )
    );
  }

  const blocked =
    detail?.promptFeedback?.blockReason || detail?.finishReason;

  if (detail?.empty || blocked) {
    console.error("[analyze] TRACE_8_final_decision", {
      decision: "FAIL_respondGeminiFailure_empty_or_blocked",
      producesUserMessage:
        "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.",
      location: "api/analyze.js:respondGeminiFailure empty||blocked",
      empty: Boolean(detail?.empty),
      finishReason: detail.finishReason || null,
      blockReason: detail?.promptFeedback?.blockReason || null,
      model: analysisResult.model || null
    });

    return response.status(502).json(
      fail(
        ErrorCode.EMPTY_AI_RESPONSE,
        "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.",
        {
          mode: pdfProcessing.mode,
          pageCount: pdfProcessing.pageCount,
          finishReason: detail.finishReason || null,
          blockReason: detail?.promptFeedback?.blockReason || null,
          model: analysisResult.model || null
        }
      )
    );
  }

  if (pdfOnly) {
    console.error("[analyze] TRACE_8_final_decision", {
      decision: "FAIL_respondGeminiFailure_pdfOnly_fallback",
      producesUserMessage:
        "Aucun contenu exploitable n’a pu être extrait de ce PDF.",
      location: "api/analyze.js:respondGeminiFailure pdfOnly branch",
      model: analysisResult.model || null,
      httpStatus: detail.httpStatus || null,
      upstreamMessage: upstreamMessage.slice(0, 240)
    });

    return response.status(502).json(
      fail(
        ErrorCode.PDF_NO_USABLE_CONTENT,
        "Aucun contenu exploitable n’a pu être extrait de ce PDF.",
        {
          pageCount: pdfProcessing.pageCount,
          failedPages:
            pdfProcessing.failedPages?.length
              ? pdfProcessing.failedPages
              : Array.from(
                  { length: pdfProcessing.pageCount || 0 },
                  (_, i) => i + 1
                ),
          mode: pdfProcessing.mode,
          upstreamStatus: detail.httpStatus || null,
          upstreamMessage: upstreamMessage.slice(0, 240)
        }
      )
    );
  }

  return response.status(502).json(
    fail(
      ErrorCode.EMPTY_AI_RESPONSE,
      "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.",
      {
        upstreamStatus: detail.httpStatus || null,
        upstreamMessage: upstreamMessage.slice(0, 240)
      }
    )
  );
}

function isQuotaDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return false;
  }

  const message = String(detail?.error?.message || detail?.message || "");

  return (
    detail.httpStatus === 429 ||
    /quota|rate limit|exceeded your current quota/i.test(message)
  );
}

function summarizeGeminiFailure(analysisResult) {
  if (!analysisResult) {
    return null;
  }

  return {
    ok: analysisResult.ok,
    model: analysisResult.model || null,
    emptyOrUnusable: Boolean(analysisResult.emptyOrUnusable),
    httpStatus: analysisResult.detail?.httpStatus || null,
    message: String(
      analysisResult.detail?.error?.message ||
        analysisResult.detail?.message ||
        ""
    ).slice(0, 240)
  };
}

function summarizePageCount(requestContext) {
  if (requestContext.pdfMeta.length) {
    return requestContext.pdfMeta.reduce(
      (sum, meta) => sum + (Number(meta.pageCount) || 0),
      0
    );
  }

  return requestContext.pages.length;
}

function releaseRequestContext(requestContext) {
  if (Array.isArray(requestContext.pages)) {
    for (const page of requestContext.pages) {
      if (page) {
        page.base64 = null;
        page.bytes = null;
      }
    }
  }

  if (Array.isArray(requestContext.rasterImages)) {
    for (const image of requestContext.rasterImages) {
      if (image) {
        image.bytes = null;
      }
    }
  }

  requestContext.pages = [];
  requestContext.rasterImages = [];
  requestContext.manifest = null;
  requestContext.pageErrors = [];
  requestContext.warnings = [];
  requestContext.pdfMeta = [];
  requestContext.diagnostics = [];
  requestContext.rawBody = null;
}

async function readMultipartRequest(request) {
  const chunks = [];
  let bodySize = 0;

  for await (const chunk of request) {
    bodySize += chunk.length || 0;
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);

  try {
    const nativeRequest = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: {
        "content-type": request.headers["content-type"] || ""
      },
      body
    });

    const formData = await nativeRequest.formData();

    return { formData, bodySize: body.length };
  } finally {
    chunks.length = 0;
  }
}

function parseManifest(formData) {
  const rawManifest = formData.get("manifest");

  if (typeof rawManifest !== "string" || !rawManifest.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawManifest);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      pageCount: Number(parsed.pageCount) || 0,
      createdAt: Number(parsed.createdAt) || Date.now(),
      heterogeneous: parsed.heterogeneous === true,
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.map((item, index) => ({
            order: Number(item?.order) || index,
            id: cleanText(item?.id),
            name: cleanText(item?.name),
            mimeType: cleanText(item?.mimeType),
            rotation: normalizeRotation(item?.rotation),
            field: cleanText(item?.field) || `page_${index}`
          }))
        : []
    };
  } catch {
    return null;
  }
}

async function extractPages(formData, manifest) {
  const pages = [];
  const pageErrors = [];

  if (Array.isArray(manifest?.pages) && manifest.pages.length) {
    const ordered = [...manifest.pages].sort(
      (a, b) => Number(a.order) - Number(b.order)
    );

    for (const [index, meta] of ordered.entries()) {
      const field = meta.field || `page_${index}`;

      try {
        const file = formData.get(field);

        if (!file || typeof file === "string") {
          pageErrors.push({
            name: meta.name || field,
            mimeType: meta.mimeType || "",
            page: `Page ${index + 1}`,
            message: `La page « ${meta.name || field} » est absente ou illisible.`
          });
          continue;
        }

        const page = await readPageFile(file, {
          order: index,
          name: meta.name,
          mimeType: meta.mimeType,
          rotation: meta.rotation
        });

        pages.push(page);
      } catch {
        const mimeType = meta.mimeType || "";
        const isPdf = mimeType === "application/pdf";

        pageErrors.push({
          name: meta.name || field,
          mimeType,
          page: `Page ${index + 1}`,
          message: isPdf
            ? `Le PDF « ${meta.name || "document"} » n’a pas pu être lu.`
            : `La page « ${meta.name || field} » n’a pas pu être lue.`
        });
      }
    }

    if (pages.length) {
      return { pages, pageErrors };
    }
  }

  try {
    const legacyFile = formData.get("file");

    if (legacyFile && typeof legacyFile !== "string") {
      const page = await readPageFile(legacyFile, {
        order: 0,
        name: legacyFile.name || "document",
        mimeType: legacyFile.type || "application/octet-stream",
        rotation: 0
      });

      pages.push(page);
    }
  } catch (error) {
    pageErrors.push({
      name: "document",
      mimeType: "",
      page: "Page 1",
      message: error?.message || "Le document n’a pas pu être lu."
    });
  }

  return { pages, pageErrors };
}

async function readPageFile(file, meta = {}) {
  const bytes = Buffer.from(await file.arrayBuffer());

  const mimeType =
    cleanText(meta.mimeType) ||
    file.type ||
    "application/octet-stream";

  if (!bytes.length) {
    throw Object.assign(new Error("Fichier vide."), {
      errorKind: mimeType === "application/pdf" ? "pdf" : "page"
    });
  }

  // Force PDF mime when magic bytes match
  const resolvedMime =
    mimeType === "application/octet-stream" && looksLikePdfMagic(bytes)
      ? "application/pdf"
      : mimeType;

  return {
    order: Number(meta.order) || 0,
    name:
      cleanText(meta.name) ||
      file.name ||
      `page-${(Number(meta.order) || 0) + 1}`,
    mimeType: resolvedMime,
    rotation: normalizeRotation(meta.rotation),
    size: bytes.length,
    base64: bytes.toString("base64"),
    bytes: null
  };
}

function looksLikePdfMagic(bytes) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function detectHeterogeneousPages(pages) {
  if (!Array.isArray(pages) || pages.length < 2) {
    return false;
  }

  const hasPdf = pages.some(
    (page) => page.mimeType === "application/pdf"
  );

  const hasImage = pages.some((page) =>
    String(page.mimeType || "").startsWith("image/")
  );

  if (hasPdf && hasImage) {
    return true;
  }

  const stems = pages
    .map((page) =>
      String(page.name || "")
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(
          /[-_\s]?(page|img|image|scan|doc|document)?[-_\s]?\d+$/i,
          ""
        )
        .trim()
    )
    .filter(Boolean);

  return new Set(stems).size > 1;
}

function normalizeRotation(value) {
  const number = Number(value) || 0;
  const normalized = ((number % 360) + 360) % 360;

  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  if (number > 0 && number <= 1) {
    return Math.round(number * 100);
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function hasUsableContent(result) {
  return explainUsableContent(result).usable;
}

/**
 * Diagnostic only — même règles que hasUsableContent, avec raisons explicites.
 * Ne change pas le comportement métier.
 */
function explainUsableContent(result, parsedRaw = null) {
  const summary = cleanText(result?.plain_summary);
  const request = cleanText(result?.request);
  const documentType = cleanText(result?.document_type);

  const summaryBlockedByRegex =
    /indisponible|non identifié|non trouvée avec certitude/i.test(summary);
  const requestBlockedByRegex =
    /aucune demande|non trouvée avec certitude/i.test(request);
  const typeBlockedByRegex = /non identifié/i.test(documentType);

  const hasSummary = summary.length >= 28 && !summaryBlockedByRegex;
  const hasRequest = request.length >= 8 && !requestBlockedByRegex;
  const hasType = documentType.length >= 3 && !typeBlockedByRegex;

  const actionMatches = Array.isArray(result?.actions)
    ? result.actions.map((item) => {
        const action =
          typeof item === "string"
            ? cleanText(item)
            : cleanText(item?.action);
        const blocked = /aucune action|à vérifier/i.test(action);
        return {
          action,
          length: action.length,
          blockedByRegex: blocked,
          ok: action.length >= 4 && !blocked
        };
      })
    : [];

  const hasAction = actionMatches.some((item) => item.ok);

  const evidenceMatches = Array.isArray(result?.evidence)
    ? result.evidence.map((item) => {
        const quote = cleanText(item?.quote);
        return {
          quote,
          length: quote.length,
          ok: quote.length >= 6
        };
      })
    : [];

  const hasEvidence = evidenceMatches.some((item) => item.ok);

  const usable =
    hasSummary ||
    hasRequest ||
    hasAction ||
    hasEvidence ||
    (hasType && (hasSummary || hasEvidence));

  const whyRejected = [];

  if (!hasSummary) {
    whyRejected.push(
      summary.length < 28
        ? `plain_summary trop court (${summary.length} < 28): "${summary.slice(0, 120)}"`
        : `plain_summary rejeté par regex indisponible|non identifié|non trouvée avec certitude: "${summary.slice(0, 160)}"`
    );
  }

  if (!hasRequest) {
    whyRejected.push(
      request.length < 8
        ? `request trop court (${request.length} < 8): "${request.slice(0, 120)}"`
        : `request rejeté par regex aucune demande|non trouvée avec certitude: "${request.slice(0, 160)}"`
    );
  }

  if (!hasType) {
    whyRejected.push(
      documentType.length < 3
        ? `document_type trop court (${documentType.length} < 3): "${documentType}"`
        : `document_type rejeté par regex non identifié: "${documentType}"`
    );
  }

  if (!hasAction) {
    whyRejected.push(
      actionMatches.length
        ? `aucune action valide (détail: ${JSON.stringify(actionMatches).slice(0, 400)})`
        : "actions absentes ou vides"
    );
  }

  if (!hasEvidence) {
    whyRejected.push(
      evidenceMatches.length
        ? `aucune evidence.quote valide (détail: ${JSON.stringify(evidenceMatches).slice(0, 400)})`
        : "evidence absente ou vide"
    );
  }

  // Détecte si validateResult a injecté les defaults qui font échouer le filtre
  if (parsedRaw && typeof parsedRaw === "object") {
    const rawSummaryMissing = !parsedRaw.plain_summary;
    const rawRequestMissing = !parsedRaw.request;
    const rawTypeMissing = !parsedRaw.document_type;

    if (rawSummaryMissing || rawRequestMissing || rawTypeMissing) {
      whyRejected.push(
        `validateResult a injecté des defaults pour champs manquants` +
          ` (summaryMissing=${rawSummaryMissing}, requestMissing=${rawRequestMissing}, typeMissing=${rawTypeMissing}).` +
          ` Les defaults contiennent « non identifié » / « non trouvée avec certitude » et sont rejetés par hasUsableContent.`
      );
    }
  }

  return {
    usable,
    checks: {
      hasSummary,
      hasRequest,
      hasType,
      hasAction,
      hasEvidence,
      summaryLength: summary.length,
      requestLength: request.length,
      documentType,
      summaryBlockedByRegex,
      requestBlockedByRegex,
      typeBlockedByRegex,
      actionMatches,
      evidenceMatches
    },
    whyRejected
  };
}

function buildPrompt(pastedText, pageCount, heterogeneous, mode) {
  const multiPageRules =
    pageCount > 1
      ? `
DOCUMENT MULTI-PAGES :
- Tu reçois ${pageCount} pages, déjà ordonnées.
- Analyse-les comme un ensemble.
- Si une page est illisible, continue avec les autres.
- Ne fais pas échouer tout le lot pour une seule page illisible.
- Signale clairement les passages illisibles sans inventer leur contenu.
- Dans evidence.page, indique "Page 1", "Page 2", etc. selon l'ordre fourni.
`
      : "";

  const heterogeneousRules = heterogeneous
    ? `
LOT HÉTÉROGÈNE :
- Les pages semblent pouvoir appartenir à plusieurs documents différents.
- N’invente pas de lien entre elles.
- Explique uniquement ce qui est lisible avec certitude.
- Indique dans plain_summary si le contenu paraît mélangé.
- Mets confidence plus bas si les pages sont incohérentes entre elles.
`
    : "";

  const modeRules =
    mode === "page_images"
      ? `
MODE PAGE IMAGES :
- Chaque image correspond à une page du PDF, dans l’ordre.
- Lis le texte visible (y compris documents scannés).
- Conserve l’ordre des pages dans ton analyse.
`
      : `
MODE PDF DIRECT :
- Analyse le PDF fourni.
- Si le document est une image scannée sans texte sélectionnable, extrais quand même le contenu visible.
`;

  return `
Tu es ExpliqueMoi, un assistant qui explique les documents français
de manière directe, courte et vérifiable.

Analyse le document fourni.

OBJECTIF :
L'utilisateur doit savoir immédiatement :
1. quel est ce document ;
2. ce qu'on lui demande ;
3. comment il doit le faire ;
4. avant quelle date ;
5. pourquoi il l'a reçu ;
6. où ces informations apparaissent ;
7. quels tableaux / échéanciers / montants HT-TVA-TTC sont présents.

LECTURE INTELLIGENTE :
- Détecte tableaux, colonnes, lignes, cellules fusionnées, tableaux multi-pages.
- Détecte échéanciers, tableaux administratifs, formulaires.
- Extrais montants HT, TVA, TTC et totaux.
- Extrais personnes, adresses, références, signatures, organismes.
- Sur PDF scanné (images), lis les tableaux VISUELLEMENT.
- Alimente résumé, dates, actions, montants, échéances et timeline
  à partir des tableaux quand c'est pertinent.
- N'invente aucune cellule.

RÈGLES :
- Ne fais jamais de résumé vague.
- Utilise des phrases courtes et concrètes.
- Maximum trois actions.
- Chaque date doit avoir un rôle précis.
- Ne liste jamais une date sans dire à quoi elle correspond.
- Ne confonds pas date d'édition, date de référence et date limite.
- N'invente jamais de montant, d'action ou de délai.
- Quand une information est illisible ou absente, écris :
  "Information non trouvée avec certitude".
- Pour chaque conclusion importante, cite le passage exact.
- En matière fiscale, juridique ou médicale, explique sans prétendre
  remplacer un professionnel.
- Ne prétends jamais qu'un document est lu complètement s'il ne l'est pas.
${modeRules}${multiPageRules}${heterogeneousRules}
Réponds exclusivement avec ce JSON :

{
  "document_type": "type précis et nom de l'organisme si visible",
  "issuer": "organisme ou expéditeur si visible",
  "plain_summary": "une phrase très claire commençant par C'est...",
  "request": "ce que le document demande concrètement",
  "why_received": "raison probable ou explicite de réception",
  "urgency": {
    "level": "none | soon | urgent | uncertain",
    "message": "une phrase courte"
  },
  "actions": [
    {
      "action": "action courte",
      "how": "comment la réaliser"
    }
  ],
  "dates": [
    {
      "date": "date",
      "label": "date limite | date du document | date de prélèvement | autre",
      "meaning": "ce qui se passe à cette date"
    }
  ],
  "timeline": [
    {
      "date": "date",
      "label": "jalon",
      "meaning": "ce qui se passe"
    }
  ],
  "amount": {
    "value": "montant principal ou Information non trouvée avec certitude",
    "meaning": "à quoi correspond ce montant"
  },
  "amounts_detail": [
    {
      "label": "HT | TVA | TTC | autre",
      "value": "montant",
      "kind": "HT | TVA | TTC | autre",
      "page": "Page X"
    }
  ],
  "tables": [
    {
      "title": "titre du tableau",
      "columns": ["col1", "col2"],
      "rows": [["v1", "v2"]],
      "page": "Page X",
      "confidence": 80,
      "totals": { "Total TTC": "120,00 €" },
      "notes": "précision éventuelle",
      "kind": "invoice | schedule | form | table"
    }
  ],
  "entities": {
    "people": [],
    "addresses": [],
    "references": [],
    "signatures": [],
    "organizations": []
  },
  "evidence": [
    {
      "page": "Page X ou emplacement",
      "quote": "court passage exact",
      "explanation": "ce que prouve ce passage"
    }
  ],
  "confidence": 85,
  "reading_quality": "full | partial"
}

Important : confidence est un entier de 0 à 100 (pas une fraction 0–1).
Si aucun tableau : "tables": [].

Texte collé par l'utilisateur, s'il existe :
${pastedText || "Aucun texte collé."}
  `.trim();
}

function validateResult(
  result,
  extraWarnings = [],
  pageErrors = [],
  heterogeneous = false
) {
  const warnings = [];

  const pushWarning = (value) => {
    const text = cleanText(value);

    if (text && !warnings.includes(text)) {
      warnings.push(text);
    }
  };

  extraWarnings.forEach(pushWarning);

  if (Array.isArray(result?.warnings)) {
    result.warnings.forEach(pushWarning);
  }

  if (heterogeneous) {
    pushWarning(HETEROGENEOUS_BATCH_WARNING);
  }

  const confidence = normalizeConfidence(result?.confidence);

  let readingQuality = cleanText(result?.reading_quality).toLowerCase();

  if (!["full", "partial", "failed"].includes(readingQuality)) {
    readingQuality =
      warnings.length || pageErrors.length || confidence < 55
        ? "partial"
        : "full";
  }

  if (pageErrors.length && readingQuality === "full") {
    readingQuality = "partial";
  }

  return {
    document_type: result.document_type || "Document non identifié",

    issuer: cleanText(result.issuer) || "",

    plain_summary:
      result.plain_summary ||
      "C’est un document dont l’objet n’a pas été identifié avec certitude.",

    request:
      result.request || "Information non trouvée avec certitude",

    why_received:
      result.why_received || "Information non trouvée avec certitude",

    urgency: {
      level: ["none", "soon", "urgent", "uncertain"].includes(
        result.urgency?.level
      )
        ? result.urgency.level
        : "uncertain",

      message:
        result.urgency?.message ||
        "Le niveau d’urgence n’a pas été déterminé."
    },

    actions: Array.isArray(result.actions)
      ? result.actions.slice(0, 3)
      : [],

    dates: Array.isArray(result.dates) ? result.dates.slice(0, 5) : [],

    timeline: normalizeTimeline(result.timeline),

    amount: result.amount || {
      value: "Information non trouvée avec certitude",
      meaning: ""
    },

    amounts_detail: normalizeAmountsDetail(result.amounts_detail),

    tables: normalizeTables(result.tables),

    entities: normalizeEntities(result.entities),

    evidence: Array.isArray(result.evidence)
      ? result.evidence.slice(0, 6)
      : [],

    confidence,

    reading_quality: readingQuality,
    warnings,
    page_errors: pageErrors,
    heterogeneous: heterogeneous === true,
    batch_heterogeneous: heterogeneous === true
  };
}
