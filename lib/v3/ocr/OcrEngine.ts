/**
 * Moteur OCR V3 — extraction locale uniquement.
 * PDF texte → pdfjs (pas de Tesseract).
 * PDF scanné / image → Tesseract.js uniquement.
 * Aucun appel IA (Gemini / OpenAI / Mistral).
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import type { OCRPageResult, OCRResult } from "../types/OCRResult.js";
import { detectLanguageFromText, type LanguageDetectionResult } from "./languageDetection.js";
import {
  extractSelectableText,
  looksLikeImage,
  looksLikePdf,
  MIN_SELECTABLE_TEXT_CHARS,
  rasterizePdfPage,
  toUint8Array
} from "./pdfInternals.js";

const TESSERACT_CACHE_PATH = join(tmpdir(), "expliquemoi-v3-tesseract");

export type OcrBinarySource = Uint8Array | ArrayBuffer | Buffer;

export interface OcrEngineOptions {
  /** Langues Tesseract (défaut: fra+eng). */
  languages?: string;
  /** Seuil de caractères sélectionnables pour considérer un PDF comme texte. */
  minSelectableChars?: number;
  /** Échelle de rasterisation PDF avant OCR. */
  rasterScale?: number;
}

export class OcrEngine {
  private readonly languages: string;
  private readonly minSelectableChars: number;
  private readonly rasterScale: number;
  private worker: Worker | null = null;
  private tesseractStarted = false;

  constructor(options: OcrEngineOptions = {}) {
    this.languages = options.languages || "fra+eng";
    this.minSelectableChars =
      Number(options.minSelectableChars) > 0
        ? Number(options.minSelectableChars)
        : MIN_SELECTABLE_TEXT_CHARS;
    this.rasterScale =
      Number(options.rasterScale) > 0 ? Number(options.rasterScale) : 2;
  }

  /**
   * Indique si un PDF est scanné (peu / pas de texte sélectionnable).
   */
  async isScannedPdf(source: OcrBinarySource): Promise<boolean> {
    const bytes = toUint8Array(source);
    if (!looksLikePdf(bytes)) {
      throw new Error("isScannedPdf: le fichier n’est pas un PDF.");
    }

    const extraction = await extractSelectableText(bytes);
    return extraction.textLength < this.minSelectableChars;
  }

  /**
   * Détection de langue à partir d’un texte ou d’un document.
   * Pour un PDF texte : heuristique sur le texte sélectionnable (sans Tesseract).
   * Pour un PDF scanné / image : OCR puis heuristique.
   */
  async languageDetection(
    source: OcrBinarySource | string
  ): Promise<LanguageDetectionResult> {
    if (typeof source === "string") {
      return detectLanguageFromText(source);
    }

    const bytes = toUint8Array(source);
    if (looksLikePdf(bytes)) {
      const scanned = await this.isScannedPdf(bytes);
      if (!scanned) {
        const extraction = await extractSelectableText(bytes);
        return detectLanguageFromText(extraction.fullText);
      }
      const ocr = await this.extractText(bytes);
      return detectLanguageFromText(ocr.fullText);
    }

    if (looksLikeImage(bytes)) {
      const ocr = await this.extractText(bytes);
      return detectLanguageFromText(ocr.fullText);
    }

    throw new Error("languageDetection: format non supporté.");
  }

  /**
   * Extrait le texte page par page.
   */
  async extractPages(source: OcrBinarySource): Promise<OCRPageResult[]> {
    const result = await this.extractText(source);
    return result.pages;
  }

  /**
   * Extrait le texte complet + pages.
   * - PDF avec texte sélectionnable → pdfjs uniquement (Tesseract non lancé).
   * - PDF scanné → Tesseract page par page.
   * - Image → Tesseract.
   */
  async extractText(source: OcrBinarySource): Promise<OCRResult> {
    const bytes = toUint8Array(source);

    if (looksLikePdf(bytes)) {
      return this.extractFromPdf(bytes);
    }

    if (looksLikeImage(bytes)) {
      return this.extractFromImage(bytes);
    }

    throw new Error("extractText: format non supporté (PDF ou image attendu).");
  }

  /**
   * Termine le worker Tesseract s’il a été créé.
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.tesseractStarted = false;
  }

  /** Exposé pour les tests : true seulement si Tesseract a été démarré. */
  didUseTesseract(): boolean {
    return this.tesseractStarted;
  }

  private async extractFromPdf(bytes: Uint8Array): Promise<OCRResult> {
    const extraction = await extractSelectableText(bytes);
    const scanned = extraction.textLength < this.minSelectableChars;

    if (!scanned) {
      const pages: OCRPageResult[] = extraction.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        confidence: page.text ? 100 : 0
      }));

      return {
        pages,
        fullText: extraction.fullText,
        warnings: []
      };
    }

    // PDF scanné : OCR uniquement (pas d’IA).
    const warnings = [
      "PDF scanné détecté : extraction via Tesseract.js (pas de texte sélectionnable)."
    ];
    const pages: OCRPageResult[] = [];

    for (let pageNumber = 1; pageNumber <= extraction.pageCount; pageNumber += 1) {
      let png: Buffer | null = null;
      try {
        png = await rasterizePdfPage(bytes, pageNumber, {
          scale: this.rasterScale
        });
        const recognized = await this.recognizeImage(png);
        pages.push({
          pageNumber,
          text: recognized.text,
          confidence: recognized.confidence
        });
      } catch (error) {
        pages.push({
          pageNumber,
          text: "",
          confidence: 0
        });
        warnings.push(
          `OCR page ${pageNumber} échoué: ${
            error instanceof Error ? error.message : "erreur inconnue"
          }`
        );
      } finally {
        png = null;
      }
    }

    const fullText = pages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return { pages, fullText, warnings };
  }

  private async extractFromImage(bytes: Uint8Array): Promise<OCRResult> {
    const recognized = await this.recognizeImage(Buffer.from(bytes));
    const text = recognized.text;
    return {
      pages: [
        {
          pageNumber: 1,
          text,
          confidence: recognized.confidence
        }
      ],
      fullText: text,
      warnings: []
    };
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker) {
      return this.worker;
    }

    this.worker = await createWorker(this.languages, 1, {
      cachePath: TESSERACT_CACHE_PATH
    });
    this.tesseractStarted = true;
    return this.worker;
  }

  private async recognizeImage(
    image: Buffer
  ): Promise<{ text: string; confidence: number }> {
    const worker = await this.ensureWorker();
    const { data } = await worker.recognize(image);
    const text = String(data.text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const confidence = Number.isFinite(data.confidence)
      ? Math.max(0, Math.min(100, Number(data.confidence)))
      : text
        ? 50
        : 0;

    return { text, confidence };
  }
}
