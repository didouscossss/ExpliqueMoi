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
  normalizeTables
} from "../lib/documentContext.js";
import {
  MAX_DOCUMENT_SIZE,
  buildTooLargeMessage,
  planPdfChunks
} from "../lib/pdfChunking.js";
import { analyzeLongPdf } from "../lib/longPdfAnalysis.js";
import { buildAnalysisPrompt } from "../lib/analysisPrompt.js";
import { enrichAnalysisResult } from "../lib/analysisEnrichment.js";
import {
  isV4EngineEnabled,
  runV4PreviewAnalysis
} from "../lib/v4PreviewAnalysis.js";

// Limite unique côté document : 4 Mo (pas de limite de pages PDF).
const MAX_FILE_SIZE = MAX_DOCUMENT_SIZE;
const MAX_TOTAL_SIZE = MAX_DOCUMENT_SIZE;
// Limite de fichiers dans un lot multi-photos (≠ pages internes d’un PDF).
const MAX_UPLOAD_FILES = 10;
const VERCEL_BODY_SOFT_LIMIT = 4.4 * 1024 * 1024;

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

  requestContext.requestId =
    request.headers["x-vercel-id"] ||
    request.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { formData, bodySize } = await readMultipartRequest(request);
    requestContext.rawBodySize = bodySize;

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

    // -------- V4-K : chemin Preview contrôlé (feature flag) --------
    // USE_V4_ENGINE=false (défaut) → V3 inchangé ci-dessous.
    // unknown / faible confiance V4 ≠ erreur technique (pas de fallback auto).
    if (isV4EngineEnabled(request)) {
      const v4Run = runV4PreviewAnalysis({
        pages: requestContext.pages,
        pastedText: text
      });

      requestContext.diagnostics.push({
        step: "v4_preview",
        ok: v4Run.ok,
        fallbackReason: v4Run.ok ? null : v4Run.fallbackReason,
        message: v4Run.ok ? null : v4Run.message
      });

      if (v4Run.ok) {
        const validated = {
          ...v4Run.analysis,
          // enrichissement V3 léger désactivé : mapping V4 déjà au format Preview
          tables: normalizeTables(v4Run.analysis.tables || []),
          page_errors: requestContext.pageErrors,
          heterogeneous: heterogeneous === true,
          engine: "v4"
        };

        const mergedWarnings = [
          ...requestContext.warnings,
          ...(v4Run.warnings || [])
        ];

        return response.status(200).json(
          succeed(validated, mergedWarnings, {
            ...v4Run.pdfProcessing,
            diagnostics: [
              ...(v4Run.pdfProcessing.diagnostics || []),
              ...requestContext.diagnostics
            ]
          })
        );
      }

      // Erreur technique V4 uniquement → fallback V3 (Preview), non silencieux
      requestContext.warnings.push(
        `Analyse V4 indisponible (${v4Run.fallbackReason || "erreur"}) — bascule sur le moteur V3.`
      );
      requestContext.diagnostics.push({
        step: "v4_fallback_v3",
        fallbackReason: v4Run.fallbackReason,
        message: v4Run.message
      });
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

    // -------- PDF long : découpage (chunking) sans limite de pages --------
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
        requestId: requestContext.requestId
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

    // -------- Niveau 1 : analyse directe --------
    let analysisResult = await analyzeWithParts(
      buildDirectParts(text, requestContext.pages, heterogeneous),
      {
        retries: pdfOnly || requestContext.pages.length === 1 ? 1 : 0,
        label: "direct"
      },
      requestContext
    );

    let mode = "direct";

    // Niveau 2 uniquement si le direct échoue / est vide / inutilisable
    // (y compris PDF scannés : Gemini direct échoue souvent → rasterisation)
    const directQuotaHit = isQuotaDetail(analysisResult.detail);
    const shouldFallbackToImages =
      pdfOnly &&
      !directQuotaHit &&
      (!analysisResult.ok || analysisResult.emptyOrUnusable);

    // -------- Niveau 2 : pages → images --------
    if (shouldFallbackToImages) {
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
          { retries: 1, label: "page_images" },
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
            ErrorCode.PDF_NO_USABLE_CONTENT,
            "Aucun contenu exploitable n’a pu être extrait de ce PDF.",
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
              rasterError: raster.message || raster.code
            }
          )
        );
      }
    }

    if (!analysisResult.ok) {
      return respondGeminiFailure(
        response,
        analysisResult,
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

    return response.status(200).json(
      succeed(validated, validated.warnings || [], {
        mode: pdfProcessing.mode,
        pageCount: pdfProcessing.pageCount,
        readablePages: pdfProcessing.readablePages,
        failedPages: pdfProcessing.failedPages,
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
    timeoutMs: 50000,
    requestId: requestContext?.requestId || null
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

  if (detail.network) {
    return response.status(502).json(
      fail(
        ErrorCode.NETWORK_ERROR,
        "Impossible de joindre le service d’analyse. Vérifiez votre connexion et réessayez.",
        {
          mode: pdfProcessing.mode,
          pageCount: pdfProcessing.pageCount,
          upstreamMessage: String(detail.message || "").slice(0, 240)
        }
      )
    );
  }

  const upstreamMessage = String(
    detail?.error?.message || detail?.message || ""
  );

  if (
    detail.httpStatus === 404 ||
    /no longer available|not found|unsupported|unknown model/i.test(
      upstreamMessage
    )
  ) {
    return response.status(502).json(
      fail(
        ErrorCode.EMPTY_AI_RESPONSE,
        "Le modèle d’analyse n’est pas disponible. Réessayez dans quelques instants.",
        {
          mode: pdfProcessing.mode,
          pageCount: pdfProcessing.pageCount,
          upstreamStatus: detail.httpStatus || 404,
          upstreamMessage: upstreamMessage.slice(0, 240),
          model: analysisResult.model || detail.model || null
        }
      )
    );
  }

  if (
    detail.httpStatus === 429 ||
    /quota|rate limit|exceeded your current quota|prepayment credits/i.test(
      upstreamMessage
    )
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
  return buildAnalysisPrompt(pastedText, pageCount, heterogeneous, mode);
}

function validateResult(
  result,
  extraWarnings = [],
  pageErrors = [],
  heterogeneous = false
) {
  const enriched = enrichAnalysisResult(result, {
    extraWarnings,
    pageErrors,
    heterogeneous
  });

  enriched.tables = normalizeTables(enriched.tables);

  return enriched;
}
