export const config = {
  api: {
    bodyParser: false
  }
};

import {
  inspectPdf
} from "../lib/pdfProcessing.js";
import {
  normalizeTables
} from "../lib/documentContext.js";
import {
  MAX_DOCUMENT_SIZE,
  buildTooLargeMessage
} from "../lib/pdfChunking.js";
import { enrichAnalysisResult } from "../lib/analysisEnrichment.js";
import { analyzeDocumentWithDidouAsync } from "../lib/didou/index.js";
import { buildDidoutorContext } from "../lib/didoutor/index.js";

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

    // -------- Didou (local) — OCR si besoin, puis analyse — sans Gemini --------
    const didouStarted = Date.now();
    const didouRun = await analyzeDocumentWithDidouAsync({
      pastedText: text,
      pages: requestContext.pages,
      fileName: requestContext.pages[0]?.name || null,
      heterogeneous
    });
    const didouDurationMs = Date.now() - didouStarted;

    requestContext.diagnostics.push(...(didouRun.ocrDiagnostics || []));
    requestContext.diagnostics.push({
      step: "didou_analyze",
      engine: "didou",
      ok: didouRun.ok,
      family: didouRun.didou?.family || null,
      documentType: didouRun.didou?.documentType || null,
      understandingLevel: didouRun.didou?.understandingLevel || null,
      confidence: didouRun.didou?.confidence ?? null,
      durationMs: didouDurationMs,
      charCount: didouRun.didou?.meta?.charCount ?? null,
      extractionMethods: didouRun.didou?.meta?.extractionMethods || [],
      ocrUncertain: Boolean(didouRun.didou?.meta?.ocrUncertain)
    });

    for (const warning of didouRun.didou?.warnings || []) {
      if (warning && !requestContext.warnings.includes(warning)) {
        requestContext.warnings.push(warning);
      }
    }

    const methods = didouRun.didou?.meta?.extractionMethods || [];
    const usedOcr = methods.includes("local-ocr");

    pdfProcessing = {
      ...pdfProcessing,
      mode: usedOcr ? "didou_local_ocr" : "didou_local",
      engine: "didou",
      durationMs: didouDurationMs,
      extractionMethods: methods,
      readablePages:
        pdfProcessing.pageCount > 0
          ? Array.from({ length: pdfProcessing.pageCount }, (_, i) => i + 1)
          : pdfProcessing.hasText || usedOcr
            ? [1]
            : [],
      diagnostics: requestContext.diagnostics
    };

    const validated = validateResult(
      didouRun.preview,
      requestContext.warnings,
      requestContext.pageErrors,
      heterogeneous
    );

    // Contexte Didoutor réservé (pas d’appel IA)
    validated.didoutor_context = buildDidoutorContext(didouRun.didou);

    if (!hasUsableContent(validated) && didouRun.didou?.understandingLevel === "extraction") {
      const pageCount = pdfProcessing.pageCount || 0;
      // Résultat partiel honnête plutôt qu’échec total si Didou a au moins un résumé
      if (!validated.plain_summary || validated.plain_summary.length < 12) {
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
              engine: "didou",
              readablePages: pdfProcessing.readablePages || []
            }
          )
        );
      }
    }

    return response.status(200).json(
      succeed(validated, validated.warnings || [], {
        mode: pdfProcessing.mode,
        engine: "didou",
        pageCount: pdfProcessing.pageCount,
        readablePages: pdfProcessing.readablePages,
        failedPages: pdfProcessing.failedPages,
        hasText: pdfProcessing.hasText || usedOcr,
        scanned: pdfProcessing.scanned,
        extractionMethods: methods,
        durationMs: didouDurationMs
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

// Anciens helpers Gemini (buildDirectParts / analyzeWithParts / respondGeminiFailure)
// retirés du parcours standard — Didou est le moteur gratuit local.
// Les modules lib/geminiAnalysis.js restent disponibles pour Didoutor / chat.

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
  const family = cleanText(result.document_family);
  const engine = cleanText(result.engine || result.didou?.engine);

  const hasSummary =
    summary.length >= 20 &&
    !/indisponible|non trouvée avec certitude/i.test(summary);

  const hasRequest =
    request.length >= 8 &&
    !/non trouvée avec certitude/i.test(request);

  const hasType =
    documentType.length >= 3 && !/non identifié/i.test(documentType);

  const hasFamily =
    family.length >= 3 && family !== "autre";

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

  const hasMain =
    (result.amount?.value &&
      !/non trouvé|non trouvée|incertitude/i.test(result.amount.value)) ||
    (Array.isArray(result.dates) && result.dates.length > 0) ||
    (result.user_summary?.main_date?.date ||
      result.user_summary?.main_amount?.value);

  // Didou : une famille ou un résumé partiel suffit — pas d’échec total
  if (engine === "didou") {
    return hasSummary || hasType || hasFamily || hasMain || hasEvidence;
  }

  return (
    hasSummary ||
    hasRequest ||
    hasAction ||
    hasEvidence ||
    (hasType && (hasSummary || hasEvidence))
  );
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
