/**
 * OCR / extraction locale navigateur (V3).
 * PDF texte → pdf.js (pas de Tesseract).
 * PDF scanné / image → Tesseract.js.
 * Aucun envoi réseau ici.
 */

const MIN_SELECTABLE_CHARS = 20;
const PDFJS_VERSION = "4.10.38";
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const TESSERACT_URL =
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js";

let pdfjsPromise = null;
let tesseractWorker = null;

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function ensureTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;
  const Tesseract = await import(TESSERACT_URL);
  tesseractWorker = await Tesseract.createWorker("fra+eng");
  return tesseractWorker;
}

async function terminateTesseract() {
  if (tesseractWorker) {
    try {
      await tesseractWorker.terminate();
    } catch {
      // ignore
    }
    tesseractWorker = null;
  }
}

function isPdfFile(file) {
  return (
    file?.type === "application/pdf" ||
    /\.pdf$/i.test(file?.name || "")
  );
}

function isImageFile(file) {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(file?.type || "");
}

async function extractSelectablePdfText(file) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? String(item.str || "") : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ pageNumber, text, confidence: text ? 100 : 0 });
      page.cleanup?.();
    }
  } finally {
    await doc.destroy?.();
  }

  const fullText = pages
    .map((page) => page.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    pages,
    fullText,
    textLength: fullText.replace(/\s+/g, "").length,
    pageCount: pages.length
  };
}

async function rasterizePdfPage(file, pageNumber, session) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    session?.trackCanvas?.(canvas);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup?.();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    return blob;
  } finally {
    await doc.destroy?.();
  }
}

async function ocrBlob(blob) {
  const worker = await ensureTesseractWorker();
  const { data } = await worker.recognize(blob);
  const text = String(data.text || "")
    .replace(/\r/g, "")
    .trim();
  const confidence = Number.isFinite(data.confidence)
    ? Math.max(0, Math.min(100, Number(data.confidence)))
    : text
      ? 50
      : 0;
  return { text, confidence };
}

async function extractFromPdf(file, session) {
  const selectable = await extractSelectablePdfText(file);
  if (selectable.textLength >= MIN_SELECTABLE_CHARS) {
    return {
      pages: selectable.pages,
      fullText: selectable.fullText,
      warnings: []
    };
  }

  const warnings = [
    "PDF scanné détecté : OCR Tesseract local (aucun envoi du PDF brut)."
  ];
  const pages = [];

  for (let pageNumber = 1; pageNumber <= selectable.pageCount; pageNumber += 1) {
    let blob = null;
    try {
      blob = await rasterizePdfPage(file, pageNumber, session);
      const recognized = await ocrBlob(blob);
      pages.push({
        pageNumber,
        text: recognized.text,
        confidence: recognized.confidence
      });
    } catch (error) {
      pages.push({ pageNumber, text: "", confidence: 0 });
      warnings.push(
        `OCR page ${pageNumber} échoué: ${
          error instanceof Error ? error.message : "erreur"
        }`
      );
    } finally {
      blob = null;
    }
  }

  return {
    pages,
    fullText: pages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n")
      .trim(),
    warnings
  };
}

async function extractFromImage(file) {
  const recognized = await ocrBlob(file);
  return {
    pages: [
      {
        pageNumber: 1,
        text: recognized.text,
        confidence: recognized.confidence
      }
    ],
    fullText: recognized.text,
    warnings: []
  };
}

/**
 * Extrait le texte de fichiers locaux (PDF / images).
 * Ne conserve aucun fichier après retour — l’appelant doit destroyDocumentSession.
 */
export async function extractOcrFromFiles(files, session) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("Aucun fichier à extraire.");
  }

  const allPages = [];
  const warnings = [];
  let pageOffset = 0;

  try {
    for (const file of list) {
      session?.trackFile?.(file);
      let result;

      if (isPdfFile(file)) {
        result = await extractFromPdf(file, session);
      } else if (isImageFile(file)) {
        result = await extractFromImage(file);
      } else {
        warnings.push(`Format ignoré: ${file.name || "fichier"}`);
        continue;
      }

      for (const page of result.pages) {
        allPages.push({
          ...page,
          pageNumber: pageOffset + page.pageNumber
        });
      }
      pageOffset += result.pages.length || 1;
      warnings.push(...(result.warnings || []));
    }

    const fullText = allPages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!fullText) {
      throw new Error(
        "Aucun texte exploitable n’a pu être extrait localement."
      );
    }

    return { pages: allPages, fullText, warnings };
  } finally {
    await terminateTesseract();
  }
}

export { terminateTesseract };
