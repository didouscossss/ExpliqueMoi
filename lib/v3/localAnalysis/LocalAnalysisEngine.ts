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
import { selectAmountFields } from "./amountRanking.js";
import { detectDocumentType } from "./documentType.js";
import { buildLocalEvidence } from "./evidence.js";
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
  extractSiret
} from "./extractors.js";
import { buildFactualSummary } from "./factualSummary.js";
import { normalizeText } from "./normalize.js";

export type LocalAnalysisInput = string | OCRResult;

export class LocalAnalysisEngine {
  analyze(input: LocalAnalysisInput): LocalAnalysis {
    const ocr = typeof input === "string" ? null : input;
    const text = this.resolveText(input);
    const warnings: string[] = [];

    if (!text || text.replace(/\s+/g, "").length < 8) {
      warnings.push("Texte OCR insuffisant pour une analyse locale fiable.");
      return this.emptyResult(warnings);
    }

    const typeGuess = detectDocumentType(text);
    const { dates, deadlines } = extractDates(text);
    const ranked = selectAmountFields(text);
    // Conserve aussi les matches regex historiques (fusion / preuves).
    const regexAmounts = extractAmounts(text);
    const amounts = this.mergeAmounts(ranked.amounts, regexAmounts);

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
      deadlines,
      ranked,
      ibans,
      sirets,
      invoiceNumbers
    });

    if (
      !fields.amountTTC &&
      !fields.amountToPay &&
      !fields.amountHT &&
      !fields.netToPay
    ) {
      warnings.push("Aucun montant clairement détecté.");
    }

    // Incohérence arithmétique vérifiable uniquement (pas « champ manquant »).
    if (
      fields.amountHT != null &&
      fields.amountTVA != null &&
      (fields.amountTTC != null || fields.amountToPay != null)
    ) {
      const ttc = fields.amountToPay ?? fields.amountTTC ?? 0;
      const sum = Math.round((fields.amountHT + fields.amountTVA) * 100) / 100;
      if (Math.abs(sum - ttc) > 0.05) {
        warnings.push(
          `Incohérence possible des montants : HT (${fields.amountHT}) + TVA (${fields.amountTVA}) ≠ TTC/à payer (${ttc}).`
        );
      }
    }

    const base: LocalAnalysis = {
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
      fields,
      evidence: [],
      factualSummary: null
    };

    base.evidence = buildLocalEvidence(base, text, ocr);
    // Enrichit la preuve du montant principal (gagnant du ranking) avec les raisons.
    if (fields.principalReasons?.length) {
      const preferredFields = [
        fields.principalSource,
        "amountToPay",
        "amountTTC",
        "netToPay",
        "amountHT"
      ].filter(Boolean) as string[];
      const principalEv =
        preferredFields
          .map((field) => base.evidence.find((item) => item.field === field))
          .find(Boolean) || null;
      if (principalEv) {
        principalEv.reasons = fields.principalReasons;
        principalEv.confidence = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (ranked.principal != null ? 70 : 40) +
                (ranked.arithmeticOk ? 20 : 0)
            )
          )
        );
      }
    }
    base.factualSummary = buildFactualSummary(base, text);

    return base;
  }

  analyzeText(text: string): LocalAnalysis {
    return this.analyze(text);
  }

  analyzeOcr(ocr: OCRResult): LocalAnalysis {
    return this.analyze(ocr);
  }

  enrichAmountFields(analysis: LocalAnalysis, extraTexts: string[]): LocalAnalysis {
    const blob = (extraTexts || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n");
    if (!blob) {
      return analysis;
    }
    // Re-analyse locale complète sur le texte enrichi (OCR only, jamais IA).
    return this.analyze(blob);
  }

  private mergeAmounts(
    ranked: LocalAmountFinding[],
    regexAmounts: LocalAmountFinding[]
  ): LocalAmountFinding[] {
    const byKey = new Map<string, LocalAmountFinding>();
    for (const item of [...ranked, ...regexAmounts]) {
      if (item.value == null) continue;
      const key = `${item.label}:${item.value}`;
      const prev = byKey.get(key);
      if (!prev || (item.rank || 0) > (prev.rank || 0)) {
        byKey.set(key, item);
      }
    }
    return [...byKey.values()].sort((a, b) => (b.rank || 0) - (a.rank || 0));
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
    deadlines: LocalAnalysis["deadlines"];
    ranked: ReturnType<typeof selectAmountFields>;
    ibans: LocalAnalysis["references"];
    sirets: LocalAnalysis["references"];
    invoiceNumbers: LocalAnalysis["references"];
  }): LocalAnalysisFields {
    const issueDate =
      parts.dates.find((item) => item.label === "issue_date")?.iso ||
      parts.dates.find((item) => item.label === "document_date")?.iso ||
      null;

    const paymentDate =
      parts.deadlines.find((item) => item.label === "payment_date")?.iso ||
      parts.deadlines.find((item) => item.label === "deadline")?.iso ||
      parts.dates.find((item) => item.label === "payment_date")?.iso ||
      null;

    // Facture/devis : date actionnable = prélèvement/échéance si présente.
    const invoiceLike =
      parts.documentType === "facture" || parts.documentType === "devis";
    const primaryDate = invoiceLike
      ? paymentDate ||
        issueDate ||
        parts.dates.find((item) => item.iso)?.iso ||
        parts.dates[0]?.raw ||
        null
      : issueDate ||
        paymentDate ||
        parts.dates.find((item) => item.iso)?.iso ||
        parts.dates[0]?.raw ||
        null;

    return {
      companyName: parts.companyName,
      clientName: parts.clientName,
      date: primaryDate,
      issueDate,
      paymentDate,
      amountHT: parts.ranked.amountHT,
      amountTVA: parts.ranked.amountTVA,
      amountTTC: parts.ranked.amountTTC,
      amountToPay: parts.ranked.amountToPay,
      netToPay: parts.ranked.netToPay,
      principalSource: parts.ranked.principalSource,
      principalReasons: parts.ranked.principalReasons,
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
        issueDate: null,
        paymentDate: null,
        amountHT: null,
        amountTVA: null,
        amountTTC: null,
        amountToPay: null,
        netToPay: null,
        principalSource: null,
        principalReasons: [],
        iban: null,
        siret: null,
        invoiceNumber: null
      },
      evidence: [],
      factualSummary: null
    };
  }
}
