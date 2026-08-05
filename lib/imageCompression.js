/**
 * Compression navigateur / Node des photos documentaires.
 * Ne jamais utiliser pour les PDF.
 */

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

export const CompressionErrorCode = {
  IMAGE_DECODE_FAILED: "IMAGE_DECODE_FAILED",
  IMAGE_COMPRESSION_FAILED: "IMAGE_COMPRESSION_FAILED",
  IMAGE_TOO_LARGE_AFTER_COMPRESSION: "IMAGE_TOO_LARGE_AFTER_COMPRESSION",
  UNSUPPORTED_IMAGE_FORMAT: "UNSUPPORTED_IMAGE_FORMAT",
  BATCH_TOO_LARGE: "BATCH_TOO_LARGE"
};

export const COMPRESSION_THRESHOLDS = {
  LIGHT_MAX_BYTES: Math.floor(1.2 * 1024 * 1024),
  MEDIUM_MAX_BYTES: 4 * 1024 * 1024,
  TARGET_MIN_BYTES: 600 * 1024,
  TARGET_MAX_BYTES: Math.floor(1.5 * 1024 * 1024),
  BATCH_MAX_BYTES: 4 * 1024 * 1024,
  PER_IMAGE_MAX_BYTES: 4 * 1024 * 1024,
  MEDIUM_QUALITY: [0.92, 0.88],
  HEAVY_QUALITY: [0.88, 0.82, 0.76],
  SECOND_PASS_QUALITY: [0.82, 0.76],
  MAX_SIDES: [2400, 2200, 2000],
  MIN_QUALITY: 0.76
};

/**
 * Planifie la stratégie selon la taille d’origine.
 */
export function planImageCompression(originalSize, options = {}) {
  const size = Number(originalSize) || 0;
  const force = options.force === true;
  const rotation = normalizeRotation(options.rotation);

  if (!force && rotation === 0 && size < COMPRESSION_THRESHOLDS.LIGHT_MAX_BYTES) {
    return {
      tier: "light",
      shouldCompress: false,
      qualities: [],
      maxSides: [],
      reason: "under_1_2_mo"
    };
  }

  if (size <= COMPRESSION_THRESHOLDS.MEDIUM_MAX_BYTES && !force) {
    return {
      tier: "medium",
      shouldCompress: true,
      qualities: [...COMPRESSION_THRESHOLDS.MEDIUM_QUALITY],
      maxSides: [COMPRESSION_THRESHOLDS.MAX_SIDES[0]],
      reason: "between_1_2_and_4_mo"
    };
  }

  return {
    tier: force && size < COMPRESSION_THRESHOLDS.LIGHT_MAX_BYTES ? "medium" : "heavy",
    shouldCompress: true,
    qualities: [...COMPRESSION_THRESHOLDS.HEAVY_QUALITY],
    maxSides: [...COMPRESSION_THRESHOLDS.MAX_SIDES],
    reason: force ? "forced" : "over_4_mo"
  };
}

/**
 * Compression adaptative d’une photo documentaire.
 */
