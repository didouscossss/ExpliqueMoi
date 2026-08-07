/**
 * Moteur d’analyse locale V3 — regex / heuristiques uniquement.
 * Aucun appel IA.
 */

import type { OCRResult } from "../types/OCRResult.js";
import type {
  LocalAnalysis,
  LocalAnalysisFields,
  LocalAmountFinding
} from "../types/LocalAnalysis.js";
import { detectDocumentType } from "./documentType.js";
import {
  detectActions,
  detectRequiredDocuments,
  extractAmounts,
  extractClientName,
  extractCompanyName,
  extractContacts,
  extractDates,
  extractIban,
  extractInvoiceNumber,
  extractSiret,
  pickBestAmount
} from "./extractors.js";
import { normalizeText } from "./normalize.js";

export type LocalAnalysisInput = string | OCRResult;

export class LocalAnalysisEngine {
  /**
   * Analyse un texte OCR ou un OCRResult complet.
   */
  analyze(input: LocalAnalysisInput): LocalAnalysis {
    const text = this.resolveText(input);
    const warnings: string[] = [];

    if (!text || text.replace(/\s+/g, "").length < 8) {
      warnings.push("Texte OCR insuffisant pour une analyse locale fiable.");
      return this.emptyResult(warnings);
    }

    const typeGuess = detectDocumentType(text);
    const { dates, deadlines } = extractDates(text);
    const amounts = extractAmounts(text);
    const ibans = extractIban(text);
    const sirets = extractSiret(text);
    const invoiceNumbers = extractInvoiceNumber(text);
    const companyName = extractCompanyName(text);
    const clientName = extractClientName(text);
    const contacts = extractContacts(text);

    if (companyName) {
      contacts.unshift({ kind: "company", value: companyName, page: null });
    }
    if (clientName) {
      contacts.push({ kind: "person", value: clientName, page: null });
    }

    const references = [...invoiceNumbers, ...sirets, ...ibans];
    const fields = this.buildFields({
      documentType: typeGuess.documentType,
      companyName,
      clientName,
      dates,
      amounts,
      ibans,
      sirets,
      invoiceNumbers
    });

    if (!fields.amountTTC && !fields.amountHT) {
      warnings.push("Aucun montant HT/TTC clairement détecté.");
    }
    if (!fields.siret && typeGuess.documentType === "facture") {
      warnings.push("SIRET non détecté sur ce document.");
    }

    return {
      documentType: typeGuess.documentType,
      documentTypeConfidence: typeGuess.confidence,
      issuer: companyName,
      dates,
      deadlines,
      amounts,
      references,
      contacts,
      requiredDocuments: detectRequiredDocuments(text),
      detectedActions: detectActions(text),
      warnings,
      fields
    };
  }

  /** Alias pratique. */
  analyzeText(text: string): LocalAnalysis {
    return this.analyze(text);
  }

  analyzeOcr(ocr: OCRResult): LocalAnalysis {
    return this.analyze(ocr);
  }

  private resolveText(input: LocalAnalysisInput): string {
    if (typeof input === "string") {
      return normalizeText(input);
    }
    if (input?.fullText) {
      return normalizeText(input.fullText);
    }
    const fromPages = (input?.pages || [])
      .map((page) => page.text || "")
      .filter(Boolean)
      .join("\n\n");
    return normalizeText(fromPages);
  }

  private buildFields(parts: {
    documentType: LocalAnalysis["documentType"];
    companyName: string | null;
    clientName: string | null;
    dates: LocalAnalysis["dates"];
    amounts: LocalAmountFinding[];
    ibans: LocalAnalysis["references"];
    sirets: LocalAnalysis["references"];
    invoiceNumbers: LocalAnalysis["references"];
  }): LocalAnalysisFields {
    const amountHT = pickBestAmount(parts.amounts, ["HT"]);
    const amountTVA = pickBestAmount(parts.amounts, ["TVA"]);
    const amountToPay = pickBestAmount(parts.amounts, ["montant_a_payer"]);
    const netToPay = pickBestAmount(parts.amounts, ["net_a_payer"]);
    // amountTTC = libellé TTC uniquement (pas de fusion avec à payer).
    const amountTTC =
      pickBestAmount(parts.amounts, ["TTC"], {
        preferReconcileWith: { ht: amountHT, tva: amountTVA }
      }) ?? null;

    const primaryDate =
      parts.dates.find((item) => item.label === "document_date")?.iso ||
      parts.dates.find((item) => item.iso)?.iso ||
      parts.dates[0]?.raw ||
      null;

    return {
      companyName: parts.companyName,
      clientName: parts.clientName,
      date: primaryDate,
      amountHT,
      amountTVA,
      amountTTC,
      amountToPay,
      netToPay,
      iban: parts.ibans[0]?.value ?? null,
      siret: parts.sirets[0]?.value ?? null,
      invoiceNumber: parts.invoiceNumbers[0]?.value ?? null
    };
  }

  private emptyResult(warnings: string[]): LocalAnalysis {
    return {
      documentType: "document_inconnu",
      documentTypeConfidence: 0,
      issuer: null,
      dates: [],
      deadlines: [],
      amounts: [],
      references: [],
      contacts: [],
      requiredDocuments: [],
      detectedActions: [],
      warnings,
      fields: {
        companyName: null,
        clientName: null,
        date: null,
        amountHT: null,
        amountTVA: null,
        amountTTC: null,
        amountToPay: null,
        netToPay: null,
        iban: null,
        siret: null,
        invoiceNumber: null
      }
    };
  }
}
