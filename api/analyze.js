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
  buildTooLargeMessage,
  planPdfChunks,
  formatBytesFr
} from "../lib/pdfChunking.js";
import { analyzeLongPdf } from "../lib/longPdfAnalysis.js";

const MAX_FILE_SIZE = MAX_DOCUMENT_SIZE;
const MAX_TOTAL_SIZE = MAX_DOCUMENT_SIZE;
const VERCEL_BODY_SOFT_LIMIT = 4.4 * 1024 * 1024;

const HETEROGENEOUS_BATCH_WARNING =
  "Ces pages semblent appartenir à plusieurs documents différents. Pour une explication plus précise, analysez-les séparément.";

/** Budget serveur sous maxDuration Vercel (60s) — laisse de la marge pour la réponse. */
const REQUEST_BUDGET_MS = 54000;
/** Minimum pour tenter le fallback OCR pages→images (après échec direct). */
const PAGE_IMAGES_MIN_REMAINING_MS = 12000;

const ErrorCode = {
  PDF_PROTECTED: "PDF_PROTECTED",
  PDF_CORRUPTED: "PDF_CORRUPTED",
  PDF_NO_USABLE_CONTENT: "PDF_NO_USABLE_CONTENT",
  PDF_NO_TEXT: "PDF_NO_TEXT",
  PDF_PROCESSING_FAILED: "PDF_PROCESSING_FAILED",
  OCR_IMPOSSIBLE: "OCR_IMPOSSIBLE",
  IMAGE_UNREADABLE: "IMAGE_UNREADABLE",
  NO_USABLE_CONTENT: "NO_USABLE_CONTENT",
  FILE_NOT_RECEIVED: "FILE_NOT_RECEIVED",
  INVALID_MULTIPART: "INVALID_MULTIPART",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  NETWORK_ERROR: "NETWORK_ERROR",
  API_TIMEOUT: "API_TIMEOUT",
  EMPTY_AI_RESPONSE: "EMPTY_AI_RESPONSE",
  INVALID_AI_RESPONSE: "INVALID_AI_RESPONSE",
  API_QUOTA_EXCEEDED: "API_QUOTA_EXCEEDED",
  GEMINI_ERROR: "GEMINI_ERROR",
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

function succeed(analysis, warnings = [], pdfProcessing = null) {
  const payload = {
    ok: true,
    analysis,
    warnings: Array.isArray(warnings) ? warnings : []
  };

  if (pdfProcessing) {
    payload.pdfProcessing = pdfProcessing;
  }

  return payload;
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
    diagnostics: []
  };

  try {
    const deadlineAt = Date.now() + REQUEST_BUDGET_MS;
    requestContext.deadlineAt = deadlineAt;

    let formData;
    let bodySize = 0;

    try {
      ({ formData, bodySize } = await readMultipartRequest(request));
    } catch (multipartError) {
      return response.status(400).json(
        fail(
          ErrorCode.INVALID_MULTIPART,
          "La requête multipart est invalide ou incomplète.",
          {
            message: String(multipartError?.message || multipartError)
          }
        )
      );
    }

    requestContext.rawBodySize = bodySize;

    requestContext.diagnostics.push({
      step: "upload",
      receivedBytes: bodySize,
      contentType: String(request.headers["content-type"] || ""),
      overVercelSoftLimit: bodySize > VERCEL_BODY_SOFT_LIMIT,
      deadlineAt
    });

    if (bodySize > VERCEL_BODY_SOFT_LIMIT) {
      return response.status(413).json(
        fail(
          ErrorCode.FILE_TOO_LARGE,
          buildTooLargeMessage(bodySize, VERCEL_BODY_SOFT_LIMIT),
          {
            receivedBytes: bodySize,
            limitBytes: VERCEL_BODY_SOFT_LIMIT,
            title: "Fichier trop volumineux"
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

    // Limite unique : 4 Mo par fichier et pour le lot complet (pas de limite de pages)
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

    // Pré-inspection PDF : encryption / corruption / pages / texte
    const pdfGate = await inspectIncomingPdfs(requestContext);

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

    // -------- PDF long : traitement par lots --------
    const singlePdfPage = pdfOnly ? requestContext.pages[0] : null;
    const longPlan =
      singlePdfPage && requestContext.pages.length === 1
        ? planPdfChunks({
            pageCount: singlePdfPage.pdfPageCount || 0,
            fileSize: singlePdfPage.size,
            textLength: (singlePdfPage.pdfPageTexts || []).reduce(
              (sum, item) => sum + String(item?.text || "").length,
              0
            ),
            scanned: singlePdfPage.pdfScanned === true,
            pageTexts: singlePdfPage.pdfPageTexts || []
          })
        : null;

    if (longPlan && longPlan.mode === "chunked" && longPlan.chunkCount > 1) {
      const longResult = await analyzeLongPdf({
        page: singlePdfPage,
        text,
        heterogeneous,
        buildPrompt,
        validateResult,
        hasUsableContent,
        deadlineAt: requestContext.deadlineAt
      });

      requestContext.diagnostics.push(...(longResult.diagnostics || []));

      pdfProcessing = {
        mode: "chunked",
        pageCount: totalPdfPages,
        totalPages: totalPdfPages,
        processedPages: (longResult.merged.processedPages || []).length,
        readablePages: longResult.merged.processedPages || [],
        failedPages: longResult.merged.failedPages || [],
        chunkCount: longPlan.chunkCount,
        hasText: pdfProcessing.hasText,
        scanned: scannedPdf,
        diagnostics: requestContext.diagnostics
      };

      if (!longResult.merged.ok || !longResult.merged.analysis) {
        return response.status(422).json(
          fail(
            ErrorCode.PDF_NO_USABLE_CONTENT,
            "Aucun contenu exploitable n’a pu être extrait de ce PDF.",
            {
              pageCount: totalPdfPages,
              totalPages: totalPdfPages,
              failedPages:
                longResult.merged.failedPages?.length
                  ? longResult.merged.failedPages
                  : Array.from({ length: totalPdfPages }, (_, i) => i + 1),
              chunkCount: longPlan.chunkCount,
              mode: "chunked"
            }
          )
        );
      }

      const validated = validateResult(
        longResult.merged.analysis,
        [
          ...requestContext.warnings,
          ...(longResult.merged.warnings || [])
        ],
        requestContext.pageErrors,
        heterogeneous
      );

      if (!hasUsableContent(validated)) {
        return response.status(422).json(
          fail(
            ErrorCode.PDF_NO_USABLE_CONTENT,
            "Aucun contenu exploitable n’a pu être extrait de ce PDF.",
            {
              pageCount: totalPdfPages,
              failedPages: pdfProcessing.failedPages,
              mode: "chunked"
            }
          )
        );
      }

      return response.status(200).json(
        succeed(validated, validated.warnings || [], {
          mode: "chunked",
          totalPages: totalPdfPages,
          processedPages: pdfProcessing.processedPages,
          failedPages: pdfProcessing.failedPages,
          chunkCount: longPlan.chunkCount,
          pageCount: totalPdfPages,
          readablePages: pdfProcessing.readablePages,
          hasText: pdfProcessing.hasText,
          scanned: scannedPdf
        })
      );
    }

    const remainingMs = () =>
      (requestContext.deadlineAt || Date.now()) - Date.now();

    let analysisResult = null;
    let mode = "direct";

    // PDF scanné (sans texte) : OCR pages→images EN PREMIER
    if (pdfOnly && scannedPdf) {
      requestContext.diagnostics.push({
        step: "scanned_pdf_prefer_page_images",
        pageCount: totalPdfPages,
        remainingMs: remainingMs()
      });

      const rasterFirst = await buildPageImageParts(
        text,
        requestContext,
        heterogeneous
      );

      if (rasterFirst.ok) {
        mode = "page_images";
        pdfProcessing = {
          ...pdfProcessing,
          mode: "page_images",
          pageCount: rasterFirst.pageCount,
          readablePages: rasterFirst.readablePages,
          failedPages: rasterFirst.failedPages,
          diagnostics: requestContext.diagnostics
        };

        analysisResult = await analyzeWithParts(
          rasterFirst.parts,
          {
            retries: 0,
            maxModels: 3,
            timeoutMs: Math.min(32000, Math.max(10000, remainingMs() - 4000)),
            label: "page_images_scanned"
          },
          requestContext
        );

        if (
          analysisResult.ok &&
          rasterFirst.failedPages.length &&
          rasterFirst.readablePages.length
        ) {
          requestContext.warnings.push(
            `Certaines pages n’ont pas pu être lues : ${rasterFirst.failedPages.join(", ")}.`
          );
        }
      } else if (rasterFirst.code === ErrorCode.PDF_PROTECTED) {
        return response.status(400).json(
          fail(ErrorCode.PDF_PROTECTED, rasterFirst.message, {
            pageCount: rasterFirst.pageCount || 0
          })
        );
      } else {
        requestContext.diagnostics.push({
          step: "scanned_raster_failed",
          code: rasterFirst.code || null,
          message: rasterFirst.message || null
        });
      }
    }

    // -------- Niveau 1 : analyse directe (PDF texte / images) --------
    if (!analysisResult || !analysisResult.ok || analysisResult.emptyOrUnusable) {
      // Pour un scanné déjà tenté en images, ne retenter direct que s’il reste du budget
      const skipDirect =
        pdfOnly &&
        scannedPdf &&
        analysisResult &&
        remainingMs() < PAGE_IMAGES_MIN_REMAINING_MS;

      if (!skipDirect) {
        analysisResult = await analyzeWithParts(
          buildDirectParts(text, requestContext.pages, heterogeneous),
          {
            retries: 0,
            maxModels: 3,
            timeoutMs: pdfOnly ? 28000 : 26000,
            label: "direct"
          },
          requestContext
        );
        mode = mode === "page_images" ? mode : "direct";
      }
    }

    // Niveau 2 : fallback OCR pages→images si le direct échoue / est vide
    // (obligatoire avant tout « Aucun contenu exploitable »)
    const directQuotaHit = isQuotaDetail(analysisResult?.detail);
    const directMissingKey = analysisResult?.detail?.missingKey === true;
    const shouldFallbackToImages =
      pdfOnly &&
      mode !== "page_images" &&
      !directQuotaHit &&
      !directMissingKey &&
      !isTimeoutDetail(analysisResult?.detail) &&
      remainingMs() >= PAGE_IMAGES_MIN_REMAINING_MS &&
      (!analysisResult?.ok || analysisResult?.emptyOrUnusable);

    // -------- Niveau 2 : pages → images --------
    if (shouldFallbackToImages) {
      requestContext.diagnostics.push({
        step: "fallback_page_images",
        reason: analysisResult?.ok
          ? "empty_or_unusable"
          : "direct_failed",
        remainingMs: remainingMs()
      });
      const raster = await buildPageImageParts(
        text,
        requestContext,
        heterogeneous
      );

      if (raster.ok) {
        mode = "page_images";
        pdfProcessing = {
          ...pdfProcessing,
          mode: "page_images",
          pageCount: raster.pageCount,
          readablePages: raster.readablePages,
          failedPages: raster.failedPages,
          diagnostics: requestContext.diagnostics
        };

        const imageResult = await analyzeWithParts(
          raster.parts,
          {
            retries: 0,
            maxModels: 3,
            timeoutMs: Math.min(28000, Math.max(8000, remainingMs() - 3000)),
            label: "page_images"
          },
          requestContext
        );

        if (imageResult.ok) {
          analysisResult = imageResult;
        } else if (!analysisResult.ok) {
          analysisResult = imageResult;
        } else if (analysisResult.emptyOrUnusable && imageResult.ok) {
          analysisResult = imageResult;
        }

        // Niveau 3 : pages partiellement lisibles
        if (
          analysisResult.ok &&
          raster.failedPages.length &&
          raster.readablePages.length
        ) {
          requestContext.warnings.push(
            `Certaines pages n’ont pas pu être lues : ${raster.failedPages.join(", ")}.`
          );
        }
      } else if (!analysisResult.ok) {
        // Rasterization failed and direct also failed
        if (raster.code === ErrorCode.PDF_PROTECTED) {
          return response.status(400).json(
            fail(ErrorCode.PDF_PROTECTED, raster.message, {
              pageCount: raster.pageCount || 0
            })
          );
        }

        pdfProcessing = {
          ...pdfProcessing,
          mode: "page_images",
          pageCount: raster.pageCount || pdfProcessing.pageCount,
          readablePages: [],
          failedPages: raster.failedPages || [],
          diagnostics: requestContext.diagnostics
        };

        return response.status(422).json(
          fail(
            ErrorCode.OCR_IMPOSSIBLE,
            "Impossible de convertir les pages du PDF en images lisibles.",
            {
              pageCount: pdfProcessing.pageCount,
              failedPages:
                pdfProcessing.failedPages.length > 0
                  ? pdfProcessing.failedPages
                  : Array.from(
                      { length: pdfProcessing.pageCount || 0 },
                      (_, i) => i + 1
                    ),
              directError: summarizeGeminiFailure(analysisResult),
              rasterError: raster.message || raster.code,
              scanned: scannedPdf
            }
          )
        );
      }
    }

    if (!analysisResult || !analysisResult.ok) {
      return respondGeminiFailure(
        response,
        analysisResult || { ok: false, detail: { message: "Analyse non démarrée." } },
        pdfOnly,
        pdfProcessing
      );
    }

    let result;

    try {
      result = parseGeminiJson(analysisResult.rawText);
    } catch {
      return response.status(502).json(
        fail(
          ErrorCode.INVALID_AI_RESPONSE,
          "La réponse du service d’analyse est illisible.",
          {
            mode: pdfProcessing.mode,
            model: analysisResult.model || null,
            rawPreview: String(analysisResult.rawText || "").slice(0, 180)
          }
        )
      );
    }

    const validated = validateResult(
      result,
      requestContext.warnings,
      requestContext.pageErrors,
      heterogeneous
    );

    if (!hasUsableContent(validated)) {
      const pageCount = pdfProcessing.pageCount || 0;

      return response.status(422).json(
        fail(
          pdfOnly
            ? ErrorCode.PDF_NO_USABLE_CONTENT
            : ErrorCode.NO_USABLE_CONTENT,
          pdfOnly
            ? "Aucun contenu exploitable n’a pu être extrait de ce PDF."
            : "Aucun texte exploitable n’a été détecté.",
          {
            pageCount,
            failedPages:
              pdfProcessing.failedPages?.length
                ? pdfProcessing.failedPages
                : Array.from({ length: pageCount }, (_, i) => i + 1),
            mode: pdfProcessing.mode,
            readablePages: pdfProcessing.readablePages || []
          }
        )
      );
    }

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

    const readable =
      pdfProcessing.readablePages?.length
        ? pdfProcessing.readablePages
        : Array.from(
            { length: pdfProcessing.pageCount || 0 },
            (_, i) => i + 1
          );

    return response.status(200).json(
      succeed(validated, validated.warnings || [], {
        mode: pdfProcessing.mode,
        pageCount: pdfProcessing.pageCount,
        totalPages: pdfProcessing.pageCount,
        processedPages: readable.length,
        readablePages: readable,
        failedPages: pdfProcessing.failedPages || [],
        chunkCount: pdfProcessing.chunkCount || 1,
        hasText: pdfProcessing.hasText,
        scanned: pdfProcessing.scanned
      })
    );
  } catch (error) {
    console.error(error);

    const message = String(error?.message || "");

    let code = ErrorCode.UNKNOWN_ERROR;
    let text = "Une erreur est survenue pendant l’analyse.";

    if (/password|mot de passe|encrypted/i.test(message)) {
      code = ErrorCode.PDF_PROTECTED;
      text = "Ce PDF est protégé par un mot de passe.";
    } else if (/timeout|aborted/i.test(message)) {
      code = ErrorCode.API_TIMEOUT;
      text =
        "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.";
    } else if (/pdf/i.test(message)) {
      code = ErrorCode.PDF_CORRUPTED;
      text = "Le fichier semble endommagé.";
    }

    return response.status(500).json(
      fail(code, text, {
        message: message.slice(0, 240)
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
  const receivedBytes = Number(requestContext.rawBodySize) || 0;

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
  } else if (receivedBytes > 0) {
    code = ErrorCode.FILE_NOT_RECEIVED;
    message =
      "Le fichier n’a pas été reçu correctement. Réessayez avec une photo ou un PDF.";
  }

  return response.status(400).json(
    fail(code, message, {
      receivedBytes,
      pageErrors: requestContext.pageErrors?.length || 0
    })
  );
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
    retries: options.retries
  });

  const geminiResult = await callGeminiForAnalysis(parts, {
    retries: options.retries,
    timeoutMs: options.timeoutMs || 28000,
    maxModels: options.maxModels || 3,
    deadlineAt: requestContext.deadlineAt || Date.now() + 40000
  });

  requestContext.diagnostics.push({
    step: `gemini_${options.label || "call"}_result`,
    ok: geminiResult.ok,
    model: geminiResult.model || null,
    empty: Boolean(geminiResult.detail?.empty),
    timeout: Boolean(geminiResult.detail?.timeout),
    httpStatus: geminiResult.detail?.httpStatus || null,
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
      model: geminiResult.model
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
  pdfProcessing
) {
  const detail = analysisResult.detail || {};

  if (detail.missingKey) {
    return response.status(500).json(
      fail(
        ErrorCode.UNKNOWN_ERROR,
        "La clé Gemini n’est pas configurée.",
        { mode: pdfProcessing.mode }
      )
    );
  }

  if (detail.timeout) {
    return response.status(504).json(
      fail(
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
    const common = {
      pageCount: pdfProcessing.pageCount,
      mode: pdfProcessing.mode,
      scanned: pdfProcessing.scanned === true,
      upstreamStatus: detail.httpStatus || null,
      upstreamMessage: upstreamMessage.slice(0, 240),
      model: analysisResult.model || detail.model || null,
      diagnostics: (pdfProcessing.diagnostics || []).slice(-8)
    };

    // Ne pas masquer une panne Gemini derrière « PDF sans contenu »
    if (detail.httpStatus || detail.network || detail.budgetExhausted) {
      return response.status(502).json(
        fail(
          ErrorCode.GEMINI_ERROR,
          "Le service d’analyse a échoué sur ce PDF. Réessayez dans quelques instants.",
          common
        )
      );
    }

    if (pdfProcessing.mode === "page_images") {
      return response.status(422).json(
        fail(
          ErrorCode.OCR_IMPOSSIBLE,
          "Le PDF scanné n’a pas pu être lu (OCR impossible).",
          {
            ...common,
            failedPages:
              pdfProcessing.failedPages?.length
                ? pdfProcessing.failedPages
                : Array.from(
                    { length: pdfProcessing.pageCount || 0 },
                    (_, i) => i + 1
                  )
          }
        )
      );
    }

    if (pdfProcessing.scanned || pdfProcessing.hasText === false) {
      return response.status(422).json(
        fail(
          ErrorCode.PDF_NO_TEXT,
          "Ce PDF ne contient pas de texte extractible. La lecture par images a aussi échoué.",
          common
        )
      );
    }

    return response.status(502).json(
      fail(
        ErrorCode.PDF_PROCESSING_FAILED,
        "Le traitement du PDF a échoué. Réessayez avec un autre fichier ou une photo.",
        {
          ...common,
          failedPages:
            pdfProcessing.failedPages?.length
              ? pdfProcessing.failedPages
              : Array.from(
                  { length: pdfProcessing.pageCount || 0 },
                  (_, i) => i + 1
                )
        }
      )
    );
  }

  return response.status(502).json(
    fail(
      ErrorCode.GEMINI_ERROR,
      "Le service d’analyse n’a pas répondu. Réessayez dans quelques instants.",
      {
        mode: pdfProcessing.mode,
        pageCount: pdfProcessing.pageCount,
        upstreamStatus: detail.httpStatus || null,
        upstreamMessage: upstreamMessage.slice(0, 240),
        model: analysisResult.model || null
      }
    )
  );
}

function isTimeoutDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return false;
  }

  return (
    detail.timeout === true ||
    detail.budgetExhausted === true
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

  // Nouveau format sans manifeste obligatoire : page_0, page_1, …
  const discovered = [];

  for (let index = 0; index < 40; index += 1) {
    const field = `page_${index}`;
    const file = formData.get(field);

    if (!file || typeof file === "string") {
      if (index === 0) {
        // aussi pages[0][file] éventuel
        const alt = formData.get(`pages[${index}][file]`);
        if (alt && typeof alt !== "string") {
          discovered.push({ file: alt, order: index });
          continue;
        }
      }
      // trou dans la séquence → on arrête après page_0 manquant
      if (index > 0 && !discovered.length) {
        break;
      }
      if (index > 0) {
        break;
      }
      continue;
    }

    discovered.push({ file, order: index });
  }

  for (const item of discovered) {
    try {
      const page = await readPageFile(item.file, {
        order: item.order,
        name: item.file.name || `page-${item.order + 1}`,
        mimeType: item.file.type || "application/octet-stream",
        rotation: 0
      });
      pages.push(page);
    } catch (error) {
      pageErrors.push({
        name: item.file?.name || `page-${item.order + 1}`,
        mimeType: item.file?.type || "",
        page: `Page ${item.order + 1}`,
        message: error?.message || "Le document n’a pas pu être lu."
      });
    }
  }

  if (pages.length) {
    return { pages, pageErrors };
  }

  // Ancien format mono-fichier
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
  const summary = cleanText(result.plain_summary);
  const request = cleanText(result.request);
  const documentType = cleanText(result.document_type);

  const hasSummary =
    summary.length >= 28 &&
    !/indisponible|non identifié|non trouvée avec certitude/i.test(
      summary
    );

  const hasRequest =
    request.length >= 8 &&
    !/aucune demande|non trouvée avec certitude/i.test(request);

  const hasType =
    documentType.length >= 3 && !/non identifié/i.test(documentType);

  const hasAction =
    Array.isArray(result.actions) &&
    result.actions.some((item) => {
      const action =
        typeof item === "string"
          ? cleanText(item)
          : cleanText(item?.action);

      return (
        action.length >= 4 && !/aucune action|à vérifier/i.test(action)
      );
    });

  const hasEvidence =
    Array.isArray(result.evidence) &&
    result.evidence.some((item) => cleanText(item?.quote).length >= 6);

  return (
    hasSummary ||
    hasRequest ||
    hasAction ||
    hasEvidence ||
    (hasType && (hasSummary || hasEvidence))
  );
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
- Détecte les champs de formulaire (form_fields) et les justificatifs
  demandés (required_documents).
- Sur PDF scanné (images), lis les tableaux VISUELLEMENT.
- Alimente résumé, dates, actions, montants, échéances et timeline
  à partir des tableaux quand c'est pertinent.
- N'invente aucune cellule ni donnée personnelle.

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
  "form_fields": [
    {
      "id": "field_1",
      "label": "Nom",
      "type": "text",
      "required": true,
      "page": 1,
      "currentValue": "",
      "help": "Indiquez votre nom de famille.",
      "source": null
    }
  ],
  "required_documents": [
    {
      "id": "doc_1",
      "label": "Justificatif de domicile",
      "reason": "demandé explicitement",
      "page": "Page 1",
      "required": true
    }
  ],
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

    form_fields: normalizeFormFields(
      result.form_fields || result.formFields
    ),

    required_documents: normalizeRequiredDocuments(
      result.required_documents || result.requiredDocuments
    ),

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

function normalizeFormFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .slice(0, 40)
    .map((field, index) => ({
      id: cleanText(field?.id) || `field_${index + 1}`,
      label: cleanText(field?.label) || `Champ ${index + 1}`,
      type: cleanText(field?.type) || "text",
      required: field?.required === true,
      page: Number(field?.page) || cleanText(field?.page) || null,
      currentValue: cleanText(field?.currentValue || field?.current_value),
      help: cleanText(field?.help),
      source: cleanText(field?.source) || null
    }))
    .filter((field) => field.label);
}

function normalizeRequiredDocuments(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .slice(0, 30)
    .map((item, index) => ({
      id: cleanText(item?.id) || `doc_${index + 1}`,
      label: cleanText(item?.label || item?.name) || `Pièce ${index + 1}`,
      reason: cleanText(item?.reason || item?.why),
      page: cleanText(item?.page),
      required: item?.required !== false
    }))
    .filter((item) => item.label);
}