export async function compressImageForDocument(file, options = {}) {
  const originalFile = file;
  const originalSize = file?.size || 0;
  const mime = String(file?.type || "").toLowerCase();
  const rotation = normalizeRotation(options.rotation);
  const signal = options.signal;
  const preferReadable = options.preferReadable !== false;

  const baseResult = {
    originalFile,
    compressedFile: originalFile,
    originalSize,
    compressedSize: originalSize,
    width: 0,
    height: 0,
    qualityUsed: null,
    wasCompressed: false,
    status: "skipped",
    mimeType: mime,
    errorCode: null,
    message: null
  };

  if (!file || !IMAGE_MIME_TYPES.has(normalizeMime(mime))) {
    return {
      ...baseResult,
      status: "error",
      errorCode: CompressionErrorCode.UNSUPPORTED_IMAGE_FORMAT,
      message: "Format d’image non pris en charge."
    };
  }

  throwIfAborted(signal);

  const plan = planImageCompression(originalSize, {
    force: options.force === true || rotation !== 0,
    rotation
  });

  if (!plan.shouldCompress) {
    const dims = await peekImageDimensions(file).catch(() => ({
      width: 0,
      height: 0
    }));

    return {
      ...baseResult,
      width: dims.width,
      height: dims.height,
      status: "pristine",
      message: "Prête"
    };
  }

  let bitmap;

  try {
    bitmap = await decodeImage(file, signal);
  } catch (error) {
    return {
      ...baseResult,
      status: "error",
      errorCode: CompressionErrorCode.IMAGE_DECODE_FAILED,
      message:
        error?.message ||
        "Impossible de lire cette image."
    };
  }

  try {
    throwIfAborted(signal);

    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const keepPng = shouldKeepPng(file, options);
    const outputMime = keepPng ? "image/png" : "image/jpeg";

    let bestBlob = null;
    let bestQuality = null;
    let bestWidth = sourceWidth;
    let bestHeight = sourceHeight;
    let bestSide = Math.max(sourceWidth, sourceHeight);

    const qualities = plan.qualities.length
      ? plan.qualities
      : [0.9];
    const maxSides = plan.maxSides.length
      ? plan.maxSides
      : [COMPRESSION_THRESHOLDS.MAX_SIDES[0]];

    outer: for (const maxSide of maxSides) {
      for (const quality of qualities) {
        throwIfAborted(signal);

        const rendered = await renderToBlob(bitmap, {
          rotation,
          maxSide,
          quality: keepPng ? undefined : quality,
          mimeType: outputMime,
          preferReadable
        });

        bestBlob = rendered.blob;
        bestQuality = keepPng ? null : quality;
        bestWidth = rendered.width;
        bestHeight = rendered.height;
        bestSide = maxSide;

        const targetCeiling =
          options.targetMaxBytes ||
          COMPRESSION_THRESHOLDS.TARGET_MAX_BYTES;

        // Objectif lisible atteint
        if (rendered.blob.size <= targetCeiling) {
          break outer;
        }

        // Image moyenne : enchaîner 0,92 → 0,88 (et 2400px) sans couper trop tôt
        // tant que l’objectif 1,5 Mo n’est pas atteint.
      }
    }

    if (!bestBlob) {
      return {
        ...baseResult,
        width: sourceWidth,
        height: sourceHeight,
        status: "error",
        errorCode: CompressionErrorCode.IMAGE_COMPRESSION_FAILED,
        message: "Échec de la compression"
      };
    }

    // Si toujours > 4 Mo après passes, une dernière tentative au min quality / 2000px
    if (
      bestBlob.size > COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES &&
      !keepPng
    ) {
      const last = await renderToBlob(bitmap, {
        rotation,
        maxSide: 2000,
        quality: COMPRESSION_THRESHOLDS.MIN_QUALITY,
        mimeType: "image/jpeg",
        preferReadable
      });
      bestBlob = last.blob;
      bestQuality = COMPRESSION_THRESHOLDS.MIN_QUALITY;
      bestWidth = last.width;
      bestHeight = last.height;
      bestSide = 2000;
    }

    if (bestBlob.size > COMPRESSION_THRESHOLDS.PER_IMAGE_MAX_BYTES) {
      const failedFile = blobToFile(
        bestBlob,
        buildOutputName(file.name, bestBlob.type),
        bestBlob.type
      );

      return {
        ...baseResult,
        compressedFile: failedFile,
        compressedSize: bestBlob.size,
        width: bestWidth,
        height: bestHeight,
        qualityUsed: bestQuality,
        wasCompressed: true,
        status: "error",
        errorCode: CompressionErrorCode.IMAGE_TOO_LARGE_AFTER_COMPRESSION,
        message:
          "Image encore trop lourde après compression.",
        maxSideUsed: bestSide
      };
    }

    // Ne pas garder un fichier compressé plus lourd que l’original (sauf rotation)
    if (rotation === 0 && bestBlob.size >= originalSize) {
      return {
        ...baseResult,
        width: sourceWidth,
        height: sourceHeight,
        status: "pristine",
        wasCompressed: false,
        message: "Prête"
      };
    }

    const compressedFile = blobToFile(
      bestBlob,
      buildOutputName(file.name, bestBlob.type),
      bestBlob.type
    );

    return {
      ...baseResult,
      compressedFile,
      compressedSize: compressedFile.size,
      width: bestWidth,
      height: bestHeight,
      qualityUsed: bestQuality,
      wasCompressed: true,
      status: "compressed",
      mimeType: compressedFile.type,
      message: `${formatSizeFr(originalSize)} → ${formatSizeFr(compressedFile.size)}`,
      maxSideUsed: bestSide
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ...baseResult,
        status: "aborted",
        errorCode: null,
        message: "Compression annulée"
      };
    }

    return {
      ...baseResult,
      status: "error",
      errorCode: CompressionErrorCode.IMAGE_COMPRESSION_FAILED,
      message: error?.message || "Échec de la compression"
    };
  } finally {
    try {
      bitmap?.close?.();
    } catch {
      // ignore
    }
  }
}

