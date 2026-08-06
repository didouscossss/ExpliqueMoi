/**
 * Garde-fou taille d’upload → /api/analyze.
 * Limite produit annoncée PDF = 4 Mo.
 * Limite sûre Vercel (body réel) = 3,2 Mo estimés.
 */

export const MAX_ANNOUNCED_FILE_BYTES = 4 * 1024 * 1024;
/** Total fichiers (binaires) max avant envoi — marge sous le plafond Vercel ~4,5 Mo. */
export const SAFE_UPLOAD_BYTES = Math.floor(3.2 * 1024 * 1024);
/** Garde-fou body HTTP estimé (ne doit jamais approcher 4,5 Mo). */
export const HARD_VERCEL_GUARD_BYTES = Math.floor(4.2 * 1024 * 1024);
/** Seuil à partir duquel on tente une compression PDF avant envoi. */
export const PDF_COMPRESS_ATTEMPT_BYTES = Math.floor(3.2 * 1024 * 1024);

export const UploadBlockCode = {
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE"
};

export const BLOCKED_UPLOAD_MESSAGE =
  "Ce document est trop lourd pour être envoyé. Essayez de le compresser ou de le diviser en plusieurs fichiers.";

/**
 * Estime la taille HTTP multipart (fichiers binaires + champs texte + overhead).
 * @param {number[]} fileSizes
 * @param {number} [extraTextBytes]
 */
export function estimateMultipartBytes(fileSizes, extraTextBytes = 0) {
  const filesBytes = (Array.isArray(fileSizes) ? fileSizes : []).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0
  );
  const extras = Math.max(0, Number(extraTextBytes) || 0);
  // ~5 % boundaries/headers + marge fixe
  return Math.ceil((filesBytes + extras) * 1.05) + 4096;
}

/**
 * Plan des champs FormData — un seul exemplaire par fichier (jamais file + page_0).
 * @param {{ name: string, mimeType?: string, size?: number, rotation?: number, id?: string }[]} pages
 */
export function planFormDataFields(pages) {
  const list = Array.isArray(pages) ? pages : [];
  const fields = list.map((page, order) => ({
    field: `page_${order}`,
    order,
    id: page.id || `page-${order}`,
    name: page.name || `page-${order + 1}`,
    mimeType: page.mimeType || "application/octet-stream",
    rotation: Number(page.rotation) || 0,
    size: Number(page.size) || 0
  }));

  return {
    fields,
    appendLegacyFile: false,
    duplicateRisk: false
  };
}

/**
 * Décide si l’envoi doit être bloqué / si une compression PDF est à tenter.
 */
export function evaluateUploadGate({
  files = [],
  originalBytes = null,
  manifestJson = "",
  extraTextBytes = 0
} = {}) {
  const list = Array.isArray(files) ? files : [];
  const fileSizes = list.map((f) => Number(f?.size) || 0);
  const fileCount = list.length;
  const filesTotal = fileSizes.reduce((s, n) => s + n, 0);
  const originals =
    originalBytes == null ? filesTotal : Number(originalBytes) || 0;

  const manifestBytes =
    typeof manifestJson === "string" ? manifestJson.length : 0;
  const estimated = estimateMultipartBytes(
    fileSizes,
    manifestBytes + (Number(extraTextBytes) || 0)
  );

  const overAnnounced = fileSizes.some((n) => n > MAX_ANNOUNCED_FILE_BYTES);
  const overSafeFiles = filesTotal > SAFE_UPLOAD_BYTES;
  const overHardWire = estimated > HARD_VERCEL_GUARD_BYTES;

  const needsPdfCompression =
    !overAnnounced &&
    overSafeFiles &&
    list.some(
      (f) =>
        String(f?.mimeType || f?.type || "") === "application/pdf" &&
        (Number(f?.size) || 0) > PDF_COMPRESS_ATTEMPT_BYTES * 0.85
    );

  const blocked =
    overAnnounced ||
    overHardWire ||
    (overSafeFiles && !needsPdfCompression);

  return {
    upload_original_bytes: originals,
    upload_final_bytes: estimated,
    files_total_bytes: filesTotal,
    file_count: fileCount,
    transport: "multipart",
    blocked_before_upload: blocked,
    needsPdfCompression,
    overAnnounced,
    safeLimitBytes: SAFE_UPLOAD_BYTES,
    announcedLimitBytes: MAX_ANNOUNCED_FILE_BYTES,
    code: overAnnounced
      ? UploadBlockCode.FILE_TOO_LARGE
      : blocked
        ? UploadBlockCode.PAYLOAD_TOO_LARGE
        : null,
    message: blocked || overAnnounced ? BLOCKED_UPLOAD_MESSAGE : null
  };
}

/**
 * Recalcule la garde après compression éventuelle.
 */
export function reevaluateAfterCompression(files, options = {}) {
  const gate = evaluateUploadGate({
    files,
    originalBytes: options.originalBytes,
    manifestJson: options.manifestJson || "",
    extraTextBytes: options.extraTextBytes || 0
  });

  const filesTotal = Number(gate.files_total_bytes) || 0;
  const stillTooLarge =
    filesTotal > SAFE_UPLOAD_BYTES ||
    gate.upload_final_bytes > HARD_VERCEL_GUARD_BYTES;

  // Après tentative de compression : plus de second essai auto
  if (stillTooLarge) {
    return {
      ...gate,
      needsPdfCompression: false,
      blocked_before_upload: true,
      code: UploadBlockCode.PAYLOAD_TOO_LARGE,
      message: BLOCKED_UPLOAD_MESSAGE
    };
  }

  return {
    ...gate,
    needsPdfCompression: false,
    blocked_before_upload: false,
    code: null,
    message: null
  };
}