/**
 * Seconde passe légère sur les plus grosses images d’un lot.
 */
export async function compressBatchForUpload(files, options = {}) {
  const signal = options.signal;
  const results = [];

  for (const file of files) {
    throwIfAborted(signal);
    // PDF : inchangé
    if (String(file?.type || "") === "application/pdf") {
      results.push({
        originalFile: file,
        compressedFile: file,
        originalSize: file.size,
        compressedSize: file.size,
        width: 0,
        height: 0,
        qualityUsed: null,
        wasCompressed: false,
        status: "skipped_pdf",
        mimeType: file.type,
        errorCode: null,
        message: null
      });
      continue;
    }

    results.push(await compressImageForDocument(file, { signal }));
  }

  let total = results.reduce(
    (sum, item) => sum + (item.compressedFile?.size || 0),
    0
  );

  if (total <= COMPRESSION_THRESHOLDS.BATCH_MAX_BYTES) {
    return {
      ok: true,
      totalSize: total,
      results,
      errorCode: null
    };
  }

  // Seconde passe : recompresser les plus grosses images seulement
  const imageIndexes = results
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.status !== "skipped_pdf" &&
        item.compressedFile &&
        IMAGE_MIME_TYPES.has(normalizeMime(item.compressedFile.type))
    )
    .sort(
      (a, b) =>
        (b.item.compressedFile.size || 0) -
        (a.item.compressedFile.size || 0)
    );

  for (const { item, index } of imageIndexes) {
    if (total <= COMPRESSION_THRESHOLDS.BATCH_MAX_BYTES) {
      break;
    }

    throwIfAborted(signal);

    const second = await compressImageForDocument(item.compressedFile, {
      signal,
      force: true,
      targetMaxBytes: Math.floor(
        COMPRESSION_THRESHOLDS.TARGET_MIN_BYTES * 1.15
      ),
      rotation: 0
    });

    if (second.status === "error" && !second.compressedFile) {
      continue;
    }

    const previousSize = item.compressedFile.size;
    const nextSize = second.compressedFile.size;

    if (nextSize < previousSize) {
      total = total - previousSize + nextSize;
      results[index] = {
        ...second,
        originalFile: item.originalFile,
        originalSize: item.originalSize,
        message: `${formatSizeFr(item.originalSize)} → ${formatSizeFr(nextSize)}`
      };
    }
  }

  total = results.reduce(
    (sum, item) => sum + (item.compressedFile?.size || 0),
    0
  );

  if (total > COMPRESSION_THRESHOLDS.BATCH_MAX_BYTES) {
    return {
      ok: false,
      totalSize: total,
      results,
      errorCode: CompressionErrorCode.BATCH_TOO_LARGE,
      message:
        "Le lot dépasse 4 Mo après compression. Retirez une photo ou utilisez des fichiers plus légers."
    };
  }

  return {
    ok: true,
    totalSize: total,
    results,
    errorCode: null
  };
}

export function formatSizeFr(bytes) {
  const value = Number(bytes) || 0;

  if (value < 1024 * 1024) {
    const ko = value / 1024;
    const digits = ko >= 100 ? 0 : 1;
    return `${ko.toFixed(digits).replace(".", ",")} Ko`;
  }

  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function normalizeMime(mime) {
  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  return mime;
}

function normalizeRotation(value) {
  const rotation = ((Number(value) || 0) % 360 + 360) % 360;
  return [0, 90, 180, 270].includes(rotation) ? rotation : 0;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Compression annulée");
    error.name = "AbortError";
    throw error;
  }
}

function shouldKeepPng(file, options) {
  if (options.forceJpeg) {
    return false;
  }

  const mime = normalizeMime(String(file?.type || "").toLowerCase());

  // Conserver PNG seulement si explicitement demandé (transparence utile)
  if (mime === "image/png" && options.preservePng === true) {
    return true;
  }

  return false;
}

function buildOutputName(originalName, mimeType) {
  const base = String(originalName || "photo").replace(/\.[^.]+$/, "");
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  return `${base}-doc.${ext}`;
}

function blobToFile(blob, name, type) {
  if (typeof File === "function") {
    return new File([blob], name, {
      type,
      lastModified: Date.now()
    });
  }

  // Node fallback
  blob.name = name;
  blob.lastModified = Date.now();
  return blob;
}

async function peekImageDimensions(file) {
  const bitmap = await decodeImage(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dims;
}

async function decodeImage(file, signal) {
  throwIfAborted(signal);

  if (typeof createImageBitmap === "function") {
    // Respecte l’orientation EXIF sans retournement manuel incorrect
    return createImageBitmap(file, {
      imageOrientation: "from-image"
    });
  }

  // Node (@napi-rs/canvas)
  const { loadImage } = await import("@napi-rs/canvas");
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await loadImage(buffer);

  return {
    width: image.width,
    height: image.height,
    _nodeImage: image,
    close() {}
  };
}

async function renderToBlob(bitmap, options = {}) {
  const rotation = normalizeRotation(options.rotation);
  const maxSide = Number(options.maxSide) || COMPRESSION_THRESHOLDS.MAX_SIDES[0];
  const mimeType = options.mimeType || "image/jpeg";
  const quality = options.quality;

  const swap = rotation === 90 || rotation === 270;
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const drawWidth = Math.max(1, Math.round(srcW * scale));
  const drawHeight = Math.max(1, Math.round(srcH * scale));
  const canvasWidth = swap ? drawHeight : drawWidth;
  const canvasHeight = swap ? drawWidth : drawHeight;

  const { canvas, context, toBlob } = await createCanvasSurface(
    canvasWidth,
    canvasHeight
  );

  // Fond blanc propre (lisibilité documentaire)
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate((rotation * Math.PI) / 180);

  const source = bitmap._nodeImage || bitmap;
  context.drawImage(
    source,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  context.restore();

  // Légère accentuation du contraste / netteté modérée (document)
  if (options.preferReadable !== false) {
    applyDocumentEnhance(context, canvasWidth, canvasHeight);
  }

  const blob = await toBlob(canvas, mimeType, quality);

  return {
    blob,
    width: canvasWidth,
    height: canvasHeight
  };
}

function applyDocumentEnhance(context, width, height) {
  try {
    // Éviter le coût sur très grandes surfaces
    if (width * height > 6_000_000) {
      return;
    }

    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const contrast = 1.08;
    const intercept = 128 * (1 - contrast);

    for (let i = 0; i < data.length; i += 4) {
      // ignorer alpha
      data[i] = clampByte(data[i] * contrast + intercept);
      data[i + 1] = clampByte(data[i + 1] * contrast + intercept);
      data[i + 2] = clampByte(data[i + 2] * contrast + intercept);
    }

    context.putImageData(imageData, 0, 0);
  } catch {
    // getImageData peut échouer selon l’environnement : ignorer
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function createCanvasSurface(width, height) {
  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Compression indisponible.");
    }

    return {
      canvas,
      context,
      toBlob: (surface, mimeType, quality) =>
        canvasToBlobBrowser(surface, mimeType, quality)
    };
  }

  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  return {
    canvas,
    context,
    toBlob: async (surface, mimeType, quality) => {
      let buffer;

      if (mimeType === "image/png") {
        buffer = surface.toBuffer("image/png");
      } else if (mimeType === "image/webp") {
        // fallback jpeg si webp encode indisponible
        try {
          buffer = surface.toBuffer("image/webp");
        } catch {
          buffer = surface.toBuffer("image/jpeg", {
            quality: Math.round((quality ?? 0.88) * 100)
          });
          mimeType = "image/jpeg";
        }
      } else {
        buffer = surface.toBuffer("image/jpeg", {
          quality: Math.round((quality ?? 0.88) * 100)
        });
        mimeType = "image/jpeg";
      }

      return new Blob([buffer], { type: mimeType });
    }
  };
}

function canvasToBlobBrowser(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Échec de la compression"));
        }
      },
      mimeType,
      quality
    );
  });
}
