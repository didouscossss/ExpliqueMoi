// lib/v4/integration/featureFlag.ts
function isV4EngineEnabled(request) {
  const raw = String(process.env.USE_V4_ENGINE ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  const allowQuery = String(process.env.ALLOW_V4_QUERY ?? "").trim().toLowerCase() === "true";
  const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
  const isProd = vercelEnv === "production";
  if (allowQuery && !isProd && request?.url) {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.searchParams.get("engine") === "v4") return true;
    } catch {
    }
  }
  return false;
}

// lib/v4/integration/adapters.ts
function asBbox(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(
    raw.width ?? raw.w
  );
  const height = Number(
    raw.height ?? raw.h
  );
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}
function textToV4Blocks(text, options = {}) {
  const page = options.page ?? 1;
  const source = options.source ?? "text";
  const prefix = options.idPrefix ?? `p${page}`;
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!String(line).trim()) continue;
    blocks.push({
      id: `${prefix}_line_${i + 1}`,
      text: line,
      page,
      lineId: `${prefix}_L${i + 1}`,
      blockId: `${prefix}_B${i + 1}`,
      source,
      bbox: null
    });
  }
  return blocks;
}
function pdfExtractionToV4Blocks(extraction, options = {}) {
  const source = options.source ?? "pdfjs";
  const diagnostics = [];
  const pageTexts = Array.isArray(extraction.pageTexts) ? extraction.pageTexts : [];
  const blocks = [];
  for (const page of pageTexts) {
    const pageNumber = Number(page.pageNumber) || 1;
    const pageBlocks = textToV4Blocks(page.text || "", {
      page: pageNumber,
      source,
      idPrefix: `pdf_p${pageNumber}`
    });
    blocks.push(...pageBlocks);
  }
  if (!blocks.length && extraction.fullText) {
    const cleaned = String(extraction.fullText).replace(/^--- Page \d+ ---\n/gm, "").replace(/\[aucun texte sélectionnable\]/g, "");
    blocks.push(
      ...textToV4Blocks(cleaned, { page: 1, source, idPrefix: "pdf_full" })
    );
    diagnostics.push({ step: "adapter", note: "fallback_fullText" });
  }
  const text = blocks.map((b) => b.text).join("\n");
  const chars = text.replace(/\s+/g, "").length;
  const extractionQuality = chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty";
  diagnostics.push({
    step: "pdfExtractionToV4Blocks",
    pages: pageTexts.length,
    blocks: blocks.length,
    chars,
    extractionQuality,
    scanned: extraction.scanned === true
  });
  return {
    blocks,
    text,
    source,
    extractionQuality,
    pageCount: extraction.pageCount || pageTexts.length || 1,
    diagnostics
  };
}
function ocrResultToV4Input(ocr) {
  const source = ocr.source || "ocr";
  const diagnostics = [];
  const items = [
    ...Array.isArray(ocr.blocks) ? ocr.blocks : [],
    ...Array.isArray(ocr.items) ? ocr.items : []
  ];
  if (items.length) {
    const blocks2 = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const text2 = String(item.text || "").trim();
      if (!text2) continue;
      const page = Number(item.pageNumber ?? item.page) || 1;
      blocks2.push({
        id: item.blockId || `ocr_${page}_${i + 1}`,
        text: text2,
        page,
        bbox: asBbox(item.bbox),
        lineId: item.lineId ?? `ocr_L${i + 1}`,
        blockId: item.blockId ?? `ocr_B${i + 1}`,
        source: item.source || source
      });
    }
    const text = blocks2.map((b) => b.text).join("\n");
    const chars2 = text.replace(/\s+/g, "").length;
    return {
      blocks: blocks2,
      text,
      source,
      extractionQuality: chars2 >= 40 ? "full" : chars2 >= 8 ? "partial" : "empty",
      pageCount: Math.max(1, ...blocks2.map((b) => b.page), 1),
      diagnostics: [
        ...diagnostics,
        { step: "ocrResultToV4Input", mode: "items", blocks: blocks2.length }
      ]
    };
  }
  if (Array.isArray(ocr.pages) && ocr.pages.length) {
    const merged = ocr.pages.map((p, i) => ({
      pageNumber: Number(p.pageNumber ?? p.page) || i + 1,
      text: String(p.text || "")
    }));
    return pdfExtractionToV4Blocks(
      { pageTexts: merged, fullText: ocr.fullText || ocr.text },
      { source }
    );
  }
  const plain = String(ocr.fullText || ocr.text || "");
  const blocks = textToV4Blocks(plain, { source, idPrefix: "ocr" });
  const chars = plain.replace(/\s+/g, "").length;
  return {
    blocks,
    text: blocks.map((b) => b.text).join("\n"),
    source,
    extractionQuality: chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty",
    pageCount: 1,
    diagnostics: [
      ...diagnostics,
      { step: "ocrResultToV4Input", mode: "plain", chars }
    ]
  };
}
function pagesToV4Input(input) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const diagnostics = [];
  const blocks = [];
  let pageOffset = 0;
  for (const page of pages) {
    if (page.mimeType === "application/pdf") {
      const adapted = pdfExtractionToV4Blocks(
        {
          pageTexts: page.pdfPageTexts,
          fullText: page.pdfFullText,
          hasText: page.pdfHasText,
          scanned: page.pdfScanned,
          pageCount: page.pdfPageCount
        },
        { source: "pdfjs" }
      );
      for (const b of adapted.blocks) {
        blocks.push({
          ...b,
          page: b.page + pageOffset,
          id: `u${page.order ?? pageOffset}_${b.id}`
        });
      }
      pageOffset += page.pdfPageCount || adapted.pageCount || 1;
      diagnostics.push(...adapted.diagnostics);
    } else {
      pageOffset += 1;
      diagnostics.push({
        step: "pagesToV4Input",
        note: "image_without_local_ocr",
        name: page.name,
        mimeType: page.mimeType
      });
    }
  }
  const pasted = String(input.pastedText || "").trim();
  if (pasted) {
    blocks.push(
      ...textToV4Blocks(pasted, {
        page: Math.max(1, pageOffset || 1),
        source: "text",
        idPrefix: "paste"
      })
    );
    diagnostics.push({ step: "pagesToV4Input", note: "pasted_text", chars: pasted.length });
  }
  const text = blocks.map((b) => b.text).join("\n");
  const chars = text.replace(/\s+/g, "").length;
  return {
    blocks,
    text,
    source: blocks.some((b) => b.source === "pdfjs") ? "pdfjs" : blocks.some((b) => b.source === "ocr") ? "ocr" : "text",
    extractionQuality: chars >= 40 ? "full" : chars >= 8 ? "partial" : "empty",
    pageCount: Math.max(pageOffset, 1),
    diagnostics
  };
}

// lib/v4/presentation/format.ts
var MONTHS = [
  "janvier",
  "f\xE9vrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "ao\xFBt",
  "septembre",
  "octobre",
  "novembre",
  "d\xE9cembre"
];
function formatMoneyFR(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const formatted = n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} \u20AC`;
}
function formatDateFR(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12) return s;
    return `${d} ${MONTHS[mo - 1]} ${y}`;
  }
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s;
  return s.length <= 40 ? s : null;
}
function documentTypeLabel(type) {
  const map = {
    invoice: "facture",
    bankStatement: "relev\xE9 bancaire",
    taxDocument: "document fiscal",
    incomeTaxReturn: "d\xE9claration de revenus",
    incomeTaxNotice: "avis d'imp\xF4t sur le revenu",
    propertyTax: "avis de taxe fonci\xE8re",
    taxForm: "formulaire fiscal",
    unknownTaxDocument: "document fiscal",
    administrativeLetter: "courrier administratif",
    contract: "contrat",
    payslip: "bulletin de paie",
    receipt: "re\xE7u",
    notice: "avis",
    form: "formulaire",
    certificate: "attestation",
    financialStatement: "\xE9tat financier",
    explanatoryDocument: "document explicatif",
    unknown: "document"
  };
  return map[type] || "document";
}
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function isUsableFactStatus(status) {
  return status === "supported" || status === "derived";
}
function factKey(field3, kind) {
  return kind && kind !== field3 ? `${field3}:${kind}` : field3;
}

// lib/v4/integration/fiscalViewModel.ts
function informationStatusLabelFr(status) {
  switch (status) {
    case "sufficientForExplanation":
      return "Informations suffisantes pour expliquer cette case";
    case "missingInformation":
      return "Certaines informations utiles n\u2019ont pas \xE9t\xE9 retrouv\xE9es";
    case "ambiguousInformation":
      return "Certaines informations restent ambigu\xEBs";
    case "requiresVerification":
      return "Des pr\xE9cisions permettraient de mieux comprendre cette case";
    default:
      return null;
  }
}
function presenceLabelFr(presence) {
  switch (presence) {
    case "presentWithValue":
      return "Valeur d\xE9tect\xE9e dans le document";
    case "presentEmpty":
      return "Case pr\xE9sente sans valeur renseign\xE9e";
    case "ambiguous":
      return "Valeur ambigu\xEB \u2014 non rattach\xE9e";
    case "valueUnknown":
      return "Valeur non d\xE9termin\xE9e";
    default:
      return "Case non d\xE9tect\xE9e comme champ rempli";
  }
}
var NON_FISCAL_PRIMARY = /* @__PURE__ */ new Set([
  "invoice",
  "bankStatement",
  "contract",
  "payslip",
  "receipt"
]);
var FISCAL_PRIMARY = /* @__PURE__ */ new Set([
  "taxDocument",
  "incomeTaxReturn",
  "incomeTaxNotice",
  "propertyTax",
  "taxForm",
  "unknownTaxDocument",
  "form",
  "notice",
  "administrativeLetter"
]);
var FAMILY_LABELS = {
  incomeTaxReturn: "D\xE9claration de revenus",
  incomeTaxNotice: "Avis d\u2019imp\xF4t sur le revenu",
  propertyTax: "Taxe fonci\xE8re",
  housingTax: "Taxe d\u2019habitation",
  withholdingTax: "Pr\xE9l\xE8vement \xE0 la source",
  taxCreditReduction: "R\xE9ductions et cr\xE9dits d\u2019imp\xF4t",
  taxRefund: "Remboursement d\u2019imp\xF4t",
  taxPayment: "Paiement d\u2019imp\xF4t",
  foreignIncomeDeclaration: "Revenus de source \xE9trang\xE8re",
  rentalIncomeDeclaration: "Revenus fonciers",
  professionalIncomeDeclaration: "Revenus professionnels",
  professionalBenefits: "B\xE9n\xE9fices professionnels",
  capitalGainsDeclaration: "Plus-values",
  wealthTax: "Imp\xF4t sur la fortune immobili\xE8re",
  inheritanceDonation: "Succession / donation",
  foreignAccountsDeclaration: "Comptes \xE0 l\u2019\xE9tranger",
  corporateTax: "Imp\xF4t sur les soci\xE9t\xE9s",
  vatDeclaration: "D\xE9claration de TVA",
  businessTax: "Imp\xF4ts des entreprises",
  taxCertificate: "Attestation / certificat fiscal",
  taxAdministrativeLetter: "Courrier fiscal",
  taxForm: "Formulaire fiscal",
  taxNotice: "Avis fiscal",
  taxInstruction: "Notice fiscale",
  unknownTaxDocument: "Document fiscal"
};
var QUALITY_LABELS = {
  verified: "Explication v\xE9rifi\xE9e \xE0 partir de sources officielles",
  partiallyVerified: "Certaines informations restent \xE0 v\xE9rifier",
  discovered: "Fiche encore partielle",
  needsReview: "\xC0 v\xE9rifier"
};
var FIELD_LABELS = {
  amountDue: "Montant \xE0 payer",
  taxAmount: "Montant d\u2019imp\xF4t",
  refundAmount: "Montant \xE0 rembourser",
  paymentDeadline: "Date limite de paiement",
  fiscalPeriod: "P\xE9riode / date indiqu\xE9e",
  amountTTC: "Montant TTC",
  amountHT: "Montant HT",
  vatAmount: "TVA",
  purpose: "Objet indiqu\xE9",
  reference: "R\xE9f\xE9rence",
  status: "Statut",
  incomeYear: "Ann\xE9e des revenus",
  documentYear: "Ann\xE9e du document"
};
var EVIDENCE_SUPPORT_LABELS = {
  amountDue: "le montant \xE0 payer",
  taxAmount: "le montant d\u2019imp\xF4t",
  refundAmount: "le montant \xE0 rembourser",
  paymentDeadline: "la date limite",
  fiscalPeriod: "la p\xE9riode ou une date du document",
  amountTTC: "un montant TTC",
  amountHT: "un montant HT",
  vatAmount: "un montant de TVA",
  documentIdentity: "l\u2019identit\xE9 du document",
  reference: "une r\xE9f\xE9rence",
  actionDeadline: "une \xE9ch\xE9ance",
  arithmeticConsistency: "la coh\xE9rence des montants",
  secondary: "une information compl\xE9mentaire"
};
var TECHNICAL_EXPOSED = /\b(incomeTaxReturn|incomeTaxNotice|taxCreditReduction|fiscalKnowledge|DocumentFacts?|KnowledgeFact|qualityStatus|relatedDocumentRefs|warning:|amountHT|arithmeticConsistency)\b/i;
function familyLabelFr(family) {
  if (!family) return null;
  return FAMILY_LABELS[family] || null;
}
function qualityStatusLabelFr(status) {
  if (!status) return null;
  return QUALITY_LABELS[status] || null;
}
function humanFieldLabel(field3) {
  if (FIELD_LABELS[field3]) return FIELD_LABELS[field3];
  const spaced = field3.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  if (/^[a-z0-9 ]+$/.test(spaced) && !/[A-Z]{2,}/.test(field3)) {
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return "Information du document";
}
function humanEvidenceSupport(facts) {
  if (!facts?.length) return "une information du document";
  const labels = facts.map((f) => {
    const key = f.split(":").pop() || f;
    if (EVIDENCE_SUPPORT_LABELS[key]) return EVIDENCE_SUPPORT_LABELS[key];
    if (TECHNICAL_EXPOSED.test(key)) return null;
    return humanFieldLabel(key).toLowerCase();
  }).filter(Boolean);
  if (!labels.length) return "une information du document";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}
function formatFactValue(field3, value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (/amount|tax|refund|due|ttc|ht|vat/i.test(field3)) {
      return formatMoneyFR(value) || `${value}`;
    }
    return String(value);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return formatDateFR(value) || value;
    }
    if (/^(accountStatement|taxObligation|paymentInformation)$/i.test(value)) {
      return null;
    }
    return value;
  }
  return String(value);
}
function dedupeFacts(facts) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of facts) {
    const key = `${f.label}|${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
function factsFromDocument(refs) {
  if (!refs?.length) return [];
  const out = [];
  for (const f of refs) {
    if (f.kind !== "document") continue;
    if (!f.evidence?.length) continue;
    if (f.derivedFrom?.some((d) => String(d).startsWith("kf:"))) continue;
    const value = formatFactValue(f.field, f.value);
    if (!value) continue;
    out.push({
      label: humanFieldLabel(f.field),
      value,
      fieldKey: f.field
    });
  }
  return dedupeFacts(out).slice(0, 10);
}
function recognitionFrom(tx, kn) {
  const hasIdentity = Boolean(
    kn.primaryIdentity && kn.primaryIdentity.role === "documentIdentity" && (kn.primaryIdentity.confidence || 0) >= 0.55
  );
  const qs = tx.identity.qualityStatus;
  const conf = tx.confidence || 0;
  const hasWhat = Boolean(tx.whatIsIt);
  if (hasIdentity && qs === "verified" && conf >= 0.75 && hasWhat) {
    return {
      level: "certain",
      headline: "Document bien identifi\xE9",
      message: "Je peux vous expliquer ce document et ce qu\u2019il indique concr\xE8tement.",
      recognized: true
    };
  }
  if ((hasIdentity || hasWhat) && (qs === "verified" || qs === "partiallyVerified")) {
    const uncertain = (tx.warnings || []).some(
      (w) => /incertain|vérifier|partiellement|limitée/i.test(w)
    );
    return {
      level: uncertain ? "probable" : "certain",
      headline: uncertain ? "Document identifi\xE9 \u2014 certains d\xE9tails restent \xE0 v\xE9rifier" : "Document identifi\xE9",
      message: "L\u2019essentiel est identifi\xE9. V\xE9rifiez les points signal\xE9s ci-dessous si besoin.",
      recognized: true
    };
  }
  if (kn.suggestedFamily === "unknownTaxDocument" || !hasIdentity && !hasWhat) {
    return {
      level: "insufficient",
      headline: "Je ne peux pas identifier ce document avec certitude",
      message: "Ce document semble fiscal ou administratif, mais son type pr\xE9cis n\u2019est pas encore \xE9tabli.",
      recognized: false
    };
  }
  return {
    level: "partial",
    headline: "Document probablement identifi\xE9",
    message: "L\u2019identification reste partielle. Seules les informations clairement pr\xE9sentes sont affich\xE9es.",
    recognized: Boolean(hasWhat || hasIdentity)
  };
}
function publicTitleFor(tx, kn) {
  if (tx.identity.officialTitle) return tx.identity.officialTitle;
  const fam = familyLabelFr(tx.identity.family) || familyLabelFr(kn.suggestedFamily);
  if (fam) return fam;
  if (tx.identity.reference) return `Document fiscal ${tx.identity.reference}`;
  return "Document fiscal ou administratif";
}
function countTechnicalLabels(vmParts) {
  return vmParts.filter((s) => TECHNICAL_EXPOSED.test(s)).length;
}
function shouldAttachFiscalViewModel(result) {
  const primary = result.diagnostics?.primaryDocumentType || result.classification?.primary || "";
  if (NON_FISCAL_PRIMARY.has(primary)) return false;
  const kn = result.fiscalKnowledge;
  if (!kn?.taxExplanation) return false;
  if (FISCAL_PRIMARY.has(primary)) return true;
  if (kn.suggestedFamily) return true;
  if (kn.primaryIdentity?.role === "documentIdentity") return true;
  if (kn.signals.some(
    (s) => s.family !== "negative" && (s.signal.startsWith("knowledge:lexical:") || s.weight >= 0.4)
  )) {
    return true;
  }
  return false;
}
function buildFiscalDocumentViewModel(result) {
  if (!shouldAttachFiscalViewModel(result)) return null;
  const kn = result.fiscalKnowledge;
  const tx = kn.taxExplanation;
  const recognition = recognitionFrom(tx, kn);
  const publicTitle = publicTitleFor(tx, kn);
  const rawReference = tx.identity.reference;
  const reference = recognition.level === "insufficient" ? null : rawReference && rawReference !== "INCOME-TAX-NOTICE" && rawReference !== "PROPERTY-TAX-NOTICE" ? rawReference : recognition.recognized ? rawReference : null;
  const showReference = Boolean(
    reference && recognition.recognized && reference !== "INCOME-TAX-NOTICE" && reference !== "PROPERTY-TAX-NOTICE" && /^\d{3,4}(-[A-Z0-9]+)*$/i.test(reference)
  );
  const cerfaRef = kn.detectedReferences.find(
    (r) => r.kind === "cerfaNumber" && r.matchKind === "cerfa" && (r.confidence || 0) >= 0.75 && r.registryId
  );
  const documentFacts = factsFromDocument(tx.importantDocumentFacts);
  const supportedActions = [];
  for (const a of result.explanation.actions || []) {
    if (a.status === "noExplicitActionDetected" || a.status === "missing") continue;
    if (!a.evidence?.length) continue;
    if (!a.description) continue;
    if (/contexte général du type de document/i.test(a.description)) continue;
    supportedActions.push({
      text: a.description,
      certainty: "supported"
    });
  }
  if (!supportedActions.length) {
    supportedActions.push({
      text: "Aucune action certaine d\xE9tect\xE9e.",
      certainty: "none"
    });
  }
  const relatedDocuments = (tx.relatedDocuments || []).map(
    (r) => ({
      reference: r.reference,
      title: r.title || r.reference,
      note: "Document associ\xE9 \u2014 utile dans certaines situations, sans obligation automatique."
    })
  );
  const importantPoints = [];
  for (const w of tx.warnings || []) {
    if (/ne constituent pas un conseil fiscal/i.test(w)) continue;
    if (/Aucun montant n'est présenté|Aucune date n'est présentée/i.test(w)) {
      if (!documentFacts.length) importantPoints.push(w);
      continue;
    }
    importantPoints.push(w);
  }
  const weakRefs = kn.detectedReferences.filter(
    (r) => r.role === "mentionedDocument" || r.matchKind === "possible" || (r.confidence || 0) < 0.55
  );
  for (const r of weakRefs.slice(0, 3)) {
    if (r.role === "mentionedDocument") {
      importantPoints.push(
        `La r\xE9f\xE9rence ${r.normalized} est mentionn\xE9e dans le document, sans en constituer forc\xE9ment l\u2019identit\xE9.`
      );
    } else if (r.matchKind === "possible") {
      importantPoints.push(
        `R\xE9f\xE9rence possible : ${r.normalized} (confiance insuffisante pour une identification certaine).`
      );
    }
  }
  const uncertainties = [...importantPoints];
  const provenance2 = [];
  for (const kf of tx.knowledgeFacts || []) {
    for (const p of kf.provenance || []) {
      if (!p.url) continue;
      if (provenance2.some((x) => x.url === p.url)) continue;
      provenance2.push({
        title: p.title || "Source officielle",
        url: p.url,
        authority: p.authority || "DGFiP"
      });
    }
  }
  const evidence = (result.presentation.evidencePassages || []).filter((p) => p.excerpt && p.excerpt.trim().length >= 4).slice(0, 6).map((p) => ({
    page: p.page ? `Page ${p.page}` : "Document",
    quote: p.excerpt,
    supports: `Ce passage permet d\u2019identifier ${humanEvidenceSupport(p.supportedFacts)}.`
  }));
  const premiumPlaceholders = [
    {
      id: "explain-box",
      label: "M\u2019aider \xE0 comprendre cette case",
      description: "Bient\xF4t : aide contextuelle premium \xE0 partir des requirements et de vos documents (sans conseil fiscal automatique)."
    },
    {
      id: "fill-assist",
      label: "Aide-moi \xE0 remplir",
      description: "Bient\xF4t : guidage de remplissage pas \xE0 pas (premium)."
    },
    {
      id: "ask-document",
      label: "Poser une question approfondie",
      description: "Bient\xF4t : questions/r\xE9ponses personnalis\xE9es sur votre situation (premium)."
    },
    {
      id: "evaluate-field",
      label: "Cette case me concerne-t-elle ?",
      description: "Bient\xF4t : aide \xE0 l\u2019applicabilit\xE9 selon votre situation (premium)."
    }
  ];
  const fieldExplanations = kn.fieldExplanations || [];
  const assistanceByCode = new Map(
    (kn.fieldAssistance || []).map((a) => [a.fieldCode, a])
  );
  const rankedFields = [...fieldExplanations].sort((a, b) => {
    const score = (p) => p === "presentWithValue" ? 0 : p === "presentEmpty" ? 1 : p === "ambiguous" ? 2 : 3;
    return score(a.presence) - score(b.presence) || b.confidence - a.confidence;
  });
  const taxFields = rankedFields.slice(0, 8).map((fe) => {
    const assist = assistanceByCode.get(fe.fieldCode);
    const candidateFactNotes = (assist?.candidateFacts || []).filter((c) => c.sourceDocumentId && c.sourceDocumentId !== "primary").slice(0, 4).map(
      (c) => `Un document analys\xE9 (${c.sourceDocumentLabel || "annexe"}) contient une information potentiellement pertinente${c.displayValue ? ` : ${c.displayValue}` : ""}.`
    );
    if (assist?.ambiguousRequirements?.length) {
      for (const ar of assist.ambiguousRequirements.slice(0, 2)) {
        if (ar.candidateFacts.length > 1) {
          candidateFactNotes.push(
            `Plusieurs \xE9l\xE9ments candidats ont \xE9t\xE9 d\xE9tect\xE9s pour \xAB ${ar.label} \xBB \u2014 aucune valeur finale n\u2019est invent\xE9e.`
          );
        }
      }
    }
    return {
      fieldCode: fe.fieldCode,
      label: fe.label,
      section: fe.section,
      explanation: fe.plainLanguageWhat || fe.whatIsIt,
      declarantRoleLabel: fe.declarantRoleLabel,
      documentValue: fe.documentValue,
      presenceLabel: presenceLabelFr(fe.presence),
      page: fe.page,
      confidence: fe.confidence,
      qualityLabel: qualityStatusLabelFr(fe.qualityStatus),
      warnings: (fe.warnings || []).filter(
        (w) => !/conseil fiscal personnalisé/i.test(w)
      ),
      informationStatus: assist?.informationStatus || null,
      informationStatusLabel: informationStatusLabelFr(
        assist?.informationStatus || null
      ),
      missingRequirements: (assist?.missingRequirements || []).map((r) => ({
        label: r.label,
        status: r.status,
        statusLabel: r.statusLabel,
        description: r.description
      })),
      ambiguousRequirements: (assist?.ambiguousRequirements || []).map((r) => ({
        label: r.label,
        status: r.status,
        statusLabel: r.statusLabel,
        description: r.description
      })),
      supportingDocuments: (assist?.supportingDocuments || []).map((s) => ({
        label: s.label,
        description: s.description,
        normative: s.normative
      })),
      generalConditions: (assist?.generalConditions || []).map((c) => c.statement),
      priorityQuestions: (assist?.priorityQuestions || []).map((q) => ({
        question: q.question,
        reason: q.reason
      })),
      moreQuestionsCount: Math.max(
        0,
        (assist?.questions?.length || 0) - (assist?.priorityQuestions?.length || 0)
      ),
      candidateFactNotes,
      officialSources: (assist?.provenance || []).filter((p) => p.url).slice(0, 4).map((p) => ({
        title: p.title || "Source officielle",
        url: p.url
      })),
      understandCtaLabel: "M\u2019aider \xE0 comprendre cette case"
    };
  });
  const knowledgePromoted = tx.invariants.documentFactsFromKnowledge || 0;
  let unsupportedUserActions = 0;
  for (const a of supportedActions) {
    if (a.certainty === "supported" && /vous devez (remplir|cocher|déclarer)|avant le \d{1,2}\//i.test(a.text) && !result.explanation.actions.some(
      (ea) => ea.evidence?.length && ea.description && a.text.includes(ea.description)
    )) {
      unsupportedUserActions += 1;
    }
  }
  for (const a of tx.possibleActions || []) {
    if (/vous devez/i.test(a) && !/détectée dans le document/i.test(a)) {
    }
  }
  const exposedParts = [
    publicTitle,
    tx.whatIsIt || "",
    tx.purpose || "",
    ...documentFacts.map((f) => f.label),
    ...supportedActions.map((a) => a.text),
    ...relatedDocuments.map((r) => r.note),
    recognition.headline
  ];
  const technicalLabelsExposed = countTechnicalLabels(exposedParts);
  let uncertainRenderedAsCertain = 0;
  if (recognition.level === "certain" && (tx.identity.qualityStatus === "needsReview" || tx.identity.qualityStatus === "discovered" || kn.primaryIdentity && (kn.primaryIdentity.confidence || 0) < 0.5)) {
    uncertainRenderedAsCertain = 1;
  }
  return {
    recognized: recognition.recognized,
    recognitionLevel: recognition.level,
    confidenceHeadline: recognition.headline,
    confidenceMessage: recognition.message,
    identity: {
      publicTitle,
      reference,
      cerfa: cerfaRef?.normalized || null,
      familyLabel: familyLabelFr(tx.identity.family) || familyLabelFr(kn.suggestedFamily),
      showReference
    },
    understanding: {
      whatIsIt: tx.whatIsIt,
      purpose: tx.purpose,
      whoIsConcerned: tx.whoIsConcerned
    },
    documentFacts,
    possibleActions: supportedActions,
    importantPoints: importantPoints.slice(0, 8),
    relatedDocuments: relatedDocuments.slice(0, 8),
    taxFields,
    uncertainties: uncertainties.slice(0, 8),
    evidence,
    provenance: provenance2.slice(0, 6),
    qualityStatus: tx.identity.qualityStatus || null,
    qualityStatusLabel: qualityStatusLabelFr(tx.identity.qualityStatus),
    premiumPlaceholders,
    invariants: {
      knowledgePromotedToDocumentFact: knowledgePromoted,
      uncertainRenderedAsCertain,
      technicalLabelsExposed,
      unsupportedUserActions,
      taxFieldKnowledgePromotedToFact: kn.invariants.taxFieldKnowledgePromotedToFact || 0,
      unsupportedFieldValues: kn.invariants.unsupportedFieldValues || 0,
      emptyFieldConvertedToZero: kn.invariants.emptyFieldConvertedToZero || 0,
      unverifiedFieldDefinitionPresentedAsVerified: kn.invariants.unverifiedFieldDefinitionPresentedAsVerified || 0,
      fieldFalsePositiveCritical: kn.invariants.fieldFalsePositiveCritical || 0,
      knowledgePromotedToUserFact: kn.invariants.knowledgePromotedToUserFact || 0,
      requirementPromotedToObligation: kn.invariants.requirementPromotedToObligation || 0,
      candidateFactPromotedToCertain: kn.invariants.candidateFactPromotedToCertain || 0,
      unsupportedEligibilityDecision: kn.invariants.unsupportedEligibilityDecision || 0,
      unsupportedTaxAmount: kn.invariants.unsupportedTaxAmount || 0,
      automaticUnsafeAggregation: kn.invariants.automaticUnsafeAggregation || 0,
      missingPresentedAsUserDoesNotHave: kn.invariants.missingPresentedAsUserDoesNotHave || 0
    }
  };
}
function fiscalViewModelToPreviewJson(vm) {
  return {
    recognized: vm.recognized,
    recognition_level: vm.recognitionLevel,
    confidence_headline: vm.confidenceHeadline,
    confidence_message: vm.confidenceMessage,
    identity: {
      public_title: vm.identity.publicTitle,
      reference: vm.identity.reference,
      cerfa: vm.identity.cerfa,
      family_label: vm.identity.familyLabel,
      show_reference: vm.identity.showReference
    },
    understanding: {
      what_is_it: vm.understanding.whatIsIt,
      purpose: vm.understanding.purpose,
      who_is_concerned: vm.understanding.whoIsConcerned
    },
    document_facts: vm.documentFacts.map((f) => ({
      label: f.label,
      value: f.value
    })),
    possible_actions: vm.possibleActions.map((a) => ({
      text: a.text,
      certainty: a.certainty
    })),
    important_points: vm.importantPoints,
    related_documents: vm.relatedDocuments.map((r) => ({
      reference: r.reference,
      title: r.title,
      note: r.note
    })),
    tax_fields: vm.taxFields.map((f) => ({
      field_code: f.fieldCode,
      label: f.label,
      section: f.section,
      explanation: f.explanation,
      declarant_role_label: f.declarantRoleLabel,
      document_value: f.documentValue,
      presence_label: f.presenceLabel,
      page: f.page,
      confidence: f.confidence,
      quality_label: f.qualityLabel,
      warnings: f.warnings,
      information_status: f.informationStatus,
      information_status_label: f.informationStatusLabel,
      missing_requirements: f.missingRequirements.map((r) => ({
        label: r.label,
        status: r.status,
        status_label: r.statusLabel,
        description: r.description
      })),
      ambiguous_requirements: f.ambiguousRequirements.map((r) => ({
        label: r.label,
        status: r.status,
        status_label: r.statusLabel,
        description: r.description
      })),
      supporting_documents: f.supportingDocuments.map((s) => ({
        label: s.label,
        description: s.description,
        normative: s.normative
      })),
      general_conditions: f.generalConditions,
      priority_questions: f.priorityQuestions.map((q) => ({
        question: q.question,
        reason: q.reason
      })),
      more_questions_count: f.moreQuestionsCount,
      candidate_fact_notes: f.candidateFactNotes,
      official_sources: f.officialSources,
      understand_cta_label: f.understandCtaLabel
    })),
    uncertainties: vm.uncertainties,
    evidence: vm.evidence,
    provenance: vm.provenance,
    quality_status: vm.qualityStatus,
    quality_status_label: vm.qualityStatusLabel,
    premium_placeholders: vm.premiumPlaceholders,
    invariants: {
      knowledge_promoted_to_document_fact: vm.invariants.knowledgePromotedToDocumentFact,
      uncertain_rendered_as_certain: vm.invariants.uncertainRenderedAsCertain,
      technical_labels_exposed: vm.invariants.technicalLabelsExposed,
      unsupported_user_actions: vm.invariants.unsupportedUserActions,
      tax_field_knowledge_promoted_to_fact: vm.invariants.taxFieldKnowledgePromotedToFact,
      unsupported_field_values: vm.invariants.unsupportedFieldValues,
      empty_field_converted_to_zero: vm.invariants.emptyFieldConvertedToZero,
      unverified_field_definition_presented_as_verified: vm.invariants.unverifiedFieldDefinitionPresentedAsVerified,
      field_false_positive_critical: vm.invariants.fieldFalsePositiveCritical,
      knowledge_promoted_to_user_fact: vm.invariants.knowledgePromotedToUserFact,
      requirement_promoted_to_obligation: vm.invariants.requirementPromotedToObligation,
      candidate_fact_promoted_to_certain: vm.invariants.candidateFactPromotedToCertain,
      unsupported_eligibility_decision: vm.invariants.unsupportedEligibilityDecision,
      unsupported_tax_amount: vm.invariants.unsupportedTaxAmount,
      automatic_unsafe_aggregation: vm.invariants.automaticUnsafeAggregation,
      missing_presented_as_user_does_not_have: vm.invariants.missingPresentedAsUserDoesNotHave
    }
  };
}

// lib/v4/integration/mapToPreview.ts
function isAmbiguous(item) {
  return item.status === "ambiguous" || item.status === "contradictory";
}
function pickPrimaryAmount(items) {
  if (!items.length) return null;
  const usable = items.filter((i) => !isAmbiguous(i) && i.value != null);
  if (!usable.length) return null;
  const refund = usable.find(
    (i) => i.sourceFacts?.includes("refundAmount") || i.kind === "refundAmount" || /^remboursement$/i.test(i.label || "")
  );
  if (refund) return refund;
  const due = usable.find(
    (i) => i.sourceFacts?.includes("amountDue") || i.sourceFacts?.includes("netToPay") || /^montant dû$/i.test(i.label || "")
  );
  if (due) return due;
  const ttc = usable.find(
    (i) => (i.sourceFacts?.includes("amountTTC") || /ttc/i.test(i.label || "")) && !/total ht/i.test(i.label || "")
  );
  if (ttc) return ttc;
  const primaryTier = usable.find(
    (i) => i.tier === "primary" && !/total ht/i.test(i.label || "")
  );
  if (primaryTier) return primaryTier;
  return usable.find((i) => !/total ht|ht$/i.test(i.label || "")) || null;
}
function pickPrimaryDate(items) {
  if (!items.length) return null;
  const preferred = items.find(
    (i) => !isAmbiguous(i) && i.value != null && /refundDate|remboursement|dueDate|échéance|actionDeadline/i.test(
      `${i.kind} ${i.label} ${i.sourceFacts?.join(" ") || ""}`
    )
  );
  if (preferred) return preferred;
  const usable = items.find((i) => !isAmbiguous(i) && i.value != null);
  return usable || null;
}
function mapV4ResultToPreviewAnalysis(result, options = {}) {
  const { presentation, diagnostics, explanation } = result;
  const identity = presentation.documentIdentity;
  const essentialText = presentation.essential.map((e) => e.text).filter(Boolean).join(" ");
  const plain_summary = essentialText || identity.text || (identity.documentType === "unknown" ? "Les \xE9l\xE9ments extraits ne permettent pas encore d\u2019identifier clairement ce document." : identity.label);
  const userActions = presentation.actions.filter(
    (a) => a.kind === "userAction" && a.text && a.status !== "noExplicitActionDetected"
  );
  const actions = userActions.map((a) => ({
    action: a.text,
    how: a.label || ""
  }));
  const action_required = presentation.actionRequired;
  const request = actions[0]?.action || (action_required === false ? "Aucune action requise." : "Aucune demande certaine.");
  const why_received = presentation.reason?.text || "";
  const primaryDate = pickPrimaryDate(presentation.importantDates);
  const dates = primaryDate ? [
    {
      date: formatDateFR(primaryDate.value) || String(primaryDate.value || primaryDate.text),
      label: primaryDate.label || "Date",
      meaning: primaryDate.text || primaryDate.label || ""
    }
  ] : [];
  for (const d of presentation.importantDates) {
    if (primaryDate && d === primaryDate) continue;
    if (isAmbiguous(d) || d.value == null) continue;
    dates.push({
      date: formatDateFR(d.value) || String(d.value),
      label: d.label || "Date",
      meaning: d.text || ""
    });
  }
  const primaryAmount = diagnostics.primaryDocumentType === "bankStatement" ? null : pickPrimaryAmount(presentation.importantAmounts);
  let amount = primaryAmount ? {
    value: formatMoneyFR(primaryAmount.value) || (Array.isArray(primaryAmount.value) ? "Non trouv\xE9" : String(primaryAmount.value ?? "Non trouv\xE9")),
    meaning: primaryAmount.label || primaryAmount.text || ""
  } : { value: "Non trouv\xE9", meaning: "" };
  if (Array.isArray(primaryAmount?.value)) {
    amount = { value: "Non trouv\xE9", meaning: "" };
  }
  const amounts_detail = presentation.importantAmounts.filter((a) => a.value != null && !isAmbiguous(a)).map((a) => ({
    label: a.label || a.kind,
    value: a.kind === "rate" || /taux/i.test(a.label || "") ? `${a.value} %` : formatMoneyFR(a.value) || String(a.value),
    kind: a.kind,
    page: String(a.evidence?.[0]?.page || "")
  }));
  const warnings = presentation.warnings.filter((w) => w.kind !== "missing" && w.status !== "missing").map((w) => w.text).filter(Boolean);
  const evidence = presentation.evidencePassages.filter((p) => p.excerpt && p.excerpt.trim().length >= 4).filter(
    (p) => !/r[eé]seaux?\s+sociaux|des questions sur|facebook|instagram|support\s+client/i.test(
      p.excerpt
    )
  ).slice(0, 8).map((p) => ({
    page: p.page ? `Page ${p.page}` : "Document",
    quote: p.excerpt,
    explanation: p.supportedFacts?.length ? `Ce passage permet d\u2019identifier ${humanEvidenceSupport(p.supportedFacts)}.` : ""
  }));
  let urgencyLevel = "none";
  let urgencyMessage = "Aucune urgence particuli\xE8re n\u2019a \xE9t\xE9 identifi\xE9e.";
  const actionDeadlineDate = presentation.importantDates.find(
    (d) => !isAmbiguous(d) && !/pr[eé]l[eè]vement|paymentDate|paiement/i.test(`${d.kind} ${d.label}`) && /deadline|échéance|limite|actionDeadline|dueDate/i.test(
      `${d.kind} ${d.label} ${d.sourceFacts?.join(" ") || ""}`
    )
  );
  const hasCriticalWarning = presentation.warnings.some(
    (w) => w.kind === "arithmeticInconsistency" || w.kind !== "missing" && w.kind !== "ambiguousField" && w.status !== "missing" && w.status !== "ambiguous"
  );
  if (userActions.length && actionDeadlineDate) {
    urgencyLevel = "soon";
    urgencyMessage = actionDeadlineDate.text || "Une \xE9ch\xE9ance est indiqu\xE9e.";
  } else if (action_required === false && userActions.length === 0) {
    urgencyLevel = "none";
    urgencyMessage = "Aucune action \xE0 effectuer \u2014 information financi\xE8re \xE0 noter.";
  } else if (userActions.length === 0 && !hasCriticalWarning) {
    urgencyLevel = "none";
    urgencyMessage = "Aucune urgence particuli\xE8re n\u2019a \xE9t\xE9 identifi\xE9e.";
  } else if (presentation.warnings.some((w) => w.kind === "arithmeticInconsistency")) {
    urgencyLevel = "uncertain";
    urgencyMessage = "Certaines informations du document m\xE9ritent une v\xE9rification.";
  } else if (identity.documentType === "unknown") {
    urgencyLevel = "uncertain";
    urgencyMessage = "Le document n\u2019a pas pu \xEAtre class\xE9 avec certitude.";
  }
  const inventedUi = {
    uiInventedActions: 0,
    uiInventedDeadlines: 0,
    uiInventedAmounts: 0,
    uiInventedReasons: 0
  };
  const confidence = Math.round(
    Math.max(0, Math.min(1, diagnostics.classificationConfidence || 0)) * 100
  );
  const reading_quality = options.extractionQuality === "empty" ? "partial" : options.extractionQuality === "partial" ? "partial" : identity.documentType === "unknown" ? "partial" : "full";
  const fiscalVm = buildFiscalDocumentViewModel(result);
  const fiscal_document = fiscalVm ? fiscalViewModelToPreviewJson(fiscalVm) : null;
  let document_type = identity.text || identity.label || "Document";
  let summaryOut = plain_summary;
  let whyOut = why_received;
  let actionsOut = actions;
  let requestOut = request;
  let actionRequiredOut = action_required;
  if (fiscalVm) {
    document_type = fiscalVm.identity.publicTitle;
    if (fiscalVm.understanding.whatIsIt) {
      summaryOut = fiscalVm.understanding.whatIsIt;
      if (fiscalVm.understanding.purpose && fiscalVm.understanding.purpose !== fiscalVm.understanding.whatIsIt) {
        summaryOut = `${fiscalVm.understanding.whatIsIt} ${fiscalVm.understanding.purpose}`;
      }
    } else if (!fiscalVm.recognized) {
      summaryOut = "Ce document semble \xEAtre fiscal ou administratif, mais je ne peux pas encore identifier pr\xE9cis\xE9ment son type.";
    }
    if (fiscalVm.understanding.purpose) {
      whyOut = fiscalVm.understanding.purpose;
    }
    const supported = fiscalVm.possibleActions.filter((a) => a.certainty === "supported");
    if (supported.length) {
      actionsOut = supported.map((a) => ({ action: a.text, how: "Selon le document" }));
      actionRequiredOut = true;
      requestOut = supported[0].text;
    } else {
      actionsOut = [];
      actionRequiredOut = false;
      requestOut = "Aucune action certaine d\xE9tect\xE9e.";
    }
  }
  return {
    engine: "v4",
    document_type,
    issuer: "",
    plain_summary: summaryOut,
    request: requestOut,
    why_received: whyOut,
    actions: actionsOut,
    action_required: actionRequiredOut,
    dates,
    enriched_dates: dates,
    amount,
    urgency: { level: urgencyLevel, message: urgencyMessage },
    evidence: fiscalVm?.evidence?.length ? fiscalVm.evidence.map((e) => ({
      page: e.page,
      quote: e.quote,
      explanation: e.supports
    })) : evidence,
    warnings,
    confidence,
    reading_quality,
    tables: [],
    amounts_detail,
    fiscal_document,
    document_case: null,
    v4_debug: {
      engine: "v4",
      primaryDocumentType: diagnostics.primaryDocumentType,
      classificationConfidence: diagnostics.classificationConfidence,
      classificationStatus: diagnostics.classificationStatus,
      secondarySections: diagnostics.secondarySections,
      resolvedFields: diagnostics.resolvedFields,
      ambiguousFields: diagnostics.ambiguousFields,
      warnings: diagnostics.contradictions,
      hasArithmeticInconsistency: diagnostics.hasArithmeticInconsistency,
      unsupportedExplanationFacts: diagnostics.unsupportedExplanationFacts,
      unsupportedPresentationFacts: diagnostics.unsupportedPresentationFacts,
      inventedFacts: {
        actions: diagnostics.inventedActions,
        deadlines: diagnostics.inventedDeadlines,
        amounts: diagnostics.inventedAmounts,
        reasons: diagnostics.inventedReasons
      },
      evidenceCoverage: diagnostics.evidenceCoverage,
      extractionQuality: options.extractionQuality || null,
      fallbackReason: options.fallbackReason || null,
      presentationActionsCount: diagnostics.presentationActionsCount,
      actionRequired: actionRequiredOut,
      explanationDocumentType: explanation.documentType?.primary || null,
      fiscalAttached: Boolean(fiscal_document),
      fiscalRecognition: fiscalVm?.recognitionLevel || null,
      fiscalReference: fiscalVm?.identity.reference || null
    },
    v4_invariants: {
      unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
      unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
      inventedActions: presentation.inventedActions,
      inventedDeadlines: presentation.inventedDeadlines,
      inventedAmounts: presentation.inventedAmounts,
      inventedReasons: presentation.inventedReasons,
      ...inventedUi,
      knowledgePromotedToDocumentFact: fiscalVm?.invariants.knowledgePromotedToDocumentFact ?? 0,
      uncertainRenderedAsCertain: fiscalVm?.invariants.uncertainRenderedAsCertain ?? 0,
      technicalLabelsExposed: fiscalVm?.invariants.technicalLabelsExposed ?? 0,
      unsupportedUserActions: fiscalVm?.invariants.unsupportedUserActions ?? 0,
      taxFieldKnowledgePromotedToFact: fiscalVm?.invariants.taxFieldKnowledgePromotedToFact ?? result.fiscalKnowledge?.invariants.taxFieldKnowledgePromotedToFact ?? 0,
      unsupportedFieldValues: fiscalVm?.invariants.unsupportedFieldValues ?? result.fiscalKnowledge?.invariants.unsupportedFieldValues ?? 0,
      emptyFieldConvertedToZero: fiscalVm?.invariants.emptyFieldConvertedToZero ?? result.fiscalKnowledge?.invariants.emptyFieldConvertedToZero ?? 0,
      unverifiedFieldDefinitionPresentedAsVerified: fiscalVm?.invariants.unverifiedFieldDefinitionPresentedAsVerified ?? result.fiscalKnowledge?.invariants.unverifiedFieldDefinitionPresentedAsVerified ?? 0,
      fieldFalsePositiveCritical: fiscalVm?.invariants.fieldFalsePositiveCritical ?? result.fiscalKnowledge?.invariants.fieldFalsePositiveCritical ?? 0,
      knowledgePromotedToUserFact: fiscalVm?.invariants.knowledgePromotedToUserFact ?? result.fiscalKnowledge?.invariants.knowledgePromotedToUserFact ?? 0,
      requirementPromotedToObligation: fiscalVm?.invariants.requirementPromotedToObligation ?? result.fiscalKnowledge?.invariants.requirementPromotedToObligation ?? 0,
      candidateFactPromotedToCertain: fiscalVm?.invariants.candidateFactPromotedToCertain ?? result.fiscalKnowledge?.invariants.candidateFactPromotedToCertain ?? 0,
      unsupportedEligibilityDecision: fiscalVm?.invariants.unsupportedEligibilityDecision ?? result.fiscalKnowledge?.invariants.unsupportedEligibilityDecision ?? 0,
      unsupportedTaxAmount: fiscalVm?.invariants.unsupportedTaxAmount ?? result.fiscalKnowledge?.invariants.unsupportedTaxAmount ?? 0,
      automaticUnsafeAggregation: fiscalVm?.invariants.automaticUnsafeAggregation ?? result.fiscalKnowledge?.invariants.automaticUnsafeAggregation ?? 0,
      missingPresentedAsUserDoesNotHave: fiscalVm?.invariants.missingPresentedAsUserDoesNotHave ?? result.fiscalKnowledge?.invariants.missingPresentedAsUserDoesNotHave ?? 0
    }
  };
}

// lib/v4/knowledge/fr/tax/registry/loadRegistry.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// lib/v4/knowledge/fr/tax/normalize/normalizeReference.ts
var VARIANT_MAP = {
  C: "complement",
  PRO: "pro",
  RICI: "rici",
  SD: "sd",
  NR: "nr",
  IFI: "ifi",
  IOM: "iom"
};
function normalizeTaxReference(raw) {
  const rawReference = String(raw || "").trim();
  let s = rawReference.toUpperCase();
  s = s.replace(/[–—]/g, "-").replace(/[_./]/g, "-").replace(/\s+/g, "-").replace(/N[°ºO]\s*/g, "").replace(/FORMULAIRE-?/g, "").replace(/CERFA-?/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  s = s.replace(/^(2042)CPRO$/, "$1-C-PRO").replace(/^(2042)C$/, "$1-C").replace(/^(2042)RICI$/, "$1-RICI").replace(/^(2042)IFI$/, "$1-IFI").replace(/^(2042)NR$/, "$1-NR").replace(/^(2042)IOM$/, "$1-IOM").replace(/^(3310)CA3SD$/, "$1-CA3-SD").replace(/^(3310)CA3$/, "$1-CA3").replace(/^(1330)CVAESD$/, "$1-CVAE-SD").replace(/^(2065)SD$/, "$1-SD").replace(/^(2572)SD$/, "$1-SD").replace(/^(2031)SD$/, "$1-SD").replace(/^(2035)SD$/, "$1-SD");
  s = s.replace(/^(\d{3,4})([A-Z])/, "$1-$2");
  const parts = s.split("-").filter(Boolean);
  const baseReference = parts[0] || s;
  const variantParts = parts.slice(1);
  const suffixes = [...variantParts];
  let variantKind = "base";
  if (variantParts.length === 0) variantKind = "base";
  else if (variantParts.includes("PRO")) variantKind = "pro";
  else if (variantParts.includes("RICI")) variantKind = "rici";
  else if (variantParts.includes("IFI")) variantKind = "ifi";
  else if (variantParts.includes("NR")) variantKind = "nr";
  else if (variantParts.includes("IOM")) variantKind = "iom";
  else if (variantParts.includes("C") && !variantParts.includes("CA3") && !variantParts.includes("CFE") && !variantParts.includes("CET"))
    variantKind = "complement";
  else if (variantParts.includes("SD")) variantKind = "sd";
  else variantKind = VARIANT_MAP[variantParts[0]] || "other";
  return {
    rawReference,
    normalizedReference: parts.join("-"),
    baseReference,
    variantKind,
    suffixes,
    variantParts
  };
}
function ocrRepairTaxReference(raw, knownNormalized) {
  const upper = raw.toUpperCase();
  if (!/[OIoi]/.test(raw) && !/\d/.test(raw)) return null;
  if (!/(?:\d|[O]){3,}/.test(upper)) return null;
  const attempts = [
    upper.replace(/O/g, "0"),
    upper.replace(/I/g, "1"),
    upper.replace(/O/g, "0").replace(/I/g, "1")
  ];
  for (const a of attempts) {
    const n = normalizeTaxReference(a).normalizedReference;
    if (knownNormalized.has(n)) {
      return { candidate: n, reason: "ocr:O/I\u2192digit in known formReference" };
    }
  }
  return null;
}

// lib/v4/knowledge/fr/tax/registry/enrichments.ts
var SRC = "https://www.impots.gouv.fr";
var CURATED_ENRICHMENTS = [
  {
    normalizedReference: "2042",
    officialTitle: "D\xE9claration des revenus",
    cerfaNumbers: ["10330"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    aliases: ["d\xE9claration des revenus", "formulaire 2042"],
    purpose: "\xC9tablissement de l'imp\xF4t sur le revenu.",
    relations: [
      { targetRef: "2042-C", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2042-C-PRO", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2042-RICI", relationType: "annexOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 },
      { targetRef: "2044", relationType: "relatedTo", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.7 },
      { targetRef: "2047", relationType: "relatedTo", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.7 }
    ]
  },
  {
    normalizedReference: "2042-C",
    officialTitle: "D\xE9claration de revenus compl\xE9mentaire",
    cerfaNumbers: ["11222"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    // Page dédiée absente du sitemap — provenance via fiche 2042 + recherche officielle
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-C-PRO",
    officialTitle: "D\xE9claration de revenus compl\xE9mentaire des professions non salari\xE9es",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "supplementOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-RICI",
    officialTitle: "D\xE9claration des r\xE9ductions et cr\xE9dits d'imp\xF4t",
    cerfaNumbers: ["15637"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2042/declaration-des-revenus`,
    relations: [
      { targetRef: "2042", relationType: "annexOf", source: `${SRC}/formulaire/2042/declaration-des-revenus`, confidence: 0.9 }
    ]
  },
  {
    normalizedReference: "2042-IFI",
    officialTitle: "D\xE9claration d'imp\xF4t sur la fortune immobili\xE8re",
    cerfaNumbers: ["15798"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024],
    pageUrl: `${SRC}/formulaire/2042-ifi/declaration-dimpot-sur-la-fortune-immobiliere`
  },
  {
    normalizedReference: "2042-NR",
    officialTitle: "D\xE9claration des revenus compl\xE9mentaire",
    cerfaNumbers: ["11942"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025],
    pageUrl: `${SRC}/formulaire/2042-nr/declaration-des-revenus-complementaire`
  },
  {
    normalizedReference: "2044",
    officialTitle: "D\xE9claration des revenus fonciers",
    cerfaNumbers: ["10334"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/formulaire/2044/declaration-des-revenus-fonciers`,
    relations: [
      { targetRef: "2042", relationType: "relatedTo", source: `${SRC}/formulaire/2044/declaration-des-revenus-fonciers`, confidence: 0.75 }
    ]
  },
  {
    normalizedReference: "2047",
    officialTitle: "D\xE9claration des revenus encaiss\xE9s \xE0 l'\xE9tranger",
    cerfaNumbers: ["11226"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`,
    relations: [
      { targetRef: "2042", relationType: "relatedTo", source: `${SRC}/recherche-de-formulaire`, confidence: 0.7 }
    ]
  },
  {
    normalizedReference: "2074",
    officialTitle: "D\xE9claration des plus ou moins values",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "3916",
    officialTitle: "D\xE9claration par un r\xE9sident d'un compte ouvert hors de France",
    cerfaNumbers: ["11916"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2735",
    officialTitle: "D\xE9claration de dons manuels et de sommes d'argent",
    cerfaNumbers: ["11278"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2025],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2065-SD",
    officialTitle: "Imp\xF4t sur les soci\xE9t\xE9s",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "3310-CA3-SD",
    officialTitle: "D\xE9claration de TVA et taxes assimil\xE9es (CA3)",
    cerfaNumbers: ["10963"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "2031-SD",
    officialTitle: "D\xE9claration de r\xE9sultat \u2014 BIC (2031-SD)",
    cerfaNumbers: ["11194"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2026]
  },
  {
    normalizedReference: "2035-SD",
    officialTitle: "D\xE9claration de r\xE9sultat \u2014 BNC (2035-SD)",
    applicableYears: [2025]
  },
  {
    normalizedReference: "2561",
    officialTitle: "D\xE9claration r\xE9capitulative des op\xE9rations sur valeurs mobili\xE8res",
    cerfaNumbers: ["11428"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2023, 2024, 2025],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "2777",
    officialTitle: "Revenus de capitaux mobiliers \u2014 pr\xE9l\xE8vement et retenue \xE0 la source",
    cerfaNumbers: ["10024"],
    cerfaVersion: "UNKNOWN",
    applicableYears: [2024, 2025, 2026],
    pageUrl: `${SRC}/recherche-de-formulaire`
  },
  {
    normalizedReference: "1330-CVAE-SD",
    officialTitle: "Formulaire 1330-CVAE-SD",
    applicableYears: [2024, 2025, 2026]
  },
  {
    normalizedReference: "2572-SD",
    officialTitle: "Formulaire 2572-SD",
    applicableYears: [2024, 2025, 2026]
  }
];
function enrichmentByRef() {
  const m = /* @__PURE__ */ new Map();
  for (const e of CURATED_ENRICHMENTS) m.set(e.normalizedReference, e);
  return m;
}

// lib/v4/knowledge/fr/tax/sources/impotsGouv.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var HERE = dirname(fileURLToPath(import.meta.url));
var SNAPSHOT_CANDIDATES = [
  join(HERE, "../../../../../../generated/knowledge-snapshots/impots-forms-2026-08-08.json"),
  join(process.cwd(), "generated/knowledge-snapshots/impots-forms-2026-08-08.json")
];
function loadSnapshot() {
  for (const p of SNAPSHOT_CANDIDATES) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
    }
  }
  return null;
}
var ImpotsGouvSource = class {
  id = "impots-gouv-fr";
  requiresNetwork = false;
  discover() {
    const snap = loadSnapshot();
    if (!snap) {
      return {
        sourceId: this.id,
        retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
        candidates: [],
        notes: ["snapshot manquant \u2014 lancer knowledge:tax:discover"]
      };
    }
    const candidates = snap.candidates.map((c) => ({
      rawReference: c.rawReference,
      reference: c.reference,
      title: c.title,
      url: c.url,
      authority: c.authority || "DGFiP",
      cerfa: c.cerfa ?? null,
      year: c.year ?? null,
      source: c.source || "impots.gouv.fr-sitemap",
      retrievedAt: c.retrievedAt || snap.retrievedAt,
      documentKindGuess: c.documentKindGuess || "form",
      metadataHash: c.metadataHash
    }));
    return {
      sourceId: this.id,
      retrievedAt: snap.retrievedAt,
      candidates,
      notes: [
        `snapshot offline: ${candidates.length} candidats sitemap`,
        `catalog-only sans page: ${(snap.catalogOnlyReferences || []).length}`
      ]
    };
  }
};
var ServicePublicSource = class {
  id = "service-public-fr";
  requiresNetwork = false;
  discover() {
    return {
      sourceId: this.id,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      candidates: [],
      notes: [
        "Non utilis\xE9 comme source primaire V4-M \u2014 licence/redistribution UNKNOWN",
        "impots.gouv.fr sitemap prioritaire"
      ]
    };
  }
};
var DataGouvSource = class {
  id = "data-gouv-fr";
  requiresNetwork = false;
  discover() {
    return {
      sourceId: this.id,
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      candidates: [],
      notes: [
        "Aucun dataset DGFiP de catalogue de formulaires adopt\xE9 en V4-M",
        "\xC0 r\xE9\xE9valuer si un jeu structur\xE9 Licence Ouverte appara\xEEt"
      ]
    };
  }
};

// lib/v4/knowledge/fr/tax/discovery/classifyFamily.ts
function mapType(family) {
  switch (family) {
    case "incomeTaxReturn":
    case "rentalIncomeDeclaration":
    case "foreignIncomeDeclaration":
    case "professionalIncomeDeclaration":
    case "taxCreditReduction":
    case "capitalGainsDeclaration":
    case "wealthTax":
    case "foreignAccountsDeclaration":
      return "incomeTaxReturn";
    case "incomeTaxNotice":
    case "taxNotice":
      return "incomeTaxNotice";
    case "propertyTax":
    case "housingTax":
      return "propertyTax";
    case "corporateTax":
    case "vatDeclaration":
    case "businessTax":
    case "professionalBenefits":
    case "inheritanceDonation":
    case "withholdingTax":
    case "taxForm":
      return "taxForm";
    case "taxInstruction":
      return "taxForm";
    case "taxCertificate":
      return "taxForm";
    case "unknownTaxDocument":
      return "unknownTaxDocument";
    default:
      return "taxDocument";
  }
}
function classifyFromOfficialMeta(input) {
  const norm = normalizeTaxReference(input.reference);
  const ref = norm.normalizedReference;
  const title = (input.title || "").toLowerCase();
  const kindGuess = input.documentKindGuess || "form";
  if (kindGuess === "notice" || kindGuess === "instruction" || /\bnotice\b/.test(title) || /-NOT\b/.test(ref) || ref.endsWith("-NOT")) {
    let family = "taxInstruction";
    if (/taxe fonci|fonci[eè]re/.test(title)) family = "propertyTax";
    else if (/taxe d['’]?habitation|habitation/.test(title)) family = "housingTax";
    else if (/avis d['’]?imp[oô]t|revenus/.test(title)) family = "incomeTaxNotice";
    else if (/ifi|fortune immobili/.test(title)) family = "wealthTax";
    return {
      family,
      documentKind: /\bnotice\b/.test(title) || /-NOT/.test(ref) ? "notice" : "instruction",
      documentType: mapType(family === "taxInstruction" ? "taxForm" : family),
      profileId: family === "propertyTax" ? "propertyTax" : family === "incomeTaxNotice" ? "incomeTaxNotice" : "taxDocument",
      confidence: 0.7,
      needsReview: family === "taxInstruction",
      reason: "notice/instruction from title or -NOT"
    };
  }
  if (ref === "2042" || ref === "2042-C" || ref === "2042-C-PRO" || ref === "2042-NR") {
    const family = ref === "2042-C-PRO" ? "professionalIncomeDeclaration" : "incomeTaxReturn";
    return {
      family,
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.95,
      needsReview: false,
      reason: "known income declaration series"
    };
  }
  if (ref === "2042-RICI") {
    return {
      family: "taxCreditReduction",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.95,
      needsReview: false,
      reason: "known RICI annex"
    };
  }
  if (ref === "2042-IFI" || /\bifi\b|fortune immobili/.test(title)) {
    return {
      family: "wealthTax",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.9,
      needsReview: false,
      reason: "IFI / wealth"
    };
  }
  if (ref === "2044" || /revenus fonciers/.test(title)) {
    return {
      family: "rentalIncomeDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.92,
      needsReview: false,
      reason: "revenus fonciers"
    };
  }
  if (ref === "2047" || /revenus.*[eé]tranger|encaiss[eé]s [aà] l['’]?[eé]tranger/.test(title)) {
    return {
      family: "foreignIncomeDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.9,
      needsReview: false,
      reason: "foreign income"
    };
  }
  if (/^2074/.test(ref) || /plus[- ]?values|moins[- ]?values/.test(title)) {
    return {
      family: "capitalGainsDeclaration",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.88,
      needsReview: false,
      reason: "capital gains 2074"
    };
  }
  if (/^3916/.test(ref) || /compte.*[eé]tranger|hors de france/.test(title)) {
    return {
      family: "foreignAccountsDeclaration",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.88,
      needsReview: false,
      reason: "foreign accounts 3916"
    };
  }
  if (/^2735/.test(ref) || /dons manuels|successions|donations/.test(title)) {
    return {
      family: "inheritanceDonation",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.85,
      needsReview: /successions|donations/.test(title) && !/^2735/.test(ref),
      reason: "inheritance/donation"
    };
  }
  if (/^2065/.test(ref) || /imp[oô]t sur les soci[eé]t[eé]s/.test(title)) {
    return {
      family: "corporateTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.9,
      needsReview: false,
      reason: "corporate tax"
    };
  }
  if (/^3310/.test(ref) || /\btva\b/.test(title) || /ca3/.test(ref.toLowerCase())) {
    return {
      family: "vatDeclaration",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.88,
      needsReview: false,
      reason: "VAT"
    };
  }
  if (/^2031|^2035|^2033|^2050|^2051|^2052|^2053/.test(ref) || /liasse|bnc|bic\b|b[eé]n[eé]fices/.test(title)) {
    return {
      family: "professionalBenefits",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: !/^2031|^2035|^2033/.test(ref),
      reason: "professional benefits / liasse"
    };
  }
  if (/cvae|cfe|cet\b|cotisation fonci[eè]re/.test(title) || /CVAE|CFE|CET/.test(ref)) {
    return {
      family: "businessTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.85,
      needsReview: false,
      reason: "business local tax"
    };
  }
  if (/taxe fonci|[ée]re sur les propri[eé]t/.test(title) || /^1536/.test(ref)) {
    return {
      family: "propertyTax",
      documentKind: /avis/.test(title) ? "taxNotice" : "form",
      documentType: "propertyTax",
      profileId: "propertyTax",
      confidence: 0.85,
      needsReview: false,
      reason: "property tax"
    };
  }
  if (/taxe d['’ ]?habitation|logements vacants/.test(title) || /^1535/.test(ref)) {
    return {
      family: "housingTax",
      documentKind: /avis/.test(title) ? "taxNotice" : "form",
      documentType: "taxDocument",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: false,
      reason: "housing tax"
    };
  }
  if (/pr[eé]l[eè]vement|retenue [aà] la source|pas\b/.test(title) || /^2777|^2561|^2571|^2572/.test(ref)) {
    return {
      family: "withholdingTax",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.8,
      needsReview: false,
      reason: "withholding / RCM"
    };
  }
  if (/attestation/.test(title)) {
    return {
      family: "taxCertificate",
      documentKind: "certificate",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.75,
      needsReview: false,
      reason: "certificate"
    };
  }
  if (/d[eé]claration des revenus|formulaire n[°o]?\s*2042/.test(title)) {
    return {
      family: "incomeTaxReturn",
      documentKind: "form",
      documentType: "incomeTaxReturn",
      profileId: "incomeTaxReturn",
      confidence: 0.85,
      needsReview: false,
      reason: "income declaration title"
    };
  }
  if (/cr[eé]dit d['’]?imp[oô]t|r[eé]duction/.test(title) || /^2069|^2079/.test(ref)) {
    return {
      family: "taxCreditReduction",
      documentKind: "form",
      documentType: "taxForm",
      profileId: "taxDocument",
      confidence: 0.75,
      needsReview: true,
      reason: "credit/reduction series \u2014 broad"
    };
  }
  const thin = title.split(/\s+/).length < 3;
  return {
    family: "taxForm",
    documentKind: "form",
    documentType: "taxForm",
    profileId: "taxDocument",
    confidence: thin ? 0.55 : 0.7,
    needsReview: thin,
    reason: thin ? "generic form \u2014 thin title" : "generic official form"
  };
}

// lib/v4/knowledge/fr/tax/discovery/quality.ts
function computeMetadataQuality(input) {
  const cerfaApplicable = input.documentKind === "form" || input.documentKind === "certificate";
  let score = 0;
  if (input.hasOfficialReference) score += 0.25;
  if (input.hasOfficialTitle) score += 0.25;
  if (input.hasOfficialSource) score += 0.2;
  if (input.hasAuthority) score += 0.15;
  if (input.hasYearInformation) score += 0.05;
  if (input.hasRelations) score += 0.05;
  if (cerfaApplicable) {
    if (input.hasCerfa) score += 0.05;
  } else {
    score += 0.05;
  }
  return {
    score: Math.min(1, Number(score.toFixed(3))),
    hasOfficialReference: input.hasOfficialReference,
    hasOfficialTitle: input.hasOfficialTitle,
    hasOfficialSource: input.hasOfficialSource,
    hasAuthority: input.hasAuthority,
    hasYearInformation: input.hasYearInformation,
    hasCerfa: input.hasCerfa,
    hasRelations: input.hasRelations,
    cerfaApplicable
  };
}

// lib/v4/knowledge/fr/tax/discovery/pipeline.ts
var RETRIEVED = "2026-08-08";
function idFor(norm) {
  return `fr-tax-${norm.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
function provenance(url, title, supports) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
function isIntegrable(c) {
  if (!c.reference || !normalizeTaxReference(c.reference).normalizedReference) {
    return { ok: false, reason: "r\xE9f\xE9rence manquante" };
  }
  if (!c.title || c.title.trim().length < 3) {
    return { ok: false, reason: "titre officiel insuffisant" };
  }
  if (!c.url || !/^https?:\/\//.test(c.url)) {
    return { ok: false, reason: "URL officielle manquante" };
  }
  if (!c.authority) {
    return { ok: false, reason: "autorit\xE9 manquante" };
  }
  if (/^n°?\s*$/i.test(c.title) || c.title.length > 300) {
    return { ok: false, reason: "titre invalide" };
  }
  return { ok: true };
}
function runDiscoveryPipeline(options) {
  const adapters = [
    new ImpotsGouvSource(),
    new ServicePublicSource(),
    new DataGouvSource()
  ];
  const discovered = [];
  const notes = [];
  for (const a of adapters) {
    const res = a.discover();
    discovered.push(...res.candidates);
    notes.push(...res.notes || []);
  }
  const enrich = enrichmentByRef();
  const rejected = [];
  const needsReview = [];
  const validated = [];
  const byNorm = /* @__PURE__ */ new Map();
  for (const c of discovered) {
    const n = normalizeTaxReference(c.reference).normalizedReference;
    const prev = byNorm.get(n);
    if (!prev) {
      byNorm.set(n, c);
      continue;
    }
    if (prev.url === c.url) continue;
    needsReview.push({
      reference: n,
      reason: `duplicate normalizedReference with distinct URLs: ${prev.url} vs ${c.url}`,
      status: "needsReview"
    });
  }
  const integrated = [];
  const entryByNorm = /* @__PURE__ */ new Map();
  for (const [, c] of byNorm) {
    const check = isIntegrable(c);
    const norm = normalizeTaxReference(c.reference);
    if (!check.ok) {
      rejected.push({
        reference: norm.normalizedReference || c.reference,
        reason: check.reason || "invalid",
        status: "rejected"
      });
      continue;
    }
    validated.push(c);
    const clf = classifyFromOfficialMeta({
      reference: norm.normalizedReference,
      title: c.title,
      documentKindGuess: c.documentKindGuess
    });
    const en = enrich.get(norm.normalizedReference);
    const title = en?.officialTitle || c.title;
    const url = en?.pageUrl || c.url;
    const cerfa = en?.cerfaNumbers || (c.cerfa ? [c.cerfa] : []);
    const years = en?.applicableYears || (c.year ? [c.year] : []);
    if (!title || !url) {
      rejected.push({
        reference: norm.normalizedReference,
        reason: "provenance insuffisante (title/url)",
        status: "rejected"
      });
      continue;
    }
    if (clf.needsReview && clf.confidence < 0.65) {
      needsReview.push({
        reference: norm.normalizedReference,
        reason: clf.reason,
        status: "needsReview"
      });
    }
    const prov = provenance(url, `Formulaire n\xB0${norm.normalizedReference} \u2014 ${title}`, [
      "officialTitle",
      "reference",
      "authority"
    ]);
    const quality = computeMetadataQuality({
      hasOfficialReference: true,
      hasOfficialTitle: true,
      hasOfficialSource: true,
      hasAuthority: true,
      hasYearInformation: years.length > 0,
      hasCerfa: cerfa.length > 0,
      hasRelations: Boolean(en?.relations?.length),
      documentKind: clf.documentKind
    });
    const entry = {
      id: idFor(norm.normalizedReference),
      country: "FR",
      authority: "DGFiP",
      family: clf.family,
      documentType: clf.documentType,
      documentKind: clf.documentKind,
      referenceNumbers: [norm.normalizedReference],
      rawReference: c.rawReference,
      normalizedReference: norm.normalizedReference,
      baseReference: norm.baseReference,
      variantKind: norm.variantKind,
      cerfaNumbers: cerfa,
      cerfaVersion: en?.cerfaVersion ?? null,
      aliases: en?.aliases || [],
      officialTitle: title,
      description: en?.description || `Formulaire fiscal officiel n\xB0${norm.normalizedReference}.`,
      purpose: en?.purpose || "Formalit\xE9 / d\xE9claration fiscale (voir notice officielle).",
      applicableYears: years,
      documentVersion: null,
      validFrom: null,
      validTo: null,
      expectedSignals: [
        norm.normalizedReference.toLowerCase(),
        title.toLowerCase().slice(0, 80)
      ],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: clf.profileId,
      expectedFields: [],
      officialSources: [prov],
      provenance: [prov],
      confidence: clf.confidence,
      quality,
      status: clf.needsReview && clf.confidence < 0.6 ? "needsReview" : "integrated",
      metadataHash: c.metadataHash || null
    };
    if (entry.status === "needsReview") {
      needsReview.push({
        reference: norm.normalizedReference,
        reason: clf.reason,
        status: "needsReview"
      });
      continue;
    }
    entryByNorm.set(norm.normalizedReference, entry);
    integrated.push(entry);
  }
  for (const en of enrich.values()) {
    if (entryByNorm.has(en.normalizedReference)) continue;
    if (!en.pageUrl && !en.officialTitle) continue;
    const url = en.pageUrl || `https://www.impots.gouv.fr/recherche-de-formulaire#${en.normalizedReference}`;
    if (!en.officialTitle) continue;
    const clf = classifyFromOfficialMeta({
      reference: en.normalizedReference,
      title: en.officialTitle,
      documentKindGuess: "form"
    });
    const norm = normalizeTaxReference(en.normalizedReference);
    const prov = provenance(url, `Formulaire n\xB0${norm.normalizedReference} \u2014 ${en.officialTitle}`, [
      "officialTitle",
      "reference",
      "authority"
    ]);
    const entry = {
      id: idFor(norm.normalizedReference),
      country: "FR",
      authority: "DGFiP",
      family: clf.family,
      documentType: clf.documentType,
      documentKind: "form",
      referenceNumbers: [norm.normalizedReference],
      rawReference: en.normalizedReference,
      normalizedReference: norm.normalizedReference,
      baseReference: norm.baseReference,
      variantKind: norm.variantKind,
      cerfaNumbers: en.cerfaNumbers || [],
      cerfaVersion: en.cerfaVersion ?? null,
      aliases: en.aliases || [],
      officialTitle: en.officialTitle,
      description: en.description || `Formulaire fiscal officiel n\xB0${norm.normalizedReference}.`,
      purpose: en.purpose || "Formalit\xE9 / d\xE9claration fiscale (voir notice officielle).",
      applicableYears: en.applicableYears || [],
      documentVersion: null,
      validFrom: null,
      validTo: null,
      expectedSignals: [norm.normalizedReference.toLowerCase(), en.officialTitle.toLowerCase()],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: clf.profileId,
      expectedFields: [],
      officialSources: [prov],
      provenance: [prov],
      confidence: clf.confidence,
      quality: computeMetadataQuality({
        hasOfficialReference: true,
        hasOfficialTitle: true,
        hasOfficialSource: true,
        hasAuthority: true,
        hasYearInformation: (en.applicableYears || []).length > 0,
        hasCerfa: (en.cerfaNumbers || []).length > 0,
        hasRelations: Boolean(en.relations?.length),
        documentKind: "form"
      }),
      status: "integrated",
      metadataHash: null
    };
    integrated.push(entry);
    entryByNorm.set(norm.normalizedReference, entry);
  }
  const syntheticNonForms = buildNonFormEntries();
  for (const e of syntheticNonForms) {
    if (!entryByNorm.has(e.normalizedReference)) {
      integrated.push(e);
      entryByNorm.set(e.normalizedReference, e);
    }
  }
  for (const e of integrated) {
    const en = enrich.get(e.normalizedReference);
    if (!en?.relations) continue;
    const rels = [];
    for (const r of en.relations) {
      const target = entryByNorm.get(r.targetRef) || entryByNorm.get(
        normalizeTaxReference(r.targetRef).normalizedReference
      );
      if (!target) {
        needsReview.push({
          reference: e.normalizedReference,
          reason: `relation cible absente: ${r.targetRef}`,
          status: "needsReview"
        });
        continue;
      }
      rels.push({
        targetId: target.id,
        relationType: r.relationType,
        source: r.source,
        confidence: r.confidence
      });
    }
    e.relatedDocuments = rels;
    if (e.quality) {
      e.quality = computeMetadataQuality({
        ...e.quality,
        hasRelations: rels.length > 0,
        documentKind: e.documentKind
      });
    }
  }
  let catalogOnlyCount = 0;
  for (const n of notes) {
    const m = /catalog-only sans page:\s*(\d+)/i.exec(n);
    if (m) catalogOnlyCount = Number(m[1]);
  }
  const version = options?.version || "2026.08.08-v4m1";
  const registry = {
    version,
    country: "FR",
    generatedAt: options?.generatedAt || (/* @__PURE__ */ new Date()).toISOString(),
    sourceMode: "discovery+curated",
    entries: integrated.sort(
      (a, b) => a.normalizedReference.localeCompare(b.normalizedReference)
    ),
    discoveryStats: {
      discovered: discovered.length,
      validated: validated.length,
      integrated: integrated.length,
      rejected: rejected.length,
      needsReview: needsReview.length
    }
  };
  return {
    discovered,
    validated,
    integrated,
    rejected,
    needsReview,
    registry,
    catalogOnlyCount
  };
}
function buildNonFormEntries() {
  const avisUrl = "https://www.impots.gouv.fr/particulier/jai-besoin-dun-document-avis-dimpot-formulaire";
  const tfUrl = "https://www.impots.gouv.fr/particulier/questions/quelle-date-vais-je-recevoir-mon-avis-de-taxe-fonciere-et-quand-dois-je-la";
  const mk = (partial) => {
    const e = {
      country: "FR",
      authority: "DGFiP",
      provenance: partial.officialSources,
      quality: computeMetadataQuality({
        hasOfficialReference: partial.referenceNumbers.length > 0,
        hasOfficialTitle: true,
        hasOfficialSource: true,
        hasAuthority: true,
        hasYearInformation: partial.applicableYears.length > 0,
        hasCerfa: partial.cerfaNumbers.length > 0,
        hasRelations: partial.relatedDocuments.length > 0,
        documentKind: partial.documentKind
      }),
      status: "integrated",
      ...partial
    };
    return e;
  };
  return [
    mk({
      id: "fr-tax-income-notice",
      family: "incomeTaxNotice",
      documentType: "incomeTaxNotice",
      documentKind: "taxNotice",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "INCOME-TAX-NOTICE",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      cerfaVersion: null,
      aliases: ["avis d'imp\xF4t sur les revenus", "avis d'imposition"],
      officialTitle: "Avis d'imp\xF4t sur les revenus",
      description: "Document restitu\xE9 par l'administration indiquant l'imp\xF4t calcul\xE9, les pr\xE9l\xE8vements et le solde.",
      purpose: "Informer le contribuable du r\xE9sultat de l'imp\xF4t sur le revenu.",
      applicableYears: [2024, 2025, 2026],
      expectedSignals: ["avis d'impot", "revenu fiscal de reference", "reste a payer"],
      negativeSignals: ["formulaire 2042"],
      relatedDocuments: [],
      profileId: "incomeTaxNotice",
      expectedFields: ["taxAmount", "amountDue", "refundAmount", "fiscalPeriod"],
      officialSources: [
        provenance(avisUrl, "J'ai besoin d'un document (avis d'imp\xF4t\u2026)", [
          "officialTitle",
          "family"
        ])
      ],
      confidence: 0.9,
      metadataHash: null
    }),
    mk({
      id: "fr-tax-property-notice",
      family: "propertyTax",
      documentType: "propertyTax",
      documentKind: "taxNotice",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "PROPERTY-TAX-NOTICE",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      aliases: ["avis de taxe fonciere", "taxe fonciere"],
      officialTitle: "Avis de taxe fonci\xE8re",
      description: "Avis d'imposition de taxe fonci\xE8re mis \xE0 disposition par la DGFiP.",
      purpose: "Informer du montant de taxe fonci\xE8re et des modalit\xE9s de paiement.",
      applicableYears: [2024, 2025, 2026],
      expectedSignals: ["taxe fonciere", "date limite de paiement"],
      negativeSignals: ["total ht", "total ttc"],
      relatedDocuments: [],
      profileId: "propertyTax",
      expectedFields: ["taxAmount", "amountDue", "paymentDeadline"],
      officialSources: [
        provenance(tfUrl, "Avis de taxe fonci\xE8re \u2014 dates", ["officialTitle", "family"])
      ],
      confidence: 0.9,
      metadataHash: null
    }),
    mk({
      id: "fr-tax-unknown",
      family: "unknownTaxDocument",
      documentType: "unknownTaxDocument",
      documentKind: "other",
      referenceNumbers: [],
      rawReference: null,
      normalizedReference: "UNKNOWN-TAX",
      baseReference: null,
      variantKind: null,
      cerfaNumbers: [],
      aliases: ["document fiscal"],
      officialTitle: "Document fiscal non identifi\xE9 pr\xE9cis\xE9ment",
      description: "Type de repli lorsqu'un document est clairement fiscal mais non rattach\xE9 \xE0 une r\xE9f\xE9rence connue.",
      purpose: "\xC9viter une fausse classification pr\xE9cise.",
      applicableYears: [],
      expectedSignals: ["impot", "fiscal", "dgfip"],
      negativeSignals: [],
      relatedDocuments: [],
      profileId: "unknownTaxDocument",
      expectedFields: [],
      officialSources: [
        provenance(avisUrl, "Document fiscal \u2014 repli unknown", ["family"])
      ],
      confidence: 0.5,
      metadataHash: null
    })
  ];
}

// lib/v4/knowledge/fr/tax/registry/seed.ts
var FRENCH_TAX_REGISTRY_VERSION = "2026.08.08-v4n1";
function buildSeedRegistry(generatedAt = "seed-runtime") {
  return runDiscoveryPipeline({
    generatedAt,
    version: FRENCH_TAX_REGISTRY_VERSION
  }).registry;
}

// lib/v4/knowledge/fr/tax/registry/indexes.ts
function aliasKey(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}
function buildRegistryIndex(registry) {
  const byNormalizedReference = /* @__PURE__ */ new Map();
  const byCerfa = /* @__PURE__ */ new Map();
  const byAlias = /* @__PURE__ */ new Map();
  const byId = /* @__PURE__ */ new Map();
  const knownReferences = /* @__PURE__ */ new Set();
  for (const e of registry.entries) {
    byId.set(e.id, e);
    const norm = e.normalizedReference || normalizeTaxReference(e.referenceNumbers[0] || "").normalizedReference;
    if (norm) {
      byNormalizedReference.set(norm, e);
      knownReferences.add(norm);
      if (norm.endsWith("-SD")) knownReferences.add(norm.slice(0, -3));
    }
    for (const r of e.referenceNumbers) {
      const n = normalizeTaxReference(r).normalizedReference;
      knownReferences.add(n);
      if (!byNormalizedReference.has(n)) byNormalizedReference.set(n, e);
    }
    for (const c of e.cerfaNumbers) {
      const key = c.replace(/\s+/g, "").toUpperCase();
      const base = key.split(/[*#]/)[0];
      const list = byCerfa.get(base) || [];
      list.push(e);
      byCerfa.set(base, list);
      byCerfa.set(key, list);
    }
    for (const a of e.aliases) {
      byAlias.set(aliasKey(a), e);
    }
  }
  return {
    byNormalizedReference,
    byCerfa,
    byAlias,
    byId,
    knownReferences
  };
}

// lib/v4/knowledge/fr/tax/registry/lookup.ts
function lookupRegistry(index, query) {
  const q = String(query || "").trim();
  if (!q) {
    return { matchKind: "none", entry: null, confidence: 0, normalizedQuery: "" };
  }
  if (/^\d{5}([*#]\d+)?$/.test(q.replace(/\s/g, ""))) {
    const key = q.replace(/\s/g, "").toUpperCase();
    const base = key.split(/[*#]/)[0];
    const hits = index.byCerfa.get(key) || index.byCerfa.get(base) || [];
    if (hits.length === 1) {
      return {
        matchKind: "cerfa",
        entry: hits[0],
        confidence: 0.85,
        normalizedQuery: key
      };
    }
    if (hits.length > 1) {
      return {
        matchKind: "possible",
        entry: hits[0],
        confidence: 0.4,
        normalizedQuery: key
      };
    }
  }
  const norm = normalizeTaxReference(q);
  const exact = index.byNormalizedReference.get(norm.normalizedReference);
  if (exact) {
    const kind = q.toUpperCase().replace(/\s+/g, "-") === norm.normalizedReference ? "exact" : "normalized";
    return {
      matchKind: kind,
      entry: exact,
      confidence: kind === "exact" ? 0.95 : 0.9,
      normalizedQuery: norm.normalizedReference
    };
  }
  const aliasKey2 = q.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
  const byAlias = index.byAlias.get(aliasKey2);
  if (byAlias) {
    return {
      matchKind: "alias",
      entry: byAlias,
      confidence: 0.8,
      normalizedQuery: norm.normalizedReference
    };
  }
  if (norm.variantParts.length === 0) {
    const variants = [...index.byNormalizedReference.keys()].filter(
      (k) => k === norm.baseReference || k.startsWith(`${norm.baseReference}-`)
    );
    if (variants.length === 1) {
      return {
        matchKind: "possible",
        entry: index.byNormalizedReference.get(variants[0]),
        confidence: 0.45,
        normalizedQuery: norm.normalizedReference
      };
    }
    if (variants.length > 1) {
      const base = index.byNormalizedReference.get(norm.baseReference);
      return {
        matchKind: "possible",
        entry: base || index.byNormalizedReference.get(variants[0]),
        confidence: 0.35,
        normalizedQuery: norm.normalizedReference
      };
    }
  }
  return {
    matchKind: "none",
    entry: null,
    confidence: 0,
    normalizedQuery: norm.normalizedReference
  };
}

// lib/v4/knowledge/fr/tax/semantic/prioritySemantics.ts
var RETRIEVED2 = "2026-08-08";
function src(url, title, supports) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED2,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
var SRC_2042 = src(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n\xB02042 \u2014 D\xE9claration des revenus",
  ["officialTitle", "purpose", "description", "plainLanguage", "relations"]
);
var SRC_2044 = src(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n\xB02044 \u2014 D\xE9claration des revenus fonciers",
  ["officialTitle", "purpose", "description", "plainLanguage"]
);
var SRC_IFI = src(
  "https://www.impots.gouv.fr/formulaire/2042-ifi/declaration-dimpot-sur-la-fortune-immobiliere",
  "Formulaire n\xB02042-IFI \u2014 D\xE9claration d'imp\xF4t sur la fortune immobili\xE8re",
  ["officialTitle", "purpose", "description", "plainLanguage", "audience"]
);
var SRC_NR = src(
  "https://www.impots.gouv.fr/formulaire/2042-nr/declaration-des-revenus-complementaire",
  "Formulaire n\xB02042-NR \u2014 D\xE9claration des revenus compl\xE9mentaire",
  ["officialTitle", "purpose", "description", "plainLanguage", "audience"]
);
var SRC_AVIS = src(
  "https://www.impots.gouv.fr/particulier/jai-besoin-dun-document-avis-dimpot-formulaire",
  "J'ai besoin d'un document (avis d'imp\xF4t, formulaire\u2026)",
  ["officialTitle", "purpose", "family", "plainLanguage"]
);
var SRC_TF = src(
  "https://www.impots.gouv.fr/particulier/questions/quelle-date-vais-je-recevoir-mon-avis-de-taxe-fonciere-et-quand-dois-je-la",
  "Avis de taxe fonci\xE8re \u2014 dates de mise \xE0 disposition et paiement",
  ["officialTitle", "purpose", "family", "plainLanguage"]
);
var SRC_FORMS = src(
  "https://www.impots.gouv.fr/recherche-de-formulaire",
  "Recherche de formulaire | impots.gouv.fr",
  ["reference", "officialTitle"]
);
function pack(partial) {
  return partial;
}
var PRIORITY_SEMANTIC_PACKS = [
  pack({
    reference: "2042",
    normalizedReference: "2042",
    officialTitle: "D\xE9claration des revenus",
    shortTitle: "D\xE9claration de revenus 2042",
    family: "incomeTaxReturn",
    documentKind: "form",
    description: "Formulaire principal permettant de d\xE9clarer les revenus du foyer fiscal aupr\xE8s de l'administration fiscale.",
    purpose: "D\xE9clarer les revenus et certaines informations n\xE9cessaires \xE0 l'\xE9tablissement de l'imp\xF4t sur le revenu.",
    audience: ["particuliers", "foyer fiscal"],
    commonSituations: [
      "d\xE9claration annuelle des revenus",
      "mise \xE0 jour des informations du foyer fiscal"
    ],
    userQuestionsAnswered: [
      "Qu'est-ce que le formulaire 2042 ?",
      "\xC0 quoi sert la d\xE9claration de revenus ?"
    ],
    importantSections: [
      { concept: "identity", label: "Identit\xE9 / foyer fiscal" },
      { concept: "income", label: "Revenus" },
      { concept: "credits", label: "R\xE9ductions et cr\xE9dits (via annexes)" }
    ],
    relatedDocumentRefs: ["2042-C", "2042-C-PRO", "2042-RICI", "2044", "2047"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "10330",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.95,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit de la d\xE9claration principale de revenus. Elle sert \xE0 d\xE9clarer les revenus et certaines informations n\xE9cessaires au calcul de l'imp\xF4t sur le revenu.",
    plainLanguagePurpose: "Elle permet \xE0 l'administration d'\xE9tablir l'imp\xF4t sur le revenu \xE0 partir des \xE9l\xE9ments d\xE9clar\xE9s.",
    generalPossibleActions: [
      "Ce type de formulaire sert \xE0 d\xE9clarer des revenus ; toute \xE9ch\xE9ance ou case \xE0 remplir doit figurer explicitement sur le document consult\xE9."
    ],
    generalWhatToCheck: [
      "Identit\xE9 des d\xE9clarants",
      "Ann\xE9e des revenus concern\xE9s",
      "Montants de revenus indiqu\xE9s",
      "Annexes \xE9ventuellement jointes (2042-C, 2042-RICI, etc.)"
    ]
  }),
  pack({
    reference: "2042-C",
    normalizedReference: "2042-C",
    officialTitle: "D\xE9claration de revenus compl\xE9mentaire",
    shortTitle: "D\xE9claration compl\xE9mentaire 2042-C",
    family: "incomeTaxReturn",
    documentKind: "form",
    description: "Annexe compl\xE9mentaire \xE0 la d\xE9claration des revenus n\xB02042 pour certaines cat\xE9gories de revenus ou situations.",
    purpose: "D\xE9clarer des \xE9l\xE9ments compl\xE9mentaires qui ne figurent pas directement sur la d\xE9claration 2042 principale.",
    audience: ["particuliers", "foyer fiscal"],
    commonSituations: [
      "revenus ou situations \xE0 reporter en compl\xE9ment de la 2042"
    ],
    userQuestionsAnswered: ["Qu'est-ce que le formulaire 2042-C ?"],
    importantSections: [
      { concept: "identity", label: "Identit\xE9" },
      { concept: "complementaryIncome", label: "\xC9l\xE9ments compl\xE9mentaires" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "11222",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'une d\xE9claration compl\xE9mentaire \xE0 la d\xE9claration de revenus principale. Elle sert pour certaines cat\xE9gories de revenus ou situations qui ne figurent pas directement dans la d\xE9claration 2042.",
    plainLanguagePurpose: "Compl\xE9ter la d\xE9claration 2042 lorsque des \xE9l\xE9ments doivent \xEAtre d\xE9clar\xE9s sur cette annexe.",
    generalPossibleActions: [
      "Ce formulaire est en g\xE9n\xE9ral joint ou associ\xE9 \xE0 une d\xE9claration 2042 ; les actions pr\xE9cises d\xE9pendent du document re\xE7u."
    ],
    generalWhatToCheck: [
      "Lien avec la d\xE9claration 2042",
      "Rubriques compl\xE9mentaires renseign\xE9es",
      "Ann\xE9e des revenus"
    ]
  }),
  pack({
    reference: "2042-C-PRO",
    normalizedReference: "2042-C-PRO",
    officialTitle: "D\xE9claration de revenus compl\xE9mentaire des professions non salari\xE9es",
    shortTitle: "2042-C-PRO \u2014 professions non salari\xE9es",
    family: "professionalIncomeDeclaration",
    documentKind: "form",
    description: "Annexe 2042 destin\xE9e \xE0 certains revenus professionnels non salari\xE9s.",
    purpose: "D\xE9clarer des \xE9l\xE9ments relatifs aux professions non salari\xE9es en compl\xE9ment de la d\xE9claration de revenus.",
    audience: ["professions non salari\xE9es", "particuliers concern\xE9s"],
    commonSituations: ["revenus professionnels non salari\xE9s \xE0 d\xE9clarer"],
    userQuestionsAnswered: ["\xC0 quoi sert le 2042-C-PRO ?"],
    importantSections: [
      { concept: "professionalIncome", label: "Revenus professionnels" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'une annexe de la d\xE9claration de revenus destin\xE9e \xE0 certains revenus des professions non salari\xE9es.",
    plainLanguagePurpose: "Elle compl\xE8te la d\xE9claration 2042 pour des situations professionnelles non salari\xE9es.",
    generalPossibleActions: [
      "Ce type d'annexe compl\xE8te une d\xE9claration de revenus ; aucune obligation personnelle n'est d\xE9duite sans preuve dans le document."
    ],
    generalWhatToCheck: [
      "Lien avec la 2042",
      "\xC9l\xE9ments professionnels d\xE9clar\xE9s",
      "Ann\xE9e concern\xE9e"
    ]
  }),
  pack({
    reference: "2042-RICI",
    normalizedReference: "2042-RICI",
    officialTitle: "D\xE9claration des r\xE9ductions et cr\xE9dits d'imp\xF4t",
    shortTitle: "2042-RICI \u2014 r\xE9ductions et cr\xE9dits d'imp\xF4t",
    family: "taxCreditReduction",
    documentKind: "form",
    description: "Annexe permettant de d\xE9clarer certaines r\xE9ductions d'imp\xF4t et certains cr\xE9dits d'imp\xF4t.",
    purpose: "D\xE9clarer les r\xE9ductions et cr\xE9dits d'imp\xF4t concern\xE9s par ce formulaire.",
    audience: ["particuliers"],
    commonSituations: ["r\xE9ductions ou cr\xE9dits d'imp\xF4t \xE0 d\xE9clarer"],
    userQuestionsAnswered: ["\xC0 quoi sert le 2042-RICI ?"],
    importantSections: [
      { concept: "taxCredits", label: "R\xE9ductions et cr\xE9dits d'imp\xF4t" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2042, SRC_FORMS],
    cerfa: {
      number: "15637",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_2042],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire compl\xE9mentaire concerne certaines r\xE9ductions et certains cr\xE9dits d'imp\xF4t.",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer des r\xE9ductions ou cr\xE9dits d'imp\xF4t associ\xE9s \xE0 la d\xE9claration de revenus.",
    generalPossibleActions: [
      "Ce type de formulaire compl\xE8te une d\xE9claration de revenus ; les montants ou cases exacts doivent figurer sur le document."
    ],
    generalWhatToCheck: [
      "R\xE9ductions ou cr\xE9dits mentionn\xE9s",
      "Lien avec la d\xE9claration 2042",
      "Ann\xE9e concern\xE9e"
    ]
  }),
  pack({
    reference: "2042-IFI",
    normalizedReference: "2042-IFI",
    officialTitle: "D\xE9claration d'imp\xF4t sur la fortune immobili\xE8re",
    shortTitle: "2042-IFI",
    family: "wealthTax",
    documentKind: "form",
    description: "Formulaire de d\xE9claration de l'imp\xF4t sur la fortune immobili\xE8re (IFI).",
    purpose: "D\xE9clarer l'IFI lorsque le patrimoine immobilier net taxable au 1er janvier d\xE9passe le seuil pr\xE9vu par la r\xE9glementation.",
    audience: ["contribuables concern\xE9s par l'IFI"],
    commonSituations: [
      "patrimoine immobilier net taxable sup\xE9rieur au seuil l\xE9gal au 1er janvier"
    ],
    userQuestionsAnswered: ["Qu'est-ce que le formulaire 2042-IFI ?"],
    importantSections: [
      { concept: "realEstateWealth", label: "Patrimoine immobilier" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_IFI],
    cerfa: {
      number: "15798",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025],
    confidence: 0.92,
    provenance: [SRC_IFI],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit de la d\xE9claration d'imp\xF4t sur la fortune immobili\xE8re (IFI).",
    plainLanguagePurpose: "Elle sert \xE0 d\xE9clarer l'IFI lorsque le patrimoine immobilier net taxable d\xE9passe le seuil pr\xE9vu.",
    generalPossibleActions: [
      "Ce formulaire concerne l'IFI ; les seuils et obligations pr\xE9cises d\xE9pendent de la situation et du document re\xE7u."
    ],
    generalWhatToCheck: [
      "Patrimoine immobilier d\xE9clar\xE9",
      "Ann\xE9e / mill\xE9sime du formulaire",
      "\xC9l\xE9ments de calcul indiqu\xE9s sur le document"
    ]
  }),
  pack({
    reference: "2042-NR",
    normalizedReference: "2042-NR",
    officialTitle: "D\xE9claration des revenus compl\xE9mentaire",
    shortTitle: "2042-NR",
    family: "incomeTaxReturn",
    documentKind: "form",
    description: "D\xE9claration compl\xE9mentaire li\xE9e \xE0 certaines situations de d\xE9part \xE0 l'\xE9tranger ou de retour en France avec revenus de source fran\xE7aise.",
    purpose: "D\xE9clarer des revenus de source fran\xE7aise dans les situations de d\xE9part \xE0 l'\xE9tranger ou avant retour en France durant l'ann\xE9e civile, lorsque ce formulaire s'applique.",
    audience: ["contribuables en d\xE9part/retour", "non-r\xE9sidents concern\xE9s"],
    commonSituations: [
      "d\xE9part \xE0 l'\xE9tranger",
      "retour en France avec revenus de source fran\xE7aise"
    ],
    userQuestionsAnswered: ["\xC0 quoi sert le 2042-NR ?"],
    importantSections: [
      { concept: "foreignSituation", label: "Situation internationale" },
      { concept: "income", label: "Revenus de source fran\xE7aise" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_NR],
    cerfa: {
      number: "11942",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025],
    confidence: 0.9,
    provenance: [SRC_NR],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'une d\xE9claration compl\xE9mentaire de revenus utilis\xE9e dans certaines situations de d\xE9part \xE0 l'\xE9tranger ou de retour en France.",
    plainLanguagePurpose: "Elle sert \xE0 d\xE9clarer des revenus de source fran\xE7aise dans ces situations, lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Ce formulaire concerne des situations internationales particuli\xE8res ; aucune action personnelle n'est invent\xE9e sans preuve documentaire."
    ],
    generalWhatToCheck: [
      "Situation de d\xE9part ou retour",
      "Revenus de source fran\xE7aise indiqu\xE9s",
      "Ann\xE9e concern\xE9e"
    ]
  }),
  pack({
    reference: "2044",
    normalizedReference: "2044",
    officialTitle: "D\xE9claration des revenus fonciers",
    shortTitle: "D\xE9claration des revenus fonciers 2044",
    family: "rentalIncomeDeclaration",
    documentKind: "form",
    description: "Formulaire permettant de d\xE9clarer les revenus provenant de la location de locaux non meubl\xE9s (loyers, fermages), hors cas relevant d'autres d\xE9clarations sp\xE9cifiques.",
    purpose: "D\xE9clarer les revenus fonciers lorsque ce formulaire est requis.",
    audience: ["propri\xE9taires bailleurs", "particuliers concern\xE9s"],
    commonSituations: ["location de locaux non meubl\xE9s"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2044 ?"],
    importantSections: [
      { concept: "rentalIncome", label: "Revenus fonciers" },
      { concept: "charges", label: "Charges / \xE9l\xE9ments de calcul" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_2044],
    cerfa: {
      number: "10334",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.93,
    provenance: [SRC_2044],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Cette d\xE9claration concerne les revenus fonciers dans les situations o\xF9 ce formulaire est n\xE9cessaire.",
    plainLanguagePurpose: "Elle sert \xE0 d\xE9clarer les revenus issus de la location de locaux non meubl\xE9s lorsqu'elle s'applique.",
    generalPossibleActions: [
      "Ce formulaire compl\xE8te souvent une d\xE9claration de revenus ; les montants et \xE9ch\xE9ances doivent figurer sur le document."
    ],
    generalWhatToCheck: [
      "Loyers ou revenus fonciers indiqu\xE9s",
      "Ann\xE9e des revenus",
      "Lien \xE9ventuel avec la d\xE9claration 2042"
    ]
  }),
  pack({
    reference: "2047",
    normalizedReference: "2047",
    officialTitle: "D\xE9claration des revenus encaiss\xE9s \xE0 l'\xE9tranger",
    shortTitle: "2047 \u2014 revenus de l'\xE9tranger",
    family: "foreignIncomeDeclaration",
    documentKind: "form",
    description: "Formulaire pour d\xE9clarer des revenus encaiss\xE9s \xE0 l'\xE9tranger.",
    purpose: "D\xE9clarer les revenus de source \xE9trang\xE8re concern\xE9s par ce formulaire.",
    audience: ["particuliers percevant des revenus \xE0 l'\xE9tranger"],
    commonSituations: ["revenus encaiss\xE9s hors de France"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2047 ?"],
    importantSections: [
      { concept: "foreignIncome", label: "Revenus de l'\xE9tranger" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_FORMS, SRC_2042],
    cerfa: {
      number: "11226",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.88,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire sert \xE0 d\xE9clarer certains revenus encaiss\xE9s \xE0 l'\xE9tranger.",
    plainLanguagePurpose: "Il compl\xE8te la d\xE9claration de revenus lorsque des revenus de source \xE9trang\xE8re doivent \xEAtre d\xE9clar\xE9s via ce formulaire.",
    generalPossibleActions: [
      "Ce type de d\xE9claration est li\xE9 \xE0 la d\xE9claration de revenus ; aucune obligation pr\xE9cise n'est invent\xE9e sans le document."
    ],
    generalWhatToCheck: [
      "Pays / source des revenus",
      "Montants indiqu\xE9s",
      "Lien avec la 2042"
    ]
  }),
  pack({
    reference: "2074",
    normalizedReference: "2074",
    officialTitle: "D\xE9claration des plus ou moins values",
    shortTitle: "2074 \u2014 plus ou moins-values",
    family: "capitalGainsDeclaration",
    documentKind: "form",
    description: "Formulaire relatif \xE0 la d\xE9claration de certaines plus ou moins-values.",
    purpose: "D\xE9clarer des plus ou moins-values lorsque ce formulaire s'applique.",
    audience: ["particuliers concern\xE9s par des plus ou moins-values"],
    commonSituations: ["cession d'actifs g\xE9n\xE9rant plus ou moins-values"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2074 ?"],
    importantSections: [
      { concept: "capitalGains", label: "Plus ou moins-values" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'un formulaire de d\xE9claration de certaines plus ou moins-values.",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer ces op\xE9rations lorsque le formulaire est requis.",
    generalPossibleActions: [
      "Les op\xE9rations et montants exacts doivent figurer sur le document ; aucune plus-value n'est invent\xE9e."
    ],
    generalWhatToCheck: [
      "Op\xE9rations mentionn\xE9es",
      "Montants de plus ou moins-values",
      "Ann\xE9e concern\xE9e"
    ]
  }),
  pack({
    reference: "3916",
    normalizedReference: "3916",
    officialTitle: "D\xE9claration par un r\xE9sident d'un compte ouvert hors de France",
    shortTitle: "3916 \u2014 comptes \xE0 l'\xE9tranger",
    family: "foreignAccountsDeclaration",
    documentKind: "form",
    description: "Formulaire de d\xE9claration relative \xE0 certains comptes ouverts, d\xE9tenus, utilis\xE9s ou clos hors de France.",
    purpose: "D\xE9clarer certains comptes \xE0 l'\xE9tranger lorsque ce formulaire s'applique.",
    audience: ["r\xE9sidents concern\xE9s par des comptes hors de France"],
    commonSituations: ["compte bancaire ou assimil\xE9 \xE0 l'\xE9tranger"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 3916 ?"],
    importantSections: [
      { concept: "foreignAccounts", label: "Comptes hors de France" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11916",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire concerne la d\xE9claration de certains comptes ouverts hors de France.",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer ces comptes lorsque l'obligation documentaire s'applique.",
    generalPossibleActions: [
      "Les comptes et informations exactes doivent figurer sur le document ; aucune liste de comptes n'est invent\xE9e."
    ],
    generalWhatToCheck: [
      "Identification des comptes mentionn\xE9s",
      "Pays de d\xE9tention",
      "Ann\xE9e / p\xE9riode concern\xE9e"
    ]
  }),
  pack({
    reference: "2065-SD",
    normalizedReference: "2065-SD",
    officialTitle: "Imp\xF4t sur les soci\xE9t\xE9s",
    shortTitle: "2065-SD \u2014 imp\xF4t sur les soci\xE9t\xE9s",
    family: "corporateTax",
    documentKind: "form",
    description: "Formulaire catalogue DGFiP relatif \xE0 l'imp\xF4t sur les soci\xE9t\xE9s.",
    purpose: "D\xE9clarer des \xE9l\xE9ments li\xE9s \xE0 l'imp\xF4t sur les soci\xE9t\xE9s.",
    audience: ["entreprises / personnes morales concern\xE9es"],
    commonSituations: ["d\xE9claration d'imp\xF4t sur les soci\xE9t\xE9s"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2065-SD ?"],
    importantSections: [
      { concept: "corporateResult", label: "R\xE9sultat / imp\xF4t soci\xE9t\xE9s" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'un formulaire fiscal relatif \xE0 l'imp\xF4t sur les soci\xE9t\xE9s.",
    plainLanguagePurpose: "Il sert aux d\xE9clarations li\xE9es \xE0 l'imp\xF4t sur les soci\xE9t\xE9s lorsque ce formulaire s'applique.",
    generalPossibleActions: [
      "Les \xE9ch\xE9ances et montants doivent \xEAtre lus sur le document ; aucune obligation n'est invent\xE9e."
    ],
    generalWhatToCheck: [
      "Exercice / p\xE9riode",
      "Montants d\xE9clar\xE9s",
      "R\xE9f\xE9rence du formulaire"
    ]
  }),
  pack({
    reference: "3310-CA3-SD",
    normalizedReference: "3310-CA3-SD",
    officialTitle: "D\xE9claration de TVA et taxes assimil\xE9es (CA3)",
    shortTitle: "3310-CA3-SD \u2014 TVA",
    family: "vatDeclaration",
    documentKind: "form",
    description: "Formulaire de d\xE9claration de TVA et taxes assimil\xE9es (r\xE9gime concern\xE9).",
    purpose: "D\xE9clarer la TVA et taxes assimil\xE9es via le formulaire CA3.",
    audience: ["assujettis \xE0 la TVA concern\xE9s"],
    commonSituations: ["d\xE9claration p\xE9riodique de TVA"],
    userQuestionsAnswered: ["\xC0 quoi sert le 3310-CA3-SD ?"],
    importantSections: [
      { concept: "vat", label: "TVA et taxes assimil\xE9es" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "10963",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.88,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'une d\xE9claration de TVA (formulaire CA3) et taxes assimil\xE9es.",
    plainLanguagePurpose: "Elle sert \xE0 d\xE9clarer la TVA pour les assujettis concern\xE9s par ce r\xE9gime.",
    generalPossibleActions: [
      "Les p\xE9riodes et montants de TVA doivent figurer sur le document ; aucun calcul n'est invent\xE9."
    ],
    generalWhatToCheck: [
      "P\xE9riode de d\xE9claration",
      "Montants de TVA indiqu\xE9s",
      "R\xE9f\xE9rence CA3 / 3310"
    ]
  }),
  pack({
    reference: "INCOME-TAX-NOTICE",
    normalizedReference: "INCOME-TAX-NOTICE",
    officialTitle: "Avis d'imp\xF4t sur les revenus",
    shortTitle: "Avis d'imp\xF4t sur le revenu",
    family: "incomeTaxNotice",
    documentKind: "taxNotice",
    description: "Document restitu\xE9 par l'administration indiquant le r\xE9sultat de l'imp\xF4t sur le revenu (imp\xF4t calcul\xE9, pr\xE9l\xE8vements, solde).",
    purpose: "Informer le contribuable du r\xE9sultat de l'imp\xF4t sur le revenu et des suites \xE9ventuelles (paiement ou remboursement) indiqu\xE9es sur l'avis.",
    audience: ["particuliers / foyers fiscaux"],
    commonSituations: [
      "r\xE9ception de l'avis apr\xE8s d\xE9claration",
      "consultation de l'avis dans l'espace Finances publiques"
    ],
    userQuestionsAnswered: [
      "Qu'est-ce qu'un avis d'imp\xF4t sur le revenu ?",
      "Que regarder sur un avis d'imp\xF4t ?"
    ],
    importantSections: [
      { concept: "taxResult", label: "Imp\xF4t calcul\xE9" },
      { concept: "withholding", label: "Pr\xE9l\xE8vements d\xE9j\xE0 effectu\xE9s" },
      { concept: "balance", label: "Reste \xE0 payer ou remboursement" },
      { concept: "dates", label: "Dates / \xE9ch\xE9ances indiqu\xE9es" }
    ],
    relatedDocumentRefs: ["2042"],
    officialSources: [SRC_AVIS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_AVIS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'un avis d'imp\xF4t sur le revenu : un document de l'administration qui indique le r\xE9sultat de votre imposition.",
    plainLanguagePurpose: "Il informe du montant d'imp\xF4t calcul\xE9, des pr\xE9l\xE8vements d\xE9j\xE0 pris en compte et du solde (\xE0 payer ou \xE0 rembourser) lorsqu'il figure sur l'avis.",
    generalPossibleActions: [
      "Selon le contenu de l'avis, un paiement ou aucune action peut \xEAtre indiqu\xE9 ; seules les mentions du document font foi."
    ],
    generalWhatToCheck: [
      "Imp\xF4t calcul\xE9",
      "Pr\xE9l\xE8vement \xE0 la source d\xE9j\xE0 effectu\xE9",
      "Reste \xE0 payer ou montant \xE0 rembourser",
      "Dates limites \xE9ventuellement indiqu\xE9es",
      "R\xE9f\xE9rence de l'avis"
    ]
  }),
  pack({
    reference: "PROPERTY-TAX-NOTICE",
    normalizedReference: "PROPERTY-TAX-NOTICE",
    officialTitle: "Avis de taxe fonci\xE8re",
    shortTitle: "Avis de taxe fonci\xE8re",
    family: "propertyTax",
    documentKind: "taxNotice",
    description: "Avis d'imposition de taxe fonci\xE8re mis \xE0 disposition par la DGFiP (papier et/ou en ligne).",
    purpose: "Informer du montant de taxe fonci\xE8re et des modalit\xE9s de mise \xE0 disposition / paiement indiqu\xE9es sur l'avis.",
    audience: ["propri\xE9taires concern\xE9s"],
    commonSituations: ["r\xE9ception annuelle de l'avis de taxe fonci\xE8re"],
    userQuestionsAnswered: [
      "Qu'est-ce qu'un avis de taxe fonci\xE8re ?",
      "Que regarder sur un avis de taxe fonci\xE8re ?"
    ],
    importantSections: [
      { concept: "taxAmount", label: "Montant de la taxe" },
      { concept: "deadline", label: "Date limite de paiement si indiqu\xE9e" },
      { concept: "property", label: "Contexte de la propri\xE9t\xE9" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_TF, SRC_AVIS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.9,
    provenance: [SRC_TF],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'un avis de taxe fonci\xE8re adress\xE9 ou mis \xE0 disposition par l'administration fiscale.",
    plainLanguagePurpose: "Il indique le montant de la taxe fonci\xE8re et, lorsqu'elles figurent, les informations de paiement.",
    generalPossibleActions: [
      "Un paiement peut \xEAtre demand\xE9 si l'avis l'indique ; aucune \xE9ch\xE9ance n'est invent\xE9e si elle est absente du document."
    ],
    generalWhatToCheck: [
      "Montant total \xE0 payer",
      "Ann\xE9e d'imposition",
      "Date limite de paiement si pr\xE9sente",
      "R\xE9f\xE9rence de l'avis"
    ]
  }),
  pack({
    reference: "2572-SD",
    normalizedReference: "2572-SD",
    officialTitle: "Formulaire 2572-SD",
    shortTitle: "2572-SD",
    family: "withholdingTax",
    documentKind: "form",
    description: "Formulaire catalogue DGFiP (r\xE9f\xE9rence officielle recherche de formulaire) li\xE9 \xE0 des formalit\xE9s de retenue / pr\xE9l\xE8vement selon la notice officielle.",
    purpose: "Formalit\xE9 fiscale professionnelle de retenue/pr\xE9l\xE8vement selon le p\xE9rim\xE8tre du formulaire officiel.",
    audience: ["professionnels concern\xE9s"],
    commonSituations: ["formalit\xE9s de retenue \xE0 la source selon notice"],
    userQuestionsAnswered: ["Que d\xE9signe le formulaire 2572-SD ?"],
    importantSections: [],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.7,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat: "Il s'agit d'un formulaire fiscal professionnel r\xE9f\xE9renc\xE9 par l'administration (2572-SD).",
    plainLanguagePurpose: "Son usage pr\xE9cis d\xE9pend de la notice officielle du formulaire ; ExpliqueMoi n'invente pas le d\xE9tail des cases.",
    generalPossibleActions: [
      "Consulter la notice officielle du formulaire pour le d\xE9tail des obligations."
    ],
    generalWhatToCheck: [
      "R\xE9f\xE9rence du formulaire",
      "P\xE9riode indiqu\xE9e sur le document",
      "Montants explicitement pr\xE9sents"
    ]
  }),
  pack({
    reference: "1330-CVAE-SD",
    normalizedReference: "1330-CVAE-SD",
    officialTitle: "Formulaire 1330-CVAE-SD",
    shortTitle: "1330-CVAE-SD",
    family: "businessTax",
    documentKind: "form",
    description: "Formulaire catalogue DGFiP relatif \xE0 la CVAE.",
    purpose: "Formalit\xE9 CVAE lorsque ce formulaire s'applique.",
    audience: ["entreprises concern\xE9es par la CVAE"],
    commonSituations: ["formalit\xE9s CVAE"],
    userQuestionsAnswered: ["Que d\xE9signe le 1330-CVAE-SD ?"],
    importantSections: [],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2024, 2025, 2026],
    confidence: 0.75,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat: "Il s'agit d'un formulaire fiscal relatif \xE0 la CVAE (1330-CVAE-SD).",
    plainLanguagePurpose: "Il concerne des formalit\xE9s CVAE ; le d\xE9tail d\xE9pend de la notice officielle.",
    generalPossibleActions: [
      "Se reporter \xE0 la notice officielle pour toute obligation pr\xE9cise."
    ],
    generalWhatToCheck: [
      "R\xE9f\xE9rence du formulaire",
      "P\xE9riode",
      "Montants pr\xE9sents sur le document"
    ]
  }),
  pack({
    reference: "2735",
    normalizedReference: "2735",
    officialTitle: "D\xE9claration de dons manuels et de sommes d'argent",
    shortTitle: "2735 \u2014 dons manuels",
    family: "inheritanceDonation",
    documentKind: "form",
    description: "Formulaire de d\xE9claration de dons manuels et de sommes d'argent.",
    purpose: "D\xE9clarer certains dons manuels et sommes d'argent lorsque ce formulaire s'applique.",
    audience: ["particuliers concern\xE9s par des dons manuels"],
    commonSituations: ["don manuel / somme d'argent \xE0 d\xE9clarer"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2735 ?"],
    importantSections: [
      { concept: "gifts", label: "Dons / sommes d'argent" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11278",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2025],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire sert \xE0 d\xE9clarer certains dons manuels et sommes d'argent.",
    plainLanguagePurpose: "Il permet d'accomplir la formalit\xE9 d\xE9clarative pr\xE9vue pour ces dons lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les dons et montants exacts doivent figurer sur le document ; rien n'est invent\xE9."
    ],
    generalWhatToCheck: [
      "Nature du don",
      "Montants indiqu\xE9s",
      "Identit\xE9 des parties si pr\xE9sente"
    ]
  }),
  pack({
    reference: "2561",
    normalizedReference: "2561",
    officialTitle: "D\xE9claration r\xE9capitulative des op\xE9rations sur valeurs mobili\xE8res",
    shortTitle: "2561 \u2014 valeurs mobili\xE8res",
    family: "withholdingTax",
    documentKind: "form",
    description: "D\xE9claration r\xE9capitulative des op\xE9rations sur valeurs mobili\xE8res et revenus de capitaux mobiliers.",
    purpose: "R\xE9capituler certaines op\xE9rations sur valeurs mobili\xE8res / revenus de capitaux mobiliers.",
    audience: ["\xE9tablissements / d\xE9clarants concern\xE9s"],
    commonSituations: ["op\xE9rations sur valeurs mobili\xE8res"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2561 ?"],
    importantSections: [
      { concept: "securities", label: "Op\xE9rations sur valeurs mobili\xE8res" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11428",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2023, 2024, 2025],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire r\xE9capitule certaines op\xE9rations sur valeurs mobili\xE8res et revenus de capitaux mobiliers.",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer ces op\xE9rations lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les op\xE9rations list\xE9es doivent provenir du document ; aucune op\xE9ration n'est invent\xE9e."
    ],
    generalWhatToCheck: [
      "Op\xE9rations mentionn\xE9es",
      "Montants",
      "P\xE9riode"
    ]
  }),
  pack({
    reference: "2777",
    normalizedReference: "2777",
    officialTitle: "Revenus de capitaux mobiliers \u2014 pr\xE9l\xE8vement et retenue \xE0 la source",
    shortTitle: "2777 \u2014 RCM / pr\xE9l\xE8vement",
    family: "withholdingTax",
    documentKind: "form",
    description: "Formulaire relatif aux revenus de capitaux mobiliers (pr\xE9l\xE8vement et retenue \xE0 la source).",
    purpose: "D\xE9clarer / liquider certains pr\xE9l\xE8vements et retenues sur revenus de capitaux mobiliers.",
    audience: ["d\xE9clarants concern\xE9s par les RCM"],
    commonSituations: ["pr\xE9l\xE8vement / retenue sur revenus de capitaux mobiliers"],
    userQuestionsAnswered: ["\xC0 quoi sert le formulaire 2777 ?"],
    importantSections: [
      { concept: "withholding", label: "Pr\xE9l\xE8vement / retenue" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "10024",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2024, 2025, 2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Ce formulaire concerne les revenus de capitaux mobiliers soumis \xE0 pr\xE9l\xE8vement ou retenue \xE0 la source.",
    plainLanguagePurpose: "Il sert aux formalit\xE9s de pr\xE9l\xE8vement/retenue sur ces revenus lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Un pr\xE9l\xE8vement d\xE9j\xE0 effectu\xE9 n'est pas automatiquement un montant d\xFB ; se fier aux libell\xE9s du document."
    ],
    generalWhatToCheck: [
      "Montants pr\xE9lev\xE9s / retenus",
      "P\xE9riode",
      "Nature des revenus"
    ]
  }),
  pack({
    reference: "2031-SD",
    normalizedReference: "2031-SD",
    officialTitle: "D\xE9claration de r\xE9sultat \u2014 BIC (2031-SD)",
    shortTitle: "2031-SD \u2014 BIC",
    family: "professionalBenefits",
    documentKind: "form",
    description: "Formulaire de d\xE9claration de r\xE9sultat pour certains r\xE9gimes BIC.",
    purpose: "D\xE9clarer le r\xE9sultat fiscal BIC lorsque ce formulaire s'applique.",
    audience: ["professionnels BIC concern\xE9s"],
    commonSituations: ["d\xE9claration de r\xE9sultat BIC"],
    userQuestionsAnswered: ["\xC0 quoi sert le 2031-SD ?"],
    importantSections: [
      { concept: "result", label: "R\xE9sultat" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: {
      number: "11194",
      version: null,
      verified: true,
      source: SRC_FORMS.url
    },
    applicableYears: [2026],
    confidence: 0.85,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "verified",
    plainLanguageWhat: "Il s'agit d'un formulaire de d\xE9claration de r\xE9sultat pour certains r\xE9gimes de b\xE9n\xE9fices industriels et commerciaux (BIC).",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer ce r\xE9sultat lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Les montants de r\xE9sultat doivent figurer sur le document ; aucun r\xE9sultat n'est invent\xE9."
    ],
    generalWhatToCheck: [
      "Exercice",
      "R\xE9sultat d\xE9clar\xE9",
      "R\xE9f\xE9rence 2031-SD"
    ]
  }),
  pack({
    reference: "2035-SD",
    normalizedReference: "2035-SD",
    officialTitle: "D\xE9claration de r\xE9sultat \u2014 BNC (2035-SD)",
    shortTitle: "2035-SD \u2014 BNC",
    family: "professionalBenefits",
    documentKind: "form",
    description: "Formulaire de d\xE9claration de r\xE9sultat pour certains r\xE9gimes BNC.",
    purpose: "D\xE9clarer le r\xE9sultat fiscal BNC lorsque ce formulaire s'applique.",
    audience: ["professionnels BNC concern\xE9s"],
    commonSituations: ["d\xE9claration de r\xE9sultat BNC"],
    userQuestionsAnswered: ["\xC0 quoi sert le 2035-SD ?"],
    importantSections: [
      { concept: "result", label: "R\xE9sultat" }
    ],
    relatedDocumentRefs: [],
    officialSources: [SRC_FORMS],
    cerfa: null,
    applicableYears: [2025],
    confidence: 0.8,
    provenance: [SRC_FORMS],
    lastVerifiedAt: RETRIEVED2,
    qualityStatus: "partiallyVerified",
    plainLanguageWhat: "Il s'agit d'un formulaire de d\xE9claration de r\xE9sultat pour certains r\xE9gimes de b\xE9n\xE9fices non commerciaux (BNC).",
    plainLanguagePurpose: "Il sert \xE0 d\xE9clarer ce r\xE9sultat lorsque le formulaire s'applique.",
    generalPossibleActions: [
      "Aucun montant de r\xE9sultat n'est invent\xE9 sans preuve documentaire."
    ],
    generalWhatToCheck: [
      "Exercice",
      "R\xE9sultat d\xE9clar\xE9",
      "R\xE9f\xE9rence 2035-SD"
    ]
  })
];
var PRIORITY_SEMANTIC_BY_REF = new Map(PRIORITY_SEMANTIC_PACKS.map((p) => [p.normalizedReference, p]));
function getPrioritySemantic(normalizedReference) {
  return PRIORITY_SEMANTIC_BY_REF.get(normalizedReference) || null;
}

// lib/v4/knowledge/fr/tax/semantic/qualityStatus.ts
var GENERIC_PURPOSE = /Formalité\s*\/\s*déclaration fiscale \(voir notice officielle\)/i;
function isGenericPurpose(purpose) {
  return !purpose || GENERIC_PURPOSE.test(purpose);
}
function hasVerifiedSemantic(entry) {
  const s = entry.semantic;
  if (!s) return false;
  if (s.qualityStatus !== "verified" && s.qualityStatus !== "partiallyVerified") {
    return false;
  }
  if (!s.plainLanguageWhat || s.plainLanguageWhat.length < 20) return false;
  if (!s.purpose || isGenericPurpose(s.purpose)) return false;
  if (!s.officialSources?.length) return false;
  return s.qualityStatus === "verified";
}
function deriveQualityStatus(entry) {
  if (entry.status === "needsReview") return "needsReview";
  const hasTitle = Boolean(entry.officialTitle && entry.officialTitle.length > 3);
  const hasSource = (entry.officialSources || []).length > 0;
  const hasAuthority = Boolean(entry.authority);
  const semanticVerified = hasVerifiedSemantic(entry);
  const semanticPartial = Boolean(entry.semantic) && entry.semantic.qualityStatus === "partiallyVerified" && Boolean(entry.semantic.plainLanguageWhat);
  if (semanticVerified && hasTitle && hasSource && hasAuthority) {
    return "verified";
  }
  if ((semanticPartial || !isGenericPurpose(entry.purpose) && hasSource) && hasTitle && hasAuthority) {
    return "partiallyVerified";
  }
  if (hasTitle && hasSource) return "discovered";
  return "needsReview";
}
function applyQualityToEntry(entry) {
  const qualityStatus = deriveQualityStatus(entry);
  const quality = {
    ...entry.quality || {
      score: 0,
      hasOfficialReference: entry.referenceNumbers.length > 0,
      hasOfficialTitle: Boolean(entry.officialTitle),
      hasOfficialSource: (entry.officialSources || []).length > 0,
      hasAuthority: Boolean(entry.authority),
      hasYearInformation: (entry.applicableYears || []).length > 0,
      hasCerfa: (entry.cerfaNumbers || []).length > 0,
      hasRelations: (entry.relatedDocuments || []).length > 0,
      cerfaApplicable: entry.documentKind === "form"
    },
    hasVerifiedSemanticExplanation: hasVerifiedSemantic(entry)
  };
  return { ...entry, qualityStatus, quality };
}

// lib/v4/knowledge/fr/tax/semantic/applySemantics.ts
function enrichEntryWithSemantics(entry) {
  const pack3 = PRIORITY_SEMANTIC_BY_REF.get(entry.normalizedReference);
  if (!pack3) {
    return applyQualityToEntry(entry);
  }
  const merged = {
    ...entry,
    officialTitle: pack3.officialTitle || entry.officialTitle,
    description: pack3.description,
    purpose: pack3.purpose,
    applicableYears: pack3.applicableYears.length > 0 ? pack3.applicableYears : entry.applicableYears,
    cerfaNumbers: pack3.cerfa?.number && !entry.cerfaNumbers.includes(pack3.cerfa.number) ? [...entry.cerfaNumbers, pack3.cerfa.number] : entry.cerfaNumbers.length ? entry.cerfaNumbers : pack3.cerfa?.number ? [pack3.cerfa.number] : [],
    cerfaVerified: Boolean(pack3.cerfa?.verified),
    semantic: pack3,
    // Prefer pack provenance for semantic fields
    officialSources: pack3.officialSources.length > 0 ? pack3.officialSources : entry.officialSources,
    confidence: Math.max(entry.confidence, pack3.confidence)
  };
  return applyQualityToEntry(merged);
}
function enrichRegistryWithSemantics(registry) {
  return {
    ...registry,
    version: registry.version.includes("v4n") ? registry.version : `${registry.version}+v4n`,
    entries: registry.entries.map(enrichEntryWithSemantics)
  };
}

// lib/v4/knowledge/fr/tax/registry/loadRegistry.ts
var HERE2 = dirname2(fileURLToPath2(import.meta.url));
var ARTIFACT_CANDIDATES = [
  join2(HERE2, "../../../../../../generated/french-tax-registry.json"),
  join2(process.cwd(), "generated/french-tax-registry.json")
];
var cached = null;
var cachedIndex = null;
function buildRegistryFromSeed(generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return enrichRegistryWithSemantics(buildSeedRegistry(generatedAt));
}
function loadFrenchTaxRegistry() {
  if (cached) return cached;
  for (const path of ARTIFACT_CANDIDATES) {
    if (!existsSync2(path)) continue;
    try {
      const raw = JSON.parse(readFileSync2(path, "utf8"));
      if (raw?.entries?.length) {
        cached = enrichRegistryWithSemantics(raw);
        cachedIndex = buildRegistryIndex(cached);
        return cached;
      }
    } catch {
    }
  }
  cached = buildRegistryFromSeed("seed-runtime");
  cachedIndex = buildRegistryIndex(cached);
  return cached;
}
function getFrenchTaxRegistryIndex() {
  if (!cachedIndex) loadFrenchTaxRegistry();
  return cachedIndex;
}
function lookupById(registry, id) {
  return registry.entries.find((e) => e.id === id) || null;
}
function knowledgeFactsForEntry(entry) {
  return [
    {
      kind: "knowledge",
      id: `kf:${entry.id}:title`,
      country: "FR",
      statement: `${entry.normalizedReference || entry.referenceNumbers[0] || entry.id} correspond \xE0 \xAB ${entry.officialTitle} \xBB.`,
      subjectId: entry.id,
      fields: ["officialTitle", "reference"],
      provenance: entry.officialSources,
      confidence: entry.confidence
    },
    {
      kind: "knowledge",
      id: `kf:${entry.id}:purpose`,
      country: "FR",
      statement: entry.purpose,
      subjectId: entry.id,
      fields: ["purpose"],
      provenance: entry.officialSources,
      confidence: entry.confidence
    }
  ];
}

// lib/v4/knowledge/fr/tax/semantic/lookup.ts
function findByReference(reference) {
  const res = lookupRegistry(getFrenchTaxRegistryIndex(), reference);
  if (res.matchKind === "none" || res.matchKind === "possible") return null;
  return res.entry;
}
function lookupTaxDocumentKnowledge(referenceOrId) {
  const byRef = findByReference(referenceOrId);
  if (byRef?.semantic) return byRef.semantic;
  if (byRef) {
    return getPrioritySemantic(byRef.normalizedReference);
  }
  const reg = loadFrenchTaxRegistry();
  const byId = lookupById(reg, referenceOrId);
  if (byId?.semantic) return byId.semantic;
  if (byId) return getPrioritySemantic(byId.normalizedReference);
  return getPrioritySemantic(referenceOrId.toUpperCase());
}
function findRelatedDocuments(reference) {
  const entry = findByReference(reference);
  if (!entry) return [];
  const reg = loadFrenchTaxRegistry();
  const out = [];
  for (const rel2 of entry.relatedDocuments || []) {
    const target = lookupById(reg, rel2.targetId);
    if (target) out.push({ entry: target, relation: rel2 });
  }
  if (entry.semantic?.relatedDocumentRefs?.length) {
    for (const ref of entry.semantic.relatedDocumentRefs) {
      if (out.some((o) => o.entry.normalizedReference === ref)) continue;
      const t = findByReference(ref);
      if (t) {
        out.push({
          entry: t,
          relation: {
            targetId: t.id,
            relationType: "relatedTo",
            source: entry.semantic.officialSources[0]?.url || "semantic",
            confidence: 0.7
          }
        });
      }
    }
  }
  return out;
}

// lib/v4/knowledge/fr/tax/semantic/explainTaxDocument.ts
function factRefsFromExplanation(explanation) {
  const out = [];
  const push = (f) => {
    if (f.status === "missing" || f.status === "notApplicable") return;
    if (f.value == null || f.value === "") return;
    if (!f.evidence?.length) return;
    out.push({
      kind: "document",
      field: f.field,
      value: f.value,
      evidence: f.evidence,
      derivedFrom: f.derivedFrom
    });
  };
  for (const f of explanation.importantFacts || []) push(f);
  for (const f of explanation.amounts || []) push(f);
  for (const f of explanation.deadlines || []) push(f);
  for (const f of explanation.summaryFacts || []) push(f);
  if (explanation.title) push(explanation.title);
  return out;
}
function pickImportantDocumentFacts(facts) {
  const preferred = [
    "amount",
    "total",
    "tax",
    "deadline",
    "date",
    "period",
    "year",
    "reference",
    "status",
    "refund",
    "due"
  ];
  const scored = facts.map((f) => {
    const key = `${f.field}`.toLowerCase();
    const score = preferred.findIndex((p) => key.includes(p));
    return { f, score: score === -1 ? 99 : score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 12).map((x) => x.f);
}
function buildKnowledgeFacts(semantic, subjectId) {
  if (!semantic) return [];
  const prov = semantic.provenance.length ? semantic.provenance : semantic.officialSources;
  return [
    {
      kind: "knowledge",
      id: `kf:${subjectId}:what`,
      country: "FR",
      statement: semantic.plainLanguageWhat,
      subjectId,
      fields: ["plainLanguageWhat", "description"],
      provenance: prov,
      confidence: semantic.confidence
    },
    {
      kind: "knowledge",
      id: `kf:${subjectId}:purpose`,
      country: "FR",
      statement: semantic.plainLanguagePurpose || semantic.purpose,
      subjectId,
      fields: ["plainLanguagePurpose", "purpose"],
      provenance: prov,
      confidence: semantic.confidence
    }
  ];
}
function whoIsConcerned(semantic) {
  if (!semantic) return null;
  if (!semantic.audience?.length) return null;
  return `Publics g\xE9n\xE9ralement concern\xE9s (connaissance g\xE9n\xE9rale) : ${semantic.audience.join(", ")}.`;
}
function buildWhatToCheck(semantic, documentFacts) {
  const checks = [];
  if (semantic?.generalWhatToCheck?.length) {
    for (const item of semantic.generalWhatToCheck) {
      checks.push(
        `${item} (rep\xE8re g\xE9n\xE9ral sur ce type de document \u2014 non affirm\xE9 comme pr\xE9sent ici).`
      );
    }
  }
  const amounts = documentFacts.filter(
    (f) => /amount|total|tax|refund|due|montant/i.test(f.field)
  );
  const dates = documentFacts.filter(
    (f) => /date|deadline|period|year|échéance/i.test(f.field)
  );
  if (amounts.length) {
    checks.push(
      `${amounts.length} montant(s) r\xE9ellement d\xE9tect\xE9(s) dans le document \u2014 \xE0 v\xE9rifier dans le texte source.`
    );
  }
  if (dates.length) {
    checks.push(
      `${dates.length} date(s) ou p\xE9riode(s) r\xE9ellement d\xE9tect\xE9e(s) dans le document \u2014 \xE0 v\xE9rifier dans le texte source.`
    );
  }
  if (!checks.length) {
    checks.push(
      "Aucun \xE9l\xE9ment prioritaire n'a pu \xEAtre list\xE9 de fa\xE7on fiable pour ce document."
    );
  }
  return checks;
}
function buildPossibleActions(semantic, explanation) {
  const actions = [];
  let inventedTaxObligations = 0;
  if (semantic?.generalPossibleActions?.length) {
    for (const a of semantic.generalPossibleActions) {
      actions.push(
        `${a} (contexte g\xE9n\xE9ral du type de document, pas une obligation personnelle).`
      );
    }
  }
  for (const act of explanation.actions || []) {
    if (act.status === "noExplicitActionDetected" || act.status === "missing") continue;
    if (!act.evidence?.length) continue;
    if (act.description) {
      actions.push(
        `Action d\xE9tect\xE9e dans le document : ${act.description}`
      );
    }
  }
  if (!actions.length) {
    actions.push(
      "Aucune action pr\xE9cise n'est d\xE9montr\xE9e dans ce document ; aucune obligation personnelle n'est invent\xE9e."
    );
  }
  for (const a of actions) {
    if (/\bcase\s+[0-9A-Z]{2,}\b/i.test(a) && !/détectée dans le document/i.test(a)) {
      inventedTaxObligations += 1;
    }
    if (/avant\s+le\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(a) && !/détectée dans le document/i.test(a)) {
      inventedTaxObligations += 1;
    }
  }
  return { actions, inventedTaxObligations };
}
function resolveSemantic(referenceHint) {
  if (!referenceHint) {
    return {
      semantic: null,
      qualityStatus: null,
      officialTitle: null,
      family: null,
      documentKind: null,
      reference: null
    };
  }
  const entry = findByReference(referenceHint);
  const semantic = entry?.semantic || lookupTaxDocumentKnowledge(referenceHint) || getPrioritySemantic(referenceHint.toUpperCase());
  return {
    semantic,
    qualityStatus: entry?.qualityStatus || semantic?.qualityStatus || null,
    officialTitle: semantic?.officialTitle || entry?.officialTitle || null,
    family: semantic?.family || entry?.family || null,
    documentKind: semantic?.documentKind || entry?.documentKind || null,
    reference: semantic?.normalizedReference || entry?.normalizedReference || referenceHint
  };
}
function explainTaxDocument(input) {
  const familyHint = input.fiscalKnowledge?.suggestedFamily || null;
  const familyAlias = familyHint === "incomeTaxNotice" ? "INCOME-TAX-NOTICE" : familyHint === "propertyTax" ? "PROPERTY-TAX-NOTICE" : null;
  const primary = input.referenceHint || input.fiscalKnowledge?.primaryIdentity?.normalized || (typeof input.identity.reference?.value === "string" ? input.identity.reference.value : null) || familyAlias || null;
  const resolved = resolveSemantic(primary);
  const semantic = resolved.semantic;
  const sourceFacts = factRefsFromExplanation(input.explanation);
  const importantDocumentFacts = pickImportantDocumentFacts(sourceFacts);
  const documentFactsFromKnowledge = importantDocumentFacts.filter(
    (f) => f.derivedFrom.some((d) => d.startsWith("kf:"))
  ).length;
  const knowledgeFacts = buildKnowledgeFacts(
    semantic,
    resolved.reference || "unknown"
  );
  const { actions, inventedTaxObligations } = buildPossibleActions(
    semantic,
    input.explanation
  );
  const related = resolved.reference ? findRelatedDocuments(resolved.reference).map(({ entry, relation }) => ({
    reference: entry.normalizedReference,
    title: entry.officialTitle,
    relationType: relation.relationType
  })) : (semantic?.relatedDocumentRefs || []).map((ref) => ({
    reference: ref,
    title: getPrioritySemantic(ref)?.officialTitle || ref,
    relationType: "relatedTo"
  }));
  const warnings = [];
  const conf = semantic?.confidence ?? 0.2;
  if (!semantic || conf < 0.55) {
    warnings.push(
      "Identification ou connaissance limit\xE9e : les informations g\xE9n\xE9rales peuvent ne pas correspondre \xE0 ce document."
    );
  }
  if (resolved.qualityStatus === "needsReview" || resolved.qualityStatus === "discovered") {
    warnings.push("La fiche knowledge associ\xE9e n'est que partiellement v\xE9rifi\xE9e.");
  }
  if (!importantDocumentFacts.some((f) => /amount|total|tax|montant/i.test(f.field))) {
    warnings.push("Aucun montant n'est pr\xE9sent\xE9 comme prouv\xE9 par le document.");
  }
  if (!importantDocumentFacts.some((f) => /date|deadline|period|year/i.test(f.field))) {
    warnings.push("Aucune date n'est pr\xE9sent\xE9e comme prouv\xE9e par le document.");
  }
  warnings.push(
    "Les informations g\xE9n\xE9rales (knowledge) ne remplacent pas le contenu r\xE9el du document et ne constituent pas un conseil fiscal."
  );
  let inventedTaxDates = 0;
  let inventedTaxAmounts = 0;
  for (const kf of knowledgeFacts) {
    if (/\b\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d{2})?\s*€/.test(kf.statement)) {
      inventedTaxAmounts += 1;
    }
    if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(kf.statement)) {
      inventedTaxDates += 1;
    }
  }
  const unsupportedKnowledgeClaims = semantic && (!semantic.officialSources?.length || !semantic.provenance?.length) ? 1 : 0;
  return {
    identity: {
      reference: resolved.reference,
      officialTitle: resolved.officialTitle,
      family: resolved.family,
      documentKind: resolved.documentKind,
      qualityStatus: resolved.qualityStatus
    },
    whatIsIt: semantic?.plainLanguageWhat || null,
    purpose: semantic?.plainLanguagePurpose || semantic?.purpose || null,
    whoIsConcerned: whoIsConcerned(semantic),
    whatToCheck: buildWhatToCheck(semantic, importantDocumentFacts),
    possibleActions: actions,
    importantDocumentFacts,
    relatedDocuments: related,
    warnings,
    confidence: semantic?.confidence ?? 0.2,
    knowledgeFacts,
    sourceFacts,
    invariants: {
      documentFactsFromKnowledge,
      inventedTaxObligations,
      inventedTaxDates,
      inventedTaxAmounts,
      unsupportedKnowledgeClaims
    }
  };
}

// lib/v4/candidates/context.ts
function lineOf(blocks, index) {
  return blocks[index]?.text ?? "";
}
function buildContext(blocks, match) {
  const sameLine = lineOf(blocks, match.blockIndex);
  const previousLine = lineOf(blocks, match.blockIndex - 1);
  const nextLine = lineOf(blocks, match.blockIndex + 1);
  const before = sameLine.slice(0, match.start);
  const after = sameLine.slice(match.end);
  return { sameLine, previousLine, nextLine, before, after };
}
function contextBlob(ctx) {
  return [ctx.previousLine, ctx.before, ctx.after, ctx.nextLine, ctx.sameLine].filter(Boolean).join(" ");
}
function blocksFromPlainText(text, source = "text") {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  return lines.map((line, i) => ({
    id: `line_${i + 1}`,
    text: line,
    page: 1,
    lineId: `L${i + 1}`,
    blockId: `B${i + 1}`,
    source,
    bbox: null
  }));
}

// lib/v4/candidates/ids.ts
var seq = 0;
function resetCandidateIdsForTests() {
  seq = 0;
}
function nextCandidateId(prefix) {
  seq += 1;
  return `${prefix}_${seq}`;
}

// lib/v4/candidates/normalize.ts
function normalizeLex(text) {
  let s = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/(?<=[a-z])0(?=[a-z])/g, "o").replace(/(?<=\d)o(?=\d)/g, "0").replace(/(?<=\d)o(?=\s*%)/g, "0").replace(/\bo(?=\d+\s*%)/g, "0");
  return s;
}
function parseFrenchMoney(raw) {
  let s = String(raw || "").replace(/€|eur|euros?/gi, "").replace(/\u00a0/g, " ").trim();
  if (!s) return null;
  if (/\d{1,3}(?:[.\s]\d{3})+,\d{1,2}$/.test(s.replace(/\s/g, (m) => m))) {
    s = s.replace(/[.\s]/g, "").replace(",", ".");
  } else if (/\d+,\d{1,2}$/.test(s)) {
    s = s.replace(/\s/g, "").replace(",", ".");
  } else if (/\d+\.\d{1,2}$/.test(s) && !/\d+\.\d{3},/.test(raw)) {
    s = s.replace(/\s/g, "");
  } else {
    s = s.replace(/\s/g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseFrenchPercentage(raw) {
  const m = String(raw || "").match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
var MONTHS_FR = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12
};
function toIso(yyyy, mm, dd) {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}
function parseFrenchDate(raw) {
  const text = String(raw || "");
  const num2 = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (num2) {
    let dd = Number(num2[1]);
    let mm = Number(num2[2]);
    let yyyy = Number(num2[3]);
    if (yyyy < 100) yyyy += 2e3;
    return toIso(yyyy, mm, dd);
  }
  const lex2 = normalizeLex(text);
  const named = lex2.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/
  );
  if (named) {
    const dd = Number(named[1]);
    const mm = MONTHS_FR[named[2]];
    const yyyy = Number(named[3]);
    if (!mm) return null;
    return toIso(yyyy, mm, dd);
  }
  return null;
}

// lib/v4/candidates/extractors/action.ts
var ACTION_PATTERNS = [
  /merci\s+de\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+remercions\s+de\s+([^.\n]{5,100})/gi,
  /veuillez\s+([^.\n]{5,80})/gi,
  /nous\s+vous\s+prions\s+de\s+([^.\n]{5,80})/gi,
  /vous\s+devez\s+([^.\n]{5,80})/gi,
  /(?<!ne\s)(?<!n['’])doit\s+([^.\n]{5,60})/gi,
  /transmettre\s+([^.\n]{5,80})/gi,
  // Impératifs de paiement / démarche — pas les négations (filtrées à part)
  /\b((?:r[eé]glez|effectuez|retournez|transmettez|envoyez|compl[eé]tez|joignez|mettez\s+[aà]\s+jour)\s+[^.\n]{5,80})/gi
];
function isNonObligatoryLine(line) {
  const lex2 = normalizeLex(line);
  if (/\baucun\b|\baucune\b|\bne\s+pas\b|\bn['’]est\s+pas\b|\bne\s+doit\b|\bne\s+retournez\b|\bne\s+transmettez\b/.test(
    lex2
  )) {
    return true;
  }
  if (/\bvous\s+pouvez\b/.test(lex2) && !/\bvous\s+devez\b/.test(lex2)) {
    return true;
  }
  if (/\bsera\s+disponible\b|\bdisponible\s+[aà]\s+partir\b/.test(lex2)) {
    return true;
  }
  if (/\btrouver\s+(ci[-\s]?joint|en\s+annexe|ci[-\s]?apres)\b|\bci[-\s]?joint\b/.test(
    lex2
  )) {
    return true;
  }
  if (/prelevement\s+automatique|sera\s+prelev|preleve\s+automatiquement|mandat\s+sepa\s+actif|paiement\s+par\s+prelevement/.test(
    lex2
  ) && !/\breglez\b|\beffectuez\b|\bretournez\b|\bmettez\s+[aà]\s+jour\b|\btransmettez\b/.test(
    lex2
  )) {
    return true;
  }
  if (/rien\s+a\s+faire|n['’]avez\s+rien\s+a\s+faire|sera\s+rembourse|nous\s+vous\s+rembourser/.test(
    lex2
  ) && !/\breglez\b|\beffectuez\b|\bretournez\b|\btransmettez\b/.test(lex2)) {
    return true;
  }
  return false;
}
function extractActionHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (isNonObligatoryLine(line)) continue;
    for (const re of ACTION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const phrase = (m[1] || m[0]).replace(/\s+/g, " ").trim();
        if (phrase.length < 5) continue;
        hits.push({
          type: "action",
          value: phrase,
          raw: m[0].trim(),
          match: {
            blockIndex: i,
            start: m.index,
            end: m.index + m[0].length,
            raw: m[0].trim()
          }
        });
      }
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/address.ts
var ADDRESS_RE = /\b(\d{1,4}\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av\.|bd|boulevard|chemin|impasse|place|allee|allée)\s+[^\n,]{3,40})[,\s]+(\d{5})\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇ \-']{2,40})/gi;
var CP_CITY_RE = /\b(\d{5})\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇ \-']{2,40})\b/g;
function extractAddressHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    ADDRESS_RE.lastIndex = 0;
    let m;
    let foundFull = false;
    while ((m = ADDRESS_RE.exec(line)) !== null) {
      foundFull = true;
      const value = `${m[1]}, ${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim();
      hits.push({
        type: "address",
        value,
        raw: m[0].trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0].trim()
        }
      });
    }
    if (foundFull) continue;
    if (!/adresse|domicile|siege|siège/i.test(line) && !/adresse|domicile/i.test(blocks[i - 1]?.text || "")) {
      continue;
    }
    CP_CITY_RE.lastIndex = 0;
    while ((m = CP_CITY_RE.exec(line)) !== null) {
      const value = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
      hits.push({
        type: "address",
        value,
        raw: m[0].trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0].trim()
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/banking.ts
var IBAN_RE = /\b([A-Z]{2}\d{2}(?:[ \u00a0]?[A-Z0-9]{4}){2,8}[A-Z0-9]{0,4})\b/g;
var BIC_RE = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;
function extractIbanHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    IBAN_RE.lastIndex = 0;
    let m;
    while ((m = IBAN_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length < 15 || compact.length > 34) continue;
      if (!/^FR/i.test(compact) && !/^[A-Z]{2}\d{2}/.test(compact)) continue;
      hits.push({
        type: "iban",
        value: compact.toUpperCase(),
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}
function extractBicHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (!/\bbic\b/i.test(line)) continue;
    BIC_RE.lastIndex = 0;
    let m;
    while ((m = BIC_RE.exec(line)) !== null) {
      if (/^(IBAN|TOTAL|FACTURE)$/i.test(m[1])) continue;
      hits.push({
        type: "bic",
        value: m[1].toUpperCase(),
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/companyIds.ts
var SIRET_RE = /\b(\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{5})\b/g;
var SIREN_RE = /\b(?:siren|siret)?\s*[:\s]*(\d{3}[ \u00a0]?\d{3}[ \u00a0]?\d{3})\b/gi;
function extractSiretHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (!/siret/i.test(line) && !/\d{14}/.test(line.replace(/\s/g, ""))) {
    }
    SIRET_RE.lastIndex = 0;
    let m;
    while ((m = SIRET_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length !== 14) continue;
      if (!/siret/i.test(line) && !/siret/i.test(blocks[i - 1]?.text || "")) {
        continue;
      }
      hits.push({
        type: "siret",
        value: compact,
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}
function extractSirenHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (!/siren\b/i.test(line)) continue;
    SIREN_RE.lastIndex = 0;
    let m;
    while ((m = SIREN_RE.exec(line)) !== null) {
      const compact = m[1].replace(/[\s\u00a0]/g, "");
      if (compact.length !== 9) continue;
      hits.push({
        type: "siren",
        value: compact,
        raw: m[1],
        match: {
          blockIndex: i,
          start: m.index + m[0].indexOf(m[1]),
          end: m.index + m[0].indexOf(m[1]) + m[1].length,
          raw: m[1]
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/contact.ts
var EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
var PHONE_RE = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
function extractEmailHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    EMAIL_RE.lastIndex = 0;
    let m;
    while ((m = EMAIL_RE.exec(line)) !== null) {
      hits.push({
        type: "email",
        value: m[0].toLowerCase(),
        raw: m[0],
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0]
        }
      });
    }
  }
  return hits;
}
function extractPhoneHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    PHONE_RE.lastIndex = 0;
    let m;
    while ((m = PHONE_RE.exec(line)) !== null) {
      const raw = m[0];
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10) continue;
      hits.push({
        type: "phone",
        value: digits,
        raw,
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + raw.length,
          raw
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/date.ts
var DATE_NUM_RE = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/g;
var DATE_NAMED_RE = /\b(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/gi;
function extractDateHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    for (const re of [DATE_NUM_RE, DATE_NAMED_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        const value = parseFrenchDate(raw);
        if (!value) continue;
        hits.push({
          type: "date",
          value,
          raw,
          match: {
            blockIndex: i,
            start: m.index,
            end: m.index + raw.length,
            raw
          }
        });
      }
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/identity.ts
var CIVILITIES = /\b(m\.?|mme|mlle|mr|monsieur|madame|mademoiselle)\s+([A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇéèêàâîïôûùç'’\-]+(?:\s+[A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Za-zÉÈÊÀÂÎÏÔÛÙÇéèêàâîïôûùç'’\-]+){0,3})/gi;
var ORG_RE = /\b((?:SAS|SARL|SA|SCI|EURL|SNC|SASU)\s+[A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ][A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ &\-'’]{2,60}|\b[A-ZÉÈÊÀÂÎÏÔÛÙÇ][A-Z0-9ÉÈÊÀÂÎÏÔÛÙÇ &\-'’]{2,40}\s+(?:SAS|SARL|SA|SCI|EURL))\b/g;
function isNumericId(value) {
  return /^\d{5,}$/.test(value.replace(/\s/g, ""));
}
function looksLikeClientNumberContext(line) {
  const lex2 = normalizeLex(line);
  return /n[°o]?\s*client|numero\s+client|id\s+client|compte\s+client/.test(lex2);
}
function extractPersonHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    if (looksLikeClientNumberContext(line)) continue;
    CIVILITIES.lastIndex = 0;
    let m;
    while ((m = CIVILITIES.exec(line)) !== null) {
      const value = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
      if (isNumericId(m[2])) continue;
      hits.push({
        type: "person",
        value,
        raw: m[0].trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: m[0].trim()
        }
      });
    }
  }
  return hits;
}
function extractOrganizationHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    ORG_RE.lastIndex = 0;
    let m;
    while ((m = ORG_RE.exec(line)) !== null) {
      const value = m[1].replace(/\s+/g, " ").trim();
      if (value.length < 3) continue;
      hits.push({
        type: "organization",
        value,
        raw: value,
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + m[0].length,
          raw: value
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/labeledEntities.ts
var LABELED = [
  {
    re: /(?:emetteur|émetteur|expediteur|expéditeur)\s*[:\-]\s*(.+)$/i,
    type: "organization",
    hint: "issuer"
  },
  {
    re: /(?:destinataire|adresse\s*a|adressé\s*a|adressee?\s*a)\s*[:\-]\s*(.+)$/i,
    type: "person",
    hint: "recipient"
  },
  {
    re: /(?:client|pour)\s*[:\-]\s*((?:m\.?|mme|mr|monsieur|madame)\s+.+)$/i,
    type: "person",
    hint: "recipient"
  },
  {
    re: /(?:societe|société|organisme|entreprise)\s*[:\-]\s*(.+)$/i,
    type: "organization",
    hint: "issuer"
  }
];
function extractLabeledEntityHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text.trim();
    for (const def of LABELED) {
      const m = line.match(def.re);
      if (!m) continue;
      let value = m[1].replace(/\s+/g, " ").trim();
      if (!value || value.length < 2) continue;
      if (def.type === "person" && /^société\b|^societe\b/i.test(value)) {
        hits.push({
          type: "organization",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: line.indexOf(value),
            end: line.indexOf(value) + value.length,
            raw: value
          }
        });
        continue;
      }
      if (def.type === "person" && !/^\d+$/.test(value)) {
        hits.push({
          type: "person",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: Math.max(0, line.toLowerCase().indexOf(value.toLowerCase())),
            end: Math.max(0, line.toLowerCase().indexOf(value.toLowerCase())) + value.length,
            raw: value
          }
        });
        continue;
      }
      if (def.type === "organization") {
        hits.push({
          type: "organization",
          value,
          raw: m[0],
          match: {
            blockIndex: i,
            start: Math.max(0, line.indexOf(value)),
            end: Math.max(0, line.indexOf(value)) + value.length,
            raw: value
          }
        });
      }
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/money.ts
var MONEY_RE = /(?<![\w.])(\d{1,3}(?:[ .\u00a0]\d{3})+,\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:\s*(?:€|eur|euros?))?/gi;
function extractMoneyHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    MONEY_RE.lastIndex = 0;
    let m;
    while ((m = MONEY_RE.exec(line)) !== null) {
      const raw = m[0];
      const after = line.slice(m.index + raw.length, m.index + raw.length + 4);
      if (/^\s*%/.test(after)) continue;
      const hasCurrency = /€|eur/i.test(raw);
      const hasDecimals = /[.,]\d{1,2}/.test(raw);
      if (!hasCurrency && !hasDecimals) continue;
      const value = parseFrenchMoney(raw);
      if (value == null) continue;
      hits.push({
        type: "money",
        value,
        raw: raw.trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + raw.length,
          raw: raw.trim()
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/percentage.ts
var PCT_RE = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g;
function extractPercentageHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    PCT_RE.lastIndex = 0;
    let m;
    while ((m = PCT_RE.exec(line)) !== null) {
      const raw = m[0];
      const value = parseFrenchPercentage(raw);
      if (value == null) continue;
      hits.push({
        type: "percentage",
        value,
        raw: raw.trim(),
        match: {
          blockIndex: i,
          start: m.index,
          end: m.index + raw.length,
          raw: raw.trim()
        }
      });
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/reference.ts
var REF_PATTERNS = [
  {
    re: /n[°oº]\s*client\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "client"
  },
  {
    re: /n[°oº]\s*(?:de\s*)?facture\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "facture"
  },
  {
    re: /(?:ref(?:erence)?|dossier)\s*[:\s#-]*\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    label: "ref"
  }
];
function extractReferenceHits(blocks) {
  const hits = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i].text;
    for (const { re } of REF_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const value = m[1].trim();
        if (/^\d{1,2}[\/.\-]\d{1,2}/.test(value)) continue;
        const start = m.index + m[0].indexOf(m[1]);
        hits.push({
          type: "reference",
          value,
          raw: m[0].trim(),
          match: {
            blockIndex: i,
            start,
            end: start + m[1].length,
            raw: value
          }
        });
      }
    }
    const lex2 = normalizeLex(line);
    if (/n[°o]?\s*client/.test(lex2)) {
      const num2 = line.match(/\b(\d{6,})\b/);
      if (num2) {
        const already = hits.some(
          (h) => h.type === "reference" && h.value === num2[1]
        );
        if (!already) {
          hits.push({
            type: "reference",
            value: num2[1],
            raw: num2[1],
            match: {
              blockIndex: i,
              start: num2.index || 0,
              end: (num2.index || 0) + num2[1].length,
              raw: num2[1]
            }
          });
        }
      }
    }
  }
  return hits;
}

// lib/v4/candidates/extractors/CandidateExtractor.ts
var EXTRACTORS = [
  extractMoneyHits,
  extractPercentageHits,
  extractDateHits,
  extractReferenceHits,
  extractEmailHits,
  extractPhoneHits,
  extractIbanHits,
  extractBicHits,
  extractSiretHits,
  extractSirenHits,
  extractLabeledEntityHits,
  extractPersonHits,
  extractOrganizationHits,
  extractAddressHits,
  extractActionHits
];
function hitKey(hit) {
  return `${hit.type}|${String(hit.value)}|${hit.match.blockIndex}|${hit.match.start}`;
}
function toCandidate(hit, blocks) {
  const block = blocks[hit.match.blockIndex];
  const context = buildContext(blocks, hit.match);
  const evidence = [
    {
      text: context.sameLine.trim() || hit.raw,
      page: block?.page ?? 1,
      bbox: block?.bbox ?? null,
      blockId: block?.id ?? null,
      lineId: block?.lineId ?? null
    }
  ];
  return {
    id: nextCandidateId(hit.type),
    type: hit.type,
    value: hit.value,
    raw: hit.raw,
    hypotheses: [],
    evidence,
    page: block?.page ?? 1,
    blockIds: block ? [block.id] : [],
    bbox: block?.bbox ?? null,
    context
  };
}
var CandidateExtractor = class {
  extractors;
  constructor(options = {}) {
    this.extractors = [...EXTRACTORS, ...options.extraExtractors || []];
  }
  extract(blocks) {
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    for (const extract of this.extractors) {
      for (const hit of extract(blocks)) {
        const key = hitKey(hit);
        if (seen.has(key)) continue;
        if (hit.type === "person") {
          const asRef = [...seen].some(
            (k) => k.startsWith(`reference|${String(hit.value)}|`)
          );
          if (asRef) continue;
          if (/^\d+$/.test(String(hit.value).replace(/\s/g, ""))) continue;
        }
        seen.add(key);
        candidates.push(toCandidate(hit, blocks));
      }
    }
    return candidates;
  }
};

// lib/v4/candidates/hypothesis/roles.ts
var ROLES_BY_TYPE = {
  money: [
    "refundAmount",
    "amountDue",
    "amountTTC",
    "amountHT",
    "vatAmount",
    "amountPaid",
    "linePrice",
    "offerPrice",
    "capitalSocial",
    "balance",
    "netToPay",
    "other"
  ],
  percentage: ["vatRate", "discountRate", "other"],
  date: [
    "invoiceDate",
    "dueDate",
    "refundDate",
    "paymentDate",
    "documentDate",
    "deadline",
    "other"
  ],
  person: ["recipient", "sender", "signatory", "other"],
  organization: ["issuer", "recipientOrg", "legalIssuer", "other"],
  reference: [
    "clientNumber",
    "invoiceNumber",
    "accountIdentifier",
    "dossierReference",
    "other"
  ],
  email: ["contactEmail", "other"],
  phone: ["contactPhone", "other"],
  iban: ["paymentIban", "accountIban", "other"],
  bic: ["paymentBic", "other"],
  siren: ["companySiren", "other"],
  siret: ["companySiret", "other"],
  address: ["postalAddress", "issuerAddress", "other"],
  accountNumber: ["accountIdentifier", "other"],
  invoiceNumber: ["invoiceNumber", "other"],
  period: ["fiscalPeriod", "billingPeriod", "other"],
  deadline: ["deadline", "other"],
  documentTitle: ["documentTitle", "other"],
  sectionTitle: ["sectionTitle", "other"],
  action: ["requestedAction", "other"],
  obligation: ["obligation", "other"],
  warning: ["warning", "other"],
  table: ["amountTable", "other"]
};

// lib/v4/types/confidence.ts
var CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.55
};
function toConfidence(score) {
  const s = clamp01(score);
  let level = "low";
  if (s >= CONFIDENCE_THRESHOLDS.high) level = "high";
  else if (s >= CONFIDENCE_THRESHOLDS.medium) level = "medium";
  return { score: s, level };
}
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

// lib/v4/candidates/weights.ts
var SCORE_WEIGHTS = {
  // —— Labels spatiaux ——
  sameLineLabel: 0.55,
  previousLineLabel: 0.35,
  nextLineLabel: 0.22,
  nearLabelProximity: 0.17,
  // —— Unités / forme ——
  currencyEur: 0.1,
  percentUnit: 0.12,
  moneyDecimals: 0.08,
  // —— Structure ——
  sameBlock: 0.08,
  sameColumn: 0.12,
  sameTable: 0.15,
  // —— Lexical positif générique ——
  totalKeyword: 0.18,
  payableKeyword: 0.2,
  referenceKeyword: 0.45,
  clientNumberKeyword: 0.5,
  vatRateKeyword: 0.5,
  vatAmountKeyword: 0.4,
  htKeyword: 0.55,
  ttcKeyword: 0.55,
  dateKeyword: 0.35,
  personCivility: 0.4,
  organizationLegalForm: 0.45,
  ibanKeyword: 0.5,
  addressPostalCode: 0.35,
  // —— Négatifs ——
  capitalSocialPenalty: -0.7,
  plafondPenalty: -0.45,
  exemplePenalty: -0.5,
  tarifIndicatifPenalty: -0.4,
  ancienMontantPenalty: -0.35,
  alreadyPaidPenalty: -0.55,
  resteAPayerBoost: 0.45,
  refundKeyword: 0.55,
  explanatoryComponentPenalty: -0.65,
  refundNotDuePenalty: -0.75,
  illustratifPenalty: -0.65,
  percentAsMoneyPenalty: -0.8,
  numericAsPersonPenalty: -0.9,
  largeRoundCapitalLike: -0.25,
  // —— Base selon type ——
  baseMoney: 0.12,
  basePercentage: 0.15,
  baseDate: 0.15,
  baseReference: 0.2,
  basePerson: 0.1,
  baseOrganization: 0.1,
  baseIban: 0.25,
  baseSiren: 0.2,
  baseSiret: 0.22,
  baseEmail: 0.3,
  basePhone: 0.25,
  baseAddress: 0.15
};

// lib/v4/candidates/hypothesis/scorer.ts
function pushReason(reasons, signal, delta) {
  if (!delta) return;
  reasons.push({ signal, delta });
}
function sumScore(reasons) {
  const total = reasons.reduce((acc, r) => acc + r.delta, 0);
  return clamp01(total);
}
function lex(ctx) {
  return {
    same: normalizeLex(ctx.sameLine),
    prev: normalizeLex(ctx.previousLine),
    next: normalizeLex(ctx.nextLine),
    before: normalizeLex(ctx.before),
    after: normalizeLex(ctx.after),
    blob: normalizeLex(contextBlob(ctx))
  };
}
function labelHit(reasons, L, pattern, signalBase, weightSame = SCORE_WEIGHTS.sameLineLabel, weightPrev = SCORE_WEIGHTS.previousLineLabel, weightNext = SCORE_WEIGHTS.nextLineLabel) {
  let hit = false;
  if (pattern.test(L.same) || pattern.test(L.before) || pattern.test(L.after)) {
    pushReason(reasons, `sameLineLabel:${signalBase}`, weightSame);
    hit = true;
  } else if (pattern.test(L.prev)) {
    pushReason(reasons, `previousLineLabel:${signalBase}`, weightPrev);
    hit = true;
  } else if (pattern.test(L.next)) {
    pushReason(reasons, `nextLineLabel:${signalBase}`, weightNext);
    hit = true;
  }
  return hit;
}
function localTaxZone(L) {
  return `${L.before.slice(-40)} ${L.after.slice(0, 40)}`;
}
function applyNegativeMoneyContext(reasons, L, role) {
  const invoiceLike = [
    "amountHT",
    "amountTTC",
    "amountDue",
    "refundAmount",
    "vatAmount",
    "netToPay",
    "linePrice",
    "offerPrice"
  ].includes(role);
  if (/capital\s+social|au\s+capital/.test(L.blob)) {
    if (role === "capitalSocial") {
      pushReason(reasons, "positive:capitalSocial", SCORE_WEIGHTS.sameLineLabel);
    } else if (invoiceLike) {
      pushReason(
        reasons,
        "negative:capitalSocial",
        SCORE_WEIGHTS.capitalSocialPenalty
      );
    }
  }
  if (/plafond/.test(L.blob) && invoiceLike) {
    pushReason(reasons, "negative:plafond", SCORE_WEIGHTS.plafondPenalty);
  }
  if (/\bexemple\b|par\s+exemple/.test(L.blob) && invoiceLike) {
    pushReason(reasons, "negative:exemple", SCORE_WEIGHTS.exemplePenalty);
  }
  if (/titre\s+d['’]?exemple|a\s+titre\s+illustratif|uniquement\s+a\s+titre|montants?\s+sont\s+donnes/.test(
    L.blob
  ) && invoiceLike) {
    pushReason(reasons, "negative:illustratif", SCORE_WEIGHTS.illustratifPenalty);
  }
  if (/tarif\s+indicatif|prix\s+indicatif/.test(L.blob) && invoiceLike) {
    pushReason(
      reasons,
      "negative:tarifIndicatif",
      SCORE_WEIGHTS.tarifIndicatifPenalty
    );
  }
  if (/ancien\s+montant|ancien\s+solde|solde\s+anterieur/.test(L.blob) && invoiceLike) {
    pushReason(
      reasons,
      "negative:ancienMontant",
      SCORE_WEIGHTS.ancienMontantPenalty
    );
  }
  if ((role === "amountDue" || role === "amountTTC" || role === "netToPay") && /deja\s+(paye|prelev)|acompte|sous[-\s]?total|remise\b|mensualit/.test(L.same)) {
    pushReason(reasons, "negative:alreadyPaidOrPartial", SCORE_WEIGHTS.alreadyPaidPenalty);
  }
  const explanatoryComponent = /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement|contribution\s+au\s+service/.test(
    L.same
  );
  if (explanatoryComponent) {
    if (role === "amountHT" || role === "amountTTC" || role === "amountDue" || role === "netToPay" || role === "refundAmount" || role === "amountPaid") {
      pushReason(
        reasons,
        "negative:explanatoryComponent",
        SCORE_WEIGHTS.explanatoryComponentPenalty
      );
    } else if (role === "linePrice") {
      pushReason(reasons, "positive:componentLine", 0.35);
    }
  }
  if ((role === "amountDue" || role === "netToPay") && /rembours|solde\s+crediteur|a\s+votre\s+credit|rien\s+a\s+faire/.test(L.blob)) {
    pushReason(
      reasons,
      "negative:refundNotDue",
      SCORE_WEIGHTS.refundNotDuePenalty
    );
  }
}
function scoreMoneyRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  if (!ctx) {
    pushReason(reasons, "base:money", SCORE_WEIGHTS.baseMoney);
    return { role, score: sumScore(reasons), reasons };
  }
  const L = lex(ctx);
  pushReason(reasons, "base:money", SCORE_WEIGHTS.baseMoney);
  if (/€|eur/.test(normalizeLex(candidate.raw || "")) || /€|eur/.test(L.same)) {
    pushReason(reasons, "currency:EUR", SCORE_WEIGHTS.currencyEur);
  }
  if (typeof candidate.value === "number" && Number.isInteger(candidate.value) === false) {
    pushReason(reasons, "form:decimals", SCORE_WEIGHTS.moneyDecimals);
  }
  if (role === "amountHT") {
    const zone = localTaxZone(L);
    const htLocal = /\bhtva\b|\bht\b|hors\s*taxes?/.test(zone);
    const ttcLocal = /\bttc\b|toutes\s*taxes/.test(zone);
    if (htLocal && !ttcLocal) {
      pushReason(reasons, "localLabel:HT", SCORE_WEIGHTS.sameLineLabel);
    } else if (htLocal && ttcLocal) {
      if (/^\s*(€|eur)?\s*(htva|\bht\b)/i.test(L.after) || /(htva|\bht\b)\s*$/i.test(L.before)) {
        pushReason(reasons, "localLabel:HT:adjacent", SCORE_WEIGHTS.sameLineLabel);
      } else if (/^\s*(€|eur)?\s*ttc/i.test(L.after)) {
        pushReason(reasons, "negative:localTTCnotHT", -0.55);
      } else {
        labelHit(reasons, L, /\bhtva\b|\bht\b|hors\s*taxes?|net\s+ht/, "HT", 0.25, 0.2, 0.1);
      }
    } else {
      labelHit(reasons, L, /\bhtva\b|\bht\b|hors\s*taxes?|net\s+ht/, "HT");
    }
    if (/sous[-\s]?total|remise\b|acheminement|services?\b|abonnement/.test(L.same)) {
      pushReason(reasons, "negative:partialHt", -0.45);
    }
    if (/net\s+ht|total\s+htva|total\s+ht\b/.test(L.same)) {
      pushReason(reasons, "lexical:netHT", 0.2);
    }
    if ((/\btva\b/.test(L.next) || /\btva\b/.test(L.prev)) && !/^\s*tva\b/.test(L.same) && /\bhtva\b|\bht\b|hors\s*taxes?|total\s+ht/.test(L.same)) {
      pushReason(reasons, "nearVATBlock", SCORE_WEIGHTS.nearLabelProximity);
    }
  } else if (role === "amountTTC") {
    const zone = localTaxZone(L);
    const htLocal = /\bhtva\b|\bht\b|hors\s*taxes?/.test(zone);
    const ttcLocal = /\bttc\b|toutes\s*taxes/.test(zone);
    if (ttcLocal && !htLocal) {
      pushReason(reasons, "localLabel:TTC", SCORE_WEIGHTS.sameLineLabel);
    } else if (ttcLocal && htLocal) {
      if (/^\s*(€|eur)?\s*ttc/i.test(L.after) || /\bttc\s*$/i.test(L.before)) {
        pushReason(reasons, "localLabel:TTC:adjacent", SCORE_WEIGHTS.sameLineLabel);
      } else if (/^\s*(€|eur)?\s*(htva|\bht\b)/i.test(L.after)) {
        pushReason(reasons, "negative:localHTnotTTC", -0.55);
      } else {
        labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC", 0.25, 0.2, 0.1);
      }
    } else {
      labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC");
    }
    if ((/\btotal\b/.test(L.same) || /\btotal\b/.test(L.before)) && !/represente|sur\s+cette\s+facture|acheminement|reseaux?\s+publics/.test(L.blob)) {
      pushReason(reasons, "lexical:total", SCORE_WEIGHTS.totalKeyword);
    }
  } else if (role === "refundAmount") {
    labelHit(
      reasons,
      L,
      /rembourser|remboursement|nous\s+vous\s+rembourser|solde\s+crediteur|a\s+votre\s+credit|montant\s+rembourse|sera\s+rembourse/,
      "refund",
      SCORE_WEIGHTS.sameLineLabel,
      SCORE_WEIGHTS.previousLineLabel * 0.5,
      0
    );
    if (/nous\s+vous\s+rembourser|rembourserons|remboursement\b|sera\s+rembourse/.test(
      L.same
    )) {
      pushReason(reasons, "lexical:refund", SCORE_WEIGHTS.refundKeyword);
    }
    if (/mensualit|deja\s+(paye|prelev|facture)|paiements?\s+anterieurs/.test(L.same)) {
      pushReason(reasons, "negative:mensualitesNotRefund", -0.85);
    }
  } else if (role === "amountPaid") {
    labelHit(
      reasons,
      L,
      /mensualit|deja\s+(paye|prelev|facture)|paiements?\s+(anterieurs|factures)|acomptes?\s+factures/,
      "paid"
    );
    if (/mensualit/.test(L.same)) {
      pushReason(reasons, "lexical:mensualites", 0.35);
    }
  } else if (role === "amountDue") {
    labelHit(
      reasons,
      L,
      /reste\s+a\s+payer|montant\s+restant|net\s*a\s*payer|somme\s*a\s*payer|devez\s+regler|(?<!deja\s+)a\s*payer/,
      "payable",
      SCORE_WEIGHTS.sameLineLabel,
      SCORE_WEIGHTS.previousLineLabel,
      0
    );
    if (/reste\s+a\s+payer|montant\s+restant\s+du/.test(L.same)) {
      pushReason(reasons, "lexical:resteAPayer", SCORE_WEIGHTS.resteAPayerBoost);
    } else if (/(?<!deja\s+)a\s*payer|devez\s+regler/.test(L.same)) {
      pushReason(reasons, "lexical:aPayer", SCORE_WEIGHTS.payableKeyword);
    }
    if (/montant\s+(du\s+)?prelevement|prelevement\s+de/.test(L.same) && !/deja\s+prelev|rembours/.test(L.blob)) {
      pushReason(reasons, "lexical:prelevementDue", SCORE_WEIGHTS.payableKeyword);
    }
    if (/prelevement\s+automatique/.test(L.blob) && /rembours|rien\s+a\s+faire/.test(L.blob)) {
      pushReason(reasons, "negative:directDebitMethodNotOutgoing", -0.55);
    }
    if (/\bttc\b/.test(L.same) && !/a\s*payer|restant|du\b|regler/.test(L.same)) {
      pushReason(reasons, "lexical:totalTtcAsDue", SCORE_WEIGHTS.totalKeyword * 0.35);
    }
  } else if (role === "vatAmount") {
    if (candidate.type === "percentage") {
      pushReason(
        reasons,
        "negative:percentAsMoney",
        SCORE_WEIGHTS.percentAsMoneyPenalty
      );
    } else {
      const vatCue = /\btva\b|\btva\d|\bvat\b|montant\s+tva/;
      const vatLocal = vatCue.test(
        `${L.before.slice(-30)} ${L.after.slice(0, 30)} ${L.same}`
      );
      if (vatLocal && vatCue.test(L.same)) {
        pushReason(reasons, "sameLineLabel:TVA", SCORE_WEIGHTS.sameLineLabel);
      } else if (vatCue.test(L.prev) && !/\btotal\b|\bttc\b|\bhtva\b|\bht\b|rembours|mensualit/.test(L.same)) {
        pushReason(
          reasons,
          "previousLineLabel:TVA",
          SCORE_WEIGHTS.previousLineLabel * 0.5
        );
      }
      if (/\bht\b|\bhtva\b|hors\s*taxes?/.test(L.same) && !vatCue.test(L.same)) {
        pushReason(reasons, "negative:htLineNotVat", -0.6);
      }
      if (/%/.test(L.same) && /\btva\b/.test(L.same)) {
        pushReason(reasons, "nearVATRate", SCORE_WEIGHTS.nearLabelProximity);
      }
      if (/\btotal\b|\bttc\b|\bhtva\b|net\s+ht|sous[-\s]?total|remise\b|deja\s+(paye|prelev)|rembours|mensualit|represente/.test(
        L.same
      )) {
        pushReason(reasons, "negative:nonVatLine", -0.55);
      }
    }
  } else if (role === "linePrice") {
    labelHit(reasons, L, /prix\s*unitaire|\bpu\b|ligne|detail/, "line");
  } else if (role === "offerPrice") {
    labelHit(reasons, L, /\boffre\b|forfait|abonnement|promo/, "offer");
  } else if (role === "capitalSocial") {
    labelHit(reasons, L, /capital\s+social|au\s+capital/, "capital");
  } else if (role === "balance") {
    labelHit(reasons, L, /\bsolde\b/, "balance");
  } else if (role === "netToPay") {
    labelHit(reasons, L, /net\s*a\s*payer/, "net");
  } else if (role === "other") {
    pushReason(reasons, "base:other", 0.05);
  }
  applyNegativeMoneyContext(reasons, L, role);
  if (typeof candidate.value === "number" && candidate.value >= 1e5 && Number.isInteger(candidate.value) && (role === "amountTTC" || role === "amountDue" || role === "amountHT")) {
    pushReason(
      reasons,
      "negative:largeRoundCapitalLike",
      SCORE_WEIGHTS.largeRoundCapitalLike
    );
  }
  return { role, score: sumScore(reasons), reasons };
}
function scorePercentageRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:percentage", SCORE_WEIGHTS.basePercentage);
  pushReason(reasons, "unit:percent", SCORE_WEIGHTS.percentUnit);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "vatRate") {
    labelHit(reasons, L, /\btva\b|\bvat\b|taux/, "TVA");
    pushReason(reasons, "notMoneyAmount", 0.1);
  } else if (role === "discountRate") {
    labelHit(reasons, L, /remise|rabais|reduction/, "discount");
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreReferenceRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:reference", SCORE_WEIGHTS.baseReference);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "clientNumber") {
    if (/n[°o]?\s*client|numero\s+client/.test(L.same) || /n[°o]?\s*client/.test(L.prev)) {
      pushReason(
        reasons,
        "sameLineLabel:clientNumber",
        SCORE_WEIGHTS.clientNumberKeyword
      );
    }
  } else if (role === "invoiceNumber") {
    labelHit(reasons, L, /n[°o]?\s*(de\s*)?facture|facture\s*n/, "invoiceNumber");
  } else if (role === "accountIdentifier") {
    labelHit(reasons, L, /n[°o]?\s*compte|identifiant/, "accountId");
  } else if (role === "dossierReference") {
    labelHit(reasons, L, /dossier|reference|ref\b/, "dossier");
  }
  pushReason(reasons, "notPerson", 0.05);
  return { role, score: sumScore(reasons), reasons };
}
function scorePersonRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:person", SCORE_WEIGHTS.basePerson);
  const value = String(candidate.value || "");
  if (/^\d+$/.test(value.replace(/\s/g, ""))) {
    pushReason(
      reasons,
      "negative:numericAsPerson",
      SCORE_WEIGHTS.numericAsPersonPenalty
    );
  }
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (/n[°o]?\s*client/.test(L.blob)) {
    pushReason(
      reasons,
      "negative:clientNumberContext",
      SCORE_WEIGHTS.numericAsPersonPenalty
    );
  }
  if (/\b(m\.?|mme|mr|monsieur|madame)\b/.test(L.same)) {
    pushReason(reasons, "civility", SCORE_WEIGHTS.personCivility);
  }
  if (role === "recipient") {
    labelHit(reasons, L, /client|destinataire|vos\s+coordonnees|adressees?\s+a/, "recipient");
  } else if (role === "sender") {
    labelHit(reasons, L, /emetteur|expediteur|de la part/, "sender");
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreOrganizationRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:organization", SCORE_WEIGHTS.baseOrganization);
  if (/\b(sas|sarl|sa|sci|eurl)\b/i.test(String(candidate.value))) {
    pushReason(reasons, "legalForm", SCORE_WEIGHTS.organizationLegalForm);
  }
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "legalIssuer") {
    labelHit(reasons, L, /mentions\s+legales|rcs|siren|siret/, "legal");
  } else if (role === "issuer") {
    labelHit(reasons, L, /emetteur|facture\s+de|bienvenue\s+chez/, "issuer");
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreDateRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:date", SCORE_WEIGHTS.baseDate);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "invoiceDate") {
    labelHit(reasons, L, /date\s+(de\s+)?facture|date\s+d['’]?emission|emise\s+le/, "invoiceDate");
  } else if (role === "refundDate") {
    labelHit(
      reasons,
      L,
      /rembourser|remboursement|sera\s+rembourse|rembourse\s+le|au\s+\d{1,2}/,
      "refundDate"
    );
    if (/rembourserons?\s+(au|le)|sera\s+rembourse/.test(L.blob)) {
      pushReason(reasons, "lexical:refundDate", 0.35);
    }
  } else if (role === "paymentDate") {
    labelHit(
      reasons,
      L,
      /prelevement|sera\s+prelev|preleve\s+le|date\s+de\s+prelevement|paiement\s+le/,
      "paymentDate"
    );
    if (/rembours/.test(L.blob) && !/sera\s+prelev|preleve\s+automatiquement/.test(L.blob)) {
      pushReason(reasons, "negative:refundNotPaymentDate", -0.5);
    }
  } else if (role === "dueDate" || role === "deadline") {
    labelHit(
      reasons,
      L,
      /echeance|arrive\s+a\s+echeance|a\s+payer\s+avant|au\s+plus\s+tard|avant\s+le|dans\s+un\s+delai|merci\s+de|date\s+limite|limite\s+de\s+paiement|reglez|effectuez\s+le\s+virement/,
      "deadline"
    );
    if ((/prelevement\s+automatique|sera\s+prelev|preleve\s+automatiquement|date\s+de\s+prelevement/.test(
      L.blob
    ) || /rembours/.test(L.blob) && /rien\s+a\s+faire/.test(L.blob)) && !/avant\s+le|a\s+payer\s+avant|reglez|merci\s+de/.test(L.blob)) {
      pushReason(reasons, "negative:autoDebitNotDeadline", -0.6);
    }
    if (/arrive\s+a\s+echeance/.test(L.blob) && role === "deadline") {
      pushReason(reasons, "negative:dueDateNotActionDeadline", -0.35);
    }
  } else if (role === "documentDate") {
    labelHit(reasons, L, /\bdate\b/, "date");
  }
  if ((role === "invoiceDate" || role === "documentDate" || role === "dueDate") && /date\s+de\s+creation|creation\s+de\s+(la\s+)?societe|capital\s+social/.test(
    L.blob
  )) {
    pushReason(reasons, "negative:companyCreationDate", -0.55);
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreActionRole(candidate, role) {
  const reasons = [];
  const ctx = candidate.context;
  pushReason(reasons, "base:action", 0.25);
  if (!ctx) return { role, score: sumScore(reasons), reasons };
  const L = lex(ctx);
  if (role === "requestedAction") {
    if (/merci\s+de|remercions\s+de|veuillez|vous\s+devez|nous\s+vous\s+prions|transmettre/.test(
      L.same
    )) {
      pushReason(reasons, "sameLineLabel:imperative", 0.45);
    }
    if (/avant\s+le|au\s+plus\s+tard|dans\s+un\s+delai/.test(L.same)) {
      pushReason(reasons, "nearDeadlineCue", 0.2);
    }
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreGeneric(candidate, role, baseSignal, baseWeight) {
  const reasons = [];
  pushReason(reasons, baseSignal, baseWeight);
  if (candidate.type === "iban" && role.includes("iban")) {
    pushReason(reasons, "type:iban", SCORE_WEIGHTS.ibanKeyword);
  }
  return { role, score: sumScore(reasons), reasons };
}
function scoreRole(candidate, role) {
  switch (candidate.type) {
    case "money":
      return scoreMoneyRole(candidate, role);
    case "percentage":
      return scorePercentageRole(candidate, role);
    case "reference":
      return scoreReferenceRole(candidate, role);
    case "person":
      return scorePersonRole(candidate, role);
    case "organization":
      return scoreOrganizationRole(candidate, role);
    case "date":
      return scoreDateRole(candidate, role);
    case "action":
      return scoreActionRole(candidate, role);
    case "iban":
      return scoreGeneric(candidate, role, "base:iban", SCORE_WEIGHTS.baseIban);
    case "bic":
      return scoreGeneric(candidate, role, "base:bic", SCORE_WEIGHTS.baseIban);
    case "siren":
      return scoreGeneric(candidate, role, "base:siren", SCORE_WEIGHTS.baseSiren);
    case "siret":
      return scoreGeneric(candidate, role, "base:siret", SCORE_WEIGHTS.baseSiret);
    case "email":
      return scoreGeneric(candidate, role, "base:email", SCORE_WEIGHTS.baseEmail);
    case "phone":
      return scoreGeneric(candidate, role, "base:phone", SCORE_WEIGHTS.basePhone);
    case "address":
      return scoreGeneric(
        candidate,
        role,
        "base:address",
        SCORE_WEIGHTS.baseAddress
      );
    default:
      return scoreGeneric(candidate, role, "base:other", 0.1);
  }
}

// lib/v4/candidates/hypothesis/HypothesisEngine.ts
var HypothesisEngine = class {
  minScore;
  maxHypotheses;
  constructor(options = {}) {
    this.minScore = options.minScore ?? 0.05;
    this.maxHypotheses = options.maxHypotheses ?? 8;
  }
  /**
   * Enrichit les candidats avec des hypothèses scorées (copie shallow).
   */
  assign(candidates) {
    return candidates.map((c) => this.assignOne(c));
  }
  assignOne(candidate) {
    const roles = ROLES_BY_TYPE[candidate.type] || ["other"];
    const hypotheses = roles.map((role) => scoreRole(candidate, role)).filter((h) => h.score >= this.minScore).sort((a, b) => b.score - a.score).slice(0, this.maxHypotheses);
    return {
      ...candidate,
      hypotheses
    };
  }
};

// lib/v4/candidates/pipeline.ts
var CandidatePipeline = class {
  extractor;
  hypothesis;
  constructor(options = {}) {
    this.extractor = new CandidateExtractor(options.extractor);
    this.hypothesis = new HypothesisEngine(options.hypothesis);
  }
  runOnBlocks(blocks) {
    const extracted = this.extractor.extract(blocks);
    const candidates = this.hypothesis.assign(extracted);
    return { blocks: [...blocks], candidates };
  }
  runOnText(text) {
    const blocks = blocksFromPlainText(text);
    return this.runOnBlocks(blocks);
  }
  /** Remplit une DocumentSession (sans destroy). */
  runOnSession(session) {
    const blocks = session.blocks.length > 0 ? session.blocks : blocksFromPlainText(session.rawText || "");
    if (session.blocks.length === 0 && blocks.length) {
      session.setBlocks([...blocks]);
    }
    const { candidates } = this.runOnBlocks(blocks);
    session.setCandidates(candidates);
    return candidates;
  }
};

// lib/v4/classification/context.ts
function buildClassificationContext(input) {
  const text = input.blocks.map((b) => b.text).join("\n");
  const lex2 = normalizeLex(text);
  const structures = detectStructures(lex2, input.candidates, input.relations);
  return {
    text,
    lex: lex2,
    blocks: input.blocks,
    candidates: input.candidates,
    relations: input.relations,
    consistency: input.consistency ?? null,
    structures
  };
}
function detectStructures(lex2, candidates, relations) {
  const hasTransactionTable = /\bsolde\s+precedent\b/.test(lex2) || /\bdebit\b/.test(lex2) && /\bcredit\b/.test(lex2) && (/\blibelle\b/.test(lex2) || /\boperation/.test(lex2)) || /\bnouveau\s+solde\b/.test(lex2) && /\bdate\s+valeur\b/.test(lex2) || /\bmouvements?\b/.test(lex2) && /\bcompte\b/.test(lex2);
  const hasHtTvaTtc = /\bht\b|hors\s*taxes?|hors\s*tva/.test(lex2) && /\btva\b/.test(lex2) && /\bttc\b|toutes\s*taxes/.test(lex2) || relations.some((r) => r.type === "arithmetic");
  const hasLetterFormulas = /\bobjet\s*:/.test(lex2) || /madame[,.]?\s*monsieur/.test(lex2) || /je\s+vous\s+prie/.test(lex2) || /nous\s+vous\s+informons/.test(lex2);
  const hasFormFields = /\bnom\s*:/.test(lex2) && (/\bprenom\s*:/.test(lex2) || /\bdate\s+de\s+naissance/.test(lex2)) && (/\bsignature\b/.test(lex2) || /\bcase\s+a\s+cocher|\b\[[ x]\]/.test(lex2));
  const hasPayslipMarks = /bulletin\s+de\s+(salaire|paie)/.test(lex2) || /salaire\s+(brut|net)/.test(lex2) && /\burssaf\b/.test(lex2);
  const hasContractMarks = /\bcontrat\b/.test(lex2) && (/entre\s+les\s+soussign/.test(lex2) || /article\s+\d/.test(lex2) || /resiliation|préavis|preavis/.test(lex2));
  const hasTaxMarks = /avis\s+d['’]?impot|impot\s+sur\s+le\s+revenu|direction\s+generale\s+des\s+finances|dgfip|revenu\s+fiscal|taxe\s+fonciere|numero\s+fiscal/.test(
    lex2
  );
  const hasFinancialStatementMarks = /bilan|compte\s+de\s+resultat|actif|passif|chiffre\s+d['’]?affaires|liasse\s+fiscale/.test(
    lex2
  );
  const hasCertificateMarks = /attestation|certifie|certificat|je\s+soussigne/.test(lex2);
  const hasReceiptMarks = /\breçu\b|\brecu\b|ticket\s+de\s+caisse|justificatif\s+de\s+paiement/.test(
    lex2
  );
  const hasNoticeMarks = /\bavis\b|\bnotice\b|information\s+importante|porte\s+a\s+votre\s+connaissance/.test(
    lex2
  );
  const hasExplanatoryMarks = /mode\s+d['’]?emploi|comment\s+faire|explication|guide\s+pratique|foire\s+aux\s+questions|\bfaq\b|a\s+titre\s+d['’]?exemple|titre\s+illustratif|montants?\s+sont\s+donnes/.test(
    lex2
  );
  const hasIban = candidates.some((c) => c.type === "iban") || /\biban\b/.test(lex2);
  const hasPrelevement = /prelevement|prélèvement|mandat\s+sepa|sera\s+prelev|preleve\s+automatiquement/.test(
    lex2
  );
  return {
    hasTransactionTable,
    hasHtTvaTtc,
    hasLetterFormulas,
    hasFormFields,
    hasPayslipMarks,
    hasContractMarks,
    hasTaxMarks,
    hasFinancialStatementMarks,
    hasCertificateMarks,
    hasReceiptMarks,
    hasNoticeMarks,
    hasExplanatoryMarks,
    hasIban,
    hasPrelevement
  };
}

// lib/v4/classification/profiles/administrativeLetter.ts
var administrativeLetterProfile = {
  type: "administrativeLetter",
  expectedEntities: ["date", "person", "organization", "action"],
  expectedRelations: ["actionDeadline", "sender", "recipient"],
  expectedStructures: ["hasLetterFormulas"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.8,
      matcher: { kind: "regex", pattern: /\bobjet\s*:/i, label: "lexical:objet" }
    },
    {
      family: "lexical",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /madame[,.]?\s*monsieur/i,
        label: "lexical:madameMonsieur"
      }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /nous\s+vous\s+informons|je\s+vous\s+prie|cordialement/i,
        label: "lexical:formules"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: {
        kind: "structure",
        key: "hasLetterFormulas",
        label: "structure:letter"
      }
    },
    {
      family: "relation",
      weight: 0.7,
      matcher: {
        kind: "relation",
        relationType: "actionDeadline",
        label: "relation:actionDeadline"
      }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "action", min: 1, label: "entity:action" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceStructure"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankStructure"
      }
    }
  ]
};

// lib/v4/classification/profiles/bankStatement.ts
var bankStatementProfile = {
  type: "bankStatement",
  expectedEntities: ["iban", "money", "date"],
  expectedRelations: ["spatial"],
  expectedStructures: ["hasTransactionTable"],
  contradictions: ["invoiceTotals"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /relev[ée]\s+(de\s+)?compte|relev[ée]\s+bancaire/i,
        label: "lexical:releve"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /solde\s+precedent|nouveau\s+solde|solde\s+(crediteur|debiteur)/i,
        label: "lexical:soldes"
      }
    },
    {
      family: "lexical",
      weight: 0.65,
      matcher: {
        kind: "regex",
        pattern: /\bdebit\b|\bcredit\b/i,
        label: "lexical:debitCredit"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /date\s+valeur|\blibelle\b|\boperation/i,
        label: "lexical:operations"
      }
    },
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "structure:transactions"
      }
    },
    {
      family: "entity",
      weight: 0.25,
      matcher: { kind: "entity", entityType: "iban", min: 1, label: "entity:iban" }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "money", min: 3, label: "entity:money\u22653" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 1,
      matcher: {
        kind: "absence",
        key: "hasTransactionTable",
        label: "negative:noTransactionStructure"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceTotalsPresent"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /\bfacture\b/i,
        label: "negative:factureLabel"
      }
    }
  ]
};

// lib/v4/classification/profiles/invoice.ts
var invoiceProfile = {
  type: "invoice",
  expectedEntities: ["money", "percentage", "organization", "reference", "date"],
  expectedRelations: ["arithmetic", "issuer", "recipient"],
  expectedStructures: ["hasHtTvaTtc"],
  contradictions: ["bankTransactionLedger"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /\bfacture(?:\s+d['’]\w+)?\b/i,
        label: "lexical:facture"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /total\s+(hors\s+taxes?|ht)|montant\s+ht|\bht\b/i,
        label: "lexical:HT"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\btva\b|taxes?\s+et\s+contributions?/i,
        label: "lexical:TVA/taxes"
      }
    },
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /total\s+(facture\s+)?ttc|montant\s+total\s+ttc|\bttc\b/i,
        label: "lexical:TTC"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /n[°o]\s*(de\s*)?facture|numero\s+de\s+facture/i,
        label: "lexical:invoiceNumber"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /\bconsommation\b|\bprestation\b|\babonnement\b/i,
        label: "lexical:consommation/prestation"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasHtTvaTtc", label: "structure:HT/TVA/TTC" }
    },
    {
      family: "entity",
      weight: 0.5,
      matcher: { kind: "entity", entityType: "money", min: 2, label: "entity:money\u22652" }
    },
    {
      family: "entity",
      weight: 0.35,
      matcher: {
        kind: "entity",
        entityType: "percentage",
        min: 1,
        label: "entity:percentage"
      }
    },
    {
      family: "relation",
      weight: 0.55,
      matcher: { kind: "relation", relationType: "issuer", label: "relation:issuer" }
    },
    {
      family: "relation",
      weight: 0.45,
      matcher: {
        kind: "relation",
        relationType: "recipient",
        label: "relation:recipient"
      }
    },
    {
      family: "arithmetic",
      weight: 1,
      matcher: { kind: "arithmetic", label: "arithmetic:HT+TVA\u2248TTC" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:transactionLedger"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /solde\s+precedent|nouveau\s+solde|date\s+valeur/i,
        label: "negative:bankSoldes"
      }
    },
    {
      family: "negativeEvidence",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /a\s+titre\s+d['’]?exemple|uniquement\s+[aà]\s+titre\s+illustratif|montants?\s+sont\s+donn[eé]s|guide\s+pratique|mode\s+d['’]?emploi/i,
        label: "negative:illustrativeOrGuide"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.9,
      matcher: {
        kind: "structure",
        key: "hasExplanatoryMarks",
        label: "negative:explanatoryStructure"
      }
    }
  ]
};

// lib/v4/classification/profiles/misc.ts
var contractProfile = {
  type: "contract",
  expectedEntities: ["organization", "person", "date", "money"],
  expectedRelations: ["organizationPerson"],
  expectedStructures: ["hasContractMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.9,
      matcher: { kind: "regex", pattern: /\bcontrat\b|\bconvention\b/i, label: "lexical:contrat" }
    },
    {
      family: "structural",
      weight: 0.85,
      matcher: {
        kind: "structure",
        key: "hasContractMarks",
        label: "structure:contract"
      }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /entre\s+les\s+soussign|article\s+\d|r[eé]siliation|pr[eé]avis/i,
        label: "lexical:clauses"
      }
    }
  ],
  negativeSignals: []
};
var payslipProfile = {
  type: "payslip",
  expectedEntities: ["money", "person", "period"],
  expectedRelations: [],
  expectedStructures: ["hasPayslipMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasPayslipMarks",
        label: "structure:payslip"
      }
    },
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /bulletin\s+de\s+(salaire|paie)|salaire\s+net|salaire\s+brut/i,
        label: "lexical:salaire"
      }
    }
  ],
  negativeSignals: []
};
var formProfile = {
  type: "form",
  expectedEntities: ["person", "address", "phone", "email"],
  expectedRelations: [],
  expectedStructures: ["hasFormFields"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: { kind: "structure", key: "hasFormFields", label: "structure:formFields" }
    },
    {
      family: "lexical",
      weight: 0.9,
      matcher: {
        kind: "regex",
        pattern: /\bformulaire\b/i,
        label: "lexical:formulaire"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\bsignature\b/i,
        label: "lexical:signature"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /case\s+[aà]\s+cocher|\[[ xX]?\]/i,
        label: "lexical:checkbox"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /\bnom\s*:|\bpr[eé]nom\s*:/i,
        label: "lexical:identityFields"
      }
    }
  ],
  negativeSignals: []
};
var certificateProfile = {
  type: "certificate",
  expectedEntities: ["person", "organization", "date"],
  expectedRelations: [],
  expectedStructures: ["hasCertificateMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasCertificateMarks",
        label: "structure:certificate"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /attestation|certificat|je\s+soussign/i,
        label: "lexical:attestation"
      }
    }
  ],
  negativeSignals: []
};
var receiptProfile = {
  type: "receipt",
  expectedEntities: ["money", "date"],
  expectedRelations: [],
  expectedStructures: ["hasReceiptMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: { kind: "structure", key: "hasReceiptMarks", label: "structure:receipt" }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /ticket\s+de\s+caisse|justificatif\s+de\s+paiement|\bre[cç]u\b/i,
        label: "lexical:receipt"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /total\s+ht|total\s+ttc|n[°o]\s*facture/i,
        label: "negative:looksLikeInvoice"
      }
    }
  ]
};
var noticeProfile = {
  type: "notice",
  expectedEntities: ["date", "organization"],
  expectedRelations: [],
  expectedStructures: ["hasNoticeMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasNoticeMarks", label: "structure:notice" }
    },
    {
      family: "lexical",
      weight: 0.75,
      matcher: {
        kind: "regex",
        pattern: /\bavis\b|\bnotice\b|information\s+importante|porte\s+[aà]\s+votre\s+connaissance/i,
        label: "lexical:notice"
      }
    },
    {
      family: "lexical",
      weight: 0.45,
      matcher: {
        kind: "regex",
        pattern: /document\s+[aà]\s+conserver|pour\s+information/i,
        label: "lexical:noticeConserve"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.6,
      matcher: {
        kind: "structure",
        key: "hasHtTvaTtc",
        label: "negative:invoiceTotals"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.45,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankStructure"
      }
    }
  ]
};
var financialStatementProfile = {
  type: "financialStatement",
  expectedEntities: ["money", "organization", "period"],
  expectedRelations: [],
  expectedStructures: ["hasFinancialStatementMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasFinancialStatementMarks",
        label: "structure:financial"
      }
    },
    {
      family: "lexical",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /bilan|compte\s+de\s+r[eé]sultat|liasse\s+fiscale|actif|passif/i,
        label: "lexical:liasse"
      }
    }
  ],
  negativeSignals: []
};
var explanatoryDocumentProfile = {
  type: "explanatoryDocument",
  expectedEntities: [],
  expectedRelations: [],
  expectedStructures: ["hasExplanatoryMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 1,
      matcher: {
        kind: "structure",
        key: "hasExplanatoryMarks",
        label: "structure:explanatory"
      }
    },
    {
      family: "lexical",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /mode\s+d['’]?emploi|guide\s+pratique|\bfaq\b|comment\s+faire/i,
        label: "lexical:guide"
      }
    },
    {
      family: "lexical",
      weight: 0.85,
      matcher: {
        kind: "regex",
        pattern: /a\s+titre\s+d['’]?exemple|uniquement\s+[aà]\s+titre\s+illustratif|montants?\s+sont\s+donn[eé]s\s+uniquement/i,
        label: "lexical:illustrative"
      }
    }
  ],
  negativeSignals: []
};

// lib/v4/classification/profiles/taxDocument.ts
var taxDocumentProfile = {
  type: "taxDocument",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1,
      matcher: {
        kind: "regex",
        pattern: /avis\s+d['’]?imp[oô]t|imp[oô]t\s+sur\s+le\s+revenu|num[eé]ro\s+fiscal|direction\s+g[eé]n[eé]rale\s+des\s+finances|dgfip|taxe\s+fonci[eè]re/i,
        label: "lexical:fiscal"
      }
    },
    {
      family: "structural",
      weight: 0.9,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    },
    {
      family: "entity",
      weight: 0.4,
      matcher: { kind: "entity", entityType: "money", min: 1, label: "entity:money" }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /revenu\s+fiscal|montant\s+[aà]\s+payer|date\s+limite\s+de\s+paiement/i,
        label: "lexical:taxPayment"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankLedger"
      }
    }
  ]
};

// lib/v4/classification/profiles/fiscalSpecialized.ts
var incomeTaxReturnSchemaProfile = {
  type: "incomeTaxReturn",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.1,
      matcher: {
        kind: "regex",
        pattern: /d[eé]claration\s+des\s+revenus|formulaire\s+n[°o]?\s*2042|n[°o]\s*2042\b/i,
        label: "lexical:incomeTaxReturn"
      }
    },
    {
      family: "lexical",
      weight: 0.5,
      matcher: {
        kind: "regex",
        pattern: /foyer\s+fiscal|traitements\s+et\s+salaires|d[eé]clarant/i,
        label: "lexical:returnSections"
      }
    },
    {
      family: "structural",
      weight: 0.5,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /voir\s+votre\s+d[eé]claration\s+2042|reportez[- ]vous\s+[aà]\s+votre\s+d[eé]claration\s+2042|conform[eé]ment\s+[aà]\s+votre\s+d[eé]claration\s+2042/i,
        label: "negative:2042MentionOnly"
      }
    },
    {
      family: "negativeEvidence",
      weight: 0.6,
      matcher: {
        kind: "regex",
        pattern: /avis\s+d['’]?imp[oô]t\s+sur\s+les\s+revenus/i,
        label: "negative:isNoticeNotReturn"
      }
    }
  ]
};
var incomeTaxNoticeSchemaProfile = {
  type: "incomeTaxNotice",
  expectedEntities: ["money", "date", "reference", "person"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.15,
      matcher: {
        kind: "regex",
        pattern: /avis\s+d['’]?imp[oô]t\s+sur\s+le[s]?\s+revenu[s]?|avis\s+d['’]?imposition/i,
        label: "lexical:incomeTaxNotice"
      }
    },
    {
      family: "lexical",
      weight: 0.55,
      matcher: {
        kind: "regex",
        pattern: /revenu\s+fiscal\s+de\s+r[eé]f[eé]rence|pr[eé]l[eè]vement\s+[aà]\s+la\s+source|reste\s+[aà]\s+payer|montant\s+[aà]\s+rembourser/i,
        label: "lexical:noticeFields"
      }
    },
    {
      family: "structural",
      weight: 0.5,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.5,
      matcher: {
        kind: "structure",
        key: "hasTransactionTable",
        label: "negative:bankLedger"
      }
    }
  ]
};
var propertyTaxSchemaProfile = {
  type: "propertyTax",
  expectedEntities: ["money", "date", "reference"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 1.2,
      matcher: {
        kind: "regex",
        pattern: /avis\s+de\s+taxe\s+fonci[eè]re|taxe\s+fonci[eè]re\s+sur\s+les\s+propri[eé]t[eé]s|taxes?\s+fonci[eè]res/i,
        label: "lexical:propertyTax"
      }
    },
    {
      family: "lexical",
      weight: 0.4,
      matcher: {
        kind: "regex",
        pattern: /propri[eé]t[eé]\s+b[aâ]tie|base\s+d['’]?imposition|cotisation/i,
        label: "lexical:propertyParts"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.7,
      matcher: {
        kind: "regex",
        pattern: /\btotal\s+ht\b|\btotal\s+ttc\b|facture\s+n/i,
        label: "negative:invoiceLogic"
      }
    }
  ]
};
var taxFormSchemaProfile = {
  type: "taxForm",
  expectedEntities: ["reference", "date"],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "lexical",
      weight: 0.8,
      matcher: {
        kind: "regex",
        pattern: /2065\s*-?\s*sd|3310\s*-?\s*ca3|2572\s*-?\s*sd|1330\s*-?\s*cvae/i,
        label: "lexical:taxFormRef"
      }
    },
    {
      family: "structural",
      weight: 0.4,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:tax" }
    }
  ],
  negativeSignals: []
};
var unknownTaxDocumentSchemaProfile = {
  type: "unknownTaxDocument",
  expectedEntities: [],
  expectedRelations: [],
  expectedStructures: ["hasTaxMarks"],
  positiveSignals: [
    {
      family: "structural",
      weight: 0.35,
      matcher: { kind: "structure", key: "hasTaxMarks", label: "structure:taxWeak" }
    },
    {
      family: "lexical",
      weight: 0.3,
      matcher: {
        kind: "regex",
        pattern: /imp[oô]t|fiscal|dgfip|finances\s+publiques/i,
        label: "lexical:fiscalVague"
      }
    }
  ],
  negativeSignals: [
    {
      family: "negativeEvidence",
      weight: 0.4,
      matcher: {
        kind: "regex",
        pattern: /avis\s+d['’]?imp[oô]t\s+sur\s+les\s+revenus|d[eé]claration\s+des\s+revenus|taxe\s+fonci[eè]re/i,
        label: "negative:knownTaxFamily"
      }
    }
  ]
};

// lib/v4/classification/profiles/registry.ts
var FISCAL_SPECIALIZED_SCHEMA_PROFILES = [
  incomeTaxReturnSchemaProfile,
  incomeTaxNoticeSchemaProfile,
  propertyTaxSchemaProfile,
  taxFormSchemaProfile,
  unknownTaxDocumentSchemaProfile
];
var DEFAULT_SCHEMA_PROFILES = [
  invoiceProfile,
  bankStatementProfile,
  taxDocumentProfile,
  administrativeLetterProfile,
  contractProfile,
  payslipProfile,
  receiptProfile,
  noticeProfile,
  formProfile,
  certificateProfile,
  financialStatementProfile,
  explanatoryDocumentProfile
];
var extraProfiles = [];
function listSchemaProfiles() {
  return [...DEFAULT_SCHEMA_PROFILES, ...extraProfiles];
}

// lib/v4/classification/weights.ts
var CLASSIFICATION_WEIGHTS = {
  // Familles
  lexicalStrong: 0.22,
  lexicalSecondary: 0.1,
  structural: 0.22,
  entity: 0.12,
  relation: 0.14,
  arithmetic: 0.18,
  layout: 0.08,
  negativeEvidence: -0.35,
  missingExpectedStructure: -0.2,
  // Seuils globaux
  unknownMaxScore: 0.24,
  ambiguousMargin: 0.1,
  secondarySectionMin: 0.22,
  secondarySectionMaxPrimaryRatio: 0.55,
  // Spécifiques critiques
  ibanAloneBankCap: 0.12,
  bankNeedsTransactionStructure: 0.25
};

// lib/v4/classification/scorer.ts
var FAMILY_WEIGHT = {
  lexical: 1,
  structural: 1,
  entity: 1,
  relation: 1,
  arithmetic: 1,
  layout: 1,
  negativeEvidence: 1
};
function familyScale(family) {
  switch (family) {
    case "lexical":
      return CLASSIFICATION_WEIGHTS.lexicalStrong;
    case "structural":
      return CLASSIFICATION_WEIGHTS.structural;
    case "entity":
      return CLASSIFICATION_WEIGHTS.entity;
    case "relation":
      return CLASSIFICATION_WEIGHTS.relation;
    case "arithmetic":
      return CLASSIFICATION_WEIGHTS.arithmetic;
    case "layout":
      return CLASSIFICATION_WEIGHTS.layout;
    case "negativeEvidence":
      return Math.abs(CLASSIFICATION_WEIGHTS.negativeEvidence);
    default:
      return 0.1;
  }
}
function structureOn(flags, key) {
  return Boolean(flags[key]);
}
function matchSignal(signal, ctx, type, polarity) {
  const m = signal.matcher;
  let hit = false;
  let label = "";
  if (m.kind === "regex") {
    hit = m.pattern.test(ctx.text) || m.pattern.test(ctx.lex);
    label = m.label;
  } else if (m.kind === "entity") {
    const count = ctx.candidates.filter((c) => c.type === m.entityType).length;
    hit = count >= (m.min ?? 1);
    label = m.label;
  } else if (m.kind === "relation") {
    const count = ctx.relations.filter((r) => r.type === m.relationType).length;
    hit = count >= (m.min ?? 1);
    label = m.label;
  } else if (m.kind === "arithmetic") {
    hit = ctx.relations.some((r) => r.type === "arithmetic") || Boolean(
      ctx.consistency?.best?.relations.some((r) => r.type === "arithmetic")
    );
    label = m.label;
  } else if (m.kind === "structure") {
    hit = structureOn(ctx.structures, m.key);
    label = m.label;
  } else if (m.kind === "absence") {
    hit = !structureOn(ctx.structures, m.key);
    label = m.label;
  }
  if (!hit) return null;
  const base = signal.family === "lexical" && signal.weight >= 0.75 ? CLASSIFICATION_WEIGHTS.lexicalStrong : signal.family === "lexical" ? CLASSIFICATION_WEIGHTS.lexicalSecondary : familyScale(signal.family);
  let delta = polarity * base * signal.weight * (FAMILY_WEIGHT[signal.family] || 1);
  if (type === "bankStatement" && label === "entity:iban" && !ctx.structures.hasTransactionTable) {
    delta = Math.min(delta, CLASSIFICATION_WEIGHTS.ibanAloneBankCap);
  }
  const evidence = ctx.blocks.filter((b) => {
    if (m.kind === "regex") return m.pattern.test(b.text);
    return false;
  }).slice(0, 3).map((b) => ({
    text: b.text.trim(),
    page: b.page,
    bbox: b.bbox ?? null,
    blockId: b.id,
    lineId: b.lineId ?? null
  }));
  if (!evidence.length && ctx.blocks[0]) {
    evidence.push({
      text: ctx.blocks[0].text.slice(0, 120),
      page: ctx.blocks[0].page,
      bbox: ctx.blocks[0].bbox ?? null,
      blockId: ctx.blocks[0].id,
      lineId: ctx.blocks[0].lineId ?? null
    });
  }
  return {
    signal: label,
    family: signal.family,
    delta,
    type,
    evidence
  };
}
function scoreSchemaProfile(profile, ctx) {
  const evidence = [];
  const reasons = [];
  for (const signal of profile.positiveSignals) {
    const item = matchSignal(signal, ctx, profile.type, 1);
    if (item) {
      evidence.push(item);
      reasons.push({ signal: item.signal, delta: item.delta });
    }
  }
  for (const signal of profile.negativeSignals) {
    const item = matchSignal(signal, ctx, profile.type, -1);
    if (item) {
      evidence.push(item);
      reasons.push({ signal: item.signal, delta: item.delta });
    }
  }
  for (const key of profile.expectedStructures) {
    if (key in ctx.structures && !structureOn(ctx.structures, key)) {
      const delta = CLASSIFICATION_WEIGHTS.missingExpectedStructure;
      reasons.push({ signal: `missingStructure:${key}`, delta });
      evidence.push({
        signal: `missingStructure:${key}`,
        family: "negativeEvidence",
        delta,
        type: profile.type,
        evidence: []
      });
    }
  }
  if (profile.type === "bankStatement" && !ctx.structures.hasTransactionTable) {
    const delta = -CLASSIFICATION_WEIGHTS.bankNeedsTransactionStructure;
    reasons.push({ signal: "cap:bankWithoutTransactions", delta });
    evidence.push({
      signal: "cap:bankWithoutTransactions",
      family: "negativeEvidence",
      delta,
      type: profile.type,
      evidence: []
    });
  }
  const raw = reasons.reduce((a, r) => a + r.delta, 0);
  const score = clamp01(raw);
  return { type: profile.type, score, evidence, reasons };
}

// lib/v4/classification/secondarySections.ts
function pushUnique(out, kind, confidence, signal) {
  const existing = out.find((h) => h.kind === kind);
  if (existing) {
    existing.confidence = Math.min(1, Math.max(existing.confidence, confidence));
    if (!existing.signals.includes(signal)) existing.signals.push(signal);
    return;
  }
  out.push({ kind, confidence, signals: [signal] });
}
function detectSecondarySections(ctx) {
  const hits = [];
  const { lex: lex2, structures, candidates } = ctx;
  if (structures.hasIban || candidates.some((c) => c.type === "iban")) {
    pushUnique(hits, "bankingDetails", 0.85, "iban");
  }
  if (/\brib\b|\biban\b|\bbic\b|\bswift\b/.test(lex2)) {
    if (/\brib\b/.test(lex2)) pushUnique(hits, "bankingDetails", 0.8, "rib");
    if (/\bbic\b|\bswift\b/.test(lex2)) {
      pushUnique(hits, "bankingDetails", 0.7, "bic");
    }
  }
  if (/coordonn[eé]es\s+bancaires|compte\s+bancaire\s+(pour|de)\s+paiement/.test(lex2)) {
    pushUnique(hits, "bankingDetails", 0.75, "bankingCoordinates");
  }
  if (structures.hasPrelevement || /prelevement|pr[eé]l[eè]vement|sera\s+prelev|preleve\s+automatiquement/.test(
    lex2
  )) {
    pushUnique(hits, "paymentInformation", 0.8, "prelevement");
  }
  if (/mandat\s+sepa|sepa/.test(lex2)) {
    pushUnique(hits, "paymentInformation", 0.85, "mandatSepa");
  }
  if (/mode\s+de\s+paiement|payable\s+(avant|le)|montant\s+[aà]\s+payer|paiement\s+automatique/.test(
    lex2
  )) {
    pushUnique(hits, "paymentInformation", 0.65, "paymentTerms");
  }
  if (/[eé]ch[eé]ancier|mensualit[eé]s?|prochaine\s+[eé]ch[eé]ance/.test(lex2)) {
    pushUnique(hits, "paymentSchedule", 0.75, "echeancier");
  }
  const hasPhone = candidates.some((c) => c.type === "phone");
  const hasEmail = candidates.some((c) => c.type === "email");
  const hasAddress = candidates.some((c) => c.type === "address");
  if (hasPhone) pushUnique(hits, "contactInformation", 0.55, "phone");
  if (hasEmail) pushUnique(hits, "contactInformation", 0.55, "email");
  if (hasAddress) pushUnique(hits, "contactInformation", 0.5, "address");
  if (/service\s+client|nous\s+contacter|hotline|n[°o]\s*vert/.test(lex2)) {
    pushUnique(hits, "contactInformation", 0.6, "customerService");
  }
  if (/mentions\s+l[eé]gales|sas\s+au\s+capital|rcs\s+|siret\s+|tva\s+intracommunautaire/.test(
    lex2
  )) {
    pushUnique(hits, "legalInformation", 0.55, "legalMentions");
  }
  if (/conditions\s+g[eé]n[eé]rales|cgv|cgu|clause\s+contractuelle|selon\s+votre\s+contrat/.test(
    lex2
  )) {
    pushUnique(hits, "contractualInformation", 0.6, "contractTerms");
  }
  if (/assujetti\s+[aà]\s+la\s+tva|taux\s+de\s+tva|ventilation\s+tva|base\s+ht/.test(
    lex2
  ) && !structures.hasTaxMarks) {
    pushUnique(hits, "taxInformation", 0.45, "vatBreakdown");
  }
  return hits.map((h) => ({
    kind: h.kind,
    confidence: Number(h.confidence.toFixed(4)),
    signals: h.signals
  }));
}

// lib/v4/classification/DocumentSchemaRouter.ts
var DocumentSchemaRouter = class {
  profiles;
  constructor(profiles) {
    this.profiles = profiles ?? listSchemaProfiles();
  }
  classify(input) {
    const ctx = buildClassificationContext(input);
    return this.classifyContext(ctx);
  }
  classifyContext(ctx) {
    const scored = this.profiles.map((p) => scoreSchemaProfile(p, ctx));
    scored.sort((a, b) => b.score - a.score);
    const scores = { unknown: 0 };
    for (const s of scored) scores[s.type] = s.score;
    const top = scored[0];
    const second = scored[1];
    const allEvidence = scored.flatMap(
      (s) => s.evidence
    );
    const contradictions = [];
    let status = "resolved";
    let primary = "unknown";
    let confidenceScore = 0;
    if (!top || top.score < CLASSIFICATION_WEIGHTS.unknownMaxScore) {
      primary = "unknown";
      status = "unknown";
      confidenceScore = top ? 1 - top.score : 0.9;
      scores.unknown = Math.max(scores.unknown || 0, 0.6);
    } else if (second && second.score >= CLASSIFICATION_WEIGHTS.unknownMaxScore && (Math.abs(top.score - second.score) < CLASSIFICATION_WEIGHTS.ambiguousMargin || top.score < 0.55 && second.score / Math.max(top.score, 0.01) > 0.7 && Math.abs(top.score - second.score) < 0.18)) {
      primary = top.type;
      status = "ambiguous";
      confidenceScore = top.score * 0.7;
      contradictions.push({
        signal: `ambiguous:${top.type}\u2248${second.type}`,
        delta: -0.1
      });
    } else {
      primary = top.type;
      status = "resolved";
      confidenceScore = top.score;
    }
    const secondarySections = detectSecondarySections(ctx);
    const alternatives = scored.filter((s) => s.type !== primary).slice(0, 4).map((s) => ({ type: s.type, confidence: Number(s.score.toFixed(4)) }));
    const primaryEvidence = allEvidence.filter(
      (e) => e.type === primary || primary === "unknown" && e.delta < 0
    );
    const strong = primaryEvidence.filter((e) => e.delta > 0.12).map((e) => e.signal);
    const secondary = primaryEvidence.filter((e) => e.delta > 0 && e.delta <= 0.12).map((e) => e.signal);
    const negative = allEvidence.filter((e) => e.type === primary && e.delta < 0).map((e) => e.signal);
    return {
      primary,
      confidence: toConfidence(confidenceScore),
      status,
      scores,
      alternatives,
      secondarySections,
      evidence: primaryEvidence.length ? primaryEvidence : allEvidence.slice(0, 12),
      contradictions,
      signals: {
        strong: [...new Set(strong)].slice(0, 12),
        secondary: [...new Set(secondary)].slice(0, 12),
        negative: [...new Set(negative)].slice(0, 12),
        structural: Object.entries(ctx.structures).filter(([, v]) => v).map(([k]) => k)
      }
    };
  }
};

// lib/v4/knowledge/fr/tax/detector/detectReferences.ts
var TAXPAYER_ID_RE = /\b(\d{13})\b/g;
var NOTICE_REF_RE = /\b(?:r[eé]f[eé]rence\s+(?:de\s+l['’]?avis|avis)|n[°o]\s*avis|avis\s+n[°o]?)\s*[:\s]*([A-Z0-9][A-Z0-9\-]{5,20})\b/gi;
var YEAR_RE = /\b(20[2-3]\d)\b/g;
var FORM_CANDIDATE_RE = /\b(?:n[°oº]\s*)?(?:formulaire\s+)?((?:\d{3,4}|[2O][0OIli]\d{2})(?:[ \-_\/]+[A-Z0-9]{1,8}){0,4})\b/gi;
var VARIANT_STOP = /* @__PURE__ */ new Set([
  "ET",
  "DE",
  "DES",
  "DU",
  "LA",
  "LE",
  "LES",
  "AU",
  "AUX",
  "SUR",
  "POUR",
  "UNE",
  "UN",
  "OU",
  "EN",
  "D",
  "L",
  "A",
  "DECLARATION",
  "IMPOT",
  "IMPOTS",
  "REVENUS",
  "FORMULAIRE",
  "ANNEE",
  "PAGE"
]);
function sanitizeFormCandidate(raw) {
  let s = raw.split(/[–—]/)[0] || raw;
  const parts = s.split(/[ \-_\/]+/).filter(Boolean);
  if (!parts.length) return s.trim();
  const kept = [parts[0]];
  for (const p of parts.slice(1)) {
    const up = p.toUpperCase();
    if (VARIANT_STOP.has(up)) break;
    if (!/^[A-Z0-9]{1,8}$/i.test(p)) break;
    kept.push(p);
  }
  return kept.join("-");
}
var CERFA_RE = /\bCERFA\s*n?[°o]?\s*(\d{5}(?:\s*[*#]\s*\d+)?)\b/gi;
function evidenceFor(block) {
  return [
    {
      text: block.text,
      page: block.page,
      bbox: block.bbox ?? null,
      blockId: block.id,
      lineId: block.lineId ?? null
    }
  ];
}
function fiscalContextScore(lex2) {
  let s = 0;
  if (/formulaire|cerfa|declaration|impot|fiscal|dgfip|finances\s+publiques|annexe|rici/.test(lex2))
    s += 0.45;
  if (/n[°o]|reference|titre/.test(lex2)) s += 0.15;
  if (/direction\s+generale\s+des\s+finances\s+publiques/.test(lex2)) s += 0.2;
  if (/rue|avenue|boulevard|appartement|code\s+postal|telephone|tel\b|facture|client|contrat|compte\s+bancaire/.test(lex2))
    s -= 0.45;
  if (/€|eur\b|montant|total\s+ttc|total\s+ht/.test(lex2) && !/impot|fiscal|declaration|avis/.test(lex2))
    s -= 0.2;
  return s;
}
function inferReferenceRole(blockText, normalized, kind) {
  if (kind !== "formReference") return "unknown";
  const lex2 = normalizeLex(blockText);
  const refFlex = normalized.toLowerCase().replace(/-/g, "[- ]?");
  if (/joindre|joignez|piece\s+jointe|annexez|veuillez\s+joindre/.test(lex2) && new RegExp(refFlex, "i").test(lex2)) {
    return "attachmentReference";
  }
  if (/voir\s+(aussi\s+)?(votre\s+)?(declaration|formulaire)|reportez|reporter|conformement\s+a\s+votre|selon\s+votre\s+declaration|mentionne|hors\s+sujet|pour\s+vos\s+impots/.test(
    lex2
  )) {
    return "mentionedDocument";
  }
  if (/guide\s+pratique|bail\s+d|locataire|facture\s+n|bon\s+de\s+commande|contrat\s+\d/.test(
    lex2
  )) {
    return "mentionedDocument";
  }
  if (new RegExp(
    `(declaration\\s+des\\s+revenus|formulaire)\\s+(n[\xB0o]\\s*)?${refFlex}|${refFlex}\\s*(-\\s*)?(declaration|formulaire)`,
    "i"
  ).test(lex2) || /^\s*(declaration|formulaire)/.test(lex2) && lex2.includes(normalized.replace(/-/g, "").toLowerCase())) {
    return "documentIdentity";
  }
  if (/annexe|complementaire/.test(lex2) && new RegExp(refFlex, "i").test(lex2)) {
    return "relatedDocument";
  }
  if (lex2.trim().length < 100 && new RegExp(`\\b${refFlex}\\b`, "i").test(lex2) && /declaration|formulaire|cerfa|impot/.test(lex2)) {
    return "documentIdentity";
  }
  return "unknown";
}
function pushUnique2(out, item) {
  const key = `${item.kind}|${item.normalized}|${item.role}|${item.evidence[0]?.blockId || ""}`;
  if (out.some((x) => `${x.kind}|${x.normalized}|${x.role}|${x.evidence[0]?.blockId || ""}` === key))
    return;
  out.push(item);
}
function detectFiscalReferences(blocks, registry) {
  const out = [];
  const index = buildRegistryIndex(registry);
  const known = index.knownReferences;
  for (const block of blocks) {
    const text = block.text || "";
    const lex2 = normalizeLex(text);
    const ctx = fiscalContextScore(lex2);
    FORM_CANDIDATE_RE.lastIndex = 0;
    let m;
    while ((m = FORM_CANDIDATE_RE.exec(text)) !== null) {
      const rawCaptured = m[1] || m[0];
      const raw = sanitizeFormCandidate(rawCaptured);
      if (!raw) continue;
      let norm = normalizeTaxReference(raw);
      let normalizationReason = null;
      let normalizedCandidate = norm.normalizedReference;
      let lookup = lookupRegistry(index, norm.normalizedReference);
      if (lookup.matchKind === "none" && ctx >= 0.4) {
        const repaired = ocrRepairTaxReference(raw, known);
        if (repaired) {
          norm = normalizeTaxReference(repaired.candidate);
          normalizedCandidate = repaired.candidate;
          normalizationReason = repaired.reason;
          lookup = lookupRegistry(index, repaired.candidate);
        }
      }
      if (/^(19|20)\d{2}$/.test(norm.normalizedReference) && lookup.matchKind === "none") {
        continue;
      }
      if (lookup.matchKind === "none" && ctx < 0.35) continue;
      if (lookup.matchKind === "none" && !/^\d{3,4}(-[A-Z0-9]+)*$/i.test(norm.normalizedReference))
        continue;
      if (ctx < 0.2) continue;
      if (ctx < 0.35 && /rue|avenue|boulevard|appartement|facture\s+n|client\s|contrat\s|appelez/.test(lex2)) {
        continue;
      }
      const role = inferReferenceRole(text, norm.normalizedReference, "formReference");
      const entry = lookup.entry;
      const matchKind = lookup.matchKind;
      let confidence = lookup.confidence * (0.5 + Math.max(0, Math.min(ctx, 0.5)));
      if (role === "documentIdentity") confidence = Math.min(0.95, confidence + 0.15);
      if (role === "mentionedDocument") confidence = Math.min(0.75, confidence);
      if (matchKind === "possible") confidence = Math.min(confidence, 0.4);
      pushUnique2(out, {
        raw,
        normalized: norm.normalizedReference,
        kind: "formReference",
        role: ctx >= 0.35 ? role : "unknown",
        registryId: entry && matchKind !== "possible" ? entry.id : entry?.id || null,
        family: entry?.family || null,
        evidence: evidenceFor(block),
        confidence,
        reasons: [
          `match:${matchKind}`,
          `role:${role}`,
          `context:${ctx.toFixed(2)}`,
          normalizationReason || "norm:standard"
        ],
        rawText: raw,
        normalizedCandidate,
        normalizationReason,
        matchKind
      });
    }
    CERFA_RE.lastIndex = 0;
    while ((m = CERFA_RE.exec(text)) !== null) {
      const raw = m[1].replace(/\s+/g, "").replace(/[*#].*$/, "");
      if (/^\d{9}$/.test(raw) || /^\d{14}$/.test(raw)) continue;
      const lookup = lookupRegistry(index, raw);
      const titleHit = Boolean(
        lookup.entry && lookup.entry.officialTitle && lex2.includes(
          normalizeLex(lookup.entry.officialTitle).slice(0, 24)
        )
      );
      const verified = lookup.matchKind === "cerfa" && Boolean(lookup.entry) && (lookup.entry.cerfaVerified || (lookup.entry.cerfaNumbers || []).includes(raw));
      let confidence = 0.25;
      let role = "unknown";
      let matchKind = lookup.matchKind;
      const reasons = [`match:${lookup.matchKind}`, "kind:cerfaNumber", "not:formReference"];
      if (verified && ctx >= 0.4) {
        confidence = titleHit ? 0.92 : 0.78;
        role = titleHit || ctx >= 0.55 ? "documentIdentity" : "relatedDocument";
        reasons.push("cerfa:verified+context");
        if (titleHit) reasons.push("cerfa:titleCoherent");
      } else if (lookup.matchKind === "cerfa" && ctx < 0.35) {
        confidence = 0.2;
        matchKind = "possible";
        reasons.push("cerfa:weakContext");
      } else if (lookup.matchKind === "none") {
        confidence = ctx >= 0.45 ? 0.35 : 0.15;
        matchKind = "possible";
        reasons.push("cerfa:unknownNumber");
      }
      pushUnique2(out, {
        raw,
        normalized: raw.toUpperCase(),
        kind: "cerfaNumber",
        role,
        registryId: verified ? lookup.entry?.id || null : null,
        family: verified ? lookup.entry?.family || null : null,
        evidence: evidenceFor(block),
        confidence,
        reasons,
        matchKind
      });
    }
    TAXPAYER_ID_RE.lastIndex = 0;
    while ((m = TAXPAYER_ID_RE.exec(text)) !== null) {
      const raw = m[1];
      const labeled = /numero\s+fiscal|n[°o]\s*fiscal|identifiant\s+fiscal/.test(lex2);
      pushUnique2(out, {
        raw,
        normalized: raw,
        kind: "taxpayerIdentifier",
        role: "unknown",
        registryId: null,
        family: null,
        evidence: evidenceFor(block),
        confidence: labeled ? 0.9 : 0.55,
        reasons: ["kind:taxpayerIdentifier", "not:formReference"]
      });
    }
    NOTICE_REF_RE.lastIndex = 0;
    while ((m = NOTICE_REF_RE.exec(text)) !== null) {
      const raw = m[1];
      if (/^204[0-9]/.test(raw)) continue;
      pushUnique2(out, {
        raw,
        normalized: raw.toUpperCase(),
        kind: "noticeReference",
        role: "documentIdentity",
        registryId: null,
        family: "incomeTaxNotice",
        evidence: evidenceFor(block),
        confidence: 0.75,
        reasons: ["kind:noticeReference", "not:formReference"]
      });
    }
    if (/annee|revenus\s+de|impot\s+sur\s+les\s+revenus|fiscal|imposition|exercice|paiement|avis/.test(
      lex2
    )) {
      YEAR_RE.lastIndex = 0;
      while ((m = YEAR_RE.exec(text)) !== null) {
        const year = Number(m[1]);
        if (year < 2020 || year > 2035) continue;
        const around = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.index + 40)).toLowerCase();
        let yearRole = "unknown";
        if (/revenus\s+(de\s+l['’]?ann[eé]e|au\s+titre)|au\s+titre\s+des\s+revenus/.test(around)) {
          yearRole = "incomeYear";
        } else if (/date\s+limite|paiement|échéance|a\s+payer/.test(around)) {
          yearRole = "paymentYear";
        } else if (/ann[eé]e\s+d['’]?imposition|imposition/.test(around)) {
          yearRole = "issueYear";
        } else if (/exercice|applicable|mill[eé]sime/.test(around)) {
          yearRole = "applicableYear";
        } else if (/formulaire|d[eé]claration|document/.test(around)) {
          yearRole = "documentYear";
        }
        pushUnique2(out, {
          raw: m[1],
          normalized: m[1],
          kind: "fiscalYear",
          role: "unknown",
          registryId: null,
          family: null,
          evidence: evidenceFor(block),
          confidence: yearRole === "unknown" ? 0.35 : 0.55,
          reasons: ["kind:fiscalYear", `yearRole:${yearRole}`, "not:formReference"],
          yearRole
        });
      }
    }
  }
  return out;
}
function selectPrimaryIdentity(refs) {
  const formIdentities = refs.filter(
    (r) => r.kind === "formReference" && r.role === "documentIdentity" && r.matchKind !== "possible" && (r.confidence || 0) >= 0.55
  );
  if (formIdentities.length === 1) return formIdentities[0];
  if (formIdentities.length > 1) {
    const norms = new Set(formIdentities.map((i) => i.normalized));
    if (norms.size > 1) return null;
    return formIdentities.sort((a, b) => b.confidence - a.confidence)[0];
  }
  const cerfaIdentities = refs.filter(
    (r) => r.kind === "cerfaNumber" && r.role === "documentIdentity" && r.matchKind === "cerfa" && r.registryId && (r.confidence || 0) >= 0.75
  );
  if (cerfaIdentities.length === 1) return cerfaIdentities[0];
  return null;
}

// lib/v4/knowledge/fr/tax/signals/buildSignals.ts
function blob(blocks) {
  return normalizeLex(blocks.map((b) => b.text).join("\n"));
}
function buildFiscalKnowledgeSignals(blocks, refs, registry) {
  const signals = [];
  const text = blob(blocks);
  for (const ref of refs) {
    if (ref.kind === "formReference" && ref.registryId) {
      const entry = lookupById(registry, ref.registryId);
      if (!entry) continue;
      if (ref.role === "documentIdentity") {
        signals.push({
          signal: `knowledge:formIdentity:${ref.normalized}`,
          family: entry.family,
          weight: 0.55,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      } else if (ref.role === "mentionedDocument") {
        signals.push({
          signal: `knowledge:formMentioned:${ref.normalized}`,
          family: "negative",
          weight: 0.05,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
        signals.push({
          signal: `knowledge:mentionedNotIdentity:${ref.normalized}`,
          family: "negative",
          weight: -0.35,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      } else if (ref.role === "relatedDocument") {
        signals.push({
          signal: `knowledge:formRelated:${ref.normalized}`,
          family: entry.family,
          weight: 0.2,
          registryId: entry.id,
          referenceRole: ref.role,
          evidence: ref.evidence
        });
      }
    }
    if (ref.kind === "taxpayerIdentifier") {
      signals.push({
        signal: "knowledge:taxpayerIdentifier",
        family: "tax",
        weight: 0.15,
        referenceRole: "unknown",
        evidence: ref.evidence
      });
    }
    if (ref.kind === "noticeReference") {
      signals.push({
        signal: "knowledge:noticeReference",
        family: "incomeTaxNotice",
        weight: 0.35,
        referenceRole: ref.role,
        evidence: ref.evidence
      });
    }
  }
  const familyLex = [
    {
      family: "incomeTaxNotice",
      re: /avis\s+d['’]?impot\s+sur\s+le[s]?\s+revenu[s]?|avis\s+d['’]?imposition/,
      w: 0.45
    },
    {
      family: "incomeTaxReturn",
      re: /declaration\s+des\s+revenus|formulaire\s+n[°o]?\s*2042/,
      w: 0.4
    },
    {
      family: "propertyTax",
      re: /avis\s+de\s+taxe\s+fonciere|taxe\s+fonciere\s+sur\s+les\s+proprietes/,
      w: 0.45
    },
    {
      family: "withholdingTax",
      re: /prelevement\s+a\s+la\s+source|taux\s+de\s+prelevement/,
      w: 0.25
    },
    {
      family: "corporateTax",
      re: /impot\s+sur\s+les\s+societes|2065/,
      w: 0.4
    },
    {
      family: "vatDeclaration",
      re: /declaration\s+de\s+tva|3310|ca3/,
      w: 0.4
    },
    {
      family: "rentalIncomeDeclaration",
      re: /revenus\s+fonciers|formulaire\s+n[°o]?\s*2044/,
      w: 0.4
    }
  ];
  for (const f of familyLex) {
    if (f.re.test(text)) {
      signals.push({
        signal: `knowledge:lexical:${f.family}`,
        family: f.family,
        weight: f.w,
        evidence: blocks.filter((b) => f.re.test(normalizeLex(b.text))).slice(0, 2).map((b) => ({
          text: b.text,
          page: b.page,
          bbox: b.bbox ?? null,
          blockId: b.id,
          lineId: b.lineId ?? null
        }))
      });
    }
  }
  if (/\btotal\s+ht\b|\btotal\s+ttc\b|\btva\s+\d/.test(text) && /taxe\s+fonciere/.test(text)) {
    signals.push({
      signal: "knowledge:negative:invoiceMarksOnProperty",
      family: "negative",
      weight: -0.4,
      evidence: []
    });
  }
  return signals;
}
function suggestFamilyFromSignals(signals, refs) {
  const identityRef = refs.find(
    (r) => r.kind === "formReference" && r.role === "documentIdentity" && r.family
  );
  if (identityRef?.family) return identityRef.family;
  const scores = /* @__PURE__ */ new Map();
  for (const s of signals) {
    if (s.family === "negative" || s.family === "tax") continue;
    if (s.referenceRole === "mentionedDocument") continue;
    scores.set(s.family, (scores.get(s.family) || 0) + s.weight);
  }
  let best = null;
  let bestScore = 0;
  for (const [fam, sc] of scores) {
    if (sc > bestScore) {
      bestScore = sc;
      best = fam;
    }
  }
  return bestScore >= 0.35 ? best : null;
}

// lib/v4/knowledge/fr/tax/fields/loadRegistry.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// lib/v4/knowledge/fr/tax/fields/priorityFields.ts
var RETRIEVED3 = "2026-08-08";
function src2(url, title, supports) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED3,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
var SRC_2042_NOTICE = src2(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice \u2014 Remplir la d\xE9claration de revenus 2024 (formulaire 2042)",
  ["label", "explanation", "plainLanguageWhat", "declarantRole", "valueType"]
);
var SRC_SALAIRES_BROCHURE = src2(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR \u2014 Traitements et salaires",
  ["label", "explanation", "plainLanguageWhat"]
);
var SRC_FONCIERS_BROCHURE = src2(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR \u2014 Revenus fonciers",
  ["label", "explanation", "plainLanguageWhat"]
);
var SRC_FONCIERS_AIDE = src2(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR \u2014 revenus fonciers (cases 4BA \xE0 4EA)",
  ["label", "explanation", "plainLanguageWhat"]
);
var SRC_2042_FORM = src2(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n\xB02042 \u2014 D\xE9claration des revenus",
  ["documentRefs"]
);
var SRC_2044_FORM = src2(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n\xB02044 \u2014 D\xE9claration des revenus fonciers",
  ["documentRefs"]
);
var YEARS_STABLE = [2024, 2025, 2026];
function field(partial) {
  const normalizedCode = partial.fieldCode.toUpperCase().replace(/\s+/g, "");
  return {
    country: "FR",
    id: partial.id || `fr-tax-field-${normalizedCode.toLowerCase()}`,
    fieldCode: normalizedCode,
    normalizedCode,
    documentRefs: partial.documentRefs,
    section: partial.section,
    subsection: partial.subsection ?? null,
    label: partial.label,
    explanation: partial.explanation,
    plainLanguageWhat: partial.plainLanguageWhat,
    declarantRole: partial.declarantRole,
    valueType: partial.valueType,
    applicableYears: partial.applicableYears,
    yearStable: partial.yearStable ?? true,
    aliases: partial.aliases || [],
    relatedFields: partial.relatedFields || [],
    officialSources: partial.officialSources,
    provenance: partial.provenance,
    confidence: partial.confidence,
    qualityStatus: partial.qualityStatus,
    lastVerifiedAt: partial.lastVerifiedAt ?? RETRIEVED3
  };
}
function salaryCase(code, role, roleLabel, related) {
  return field({
    fieldCode: code,
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Traitements et salaires",
    label: "Traitements et salaires",
    explanation: "Case de la d\xE9claration des revenus destin\xE9e aux traitements et salaires imposables (et certains \xE9l\xE9ments assimil\xE9s indiqu\xE9s par la notice), pour le r\xF4le fiscal concern\xE9.",
    plainLanguageWhat: `Cette case concerne g\xE9n\xE9ralement les traitements et salaires imposables du ${roleLabel}.`,
    declarantRole: role,
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: true,
    relatedFields: related,
    officialSources: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE, SRC_2042_FORM],
    provenance: [SRC_2042_NOTICE, SRC_SALAIRES_BROCHURE],
    confidence: 0.95,
    qualityStatus: "verified"
  });
}
function pensionCase(code, role, roleLabel, related) {
  return field({
    fieldCode: code,
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Pensions, retraites, rentes",
    label: "Pensions, retraites, rentes",
    explanation: "Case destin\xE9e aux pensions, retraites et rentes \xE0 titre gratuit \xE0 d\xE9clarer selon la notice de la d\xE9claration des revenus.",
    plainLanguageWhat: `Cette case concerne g\xE9n\xE9ralement les pensions, retraites ou rentes du ${roleLabel}.`,
    declarantRole: role,
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: true,
    relatedFields: related,
    officialSources: [SRC_2042_NOTICE, SRC_2042_FORM],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  });
}
var PRIORITY_TAX_FIELDS = [
  salaryCase("1AJ", "declarant1", "d\xE9clarant 1", ["1BJ", "1CJ", "1DJ"]),
  salaryCase("1BJ", "declarant2", "d\xE9clarant 2", ["1AJ", "1CJ", "1DJ"]),
  salaryCase("1CJ", "dependent1", "1re personne \xE0 charge", ["1AJ", "1BJ", "1DJ"]),
  salaryCase("1DJ", "dependent2", "2e personne \xE0 charge", ["1AJ", "1BJ", "1CJ"]),
  pensionCase("1AS", "declarant1", "d\xE9clarant 1", ["1BS", "1CS", "1DS"]),
  pensionCase("1BS", "declarant2", "d\xE9clarant 2", ["1AS", "1CS", "1DS"]),
  pensionCase("1CS", "dependent1", "1re personne \xE0 charge", ["1AS", "1BS", "1DS"]),
  pensionCase("1DS", "dependent2", "2e personne \xE0 charge", ["1AS", "1BS", "1CS"]),
  field({
    fieldCode: "1AP",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Autres revenus imposables",
    label: "Ch\xF4mage, pr\xE9retraite",
    explanation: "Case destin\xE9e \xE0 certains revenus de remplacement (notamment allocations de ch\xF4mage / pr\xE9retraite) impos\xE9s selon les r\xE8gles des traitements et salaires, pour le d\xE9clarant 1.",
    plainLanguageWhat: "Cette case concerne g\xE9n\xE9ralement les allocations de ch\xF4mage ou de pr\xE9retraite du d\xE9clarant 1.",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1BP"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "1BP",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Autres revenus imposables",
    label: "Ch\xF4mage, pr\xE9retraite",
    explanation: "Case destin\xE9e \xE0 certains revenus de remplacement (notamment allocations de ch\xF4mage / pr\xE9retraite) pour le d\xE9clarant 2.",
    plainLanguageWhat: "Cette case concerne g\xE9n\xE9ralement les allocations de ch\xF4mage ou de pr\xE9retraite du d\xE9clarant 2.",
    declarantRole: "declarant2",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1AP"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "1AK",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Frais r\xE9els",
    label: "Frais r\xE9els",
    explanation: "Case permettant d\u2019indiquer les frais professionnels r\xE9els du d\xE9clarant 1 lorsque cette option est utilis\xE9e \xE0 la place de la d\xE9duction forfaitaire.",
    plainLanguageWhat: "Cette case sert \xE0 d\xE9clarer les frais professionnels r\xE9els du d\xE9clarant 1, lorsqu\u2019ils sont retenus.",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1BK"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "1BK",
    documentRefs: ["2042"],
    section: "Traitements, salaires, pensions et rentes",
    subsection: "Frais r\xE9els",
    label: "Frais r\xE9els",
    explanation: "Case permettant d\u2019indiquer les frais professionnels r\xE9els du d\xE9clarant 2.",
    plainLanguageWhat: "Cette case sert \xE0 d\xE9clarer les frais professionnels r\xE9els du d\xE9clarant 2, lorsqu\u2019ils sont retenus.",
    declarantRole: "declarant2",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["1AK"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "2TR",
    documentRefs: ["2042"],
    section: "Revenus de capitaux mobiliers",
    subsection: "Produits de placement \xE0 revenu fixe",
    label: "Produits de placement \xE0 revenu fixe",
    explanation: "Case destin\xE9e aux produits de placement \xE0 revenu fixe (int\xE9r\xEAts de livrets fiscalis\xE9s, comptes de d\xE9p\xF4t / \xE0 terme, produits d\u2019emprunt d\u2019\xC9tat, etc.) selon la notice.",
    plainLanguageWhat: "Cette case concerne certains int\xE9r\xEAts et produits de placement \xE0 revenu fixe du foyer.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: [],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "3VG",
    documentRefs: ["2042", "2042-C", "2074"],
    section: "Plus-values et gains divers",
    subsection: "Plus-values de cession",
    label: "Plus-values de cession de valeurs mobili\xE8res",
    explanation: "Case de report des plus-values (apr\xE8s imputation \xE9ventuelle de moins-values) sur la d\xE9claration de revenus ; dans certains cas le d\xE9tail se calcule sur la 2074.",
    plainLanguageWhat: "Cette case sert \xE0 indiquer certaines plus-values de cession de valeurs mobili\xE8res \xE0 reporter sur la d\xE9claration.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["3VH"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.88,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "3VH",
    documentRefs: ["2042", "2042-C", "2074"],
    section: "Plus-values et gains divers",
    subsection: "Moins-values",
    label: "Moins-values \xE0 reporter",
    explanation: "Case utilis\xE9e pour certaines moins-values \xE0 reporter, selon les situations d\xE9crites par la notice (souvent li\xE9e au calcul 2074 / 2042-C).",
    plainLanguageWhat: "Cette case concerne certaines moins-values \xE0 reporter sur la d\xE9claration.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["3VG"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.85,
    qualityStatus: "partiallyVerified"
  }),
  field({
    fieldCode: "4BA",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "R\xE9gime r\xE9el",
    label: "Revenus fonciers imposables",
    explanation: "Case de report du revenu net foncier d\xE9termin\xE9 selon le r\xE9gime r\xE9el (souvent via la d\xE9claration 2044) sur la d\xE9claration des revenus.",
    plainLanguageWhat: "Cette case sert \xE0 reporter le revenu foncier net imposable lorsque le r\xE9gime r\xE9el s\u2019applique.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BB", "4BC", "4BD", "4BE"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE, SRC_FONCIERS_AIDE, SRC_2044_FORM],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.95,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BB",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "R\xE9gime r\xE9el",
    label: "D\xE9ficit imputable sur les revenus fonciers",
    explanation: "Case de report d\u2019un d\xE9ficit foncier imputable sur les revenus fonciers des ann\xE9es suivantes.",
    plainLanguageWhat: "Cette case concerne un d\xE9ficit foncier qui s\u2019impute sur les revenus fonciers ult\xE9rieurs.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BC", "4BD"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BC",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "R\xE9gime r\xE9el",
    label: "D\xE9ficit imputable sur le revenu global",
    explanation: "Case de report d\u2019un d\xE9ficit foncier imputable, dans les conditions pr\xE9vues, sur le revenu brut global.",
    plainLanguageWhat: "Cette case concerne un d\xE9ficit foncier pouvant s\u2019imputer sur le revenu global, selon les r\xE8gles applicables.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BB", "4BD"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BD",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "R\xE9gime r\xE9el",
    label: "D\xE9ficits ant\xE9rieurs non encore imput\xE9s",
    explanation: "Case destin\xE9e aux d\xE9ficits fonciers ant\xE9rieurs non encore imput\xE9s, dans les limites de report pr\xE9vues par la notice.",
    plainLanguageWhat: "Cette case sert \xE0 indiquer des d\xE9ficits fonciers d\u2019ann\xE9es ant\xE9rieures non encore imput\xE9s.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA", "4BB", "4BC"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_AIDE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BE",
    documentRefs: ["2042"],
    section: "Revenus fonciers",
    subsection: "Micro-foncier",
    label: "R\xE9gime micro-foncier \u2014 recettes brutes",
    explanation: "Case du r\xE9gime micro-foncier : montant brut des revenus fonciers lorsque ce r\xE9gime s\u2019applique. Un abattement forfaitaire de 30 % est ensuite appliqu\xE9 automatiquement pour d\xE9terminer le revenu imposable (ne pas le d\xE9duire du montant port\xE9 en case), sous le plafond de recettes brutes de 15 000 \u20AC et sous r\xE9serve des exclusions officielles.",
    plainLanguageWhat: "Cette case sert \xE0 indiquer les recettes brutes de locations non meubl\xE9es en micro-foncier (avant abattement forfaitaire de 30 %).",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    provenance: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "4BZ",
    documentRefs: ["2042", "2044"],
    section: "Revenus fonciers",
    subsection: "2044 sp\xE9ciale",
    label: "D\xE9p\xF4t d\u2019une d\xE9claration 2044 sp\xE9ciale",
    explanation: "Case \xE0 cocher lorsque vous d\xE9posez une d\xE9claration n\xB02044 sp\xE9ciale.",
    plainLanguageWhat: "Cette case indique que vous joignez ou utilisez une d\xE9claration 2044 sp\xE9ciale.",
    declarantRole: "household",
    valueType: "boolean",
    applicableYears: YEARS_STABLE,
    relatedFields: ["4BA"],
    officialSources: [SRC_2042_NOTICE, SRC_FONCIERS_BROCHURE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.9,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "7DB",
    documentRefs: ["2042", "2042-RICI"],
    section: "R\xE9ductions et cr\xE9dits d\u2019imp\xF4t",
    subsection: "Services \xE0 la personne \u2014 emploi \xE0 domicile",
    label: "D\xE9penses d\u2019emploi \xE0 domicile",
    explanation: "Case destin\xE9e au montant total des d\xE9penses li\xE9es \xE0 l\u2019emploi \xE0 domicile ouvrant droit \xE0 cr\xE9dit d\u2019imp\xF4t, sans d\xE9duire les aides (\xE0 indiquer s\xE9par\xE9ment).",
    plainLanguageWhat: "Cette case concerne les d\xE9penses d\u2019emploi \xE0 domicile prises en compte pour un cr\xE9dit d\u2019imp\xF4t.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DR", "7GA"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.93,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "7DR",
    documentRefs: ["2042", "2042-RICI"],
    section: "R\xE9ductions et cr\xE9dits d\u2019imp\xF4t",
    subsection: "Services \xE0 la personne \u2014 emploi \xE0 domicile",
    label: "Aides per\xE7ues pour l\u2019emploi \xE0 domicile",
    explanation: "Case destin\xE9e au montant des aides per\xE7ues pour financer les d\xE9penses d\u2019emploi \xE0 domicile (APA, PCH, CESU pr\xE9financ\xE9, etc.), d\xE9duit du montant d\xE9clar\xE9 en 7DB.",
    plainLanguageWhat: "Cette case sert \xE0 indiquer les aides re\xE7ues pour l\u2019emploi \xE0 domicile, \xE0 d\xE9duire des d\xE9penses.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DB"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.93,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "7GA",
    documentRefs: ["2042", "2042-RICI"],
    section: "R\xE9ductions et cr\xE9dits d\u2019imp\xF4t",
    subsection: "Frais de garde d\u2019enfants",
    label: "Frais de garde des enfants de moins de 6 ans",
    explanation: "Case relative aux frais de garde d\u2019enfants de moins de six ans \xE0 l\u2019ext\xE9rieur du domicile (assistante maternelle agr\xE9\xE9e, cr\xE8che, etc.), ouvrant droit \xE0 un cr\xE9dit d\u2019imp\xF4t dans les limites pr\xE9vues.",
    plainLanguageWhat: "Cette case concerne les frais de garde d\u2019enfants de moins de 6 ans \xE0 l\u2019ext\xE9rieur du domicile.",
    declarantRole: "household",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    relatedFields: ["7DB"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  field({
    fieldCode: "8UU",
    documentRefs: ["2042", "3916"],
    section: "Divers",
    subsection: "Comptes \xE0 l\u2019\xE9tranger",
    label: "Comptes bancaires / actifs num\xE9riques \xE0 l\u2019\xE9tranger",
    explanation: "Case \xE0 cocher si le foyer a ouvert, d\xE9tenu, utilis\xE9 ou cl\xF4tur\xE9 des comptes bancaires (ou certains comptes d\u2019actifs num\xE9riques) \xE0 l\u2019\xE9tranger, avec d\xE9claration n\xB03916-3916 bis \xE0 joindre.",
    plainLanguageWhat: "Cette case signale la d\xE9tention ou l\u2019utilisation de certains comptes \xE0 l\u2019\xE9tranger, \xE0 d\xE9clarer avec le formulaire d\xE9di\xE9.",
    declarantRole: "household",
    valueType: "boolean",
    applicableYears: YEARS_STABLE,
    relatedFields: [],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.92,
    qualityStatus: "verified"
  }),
  // 2047 — revenus étrangers (partiellement vérifié : rôle général officiel)
  field({
    fieldCode: "1AF",
    documentRefs: ["2042", "2047"],
    section: "Traitements et salaires",
    subsection: "Revenus de source \xE9trang\xE8re / non-r\xE9sidents",
    label: "Salaires / pensions pour calcul du PAS (situations particuli\xE8res)",
    explanation: "Case utilis\xE9e, selon la notice, pour indiquer certains salaires, pensions ou rentes dans des situations de non-r\xE9sidence ou de source \xE9trang\xE8re afin d\u2019ajuster le calcul du pr\xE9l\xE8vement \xE0 la source ; montants souvent aussi \xE0 reporter sur la 2047.",
    plainLanguageWhat: "Cette case concerne certains salaires ou pensions dans des situations internationales particuli\xE8res (voir notice).",
    declarantRole: "declarant1",
    valueType: "amount",
    applicableYears: YEARS_STABLE,
    yearStable: false,
    relatedFields: ["1AJ"],
    officialSources: [SRC_2042_NOTICE],
    provenance: [SRC_2042_NOTICE],
    confidence: 0.75,
    qualityStatus: "partiallyVerified"
  })
];
var PRIORITY_TAX_FIELDS_BY_CODE = new Map(PRIORITY_TAX_FIELDS.map((f) => [f.normalizedCode, f]));
function getPriorityTaxField(code) {
  return PRIORITY_TAX_FIELDS_BY_CODE.get(code.toUpperCase().replace(/\s+/g, "")) || null;
}

// lib/v4/knowledge/fr/tax/fields/loadRegistry.ts
var FRENCH_TAX_FIELD_REGISTRY_VERSION = "2026.08.08-v4p1";
var HERE3 = dirname3(fileURLToPath3(import.meta.url));
var ARTIFACT_CANDIDATES2 = [
  join3(HERE3, "../../../../../../generated/french-tax-field-registry.json"),
  join3(process.cwd(), "generated/french-tax-field-registry.json")
];
var cached2 = null;
var byCode = null;
function buildSeedFieldRegistry(generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    version: FRENCH_TAX_FIELD_REGISTRY_VERSION,
    country: "FR",
    generatedAt,
    sourceMode: "curated-official",
    entries: [...PRIORITY_TAX_FIELDS]
  };
}
function buildIndex(registry) {
  const map = /* @__PURE__ */ new Map();
  for (const e of registry.entries) {
    const list = map.get(e.normalizedCode) || [];
    list.push(e);
    map.set(e.normalizedCode, list);
  }
  return map;
}
function loadFrenchTaxFieldRegistry() {
  if (cached2) return cached2;
  for (const path of ARTIFACT_CANDIDATES2) {
    if (!existsSync3(path)) continue;
    try {
      const raw = JSON.parse(readFileSync3(path, "utf8"));
      if (raw?.entries?.length) {
        cached2 = raw;
        byCode = buildIndex(raw);
        return cached2;
      }
    } catch {
    }
  }
  cached2 = buildSeedFieldRegistry("seed-runtime");
  byCode = buildIndex(cached2);
  return cached2;
}
function getFrenchTaxFieldIndex() {
  if (!byCode) loadFrenchTaxFieldRegistry();
  return byCode;
}
function lookupFieldByCode(code) {
  const key = code.toUpperCase().replace(/\s+/g, "");
  return getFrenchTaxFieldIndex().get(key) || [];
}

// lib/v4/knowledge/fr/tax/fields/normalizeFieldCode.ts
var FIELD_CODE_RE = /^([1-9])([A-Z]{1,2})$/;
function normalizeTaxFieldCode(raw) {
  const cleaned = String(raw || "").toUpperCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Z0-9]/g, "");
  if (!FIELD_CODE_RE.test(cleaned)) {
    return { normalizedCode: cleaned, valid: false };
  }
  return { normalizedCode: cleaned, valid: true };
}

// lib/v4/knowledge/fr/tax/fields/lookup.ts
function lookupTaxField(query) {
  const norm = normalizeTaxFieldCode(query.fieldCode);
  if (!norm.valid) {
    return { entry: null, matchKind: "none", reason: "invalidCode" };
  }
  const candidates = lookupFieldByCode(norm.normalizedCode);
  const pack3 = getPriorityTaxField(norm.normalizedCode);
  const pool = candidates.length ? candidates : pack3 ? [pack3] : [];
  if (!pool.length) {
    return { entry: null, matchKind: "none", reason: "unknownField" };
  }
  let filtered = pool;
  if (query.documentRef) {
    const ref = query.documentRef.toUpperCase();
    const byDoc = pool.filter(
      (e) => e.documentRefs.some((d) => d.toUpperCase() === ref)
    );
    if (byDoc.length) filtered = byDoc;
  }
  if (query.year != null) {
    const yearHits = filtered.filter((e) => e.applicableYears.includes(query.year));
    if (yearHits.length === 1) {
      return { entry: yearHits[0], matchKind: "exact", reason: "document+code+year" };
    }
    if (yearHits.length > 1) {
      const preferred = yearHits.find((e) => e.qualityStatus === "verified" && e.yearStable) || yearHits[0];
      return { entry: preferred, matchKind: "exact", reason: "document+code+year" };
    }
    const stable = filtered.find((e) => e.yearStable && e.qualityStatus === "verified");
    if (stable) {
      return {
        entry: {
          ...stable,
          qualityStatus: stable.qualityStatus === "verified" ? "partiallyVerified" : stable.qualityStatus
        },
        matchKind: "partial",
        reason: "yearNotListed-stableFallback"
      };
    }
    return {
      entry: filtered[0] ? { ...filtered[0], qualityStatus: "needsReview" } : null,
      matchKind: "partial",
      reason: "yearMismatch"
    };
  }
  const best = filtered.find((e) => e.qualityStatus === "verified") || filtered[0];
  return {
    entry: best,
    matchKind: query.documentRef ? "yearAgnostic" : "yearAgnostic",
    reason: query.documentRef ? "document+code" : "codeOnly"
  };
}
function knownTaxFieldCodes() {
  const reg = loadFrenchTaxFieldRegistry();
  return new Set(reg.entries.map((e) => e.normalizedCode));
}

// lib/v4/knowledge/fr/tax/fields/detectFields.ts
var FIELD_TOKEN_RE = /\b([1-9][A-Za-z]{1,2})\b/g;
var AMOUNT_RE = /((?:\d{1,3}(?:[ \u00a0]\d{3})+|\d{2,})(?:[.,]\d{2})?)\s*(?:€|EUR|euros?)?|(?:€|EUR)\s*((?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d{2})?)/gi;
function evidenceFor2(block) {
  return [
    {
      text: block.text,
      page: block.page,
      bbox: block.bbox ?? null,
      blockId: block.id,
      lineId: block.lineId ?? null
    }
  ];
}
function fiscalFieldContextScore(lex2, hasDocIdentity) {
  let s = 0;
  if (hasDocIdentity) s += 0.35;
  if (/case|cases|rubrique|declaration|formulaire|2042|2044|2047|impot|dgfip|finances\s+publiques|declarant/.test(
    lex2
  )) {
    s += 0.4;
  }
  if (/traitements|salaires|pensions|foncier|credit\s+d.?impot|rici/.test(lex2)) {
    s += 0.15;
  }
  if (/facture|client|iban|siret|immatriculation|commande|livraison|produit|sku|reference\s+client/.test(
    lex2
  )) {
    s -= 0.55;
  }
  if (/appartement|rue|avenue|boulevard|code\s+postal/.test(lex2)) s -= 0.35;
  return s;
}
function parseAmount(raw) {
  const cleaned = raw.replace(/\s|\u00a0/g, "").replace(/€|EUR|euros?/gi, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}
function extractAmountsNear(text, matchIndex, matchLen) {
  const out = [];
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const token = (m[1] || m[2] || "").trim();
    if (!token) continue;
    if (/^20[2-3]\d$/.test(token.replace(/\D/g, ""))) continue;
    if (/^204[0-9]$/.test(token.replace(/\D/g, ""))) continue;
    const dist = Math.min(
      Math.abs(m.index - (matchIndex + matchLen)),
      Math.abs(m.index + token.length - matchIndex)
    );
    if (dist > 48) continue;
    const numeric = parseAmount(token);
    if (numeric == null) continue;
    if (numeric < 10 && !/€|EUR/i.test(m[0])) continue;
    out.push({ value: token.trim(), numeric, distance: dist });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}
function checkboxStateFromContext(text, index) {
  const around = text.slice(Math.max(0, index - 24), index + 24).toLowerCase();
  if (/\[x\]|☑|☒|\bcoch[eé]e?\b|\boui\b/.test(around)) return "checked";
  if (/\[\s*\]|☐|\bnon\s+coch/.test(around)) return "unchecked";
  if (/cochez|à\s+cocher/.test(around)) return "notDetected";
  return "ambiguous";
}
function detectFrenchTaxFields(blocks, fiscalKnowledge) {
  const known = knownTaxFieldCodes();
  const docRef = fiscalKnowledge?.primaryIdentity?.normalized || fiscalKnowledge?.taxExplanation?.identity.reference || null;
  const hasIdentity = Boolean(
    fiscalKnowledge?.primaryIdentity?.role === "documentIdentity"
  );
  let yearHint = null;
  for (const r of fiscalKnowledge?.detectedReferences || []) {
    if (r.kind === "fiscalYear" && r.yearRole === "incomeYear") {
      yearHint = Number(r.normalized);
      break;
    }
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const block of blocks) {
    const text = block.text || "";
    const lex2 = normalizeLex(text);
    const ctx = fiscalFieldContextScore(lex2, hasIdentity);
    if (ctx < 0.35) continue;
    FIELD_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = FIELD_TOKEN_RE.exec(text)) !== null) {
      const raw = m[1];
      const { normalizedCode, valid } = normalizeTaxFieldCode(raw);
      if (!valid) continue;
      const inRegistry = known.has(normalizedCode);
      const explicitCase = new RegExp(
        `case\\s+${normalizedCode}|${normalizedCode}\\s*:`,
        "i"
      ).test(text);
      if (!inRegistry && !explicitCase) continue;
      if (!inRegistry && ctx < 0.7) continue;
      const explanatoryOnly = /voir\s+(la\s+)?case|reportez|conformement|notice/.test(lex2) && !/\d{2,}[ \u00a0.,]\d{2}/.test(text);
      const lookup = lookupTaxField({
        documentRef: docRef,
        fieldCode: normalizedCode,
        year: yearHint
      });
      const amounts = extractAmountsNear(text, m.index, raw.length);
      let presence = "notDetected";
      let detectedValue = null;
      let detectedNumericValue = null;
      let candidateValues = [];
      let confidence = Math.min(0.9, 0.4 + ctx * 0.4);
      const reasons = [`context:${ctx.toFixed(2)}`];
      if (lookup.entry) {
        reasons.push(`registry:${lookup.matchKind}`);
        confidence = Math.min(0.95, confidence + 0.15);
      } else {
        reasons.push("registry:none");
        confidence = Math.min(confidence, 0.45);
      }
      if (explanatoryOnly) {
        presence = "notDetected";
        confidence = Math.min(confidence, 0.4);
        reasons.push("role:explanatoryMention");
      } else if (lookup.entry?.valueType === "boolean") {
        const cb = checkboxStateFromContext(text, m.index);
        presence = cb === "checked" ? "presentWithValue" : cb === "unchecked" ? "presentEmpty" : "valueUnknown";
        detectedValue = cb === "checked" ? "checked" : cb === "unchecked" ? "unchecked" : null;
        reasons.push(`checkbox:${cb}`);
        if (cb === "ambiguous" || cb === "notDetected") confidence = Math.min(confidence, 0.5);
      } else if (amounts.length === 0) {
        if (/case|corrigez|montant|declarant/i.test(text)) {
          presence = "presentEmpty";
          reasons.push("value:empty");
        } else {
          presence = "valueUnknown";
          reasons.push("value:unknown");
        }
      } else if (amounts.length === 1 && amounts[0].distance <= 28) {
        presence = "presentWithValue";
        detectedValue = amounts[0].value;
        detectedNumericValue = amounts[0].numeric;
        confidence = Math.min(0.92, confidence + 0.12);
        reasons.push("value:adjacent");
      } else if (amounts.length > 1) {
        presence = "ambiguous";
        candidateValues = amounts.slice(0, 3).map((a) => ({
          value: a.value,
          confidence: Math.max(0.2, 0.6 - a.distance / 80)
        }));
        detectedValue = null;
        detectedNumericValue = null;
        confidence = Math.min(confidence, 0.45);
        reasons.push("value:ambiguous");
      } else {
        presence = "valueUnknown";
        reasons.push("value:far");
      }
      if (presence === "presentEmpty") {
        detectedValue = null;
        detectedNumericValue = null;
        reasons.push("emptyNotZero");
      }
      const key = `${normalizedCode}|${block.page}|${presence}|${detectedValue || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        fieldCode: normalizedCode,
        normalizedCode,
        page: block.page ?? null,
        presence,
        checkboxState: lookup.entry?.valueType === "boolean" ? checkboxStateFromContext(text, m.index) : null,
        detectedValue,
        detectedNumericValue,
        candidateValues: candidateValues?.length ? candidateValues : void 0,
        confidence,
        evidence: evidenceFor2(block),
        registryId: lookup.entry?.id || null,
        documentRefHint: docRef,
        yearHint,
        reasons
      });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

// lib/v4/knowledge/fr/tax/fields/explainTaxField.ts
var ROLE_LABELS = {
  declarant1: "D\xE9clarant 1",
  declarant2: "D\xE9clarant 2",
  dependent1: "1re personne \xE0 charge",
  dependent2: "2e personne \xE0 charge",
  household: "Foyer fiscal",
  unknown: "R\xF4le non pr\xE9cis\xE9"
};
function explainTaxField(detected) {
  const lookup = lookupTaxField({
    documentRef: detected.documentRefHint,
    fieldCode: detected.normalizedCode,
    year: detected.yearHint
  });
  const entry = lookup.entry;
  let taxFieldKnowledgePromotedToFact = 0;
  let unsupportedFieldValues = 0;
  let emptyFieldConvertedToZero = 0;
  let unverifiedFieldDefinitionPresentedAsVerified = 0;
  let documentValue = null;
  if (detected.presence === "presentWithValue" && detected.detectedValue && detected.evidence?.length) {
    documentValue = detected.detectedNumericValue != null && entry?.valueType === "amount" ? `${detected.detectedValue}` : detected.detectedValue;
  } else if (detected.presence === "presentEmpty") {
    documentValue = null;
    if (detected.detectedValue === "0" || detected.detectedNumericValue === 0) {
      emptyFieldConvertedToZero = 1;
      documentValue = null;
    }
  } else if (detected.presence === "ambiguous") {
    documentValue = null;
    unsupportedFieldValues = 1;
  }
  if (documentValue && entry?.plainLanguageWhat && documentValue.includes(entry.plainLanguageWhat.slice(0, 12))) {
    taxFieldKnowledgePromotedToFact = 1;
    documentValue = null;
  }
  if (entry?.qualityStatus !== "verified" && entry?.qualityStatus !== "partiallyVerified" && entry) {
  }
  if (!entry?.officialSources?.length && entry?.qualityStatus === "verified") {
    unverifiedFieldDefinitionPresentedAsVerified = 1;
  }
  const warnings = [];
  if (!entry) {
    warnings.push(
      "Case d\xE9tect\xE9e mais non pr\xE9sente dans le registre officiel local \u2014 aucune d\xE9finition n\u2019est affirm\xE9e."
    );
  } else if (entry.qualityStatus === "partiallyVerified") {
    warnings.push("La d\xE9finition de cette case n\u2019est que partiellement v\xE9rifi\xE9e.");
  } else if (entry.qualityStatus === "needsReview") {
    warnings.push("La d\xE9finition de cette case n\xE9cessite une revue.");
  }
  if (detected.presence === "ambiguous") {
    warnings.push(
      "Plusieurs valeurs sont proches de cette case : aucune n\u2019est rattach\xE9e avec certitude."
    );
  }
  if (detected.presence === "presentEmpty") {
    warnings.push("La case est pr\xE9sente mais aucune valeur n\u2019y est renseign\xE9e.");
  }
  if (lookup.matchKind === "partial") {
    warnings.push(
      "L\u2019ann\xE9e fiscale du document n\u2019est pas clairement align\xE9e avec la d\xE9finition utilis\xE9e."
    );
  }
  warnings.push(
    "Cette explication d\xE9crit le r\xF4le g\xE9n\xE9ral de la case ; elle ne constitue pas un conseil fiscal personnalis\xE9."
  );
  const presentedStatus = entry?.qualityStatus === "verified" && !entry.officialSources?.length ? "needsReview" : entry?.qualityStatus || null;
  return {
    fieldCode: detected.normalizedCode,
    label: entry?.label || null,
    section: entry?.section || null,
    whatIsIt: entry?.explanation || null,
    plainLanguageWhat: entry?.plainLanguageWhat || null,
    declarantRoleLabel: entry ? ROLE_LABELS[entry.declarantRole] || null : null,
    documentValue,
    presence: detected.presence,
    page: detected.page,
    qualityStatus: presentedStatus,
    provenance: entry?.provenance || [],
    confidence: Math.min(detected.confidence, entry?.confidence ?? detected.confidence),
    warnings,
    invariants: {
      taxFieldKnowledgePromotedToFact,
      unsupportedFieldValues,
      emptyFieldConvertedToZero,
      unverifiedFieldDefinitionPresentedAsVerified
    }
  };
}
function explainDetectedTaxFields(detected) {
  return detected.map(explainTaxField);
}

// lib/v4/knowledge/fr/tax/fields/requirements/documentFactIndex.ts
var factSeq = 0;
function nextFactId(prefix) {
  factSeq += 1;
  return `${prefix}-${factSeq}`;
}
function resetRequirementFactIdsForTests() {
  factSeq = 0;
}
function buildDocumentFactIndex(documents) {
  const out = [];
  for (const doc of documents) {
    const yearFromText = extractYear(doc.text || "");
    const docYear = doc.year ?? yearFromText;
    if (docYear != null) {
      out.push({
        factId: nextFactId("year"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || null,
        factType: "fiscalYear",
        value: docYear,
        displayValue: String(docYear),
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: doc.year != null ? 0.9 : 0.7,
        evidence: textEvidence(doc.text, String(docYear)),
        provenanceNote: "Ann\xE9e d\xE9tect\xE9e dans le document analys\xE9"
      });
    }
    if (doc.documentType) {
      out.push({
        factId: nextFactId("doc"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType,
        factType: "documentPresence",
        value: doc.documentType,
        displayValue: doc.label,
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: 0.85,
        evidence: textEvidence(doc.text, doc.label.slice(0, 40)),
        provenanceNote: "Type de document analys\xE9"
      });
    }
    for (const field3 of doc.detectedFields || []) {
      if (field3.presence === "presentWithValue" && field3.detectedValue != null) {
        out.push({
          factId: nextFactId(`field-${field3.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "fieldValue",
          value: field3.detectedNumericValue != null ? field3.detectedNumericValue : field3.detectedValue,
          displayValue: field3.detectedValue,
          year: field3.yearHint ?? docYear,
          declarantRole: inferRoleFromCode(field3.normalizedCode),
          fieldCode: field3.normalizedCode,
          confidence: field3.confidence,
          evidence: field3.evidence || [],
          provenanceNote: `Valeur documentaire associ\xE9e \xE0 la case ${field3.normalizedCode}`
        });
      } else if (field3.presence === "ambiguous") {
        for (const c of field3.candidateValues || []) {
          out.push({
            factId: nextFactId(`amb-${field3.normalizedCode}`),
            sourceDocumentId: doc.id,
            sourceDocumentLabel: doc.label,
            documentType: doc.documentType || null,
            factType: "amount",
            value: c.value,
            displayValue: c.value,
            year: field3.yearHint ?? docYear,
            declarantRole: inferRoleFromCode(field3.normalizedCode),
            fieldCode: field3.normalizedCode,
            confidence: Math.min(c.confidence, 0.55),
            evidence: field3.evidence || [],
            provenanceNote: `Montant candidat ambigu pr\xE8s de la case ${field3.normalizedCode}`
          });
        }
      } else if (field3.presence === "presentEmpty") {
        out.push({
          factId: nextFactId(`empty-${field3.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "fieldValue",
          value: null,
          displayValue: null,
          year: field3.yearHint ?? docYear,
          declarantRole: inferRoleFromCode(field3.normalizedCode),
          fieldCode: field3.normalizedCode,
          confidence: field3.confidence,
          evidence: field3.evidence || [],
          provenanceNote: `Case ${field3.normalizedCode} pr\xE9sente sans valeur`
        });
      }
      const role = inferRoleFromCode(field3.normalizedCode);
      if (role && role !== "household" && role !== "unknown") {
        out.push({
          factId: nextFactId(`role-${field3.normalizedCode}`),
          sourceDocumentId: doc.id,
          sourceDocumentLabel: doc.label,
          documentType: doc.documentType || null,
          factType: "declarantRole",
          value: role,
          displayValue: role,
          year: field3.yearHint ?? docYear,
          declarantRole: role,
          fieldCode: field3.normalizedCode,
          confidence: 0.8,
          evidence: field3.evidence || [],
          provenanceNote: "R\xF4le fiscal associ\xE9 \xE0 la case selon le registre"
        });
      }
    }
    for (const loose of doc.looseFacts || []) {
      out.push({
        factId: nextFactId(`loose-${loose.factType}`),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || null,
        factType: loose.factType,
        value: loose.value,
        displayValue: loose.displayValue ?? (loose.value == null ? null : String(loose.value)),
        year: loose.year ?? docYear,
        declarantRole: loose.declarantRole ?? null,
        fieldCode: loose.fieldCode ?? null,
        confidence: loose.confidence ?? 0.6,
        evidence: loose.evidence || textEvidence(doc.text, String(loose.value ?? "")),
        provenanceNote: "Fait documentaire index\xE9"
      });
    }
    const text = (doc.text || "").toLowerCase();
    if (/attestation\s+fiscale|cesu|emploi\s+[àa]\s+domicile|services?\s+[àa]\s+la\s+personne/.test(
      text
    )) {
      const amountMatch = text.match(
        /(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{2})?)\s*€/
      );
      out.push({
        factId: nextFactId("attestation"),
        sourceDocumentId: doc.id,
        sourceDocumentLabel: doc.label,
        documentType: doc.documentType || "taxCertificate",
        factType: "taxCertificate",
        value: amountMatch ? amountMatch[1] : "attestation",
        displayValue: amountMatch ? `${amountMatch[1]} \u20AC` : doc.label,
        year: docYear,
        declarantRole: null,
        fieldCode: null,
        confidence: 0.65,
        evidence: textEvidence(doc.text, amountMatch?.[0] || "attestation fiscale"),
        provenanceNote: "Document analys\xE9 mentionnant une attestation / emploi \xE0 domicile"
      });
    }
  }
  return out;
}
function extractYear(text) {
  const m = text.match(
    /(?:revenus?\s+de\s+l['’]?année|année|exercice|millésime)\s*(20\d{2})/i
  );
  if (m) return Number(m[1]);
  const bare = text.match(/\b(202[4-6])\b/);
  return bare ? Number(bare[1]) : null;
}
function textEvidence(text, needle) {
  if (!text || !needle) return [];
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) {
    return [
      {
        page: 1,
        text: text.slice(0, 80)
      }
    ];
  }
  return [
    {
      page: 1,
      text: text.slice(Math.max(0, idx - 20), idx + needle.length + 20)
    }
  ];
}
function inferRoleFromCode(code) {
  if (/^[123]A[A-Z]$/.test(code) || code === "1AJ" || code === "1AS" || code === "1AP" || code === "1AK" || code === "1AF") {
    return "declarant1";
  }
  if (code === "1BJ" || code === "1BS" || code === "1BP" || code === "1BK") {
    return "declarant2";
  }
  if (code === "1CJ" || code === "1CS") return "dependent1";
  if (code === "1DJ" || code === "1DS") return "dependent2";
  if (/^[2478]/.test(code)) return "household";
  return "unknown";
}

// lib/v4/knowledge/fr/tax/fields/requirements/buildQuestions.ts
var PRIORITY_ORDER = {
  blocking: 1,
  ambiguity: 2,
  yearUnknown: 3,
  declarantUnknown: 4,
  supportingDocument: 5,
  secondary: 6
};
var MAX_PRIORITY_QUESTIONS = 3;
function buildTaxFieldQuestions(requirements, evaluated) {
  const byId = new Map(evaluated.map((e) => [e.requirementId, e]));
  const questions = [];
  for (const req2 of requirements) {
    if (!req2.questionTemplate || !req2.expectedAnswerType) continue;
    const ev = byId.get(req2.id);
    if (!ev) continue;
    if (ev.status !== "missing" && ev.status !== "ambiguous" && ev.status !== "notChecked" && ev.status !== "unknown") {
      continue;
    }
    let priority = req2.priority;
    if (ev.status === "ambiguous") priority = "ambiguity";
    questions.push({
      requirementId: req2.id,
      question: req2.questionTemplate,
      expectedAnswerType: req2.expectedAnswerType,
      reason: reasonFor(ev),
      priority,
      provenance: req2.provenance || []
    });
  }
  return sortQuestions(questions);
}
function selectPriorityQuestions(questions, max = MAX_PRIORITY_QUESTIONS) {
  return sortQuestions([...questions]).slice(0, max);
}
function sortQuestions(questions) {
  return [...questions].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] || 99) - (PRIORITY_ORDER[b.priority] || 99)
  );
}
function reasonFor(ev) {
  switch (ev.status) {
    case "missing":
      return "Cette information n\u2019a pas \xE9t\xE9 retrouv\xE9e dans les \xE9l\xE9ments analys\xE9s.";
    case "ambiguous":
      return "Plusieurs \xE9l\xE9ments candidats ont \xE9t\xE9 d\xE9tect\xE9s ; une pr\xE9cision serait utile.";
    case "notChecked":
      return "Cette information n\u2019a pas encore \xE9t\xE9 confront\xE9e aux documents analys\xE9s.";
    default:
      return "Une pr\xE9cision permettrait de mieux comprendre cette case.";
  }
}

// lib/v4/knowledge/fr/tax/fields/requirements/loadRegistry.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname4, join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// lib/v4/knowledge/fr/tax/fields/requirements/priorityRequirements.ts
var RETRIEVED4 = "2026-08-08";
var YEARS_STABLE2 = [2024, 2025, 2026];
function src3(url, title, supports) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED4,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
var SRC_2042_NOTICE2 = src3(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice \u2014 Remplir la d\xE9claration de revenus 2024 (formulaire 2042)",
  [
    "informationRequirements",
    "possibleSupportingDocuments",
    "generalConditions",
    "expectedValueType"
  ]
);
var SRC_SALAIRES_BROCHURE2 = src3(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR \u2014 Traitements et salaires",
  ["informationRequirements", "possibleSupportingDocuments"]
);
var SRC_FONCIERS_BROCHURE2 = src3(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR \u2014 Revenus fonciers",
  ["informationRequirements", "generalConditions", "possibleSupportingDocuments"]
);
var SRC_FONCIERS_AIDE2 = src3(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR \u2014 revenus fonciers (cases 4BA \xE0 4EA)",
  ["informationRequirements", "generalConditions", "relatedFields"]
);
var SRC_2044_FORM2 = src3(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n\xB02044 \u2014 D\xE9claration des revenus fonciers",
  ["possibleSupportingDocuments", "documentRefs"]
);
var SRC_2042_FORM2 = src3(
  "https://www.impots.gouv.fr/formulaire/2042/declaration-des-revenus",
  "Formulaire n\xB02042 \u2014 D\xE9claration des revenus",
  ["documentRefs"]
);
function req(partial) {
  return partial;
}
function support(partial) {
  return partial;
}
function cond(partial) {
  return partial;
}
function pack2(partial) {
  const normalizedCode = partial.fieldCode.toUpperCase().replace(/\s+/g, "");
  return {
    id: `fr-tax-req-${normalizedCode.toLowerCase()}`,
    documentRef: partial.documentRef,
    documentRefs: partial.documentRefs,
    fieldCode: normalizedCode,
    normalizedCode,
    applicableYears: partial.applicableYears,
    yearStable: partial.yearStable ?? true,
    expectedValueType: partial.expectedValueType,
    informationRequirements: partial.informationRequirements,
    possibleSupportingDocuments: partial.possibleSupportingDocuments,
    generalConditions: partial.generalConditions,
    relatedFields: partial.relatedFields,
    provenance: partial.provenance,
    qualityStatus: partial.qualityStatus,
    lastVerifiedAt: partial.lastVerifiedAt ?? RETRIEVED4
  };
}
function salaryRequirements(code, role, roleLabel, related) {
  return pack2({
    documentRef: "2042",
    documentRefs: ["2042"],
    fieldCode: code,
    applicableYears: YEARS_STABLE2,
    expectedValueType: "amount",
    relatedFields: related,
    provenance: [SRC_2042_NOTICE2, SRC_SALAIRES_BROCHURE2],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: `${code.toLowerCase()}-amount`,
        kind: "amount",
        label: `Montant des traitements et salaires du ${roleLabel}`,
        description: "Les sources officielles indiquent que cette case concerne le montant des traitements et salaires imposables pour le r\xF4le fiscal concern\xE9.",
        priority: "blocking",
        expectedValueType: "amount",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: [code],
            declarantRoleHints: [role],
            documentTypeHints: ["incomeTaxReturn", "taxForm"],
            rejectDocumentTypes: ["invoice", "bankStatement", "contract"],
            rejectKeywords: ["facture", "ttc", "sku", "commande"]
          }
        ],
        provenance: [SRC_2042_NOTICE2, SRC_SALAIRES_BROCHURE2],
        questionTemplate: `Disposez-vous du montant des traitements et salaires du ${roleLabel} pour l\u2019ann\xE9e concern\xE9e ?`,
        expectedAnswerType: "amount"
      }),
      req({
        id: `${code.toLowerCase()}-year`,
        kind: "year",
        label: "Ann\xE9e des revenus",
        description: "L\u2019ann\xE9e des revenus doit correspondre au mill\xE9sime de la d\xE9claration pour interpr\xE9ter correctement cette case.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true,
            documentTypeHints: ["incomeTaxReturn", "taxForm", "payslip"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "De quelle ann\xE9e de revenus ce document / ce montant rel\xE8ve-t-il ?",
        expectedAnswerType: "year"
      }),
      req({
        id: `${code.toLowerCase()}-role`,
        kind: "declarantRole",
        label: `R\xF4le fiscal (${roleLabel})`,
        description: `Cette case est associ\xE9e au ${roleLabel} selon la notice. Il convient de v\xE9rifier que le montant concerne bien ce r\xF4le.`,
        priority: "declarantUnknown",
        expectedValueType: "text",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["declarantRole", "fieldValue"],
            fieldCodeHints: [code],
            declarantRoleHints: [role],
            keywords: [roleLabel, role === "declarant1" ? "d\xE9clarant 1" : "d\xE9clarant 2"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: `Le montant concerne-t-il bien le ${roleLabel} ?`,
        expectedAnswerType: "declarant"
      }),
      req({
        id: `${code.toLowerCase()}-employer-doc`,
        kind: "documentPresence",
        label: "Justificatif employeur / pr\xE9rempli",
        description: "Les montants de salaires peuvent figurer sur des documents employeur ou dans les donn\xE9es pr\xE9remplies ; leur pr\xE9sence aide \xE0 comprendre la case, sans d\xE9terminer automatiquement ce qu\u2019il faut d\xE9clarer.",
        priority: "supportingDocument",
        expectedValueType: "unknown",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["documentPresence", "amount"],
            documentTypeHints: ["payslip", "taxCertificate", "employerDocument"],
            keywords: [
              "bulletin de paie",
              "attestation fiscale",
              "r\xE9mun\xE9ration",
              "salaire net imposable"
            ],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture ttc", "bon de commande"]
          }
        ],
        provenance: [SRC_SALAIRES_BROCHURE2, SRC_2042_NOTICE2],
        questionTemplate: "Avez-vous un bulletin de paie ou une attestation fiscale employeur correspondant \xE0 cette p\xE9riode ?",
        expectedAnswerType: "document"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: `${code.toLowerCase()}-sup-payslip`,
        label: "Bulletin de paie / document employeur",
        description: "Document pouvant contenir le salaire net imposable ou des \xE9l\xE9ments utiles pour comprendre les traitements et salaires.",
        documentTypeHints: ["payslip", "employerDocument"],
        normative: true,
        provenance: [SRC_SALAIRES_BROCHURE2]
      }),
      support({
        id: `${code.toLowerCase()}-sup-prefilled`,
        label: "Donn\xE9es pr\xE9remplies / attestation fiscale",
        description: "Les sources officielles \xE9voquent des montants pr\xE9remplis et des \xE9l\xE9ments issus de d\xE9clarations sociales ; utiles pour v\xE9rifier, pas pour conclure automatiquement.",
        documentTypeHints: ["taxCertificate", "incomeTaxReturn"],
        normative: true,
        provenance: [SRC_2042_NOTICE2, SRC_SALAIRES_BROCHURE2]
      }),
      support({
        id: `${code.toLowerCase()}-sup-generic-bank`,
        label: "Relev\xE9 bancaire (suggestion g\xE9n\xE9rique)",
        description: "Suggestion g\xE9n\xE9rique non normative : un relev\xE9 peut parfois aider \xE0 situer des versements, sans prouver le montant \xE0 reporter en case.",
        documentTypeHints: ["bankStatement"],
        normative: false,
        provenance: [SRC_2042_NOTICE2]
      })
    ],
    generalConditions: [
      cond({
        id: `${code.toLowerCase()}-cond-taxable`,
        statement: "Cette rubrique concerne g\xE9n\xE9ralement les traitements et salaires imposables selon les r\xE8gles de la d\xE9claration des revenus ; certaines situations particuli\xE8res sont d\xE9taill\xE9es dans la notice.",
        provenance: [SRC_2042_NOTICE2, SRC_SALAIRES_BROCHURE2]
      })
    ]
  });
}
function foncierRequirements(code, label, description, valueType, related, extraConditions = []) {
  return pack2({
    documentRef: "2042",
    documentRefs: ["2042", "2044"],
    fieldCode: code,
    applicableYears: YEARS_STABLE2,
    expectedValueType: valueType,
    relatedFields: related,
    provenance: [SRC_2042_NOTICE2, SRC_FONCIERS_AIDE2, SRC_FONCIERS_BROCHURE2],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: `${code.toLowerCase()}-amount`,
        kind: "amount",
        label,
        description,
        priority: "blocking",
        expectedValueType: valueType,
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: [code],
            documentTypeHints: ["incomeTaxReturn", "taxForm", "rentalIncomeDeclaration"],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture", "ttc", "commande"]
          }
        ],
        provenance: [SRC_2042_NOTICE2, SRC_FONCIERS_AIDE2],
        questionTemplate: `Disposez-vous du montant concern\xE9 par la case ${code} pour l\u2019ann\xE9e des revenus ?`,
        expectedAnswerType: "amount"
      }),
      req({
        id: `${code.toLowerCase()}-year`,
        kind: "year",
        label: "Ann\xE9e des revenus fonciers",
        description: "Les revenus fonciers se rapportent \xE0 une ann\xE9e pr\xE9cise ; un mill\xE9sime diff\xE9rent ne doit pas \xEAtre appliqu\xE9 silencieusement.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true,
            documentTypeHints: [
              "incomeTaxReturn",
              "taxForm",
              "rentalIncomeDeclaration"
            ]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "De quelle ann\xE9e de revenus fonciers s\u2019agit-il ?",
        expectedAnswerType: "year"
      }),
      req({
        id: `${code.toLowerCase()}-2044`,
        kind: "documentPresence",
        label: "D\xE9claration annexe 2044 (r\xE9gime r\xE9el)",
        description: "Pour le r\xE9gime r\xE9el, les sources officielles indiquent souvent un calcul via la d\xE9claration n\xB02044 avant report sur la 2042.",
        priority: "supportingDocument",
        expectedValueType: "unknown",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["documentPresence", "fieldValue", "amount"],
            documentTypeHints: ["rentalIncomeDeclaration", "taxForm"],
            keywords: ["2044", "revenus fonciers", "r\xE9gime r\xE9el"],
            rejectDocumentTypes: ["invoice"]
          }
        ],
        provenance: [SRC_2042_NOTICE2, SRC_2044_FORM2, SRC_FONCIERS_AIDE2],
        questionTemplate: "Avez-vous une d\xE9claration n\xB02044 (ou un document de calcul des revenus fonciers au r\xE9gime r\xE9el) pour cette ann\xE9e ?",
        expectedAnswerType: "document"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: `${code.toLowerCase()}-sup-2044`,
        label: "D\xE9claration n\xB02044 \u2014 revenus fonciers",
        description: "Formulaire officiel souvent utilis\xE9 pour d\xE9terminer les montants report\xE9s en cases fonci\xE8res au r\xE9gime r\xE9el.",
        documentTypeHints: ["rentalIncomeDeclaration", "taxForm"],
        normative: true,
        provenance: [SRC_2044_FORM2, SRC_FONCIERS_AIDE2]
      }),
      support({
        id: `${code.toLowerCase()}-sup-rent`,
        label: "Justificatif immobilier / loyers (suggestion g\xE9n\xE9rique)",
        description: "Suggestion g\xE9n\xE9rique non normative : quittances ou d\xE9comptes peuvent aider \xE0 comprendre la situation, sans fixer seuls le montant de la case.",
        documentTypeHints: ["propertyDocument", "bankStatement"],
        normative: false,
        provenance: [SRC_FONCIERS_BROCHURE2]
      })
    ],
    generalConditions: [
      cond({
        id: `${code.toLowerCase()}-cond-regime`,
        statement: "Cette rubrique peut d\xE9pendre du r\xE9gime d\u2019imposition des revenus fonciers (notamment micro-foncier ou r\xE9gime r\xE9el) et des r\xE8gles de report pr\xE9vues par la notice.",
        provenance: [SRC_2042_NOTICE2, SRC_FONCIERS_AIDE2, SRC_FONCIERS_BROCHURE2]
      }),
      ...extraConditions
    ]
  });
}
var PRIORITY_TAX_FIELD_REQUIREMENTS = [
  salaryRequirements("1AJ", "declarant1", "d\xE9clarant 1", ["1BJ", "1CJ", "1DJ"]),
  salaryRequirements("1BJ", "declarant2", "d\xE9clarant 2", ["1AJ", "1CJ", "1DJ"]),
  foncierRequirements(
    "4BA",
    "Revenu foncier net imposable (r\xE9gime r\xE9el)",
    "Les sources officielles indiquent que la case 4BA sert au report du revenu net foncier d\xE9termin\xE9 selon le r\xE9gime r\xE9el.",
    "amount",
    ["4BB", "4BC", "4BD", "4BE"]
  ),
  foncierRequirements(
    "4BB",
    "D\xE9ficit foncier imputable sur les revenus fonciers",
    "Les sources officielles indiquent que la case 4BB concerne un d\xE9ficit imputable sur les revenus fonciers des ann\xE9es suivantes.",
    "amount",
    ["4BA", "4BC", "4BD"],
    [
      cond({
        id: "4bb-cond-deficit",
        statement: "Cette rubrique peut d\xE9pendre de l\u2019existence d\u2019un d\xE9ficit foncier et des r\xE8gles d\u2019imputation pr\xE9vues par la notice ; aucune conclusion d\u2019\xE9ligibilit\xE9 n\u2019est tir\xE9e ici.",
        provenance: [SRC_FONCIERS_AIDE2, SRC_2042_NOTICE2]
      })
    ]
  ),
  foncierRequirements(
    "4BC",
    "D\xE9ficit foncier imputable sur le revenu global",
    "Les sources officielles indiquent que la case 4BC concerne un d\xE9ficit pouvant s\u2019imputer sur le revenu brut global dans les conditions pr\xE9vues.",
    "amount",
    ["4BA", "4BB", "4BD"],
    [
      cond({
        id: "4bc-cond-global",
        statement: "Cette rubrique peut d\xE9pendre de certaines conditions d\u2019imputation sur le revenu global d\xE9crites par les sources officielles.",
        provenance: [SRC_FONCIERS_AIDE2, SRC_2042_NOTICE2]
      })
    ]
  ),
  pack2({
    documentRef: "2042-RICI",
    documentRefs: ["2042", "2042-RICI"],
    fieldCode: "7DB",
    applicableYears: YEARS_STABLE2,
    expectedValueType: "amount",
    relatedFields: ["7DR", "7GA"],
    provenance: [SRC_2042_NOTICE2],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: "7db-amount",
        kind: "amount",
        label: "Montant total des d\xE9penses d\u2019emploi \xE0 domicile",
        description: "Les sources officielles indiquent que la case 7DB concerne le montant total des d\xE9penses li\xE9es \xE0 l\u2019emploi \xE0 domicile ouvrant droit \xE0 cr\xE9dit d\u2019imp\xF4t, sans d\xE9duire les aides.",
        priority: "blocking",
        expectedValueType: "amount",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: ["7DB"],
            documentTypeHints: [
              "incomeTaxReturn",
              "taxForm",
              "taxCertificate",
              "taxCreditDocument"
            ],
            keywords: [
              "emploi \xE0 domicile",
              "services \xE0 la personne",
              "7DB",
              "d\xE9penses"
            ],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture n", "total ttc", "sku"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "Disposez-vous du montant total des d\xE9penses d\u2019emploi \xE0 domicile pour l\u2019ann\xE9e concern\xE9e ?",
        expectedAnswerType: "amount"
      }),
      req({
        id: "7db-year",
        kind: "year",
        label: "Ann\xE9e des d\xE9penses",
        description: "Les d\xE9penses d\u2019emploi \xE0 domicile se rapportent \xE0 une ann\xE9e pr\xE9cise.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true,
            documentTypeHints: [
              "incomeTaxReturn",
              "taxForm",
              "taxCertificate"
            ]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "De quelle ann\xE9e ces d\xE9penses d\u2019emploi \xE0 domicile rel\xE8vent-elles ?",
        expectedAnswerType: "year"
      }),
      req({
        id: "7db-attestation",
        kind: "documentPresence",
        label: "Attestation fiscale / justificatif d\u2019emploi \xE0 domicile",
        description: "Un document analys\xE9 peut contenir une information potentiellement pertinente (attestation fiscale ou relev\xE9 de d\xE9penses) pour comprendre la case 7DB, sans conclure au montant \xE0 reporter.",
        priority: "supportingDocument",
        expectedValueType: "unknown",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["documentPresence", "amount", "taxCertificate"],
            documentTypeHints: [
              "taxCertificate",
              "taxCreditDocument",
              "employerDocument"
            ],
            keywords: [
              "attestation fiscale",
              "cesu",
              "emploi \xE0 domicile",
              "services \xE0 la personne",
              "cr\xE9dit d'imp\xF4t"
            ],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture n\xB0", "bon de commande", "total ttc"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "Avez-vous une attestation fiscale correspondant \xE0 ces d\xE9penses d\u2019emploi \xE0 domicile ?",
        expectedAnswerType: "document"
      }),
      req({
        id: "7db-aids",
        kind: "amount",
        label: "Aides per\xE7ues (souvent li\xE9es \xE0 la case 7DR)",
        description: "Les aides per\xE7ues pour financer l\u2019emploi \xE0 domicile sont g\xE9n\xE9ralement indiqu\xE9es s\xE9par\xE9ment (case 7DR) et ne doivent pas \xEAtre d\xE9duites du montant de la 7DB dans le document source.",
        priority: "secondary",
        expectedValueType: "amount",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: ["7DR"],
            keywords: ["aides", "7DR", "apa", "pch", "cesu pr\xE9financ\xE9"],
            rejectDocumentTypes: ["invoice"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "Avez-vous per\xE7u des aides pour financer l\u2019emploi \xE0 domicile (information souvent li\xE9e \xE0 la case 7DR) ?",
        expectedAnswerType: "yesNo"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: "7db-sup-attestation",
        label: "Attestation fiscale (emploi \xE0 domicile / services \xE0 la personne)",
        description: "Document souvent utile pour comprendre les d\xE9penses prises en compte pour le cr\xE9dit d\u2019imp\xF4t li\xE9 \xE0 l\u2019emploi \xE0 domicile.",
        documentTypeHints: ["taxCertificate", "taxCreditDocument"],
        normative: true,
        provenance: [SRC_2042_NOTICE2]
      }),
      support({
        id: "7db-sup-payment",
        label: "Justificatif de paiement (suggestion g\xE9n\xE9rique)",
        description: "Suggestion g\xE9n\xE9rique non normative : un justificatif de paiement peut aider \xE0 situer une d\xE9pense, sans \xE9tablir seul le montant de la case.",
        documentTypeHints: ["bankStatement", "paymentProof"],
        normative: false,
        provenance: [SRC_2042_NOTICE2]
      })
    ],
    generalConditions: [
      cond({
        id: "7db-cond-credit",
        statement: "Cette rubrique peut d\xE9pendre de certaines conditions relatives au cr\xE9dit d\u2019imp\xF4t pour l\u2019emploi d\u2019un salari\xE9 \xE0 domicile, d\xE9crites par la notice officielle.",
        provenance: [SRC_2042_NOTICE2]
      }),
      cond({
        id: "7db-cond-aids",
        statement: "Les sources officielles indiquent de ne pas d\xE9duire les aides du montant port\xE9 en 7DB ; les aides sont g\xE9n\xE9ralement report\xE9es s\xE9par\xE9ment.",
        provenance: [SRC_2042_NOTICE2]
      })
    ]
  }),
  pack2({
    documentRef: "2042-RICI",
    documentRefs: ["2042", "2042-RICI"],
    fieldCode: "7DR",
    applicableYears: YEARS_STABLE2,
    expectedValueType: "amount",
    relatedFields: ["7DB"],
    provenance: [SRC_2042_NOTICE2],
    qualityStatus: "verified",
    informationRequirements: [
      req({
        id: "7dr-amount",
        kind: "amount",
        label: "Montant des aides per\xE7ues pour l\u2019emploi \xE0 domicile",
        description: "Les sources officielles indiquent que la case 7DR concerne le montant des aides per\xE7ues pour financer les d\xE9penses d\u2019emploi \xE0 domicile.",
        priority: "blocking",
        expectedValueType: "amount",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: ["7DR"],
            documentTypeHints: [
              "incomeTaxReturn",
              "taxForm",
              "taxCertificate"
            ],
            keywords: ["aides", "7DR", "apa", "pch"],
            rejectDocumentTypes: ["invoice"],
            rejectKeywords: ["facture", "ttc"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "Disposez-vous du montant des aides per\xE7ues pour l\u2019emploi \xE0 domicile ?",
        expectedAnswerType: "amount"
      }),
      req({
        id: "7dr-year",
        kind: "year",
        label: "Ann\xE9e des aides",
        description: "Les aides se rapportent \xE0 une ann\xE9e pr\xE9cise.",
        priority: "yearUnknown",
        expectedValueType: "unknown",
        blocking: true,
        factMatchers: [
          {
            factTypes: ["fiscalYear", "year"],
            yearRequired: true
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "De quelle ann\xE9e ces aides rel\xE8vent-elles ?",
        expectedAnswerType: "year"
      }),
      req({
        id: "7dr-link-7db",
        kind: "documentPresence",
        label: "Lien avec les d\xE9penses (case 7DB)",
        description: "Comprendre la 7DR implique souvent de situer aussi les d\xE9penses d\xE9clar\xE9es en 7DB ; aucune agr\xE9gation automatique n\u2019est effectu\xE9e.",
        priority: "secondary",
        expectedValueType: "amount",
        blocking: false,
        factMatchers: [
          {
            factTypes: ["fieldValue", "amount"],
            fieldCodeHints: ["7DB"],
            keywords: ["7DB", "d\xE9penses", "emploi \xE0 domicile"]
          }
        ],
        provenance: [SRC_2042_NOTICE2],
        questionTemplate: "Disposez-vous aussi du montant des d\xE9penses d\u2019emploi \xE0 domicile (souvent case 7DB) ?",
        expectedAnswerType: "yesNo"
      })
    ],
    possibleSupportingDocuments: [
      support({
        id: "7dr-sup-aid",
        label: "Justificatif d\u2019aide (APA, PCH, CESU pr\xE9financ\xE9, etc.)",
        description: "Document pouvant pr\xE9ciser les aides per\xE7ues pour financer l\u2019emploi \xE0 domicile.",
        documentTypeHints: ["taxCertificate", "administrativeLetter"],
        normative: true,
        provenance: [SRC_2042_NOTICE2]
      })
    ],
    generalConditions: [
      cond({
        id: "7dr-cond",
        statement: "Cette rubrique concerne les aides per\xE7ues pour financer les d\xE9penses d\u2019emploi \xE0 domicile, \xE0 indiquer s\xE9par\xE9ment des d\xE9penses selon la notice.",
        provenance: [SRC_2042_NOTICE2]
      })
    ]
  })
];
var PRIORITY_TAX_FIELD_REQUIREMENTS_BY_CODE = new Map(
  PRIORITY_TAX_FIELD_REQUIREMENTS.map((e) => [e.normalizedCode, e])
);

// lib/v4/knowledge/fr/tax/fields/requirements/loadRegistry.ts
var FRENCH_TAX_FIELD_REQUIREMENTS_VERSION = "2026.08.08-v4q1";
var HERE4 = dirname4(fileURLToPath4(import.meta.url));
var ARTIFACT_CANDIDATES3 = [
  join4(
    HERE4,
    "../../../../../../../generated/french-tax-field-requirements.json"
  ),
  join4(process.cwd(), "generated/french-tax-field-requirements.json")
];
var cached3 = null;
var byCode2 = null;
function buildSeedRequirementsRegistry(generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    version: FRENCH_TAX_FIELD_REQUIREMENTS_VERSION,
    country: "FR",
    generatedAt,
    sourceMode: "curated-official",
    entries: [...PRIORITY_TAX_FIELD_REQUIREMENTS]
  };
}
function buildIndex2(registry) {
  const map = /* @__PURE__ */ new Map();
  for (const e of registry.entries) {
    const list = map.get(e.normalizedCode) || [];
    list.push(e);
    map.set(e.normalizedCode, list);
  }
  return map;
}
function loadFrenchTaxFieldRequirementsRegistry() {
  if (cached3) return cached3;
  for (const path of ARTIFACT_CANDIDATES3) {
    if (!existsSync4(path)) continue;
    try {
      const raw = JSON.parse(
        readFileSync4(path, "utf8")
      );
      if (raw?.entries?.length) {
        cached3 = raw;
        byCode2 = buildIndex2(raw);
        return cached3;
      }
    } catch {
    }
  }
  cached3 = buildSeedRequirementsRegistry("seed-runtime");
  byCode2 = buildIndex2(cached3);
  return cached3;
}
function getFrenchTaxFieldRequirementsIndex() {
  if (!byCode2) loadFrenchTaxFieldRequirementsRegistry();
  return byCode2;
}

// lib/v4/knowledge/fr/tax/fields/requirements/lookup.ts
function lookupTaxFieldRequirements(query) {
  loadFrenchTaxFieldRequirementsRegistry();
  const code = query.fieldCode.toUpperCase().replace(/\s+/g, "");
  const candidates = getFrenchTaxFieldRequirementsIndex().get(code) || [];
  const reasons = [];
  if (!candidates.length) {
    return { entry: null, matchKind: "none", reasons: ["requirement_absent"] };
  }
  let pool = candidates;
  if (query.documentRef) {
    const ref = query.documentRef.toUpperCase();
    const filtered = candidates.filter(
      (e) => e.documentRefs.some((r) => r.toUpperCase() === ref || ref.includes(r.toUpperCase()))
    );
    if (filtered.length) {
      pool = filtered;
      reasons.push("documentRef_match");
    } else {
      reasons.push("documentRef_mismatch_kept_code_only");
    }
  }
  const entry = pool[0];
  if (query.year == null) {
    reasons.push("year_unknown");
    return {
      entry,
      matchKind: entry.yearStable ? "stable" : "partial",
      reasons
    };
  }
  if (entry.applicableYears.includes(query.year)) {
    reasons.push("year_exact");
    return { entry, matchKind: "exact", reasons };
  }
  if (entry.yearStable) {
    reasons.push("year_outside_list_but_marked_stable_needs_review");
    return { entry, matchKind: "partial", reasons };
  }
  reasons.push("year_mismatch");
  return { entry: null, matchKind: "none", reasons };
}

// lib/v4/knowledge/fr/tax/fields/requirements/matchRequirements.ts
function findCandidateFactsForRequirement(requirement, facts) {
  const matchers = requirement.factMatchers || [];
  if (!matchers.length) {
    return {
      status: "notChecked",
      candidateFacts: [],
      evidenceLinks: [],
      aggregatedValue: null,
      matchNotes: ["no_matcher"]
    };
  }
  const candidates = [];
  const links = [];
  const notes = [];
  for (const fact of facts) {
    for (const matcher of matchers) {
      const verdict = scoreFactAgainstMatcher(fact, matcher, requirement);
      if (!verdict) continue;
      if (candidates.some((c) => c.factId === fact.factId)) {
      } else {
        candidates.push(fact);
      }
      links.push({
        requirementId: requirement.id,
        factId: fact.factId,
        confidence: verdict.confidence,
        evidence: fact.evidence || [],
        matchReason: verdict.reason,
        status: verdict.status
      });
      notes.push(verdict.reason);
    }
  }
  if (!candidates.length) {
    return {
      status: "missing",
      candidateFacts: [],
      evidenceLinks: [],
      aggregatedValue: null,
      matchNotes: ["no_candidate_in_analyzed_materials"]
    };
  }
  const strong = links.filter((l) => l.status === "strong");
  const ambiguous = links.filter((l) => l.status === "ambiguous");
  const amounts = candidates.filter(
    (c) => c.factType === "amount" || c.factType === "fieldValue" || typeof c.value === "number"
  );
  if (requirement.kind === "amount" && amounts.length > 1 && strong.length !== 1) {
    return {
      status: "ambiguous",
      candidateFacts: candidates,
      evidenceLinks: links.map(
        (l) => l.status === "strong" ? { ...l, status: "ambiguous" } : l
      ),
      aggregatedValue: null,
      matchNotes: [...notes, "multiple_amounts_no_aggregation"]
    };
  }
  if (ambiguous.length && !strong.length) {
    return {
      status: "ambiguous",
      candidateFacts: candidates,
      evidenceLinks: links,
      aggregatedValue: null,
      matchNotes: [...notes, "only_ambiguous_matches"]
    };
  }
  if (requirement.kind === "amount") {
    const emptyOnly = candidates.every(
      (c) => c.value == null || c.displayValue == null
    );
    if (emptyOnly) {
      return {
        status: "missing",
        candidateFacts: candidates,
        evidenceLinks: links,
        aggregatedValue: null,
        matchNotes: [...notes, "present_empty_not_amount"]
      };
    }
    const typedWrong = candidates.every((c) => {
      if (typeof c.value === "number") return false;
      if (typeof c.value === "string" && /\d/.test(c.value)) return false;
      return c.factType === "declarantRole" || c.factType === "documentPresence";
    });
    if (typedWrong && !strong.length) {
      return {
        status: "ambiguous",
        candidateFacts: candidates,
        evidenceLinks: links,
        aggregatedValue: null,
        matchNotes: [...notes, "wrong_value_type"]
      };
    }
  }
  if (strong.length >= 1) {
    return {
      status: "found",
      candidateFacts: candidates,
      evidenceLinks: links,
      aggregatedValue: null,
      matchNotes: notes
    };
  }
  return {
    status: "ambiguous",
    candidateFacts: candidates,
    evidenceLinks: links,
    aggregatedValue: null,
    matchNotes: [...notes, "candidate_only"]
  };
}
function scoreFactAgainstMatcher(fact, matcher, requirement) {
  const docType = (fact.documentType || "").toLowerCase();
  const blob2 = [
    fact.displayValue || "",
    fact.provenanceNote || "",
    fact.sourceDocumentLabel || "",
    String(fact.value ?? "")
  ].join(" ").toLowerCase();
  for (const bad of matcher.rejectDocumentTypes || []) {
    if (docType === bad.toLowerCase() || docType.includes(bad.toLowerCase())) {
      return null;
    }
  }
  for (const kw of matcher.rejectKeywords || []) {
    if (blob2.includes(kw.toLowerCase())) return null;
  }
  if (!matcher.factTypes.includes(fact.factType)) {
    if (!(matcher.factTypes.includes("amount") && fact.factType === "fieldValue") && !(matcher.factTypes.includes("fieldValue") && fact.factType === "amount") && !(matcher.factTypes.includes("taxCertificate") && fact.factType === "documentPresence")) {
      return null;
    }
  }
  let score = 0.4;
  const reasons = [`factType:${fact.factType}`];
  if (matcher.fieldCodeHints?.length) {
    if (fact.fieldCode && matcher.fieldCodeHints.some(
      (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
    )) {
      score += 0.35;
      reasons.push("fieldCode_match");
    } else if (fact.fieldCode) {
      if (requirement.kind === "amount" && requirement.blocking) {
        return null;
      }
      score -= 0.2;
      reasons.push("fieldCode_mismatch");
    }
  }
  if (matcher.documentTypeHints?.length) {
    if (fact.documentType && matcher.documentTypeHints.some(
      (h) => docType === h.toLowerCase() || docType.includes(h.toLowerCase())
    )) {
      score += 0.15;
      reasons.push("documentType_match");
    }
  }
  if (matcher.declarantRoleHints?.length) {
    if (fact.declarantRole && matcher.declarantRoleHints.includes(fact.declarantRole)) {
      score += 0.1;
      reasons.push("declarant_match");
    } else if (fact.declarantRole && requirement.kind === "declarantRole") {
      reasons.push("declarant_candidate");
    }
  }
  if (matcher.yearRequired) {
    if (fact.year != null || fact.factType === "fiscalYear") {
      score += 0.2;
      reasons.push("year_present");
    } else {
      return null;
    }
  }
  if (matcher.keywords?.length) {
    const hit = matcher.keywords.some((k) => blob2.includes(k.toLowerCase()));
    if (hit) {
      score += 0.15;
      reasons.push("keyword_hit");
    } else if (requirement.kind === "documentPresence" && !matcher.fieldCodeHints?.length) {
      if (!matcher.documentTypeHints?.length) return null;
    }
  }
  score = Math.max(0, Math.min(0.95, score));
  if (score < 0.45) return null;
  let status = "candidate";
  if (score >= 0.75 && reasons.includes("fieldCode_match")) status = "strong";
  else if (score >= 0.7 && (fact.factType === "fiscalYear" || fact.factType === "declarantRole")) {
    status = "strong";
  } else if (score >= 0.7 && requirement.kind === "documentPresence" && (reasons.includes("keyword_hit") || reasons.includes("documentType_match"))) {
    status = "strong";
  } else if (score < 0.6) {
    status = "ambiguous";
  }
  return {
    confidence: score,
    reason: reasons.join("+"),
    status
  };
}
function refuseUnsafeAggregation(candidates) {
  const numeric = candidates.filter(
    (c) => typeof c.value === "number" || /\d/.test(String(c.value ?? ""))
  );
  if (numeric.length > 1) {
    return {
      aggregatedValue: null,
      refused: true,
      reason: "automaticUnsafeAggregation_refused"
    };
  }
  return { aggregatedValue: null, refused: false, reason: "n/a" };
}

// lib/v4/knowledge/fr/tax/fields/requirements/buildFieldAssistance.ts
var FORBIDDEN_MISSING_PHRASES = /vous n['’]avez pas|vous ne possédez pas|il vous manque obligatoirement/i;
var FORBIDDEN_OBLIGATION = /vous devez (mettre|indiquer|déclarer)|indiquez |déclarez |vous êtes éligible|vous avez droit|le montant correct/i;
function statusLabelFr(status) {
  switch (status) {
    case "found":
      return "Information retrouv\xE9e dans les \xE9l\xE9ments analys\xE9s";
    case "missing":
      return "Information non retrouv\xE9e dans les \xE9l\xE9ments analys\xE9s";
    case "ambiguous":
      return "Information ambigu\xEB \u2014 \xE0 v\xE9rifier";
    case "notChecked":
      return "Information non encore confront\xE9e aux documents";
    case "notApplicableKnown":
      return "Information non applicable dans ce contexte (d\xE9terministe)";
    case "unknown":
      return "Statut inconnu";
    default:
      return "Statut inconnu";
  }
}
function computeInformationStatus(evaluated) {
  if (evaluated.some((e) => e.status === "ambiguous")) {
    return "ambiguousInformation";
  }
  const blockingMissing = evaluated.filter(
    (e) => e.priority === "blocking" && e.status === "missing"
  );
  if (blockingMissing.length) return "missingInformation";
  if (evaluated.some(
    (e) => e.status === "missing" || e.status === "notChecked" || e.status === "unknown"
  )) {
    return "requiresVerification";
  }
  return "sufficientForExplanation";
}
function buildTaxFieldAssistance(input) {
  const code = input.fieldCode.toUpperCase().replace(/\s+/g, "");
  const fieldLookup = lookupTaxField({
    documentRef: input.documentRef,
    fieldCode: code,
    year: input.year
  });
  const reqLookup = lookupTaxFieldRequirements({
    documentRef: input.documentRef || fieldLookup.entry?.documentRefs?.[0],
    fieldCode: code,
    year: input.year
  });
  const entry = fieldLookup.entry;
  const requirements = reqLookup.entry;
  let knowledgePromotedToUserFact = 0;
  let requirementPromotedToObligation = 0;
  let candidateFactPromotedToCertain = 0;
  let unsupportedEligibilityDecision = 0;
  let unsupportedTaxAmount = 0;
  let automaticUnsafeAggregation = 0;
  let missingPresentedAsUserDoesNotHave = 0;
  const facts = [
    ...input.preindexedFacts || [],
    ...buildDocumentFactIndex(input.documents || [])
  ];
  if (input.detected && !(input.documents || []).length) {
    facts.push(
      ...buildDocumentFactIndex([
        {
          id: "current",
          label: "Document analys\xE9",
          documentType: "incomeTaxReturn",
          year: input.year ?? input.detected.yearHint,
          detectedFields: [input.detected]
        }
      ])
    );
  }
  const evaluated = [];
  if (requirements) {
    for (const req2 of requirements.informationRequirements) {
      const match = findCandidateFactsForRequirement(req2, facts);
      const agg = refuseUnsafeAggregation(match.candidateFacts);
      if (agg.aggregatedValue != null) automaticUnsafeAggregation += 1;
      let status = match.status;
      if (req2.kind === "amount" && input.detected?.presence === "presentWithValue" && input.detected.checkboxState && input.detected.detectedNumericValue == null && req2.expectedValueType === "amount") {
        status = "ambiguous";
      }
      const label = statusLabelFr(status);
      if (FORBIDDEN_MISSING_PHRASES.test(label)) {
        missingPresentedAsUserDoesNotHave += 1;
      }
      if (FORBIDDEN_OBLIGATION.test(req2.description)) {
        requirementPromotedToObligation += 1;
      }
      if (status === "found" && match.evidenceLinks.length > 0 && match.evidenceLinks.every((l) => l.status === "candidate")) {
        status = "ambiguous";
      }
      evaluated.push({
        requirementId: req2.id,
        label: req2.label,
        description: req2.description,
        kind: req2.kind,
        priority: req2.priority,
        status,
        statusLabel: statusLabelFr(status),
        candidateFacts: match.candidateFacts,
        evidenceLinks: match.evidenceLinks,
        aggregatedValue: null,
        provenance: req2.provenance
      });
    }
  }
  const questions = requirements ? buildTaxFieldQuestions(requirements.informationRequirements, evaluated) : [];
  const priorityQuestions = selectPriorityQuestions(questions, 3);
  const documentFactsSummary = [];
  if (input.explanation?.documentValue) {
    documentFactsSummary.push({
      label: "Valeur d\xE9tect\xE9e pour cette case",
      value: input.explanation.documentValue,
      status: "found"
    });
  } else if (input.detected?.presence === "presentEmpty") {
    documentFactsSummary.push({
      label: "Case dans le document",
      value: "pr\xE9sente sans valeur renseign\xE9e",
      status: "presentEmpty"
    });
  } else if (input.detected?.presence === "ambiguous") {
    documentFactsSummary.push({
      label: "Valeurs candidates",
      value: (input.detected.candidateValues || []).map((c) => c.value).join(" \xB7 "),
      status: "ambiguous"
    });
  } else if (!input.detected) {
    documentFactsSummary.push({
      label: "Dans vos documents",
      value: "aucune valeur certaine rattach\xE9e \xE0 cette case",
      status: "missing"
    });
  }
  if (entry?.plainLanguageWhat && documentFactsSummary.some(
    (d) => d.value.includes(entry.plainLanguageWhat.slice(0, 16))
  )) {
    knowledgePromotedToUserFact += 1;
  }
  const informationStatus = requirements ? computeInformationStatus(evaluated) : "requiresVerification";
  const suggestedDeclaredAmount = null;
  const eligibilityDecision = null;
  if (suggestedDeclaredAmount != null) unsupportedTaxAmount += 1;
  if (eligibilityDecision != null) unsupportedEligibilityDecision += 1;
  const yearMatch = reqLookup.matchKind === "exact" ? "exact" : reqLookup.matchKind === "stable" ? "stable" : reqLookup.matchKind === "partial" ? "mismatch" : "unknown";
  const allCandidates = [
    ...new Map(
      evaluated.flatMap((e) => e.candidateFacts).map((f) => [f.factId, f])
    ).values()
  ];
  return {
    fieldCode: code,
    documentRef: input.documentRef || requirements?.documentRef || entry?.documentRefs?.[0] || null,
    year: input.year ?? input.detected?.yearHint ?? null,
    yearMatch,
    knowledge: {
      label: entry?.label || null,
      whatIsIt: entry?.explanation || null,
      plainLanguageWhat: entry?.plainLanguageWhat || null,
      expectedValueType: requirements?.expectedValueType || entry?.valueType || null,
      qualityStatus: requirements?.qualityStatus || entry?.qualityStatus || null
    },
    documentFactsSummary,
    evaluatedRequirements: evaluated,
    supportingDocuments: requirements?.possibleSupportingDocuments || [],
    generalConditions: requirements?.generalConditions || [],
    missingRequirements: evaluated.filter((e) => e.status === "missing"),
    ambiguousRequirements: evaluated.filter((e) => e.status === "ambiguous"),
    questions,
    priorityQuestions,
    informationStatus,
    candidateFacts: allCandidates,
    relatedFields: requirements?.relatedFields || entry?.relatedFields || [],
    provenance: [
      ...requirements?.provenance || [],
      ...entry?.provenance || []
    ],
    suggestedDeclaredAmount,
    eligibilityDecision,
    invariants: {
      knowledgePromotedToUserFact,
      requirementPromotedToObligation,
      candidateFactPromotedToCertain,
      unsupportedEligibilityDecision,
      unsupportedTaxAmount,
      automaticUnsafeAggregation,
      missingPresentedAsUserDoesNotHave
    }
  };
}
function buildAssistanceForDetectedFields(detected, explanations, options) {
  const explByCode = new Map(explanations.map((e) => [e.fieldCode, e]));
  const out = [];
  for (const d of detected) {
    const req2 = lookupTaxFieldRequirements({
      documentRef: options?.documentRef || d.documentRefHint,
      fieldCode: d.normalizedCode,
      year: options?.year ?? d.yearHint
    });
    if (!req2.entry) continue;
    out.push(
      buildTaxFieldAssistance({
        fieldCode: d.normalizedCode,
        documentRef: options?.documentRef || d.documentRefHint,
        year: options?.year ?? d.yearHint,
        detected: d,
        explanation: explByCode.get(d.normalizedCode) || null,
        documents: options?.documents
      })
    );
  }
  return out;
}

// lib/v4/knowledge/fr/tax/analyzeFiscalKnowledge.ts
var FAMILY_TO_TYPE = {
  incomeTaxReturn: "incomeTaxReturn",
  incomeTaxNotice: "incomeTaxNotice",
  propertyTax: "propertyTax",
  housingTax: "taxDocument",
  rentalIncomeDeclaration: "incomeTaxReturn",
  foreignIncomeDeclaration: "incomeTaxReturn",
  professionalIncomeDeclaration: "incomeTaxReturn",
  professionalBenefits: "taxForm",
  taxCreditReduction: "incomeTaxReturn",
  capitalGainsDeclaration: "incomeTaxReturn",
  wealthTax: "incomeTaxReturn",
  foreignAccountsDeclaration: "taxForm",
  inheritanceDonation: "taxForm",
  withholdingTax: "taxForm",
  corporateTax: "taxForm",
  vatDeclaration: "taxForm",
  businessTax: "taxForm",
  taxCertificate: "taxForm",
  taxInstruction: "taxForm",
  taxForm: "taxForm",
  taxNotice: "incomeTaxNotice",
  unknownTaxDocument: "unknownTaxDocument"
};
var FAMILY_TO_PROFILE = {
  incomeTaxReturn: "incomeTaxReturn",
  incomeTaxNotice: "incomeTaxNotice",
  propertyTax: "propertyTax",
  rentalIncomeDeclaration: "incomeTaxReturn",
  foreignIncomeDeclaration: "incomeTaxReturn",
  professionalIncomeDeclaration: "incomeTaxReturn",
  taxCreditReduction: "incomeTaxReturn",
  capitalGainsDeclaration: "incomeTaxReturn",
  wealthTax: "incomeTaxReturn",
  unknownTaxDocument: "unknownTaxDocument"
};
function analyzeFiscalKnowledge(blocks) {
  const registry = loadFrenchTaxRegistry();
  const detectedReferences = detectFiscalReferences(blocks, registry);
  const signals = buildFiscalKnowledgeSignals(
    blocks,
    detectedReferences,
    registry
  );
  const primaryIdentity = selectPrimaryIdentity(detectedReferences);
  const suggestedFamily = suggestFamilyFromSignals(signals, detectedReferences);
  const text = blocks.map((b) => b.text).join("\n").toLowerCase();
  const clearlyFiscal = /imp[oô]t|fiscal|dgfip|finances\s+publiques|num[eé]ro\s+fiscal|taxe\s+fonci/.test(
    text
  );
  const family = primaryIdentity?.family || suggestedFamily || (clearlyFiscal ? "unknownTaxDocument" : null);
  const suggestedDocumentType = family ? FAMILY_TO_TYPE[family] || "unknownTaxDocument" : null;
  const suggestedProfileId = family ? FAMILY_TO_PROFILE[family] || null : null;
  const knowledgeFacts = [];
  for (const ref of detectedReferences) {
    if (!ref.registryId) continue;
    if (ref.matchKind === "possible") continue;
    const entry = lookupById(registry, ref.registryId);
    if (entry) knowledgeFacts.push(...knowledgeFactsForEntry(entry));
  }
  let personalIdAsFormReference = 0;
  let mentionedAsIdentity = 0;
  for (const ref of detectedReferences) {
    if (ref.kind === "taxpayerIdentifier" && ref.kind === "formReference") {
      personalIdAsFormReference += 1;
    }
    if (ref.kind === "taxpayerIdentifier") {
    }
    if (ref.role === "mentionedDocument" && suggestedFamily && ref.family === suggestedFamily && !detectedReferences.some(
      (r) => r.role === "documentIdentity" && r.family === suggestedFamily
    ) && suggestedFamily !== "unknownTaxDocument") {
      const onlyMention = !signals.some(
        (s) => s.family === suggestedFamily && s.referenceRole === "documentIdentity"
      ) && !signals.some(
        (s) => s.signal.startsWith("knowledge:lexical:") && s.family === suggestedFamily
      );
      if (onlyMention) mentionedAsIdentity += 1;
    }
  }
  const preliminary = {
    enabled: true,
    registryVersion: registry.version,
    detectedReferences,
    signals,
    suggestedFamily: family,
    suggestedDocumentType,
    suggestedProfileId,
    knowledgeFacts,
    primaryIdentity,
    invariants: {
      knowledgeAsDocumentFact: 0,
      personalIdAsFormReference,
      mentionedAsIdentity
    }
  };
  const detectedFields = detectFrenchTaxFields(blocks, preliminary);
  const fieldExplanations = explainDetectedTaxFields(detectedFields);
  const fieldRegistry = loadFrenchTaxFieldRegistry();
  const requirementsRegistry = loadFrenchTaxFieldRequirementsRegistry();
  const primaryRef = primaryIdentity?.normalized || detectedFields.find((d) => d.documentRefHint)?.documentRefHint || null;
  const yearHint = detectedFields.find((d) => d.yearHint)?.yearHint || (() => {
    const m = text.match(/\b(202[4-6])\b/);
    return m ? Number(m[1]) : null;
  })();
  const fieldAssistance = buildAssistanceForDetectedFields(
    detectedFields,
    fieldExplanations,
    {
      documentRef: primaryRef,
      year: yearHint,
      documents: [
        {
          id: "primary",
          label: "Document analys\xE9",
          documentType: suggestedDocumentType || "taxForm",
          year: yearHint,
          text: blocks.map((b) => b.text).join("\n"),
          detectedFields
        }
      ]
    }
  );
  let taxFieldKnowledgePromotedToFact = 0;
  let unsupportedFieldValues = 0;
  let emptyFieldConvertedToZero = 0;
  let unverifiedFieldDefinitionPresentedAsVerified = 0;
  let fieldFalsePositiveCritical = 0;
  let knowledgePromotedToUserFact = 0;
  let requirementPromotedToObligation = 0;
  let candidateFactPromotedToCertain = 0;
  let unsupportedEligibilityDecision = 0;
  let unsupportedTaxAmount = 0;
  let automaticUnsafeAggregation = 0;
  let missingPresentedAsUserDoesNotHave = 0;
  for (const fe of fieldExplanations) {
    taxFieldKnowledgePromotedToFact += fe.invariants.taxFieldKnowledgePromotedToFact;
    unsupportedFieldValues += fe.invariants.unsupportedFieldValues;
    emptyFieldConvertedToZero += fe.invariants.emptyFieldConvertedToZero;
    unverifiedFieldDefinitionPresentedAsVerified += fe.invariants.unverifiedFieldDefinitionPresentedAsVerified;
  }
  for (const df of detectedFields) {
    if (df.confidence >= 0.75 && !df.registryId && !primaryIdentity) {
      fieldFalsePositiveCritical += 1;
    }
  }
  for (const fa of fieldAssistance) {
    knowledgePromotedToUserFact += fa.invariants.knowledgePromotedToUserFact;
    requirementPromotedToObligation += fa.invariants.requirementPromotedToObligation;
    candidateFactPromotedToCertain += fa.invariants.candidateFactPromotedToCertain;
    unsupportedEligibilityDecision += fa.invariants.unsupportedEligibilityDecision;
    unsupportedTaxAmount += fa.invariants.unsupportedTaxAmount;
    automaticUnsafeAggregation += fa.invariants.automaticUnsafeAggregation;
    missingPresentedAsUserDoesNotHave += fa.invariants.missingPresentedAsUserDoesNotHave;
  }
  return {
    ...preliminary,
    detectedFields,
    fieldExplanations,
    fieldRegistryVersion: fieldRegistry.version,
    fieldAssistance,
    requirementsRegistryVersion: requirementsRegistry.version,
    invariants: {
      ...preliminary.invariants,
      taxFieldKnowledgePromotedToFact,
      unsupportedFieldValues,
      emptyFieldConvertedToZero,
      unverifiedFieldDefinitionPresentedAsVerified,
      fieldFalsePositiveCritical,
      knowledgePromotedToUserFact,
      requirementPromotedToObligation,
      candidateFactPromotedToCertain,
      unsupportedEligibilityDecision,
      unsupportedTaxAmount,
      automaticUnsafeAggregation,
      missingPresentedAsUserDoesNotHave
    }
  };
}

// lib/v4/knowledge/fr/tax/applyKnowledge.ts
function mergeFiscalKnowledgeIntoClassification(classification, knowledge) {
  const scores = { ...classification.scores };
  const evidence = [...classification.evidence];
  for (const s of knowledge.signals) {
    const type = s.family === "incomeTaxReturn" || s.family === "rentalIncomeDeclaration" || s.family === "foreignIncomeDeclaration" || s.family === "professionalIncomeDeclaration" || s.family === "taxCreditReduction" || s.family === "capitalGainsDeclaration" || s.family === "wealthTax" ? "incomeTaxReturn" : s.family === "incomeTaxNotice" || s.family === "taxNotice" ? "incomeTaxNotice" : s.family === "propertyTax" ? "propertyTax" : s.family === "corporateTax" || s.family === "vatDeclaration" || s.family === "businessTax" || s.family === "professionalBenefits" || s.family === "withholdingTax" || s.family === "inheritanceDonation" || s.family === "foreignAccountsDeclaration" || s.family === "taxCertificate" || s.family === "taxInstruction" || s.family === "taxForm" ? "taxForm" : s.family === "unknownTaxDocument" ? "unknownTaxDocument" : s.family === "tax" || s.family === "negative" ? null : "taxDocument";
    if (type && s.weight > 0) {
      scores[type] = Math.min(1, (scores[type] || 0) + s.weight * 0.5);
      evidence.push({
        signal: s.signal,
        family: "lexical",
        delta: s.weight * 0.5,
        type,
        evidence: s.evidence
      });
    } else if (s.weight < 0 && knowledge.suggestedDocumentType) {
      const penalized = "incomeTaxReturn";
      scores[penalized] = Math.max(0, (scores[penalized] || 0) + s.weight * 0.5);
      evidence.push({
        signal: s.signal,
        family: "negativeEvidence",
        delta: s.weight * 0.5,
        type: penalized,
        evidence: s.evidence
      });
    }
  }
  const hasMentionOnly = knowledge.detectedReferences.some((r) => r.role === "mentionedDocument") && !knowledge.detectedReferences.some((r) => r.role === "documentIdentity") && !knowledge.signals.some((s) => s.signal.startsWith("knowledge:lexical:"));
  let primary = classification.primary;
  let confidence = classification.confidence;
  let status = classification.status;
  if (knowledge.suggestedDocumentType && !hasMentionOnly && (scores[knowledge.suggestedDocumentType] || 0) >= 0.45) {
    const nonFiscalStrong = ["invoice", "bankStatement", "contract", "payslip"].includes(
      classification.primary
    );
    const suggestedScore = scores[knowledge.suggestedDocumentType] || 0;
    if (!nonFiscalStrong) {
      primary = knowledge.suggestedDocumentType;
      confidence = toConfidence(Math.min(0.95, Math.max(suggestedScore, 0.55)));
      status = suggestedScore >= 0.55 ? "resolved" : "ambiguous";
    }
  }
  if (knowledge.suggestedFamily === "unknownTaxDocument") {
    const specializedFiscal = /* @__PURE__ */ new Set([
      "incomeTaxReturn",
      "incomeTaxNotice",
      "propertyTax",
      "taxForm"
    ]);
    if (!specializedFiscal.has(primary)) {
      const softPrimaries = /* @__PURE__ */ new Set([
        "unknown",
        "taxDocument",
        "administrativeLetter",
        "notice",
        "form",
        "unknownTaxDocument"
      ]);
      if (softPrimaries.has(classification.primary) || softPrimaries.has(primary)) {
        primary = "unknownTaxDocument";
        scores.unknownTaxDocument = Math.max(scores.unknownTaxDocument || 0, 0.55);
        status = "unknown";
        confidence = toConfidence(0.45);
      }
    }
  }
  const alternatives = Object.entries(scores).filter(([t]) => t !== primary).map(([type, score]) => ({ type, confidence: score || 0 })).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  return {
    ...classification,
    primary,
    confidence,
    status,
    scores,
    alternatives,
    evidence,
    signals: {
      ...classification.signals,
      strong: [
        ...classification.signals?.strong || [],
        ...knowledge.signals.filter((s) => s.weight >= 0.4).map((s) => s.signal)
      ],
      negative: [
        ...classification.signals?.negative || [],
        ...knowledge.signals.filter((s) => s.weight < 0).map((s) => s.signal)
      ]
    }
  };
}

// lib/v4/relations/helpers.ts
function pushReason2(reasons, signal, delta) {
  if (!delta) return;
  reasons.push({ signal, delta });
}
function sumReasons(reasons) {
  return clamp01(reasons.reduce((a, r) => a + r.delta, 0));
}
function evidenceOf(...candidates) {
  const out = [];
  for (const c of candidates) {
    for (const e of c.evidence || []) out.push(e);
  }
  return out;
}
function roleScore(c, role) {
  return c.hypotheses.find((h) => h.role === role)?.score ?? 0;
}
function bestRole(c) {
  return c.hypotheses[0]?.role ?? null;
}
function moneyCandidates(candidates) {
  return candidates.filter((c) => c.type === "money");
}
function percentCandidates(candidates) {
  return candidates.filter((c) => c.type === "percentage");
}
function nearlyEqual(a, b, tol) {
  return Math.abs(a - b) <= tol;
}
function samePage(a, b) {
  return a.page === b.page;
}
function contextHas(c, re) {
  const blob2 = normalizeLex(
    [c.context?.previousLine, c.context?.sameLine, c.context?.nextLine].filter(Boolean).join(" ")
  );
  return re.test(blob2);
}

// lib/v4/relations/ids.ts
var seq2 = 0;
function resetRelationIdsForTests() {
  seq2 = 0;
}
function nextRelationId(prefix) {
  seq2 += 1;
  return `${prefix}_${seq2}`;
}

// lib/v4/relations/weights.ts
var RELATION_WEIGHTS = {
  // Arithmetic
  htPlusVatEqualsTtc: 0.55,
  htTimesRateEqualsTtc: 0.5,
  arithmeticBundleBonus: 0.25,
  moneyTolerance: 0.02,
  // €
  // Spatial / structural
  sameLine: 0.2,
  adjacentLine: 0.12,
  samePage: 0.05,
  sameSection: 0.1,
  tableMembership: 0.15,
  // Semantic labels
  semanticIssuer: 0.45,
  semanticRecipient: 0.45,
  semanticSender: 0.4,
  organizationPerson: 0.3,
  // Temporal / action
  actionDeadline: 0.55,
  temporalBefore: 0.2,
  // Ownership
  ownership: 0.25,
  // Contradiction penalties
  arithmeticMismatch: -0.7,
  roleConflict: -0.4,
  capitalAsTotal: -0.8,
  // Global consistency assembly
  localScoreWeight: 0.45,
  relationScoreWeight: 0.4,
  contradictionWeight: 1,
  ambiguityMargin: 0.08
  // si |scoreA - scoreB| < margin → ambiguous
};

// lib/v4/relations/actionDeadline.ts
function scanActionDeadlineRelations(candidates) {
  const actions = candidates.filter((c) => c.type === "action");
  const dates = candidates.filter(
    (c) => c.type === "date" || c.type === "deadline"
  );
  const relations = [];
  for (const action of actions) {
    for (const date of dates) {
      const sameLine = action.context?.sameLine && date.context?.sameLine && action.context.sameLine === date.context.sameLine;
      const near = sameLine || action.page === date.page && (contextHas(action, /avant\s+le|au\s+plus\s+tard|delai/) || contextHas(date, /avant\s+le|au\s+plus\s+tard|merci\s+de/));
      if (!near && !sameLine) continue;
      const reasons = [];
      pushReason2(reasons, "relation:actionDeadline", RELATION_WEIGHTS.actionDeadline);
      if (sameLine) pushReason2(reasons, "spatial:sameLine", RELATION_WEIGHTS.sameLine);
      if (roleScore(date, "deadline") > 0.3) {
        pushReason2(reasons, "local:deadlineHypothesis", roleScore(date, "deadline") * 0.15);
      }
      if (roleScore(action, "requestedAction") > 0.3) {
        pushReason2(
          reasons,
          "local:requestedAction",
          roleScore(action, "requestedAction") * 0.15
        );
      }
      pushReason2(reasons, "temporal:beforeCue", RELATION_WEIGHTS.temporalBefore);
      relations.push({
        id: nextRelationId("act"),
        sourceCandidateId: action.id,
        targetCandidateId: date.id,
        type: "actionDeadline",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(action, date),
        label: "action \u2194 deadline"
      });
    }
  }
  return relations;
}

// lib/v4/relations/arithmetic.ts
function isTopRole(c, role) {
  const top = bestRole(c);
  if (!top) return false;
  return Array.isArray(role) ? role.includes(top) : top === role;
}
function isCredibleInvoiceHt(c) {
  if (!isTopRole(c, "amountHT")) return false;
  if (roleScore(c, "amountHT") < 0.45) return false;
  const line = normalizeLex(c.context?.sameLine || "");
  if (/sous[-\s]?total|remise\b|deja\s+(paye|prelev)|acompte/.test(line)) {
    return false;
  }
  return true;
}
function isCredibleInvoiceTtc(c) {
  if (!isTopRole(c, "amountTTC")) return false;
  return roleScore(c, "amountTTC") >= 0.45;
}
function isCredibleVatAmount(c) {
  if (!isTopRole(c, "vatAmount")) return false;
  return roleScore(c, "vatAmount") >= 0.45;
}
function isSectionLocalAmount(c) {
  const line = normalizeLex(c.context?.sameLine || "");
  const blob2 = normalizeLex(
    [c.context?.previousLine, c.context?.sameLine, c.context?.nextLine].filter(Boolean).join(" ")
  );
  return /acheminement|abonnement|consommation|services?\b|htva\b|reseaux?\s+sociaux|support|contact|faq|sous[-\s]?total|detail|ligne|index\b|kwh/.test(
    `${line} ${blob2}`
  );
}
function lineIndex(c) {
  const fromBlock = Number(String(c.blockIds?.[0] || "").replace(/\D/g, ""));
  if (fromBlock > 0) return fromBlock;
  const fromEv = Number(
    String(c.evidence?.[0]?.lineId || c.evidence?.[0]?.blockId || "").replace(
      /\D/g,
      ""
    )
  );
  return fromEv > 0 ? fromEv : null;
}
function bundleAffinity(a, b) {
  if (a.id === b.id) return 1;
  if (a.page !== b.page) return 0;
  const aLine = a.context?.sameLine || "";
  const bLine = b.context?.sameLine || "";
  if (aLine && aLine === bLine) return 1;
  const aPrev = a.context?.previousLine || "";
  const aNext = a.context?.nextLine || "";
  const bPrev = b.context?.previousLine || "";
  const bNext = b.context?.nextLine || "";
  if (aLine && (aLine === bPrev || aLine === bNext) || bLine && (bLine === aPrev || bLine === aNext)) {
    return 0.75;
  }
  const ai = lineIndex(a);
  const bi = lineIndex(b);
  if (ai != null && bi != null) {
    const dist = Math.abs(ai - bi);
    if (dist <= 1) return 0.7;
    if (dist <= 3) return 0.55;
    if (dist <= 6) return 0.35;
    return 0.1;
  }
  const aTotal = /\btotal\b/.test(normalizeLex(aLine));
  const bTotal = /\btotal\b/.test(normalizeLex(bLine));
  if (aTotal && bTotal) return 0.4;
  return 0.15;
}
function sameAccountingBundle(ht, vat, ttc) {
  if (isSectionLocalAmount(ht) || isSectionLocalAmount(vat)) {
    const localToTtc = Math.min(bundleAffinity(ht, ttc), bundleAffinity(vat, ttc)) >= 0.7;
    if (!localToTtc) return false;
  }
  const ab = bundleAffinity(ht, vat);
  const bc = bundleAffinity(vat, ttc);
  const ac = bundleAffinity(ht, ttc);
  const strong = [ab, bc, ac].filter((x) => x >= 0.55).length;
  const min = Math.min(ab, bc, ac);
  return strong >= 2 && min >= 0.35;
}
function num(c) {
  return Number(c.value);
}
function scanArithmeticRelations(candidates) {
  const monies = moneyCandidates(candidates);
  const rates = percentCandidates(candidates);
  const relations = [];
  const contradictions = [];
  const coherentBundles = [];
  for (const ht of monies) {
    for (const ttc of monies) {
      if (ht.id === ttc.id) continue;
      const ttcGreater = num(ttc) > num(ht) + RELATION_WEIGHTS.moneyTolerance;
      const topTrioRoles = isCredibleInvoiceHt(ht) && isCredibleInvoiceTtc(ttc);
      for (const vat of monies) {
        if (vat.id === ht.id || vat.id === ttc.id) continue;
        const sum = Math.round((num(ht) + num(vat)) * 100) / 100;
        const ok = nearlyEqual(sum, num(ttc), RELATION_WEIGHTS.moneyTolerance);
        const reasons = [];
        pushReason2(reasons, "pair:htCandidate", roleScore(ht, "amountHT") * 0.2);
        pushReason2(reasons, "pair:vatCandidate", roleScore(vat, "vatAmount") * 0.2);
        pushReason2(reasons, "pair:ttcCandidate", roleScore(ttc, "amountTTC") * 0.2);
        const roleAlignedBundle = isCredibleInvoiceHt(ht) && isCredibleInvoiceTtc(ttc) && isCredibleVatAmount(vat);
        const sameBundle = sameAccountingBundle(ht, vat, ttc);
        if (ok && ttcGreater && sameBundle) {
          pushReason2(
            reasons,
            `arithmetic:HT+TVA\u2248TTC (${num(ht)}+${num(vat)}=${sum}\u2248${num(ttc)})`,
            RELATION_WEIGHTS.htPlusVatEqualsTtc
          );
          pushReason2(
            reasons,
            "bundle:sameAccountingBundle",
            Math.min(
              bundleAffinity(ht, vat),
              bundleAffinity(vat, ttc),
              bundleAffinity(ht, ttc)
            ) * 0.2
          );
          relations.push({
            id: nextRelationId("arith"),
            sourceCandidateId: ht.id,
            targetCandidateId: ttc.id,
            type: "arithmetic",
            score: sumReasons(reasons),
            reasons,
            evidence: evidenceOf(ht, vat, ttc),
            via: [vat.id],
            label: "HT + TVA \u2248 TTC"
          });
          let rateCand;
          for (const rate of rates) {
            if (bundleAffinity(rate, ht) < 0.35 && bundleAffinity(rate, ttc) < 0.35) {
              continue;
            }
            const expected = Math.round(num(ht) * (1 + num(rate) / 100) * 100) / 100;
            if (nearlyEqual(expected, num(ttc), RELATION_WEIGHTS.moneyTolerance)) {
              rateCand = rate;
              const rReasons = [...reasons];
              pushReason2(
                rReasons,
                `arithmetic:HT\xD7(1+taux/100)\u2248TTC (${num(ht)}\xD7(1+${num(rate)}/100)=${expected}\u2248${num(ttc)})`,
                RELATION_WEIGHTS.htTimesRateEqualsTtc
              );
              pushReason2(rReasons, "bundle:bonus", RELATION_WEIGHTS.arithmeticBundleBonus);
              relations.push({
                id: nextRelationId("arith"),
                sourceCandidateId: ht.id,
                targetCandidateId: ttc.id,
                type: "arithmetic",
                score: sumReasons(rReasons),
                reasons: rReasons,
                evidence: evidenceOf(ht, vat, rate, ttc),
                via: [vat.id, rate.id],
                label: "HT + TVA \u2248 TTC et HT \xD7 (1+taux) \u2248 TTC"
              });
              break;
            }
          }
          if (roleAlignedBundle) {
            coherentBundles.push({
              ht,
              ttc,
              vatAmount: vat,
              vatRate: rateCand,
              relations: relations.filter(
                (r) => r.sourceCandidateId === ht.id && r.targetCandidateId === ttc.id && (r.via || []).includes(vat.id)
              )
            });
          }
        } else if (!ok && topTrioRoles && isCredibleVatAmount(vat) && sameBundle) {
          const penaltyReasons = [];
          pushReason2(
            penaltyReasons,
            `contradiction:HT+TVA\u2260TTC (${num(ht)}+${num(vat)}=${sum}\u2260${num(ttc)})`,
            RELATION_WEIGHTS.arithmeticMismatch
          );
          pushReason2(
            penaltyReasons,
            "bundle:sameAccountingBundle",
            0.1
          );
          contradictions.push({
            id: nextRelationId("contra"),
            subjectIds: [ht.id, vat.id, ttc.id],
            kind: "arithmeticMismatch",
            message: `HT (${num(ht)}) + TVA (${num(vat)}) \u2260 TTC (${num(ttc)})`,
            penalty: RELATION_WEIGHTS.arithmeticMismatch,
            reasons: penaltyReasons,
            evidence: evidenceOf(ht, vat, ttc)
          });
        }
      }
      for (const rate of rates) {
        const expected = Math.round(num(ht) * (1 + num(rate) / 100) * 100) / 100;
        const rateNear = bundleAffinity(ht, ttc) >= 0.55 && (bundleAffinity(rate, ht) >= 0.35 || bundleAffinity(rate, ttc) >= 0.35);
        if (!nearlyEqual(expected, num(ttc), RELATION_WEIGHTS.moneyTolerance)) {
          if (topTrioRoles && isTopRole(rate, "vatRate") && rateNear && !isSectionLocalAmount(ht)) {
            contradictions.push({
              id: nextRelationId("contra"),
              subjectIds: [ht.id, rate.id, ttc.id],
              kind: "arithmeticMismatch",
              message: `HT (${num(ht)}) \xD7 (1+${num(rate)}/100) \u2260 TTC (${num(ttc)})`,
              penalty: RELATION_WEIGHTS.arithmeticMismatch,
              reasons: [
                {
                  signal: `contradiction:HT\xD7taux\u2260TTC (expected ${expected})`,
                  delta: RELATION_WEIGHTS.arithmeticMismatch
                }
              ],
              evidence: evidenceOf(ht, rate, ttc)
            });
          }
          continue;
        }
        if (!ttcGreater || !rateNear) continue;
        const already = relations.some(
          (r) => r.sourceCandidateId === ht.id && r.targetCandidateId === ttc.id && (r.via || []).includes(rate.id)
        );
        if (already) continue;
        const reasons = [];
        pushReason2(
          reasons,
          `arithmetic:HT\xD7(1+taux/100)\u2248TTC (${num(ht)}\xD7(1+${num(rate)}/100)=${expected}\u2248${num(ttc)})`,
          RELATION_WEIGHTS.htTimesRateEqualsTtc
        );
        pushReason2(reasons, "pair:htCandidate", roleScore(ht, "amountHT") * 0.15);
        pushReason2(reasons, "pair:rateCandidate", roleScore(rate, "vatRate") * 0.15);
        pushReason2(reasons, "pair:ttcCandidate", roleScore(ttc, "amountTTC") * 0.15);
        relations.push({
          id: nextRelationId("arith"),
          sourceCandidateId: ht.id,
          targetCandidateId: ttc.id,
          type: "arithmetic",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(ht, rate, ttc),
          via: [rate.id],
          label: "HT \xD7 (1+taux) \u2248 TTC"
        });
      }
    }
  }
  return { relations, contradictions, coherentBundles };
}

// lib/v4/relations/semantic.ts
function scanSemanticRelations(candidates) {
  const relations = [];
  const orgs = candidates.filter((c) => c.type === "organization");
  const persons = candidates.filter((c) => c.type === "person");
  for (const org of orgs) {
    if (roleScore(org, "issuer") > 0.3 || contextHas(org, /emetteur|expediteur/)) {
      const reasons = [];
      pushReason2(reasons, "semantic:issuerLabel", RELATION_WEIGHTS.semanticIssuer);
      pushReason2(reasons, "local:issuer", roleScore(org, "issuer") * 0.2);
      relations.push({
        id: nextRelationId("sem"),
        sourceCandidateId: org.id,
        targetCandidateId: org.id,
        type: "issuer",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(org),
        label: "issuer"
      });
      if (contextHas(org, /emetteur|expediteur/)) {
        relations.push({
          id: nextRelationId("sem"),
          sourceCandidateId: org.id,
          targetCandidateId: org.id,
          type: "sender",
          score: RELATION_WEIGHTS.semanticSender,
          reasons: [{ signal: "semantic:senderLabel", delta: RELATION_WEIGHTS.semanticSender }],
          evidence: evidenceOf(org),
          label: "sender"
        });
      }
    }
  }
  for (const person of persons) {
    if (roleScore(person, "recipient") > 0.3 || contextHas(person, /destinataire|client/)) {
      const reasons = [];
      pushReason2(reasons, "semantic:recipientLabel", RELATION_WEIGHTS.semanticRecipient);
      pushReason2(reasons, "local:recipient", roleScore(person, "recipient") * 0.2);
      relations.push({
        id: nextRelationId("sem"),
        sourceCandidateId: person.id,
        targetCandidateId: person.id,
        type: "recipient",
        score: sumReasons(reasons),
        reasons,
        evidence: evidenceOf(person),
        label: "recipient"
      });
    }
  }
  for (const org of orgs) {
    for (const person of persons) {
      if ((roleScore(org, "issuer") > 0.25 || contextHas(org, /emetteur/)) && (roleScore(person, "recipient") > 0.25 || contextHas(person, /destinataire/))) {
        relations.push({
          id: nextRelationId("sem"),
          sourceCandidateId: org.id,
          targetCandidateId: person.id,
          type: "organizationPerson",
          score: RELATION_WEIGHTS.organizationPerson,
          reasons: [
            { signal: "semantic:orgIssuer+personRecipient", delta: RELATION_WEIGHTS.organizationPerson }
          ],
          evidence: evidenceOf(org, person),
          label: "issuer \u2192 recipient"
        });
      }
    }
  }
  return relations;
}

// lib/v4/relations/spatial.ts
function scanSpatialRelations(candidates) {
  const relations = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (!samePage(a, b)) continue;
      const aLine = a.context?.sameLine || "";
      const bLine = b.context?.sameLine || "";
      const aPrev = a.context?.previousLine || "";
      const bPrev = b.context?.previousLine || "";
      if (aLine && aLine === bLine) {
        const reasons = [];
        pushReason2(reasons, "spatial:sameLine", RELATION_WEIGHTS.sameLine);
        relations.push({
          id: nextRelationId("spat"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "spatial",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(a, b),
          label: "sameLine"
        });
      } else if (aLine && (aLine === bPrev || bLine === aPrev || a.context?.nextLine === bLine)) {
        const reasons = [];
        pushReason2(reasons, "spatial:adjacentLine", RELATION_WEIGHTS.adjacentLine);
        relations.push({
          id: nextRelationId("spat"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "spatial",
          score: sumReasons(reasons),
          reasons,
          evidence: evidenceOf(a, b),
          label: "adjacentLine"
        });
      }
      if (/total|tva|facture|emetteur|destinataire/i.test(aLine) && /total|tva|facture|emetteur|destinataire/i.test(bLine)) {
        relations.push({
          id: nextRelationId("sect"),
          sourceCandidateId: a.id,
          targetCandidateId: b.id,
          type: "sameSection",
          score: RELATION_WEIGHTS.sameSection,
          reasons: [{ signal: "spatial:sameSectionHeuristic", delta: RELATION_WEIGHTS.sameSection }],
          evidence: evidenceOf(a, b),
          label: "sameSection"
        });
      }
    }
  }
  return relations;
}

// lib/v4/relations/RelationEngine.ts
var RelationEngine = class {
  build(candidates) {
    const arithmetic = scanArithmeticRelations(candidates);
    const spatial = scanSpatialRelations(candidates);
    const semantic = scanSemanticRelations(candidates);
    const actionDeadline = scanActionDeadlineRelations(candidates);
    const temporal = actionDeadline.map((r) => ({
      ...r,
      // conserver actionDeadline comme type principal ; dupliquer signal temporal via reasons
      reasons: [
        ...r.reasons,
        { signal: "temporal:linked", delta: 0 }
      ]
    }));
    const ownership = semantic.filter((r) => r.type === "organizationPerson").map((r) => ({
      ...r,
      id: `${r.id}_own`,
      type: "ownership",
      label: "ownership(org\u2192person)",
      reasons: [
        ...r.reasons,
        { signal: "ownership:fromOrganizationPerson", delta: 0.05 }
      ]
    }));
    const tableMembership = [];
    const sectionRels = spatial.filter((r) => r.type === "sameSection");
    for (const r of sectionRels) {
      if (candidates.find((c) => c.id === r.sourceCandidateId)?.type === "money" && candidates.find((c) => c.id === r.targetCandidateId)?.type === "money") {
        tableMembership.push({
          ...r,
          id: `${r.id}_tbl`,
          type: "tableMembership",
          label: "tableMembership(heuristic)",
          reasons: [
            { signal: "table:sameSectionMoneyPair", delta: 0.1 }
          ]
        });
      }
    }
    const relations = [
      ...arithmetic.relations,
      ...spatial,
      ...semantic,
      ...temporal,
      ...ownership,
      ...tableMembership
    ];
    return {
      relations,
      contradictions: arithmetic.contradictions,
      coherentBundles: arithmetic.coherentBundles
    };
  }
};
function buildRelations(candidates) {
  return new RelationEngine().build(candidates);
}

// lib/v4/relations/GlobalConsistencyEngine.ts
function assignment(role, c) {
  return {
    role,
    candidateId: c.id,
    value: c.value,
    localScore: roleScore(c, role)
  };
}
function avgLocal(assignments) {
  if (!assignments.length) return 0;
  return assignments.reduce((a, x) => a + x.localScore, 0) / assignments.length;
}
function explainSolution(assignments, relations, contradictions, extras = []) {
  const reasons = [...extras];
  const local = avgLocal(assignments);
  const localPart = local * RELATION_WEIGHTS.localScoreWeight;
  reasons.push({
    signal: `global:localScores(avg=${local.toFixed(2)})`,
    delta: localPart
  });
  const arith = relations.filter((r) => r.type === "arithmetic");
  const relPool = arith.length ? arith : relations;
  const relScore = relPool.reduce((a, r) => a + r.score, 0) / Math.max(1, relPool.length);
  const relPart = relScore * RELATION_WEIGHTS.relationScoreWeight;
  reasons.push({
    signal: `global:relations(avg=${relScore.toFixed(2)},n=${relPool.length},arith=${arith.length})`,
    delta: relPart
  });
  let contraPart = 0;
  for (const c of contradictions) {
    const p = c.penalty * RELATION_WEIGHTS.contradictionWeight;
    contraPart += p;
    reasons.push({ signal: `global:contradiction:${c.kind}`, delta: p });
  }
  const ttc = assignments.find((a) => a.role === "amountTTC");
  if (ttc && typeof ttc.value === "number" && ttc.value >= 1e5) {
    reasons.push({
      signal: "global:negative:capitalLikeTotal",
      delta: RELATION_WEIGHTS.capitalAsTotal
    });
    contraPart += RELATION_WEIGHTS.capitalAsTotal;
  }
  const score = clamp01(localPart + relPart + contraPart);
  let status = "resolved";
  if (contradictions.length) status = "contradictory";
  else if (!arith.length && assignments.length >= 2) status = "partial";
  return { score, reasons, status };
}
function idsOf(assignments) {
  return new Set(assignments.map((a) => a.candidateId));
}
function bundleRelations(all, ids) {
  return all.filter((r) => {
    if (r.type !== "arithmetic") {
      return ids.has(r.sourceCandidateId) && ids.has(r.targetCandidateId);
    }
    if (!ids.has(r.sourceCandidateId) || !ids.has(r.targetCandidateId)) {
      return false;
    }
    return (r.via || []).every((v) => ids.has(v));
  });
}
function bundleContradictions(all, assignments) {
  const byRole = new Map(assignments.map((a) => [a.role, a]));
  const ht = byRole.get("amountHT");
  const vat = byRole.get("vatAmount");
  const ttc = byRole.get("amountTTC");
  const rate = byRole.get("vatRate");
  return all.filter((c) => {
    if (c.kind !== "arithmeticMismatch") {
      return c.subjectIds.every(
        (id) => assignments.some((a) => a.candidateId === id)
      );
    }
    const ids = new Set(c.subjectIds);
    const usesHtVatTtc = ht && vat && ttc && ids.has(ht.candidateId) && ids.has(vat.candidateId) && ids.has(ttc.candidateId) && c.message.includes(String(ht.value)) && c.message.includes(String(vat.value)) && c.message.includes(String(ttc.value));
    const usesHtRateTtc = ht && rate && ttc && ids.has(ht.candidateId) && ids.has(rate.candidateId) && ids.has(ttc.candidateId);
    return Boolean(usesHtVatTtc || usesHtRateTtc);
  });
}
function ttcOf(s) {
  return s.assignments.find((a) => a.role === "amountTTC")?.value;
}
function rankScore(s) {
  const arith = s.relations.some((r) => r.type === "arithmetic");
  let bonus = 0;
  if (arith && s.contradictions.length === 0) bonus += 0.35;
  if (s.status === "contradictory") bonus -= 0.5;
  const local = avgLocal(s.assignments);
  bonus += local * 0.25;
  return s.score + bonus;
}
var GlobalConsistencyEngine = class {
  analyze(candidates) {
    const relResult = buildRelations(candidates);
    const solutions = [];
    for (const bundle of relResult.coherentBundles) {
      const assignments = [
        assignment("amountHT", bundle.ht),
        assignment("amountTTC", bundle.ttc)
      ];
      if (bundle.vatAmount) {
        assignments.push(assignment("vatAmount", bundle.vatAmount));
      }
      if (bundle.vatRate) {
        assignments.push(assignment("vatRate", bundle.vatRate));
      }
      const ids = idsOf(assignments);
      const relations = bundleRelations(relResult.relations, ids);
      const contradictions = bundleContradictions(
        relResult.contradictions,
        assignments
      );
      const explained = explainSolution(assignments, relations, contradictions, [
        { signal: "global:coherentArithmeticBundle", delta: 0.2 }
      ]);
      solutions.push({
        id: nextRelationId("sol"),
        status: contradictions.length ? "contradictory" : "resolved",
        assignments,
        score: clamp01(Math.max(explained.score, 0.85)),
        reasons: explained.reasons,
        relations,
        contradictions
      });
    }
    const money = candidates.filter((c) => c.type === "money");
    const rates = candidates.filter((c) => c.type === "percentage");
    for (const ttc of money) {
      const top = bestRole(ttc);
      if (top !== "amountTTC" && top !== "amountDue") continue;
      const covered = solutions.some(
        (s) => ttcOf(s) === ttc.value && s.status === "resolved" && s.relations.some((r) => r.type === "arithmetic")
      );
      if (covered) continue;
      const ht = money.filter((c) => c.id !== ttc.id && bestRole(c) === "amountHT").sort((a, b) => roleScore(b, "amountHT") - roleScore(a, "amountHT"))[0];
      const vat = money.filter(
        (c) => c.id !== ttc.id && c.id !== ht?.id && bestRole(c) === "vatAmount"
      ).sort(
        (a, b) => roleScore(b, "vatAmount") - roleScore(a, "vatAmount")
      )[0];
      const rate = rates.filter((c) => bestRole(c) === "vatRate").sort((a, b) => roleScore(b, "vatRate") - roleScore(a, "vatRate"))[0];
      const assignments = [
        assignment(
          roleScore(ttc, "amountTTC") >= roleScore(ttc, "amountDue") ? "amountTTC" : "amountDue",
          ttc
        )
      ];
      assignments[0] = assignment("amountTTC", ttc);
      if (ht) assignments.push(assignment("amountHT", ht));
      if (vat) assignments.push(assignment("vatAmount", vat));
      if (rate) assignments.push(assignment("vatRate", rate));
      const ids = idsOf(assignments);
      const relations = bundleRelations(relResult.relations, ids);
      let contradictions = bundleContradictions(
        relResult.contradictions,
        assignments
      );
      if (contextHas(ttc, /capital\s+social|au\s+capital/) || typeof ttc.value === "number" && ttc.value >= 1e5) {
        contradictions = [
          ...contradictions,
          {
            id: nextRelationId("contra"),
            subjectIds: [ttc.id],
            kind: "capitalAsTotal",
            message: "Montant type capital social \xE9cart\xE9 comme total TTC",
            penalty: RELATION_WEIGHTS.capitalAsTotal,
            reasons: [
              { signal: "contradiction:capitalAsTotal", delta: RELATION_WEIGHTS.capitalAsTotal }
            ],
            evidence: ttc.evidence
          }
        ];
      }
      if (ht && vat && typeof ht.value === "number" && typeof vat.value === "number" && typeof ttc.value === "number" && !nearlyEqual(ht.value + vat.value, ttc.value, RELATION_WEIGHTS.moneyTolerance)) {
        const already = contradictions.some((c) => c.kind === "arithmeticMismatch");
        if (!already) {
          contradictions.push({
            id: nextRelationId("contra"),
            subjectIds: [ht.id, vat.id, ttc.id],
            kind: "arithmeticMismatch",
            message: `HT (${ht.value}) + TVA (${vat.value}) \u2260 TTC (${ttc.value})`,
            penalty: RELATION_WEIGHTS.arithmeticMismatch,
            reasons: [
              {
                signal: `contradiction:HT+TVA\u2260TTC (${ht.value}+${vat.value}\u2260${ttc.value})`,
                delta: RELATION_WEIGHTS.arithmeticMismatch
              }
            ],
            evidence: [...ht.evidence, ...vat.evidence, ...ttc.evidence]
          });
        }
      }
      const explained = explainSolution(assignments, relations, contradictions);
      solutions.push({
        id: nextRelationId("sol"),
        status: explained.status,
        assignments,
        score: explained.score,
        reasons: explained.reasons,
        relations,
        contradictions
      });
    }
    if (!solutions.some((s) => s.status === "resolved") && relResult.contradictions.length) {
      const ht = money.filter((c) => roleScore(c, "amountHT") >= 0.4).sort((a, b) => roleScore(b, "amountHT") - roleScore(a, "amountHT"))[0];
      const ttc = money.filter((c) => roleScore(c, "amountTTC") >= 0.4).sort((a, b) => roleScore(b, "amountTTC") - roleScore(a, "amountTTC"))[0];
      const vat = money.filter((c) => roleScore(c, "vatAmount") >= 0.4).sort((a, b) => roleScore(b, "vatAmount") - roleScore(a, "vatAmount"))[0];
      const rate = rates.filter((c) => roleScore(c, "vatRate") >= 0.4).sort((a, b) => roleScore(b, "vatRate") - roleScore(a, "vatRate"))[0];
      if (ht && ttc) {
        const assignments = [
          assignment("amountHT", ht),
          assignment("amountTTC", ttc)
        ];
        if (vat) assignments.push(assignment("vatAmount", vat));
        if (rate) assignments.push(assignment("vatRate", rate));
        const ids = idsOf(assignments);
        const explained = explainSolution(
          assignments,
          bundleRelations(relResult.relations, ids),
          relResult.contradictions
        );
        solutions.push({
          id: nextRelationId("sol"),
          status: "contradictory",
          assignments,
          score: explained.score,
          reasons: explained.reasons,
          relations: bundleRelations(relResult.relations, ids),
          contradictions: relResult.contradictions
        });
      }
    }
    solutions.sort((a, b) => rankScore(b) - rankScore(a));
    const viable = solutions.filter((s) => s.status !== "contradictory");
    if (viable.length >= 2) {
      const a = viable[0];
      const b = viable[1];
      const ttcA = ttcOf(a);
      const ttcB = ttcOf(b);
      const aHasArith = a.relations.some((r) => r.type === "arithmetic");
      const bHasArith = b.relations.some((r) => r.type === "arithmetic");
      if (!(aHasArith && !bHasArith)) {
        if (ttcA != null && ttcB != null && ttcA !== ttcB && Math.abs(rankScore(a) - rankScore(b)) < RELATION_WEIGHTS.ambiguityMargin + (aHasArith ? 0 : 0.25)) {
          a.status = "ambiguous";
          b.status = "ambiguous";
          a.alternatives = [b];
        }
      }
    }
    solutions.sort((a, b) => rankScore(b) - rankScore(a));
    const best = solutions[0] || null;
    const hasResolved = solutions.some((s) => s.status === "resolved");
    const hasAmbiguous = solutions.some((s) => s.status === "ambiguous");
    const hasContra = relResult.contradictions.length > 0 || solutions.some((s) => s.contradictions.length > 0);
    let status = best?.status || "partial";
    if (hasResolved) status = "resolved";
    else if (relResult.contradictions.length > 0) status = "contradictory";
    else if (hasAmbiguous) status = "ambiguous";
    else if (hasContra) status = "contradictory";
    return {
      status,
      best,
      solutions,
      relations: relResult.relations,
      contradictions: relResult.contradictions
    };
  }
};
function analyzeConsistency(candidates) {
  return new GlobalConsistencyEngine().analyze(candidates);
}

// lib/v4/profiles/resolver.ts
function candidateContextBlob(c) {
  return normalizeLex(
    [
      c.context?.previousLine,
      c.context?.sameLine,
      c.context?.nextLine,
      c.raw,
      typeof c.value === "string" ? c.value : ""
    ].filter(Boolean).join(" ")
  );
}
function hasStrongAmountDueCandidate(ctx) {
  return (ctx.candidates || []).some((cand) => {
    if (cand.type !== "money") return false;
    if (roleScore(cand, "amountDue") < 0.55) return false;
    const line = normalizeLex(cand.context?.sameLine || "");
    if (/rembours|rien\s+a\s+faire/.test(line)) return false;
    return /reste\s+a\s+payer|montant\s+restant|net\s*a\s*payer|somme\s*a\s*payer|devez\s+regler|(?<!deja\s+)a\s*payer/.test(
      line
    );
  });
}
function hasStrongRefundCandidate(ctx) {
  return (ctx.candidates || []).some((cand) => {
    if (cand.type !== "money") return false;
    if (roleScore(cand, "refundAmount") < 0.5) return false;
    const blob2 = normalizeLex(
      [
        cand.context?.previousLine,
        cand.context?.sameLine,
        cand.context?.nextLine
      ].filter(Boolean).join(" ")
    );
    return /rembours|solde\s+crediteur|a\s+votre\s+credit/.test(blob2);
  });
}
function scoreCandidateForField(c, exp, ctx) {
  if (!exp.candidateTypes.includes(c.type)) return null;
  const reasons = [];
  let score = 0;
  const roles = exp.preferredRoles?.length ? exp.preferredRoles : [bestRole(c) || ""].filter(Boolean);
  const strongDueExists = exp.field === "amountDue" && hasStrongAmountDueCandidate(ctx);
  const strongRefundExists = hasStrongRefundCandidate(ctx);
  let best = 0;
  for (const role of roles) {
    let rs = roleScore(c, role);
    if (exp.field === "amountDue" && role === "amountTTC" && strongDueExists) {
      rs *= 0.25;
    }
    if (exp.field === "amountDue" && strongRefundExists) {
      rs *= role === "refundAmount" ? 0 : 0.15;
    }
    if ((exp.field === "amountHT" || exp.field === "amountTTC") && /represente|sur\s+cette\s+facture|tarif\s+d['']?utilisation|reseaux?\s+publics|acheminement/.test(
      candidateContextBlob(c)
    )) {
      rs *= 0.1;
    }
    if (rs > best) best = rs;
    if (rs > 0) reasons.push({ signal: `role:${role}`, delta: rs * 0.7 });
  }
  score += best * 0.7;
  const top = c.hypotheses[0];
  if (top && !roles.includes(top.role)) {
    score += top.score * 0.12;
    reasons.push({ signal: `topHypothesis:${top.role}`, delta: top.score * 0.12 });
  }
  const assigned = ctx.consistency?.best?.assignments.find(
    (a) => a.candidateId === c.id && roles.includes(a.role)
  );
  if (assigned) {
    if (exp.field === "amountDue" && assigned.role === "amountTTC" && strongDueExists) {
      reasons.push({ signal: "consistency:ttcIgnoredForDue", delta: 0 });
    } else {
      score += 0.28;
      reasons.push({ signal: "consistency:assigned", delta: 0.28 });
    }
  } else if (ctx.consistency?.best?.assignments.some((a) => a.candidateId === c.id)) {
    score += 0.08;
    reasons.push({ signal: "consistency:otherRole", delta: 0.08 });
  }
  const rels = ctx.relations || [];
  for (const rt of exp.expectedRelations || []) {
    const hit = rels.some(
      (r) => r.type === rt && (r.sourceCandidateId === c.id || r.targetCandidateId === c.id)
    );
    if (hit) {
      score += 0.12;
      reasons.push({ signal: `relation:${rt}`, delta: 0.12 });
    }
  }
  const blob2 = candidateContextBlob(c);
  const sameLine = normalizeLex(c.context?.sameLine || "");
  for (const re of exp.positiveContext || []) {
    if (re.test(blob2) || re.test(String(c.raw || ""))) {
      score += 0.1;
      reasons.push({ signal: `positiveContext:${re.source}`, delta: 0.1 });
    }
  }
  for (const re of exp.negativeSignals || []) {
    if (re.test(sameLine) || re.test(String(c.raw || ""))) {
      score -= 0.25;
      reasons.push({ signal: `negative:${re.source}`, delta: -0.25 });
    }
  }
  const contrad = (ctx.consistency?.contradictions || []).some(
    (x) => (x.subjectIds || []).includes(c.id)
  );
  if (contrad) {
    score -= 0.2;
    reasons.push({ signal: "contradiction", delta: -0.2 });
  }
  score = clamp01(score);
  if (score < 0.05 && best < 0.05) return null;
  return { value: c.value, candidate: c, score, reasons };
}
function evidenceOf2(c) {
  return [...c.evidence || []];
}
function scoreBlocksForField(exp, ctx) {
  const softTypes = /* @__PURE__ */ new Set([
    "documentTitle",
    "sectionTitle",
    "action",
    "obligation",
    "warning",
    "period"
  ]);
  if (!exp.candidateTypes.some((t) => softTypes.has(t))) return [];
  if (!exp.positiveContext?.length && !softTypes.has(exp.candidateTypes[0])) {
    return [];
  }
  const out = [];
  for (const [i, block] of ctx.blocks.entries()) {
    const text = block.text?.trim();
    if (!text || text.length < 3) continue;
    const lex2 = normalizeLex(text);
    const reasons = [];
    let score = 0;
    if (exp.candidateTypes.includes("documentTitle") && i === 0 && text.length <= 80) {
      score += 0.32;
      reasons.push({ signal: "layout:earlyShortBlock", delta: 0.32 });
    }
    for (const re of exp.positiveContext || []) {
      if (re.test(text) || re.test(lex2)) {
        score += 0.35;
        reasons.push({ signal: `blockContext:${re.source}`, delta: 0.35 });
      }
    }
    if (/\bobjet\s*:/i.test(text) && exp.field === "subject") {
      score += 0.4;
      reasons.push({ signal: "block:objet", delta: 0.4 });
    }
    if (/^\d+\s*[.)-]/.test(text) && exp.field === "keyPoints") {
      score += 0.3;
      reasons.push({ signal: "block:numberedPoint", delta: 0.3 });
    }
    if (score < 0.25) continue;
    const synthetic = {
      id: `block:${block.id || i}`,
      type: exp.candidateTypes[0],
      value: text.replace(/^objet\s*:\s*/i, "").trim(),
      hypotheses: [{ role: exp.preferredRoles?.[0] || "other", score, reasons }],
      evidence: [
        {
          text,
          page: block.page,
          bbox: block.bbox ?? null,
          blockId: block.id,
          lineId: block.lineId ?? null
        }
      ],
      page: block.page
    };
    out.push({ value: synthetic.value, candidate: synthetic, score: clamp01(score), reasons });
  }
  return out;
}
function resolveOne(exp, ctx) {
  if (exp.notApplicable) {
    return { field: exp.field, status: "notApplicable", expectation: exp };
  }
  const threshold = exp.confidenceThreshold ?? 0.55;
  const fromCandidates = ctx.candidates.map((c) => scoreCandidateForField(c, exp, ctx)).filter((o) => Boolean(o));
  const fromBlocks = scoreBlocksForField(exp, ctx);
  const options = [...fromCandidates, ...fromBlocks].sort(
    (a, b) => b.score - a.score
  );
  if (!options.length) {
    return {
      field: exp.field,
      status: "missing",
      expectation: exp,
      reasons: [{ signal: "noCandidate", delta: 0 }]
    };
  }
  if (exp.cardinality === "multiple") {
    const kept = options.filter((o) => o.score >= threshold * 0.75);
    if (!kept.length) {
      return {
        field: exp.field,
        status: "missing",
        expectation: exp,
        reasons: [{ signal: "belowThreshold", delta: 0 }]
      };
    }
    return {
      field: exp.field,
      status: "resolved",
      value: kept.map((o) => o.value),
      confidence: toConfidence(
        kept.reduce((a, o) => a + o.score, 0) / kept.length
      ),
      evidence: kept.flatMap((o) => evidenceOf2(o.candidate)),
      candidateIds: kept.map((o) => o.candidate.id),
      reasons: kept.flatMap((o) => o.reasons).slice(0, 12),
      expectation: exp
    };
  }
  const top = options[0];
  const second = options[1];
  const alts = options.slice(0, 4).map((o) => ({
    value: o.value,
    confidence: o.score,
    candidateIds: [o.candidate.id],
    reasons: o.reasons
  }));
  if (second && second.score >= threshold * 0.85 && Math.abs(top.score - second.score) < 0.12 && String(top.value) !== String(second.value)) {
    return {
      field: exp.field,
      status: "ambiguous",
      value: top.value,
      confidence: toConfidence(top.score * 0.7),
      evidence: evidenceOf2(top.candidate),
      candidateIds: [top.candidate.id],
      alternatives: alts,
      reasons: [
        ...top.reasons,
        {
          signal: `ambiguous:${String(top.value)}\u2248${String(second.value)}`,
          delta: -0.1
        }
      ],
      expectation: exp
    };
  }
  if (top.score < threshold) {
    return {
      field: exp.field,
      status: "missing",
      alternatives: alts,
      reasons: [
        ...top.reasons,
        { signal: "belowThreshold", delta: top.score - threshold }
      ],
      expectation: exp
    };
  }
  return {
    field: exp.field,
    status: "resolved",
    value: top.value,
    confidence: toConfidence(top.score),
    evidence: evidenceOf2(top.candidate),
    candidateIds: [top.candidate.id],
    alternatives: alts.slice(1),
    reasons: top.reasons,
    expectation: exp
  };
}
function computeCompleteness(fields) {
  const required2 = fields.filter((f) => f.expectation.required);
  const missingRequired = required2.filter((f) => f.status === "missing").map((f) => f.field);
  const ambiguous = fields.filter((f) => f.status === "ambiguous").map((f) => f.field);
  const resolved = fields.filter((f) => f.status === "resolved").map((f) => f.field);
  const resolvedHighConfidence = fields.filter(
    (f) => f.status === "resolved" && (f.confidence?.score ?? 0) >= 0.75
  ).map((f) => f.field);
  const notApplicable = fields.filter((f) => f.status === "notApplicable").map((f) => f.field);
  const weighted = required2.length ? required2.reduce((acc, f) => {
    if (f.status === "resolved") return acc + 1;
    if (f.status === "ambiguous") return acc + 0.4;
    return acc;
  }, 0) / required2.length : fields.filter((f) => f.status === "resolved").length / Math.max(
    1,
    fields.filter((f) => f.status !== "notApplicable").length
  );
  const ambPenalty = Math.min(0.15, ambiguous.length * 0.03);
  const completeness = clamp01(weighted - ambPenalty);
  return {
    completeness: Number(completeness.toFixed(4)),
    missingRequired,
    ambiguous,
    resolvedHighConfidence,
    resolved,
    notApplicable
  };
}
function resolveProfileFields(profile, ctx) {
  const expectations = [
    ...profile.expectedFields,
    ...profile.optionalFields,
    ...profile.notApplicableFields || [],
    ...(profile.forbiddenOrSuspiciousFields || []).map((f) => ({
      ...f,
      // champs suspects : on résout quand même pour signaler
      required: false
    }))
  ];
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  for (const exp of expectations) {
    if (seen.has(exp.field)) continue;
    seen.add(exp.field);
    ordered.push(exp);
  }
  const fields = ordered.map((exp) => resolveOne(exp, ctx));
  const completeness = computeCompleteness(fields);
  const warnings = [];
  for (const f of fields) {
    if (f.status === "missing" && f.expectation.required) {
      warnings.push(`missingRequired:${f.field}`);
    }
    if (f.status === "ambiguous") {
      warnings.push(`ambiguous:${f.field}`);
    }
  }
  for (const sus of profile.forbiddenOrSuspiciousFields || []) {
    const hit = fields.find((f) => f.field === sus.field);
    if (hit && (hit.status === "resolved" || hit.status === "ambiguous")) {
      warnings.push(`suspicious:${sus.field}`);
    }
  }
  return {
    profileId: profile.id,
    fields,
    completeness,
    relations: [...ctx.relations || []],
    warnings
  };
}
function validateProfile(profile, ctx) {
  const resolution = profile.resolveFields(ctx);
  const issues = [...resolution.warnings];
  if (resolution.completeness.missingRequired.length) {
    issues.push(
      `completeness:missingRequired=${resolution.completeness.missingRequired.join(",")}`
    );
  }
  return {
    ok: resolution.completeness.missingRequired.length === 0,
    resolution,
    issues
  };
}
function resolutionToAnalysis(resolution) {
  const fields = resolution.fields.filter((f) => f.status === "resolved" || f.status === "ambiguous").filter((f) => f.value !== void 0).map((f) => ({
    field: f.field,
    value: f.value,
    confidence: f.confidence || toConfidence(0.5),
    evidence: f.evidence || [],
    candidateIds: f.candidateIds
  }));
  return {
    fields,
    relations: resolution.relations,
    warnings: resolution.warnings,
    resolution
  };
}

// lib/v4/profiles/baseProfile.ts
function createDocumentProfile(def) {
  const profile = {
    id: def.id,
    expectedFields: def.expectedFields,
    optionalFields: def.optionalFields,
    notApplicableFields: def.notApplicableFields,
    forbiddenOrSuspiciousFields: def.forbiddenOrSuspiciousFields,
    expectedRelations: def.expectedRelations,
    supports(classification, _session) {
      if (classification.primary === def.id) return true;
      return Boolean(def.alsoSupports?.includes(classification.primary));
    },
    resolveFields(ctx) {
      return resolveProfileFields(profile, ctx);
    },
    validate(ctx) {
      return validateProfile(profile, ctx);
    },
    analyze(ctx) {
      return resolutionToAnalysis(profile.resolveFields(ctx));
    }
  };
  return profile;
}

// lib/v4/profiles/fieldHelpers.ts
function field2(partial) {
  return {
    required: false,
    importance: "medium",
    cardinality: "single",
    confidenceThreshold: 0.55,
    preferredRoles: [],
    ...partial
  };
}
function required(partial) {
  return field2({
    importance: "high",
    confidenceThreshold: 0.6,
    ...partial,
    required: true
  });
}
function na(fieldName, candidateTypes = ["money"]) {
  return {
    field: fieldName,
    candidateTypes,
    required: false,
    notApplicable: true,
    importance: "low",
    cardinality: "single"
  };
}

// lib/v4/profiles/definitions/administrativeLetter.ts
var administrativeLetterProfile2 = createDocumentProfile({
  id: "administrativeLetter",
  expectedRelations: [
    { type: "actionDeadline", importance: "high" },
    { type: "sender", importance: "medium" }
  ],
  expectedFields: [
    required({
      field: "senderOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "sender"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    required({
      field: "requestedActions",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.45,
      expectedRelations: ["actionDeadline"]
    })
  ],
  optionalFields: [
    field2({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "subject",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle", "sectionTitle", "dossierReference"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bobjet\s*:/i]
    }),
    field2({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "importantDates",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "deadlines",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.5,
      expectedRelations: ["actionDeadline"],
      positiveContext: [/avant\s+le|d['’]?ici\s+le|[eé]ch[eé]ance/i]
    }),
    field2({
      field: "requiredDocuments",
      candidateTypes: ["action", "reference"],
      preferredRoles: ["requestedAction", "dossierReference"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pi[eè]ces?|documents?\s+[aà]\s+fournir|joindre/i]
    }),
    field2({
      field: "contactInformation",
      candidateTypes: ["email", "phone", "address"],
      preferredRoles: ["contactEmail", "contactPhone"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  // Une lettre peut être complète sans aucun montant
  notApplicableFields: [
    na("amountTTC"),
    na("amountHT"),
    na("amountDue"),
    na("principalAmount")
  ]
});

// lib/v4/profiles/definitions/bankStatement.ts
var bankStatementProfile2 = createDocumentProfile({
  id: "bankStatement",
  expectedFields: [
    required({
      field: "openingBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/solde\s+pr[eé]c[eé]dent|solde\s+initial|opening/i]
    }),
    required({
      field: "closingBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/nouveau\s+solde|solde\s+(cr[eé]diteur|final)|closing/i]
    }),
    required({
      field: "transactions",
      candidateTypes: ["money"],
      preferredRoles: ["linePrice", "other", "balance", "amountDue"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.35,
      // Structure ledger — pas IBAN seul
      positiveContext: [/d[eé]bit|cr[eé]dit|libell[eé]|op[eé]ration|carte|virement/i],
      negativeSignals: [/iban|mandat\s+sepa|total\s+ttc|facture/i]
    })
  ],
  optionalFields: [
    field2({
      field: "accountHolder",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "bank",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "accountIdentifiers",
      candidateTypes: ["iban", "accountNumber", "reference"],
      preferredRoles: ["accountIban", "accountIdentifier"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "statementPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "transactionDates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "other"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.35
    })
  ],
  // IBAN seul n'est pas une expectation critique — et pas de principalAmount
  notApplicableFields: [
    {
      field: "principalAmount",
      candidateTypes: ["money"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    }
  ]
});

// lib/v4/profiles/definitions/certificate.ts
var certificateProfile2 = createDocumentProfile({
  id: "certificate",
  expectedFields: [
    required({
      field: "issuingOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    required({
      field: "beneficiary",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "signatory"],
      importance: "high",
      confidenceThreshold: 0.4
    })
  ],
  optionalFields: [
    field2({
      field: "certificateType",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/attestation|certificat/i]
    }),
    field2({
      field: "issueDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "validityPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "dueDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "statements",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "signature",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/signature|soussign/i]
    })
  ],
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});

// lib/v4/profiles/definitions/contract.ts
var contractProfile2 = createDocumentProfile({
  id: "contract",
  expectedRelations: [
    { type: "organizationPerson", importance: "medium" },
    { type: "actionDeadline", importance: "low" }
  ],
  expectedFields: [
    required({
      field: "parties",
      candidateTypes: ["organization", "person"],
      preferredRoles: ["issuer", "recipient", "recipientOrg", "signatory"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.35
    }),
    required({
      field: "effectiveDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/effet|entr[eé]e\s+en\s+vigueur|commence|partir\s+du/i]
    })
  ],
  optionalFields: [
    field2({
      field: "contractTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bcontrat\b|\bconvention\b/i]
    }),
    field2({
      field: "endDate",
      candidateTypes: ["date"],
      preferredRoles: ["dueDate", "deadline", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/fin|terme|expire|jusqu['’]?au/i]
    }),
    field2({
      field: "duration",
      candidateTypes: ["period", "reference"],
      preferredRoles: ["billingPeriod", "other"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/dur[eé]e|mois|ans|ann[eé]e/i]
    }),
    field2({
      field: "noticePeriod",
      candidateTypes: ["period", "deadline", "date"],
      preferredRoles: ["deadline", "other"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]avis|r[eé]siliation|d[eé]nonciation/i]
    }),
    field2({
      field: "obligations",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "paymentClauses",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/signature|sign[eé]/i]
    }),
    field2({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});

// lib/v4/profiles/definitions/explanatory.ts
var explanatoryDocumentProfile2 = createDocumentProfile({
  id: "explanatoryDocument",
  alsoSupports: ["notice"],
  expectedFields: [
    required({
      field: "title",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "high",
      confidenceThreshold: 0.3
    })
  ],
  optionalFields: [
    field2({
      field: "topic",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle", "documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "sections",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.25
    }),
    field2({
      field: "keyPoints",
      candidateTypes: ["action", "obligation", "warning"],
      preferredRoles: ["requestedAction", "obligation", "warning"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "definitions",
      candidateTypes: ["sectionTitle", "reference"],
      preferredRoles: ["sectionTitle", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3,
      positiveContext: [/d[eé]finition|signifie|on\s+entend/i]
    }),
    field2({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "procedures",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "contactReferences",
      candidateTypes: ["email", "phone", "organization", "reference"],
      preferredRoles: ["contactEmail", "contactPhone", "issuer"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.35
    })
  ],
  notApplicableFields: [
    na("amountTTC"),
    na("amountHT"),
    na("amountDue"),
    na("principalAmount"),
    {
      field: "requiredDate",
      candidateTypes: ["date"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    },
    {
      field: "requiredPerson",
      candidateTypes: ["person"],
      notApplicable: true,
      required: false,
      importance: "low",
      cardinality: "single"
    }
  ]
});

// lib/v4/profiles/definitions/financialStatement.ts
var financialStatementProfile2 = createDocumentProfile({
  id: "financialStatement",
  alsoSupports: ["fiscalPackage"],
  expectedFields: [
    required({
      field: "company",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer", "other"],
      importance: "high",
      confidenceThreshold: 0.3
    }),
    required({
      field: "fiscalYear",
      candidateTypes: ["period", "date", "sectionTitle", "documentTitle"],
      preferredRoles: ["fiscalPeriod", "documentDate", "documentTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/exercice\s+20\d{2}|ann[eé]e\s+20\d{2}|fiscal\s*year/i]
    })
  ],
  optionalFields: [
    field2({
      field: "turnover",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/chiffre\s+d['’]?affaires|ca\b|turnover/i]
    }),
    field2({
      field: "operatingResult",
      candidateTypes: ["money"],
      preferredRoles: ["other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+d['’]?exploitation/i]
    }),
    field2({
      field: "netResult",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+net/i]
    }),
    field2({
      field: "assets",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/actif/i]
    }),
    field2({
      field: "liabilities",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/passif/i]
    }),
    field2({
      field: "equity",
      candidateTypes: ["money"],
      preferredRoles: ["capitalSocial", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/capitaux\s+propres|equity/i]
    }),
    field2({
      field: "tableReferences",
      candidateTypes: ["reference", "table"],
      preferredRoles: ["other", "amountTable"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    })
  ],
  notApplicableFields: [
    na("principalAmount"),
    na("amountDue"),
    na("amountTTC")
  ]
});

// lib/v4/profiles/definitions/form.ts
var formProfile2 = createDocumentProfile({
  id: "form",
  expectedFields: [
    required({
      field: "formTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/\bformulaire\b|\bdemande\b/i]
    })
  ],
  optionalFields: [
    field2({
      field: "issuingOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "fields",
      candidateTypes: ["person", "address", "email", "phone", "reference"],
      preferredRoles: ["recipient", "other", "contactEmail"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3,
      positiveContext: [/signature/i]
    }),
    field2({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "deadline"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "instructions",
      candidateTypes: ["action", "warning"],
      preferredRoles: ["requestedAction", "warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "submissionDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      expectedRelations: ["actionDeadline"]
    })
  ],
  notApplicableFields: [na("amountTTC"), na("principalAmount")]
});

// lib/v4/profiles/definitions/invoice.ts
var invoiceProfile2 = createDocumentProfile({
  id: "invoice",
  expectedRelations: [
    { type: "arithmetic", importance: "high" },
    { type: "issuer", importance: "medium" }
  ],
  expectedFields: [
    required({
      field: "issuer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.35
    }),
    required({
      field: "amountTTC",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.55,
      expectedRelations: ["arithmetic"],
      negativeSignals: [
        /capital\s+social/i,
        /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement/i
      ]
    }),
    required({
      field: "amountHT",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"],
      negativeSignals: [
        /represente|sur\s+cette\s+facture|tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement/i
      ]
    }),
    required({
      field: "vatAmount",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    })
  ],
  optionalFields: [
    field2({
      field: "refundAmount",
      candidateTypes: ["money"],
      preferredRoles: ["refundAmount"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [
        /rembourser|remboursement|solde\s+cr[eé]diteur|a\s+votre\s+cr[eé]dit/i
      ]
    }),
    field2({
      field: "amountPaid",
      candidateTypes: ["money"],
      preferredRoles: ["amountPaid"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [
        /mensualit|d[eé]j[aà]\s+(pay[eé]|pr[eé]lev|factur)|paiements?\s+(ant[eé]rieurs|factur)/i
      ]
    }),
    field2({
      field: "legalIssuer",
      candidateTypes: ["organization"],
      preferredRoles: ["legalIssuer", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field2({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "invoiceNumber",
      candidateTypes: ["reference", "invoiceNumber"],
      preferredRoles: ["invoiceNumber"],
      importance: "high",
      positiveContext: [/facture|n[°o]/i],
      confidenceThreshold: 0.45
    }),
    field2({
      field: "invoiceDate",
      candidateTypes: ["date"],
      preferredRoles: ["invoiceDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+(de\s+)?facture|date\s+d['’]?[eé]mission/i],
      negativeSignals: [
        /date\s+de\s+cr[eé]ation|cr[eé]ation\s+de\s+(la\s+)?soci[eé]t[eé]|capital\s+social/i
      ]
    }),
    field2({
      field: "dueDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["dueDate", "deadline"],
      importance: "medium",
      confidenceThreshold: 0.55,
      positiveContext: [
        /[eé]ch[eé]ance|arrive\s+[aà]\s+[eé]ch[eé]ance|payable|avant\s+le/i
      ],
      negativeSignals: [
        /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|date\s+de\s+pr[eé]l[eè]vement|rembourserons?\s+(au|le)|sera\s+rembours/i
      ]
    }),
    field2({
      field: "refundDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["refundDate", "paymentDate"],
      importance: "high",
      confidenceThreshold: 0.5,
      positiveContext: [
        /rembourser|remboursement|sera\s+rembours/i
      ]
    }),
    field2({
      field: "paymentDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["paymentDate", "dueDate"],
      importance: "medium",
      confidenceThreshold: 0.5,
      positiveContext: [
        /pr[eé]l[eè]vement|sera\s+pr[eé]lev|date\s+de\s+pr[eé]l[eè]vement|paiement\s+le/i
      ],
      negativeSignals: [/rembourser|remboursement|sera\s+rembours/i]
    }),
    field2({
      field: "servicePeriod",
      candidateTypes: ["period"],
      preferredRoles: ["billingPeriod", "fiscalPeriod"],
      importance: "low",
      confidenceThreshold: 0.5
    }),
    field2({
      field: "vatRate",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    }),
    field2({
      field: "amountDue",
      candidateTypes: ["money"],
      // amountTTC = repli faible si aucun « reste à payer » / « à payer » explicite.
      // Le resolver démotive ce repli dès qu’un candidat amountDue / refund est fort.
      preferredRoles: ["amountDue", "netToPay", "amountTTC"],
      importance: "high",
      // Ne force PAS égalité avec amountTTC
      confidenceThreshold: 0.5,
      positiveContext: [
        /reste\s+[aà]\s+payer|montant\s+restant|montant\s+(total\s+)?([aà]\s+payer|d[uû])|net\s+[aà]\s+payer|somme\s+[aà]\s+payer|devez\s+r[eé]gler/i
      ],
      negativeSignals: [
        /deja\s+(pay[eé]|pr[eé]lev)|sous[-\s]?total|remise\b|capital\s+social|rembourser|remboursement|rien\s+[aà]\s+faire|mensualit/i
      ]
    }),
    field2({
      field: "paymentMethod",
      candidateTypes: ["iban"],
      preferredRoles: ["paymentIban"],
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["clientNumber", "dossierReference", "invoiceNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ],
  forbiddenOrSuspiciousFields: [
    field2({
      field: "bankOpeningBalance",
      candidateTypes: ["money"],
      preferredRoles: ["balance"],
      positiveContext: [/solde\s+precedent|opening\s+balance/i],
      confidenceThreshold: 0.7,
      importance: "low"
    })
  ]
});

// lib/v4/profiles/definitions/payslip.ts
var payslipProfile2 = createDocumentProfile({
  id: "payslip",
  expectedFields: [
    required({
      field: "grossSalary",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT", "other", "amountTTC"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/brut|salaire\s+brut/i]
    }),
    required({
      field: "netSalary",
      candidateTypes: ["money"],
      preferredRoles: ["netToPay", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [/net\s+[aà]\s+payer|salaire\s+net|net\s+pay[eé]/i]
    })
  ],
  optionalFields: [
    field2({
      field: "employer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "employee",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "signatory"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "payPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "netTaxable",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountHT"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/net\s+imposable/i]
    }),
    field2({
      field: "socialContributions",
      candidateTypes: ["money"],
      preferredRoles: ["linePrice", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/cotisation|urssaf|cs[g|g]/i]
    }),
    field2({
      field: "withholdingTax",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]l[eè]vement\s+[aà]\s+la\s+source|pas\b/i]
    }),
    field2({
      field: "paymentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "dueDate"],
      importance: "low",
      confidenceThreshold: 0.4
    })
  ],
  // Ne pas transformer toutes les cotisations en montant principal
  notApplicableFields: [na("principalAmount"), na("amountTTC")]
});

// lib/v4/profiles/definitions/receipt.ts
var receiptProfile2 = createDocumentProfile({
  id: "receipt",
  expectedFields: [
    required({
      field: "amountTTC",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC", "amountDue"],
      importance: "critical",
      confidenceThreshold: 0.5
    })
  ],
  optionalFields: [
    field2({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "issuer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ]
});

// lib/v4/profiles/definitions/taxDocument.ts
var taxDocumentProfile2 = createDocumentProfile({
  id: "taxDocument",
  alsoSupports: ["taxNotice"],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "vatAmount"],
      importance: "high",
      confidenceThreshold: 0.5,
      positiveContext: [/imp[oô]t|taxe|montant\s+[aà]\s+payer/i]
    }),
    required({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/montant\s+[aà]\s+payer|[aà]\s+payer/i]
    })
  ],
  optionalFields: [
    field2({
      field: "taxAuthority",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "taxpayer",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "taxType",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/imp[oô]t|taxe|fonci[eè]re|revenu/i]
    }),
    field2({
      field: "fiscalPeriod",
      candidateTypes: ["period", "reference", "documentTitle", "sectionTitle"],
      preferredRoles: ["fiscalPeriod", "billingPeriod", "other", "documentTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/p[eé]riode\s+fiscale|exercice\s+20\d{2}|revenu\s+20\d{2}|fiscale\s+20\d{2}/i],
      negativeSignals: [/date\s+limite|paiement|montant/i]
    }),
    field2({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT", "other"],
      importance: "low",
      confidenceThreshold: 0.5,
      positiveContext: [/base\s+(imposable|taxable)|revenu\s+fiscal/i]
    }),
    field2({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+limite|avant\s+le|limite\s+de\s+paiement|paiement/i]
    }),
    field2({
      field: "rates",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "warnings",
      candidateTypes: ["warning", "action"],
      preferredRoles: ["warning", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ]
});

// lib/v4/profiles/definitions/incomeTaxNotice.ts
var incomeTaxNoticeProfile = createDocumentProfile({
  id: "incomeTaxNotice",
  alsoSupports: ["taxDocument", "taxNotice"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [
        /imp[oô]t\s+(sur\s+le\s+revenu|calcul[eé])|montant\s+de\s+l['’]?imp[oô]t/i
      ]
    }),
    field2({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/reste\s+[aà]\s+payer|montant\s+restant|solde\s+[aà]\s+payer/i],
      negativeSignals: [/rembours|d[eé]j[aà]\s+pr[eé]lev|cr[eé]dit\s+d['’]?imp[oô]t/i]
    }),
    field2({
      field: "refundAmount",
      candidateTypes: ["money"],
      preferredRoles: ["refundAmount"],
      importance: "critical",
      confidenceThreshold: 0.5,
      positiveContext: [/rembours|montant\s+[aà]\s+votre\s+cr[eé]dit|trop[\s-]?vers[eé]/i]
    }),
    field2({
      field: "amountPaid",
      candidateTypes: ["money"],
      preferredRoles: ["amountPaid"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [
        /d[eé]j[aà]\s+pr[eé]lev|pr[eé]l[eè]vement\s+[aà]\s+la\s+source|retenue\s+[aà]\s+la\s+source|acomptes?\s+vers[eé]s?/i
      ],
      negativeSignals: [/reste\s+[aà]\s+payer|montant\s+[aà]\s+rembourser|solde\s+[aà]\s+payer/i]
    }),
    field2({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/revenus\s+de\s+l['’]?\s*ann[eé]e|ann[eé]e\s+d['’]?imposition|au\s+titre\s+de/i]
    }),
    field2({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]f[eé]rence\s+(de\s+l['’]?avis|avis)|n[°o]\s*avis/i]
    }),
    field2({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/date\s+limite|payer\s+avant|échéance/i]
    }),
    field2({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountHT"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/revenu\s+fiscal\s+de\s+r[eé]f[eé]rence|revenu\s+imposable/i]
    }),
    field2({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      importance: "low",
      confidenceThreshold: 0.5,
      cardinality: "multiple"
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});

// lib/v4/profiles/definitions/incomeTaxReturn.ts
var incomeTaxReturnProfile = createDocumentProfile({
  id: "incomeTaxReturn",
  alsoSupports: ["taxDocument", "form"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "invoiceNumber", "other"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/2042|formulaire|n[°o]\s*d[eé]claration/i]
    }),
    field2({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "critical",
      confidenceThreshold: 0.4,
      positiveContext: [/revenus\s+de\s+l['’]?\s*ann[eé]e|ann[eé]e\s+\d{4}/i]
    }),
    field2({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/d[eé]clarant|nom\s+et\s+pr[eé]nom/i]
    }),
    field2({
      field: "taxAuthority",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/dgfip|finances\s+publiques|imp[oô]ts\.gouv/i]
    }),
    field2({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field2({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/traitements\s+et\s+salaires|revenus\s+fonciers|montant\s+d[eé]clar/i]
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});

// lib/v4/profiles/definitions/propertyTax.ts
var propertyTaxProfile = createDocumentProfile({
  id: "propertyTax",
  alsoSupports: ["taxDocument"],
  expectedRelations: [],
  expectedFields: [
    required({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "amountTTC"],
      importance: "critical",
      confidenceThreshold: 0.45,
      positiveContext: [
        /taxe\s+fonci[eè]re|montant\s+(total\s+)?([aà]\s+payer|de\s+la\s+taxe)|total\s+[aà]\s+payer/i
      ],
      negativeSignals: [/\bht\b|\bttc\b|tva\b/i]
    }),
    field2({
      field: "amountDue",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "netToPay", "taxAmount"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/montant\s+[aà]\s+payer|total\s+[aà]\s+payer|reste\s+[aà]\s+payer/i]
    }),
    field2({
      field: "fiscalPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["fiscalPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/ann[eé]e\s+d['’]?imposition|au\s+titre\s+de\s+\d{4}/i]
    }),
    field2({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/date\s+limite\s+de\s+paiement|payer\s+avant\s+le/i]
    }),
    field2({
      field: "taxpayer",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "other"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field2({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.35
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});

// lib/v4/profiles/definitions/unknownTaxDocument.ts
var unknownTaxDocumentProfile = createDocumentProfile({
  id: "unknownTaxDocument",
  alsoSupports: ["taxDocument", "unknown"],
  expectedRelations: [],
  expectedFields: [
    field2({
      field: "taxAmount",
      candidateTypes: ["money"],
      preferredRoles: ["taxAmount", "amountDue", "other"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field2({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate"],
      importance: "low",
      confidenceThreshold: 0.45
    }),
    field2({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["other", "dossierReference"],
      importance: "low",
      confidenceThreshold: 0.45
    })
  ],
  optionalFields: [],
  forbiddenOrSuspiciousFields: []
});

// lib/v4/profiles/definitions/unknown.ts
var unknownProfile = createDocumentProfile({
  id: "unknown",
  expectedFields: [],
  optionalFields: [
    field2({
      field: "probableTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "medium",
      confidenceThreshold: 0.25
    }),
    field2({
      field: "organizations",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "recipientOrg", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "persons",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "sender", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "moneyValues",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC", "amountDue"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["other", "dossierReference"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "actions",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field2({
      field: "sections",
      candidateTypes: ["sectionTitle"],
      preferredRoles: ["sectionTitle"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.45,
      positiveContext: [/section|chapitre|partie\s+\d/i]
    })
  ]
});

// lib/v4/profiles/registry.ts
var DEFAULT_PROFILES = [
  invoiceProfile2,
  administrativeLetterProfile2,
  taxDocumentProfile2,
  incomeTaxNoticeProfile,
  incomeTaxReturnProfile,
  propertyTaxProfile,
  unknownTaxDocumentProfile,
  bankStatementProfile2,
  contractProfile2,
  payslipProfile2,
  formProfile2,
  certificateProfile2,
  financialStatementProfile2,
  explanatoryDocumentProfile2,
  receiptProfile2,
  unknownProfile
];
var extra = [];
function stubClassification(type) {
  return {
    primary: type,
    confidence: toConfidence(1),
    status: type === "unknown" ? "unknown" : "resolved",
    scores: { [type]: 1 },
    alternatives: [],
    secondarySections: [],
    evidence: [],
    contradictions: []
  };
}
function listDocumentProfiles() {
  return [...DEFAULT_PROFILES, ...extra];
}
function getDocumentProfile(type) {
  const all = listDocumentProfiles();
  return all.find((p) => p.id === type) || all.find((p) => p.supports(stubClassification(type)));
}
function resolveProfileForType(type) {
  return getDocumentProfile(type) || unknownProfile;
}

// lib/v4/profiles/pipeline.ts
var ProfilePipeline = class {
  candidates = new CandidatePipeline();
  router = new DocumentSchemaRouter();
  options;
  constructor(options = {}) {
    this.options = options;
  }
  runOnText(text) {
    return this.runOnBlocks(blocksFromPlainText(text));
  }
  runOnBlocks(blocks) {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const built = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    const router = this.options.fiscalKnowledge ? new DocumentSchemaRouter([
      ...listSchemaProfiles(),
      ...FISCAL_SPECIALIZED_SCHEMA_PROFILES
    ]) : this.router;
    let classification = router.classify({
      blocks,
      candidates,
      relations: built.relations,
      consistency
    });
    let fiscalKnowledge = null;
    if (this.options.fiscalKnowledge) {
      fiscalKnowledge = analyzeFiscalKnowledge(blocks);
      classification = mergeFiscalKnowledgeIntoClassification(
        classification,
        fiscalKnowledge
      );
    }
    const profile = resolveProfileForType(classification.primary);
    const ctx = {
      classification,
      candidates,
      blocks,
      relations: built.relations,
      consistency,
      text: blocks.map((b) => b.text).join("\n")
    };
    const resolution = profile.resolveFields(ctx);
    const validation = profile.validate(ctx);
    return {
      blocks: [...blocks],
      candidates: [...candidates],
      relations: built.relations,
      consistency,
      classification,
      profile,
      resolution,
      validation,
      fiscalKnowledge
    };
  }
};

// lib/v4/understanding/evidence.ts
function enrichEvidence(evidence, blocks) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const e of evidence || []) {
    const block = e.blockId ? blocks.find((b) => b.id === e.blockId) : void 0;
    const span = {
      text: e.text || block?.text || "",
      page: e.page ?? block?.page ?? 1,
      bbox: e.bbox ?? block?.bbox ?? null,
      blockId: e.blockId ?? block?.id ?? null,
      lineId: e.lineId ?? block?.lineId ?? null
    };
    const key = `${span.blockId}|${span.page}|${span.text}`;
    if (!span.text || seen.has(key)) continue;
    seen.add(key);
    out.push(span);
  }
  return out;
}
function evidenceFromBlocks(blocks, predicate) {
  return blocks.filter(predicate).map((b) => ({
    text: b.text,
    page: b.page,
    bbox: b.bbox ?? null,
    blockId: b.id,
    lineId: b.lineId ?? null
  }));
}
function isFactualClaim(item) {
  if (item.status === "missing" || item.status === "notApplicable" || item.status === "notFound" || item.status === "unknown" || item.status === "noExplicitActionDetected") {
    return false;
  }
  return item.value !== void 0 && item.value !== null;
}

// lib/v4/understanding/importance.ts
var FINANCIAL_KINDS = /* @__PURE__ */ new Set([
  "amountHT",
  "vatAmount",
  "vatRate",
  "amountTTC",
  "amountDue",
  "refundAmount",
  "amountPaid",
  "taxAmount",
  "grossSalary",
  "netSalary",
  "openingBalance",
  "closingBalance",
  "turnover",
  "netResult",
  "transactions"
]);
var DATE_KINDS = /* @__PURE__ */ new Set([
  "documentDate",
  "invoiceDate",
  "dueDate",
  "refundDate",
  "paymentDate",
  "paymentDeadline",
  "effectiveDate",
  "endDate",
  "fiscalPeriod",
  "statementPeriod",
  "actionDeadline",
  "deadlines",
  "importantDates"
]);
var PARTY_KINDS = /* @__PURE__ */ new Set([
  "issuer",
  "legalIssuer",
  "sender",
  "senderOrganization",
  "recipient",
  "beneficiary",
  "accountHolder",
  "employer",
  "employee",
  "taxpayer",
  "taxAuthority",
  "parties",
  "authority"
]);
var PROFILE_BOOST = {
  invoice: {
    amountTTC: "critical",
    amountDue: "critical",
    refundAmount: "critical",
    amountHT: "high",
    vatAmount: "high",
    invoiceDate: "high",
    issuer: "high",
    refundDate: "high",
    dueDate: "medium",
    amountPaid: "medium"
  },
  administrativeLetter: {
    requestedActions: "critical",
    deadlines: "critical",
    subject: "high",
    senderOrganization: "high",
    amountTTC: "low",
    amountDue: "low"
  },
  contract: {
    parties: "critical",
    effectiveDate: "high",
    noticePeriod: "high",
    duration: "high",
    contractTitle: "high",
    paymentMethod: "low"
  },
  bankStatement: {
    transactions: "critical",
    openingBalance: "high",
    closingBalance: "high",
    principalAmount: "low"
  },
  taxDocument: {
    amountDue: "critical",
    paymentDeadline: "critical",
    fiscalPeriod: "high",
    taxAmount: "high"
  },
  incomeTaxNotice: {
    amountDue: "critical",
    refundAmount: "critical",
    paymentDeadline: "critical",
    fiscalPeriod: "high",
    taxAmount: "high",
    amountPaid: "high"
  },
  incomeTaxReturn: {
    fiscalPeriod: "critical",
    reference: "high",
    taxpayer: "high",
    taxableBase: "medium"
  },
  propertyTax: {
    amountDue: "critical",
    taxAmount: "critical",
    paymentDeadline: "critical",
    fiscalPeriod: "high"
  },
  unknownTaxDocument: {
    taxAmount: "medium",
    amountDue: "medium"
  },
  explanatoryDocument: {
    title: "high",
    sections: "high",
    keyPoints: "high",
    procedures: "high",
    amountTTC: "low"
  },
  financialStatement: {
    turnover: "high",
    netResult: "high",
    company: "high",
    fiscalYear: "high",
    principalAmount: "low"
  }
};
function importanceFor(type, field3, fallback) {
  const boosted = PROFILE_BOOST[type]?.[field3];
  if (boosted) return boosted;
  if (fallback) return fallback;
  if (FINANCIAL_KINDS.has(field3)) return "medium";
  if (DATE_KINDS.has(field3)) return "medium";
  if (PARTY_KINDS.has(field3)) return "medium";
  return "low";
}
function isFinancialField(field3) {
  return FINANCIAL_KINDS.has(field3);
}
function isDateField(field3) {
  return DATE_KINDS.has(field3);
}
function isPartyField(field3) {
  return PARTY_KINDS.has(field3);
}

// lib/v4/understanding/actions.ts
function deadlineItemFromRelation(rel2, candidates, blocks, type) {
  const dateCand = candidates.find(
    (c) => (c.id === rel2.targetCandidateId || c.id === rel2.sourceCandidateId) && (c.type === "date" || c.type === "deadline")
  );
  if (!dateCand) return null;
  const evidence = enrichEvidence(dateCand.evidence, blocks);
  if (!evidence.length) return null;
  return {
    kind: "actionDeadline",
    value: dateCand.value,
    confidence: toConfidence(rel2.score),
    status: "resolved",
    importance: importanceFor(type, "actionDeadline", "critical"),
    evidence,
    derivedFrom: [
      `relation:${rel2.id}`,
      `candidate:${dateCand.id}`,
      "relationType:actionDeadline"
    ],
    reasoning: rel2.reasons
  };
}
function buildActions(type, fields, candidates, relations, blocks) {
  const actions = [];
  const actionRels = relations.filter((r) => r.type === "actionDeadline");
  const actionField = fields.find(
    (f) => (f.field === "requestedActions" || f.field === "obligations") && (f.status === "resolved" || f.status === "ambiguous")
  );
  const actionCandidates = candidates.filter((c) => c.type === "action");
  for (const rel2 of actionRels) {
    const actionCand = candidates.find(
      (c) => (c.id === rel2.sourceCandidateId || c.id === rel2.targetCandidateId) && c.type === "action"
    );
    if (!actionCand) continue;
    const evidence = enrichEvidence(
      [...actionCand.evidence || [], ...rel2.evidence || []],
      blocks
    );
    if (!evidence.length) continue;
    const deadline = deadlineItemFromRelation(rel2, candidates, blocks, type);
    actions.push({
      actionType: "requestedAction",
      description: String(actionCand.value),
      actor: null,
      target: null,
      deadline,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(rel2.score),
      evidence,
      status: "resolved",
      derivedFrom: [
        `candidate:${actionCand.id}`,
        `relation:${rel2.id}`,
        ...deadline ? deadline.derivedFrom : []
      ],
      reasoning: [
        ...rel2.reasons,
        { signal: "actionDeadline:linked", delta: 0.2 }
      ]
    });
  }
  for (const c of actionCandidates) {
    if (actions.some((a) => a.derivedFrom.includes(`candidate:${c.id}`))) {
      continue;
    }
    const evidence = enrichEvidence(c.evidence, blocks);
    if (!evidence.length) continue;
    actions.push({
      actionType: "requestedAction",
      description: String(c.value),
      actor: null,
      target: null,
      deadline: null,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(c.hypotheses[0]?.score ?? 0.5),
      evidence,
      status: "resolved",
      derivedFrom: [`candidate:${c.id}`],
      reasoning: c.hypotheses[0]?.reasons || [
        { signal: "action:explicit", delta: 0.4 }
      ]
    });
  }
  if (actionField && Array.isArray(actionField.value)) {
    for (const v of actionField.value) {
      if (actions.some((a) => a.description === String(v))) continue;
      const evidence = enrichEvidence(actionField.evidence, blocks);
      if (!evidence.length) continue;
      actions.push({
        actionType: "requestedAction",
        description: String(v),
        actor: null,
        target: null,
        deadline: null,
        requiredDocuments: [],
        conditions: [],
        confidence: actionField.confidence || toConfidence(0.5),
        evidence,
        status: actionField.status,
        derivedFrom: [`field:${actionField.field}`],
        reasoning: actionField.reasons || []
      });
    }
  }
  if (!actions.length) {
    actions.push({
      actionType: "none",
      description: null,
      actor: null,
      target: null,
      deadline: null,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(0.9),
      evidence: [],
      status: "noExplicitActionDetected",
      derivedFrom: ["scan:actions"],
      reasoning: [{ signal: "noExplicitActionDetected", delta: 0 }]
    });
  }
  return actions;
}

// lib/v4/understanding/noAction.ts
var NO_ACTION_RE = /rien\s+a\s+faire|n['’]avez\s+rien\s+a\s+faire|aucune\s+demarche\s+(n['’]est|ne\s+sera)|pas\s+d['’]action\s+(a\s+)?effectuer|aucune\s+action\s+(n['’]est|requise)/i;
function detectExplicitNoAction(blocks) {
  const hit = blocks.find((b) => NO_ACTION_RE.test(normalizeLex(b.text)));
  if (!hit) return null;
  const evidence = evidenceFromBlocks(
    blocks,
    (b) => NO_ACTION_RE.test(normalizeLex(b.text))
  );
  if (!evidence.length) return null;
  return {
    kind: "actionRequired",
    value: false,
    confidence: toConfidence(0.9),
    status: "resolved",
    importance: "high",
    evidence: evidence.slice(0, 3),
    derivedFrom: ["scan:explicitNoAction"],
    reasoning: [{ signal: "content:rienAFaire", delta: 0.9 }]
  };
}

// lib/v4/understanding/coverage.ts
function claimSupport(item) {
  if (!isFactualClaim(item)) return "skip";
  if (!item.evidence.length) return "unsupported";
  const relational = item.derivedFrom.some(
    (d) => d.startsWith("relation:") || d.includes("arithmetic") || d.includes("actionDeadline")
  );
  return relational ? "relational" : "direct";
}
function computeEvidenceCoverage(input) {
  const items = [
    input.purpose,
    ...input.parties,
    ...input.keyFacts,
    ...input.financialFacts,
    ...input.importantDates
  ];
  for (const a of input.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    if (!a.description) continue;
    items.push({
      kind: `action:${a.actionType}`,
      value: a.description,
      confidence: a.confidence,
      status: a.status,
      importance: "high",
      evidence: a.evidence,
      derivedFrom: a.derivedFrom,
      reasoning: a.reasoning
    });
    if (a.deadline && isFactualClaim(a.deadline)) {
      items.push(a.deadline);
    }
  }
  for (const w of input.warnings) {
    if (w.kind !== "arithmeticContradiction" && w.kind !== "conflictingValues") {
      continue;
    }
    items.push({
      kind: `warning:${w.kind}`,
      value: w.message,
      confidence: w.confidence,
      status: "resolved",
      importance: "high",
      evidence: w.evidence,
      derivedFrom: w.derivedFrom,
      reasoning: w.reasoning
    });
  }
  let directlySupported = 0;
  let relationallySupported = 0;
  let unsupported = 0;
  let total = 0;
  for (const item of items) {
    const s = claimSupport(item);
    if (s === "skip") continue;
    total += 1;
    if (s === "direct") directlySupported += 1;
    else if (s === "relational") relationallySupported += 1;
    else unsupported += 1;
  }
  const supported = directlySupported + relationallySupported;
  const coverage = total === 0 ? 1 : supported / total;
  return {
    totalClaims: total,
    directlySupported,
    relationallySupported,
    unsupported,
    coverage: Number(coverage.toFixed(4))
  };
}
function dropUnsupportedFacts(items) {
  return items.filter((i) => !isFactualClaim(i) || i.evidence.length > 0);
}
function invariantsHold(u) {
  const errors = [];
  if (u.evidenceCoverage.unsupported !== 0) {
    errors.push(`unsupportedClaims=${u.evidenceCoverage.unsupported}`);
  }
  const check = (items, label) => {
    for (const i of items) {
      if (isFactualClaim(i) && i.evidence.length === 0) {
        errors.push(`${label}:${i.kind}:noEvidence`);
      }
    }
  };
  check([u.purpose], "purpose");
  check(u.parties, "parties");
  check(u.keyFacts, "keyFacts");
  check(u.financialFacts, "financial");
  check(u.importantDates, "dates");
  for (const a of u.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    if (a.description && a.evidence.length === 0) {
      errors.push(`action:noEvidence`);
    }
  }
  return errors;
}

// lib/v4/understanding/facts.ts
function fieldToItem(field3, type, blocks) {
  if (field3.status === "notApplicable") return null;
  if (field3.status === "missing") {
    return null;
  }
  const evidence = enrichEvidence(field3.evidence, blocks);
  if ((field3.status === "resolved" || field3.status === "ambiguous") && field3.value !== void 0 && evidence.length === 0) {
    return null;
  }
  return {
    kind: field3.field,
    value: field3.value,
    confidence: field3.confidence || toConfidence(0.5),
    status: field3.status,
    importance: importanceFor(
      type,
      field3.field,
      field3.expectation.importance
    ),
    evidence,
    derivedFrom: [
      `field:${field3.field}`,
      ...(field3.candidateIds || []).map((id) => `candidate:${id}`),
      ...(field3.reasons || []).map((r) => r.signal)
    ],
    reasoning: field3.reasons || []
  };
}
function buildFactBuckets(type, fields, blocks) {
  const parties = [];
  const financialFacts = [];
  const importantDates = [];
  const keyFacts = [];
  for (const f of fields) {
    const item = fieldToItem(f, type, blocks);
    if (!item) continue;
    if (isPartyField(f.field)) {
      parties.push(item);
    } else if (isFinancialField(f.field)) {
      financialFacts.push(item);
    } else if (isDateField(f.field)) {
      importantDates.push(item);
    } else if (item.importance === "critical" || item.importance === "high" || item.importance === "medium") {
      keyFacts.push(item);
    }
  }
  const ranked = [...parties, ...financialFacts, ...importantDates, ...keyFacts].filter(
    (i) => i.importance === "critical" || i.importance === "high"
  ).sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.importance] - rank[b.importance];
  });
  const seen = /* @__PURE__ */ new Set();
  const mergedKey = [];
  for (const item of ranked) {
    if (seen.has(item.kind)) continue;
    seen.add(item.kind);
    mergedKey.push(item);
  }
  return {
    parties,
    keyFacts: mergedKey,
    financialFacts,
    importantDates
  };
}

// lib/v4/understanding/purpose.ts
function contentSignals(type, blocks, fields) {
  const text = blocks.map((b) => b.text).join("\n");
  const signals = [];
  const push = (kind, re, weight, reason) => {
    if (!re.test(text)) return;
    signals.push({
      kind,
      weight,
      evidence: evidenceFromBlocks(blocks, (b) => re.test(b.text)),
      reasons: [{ signal: reason, delta: weight }]
    });
  };
  push(
    "paymentRequest",
    /montant\s+[aà]\s+payer|net\s+[aà]\s+payer|r[eé]glez|effectuez\s+le\s+virement|somme\s+[aà]\s+payer/i,
    0.4,
    "content:paymentCue"
  );
  push("informationRequest", /transmettre|merci\s+de|justificatif|veuillez/i, 0.4, "content:requestCue");
  push("certification", /attestation|certifie|je\s+soussign/i, 0.4, "content:certCue");
  push("agreement", /\bcontrat\b|\bconvention\b|prend\s+effet|pr[eé]avis/i, 0.4, "content:contractCue");
  push("accountStatement", /relev[eé]\s+de\s+compte|solde\s+pr[eé]c[eé]dent|d[eé]bit|cr[eé]dit/i, 0.4, "content:bankCue");
  push("taxObligation", /imp[oô]t|montant\s+[aà]\s+payer|date\s+limite/i, 0.3, "content:taxCue");
  push("explanation", /guide|mode\s+d['’]?emploi|comment\s+faire|\b[eé]tape/i, 0.35, "content:guideCue");
  push("information", /nous\s+vous\s+informons|pour\s+information|mis\s+[aà]\s+jour/i, 0.25, "content:infoCue");
  push(
    "billingNotice",
    /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|mandat\s+sepa/i,
    0.45,
    "content:autoDebitCue"
  );
  push(
    "billingNotice",
    /rembourser|remboursement|rien\s+[aà]\s+faire|solde\s+cr[eé]diteur/i,
    0.5,
    "content:refundCue"
  );
  push(
    "billingNotice",
    /\bfacture\b|total\s+ttc|consommation|electricit|energie|cl[oô]ture/i,
    0.3,
    "content:invoiceCue"
  );
  const has = (name) => fields.some((f) => f.field === name && f.status === "resolved");
  const autoDebit = /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|mandat\s+sepa/i.test(
    text
  );
  const explicitPayAsk = /montant\s+[aà]\s+payer|net\s+[aà]\s+payer|r[eé]glez|effectuez\s+le\s+virement|somme\s+[aà]\s+payer|reste\s+[aà]\s+payer/i.test(
    text
  );
  if (has("amountDue") && explicitPayAsk && !autoDebit) {
    signals.push({
      kind: "paymentRequest",
      weight: 0.25,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "amountDue")?.evidence,
        blocks
      ),
      reasons: [{ signal: "field:amountDue:payAsk", delta: 0.25 }]
    });
  } else if (has("amountTTC") || has("amountDue")) {
    signals.push({
      kind: "billingNotice",
      weight: autoDebit ? 0.25 : 0.15,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "amountDue" || f.field === "amountTTC")?.evidence,
        blocks
      ),
      reasons: [
        {
          signal: autoDebit ? "field:amount:autoDebit" : "field:amount:billing",
          delta: autoDebit ? 0.25 : 0.15
        }
      ]
    });
  }
  if (has("requestedActions") || has("deadlines")) {
    signals.push({
      kind: "informationRequest",
      weight: 0.3,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "requestedActions")?.evidence,
        blocks
      ),
      reasons: [{ signal: "field:action", delta: 0.3 }]
    });
  }
  const typeMap = {
    // Facture ≠ automatiquement « demande de paiement » manuel
    invoice: "billingNotice",
    administrativeLetter: "informationRequest",
    certificate: "certification",
    notice: "information",
    contract: "agreement",
    bankStatement: "accountStatement",
    taxDocument: "taxObligation",
    incomeTaxReturn: "formSubmission",
    incomeTaxNotice: "taxObligation",
    propertyTax: "taxObligation",
    taxForm: "formSubmission",
    unknownTaxDocument: "taxObligation",
    payslip: "employmentRecord",
    form: "formSubmission",
    explanatoryDocument: "explanation"
  };
  const fromType = typeMap[type];
  if (fromType) {
    signals.push({
      kind: fromType,
      weight: 0.15,
      evidence: blocks[0] ? [
        {
          text: blocks[0].text,
          page: blocks[0].page,
          bbox: blocks[0].bbox ?? null,
          blockId: blocks[0].id,
          lineId: blocks[0].lineId ?? null
        }
      ] : [],
      reasons: [{ signal: `typeSignal:${type}`, delta: 0.15 }]
    });
  }
  return signals;
}
function buildPurpose(type, blocks, fields) {
  const signals = contentSignals(type, blocks, fields);
  const byKind = /* @__PURE__ */ new Map();
  for (const s of signals) {
    const list = byKind.get(s.kind) || [];
    list.push(s);
    byKind.set(s.kind, list);
  }
  let bestKind = "unknown";
  let bestScore = 0;
  let bestEvidence = [];
  let bestReasons = [];
  for (const [kind, list] of byKind) {
    const score = list.reduce((a, s) => a + s.weight, 0);
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
      bestEvidence = list.flatMap((s) => s.evidence);
      bestReasons = list.flatMap((s) => s.reasons);
    }
  }
  if (bestScore < 0.3) {
    return {
      kind: "purpose",
      value: "unknown",
      confidence: toConfidence(0.2),
      status: "unknown",
      importance: "medium",
      evidence: bestEvidence.slice(0, 3),
      derivedFrom: bestReasons.map((r) => r.signal),
      reasoning: bestReasons
    };
  }
  return {
    kind: "purpose",
    value: bestKind,
    confidence: toConfidence(Math.min(1, bestScore)),
    status: "resolved",
    importance: "high",
    evidence: enrichEvidence(bestEvidence, blocks).slice(0, 6),
    derivedFrom: [
      ...bestReasons.map((r) => r.signal),
      `documentType:${type}`
    ],
    reasoning: bestReasons
  };
}

// lib/v4/understanding/sections.ts
function buildSections(fields, blocks) {
  const sections = [];
  const sectionField = fields.find(
    (f) => f.field === "sections" && (f.status === "resolved" || f.status === "ambiguous")
  );
  if (sectionField && Array.isArray(sectionField.value)) {
    for (const title of sectionField.value) {
      const evidence = enrichEvidence(sectionField.evidence, blocks).filter(
        (e) => e.text.includes(String(title)) || String(title).includes(e.text)
      );
      const ev = evidence.length > 0 ? evidence : enrichEvidence(sectionField.evidence, blocks).slice(0, 1);
      if (!ev.length) continue;
      sections.push({
        title: String(title),
        kind: "section",
        items: [
          {
            kind: "sectionTitle",
            value: title,
            confidence: sectionField.confidence || toConfidence(0.5),
            status: sectionField.status,
            importance: "high",
            evidence: ev,
            derivedFrom: ["field:sections"],
            reasoning: sectionField.reasons || []
          }
        ],
        evidence: ev
      });
    }
  }
  const keyPoints = fields.find(
    (f) => f.field === "keyPoints" && (f.status === "resolved" || f.status === "ambiguous")
  );
  if (keyPoints && Array.isArray(keyPoints.value)) {
    const evidence = enrichEvidence(keyPoints.evidence, blocks);
    if (evidence.length) {
      sections.push({
        title: "keyPoints",
        kind: "keyPoints",
        items: keyPoints.value.map((v) => ({
          kind: "keyPoint",
          value: v,
          confidence: keyPoints.confidence || toConfidence(0.5),
          status: keyPoints.status,
          importance: "high",
          evidence,
          derivedFrom: ["field:keyPoints"],
          reasoning: keyPoints.reasons || []
        })),
        evidence
      });
    }
  }
  const procedures = fields.find(
    (f) => (f.field === "procedures" || f.field === "instructions") && (f.status === "resolved" || f.status === "ambiguous")
  );
  if (procedures && Array.isArray(procedures.value)) {
    const evidence = enrichEvidence(procedures.evidence, blocks);
    if (evidence.length) {
      sections.push({
        title: "procedures",
        kind: "procedures",
        items: procedures.value.map((v) => ({
          kind: "step",
          value: v,
          confidence: procedures.confidence || toConfidence(0.5),
          status: procedures.status,
          importance: "high",
          evidence,
          derivedFrom: [`field:${procedures.field}`],
          reasoning: procedures.reasons || []
        })),
        evidence
      });
    }
  }
  return sections;
}

// lib/v4/understanding/summary.ts
function buildStructuredSummary(input) {
  const what = [];
  if (input.identity.title) what.push(input.identity.title);
  what.push(input.purpose);
  if (input.identity.reference) what.push(input.identity.reference);
  const who = input.parties.filter(
    (p) => p.status === "resolved" || p.status === "ambiguous"
  );
  const why = [input.purpose];
  const important = input.keyFacts.filter(
    (k) => k.importance === "critical" || k.importance === "high"
  );
  const explicitActions = input.actions.filter(
    (a) => a.status !== "noExplicitActionDetected"
  );
  const deadlines = [
    ...input.importantDates.filter(
      (d) => /deadline|dueDate|refundDate|paymentDate|paymentDeadline|actionDeadline/i.test(d.kind)
    ),
    ...explicitActions.map((a) => a.deadline).filter((d) => Boolean(d))
  ];
  const amounts = input.financialFacts.filter(
    (f) => f.status === "resolved" || f.status === "ambiguous"
  );
  return {
    what,
    who,
    why,
    important,
    actions: explicitActions.length ? explicitActions : input.actions.filter((a) => a.status === "noExplicitActionDetected"),
    deadlines,
    amounts,
    warnings: input.warnings,
    uncertainties: input.uncertainties
  };
}

// lib/v4/understanding/warnings.ts
function buildWarnings(resolution, consistency, relations, blocks) {
  const warnings = [];
  for (const c of consistency?.contradictions || []) {
    const evidence = enrichEvidence(c.evidence, blocks);
    const isArith = /HT|TVA|TTC|arithmetic|≠|!=/i.test(c.message) || c.kind.includes("arithmetic");
    warnings.push({
      kind: isArith ? "arithmeticContradiction" : "conflictingValues",
      message: c.message,
      relatedKinds: c.subjectIds,
      confidence: toConfidence(0.85),
      evidence,
      derivedFrom: [`contradiction:${c.id}`, ...c.subjectIds.map((id) => `candidate:${id}`)],
      reasoning: c.reasons
    });
  }
  for (const name of resolution.completeness.missingRequired) {
    warnings.push({
      kind: "missingExpectedField",
      message: `Champ attendu non r\xE9solu: ${name}`,
      relatedKinds: [name],
      confidence: toConfidence(0.7),
      evidence: [],
      derivedFrom: [`field:${name}`, "status:missing"],
      reasoning: [{ signal: "missingExpectedField", delta: 0 }]
    });
  }
  for (const f of resolution.fields) {
    if (f.status !== "ambiguous") continue;
    warnings.push({
      kind: "ambiguousField",
      message: `Champ ambigu: ${f.field}`,
      relatedKinds: [f.field],
      confidence: f.confidence || toConfidence(0.5),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || [{ signal: "ambiguousField", delta: -0.1 }]
    });
  }
  for (const f of resolution.fields) {
    if (f.status !== "resolved") continue;
    if ((f.confidence?.score ?? 1) >= 0.45) continue;
    if (f.expectation.importance !== "critical" && f.expectation.importance !== "high") {
      continue;
    }
    warnings.push({
      kind: "lowConfidence",
      message: `Faible confiance: ${f.field}`,
      relatedKinds: [f.field],
      confidence: f.confidence || toConfidence(0.3),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: [{ signal: "lowConfidence", delta: -0.1 }]
    });
  }
  const hasActionDeadline = relations.some((r) => r.type === "actionDeadline");
  const expectsAction = resolution.fields.some(
    (f) => f.field === "requestedActions" && f.status === "resolved"
  );
  const expectsDeadline = resolution.fields.some(
    (f) => (f.field === "deadlines" || f.field === "paymentDeadline") && f.status === "resolved"
  );
  if (expectsAction && expectsDeadline && !hasActionDeadline) {
    warnings.push({
      kind: "unresolvedRelation",
      message: "Action et \xE9ch\xE9ance pr\xE9sentes sans relation actionDeadline forte",
      relatedKinds: ["requestedActions", "deadlines"],
      confidence: toConfidence(0.55),
      evidence: [],
      derivedFrom: ["relation:actionDeadline:missing"],
      reasoning: [{ signal: "unresolvedRelation", delta: -0.05 }]
    });
  }
  return warnings;
}
function buildUncertainties(resolution, blocks) {
  const out = [];
  for (const f of resolution.fields) {
    if (f.status !== "ambiguous") continue;
    const alts = f.alternatives?.length ? f.alternatives : [
      {
        value: f.value,
        confidence: f.confidence?.score ?? 0.5,
        candidateIds: f.candidateIds || [],
        reasons: f.reasons || []
      }
    ];
    out.push({
      kind: f.field,
      status: "ambiguous",
      candidates: alts.map((a) => ({
        value: a.value,
        confidence: a.confidence,
        evidence: enrichEvidence(f.evidence, blocks),
        derivedFrom: (a.candidateIds || []).map((id) => `candidate:${id}`)
      })),
      evidence: enrichEvidence(f.evidence, blocks),
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || [{ signal: "ambiguous", delta: -0.1 }]
    });
  }
  return out;
}

// lib/v4/understanding/builder.ts
function buildIdentity(classification, resolution, blocks) {
  const titleField = resolution.fields.find(
    (f) => (f.field === "title" || f.field === "formTitle" || f.field === "contractTitle" || f.field === "subject") && (f.status === "resolved" || f.status === "ambiguous")
  );
  const refField = resolution.fields.find(
    (f) => (f.field === "invoiceNumber" || f.field === "reference" || f.field === "references") && (f.status === "resolved" || f.status === "ambiguous")
  );
  const toItem = (f, kind) => {
    const evidence = enrichEvidence(f.evidence, blocks);
    if (!evidence.length || f.value === void 0) return null;
    return {
      kind,
      value: f.value,
      confidence: f.confidence || toConfidence(0.5),
      status: f.status,
      importance: f.expectation.importance || "medium",
      evidence,
      derivedFrom: [`field:${f.field}`],
      reasoning: f.reasons || []
    };
  };
  return {
    documentType: classification.primary,
    title: titleField ? toItem(titleField, titleField.field) : null,
    reference: refField ? toItem(refField, refField.field) : null
  };
}
function buildArithmeticDerived(relations, resolution, blocks) {
  const arith = relations.find(
    (r) => r.type === "arithmetic" && r.score >= 0.7 && /HT\s*\+\s*TVA|HT\+TVA/i.test(r.label || "")
  );
  if (!arith) {
    const any = relations.find((r) => r.type === "arithmetic" && r.score >= 0.85);
    if (!any) return null;
    return fromArith(any, resolution, blocks);
  }
  return fromArith(arith, resolution, blocks);
}
function fromArith(rel2, resolution, blocks) {
  const usable = (name) => resolution.fields.find(
    (f) => f.field === name && (f.status === "resolved" || f.status === "ambiguous") && f.value !== void 0
  );
  const ht = usable("amountHT");
  const vat = usable("vatAmount");
  const ttc = usable("amountTTC");
  if (!ht || !vat || !ttc) return null;
  const evidence = enrichEvidence(
    [
      ...ht.evidence || [],
      ...vat.evidence || [],
      ...ttc.evidence || [],
      ...rel2.evidence || []
    ],
    blocks
  );
  if (evidence.length < 2) return null;
  return {
    kind: "arithmeticConsistency",
    value: {
      amountHT: ht.value,
      vatAmount: vat.value,
      amountTTC: ttc.value,
      relation: rel2.label || "HT + TVA \u2248 TTC"
    },
    confidence: toConfidence(rel2.score),
    status: "resolved",
    importance: "high",
    evidence,
    derivedFrom: [
      "field:amountHT",
      "field:vatAmount",
      "field:amountTTC",
      `relation:${rel2.id}`,
      "arithmetic:HT+VAT\u2248TTC"
    ],
    reasoning: [
      ...rel2.reasons,
      { signal: "explicitLabel:TTC", delta: 0.1 },
      { signal: "arithmetic:HT+VAT\u2248TTC", delta: 0.3 }
    ]
  };
}
function buildDocumentUnderstanding(input) {
  const {
    classification,
    resolution,
    candidates,
    relations,
    consistency,
    blocks
  } = input;
  const type = classification.primary;
  const purpose = buildPurpose(type, blocks, resolution.fields);
  const identity = buildIdentity(classification, resolution, blocks);
  const buckets = buildFactBuckets(type, resolution.fields, blocks);
  const derived = buildArithmeticDerived(relations, resolution, blocks);
  if (derived) {
    buckets.financialFacts.push(derived);
    if (!buckets.keyFacts.some((k) => k.kind === derived.kind)) {
      buckets.keyFacts.push(derived);
    }
  }
  const parties = dropUnsupportedFacts(buckets.parties);
  const keyFacts = dropUnsupportedFacts(buckets.keyFacts);
  const financialFacts = dropUnsupportedFacts(buckets.financialFacts);
  const importantDates = dropUnsupportedFacts(buckets.importantDates);
  const explicitNoAction = detectExplicitNoAction(blocks);
  if (explicitNoAction && !keyFacts.some((k) => k.kind === "actionRequired")) {
    keyFacts.push(explicitNoAction);
  }
  const actions = buildActions(
    type,
    resolution.fields,
    candidates,
    relations,
    blocks
  );
  const warnings = buildWarnings(resolution, consistency, relations, blocks);
  const uncertainties = buildUncertainties(resolution, blocks);
  const sections = buildSections(resolution.fields, blocks);
  const safePurpose = purpose.status === "resolved" && purpose.evidence.length === 0 ? { ...purpose, status: "unknown", value: "unknown" } : purpose;
  const finalParties = dropUnsupportedFacts(parties);
  const finalKey = dropUnsupportedFacts(keyFacts);
  const finalFin = dropUnsupportedFacts(financialFacts);
  const finalDates = dropUnsupportedFacts(importantDates);
  const finalActions = actions.filter(
    (a) => a.status === "noExplicitActionDetected" || Boolean(a.description) && a.evidence.length > 0
  );
  const finalWarnings = warnings.filter(
    (w) => w.kind !== "arithmeticContradiction" && w.kind !== "conflictingValues" || w.evidence.length > 0
  );
  const evidenceCoverage = computeEvidenceCoverage({
    purpose: safePurpose,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings
  });
  const structuredSummary = buildStructuredSummary({
    purpose: safePurpose,
    identity,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings,
    uncertainties
  });
  return {
    documentType: classification,
    identity,
    purpose: safePurpose,
    parties: finalParties,
    keyFacts: finalKey,
    financialFacts: finalFin,
    importantDates: finalDates,
    actions: finalActions,
    warnings: finalWarnings,
    uncertainties,
    sections,
    evidenceCoverage,
    structuredSummary
  };
}

// lib/v4/understanding/pipeline.ts
var UnderstandingPipeline = class {
  profiles = new ProfilePipeline();
  runOnText(text) {
    const base = this.profiles.runOnText(text);
    return this.fromProfileResult(base);
  }
  runOnBlocks(blocks) {
    const base = this.profiles.runOnBlocks(blocks);
    return this.fromProfileResult(base);
  }
  fromProfileResult(base) {
    const understanding = buildDocumentUnderstanding({
      classification: base.classification,
      profile: base.profile,
      resolution: base.resolution,
      candidates: base.candidates,
      relations: base.relations,
      consistency: base.consistency,
      blocks: base.blocks
    });
    return {
      ...base,
      understanding,
      invariantErrors: invariantsHold(understanding)
    };
  }
};

// lib/v4/types/documentClassification.ts
var SECONDARY_SECTION_KINDS = [
  "paymentInformation",
  "bankingDetails",
  "paymentSchedule",
  "contactInformation",
  "legalInformation",
  "contractualInformation",
  "taxInformation"
];

// lib/v4/explanation/invariant.ts
function isAffirmativeFact(f) {
  if (f.status === "missing" || f.status === "notApplicable") {
    return false;
  }
  return f.value !== void 0 && f.value !== null;
}
function factSupported(f) {
  if (!isAffirmativeFact(f)) return true;
  if (f.evidence.length > 0) return true;
  return false;
}
function actionSupported(a) {
  if (a.status === "noExplicitActionDetected") return true;
  if (!a.description) return true;
  return a.evidence.length > 0;
}
function warningSupported(w) {
  return w.evidence.length > 0;
}
function countUnsupportedExplanationFacts(explanation) {
  let n = 0;
  const checkFact = (f) => {
    if (!f) return;
    if (!factSupported(f)) n += 1;
  };
  checkFact(explanation.title);
  for (const f of explanation.summaryFacts) checkFact(f);
  for (const f of explanation.importantFacts) checkFact(f);
  for (const f of explanation.deadlines) checkFact(f);
  for (const f of explanation.amounts) checkFact(f);
  for (const a of explanation.actions) {
    if (!actionSupported(a)) n += 1;
    if (a.deadline && !factSupported(a.deadline)) n += 1;
  }
  for (const w of explanation.warnings) {
    if (!warningSupported(w)) n += 1;
  }
  for (const s of explanation.secondaryInformation) {
    if ((s.status === "supported" || s.status === "derived") && s.evidence.length === 0 && s.signals.length === 0) {
      n += 1;
    }
  }
  return n;
}
function explanationInvariantsHold(explanation) {
  const errors = [];
  if (explanation.unsupportedExplanationFacts !== 0) {
    errors.push(
      `unsupportedExplanationFacts=${explanation.unsupportedExplanationFacts}`
    );
  }
  for (const s of explanation.secondaryInformation) {
    if (s.sectionKind === "bankStatement") {
      errors.push("secondaryInformation:bankStatementForbidden");
    }
  }
  return errors;
}

// lib/v4/explanation/mapStatus.ts
function toExplanationStatus(status, derivedFrom = []) {
  if (status === "ambiguous") return "ambiguous";
  if (status === "missing" || status === "notFound") return "missing";
  if (status === "notApplicable") return "notApplicable";
  if (status === "unknown" || status === "noExplicitActionDetected") {
    return "missing";
  }
  const isDerived = derivedFrom.some(
    (d) => d.startsWith("relation:") || d.includes("arithmetic") || d.includes("actionDeadline") || d === "arithmetic:HT+VAT\u2248TTC"
  );
  if (isDerived) return "derived";
  return "supported";
}

// lib/v4/explanation/builder.ts
function itemToFact(item, blocks, fieldOverride) {
  if (item.status === "missing" || item.status === "notApplicable" || item.status === "notFound" || item.status === "unknown" || item.status === "noExplicitActionDetected") {
    return null;
  }
  if (item.value === void 0 || item.value === null) return null;
  const evidence = enrichEvidence(item.evidence, blocks);
  if (!evidence.length) return null;
  const status = toExplanationStatus(item.status, item.derivedFrom);
  return {
    kind: item.kind,
    field: fieldOverride || item.kind,
    value: item.value,
    confidence: item.confidence,
    status,
    evidence,
    derivedFrom: [...item.derivedFrom],
    reasoning: [...item.reasoning]
  };
}
function mapWarning(w, blocks) {
  if (w.kind === "missingExpectedField" || w.kind === "lowConfidence" || w.kind === "unresolvedRelation" || w.kind === "unusualStructure") {
    return null;
  }
  const evidence = enrichEvidence(w.evidence, blocks);
  if (!evidence.length) return null;
  if (w.kind === "arithmeticContradiction") {
    return {
      kind: "arithmeticInconsistency",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "contradictory"
    };
  }
  if (w.kind === "conflictingValues") {
    return {
      kind: "conflictingValues",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "contradictory"
    };
  }
  if (w.kind === "ambiguousField") {
    return {
      kind: "ambiguousField",
      message: w.message,
      relatedFields: w.relatedKinds,
      confidence: w.confidence,
      evidence,
      derivedFrom: [...w.derivedFrom],
      reasoning: [...w.reasoning],
      status: "ambiguous"
    };
  }
  return null;
}
function mapAction(a, blocks) {
  if (a.status === "noExplicitActionDetected") {
    return {
      actionType: "none",
      description: null,
      deadline: null,
      confidence: a.confidence,
      status: "noExplicitActionDetected",
      evidence: [],
      derivedFrom: [...a.derivedFrom],
      reasoning: [...a.reasoning]
    };
  }
  if (!a.description) return null;
  const evidence = enrichEvidence(a.evidence, blocks);
  if (!evidence.length) return null;
  const deadline = a.deadline ? itemToFact(a.deadline, blocks, "actionDeadline") : null;
  return {
    actionType: a.actionType,
    description: a.description,
    deadline,
    confidence: a.confidence,
    status: toExplanationStatus(a.status, a.derivedFrom),
    evidence,
    derivedFrom: [...a.derivedFrom],
    reasoning: [...a.reasoning]
  };
}
function mapSecondary(classification, blocks) {
  const out = [];
  for (const sec of classification.secondarySections || []) {
    const kind = sec.kind;
    if (!SECONDARY_SECTION_KINDS.includes(kind)) {
      continue;
    }
    const evidence = blocks.filter((b) => {
      if (kind === "bankingDetails") {
        return /iban|rib|\bbic\b|coordonn[eé]es\s+bancaires/i.test(b.text);
      }
      if (kind === "paymentInformation") {
        return /sepa|pr[eé]l[eè]vement|mode\s+de\s+paiement|mandat/i.test(
          b.text
        );
      }
      if (kind === "paymentSchedule") {
        return /[eé]ch[eé]ancier|mensualit/i.test(b.text);
      }
      return sec.signals.some(
        (s) => b.text.toLowerCase().includes(s.toLowerCase())
      );
    }).slice(0, 4).map((b) => ({
      text: b.text,
      page: b.page,
      bbox: b.bbox ?? null,
      blockId: b.id,
      lineId: b.lineId ?? null
    }));
    if (!evidence.length && sec.signals.length === 0) continue;
    out.push({
      kind: "secondarySection",
      sectionKind: kind,
      signals: [...sec.signals],
      confidence: sec.confidence,
      status: "supported",
      evidence,
      derivedFrom: [
        `secondarySection:${kind}`,
        ...sec.signals.map((s) => `signal:${s}`)
      ]
    });
  }
  return out;
}
function dedupeFacts2(facts) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const f of facts) {
    const key = `${f.field}|${String(f.value)}|${f.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
function buildDocumentExplanation(input) {
  const { understanding: u, classification, blocks } = input;
  const title = u.identity.title ? itemToFact(u.identity.title, blocks) : null;
  const summaryFacts = dedupeFacts2(
    [
      itemToFact(u.purpose, blocks, "purpose"),
      title,
      u.identity.reference ? itemToFact(u.identity.reference, blocks) : null,
      ...u.parties.map((p) => itemToFact(p, blocks))
    ].filter((f) => Boolean(f))
  );
  const importantFacts = dedupeFacts2(
    u.keyFacts.map((k) => itemToFact(k, blocks)).filter((f) => Boolean(f))
  );
  const amounts = dedupeFacts2(
    u.financialFacts.map((f) => itemToFact(f, blocks)).filter((x) => Boolean(x))
  );
  const deadlines = dedupeFacts2(
    [
      ...u.importantDates.filter(
        (d) => /deadline|dueDate|refundDate|paymentDate|paymentDeadline|actionDeadline|effectiveDate|endDate/i.test(
          d.kind
        )
      ).map((d) => itemToFact(d, blocks)),
      ...u.actions.map((a) => a.deadline ? itemToFact(a.deadline, blocks) : null)
    ].filter((f) => Boolean(f))
  );
  const actions = u.actions.map((a) => mapAction(a, blocks)).filter((a) => Boolean(a));
  const applyAmbiguity = (facts) => facts.map((f) => {
    if (f.status !== "ambiguous") return f;
    const unc = u.uncertainties.find((x) => x.kind === f.field || x.kind === f.kind);
    if (!unc?.candidates?.length) return f;
    const values = [
      ...new Set(unc.candidates.map((c) => JSON.stringify(c.value)))
    ].map((s) => JSON.parse(s));
    if (values.length < 2) return f;
    const evidence = enrichEvidence(
      [...f.evidence, ...unc.candidates.flatMap((c) => c.evidence)],
      blocks
    );
    if (evidence.length < 1) return f;
    return {
      ...f,
      value: values,
      evidence,
      derivedFrom: [.../* @__PURE__ */ new Set([...f.derivedFrom, ...unc.derivedFrom])]
    };
  });
  const importantFactsFinal = applyAmbiguity(importantFacts);
  const deadlinesFinal = applyAmbiguity(deadlines);
  const amountsFinal = applyAmbiguity(amounts);
  for (const unc of u.uncertainties) {
    if (unc.status !== "ambiguous") continue;
    const evidence = enrichEvidence(
      [
        ...unc.evidence,
        ...unc.candidates.flatMap((c) => c.evidence)
      ],
      blocks
    );
    if (!evidence.length) continue;
    const fact = {
      kind: unc.kind,
      field: unc.kind,
      value: unc.candidates.map((c) => c.value),
      confidence: toConfidence(
        Math.max(...unc.candidates.map((c) => c.confidence), 0.4)
      ),
      status: "ambiguous",
      evidence,
      derivedFrom: [...unc.derivedFrom],
      reasoning: [...unc.reasoning]
    };
    if (!importantFactsFinal.some((f) => f.field === fact.field && f.status === "ambiguous")) {
      importantFactsFinal.push(fact);
    }
    if (/date|deadline|period/i.test(fact.field)) {
      if (!deadlinesFinal.some((d) => d.field === fact.field && d.status === "ambiguous")) {
        deadlinesFinal.push(fact);
      }
    }
    if (/amount|balance|salary|tax|ttc|ht|due|vat/i.test(fact.field)) {
      if (!amountsFinal.some((a) => a.field === fact.field && a.status === "ambiguous")) {
        amountsFinal.push(fact);
      }
    }
  }
  const warnings = u.warnings.map((w) => mapWarning(w, blocks)).filter((w) => Boolean(w));
  const secondaryInformation = mapSecondary(classification, blocks);
  const partial = {
    documentType: classification,
    title,
    summaryFacts,
    importantFacts: importantFactsFinal,
    actions,
    deadlines: deadlinesFinal,
    amounts: amountsFinal,
    warnings,
    secondaryInformation,
    evidenceCoverage: u.evidenceCoverage
  };
  const unsupportedExplanationFacts = countUnsupportedExplanationFacts(partial);
  return {
    ...partial,
    unsupportedExplanationFacts
  };
}

// lib/v4/explanation/pipeline.ts
var ExplanationPipeline = class {
  understanding = new UnderstandingPipeline();
  runOnText(text) {
    const base = this.understanding.runOnText(text);
    return this.fromUnderstandingResult(base);
  }
  runOnBlocks(blocks) {
    const base = this.understanding.runOnBlocks(blocks);
    return this.fromUnderstandingResult(base);
  }
  fromUnderstandingResult(base) {
    const explanation = buildDocumentExplanation({
      understanding: base.understanding,
      classification: base.classification,
      blocks: base.blocks
    });
    return {
      ...base,
      explanation,
      explanationInvariantErrors: explanationInvariantsHold(explanation)
    };
  }
};

// lib/v4/presentation/templates.ts
function findFact(facts, ...fields) {
  return facts.find(
    (f) => fields.includes(f.field) && isUsableFactStatus(f.status) && f.value !== void 0 && !Array.isArray(f.value)
  );
}
function findAny(explanation, ...fields) {
  const pool = [
    ...explanation.amounts,
    ...explanation.deadlines,
    ...explanation.importantFacts,
    ...explanation.summaryFacts,
    ...explanation.title ? [explanation.title] : []
  ];
  return findFact(pool, ...fields);
}
function buildIdentityText(explanation) {
  const type = explanation.documentType.primary;
  const label = capitalize(documentTypeLabel(type));
  const sources = [];
  if (type === "invoice") {
    const refund = findAny(explanation, "refundAmount");
    const ttc = findAny(explanation, "amountTTC", "amountDue");
    const date = findAny(explanation, "refundDate") || findAny(explanation, "invoiceDate", "documentDate");
    if (refund) sources.push(refund);
    else if (ttc) sources.push(ttc);
    if (date) sources.push(date);
    const refundMoney = refund ? formatMoneyFR(refund.value) : null;
    const money = ttc ? formatMoneyFR(ttc.value) : null;
    const d = date ? formatDateFR(date.value) : null;
    if (refundMoney && d) {
      return {
        label,
        text: `Facture avec remboursement de ${refundMoney}, pr\xE9vu le ${d}.`,
        sources
      };
    }
    if (refundMoney) {
      return {
        label,
        text: `Facture avec remboursement de ${refundMoney}.`,
        sources
      };
    }
    if (money && d) {
      return {
        label,
        text: `Facture de ${money} TTC, dat\xE9e du ${d}.`,
        sources
      };
    }
    if (money) {
      return { label, text: `Facture de ${money} TTC.`, sources };
    }
    return { label, text: "Il s'agit d'une facture.", sources };
  }
  if (type === "administrativeLetter") {
    return {
      label,
      text: "Il s'agit d'un courrier administratif.",
      sources
    };
  }
  if (type === "contract") {
    const pool = [
      ...explanation.importantFacts,
      ...explanation.summaryFacts,
      ...explanation.deadlines
    ];
    const parties = pool.find(
      (f) => f.field === "parties" && isUsableFactStatus(f.status) && f.value != null
    );
    const date = findAny(explanation, "effectiveDate", "documentDate");
    const title = findAny(explanation, "contractTitle", "subject", "title");
    if (parties) sources.push(parties);
    if (date) sources.push(date);
    if (title) sources.push(title);
    const partyList = Array.isArray(parties?.value) ? parties.value.map(String).join(" et ") : parties ? String(parties.value) : null;
    const d = date ? formatDateFR(date.value) : null;
    if (partyList && d) {
      return {
        label,
        text: `Contrat entre ${partyList}, dat\xE9 du ${d}.`,
        sources
      };
    }
    if (partyList) {
      return { label, text: `Contrat entre ${partyList}.`, sources };
    }
    return { label, text: "Il s'agit d'un contrat.", sources };
  }
  if (type === "bankStatement") {
    const period = findAny(explanation, "statementPeriod", "fiscalPeriod");
    if (period && !Array.isArray(period.value)) {
      sources.push(period);
      return {
        label,
        text: `Relev\xE9 bancaire \u2014 p\xE9riode : ${String(period.value)}.`,
        sources
      };
    }
    return { label, text: "Il s'agit d'un relev\xE9 bancaire.", sources };
  }
  if (type === "taxDocument") {
    return { label, text: "Il s'agit d'un document fiscal.", sources };
  }
  const noun = documentTypeLabel(type);
  const article = /^(attestation|facture|notice)/i.test(noun) ? "d'une" : "d'un";
  return {
    label,
    text: `Il s'agit ${article} ${noun}.`,
    sources
  };
}
function buildReasonText(explanation) {
  const purpose = explanation.summaryFacts.find(
    (f) => f.field === "purpose" && isUsableFactStatus(f.status)
  );
  if (!purpose) return null;
  const map = {
    paymentRequest: "Ce document concerne une demande de paiement.",
    informationRequest: "Ce document vous demande une information ou une pi\xE8ce.",
    certification: "Ce document certifie une information.",
    information: "Ce document vous informe.",
    agreement: "Ce document formalise un accord.",
    accountStatement: "Ce document pr\xE9sente l'\xE9tat d'un compte.",
    taxObligation: "Ce document concerne une obligation fiscale.",
    explanation: "Ce document explique une proc\xE9dure ou une information.",
    formSubmission: "Ce document est un formulaire \xE0 compl\xE9ter."
    // billingNotice : pas de reason — l'identité documentaire suffit
  };
  const key = String(purpose.value);
  if (key === "billingNotice" || key === "unknown") return null;
  const text = map[key];
  if (!text) return null;
  return { text, sources: [purpose] };
}
function buildActionText(description, deadline) {
  const base = description.trim().replace(/\s+/g, " ");
  const d = deadline && isUsableFactStatus(deadline.status) && !Array.isArray(deadline.value) ? formatDateFR(deadline.value) : null;
  if (d) {
    return capitalize(`Merci de ${base.replace(/^merci\s+de\s+/i, "")} avant le ${d}.`);
  }
  return capitalize(base.endsWith(".") ? base : `${base}.`);
}
function buildWarningText(kind, message) {
  if (kind === "arithmeticInconsistency") {
    return "Les montants indiqu\xE9s semblent incoh\xE9rents : le HT et la TVA ne correspondent pas au TTC indiqu\xE9.";
  }
  if (kind === "ambiguousField") {
    return "Certaines informations importantes ne sont pas certaines.";
  }
  return message;
}
function amountLabel(field3) {
  const map = {
    amountHT: "Total HT",
    vatAmount: "TVA",
    vatRate: "Taux de TVA",
    amountTTC: "Total TTC",
    amountDue: "Montant d\xFB",
    refundAmount: "Remboursement",
    amountPaid: "Mensualit\xE9s d\xE9j\xE0 factur\xE9es",
    taxAmount: "Montant fiscal",
    openingBalance: "Solde d'ouverture",
    closingBalance: "Solde de cl\xF4ture",
    transactions: "Op\xE9rations",
    grossSalary: "Salaire brut",
    netSalary: "Salaire net",
    turnover: "Chiffre d'affaires",
    netResult: "R\xE9sultat net",
    arithmeticConsistency: "Coh\xE9rence HT + TVA \u2248 TTC"
  };
  return map[field3] || field3;
}
function dateLabel(field3) {
  const map = {
    invoiceDate: "Date de facture",
    documentDate: "Date du document",
    dueDate: "Date d'\xE9ch\xE9ance",
    refundDate: "Date de remboursement",
    paymentDate: "Date de pr\xE9l\xE8vement",
    paymentDeadline: "Date limite de paiement",
    actionDeadline: "\xC9ch\xE9ance d'action",
    effectiveDate: "Date d'effet",
    endDate: "Date de fin",
    fiscalPeriod: "P\xE9riode fiscale",
    statementPeriod: "P\xE9riode du relev\xE9",
    noticePeriod: "Pr\xE9avis"
  };
  return map[field3] || field3;
}

// lib/v4/presentation/invariant.ts
function itemHasSource(item) {
  return item.sourceFacts.length > 0;
}
function isAffirmative(item) {
  if (item.status === "noExplicitActionDetected") return false;
  if (item.status === "missing" || item.status === "notApplicable") return false;
  return Boolean(item.text && item.text.length > 0);
}
function countUnsupportedPresentationFacts(presentation) {
  let unsupported = 0;
  const check = (item) => {
    if (!item) return;
    if (!isAffirmative(item)) return;
    if (!itemHasSource(item)) {
      unsupported += 1;
      return;
    }
    if (item.evidence.length === 0 && item.status !== "info" && !item.sourceFacts.includes("documentType")) {
      unsupported += 1;
    }
  };
  if (presentation.documentIdentity.text && presentation.documentIdentity.sourceFacts.length === 0) {
    unsupported += 1;
  }
  for (const i of presentation.essential) check(i);
  for (const i of presentation.actions) check(i);
  check(presentation.reason);
  for (const i of presentation.importantDates) check(i);
  for (const i of presentation.importantAmounts) check(i);
  for (const i of presentation.warnings) check(i);
  for (const i of presentation.secondaryInformation) check(i);
  return {
    unsupportedPresentationFacts: unsupported,
    inventedActions: 0,
    // calculé dans builder vs explanation
    inventedDeadlines: 0,
    inventedAmounts: 0,
    inventedReasons: 0
  };
}
function countInventions(presentation, explanation) {
  let inventedActions = 0;
  let inventedDeadlines = 0;
  let inventedAmounts = 0;
  let inventedReasons = 0;
  const explActionDescs = new Set(
    explanation.actions.filter((a) => a.status !== "noExplicitActionDetected" && a.description).map((a) => a.description.toLowerCase())
  );
  for (const a of presentation.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    const ok = a.kind === "userAction" && a.sourceFacts.some((s) => s.startsWith("action:")) && a.evidence.length > 0;
    if (!ok) inventedActions += 1;
  }
  for (const d of presentation.importantDates) {
    const ok = d.sourceFacts.some((s) => {
      const field3 = s.split(":")[0];
      return explanation.deadlines.some((x) => x.field === field3 || x.kind === field3) || explanation.importantFacts.some(
        (x) => (x.field === field3 || x.kind === field3) && /date|deadline|period/i.test(x.field)
      );
    });
    if (!ok) inventedDeadlines += 1;
  }
  for (const m of presentation.importantAmounts) {
    if (!m.sourceFacts.some(
      (s) => explanation.amounts.some((x) => x.field === s || x.kind === s)
    )) {
      inventedAmounts += 1;
    }
  }
  if (presentation.reason) {
    const hasPurpose = explanation.summaryFacts.some(
      (f) => f.field === "purpose" && (f.status === "supported" || f.status === "derived")
    );
    if (!hasPurpose) inventedReasons += 1;
  }
  void explActionDescs;
  return {
    inventedActions,
    inventedDeadlines,
    inventedAmounts,
    inventedReasons
  };
}
function presentationInvariantsHold(presentation) {
  const errors = [];
  if (presentation.unsupportedPresentationFacts !== 0) {
    errors.push(
      `unsupportedPresentationFacts=${presentation.unsupportedPresentationFacts}`
    );
  }
  if (presentation.inventedActions !== 0) {
    errors.push(`inventedActions=${presentation.inventedActions}`);
  }
  if (presentation.inventedDeadlines !== 0) {
    errors.push(`inventedDeadlines=${presentation.inventedDeadlines}`);
  }
  if (presentation.inventedAmounts !== 0) {
    errors.push(`inventedAmounts=${presentation.inventedAmounts}`);
  }
  if (presentation.inventedReasons !== 0) {
    errors.push(`inventedReasons=${presentation.inventedReasons}`);
  }
  for (const s of presentation.secondaryInformation) {
    if (s.kind === "bankStatement" || s.label === "bankStatement") {
      errors.push("secondary:bankStatementForbidden");
    }
  }
  return errors;
}

// lib/v4/presentation/builder.ts
function sourceKey(f) {
  return factKey(f.field, f.kind);
}
function itemFromFact(fact, opts) {
  return {
    kind: opts.kind,
    label: opts.label,
    text: opts.text,
    value: opts.value !== void 0 ? opts.value : fact.value,
    status: opts.status || fact.status,
    tier: opts.tier,
    sourceFacts: [sourceKey(fact)],
    evidence: [...fact.evidence]
  };
}
function buildEssential(explanation) {
  const items = [];
  const identity = buildIdentityText(explanation);
  items.push({
    kind: "documentIdentity",
    label: identity.label,
    text: identity.text,
    status: "info",
    tier: "primary",
    sourceFacts: [
      "documentType",
      ...identity.sources.map(sourceKey)
    ],
    evidence: identity.sources.flatMap((s) => s.evidence)
  });
  const type = explanation.documentType.primary;
  if (type === "invoice") {
    const refund = explanation.amounts.find(
      (x) => x.field === "refundAmount" && isUsableFactStatus(x.status) && !Array.isArray(x.value)
    );
    for (const field3 of [
      "refundAmount",
      "amountDue",
      "amountTTC",
      "amountPaid",
      "refundDate",
      "invoiceDate",
      "dueDate"
    ]) {
      const f = [...explanation.amounts, ...explanation.deadlines].find(
        (x) => x.field === field3 && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (refund && field3 === "amountDue" && Number(f.value) === Number(refund.value)) {
        continue;
      }
      if (field3.startsWith("amount") || field3 === "amountDue" || field3 === "amountTTC" || field3 === "refundAmount" || field3 === "amountPaid") {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        const isPrimary = field3 === "refundAmount" || field3 === "amountDue" || field3 === "amountTTC" && !refund;
        items.push(
          itemFromFact(f, {
            kind: "essentialAmount",
            label: amountLabel(f.field),
            text: field3 === "refundAmount" ? `Remboursement de ${money}.` : `${amountLabel(f.field)} : ${money}.`,
            tier: isPrimary ? "primary" : "important"
          })
        );
      } else {
        const d = formatDateFR(f.value);
        if (!d) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialDate",
            label: dateLabel(f.field),
            text: field3 === "refundDate" ? `Remboursement pr\xE9vu le ${d}.` : `${dateLabel(f.field)} : ${d}.`,
            tier: field3 === "refundDate" ? "primary" : "important"
          })
        );
      }
    }
    const noAction = explanation.importantFacts.find(
      (x) => x.field === "actionRequired" && x.value === false && isUsableFactStatus(x.status)
    );
    if (noAction) {
      items.push({
        kind: "noActionRequired",
        label: "Aucune action",
        text: "Aucune action \xE0 effectuer.",
        value: false,
        status: "info",
        tier: "primary",
        sourceFacts: [sourceKey(noAction)],
        evidence: [...noAction.evidence]
      });
    }
  } else if (type === "administrativeLetter") {
    const acts = explanation.actions.filter(
      (a) => a.status !== "noExplicitActionDetected" && a.description
    );
    for (const a of acts.slice(0, 2)) {
      items.push({
        kind: "essentialAction",
        label: "Action",
        text: buildActionText(a.description, a.deadline),
        status: a.status === "noExplicitActionDetected" ? "info" : a.status,
        tier: "primary",
        sourceFacts: [
          `action:${a.actionType}`,
          ...a.deadline ? [sourceKey(a.deadline)] : []
        ],
        evidence: [
          ...a.evidence,
          ...a.deadline?.evidence || []
        ]
      });
    }
  } else if (type === "contract") {
    for (const field3 of ["parties", "contractTitle", "effectiveDate", "noticePeriod", "duration"]) {
      const f = [...explanation.importantFacts, ...explanation.deadlines, ...explanation.summaryFacts].find(
        (x) => x.field === field3 && (isUsableFactStatus(x.status) || x.status === "ambiguous")
      );
      if (!f || f.status === "ambiguous") continue;
      const textVal = Array.isArray(f.value) ? f.value.map(String).join(", ") : String(f.value);
      items.push(
        itemFromFact(f, {
          kind: "essentialContract",
          label: f.field,
          text: `${f.field} : ${textVal}.`,
          tier: "important"
        })
      );
    }
  } else if (type === "bankStatement") {
    for (const field3 of ["openingBalance", "closingBalance", "transactions"]) {
      const f = explanation.amounts.find(
        (x) => x.field === field3 && isUsableFactStatus(x.status)
      );
      if (!f) continue;
      if (field3 === "transactions" && Array.isArray(f.value)) {
        items.push(
          itemFromFact(f, {
            kind: "essentialTransactions",
            label: "Op\xE9rations",
            text: `${f.value.length} op\xE9ration(s) recens\xE9e(s).`,
            tier: "important",
            value: f.value
          })
        );
      } else {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialBalance",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      }
    }
  } else if (type === "taxDocument") {
    for (const field3 of ["amountDue", "taxAmount", "paymentDeadline", "fiscalPeriod"]) {
      const f = [...explanation.amounts, ...explanation.deadlines, ...explanation.importantFacts].find(
        (x) => x.field === field3 && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (field3.includes("amount") || field3 === "taxAmount" || field3 === "amountDue") {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialTax",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      } else {
        const d = formatDateFR(f.value) || String(f.value);
        items.push(
          itemFromFact(f, {
            kind: "essentialTaxDate",
            label: dateLabel(f.field),
            text: `${dateLabel(f.field)} : ${d}.`,
            tier: "important"
          })
        );
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return items.filter((i) => {
    if (seen.has(i.text)) return false;
    seen.add(i.text);
    return true;
  });
}
function isAutoDebitDescription(desc) {
  const d = desc.toLowerCase();
  const hasUserDirective = /\b(r[eé]glez|effectuez|retournez|transmettez|envoyez|compl[eé]tez|mettez\s+[aà]\s+jour|merci\s+de|veuillez|vous\s+devez)\b/.test(
    d
  );
  if (hasUserDirective) return false;
  return /pr[eé]l[eè]vement\s+automatique|sera\s+pr[eé]lev|pr[eé]lev[eé]\s+automatiquement|mandat\s+sepa\s+actif|paiement\s+par\s+pr[eé]l[eè]vement/.test(
    d
  );
}
function buildPaymentInfoItems(explanation) {
  const out = [];
  const refundFact = explanation.amounts.find(
    (x) => x.field === "refundAmount" && isUsableFactStatus(x.status) && !Array.isArray(x.value)
  );
  const moneyFact = explanation.amounts.find(
    (x) => (x.field === "amountDue" || x.field === "amountTTC") && isUsableFactStatus(x.status) && !Array.isArray(x.value)
  );
  const money = !refundFact && moneyFact ? formatMoneyFR(moneyFact.value) : null;
  const paymentDate = explanation.deadlines.find(
    (d2) => (d2.field === "paymentDate" || d2.kind === "paymentDate") && isUsableFactStatus(d2.status) && !Array.isArray(d2.value)
  );
  const refundDate = explanation.deadlines.find(
    (d2) => (d2.field === "refundDate" || d2.kind === "refundDate") && isUsableFactStatus(d2.status) && !Array.isArray(d2.value)
  );
  const d = paymentDate ? formatDateFR(paymentDate.value) : null;
  const refundDateText = refundDate ? formatDateFR(refundDate.value) : null;
  if (refundFact) {
    const refundMoney = formatMoneyFR(refundFact.value);
    const paySec2 = explanation.secondaryInformation.find(
      (s) => s.sectionKind === "paymentInformation"
    );
    const hasDebitMethod = paySec2?.signals.some((s) => /prelevement|sepa|payment/i.test(s)) || paySec2?.evidence.some(
      (e) => /pr[eé]l[eè]vement|mandat\s+sepa/i.test(e.text)
    ) || explanation.importantFacts.some(
      (f) => /pr[eé]l[eè]vement/i.test(
        f.evidence.map((e) => e.text).join(" ")
      )
    );
    let text = refundMoney ? `Remboursement de ${refundMoney} indiqu\xE9.` : "Un remboursement est indiqu\xE9.";
    if (refundMoney && refundDateText) {
      text = `Remboursement de ${refundMoney} pr\xE9vu le ${refundDateText}.`;
    }
    if (hasDebitMethod) {
      text = `${text} Mode de paiement habituel : pr\xE9l\xE8vement automatique (aucun d\xE9bit sur cette facture).`;
    }
    out.push({
      kind: "paymentInformation",
      label: "Informations de paiement",
      text,
      status: "info",
      tier: "important",
      sourceFacts: [
        sourceKey(refundFact),
        ...refundDate ? [sourceKey(refundDate)] : [],
        ...paySec2 ? ["secondary:paymentInformation"] : []
      ],
      evidence: [
        ...refundFact.evidence,
        ...refundDate?.evidence || [],
        ...paySec2?.evidence || []
      ]
    });
    return out;
  }
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    if (!isAutoDebitDescription(a.description)) continue;
    const actionDate = a.deadline ? formatDateFR(a.deadline.value) : null;
    const dateText = d || actionDate;
    let text = "Un pr\xE9l\xE8vement automatique est indiqu\xE9.";
    if (money && dateText) {
      text = `Un pr\xE9l\xE8vement de ${money} est pr\xE9vu le ${dateText}.`;
    } else if (money) {
      text = `Un pr\xE9l\xE8vement de ${money} est indiqu\xE9.`;
    } else if (dateText) {
      text = `Un pr\xE9l\xE8vement automatique est pr\xE9vu le ${dateText}.`;
    }
    out.push({
      kind: "paymentInformation",
      label: "Informations de paiement",
      text,
      status: "info",
      tier: "important",
      sourceFacts: [
        `action:${a.actionType}`,
        ...moneyFact ? [sourceKey(moneyFact)] : [],
        ...paymentDate ? [sourceKey(paymentDate)] : [],
        ...a.deadline ? [sourceKey(a.deadline)] : []
      ],
      evidence: [
        ...a.evidence,
        ...moneyFact?.evidence || [],
        ...paymentDate?.evidence || [],
        ...a.deadline?.evidence || []
      ]
    });
  }
  const paySec = explanation.secondaryInformation.find(
    (s) => s.sectionKind === "paymentInformation"
  );
  const hasPrelevementSignal = paySec?.signals.some((s) => /prelevement|sepa|payment/i.test(s)) || paySec?.evidence.some(
    (e) => /pr[eé]l[eè]vement|mandat\s+sepa|sera\s+pr[eé]lev/i.test(e.text)
  ) || Boolean(paymentDate);
  if (hasPrelevementSignal && !out.length && explanation.documentType.primary === "invoice" && ((paySec?.evidence?.length || 0) > 0 || (paymentDate?.evidence?.length || 0) > 0)) {
    let text = money ? `Un pr\xE9l\xE8vement automatique de ${money} est indiqu\xE9.` : "Un pr\xE9l\xE8vement automatique est indiqu\xE9.";
    if (money && d) {
      text = `Un pr\xE9l\xE8vement de ${money} est pr\xE9vu le ${d}.`;
    } else if (d) {
      text = `Un pr\xE9l\xE8vement automatique est pr\xE9vu le ${d}.`;
    }
    out.push({
      kind: "paymentInformation",
      label: "Informations de paiement",
      text,
      status: "info",
      tier: "important",
      sourceFacts: [
        ...paySec ? ["secondary:paymentInformation"] : [],
        ...paymentDate ? [sourceKey(paymentDate)] : [],
        ...moneyFact ? [sourceKey(moneyFact)] : []
      ],
      evidence: [
        ...paySec?.evidence || [],
        ...moneyFact?.evidence || [],
        ...paymentDate?.evidence || []
      ]
    });
  }
  return out;
}
function buildActions2(explanation) {
  const out = [];
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    if (isAutoDebitDescription(a.description)) continue;
    out.push({
      kind: "userAction",
      label: "Action demand\xE9e",
      text: buildActionText(a.description, a.deadline),
      value: a.description,
      status: a.status,
      tier: "primary",
      sourceFacts: [
        `action:${a.actionType}`,
        ...a.deadline ? [sourceKey(a.deadline)] : []
      ],
      evidence: [...a.evidence, ...a.deadline?.evidence || []]
    });
  }
  return out;
}
function buildDates(explanation) {
  const out = [];
  for (const d of explanation.deadlines) {
    if (d.status === "ambiguous") {
      const values = Array.isArray(d.value) ? d.value : [d.value];
      const formatted2 = values.map((v) => formatDateFR(v) || String(v)).filter(Boolean);
      out.push({
        kind: "ambiguousDate",
        label: dateLabel(d.field),
        text: `La date \xAB ${dateLabel(d.field)} \xBB n'est pas certaine (${formatted2.join(" ou ")}).`,
        value: values,
        status: "ambiguous",
        tier: "important",
        sourceFacts: [sourceKey(d)],
        evidence: [...d.evidence]
      });
      continue;
    }
    if (!isUsableFactStatus(d.status) || Array.isArray(d.value)) continue;
    const formatted = formatDateFR(d.value);
    if (!formatted) continue;
    out.push(
      itemFromFact(d, {
        kind: "date",
        label: dateLabel(d.field),
        text: `${dateLabel(d.field)} : ${formatted}.`,
        tier: "important"
      })
    );
  }
  for (const f of explanation.importantFacts) {
    if (f.status !== "ambiguous") continue;
    if (!/date|deadline|period/i.test(f.field)) continue;
    if (out.some((o) => o.sourceFacts.includes(sourceKey(f)))) continue;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    const formatted = values.map((v) => formatDateFR(v) || String(v)).filter(Boolean);
    out.push({
      kind: "ambiguousDate",
      label: dateLabel(f.field),
      text: `La date principale n'est pas certaine (${formatted.join(" ou ")}).`,
      value: values,
      status: "ambiguous",
      tier: "important",
      sourceFacts: [sourceKey(f)],
      evidence: [...f.evidence]
    });
  }
  return out;
}
function buildAmounts(explanation) {
  const out = [];
  for (const a of explanation.amounts) {
    if (a.field === "arithmeticConsistency") continue;
    if (a.field === "principalAmount") continue;
    if (a.status === "ambiguous") {
      const values = Array.isArray(a.value) ? a.value : [a.value];
      out.push({
        kind: "ambiguousAmount",
        label: amountLabel(a.field),
        text: `Le montant \xAB ${amountLabel(a.field)} \xBB n'est pas certain.`,
        value: values,
        status: "ambiguous",
        tier: "important",
        sourceFacts: [sourceKey(a)],
        evidence: [...a.evidence]
      });
      continue;
    }
    if (!isUsableFactStatus(a.status)) continue;
    if (a.field === "transactions" && Array.isArray(a.value)) {
      out.push(
        itemFromFact(a, {
          kind: "transactions",
          label: "Op\xE9rations",
          text: `${a.value.length} op\xE9ration(s).`,
          tier: "important",
          value: a.value
        })
      );
      continue;
    }
    if (Array.isArray(a.value)) continue;
    if (a.field === "vatRate") {
      out.push(
        itemFromFact(a, {
          kind: "rate",
          label: amountLabel(a.field),
          text: `${amountLabel(a.field)} : ${a.value} %.`,
          tier: "secondary"
        })
      );
      continue;
    }
    const money = formatMoneyFR(a.value);
    if (!money) continue;
    out.push(
      itemFromFact(a, {
        kind: a.field === "refundAmount" ? "refundAmount" : "amount",
        label: amountLabel(a.field),
        text: a.field === "refundAmount" ? `Remboursement : ${money}.` : `${amountLabel(a.field)} : ${money}.`,
        tier: a.field === "refundAmount" || a.field === "amountDue" || a.field === "amountTTC" ? "primary" : a.field === "amountHT" || a.field === "vatAmount" ? "important" : "secondary"
      })
    );
  }
  return out;
}
function buildWarnings2(explanation) {
  return explanation.warnings.map((w) => ({
    kind: w.kind,
    label: "Alerte",
    text: buildWarningText(w.kind, w.message),
    status: w.status,
    tier: "primary",
    sourceFacts: [`warning:${w.kind}`, ...w.relatedFields],
    evidence: [...w.evidence]
  }));
}
function buildSecondary(explanation) {
  const labels = {
    bankingDetails: "Coordonn\xE9es bancaires",
    paymentInformation: "Informations de paiement",
    paymentSchedule: "\xC9ch\xE9ancier",
    contactInformation: "Coordonn\xE9es",
    legalInformation: "Mentions l\xE9gales",
    contractualInformation: "Informations contractuelles",
    taxInformation: "Informations fiscales"
  };
  const fromSections = explanation.secondaryInformation.filter((s) => s.sectionKind !== "bankStatement").filter((s) => s.evidence.length > 0).map((s) => ({
    kind: s.sectionKind,
    label: labels[s.sectionKind] || s.sectionKind,
    text: `${labels[s.sectionKind] || s.sectionKind} pr\xE9sentes dans le document.`,
    status: s.status,
    tier: "secondary",
    sourceFacts: [`secondary:${s.sectionKind}`, ...s.derivedFrom],
    evidence: [...s.evidence]
  }));
  const paymentInfo = buildPaymentInfoItems(explanation);
  const hasDetailedPayment = paymentInfo.length > 0;
  const filtered = hasDetailedPayment ? fromSections.filter((s) => s.kind !== "paymentInformation") : fromSections;
  return [...paymentInfo, ...filtered];
}
var NOISE_EVIDENCE_RE = /r[eé]seaux?\s+sociaux|facebook|instagram|twitter|linkedin|www\.|http|support|faq|des questions|contactez|service\s+client|t[eé]l\s*:|hotline|capital\s+social|siret|rcs\b|mentions\s+l[eé]gales|cookie/i;
function evidenceFactPriority(fact) {
  if (/^warning:arithmeticInconsistency/.test(fact)) return 100;
  if (/refundAmount|actionRequired|noActionRequired/.test(fact)) return 98;
  if (/^action:/.test(fact)) return 95;
  if (/amountDue|netToPay/.test(fact)) return 92;
  if (/amountTTC/.test(fact)) return 88;
  if (/refundDate|paymentDate|actionDeadline|dueDate|paymentDeadline/.test(fact))
    return 85;
  if (/documentType|invoiceDate|issuer|amountPaid/.test(fact)) return 80;
  if (/secondary:paymentInformation|paymentInformation/.test(fact)) return 70;
  if (/amountHT|vatAmount|vatRate/.test(fact)) return 55;
  if (/warning:/.test(fact)) return 60;
  return 20;
}
function buildEvidencePassages(explanation, presentationItems) {
  const importantFactKeys = /* @__PURE__ */ new Set();
  for (const item of presentationItems) {
    if (item.tier === "secondary" && item.kind !== "paymentInformation") continue;
    if (item.status === "missing") continue;
    for (const s of item.sourceFacts || []) importantFactKeys.add(s);
    for (const s of item.sourceFacts || []) {
      const field3 = s.includes(":") ? s.split(":").slice(1).join(":") : s;
      if (field3) importantFactKeys.add(field3);
    }
  }
  for (const item of [
    ...presentationItems.filter((i) => i.kind === "documentIdentity"),
    ...presentationItems.filter((i) => /amount|date|action|warning|payment/i.test(i.kind))
  ]) {
    for (const s of item.sourceFacts || []) importantFactKeys.add(s);
  }
  const map = /* @__PURE__ */ new Map();
  const absorb = (facts, evidence) => {
    const relevant = facts.filter(
      (f) => importantFactKeys.has(f) || importantFactKeys.has(f.split(":")[0]) || evidenceFactPriority(f) >= 70
    );
    if (!relevant.length) return;
    for (const e of evidence) {
      if (!e.text || e.text.trim().length < 6) continue;
      if (NOISE_EVIDENCE_RE.test(e.text) && evidenceFactPriority(relevant[0]) < 90) {
        continue;
      }
      const key = `${e.page}|${e.blockId || ""}|${e.text}`;
      const baseScore = Math.max(...relevant.map(evidenceFactPriority)) + (NOISE_EVIDENCE_RE.test(e.text) ? -80 : 0) + (/total\s+ttc|rembourser|remboursement|rien\s+[aà]\s+faire|mensualit|montant|facture|pr[eé]l[eè]vement|avant\s+le|r[eé]glez|retournez|arriv[eé]\s+[aà]\s+[eé]ch[eé]ance/i.test(
        e.text
      ) ? 15 : 0) - (/tarif\s+d['’]?utilisation|reseaux?\s+publics|acheminement|represente/i.test(
        e.text
      ) ? 25 : 0) - (e.text.length > 160 ? 10 : 0);
      const existing = map.get(key);
      if (existing) {
        for (const f of relevant) {
          if (!existing.supportedFacts.includes(f)) {
            existing.supportedFacts.push(f);
          }
        }
        existing.score = Math.max(existing.score, baseScore);
      } else {
        map.set(key, {
          page: e.page,
          blockId: e.blockId ?? null,
          excerpt: e.text,
          supportedFacts: [...relevant],
          score: baseScore
        });
      }
    }
  };
  for (const item of presentationItems) {
    if (item.tier === "secondary" && item.kind !== "paymentInformation") continue;
    absorb(item.sourceFacts || [], item.evidence || []);
  }
  for (const w of explanation.warnings) {
    if (w.kind === "arithmeticInconsistency") {
      absorb([`warning:${w.kind}`], w.evidence);
    }
  }
  return [...map.values()].filter((p) => p.supportedFacts.length > 0 && p.score >= 50).sort((a, b) => b.score - a.score).slice(0, 8).map(({ score: _s, ...rest }) => rest);
}
function buildUserPresentation(explanation) {
  const identityBuilt = buildIdentityText(explanation);
  const documentIdentity = {
    documentType: explanation.documentType.primary,
    label: identityBuilt.label,
    text: identityBuilt.text,
    sourceFacts: ["documentType", ...identityBuilt.sources.map(sourceKey)],
    evidence: identityBuilt.sources.flatMap((s) => s.evidence)
  };
  const reasonBuilt = buildReasonText(explanation);
  const reason = reasonBuilt ? {
    kind: "reason",
    label: "Pourquoi ce document",
    text: reasonBuilt.text,
    status: "supported",
    tier: "important",
    sourceFacts: reasonBuilt.sources.map(sourceKey),
    evidence: reasonBuilt.sources.flatMap((s) => s.evidence)
  } : null;
  const actions = buildActions2(explanation);
  const importantDates = buildDates(explanation);
  const importantAmounts = buildAmounts(explanation);
  const warnings = buildWarnings2(explanation);
  const secondaryInformation = buildSecondary(explanation);
  const essential = buildEssential(explanation);
  const noActionFact = explanation.importantFacts.find(
    (x) => x.field === "actionRequired" && x.value === false && isUsableFactStatus(x.status)
  );
  const actionRequired = actions.length ? true : noActionFact ? false : null;
  const evidencePassages = buildEvidencePassages(explanation, [
    {
      kind: "documentIdentity",
      label: documentIdentity.label,
      text: documentIdentity.text,
      status: "info",
      tier: "primary",
      sourceFacts: documentIdentity.sourceFacts,
      evidence: documentIdentity.evidence
    },
    ...essential,
    ...actions,
    ...reason ? [reason] : [],
    ...importantDates,
    ...importantAmounts,
    ...warnings,
    ...secondaryInformation.filter((s) => s.kind === "paymentInformation")
  ]);
  const partial = {
    documentIdentity,
    essential,
    actions,
    actionRequired,
    reason,
    importantDates,
    importantAmounts,
    warnings,
    evidencePassages,
    secondaryInformation
  };
  const counts = countUnsupportedPresentationFacts(partial);
  const draft = {
    ...partial,
    unsupportedPresentationFacts: counts.unsupportedPresentationFacts,
    inventedActions: 0,
    inventedDeadlines: 0,
    inventedAmounts: 0,
    inventedReasons: 0
  };
  const inventions = countInventions(draft, explanation);
  return {
    ...draft,
    ...inventions,
    unsupportedPresentationFacts: counts.unsupportedPresentationFacts
  };
}

// lib/v4/presentation/pipeline.ts
var PresentationPipeline = class {
  explanation = new ExplanationPipeline();
  runOnText(text) {
    const base = this.explanation.runOnText(text);
    return this.fromExplanationResult(base);
  }
  runOnBlocks(blocks) {
    const base = this.explanation.runOnBlocks(blocks);
    return this.fromExplanationResult(base);
  }
  fromExplanationResult(base) {
    const presentation = buildUserPresentation(base.explanation);
    return {
      ...base,
      presentation,
      presentationInvariantErrors: presentationInvariantsHold(presentation)
    };
  }
};

// lib/v4/pipeline/diagnostics.ts
function fieldNames(fields, status) {
  return fields.filter((f) => f.status === status).map((f) => f.field);
}
function buildV4Diagnostics(input) {
  const { classification, resolution, explanation, presentation } = input;
  const contradictions = [
    ...(input.consistency?.contradictions || []).map((c) => c.message),
    ...explanation.warnings.filter((w) => w.status === "contradictory").map((w) => w.message)
  ];
  return {
    primaryDocumentType: classification.primary,
    classificationConfidence: classification.confidence.score,
    classificationStatus: classification.status,
    secondarySections: (classification.secondarySections || []).map((s) => ({
      kind: s.kind,
      confidence: s.confidence,
      signals: [...s.signals]
    })),
    resolvedFields: fieldNames(resolution.fields, "resolved"),
    ambiguousFields: [
      ...fieldNames(resolution.fields, "ambiguous"),
      ...explanation.importantFacts.filter((f) => f.status === "ambiguous").map((f) => f.field),
      ...explanation.deadlines.filter((f) => f.status === "ambiguous").map((f) => f.field),
      ...explanation.amounts.filter((f) => f.status === "ambiguous").map((f) => f.field)
    ].filter((v, i, a) => a.indexOf(v) === i),
    missingRequiredFields: [...resolution.completeness.missingRequired],
    notApplicableFields: fieldNames(resolution.fields, "notApplicable"),
    contradictions,
    evidenceCoverage: {
      totalClaims: explanation.evidenceCoverage.totalClaims,
      unsupported: explanation.evidenceCoverage.unsupported,
      coverage: explanation.evidenceCoverage.coverage
    },
    unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
    unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
    inventedActions: presentation.inventedActions,
    inventedDeadlines: presentation.inventedDeadlines,
    inventedAmounts: presentation.inventedAmounts,
    inventedReasons: presentation.inventedReasons,
    relationTypes: [...new Set(input.relations.map((r) => String(r.type)))],
    presentationActionsCount: presentation.actions.filter(
      (a) => a.kind === "userAction"
    ).length,
    hasArithmeticInconsistency: explanation.warnings.some(
      (w) => w.kind === "arithmeticInconsistency"
    ),
    invariantErrors: [
      ...input.explanationInvariantErrors,
      ...input.presentationInvariantErrors
    ]
  };
}

// lib/v4/pipeline/analyzeDocumentV4.ts
function analyzeDocumentV4(input) {
  const useFiscal = Boolean(input.fiscalKnowledge);
  if (useFiscal) {
    const profilePipe = new ProfilePipeline({ fiscalKnowledge: true });
    const profileResult = input.blocks && input.blocks.length > 0 ? profilePipe.runOnBlocks(input.blocks) : profilePipe.runOnText(input.text || "");
    const understanding = new UnderstandingPipeline().fromProfileResult(
      profileResult
    );
    const explanation = new ExplanationPipeline().fromUnderstandingResult(
      understanding
    );
    const presentation = new PresentationPipeline().fromExplanationResult(
      explanation
    );
    const diagnostics2 = buildV4Diagnostics({
      classification: presentation.classification,
      resolution: presentation.resolution,
      relations: presentation.relations,
      consistency: presentation.consistency,
      understanding: presentation.understanding,
      explanation: presentation.explanation,
      presentation: presentation.presentation,
      explanationInvariantErrors: presentation.explanationInvariantErrors,
      presentationInvariantErrors: presentation.presentationInvariantErrors
    });
    let fiscalKnowledge = profileResult.fiscalKnowledge ?? null;
    if (fiscalKnowledge) {
      const taxExplanation = explainTaxDocument({
        identity: presentation.understanding.identity,
        explanation: presentation.explanation,
        fiscalKnowledge,
        referenceHint: fiscalKnowledge.primaryIdentity?.normalized ?? null
      });
      fiscalKnowledge = {
        ...fiscalKnowledge,
        taxExplanation,
        invariants: {
          ...fiscalKnowledge.invariants,
          knowledgeAsDocumentFact: fiscalKnowledge.invariants.knowledgeAsDocumentFact + taxExplanation.invariants.documentFactsFromKnowledge,
          documentFactsFromKnowledge: taxExplanation.invariants.documentFactsFromKnowledge,
          inventedTaxObligations: taxExplanation.invariants.inventedTaxObligations,
          inventedTaxDates: taxExplanation.invariants.inventedTaxDates,
          inventedTaxAmounts: taxExplanation.invariants.inventedTaxAmounts,
          unsupportedKnowledgeClaims: taxExplanation.invariants.unsupportedKnowledgeClaims,
          knowledgeWithoutProvenance: taxExplanation.knowledgeFacts.filter(
            (kf) => !kf.provenance?.length
          ).length
        }
      };
    }
    return {
      blocks: presentation.blocks,
      candidates: presentation.candidates,
      relations: presentation.relations,
      consistency: presentation.consistency,
      classification: presentation.classification,
      profile: presentation.profile,
      fields: presentation.resolution,
      understanding: presentation.understanding,
      explanation: presentation.explanation,
      presentation: presentation.presentation,
      diagnostics: diagnostics2,
      fiscalKnowledge
    };
  }
  const pipeline = new PresentationPipeline();
  const result = input.blocks && input.blocks.length > 0 ? pipeline.runOnBlocks(input.blocks) : pipeline.runOnText(input.text || "");
  const diagnostics = buildV4Diagnostics({
    classification: result.classification,
    resolution: result.resolution,
    relations: result.relations,
    consistency: result.consistency,
    understanding: result.understanding,
    explanation: result.explanation,
    presentation: result.presentation,
    explanationInvariantErrors: result.explanationInvariantErrors,
    presentationInvariantErrors: result.presentationInvariantErrors
  });
  return {
    blocks: result.blocks,
    candidates: result.candidates,
    relations: result.relations,
    consistency: result.consistency,
    classification: result.classification,
    profile: result.profile,
    fields: result.resolution,
    understanding: result.understanding,
    explanation: result.explanation,
    presentation: result.presentation,
    diagnostics,
    fiscalKnowledge: null
  };
}

// lib/v4/knowledge/fr/tax/case/conflicts.ts
function detectFactConflicts(documents, facts) {
  const conflicts = [];
  const yearsByField = /* @__PURE__ */ new Map();
  for (const f of facts) {
    if (!f.fieldCode || f.year == null) continue;
    const list = yearsByField.get(f.fieldCode) || [];
    list.push(f);
    yearsByField.set(f.fieldCode, list);
  }
  for (const [code, list] of yearsByField) {
    const years = [...new Set(list.map((f) => f.year))];
    if (years.length > 1) {
      conflicts.push({
        conflictId: `conflict-year-${code}-${[...years].sort().join("-")}`,
        kind: "year",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs ann\xE9es diff\xE9rentes ont \xE9t\xE9 trouv\xE9es pour la case ${code} (${years.join(", ")}).`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }
  const amountsByKey = /* @__PURE__ */ new Map();
  for (const f of facts) {
    if (!f.fieldCode) continue;
    if (f.factType !== "fieldValue" && f.factType !== "amount") continue;
    if (f.value == null && f.displayValue == null) continue;
    const key = `${f.fieldCode}|${f.year ?? "?"}|${f.declarantRole ?? "?"}`;
    const list = amountsByKey.get(key) || [];
    list.push(f);
    amountsByKey.set(key, list);
  }
  for (const [key, list] of amountsByKey) {
    const nums = [
      ...new Set(
        list.map((f) => normalizeAmount(f.displayValue ?? f.value)).filter((n) => n != null)
      )
    ];
    if (nums.length > 1) {
      const code = key.split("|")[0];
      conflicts.push({
        conflictId: `conflict-amount-${key.replace(/\|/g, "_")}`,
        kind: "amount",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs informations diff\xE9rentes ont \xE9t\xE9 trouv\xE9es pour ${code} (${nums.join(" / ")}).`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }
  const rolesByCode = /* @__PURE__ */ new Map();
  for (const f of facts) {
    if (!f.fieldCode || !f.declarantRole || f.declarantRole === "household") {
      continue;
    }
    const list = rolesByCode.get(f.fieldCode) || [];
    list.push(f);
    rolesByCode.set(f.fieldCode, list);
  }
  for (const [code, list] of rolesByCode) {
    const roles = [...new Set(list.map((f) => f.declarantRole))];
    if (roles.length > 1) {
      conflicts.push({
        conflictId: `conflict-role-${code}`,
        kind: "role",
        documentIds: uniqueDocIds(list),
        factIds: list.map((f) => f.factId),
        description: `Plusieurs r\xF4les d\xE9clarants diff\xE9rents apparaissent pour ${code}.`,
        evidence: list.flatMap((f) => f.evidence || []).slice(0, 4)
      });
    }
  }
  for (const d of documents) {
    for (const field3 of d.detectedFields) {
      if (field3.presence !== "presentEmpty") continue;
      const others = facts.filter(
        (f) => f.fieldCode === field3.normalizedCode && f.sourceDocumentId !== d.documentId && f.displayValue
      );
      if (!others.length) continue;
      conflicts.push({
        conflictId: `conflict-empty-${field3.normalizedCode}-${d.documentId}`,
        kind: "emptyVsValue",
        documentIds: [d.documentId, ...uniqueDocIds(others)],
        factIds: others.map((o) => o.factId),
        description: `La case ${field3.normalizedCode} est vide dans un document mais une valeur appara\xEEt dans un autre.`,
        evidence: others.flatMap((o) => o.evidence || []).slice(0, 3)
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return conflicts.filter((c) => {
    if (seen.has(c.conflictId)) return false;
    seen.add(c.conflictId);
    return true;
  });
}
function uniqueDocIds(list) {
  return [
    ...new Set(list.map((f) => f.sourceDocumentId || "").filter(Boolean))
  ];
}
function normalizeAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  const n = Number(cleaned.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// lib/v4/knowledge/fr/tax/case/hash.ts
import { createHash } from "node:crypto";
function normalizeDocumentText(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().toLowerCase();
}
function hashDocumentContent(text) {
  return createHash("sha256").update(normalizeDocumentText(text), "utf8").digest("hex");
}
function textSimilarity(a, b) {
  const ta = new Set(normalizeDocumentText(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeDocumentText(b).split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}
function buildCaseId(contentHashes) {
  const sorted = [...contentHashes].sort();
  return `case-${createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 16)}`;
}
function buildDocumentId(contentHash, occurrenceIndex = 0) {
  if (occurrenceIndex <= 0) return `d-${contentHash.slice(0, 14)}`;
  return `d-${contentHash.slice(0, 14)}-x${occurrenceIndex}`;
}

// lib/v4/knowledge/fr/tax/case/duplicates.ts
function assessDuplicates(seeds) {
  const out = /* @__PURE__ */ new Map();
  const byHash = /* @__PURE__ */ new Map();
  for (const s of seeds) {
    const h = hashDocumentContent(s.text);
    const list = byHash.get(h) || [];
    list.push(s.documentId);
    byHash.set(h, list);
  }
  for (const s of seeds) {
    const h = hashDocumentContent(s.text);
    const group = byHash.get(h) || [s.documentId];
    if (group.length > 1) {
      const primary = group[0];
      out.set(s.documentId, {
        contentHash: h,
        duplicateStatus: "possibleDuplicate",
        duplicateOf: s.documentId === primary ? null : primary,
        isPrimaryCopy: s.documentId === primary
      });
      continue;
    }
    let versionOf = null;
    for (const other of seeds) {
      if (other.documentId === s.documentId) continue;
      const oh = hashDocumentContent(other.text);
      if (oh === h) continue;
      const sim = textSimilarity(s.text, other.text);
      const sameRef = s.detectedReference && other.detectedReference && s.detectedReference === other.detectedReference;
      const sharedFields = shareFieldCodes(s, other);
      if (sim >= 0.72 && (sameRef || sharedFields >= 1)) {
        versionOf = s.documentId < other.documentId ? null : other.documentId;
        out.set(s.documentId, {
          contentHash: h,
          duplicateStatus: "possibleVersion",
          duplicateOf: versionOf,
          isPrimaryCopy: true
        });
        break;
      }
    }
    if (!out.has(s.documentId)) {
      out.set(s.documentId, {
        contentHash: h,
        duplicateStatus: "distinct",
        duplicateOf: null,
        isPrimaryCopy: true
      });
    }
  }
  return out;
}
function shareFieldCodes(a, b) {
  const sa = new Set((a.detectedFields || []).map((f) => f.normalizedCode));
  let n = 0;
  for (const f of b.detectedFields || []) {
    if (sa.has(f.normalizedCode)) n += 1;
  }
  return n;
}

// lib/v4/knowledge/fr/tax/case/matchScoring.ts
function scoreFactForRequirement(requirement, fact, options) {
  const contributions = [];
  const rejectReasons = [];
  let documentTypeMatch = 0;
  let yearMatch = 0;
  let roleMatch = 0;
  let factTypeMatch = 0;
  let keywordMatch = 0;
  let fieldEvidenceMatch = 0;
  const matchers = requirement.factMatchers || [];
  const matcher = matchers[0] || { factTypes: [] };
  const docType = (fact.documentType || "").toLowerCase();
  const blob2 = [
    fact.displayValue || "",
    fact.provenanceNote || "",
    fact.sourceDocumentLabel || "",
    String(fact.value ?? "")
  ].join(" ").toLowerCase();
  for (const bad of matcher.rejectDocumentTypes || []) {
    if (docType === bad.toLowerCase() || docType.includes(bad.toLowerCase())) {
      rejectReasons.push(`reject:documentType:${bad}`);
    }
  }
  for (const kw of matcher.rejectKeywords || []) {
    if (blob2.includes(kw.toLowerCase())) {
      rejectReasons.push(`reject:keyword:${kw}`);
    }
  }
  if (/facture|sku|bon de commande|total ttc/.test(blob2) && docType.includes("invoice")) {
    rejectReasons.push("reject:non_fiscal_invoice_context");
  }
  if (options?.targetYear != null && fact.year != null && fact.year !== options.targetYear) {
    rejectReasons.push(`reject:yearMismatch:${fact.year}!=${options.targetYear}`);
  }
  if (options?.expectedRole && fact.declarantRole && options.expectedRole !== "household" && options.expectedRole !== "unknown" && fact.declarantRole !== options.expectedRole && requirement.kind === "amount") {
    rejectReasons.push(
      `reject:roleMismatch:${fact.declarantRole}!=${options.expectedRole}`
    );
  }
  if (requirement.expectedValueType === "amount" && fact.factType === "declarantRole") {
    rejectReasons.push("reject:wrong_value_type");
  }
  if (requirement.kind === "amount" && matcher.fieldCodeHints?.length && fact.fieldCode && !matcher.fieldCodeHints.some(
    (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
  )) {
    if (requirement.blocking) {
      rejectReasons.push(`reject:fieldCodeMismatch:${fact.fieldCode}`);
    }
  }
  if (rejectReasons.length) {
    const breakdown2 = {
      documentTypeMatch: 0,
      yearMatch: 0,
      roleMatch: 0,
      factTypeMatch: 0,
      keywordMatch: 0,
      fieldEvidenceMatch: 0,
      rejectReasons,
      contributions: rejectReasons.map((r) => ({
        key: "reject",
        value: 0,
        note: r
      }))
    };
    return { fact, breakdown: breakdown2, verdict: "rejected" };
  }
  const typeOk = matcher.factTypes.includes(fact.factType) || matcher.factTypes.includes("amount") && fact.factType === "fieldValue" || matcher.factTypes.includes("fieldValue") && fact.factType === "amount" || matcher.factTypes.includes("taxCertificate") && (fact.factType === "documentPresence" || fact.factType === "taxCertificate");
  if (typeOk) {
    factTypeMatch = 1;
    contributions.push({
      key: "factTypeMatch",
      value: 1,
      note: `factType:${fact.factType}`
    });
  }
  if (matcher.documentTypeHints?.length && fact.documentType) {
    if (matcher.documentTypeHints.some(
      (h) => docType === h.toLowerCase() || docType.includes(h.toLowerCase())
    )) {
      documentTypeMatch = 1;
      contributions.push({
        key: "documentTypeMatch",
        value: 1,
        note: `documentType:${fact.documentType}`
      });
    }
  }
  const yr = yearRelationFor(options?.targetYear ?? null, fact.year);
  if (yr === "sameYear") {
    yearMatch = 1;
    contributions.push({ key: "yearMatch", value: 1, note: "sameYear" });
  } else if (yr === "yearUnknown") {
    yearMatch = 0.3;
    contributions.push({ key: "yearMatch", value: 0.3, note: "yearUnknown" });
  } else if (yr === "yearStable") {
    yearMatch = 0.6;
    contributions.push({ key: "yearMatch", value: 0.6, note: "yearStable" });
  }
  if (matcher.declarantRoleHints?.length && fact.declarantRole) {
    if (matcher.declarantRoleHints.includes(fact.declarantRole)) {
      roleMatch = 1;
      contributions.push({
        key: "roleMatch",
        value: 1,
        note: `role:${fact.declarantRole}`
      });
    }
  }
  if (matcher.keywords?.length) {
    const hit = matcher.keywords.some((k) => blob2.includes(k.toLowerCase()));
    if (hit) {
      keywordMatch = 1;
      contributions.push({ key: "keywordMatch", value: 1, note: "keyword_hit" });
    }
  }
  if (matcher.fieldCodeHints?.length && fact.fieldCode && matcher.fieldCodeHints.some(
    (h) => h.toUpperCase() === fact.fieldCode?.toUpperCase()
  )) {
    fieldEvidenceMatch = 1;
    contributions.push({
      key: "fieldEvidenceMatch",
      value: 1,
      note: `field:${fact.fieldCode}`
    });
  }
  const breakdown = {
    documentTypeMatch,
    yearMatch,
    roleMatch,
    factTypeMatch,
    keywordMatch,
    fieldEvidenceMatch,
    rejectReasons: [],
    contributions
  };
  if (requirement.kind === "amount" && fact.value == null && (fact.displayValue == null || String(fact.displayValue).trim() === "")) {
    return {
      fact,
      breakdown: {
        ...breakdown,
        rejectReasons: ["reject:empty_amount"],
        contributions: [
          ...contributions,
          { key: "reject", value: 0, note: "reject:empty_amount" }
        ]
      },
      verdict: "rejected"
    };
  }
  if (fieldEvidenceMatch === 1 && factTypeMatch === 1 && yearMatch >= 0.6) {
    return { fact, breakdown, verdict: "strong" };
  }
  if (requirement.kind === "documentPresence" && (keywordMatch === 1 || documentTypeMatch === 1) && yearMatch >= 0.3) {
    return {
      fact,
      breakdown,
      verdict: yearMatch === 1 ? "strong" : "candidate"
    };
  }
  if (fact.factType === "fiscalYear" && factTypeMatch === 1) {
    return { fact, breakdown, verdict: "strong" };
  }
  if (factTypeMatch !== 1) {
    return {
      fact,
      breakdown: {
        ...breakdown,
        rejectReasons: ["reject:factType_required"],
        contributions: [
          ...contributions,
          { key: "reject", value: 0, note: "reject:factType_required" }
        ]
      },
      verdict: "rejected"
    };
  }
  if (keywordMatch === 1 || documentTypeMatch === 1 || fieldEvidenceMatch === 1) {
    return { fact, breakdown, verdict: "candidate" };
  }
  return { fact, breakdown, verdict: "candidate" };
}
function findCandidateFactsForRequirementInCase(requirement, facts, options) {
  if (!requirement.factMatchers?.length) {
    return {
      matches: [],
      status: "notChecked",
      verdict: "rejected",
      yearRelation: "yearUnknown",
      aggregatedValue: null
    };
  }
  const matches = facts.map((f) => scoreFactForRequirement(requirement, f, options)).filter((m) => m.verdict !== "rejected");
  const yearRelation2 = deriveYearRelation(matches, options?.targetYear);
  if (!matches.length) {
    return {
      matches: [],
      status: "missing",
      verdict: "rejected",
      yearRelation: yearRelation2,
      aggregatedValue: null
    };
  }
  if (requirement.kind === "amount") {
    const valued = matches.filter(
      (m) => m.fact.displayValue != null || typeof m.fact.value === "number" && Number.isFinite(m.fact.value)
    );
    if (!valued.length) {
      return {
        matches,
        status: "missing",
        verdict: "rejected",
        yearRelation: yearRelation2,
        aggregatedValue: null
      };
    }
  }
  const strong = matches.filter((m) => m.verdict === "strong");
  const ambiguous = matches.filter((m) => m.verdict === "ambiguous");
  const amountFacts = matches.filter(
    (m) => (m.fact.factType === "amount" || m.fact.factType === "fieldValue") && m.fact.displayValue != null
  );
  if (requirement.kind === "amount" && amountFacts.length > 1 && strong.length !== 1) {
    const values = new Set(
      amountFacts.map((m) => String(m.fact.displayValue || m.fact.value))
    );
    if (values.size > 1) {
      return {
        matches: matches.map(
          (m) => m.verdict === "strong" ? { ...m, verdict: "ambiguous" } : m
        ),
        status: "ambiguous",
        verdict: "ambiguous",
        yearRelation: yearRelation2,
        aggregatedValue: null
      };
    }
  }
  if (strong.length === 1) {
    return {
      matches: strong,
      status: "found",
      verdict: "strong",
      yearRelation: yearRelation2,
      aggregatedValue: null
    };
  }
  if (strong.length > 1) {
    return {
      matches: strong,
      status: "ambiguous",
      verdict: "ambiguous",
      yearRelation: yearRelation2,
      aggregatedValue: null
    };
  }
  if (ambiguous.length || matches.length > 1) {
    return {
      matches,
      status: "ambiguous",
      verdict: "ambiguous",
      yearRelation: yearRelation2,
      aggregatedValue: null
    };
  }
  return {
    matches,
    status: matches[0].verdict === "candidate" ? "ambiguous" : "found",
    verdict: matches[0].verdict,
    yearRelation: yearRelation2,
    aggregatedValue: null
  };
}
function yearRelationFor(target, factYear) {
  if (target == null || factYear == null) return "yearUnknown";
  if (target === factYear) return "sameYear";
  return "yearMismatch";
}
function deriveYearRelation(matches, targetYear) {
  if (targetYear == null) return "yearUnknown";
  const years = matches.map((m) => m.fact.year).filter((y) => y != null);
  if (!years.length) return "yearUnknown";
  if (years.every((y) => y === targetYear)) return "sameYear";
  if (years.some((y) => y !== targetYear)) return "yearMismatch";
  return "yearUnknown";
}

// lib/v4/knowledge/fr/tax/case/relations.ts
var RELATED_FORMS = {
  "2042": ["2042-RICI", "2042-C", "2044", "2047"],
  "2042-RICI": ["2042", "2042-C"],
  "2044": ["2042"],
  "2047": ["2042"],
  "2042-C": ["2042", "2042-RICI"]
};
function buildDocumentRelations(documents) {
  const relations = [];
  const sorted = [...documents].sort(
    (a, b) => a.documentId.localeCompare(b.documentId)
  );
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      relations.push(...relatePair(a, b));
    }
  }
  return relations.sort((x, y) => x.relationId.localeCompare(y.relationId));
}
function isNonFiscalNoise(d) {
  const blob2 = `${d.detectedType || ""} ${d.recognitionLabel || ""} ${d.fileName || ""}`.toLowerCase();
  return /invoice|facture/.test(blob2);
}
function relatePair(a, b) {
  const out = [];
  if (isNonFiscalNoise(a) || isNonFiscalNoise(b)) {
    return out;
  }
  const yearRel = yearRelation(a.fiscalYear, b.fiscalYear);
  if (a.fiscalYear != null && b.fiscalYear != null && a.fiscalYear === b.fiscalYear) {
    out.push(
      rel(a, b, "sameFiscalYear", 0.85, yearRel, `M\xEAme ann\xE9e fiscale ${a.fiscalYear}`)
    );
  }
  const ra = a.detectedReference;
  const rb = b.detectedReference;
  if (ra && rb && (RELATED_FORMS[ra]?.includes(rb) || RELATED_FORMS[rb]?.includes(ra))) {
    out.push(
      rel(
        a,
        b,
        "relatedTaxForm",
        0.8,
        yearRel,
        `Formulaires potentiellement li\xE9s : ${ra} \u2194 ${rb}`
      )
    );
  }
  const aIsCert = /certificate|attestation|taxCertificate/i.test(
    a.detectedType || a.recognitionLabel || ""
  );
  const bIsCert = /certificate|attestation|taxCertificate/i.test(
    b.detectedType || b.recognitionLabel || ""
  );
  const aIsReturn = /2042|incomeTaxReturn|taxForm/i.test(
    `${a.detectedReference || ""} ${a.detectedType || ""}`
  );
  const bIsReturn = /2042|incomeTaxReturn|taxForm/i.test(
    `${b.detectedReference || ""} ${b.detectedType || ""}`
  );
  if (aIsCert && bIsReturn || bIsCert && aIsReturn) {
    const fieldHint = findSharedFieldHint(a, b) || "7DB";
    out.push(
      rel(
        aIsCert ? a : b,
        aIsCert ? b : a,
        "possibleSupportingDocument",
        yearRel === "yearMismatch" ? 0.35 : 0.7,
        yearRel,
        "Document potentiellement justificatif d\u2019une d\xE9claration \u2014 aucune obligation de report.",
        fieldHint
      )
    );
  }
  for (const field3 of a.detectedFields) {
    if (!field3.normalizedCode) continue;
    const otherHasAmount = b.facts.some(
      (f) => (f.factType === "amount" || f.factType === "taxCertificate") && f.displayValue
    );
    if (otherHasAmount && /7DB|7DR|4BA|1AJ|1BJ/i.test(field3.normalizedCode)) {
      out.push(
        rel(
          b,
          a,
          "possibleFieldEvidence",
          yearRel === "yearMismatch" ? 0.3 : 0.65,
          yearRel,
          `Information potentiellement pertinente pour la case ${field3.normalizedCode}.`,
          field3.normalizedCode
        )
      );
    }
  }
  for (const field3 of b.detectedFields) {
    if (!field3.normalizedCode) continue;
    const otherHasAmount = a.facts.some(
      (f) => (f.factType === "amount" || f.factType === "taxCertificate") && f.displayValue
    );
    if (otherHasAmount && /7DB|7DR|4BA|1AJ|1BJ/i.test(field3.normalizedCode)) {
      out.push(
        rel(
          a,
          b,
          "possibleFieldEvidence",
          yearRel === "yearMismatch" ? 0.3 : 0.65,
          yearRel,
          `Information potentiellement pertinente pour la case ${field3.normalizedCode}.`,
          field3.normalizedCode
        )
      );
    }
  }
  const rolesA = new Set(
    a.facts.map((f) => f.declarantRole).filter(Boolean)
  );
  const rolesB = new Set(
    b.facts.map((f) => f.declarantRole).filter(Boolean)
  );
  for (const role of rolesA) {
    if (role && role !== "unknown" && role !== "household" && rolesB.has(role)) {
      out.push(
        rel(
          a,
          b,
          "sameDeclarant",
          0.6,
          yearRel,
          `M\xEAme r\xF4le fiscal potentiel (${role}) \u2014 pas de fusion automatique des faits.`
        )
      );
      break;
    }
  }
  return out;
}
function yearRelation(a, b) {
  if (a == null || b == null) return "yearUnknown";
  if (a === b) return "sameYear";
  return "yearMismatch";
}
function findSharedFieldHint(a, b) {
  const codes = new Set(a.detectedFields.map((f) => f.normalizedCode));
  for (const f of b.detectedFields) {
    if (codes.has(f.normalizedCode)) return f.normalizedCode;
  }
  return null;
}
function rel(from, to, type, confidence, yearRel, reason, fieldCodeHint) {
  const [fromId, toId] = from.documentId < to.documentId ? [from.documentId, to.documentId] : [to.documentId, from.documentId];
  return {
    relationId: `rel-${type}-${fromId}-${toId}-${fieldCodeHint || "x"}`,
    fromDocumentId: from.documentId,
    toDocumentId: to.documentId,
    relationType: type,
    confidence,
    evidence: [
      {
        page: 1,
        text: `${from.fileName || from.documentId} \u2194 ${to.fileName || to.documentId}`
      }
    ],
    reason,
    fieldCodeHint: fieldCodeHint || null,
    yearRelation: yearRel
  };
}

// lib/v4/knowledge/fr/tax/applicability/evaluateCondition.ts
var evidenceSeq = 0;
function nextEvidenceId(prefix) {
  evidenceSeq += 1;
  return `ae-${prefix}-${evidenceSeq}`;
}
function evaluateCondition(node, ctx) {
  if (node.op === "allOf") {
    return combineAllOf(node.conditions || [], ctx);
  }
  if (node.op === "anyOf") {
    return combineAnyOf(node.conditions || [], ctx);
  }
  if (node.op === "not") {
    const inner = evaluateCondition(node.conditions?.[0] || {}, ctx);
    return {
      result: notResult(inner.result),
      evidence: inner.evidence,
      missingInformation: inner.missingInformation,
      conflicts: inner.conflicts,
      trace: `not(${inner.trace})=${notResult(inner.result)}`
    };
  }
  return evaluatePredicate(node, ctx);
}
function notResult(r) {
  if (r === "true") return "false";
  if (r === "false") return "true";
  return r;
}
function combineAllOf(nodes, ctx) {
  if (!nodes.length) {
    return emptyEval("unknown", "allOf([])");
  }
  const parts = nodes.map((n) => evaluateCondition(n, ctx));
  const results = parts.map((p) => p.result);
  let result = "true";
  if (results.includes("false")) result = "false";
  else if (results.includes("conflicted")) result = "conflicted";
  else if (results.includes("unknown")) result = "unknown";
  return mergeParts(parts, result, `allOf[${results.join(",")}]`);
}
function combineAnyOf(nodes, ctx) {
  if (!nodes.length) {
    return emptyEval("unknown", "anyOf([])");
  }
  const parts = nodes.map((n) => evaluateCondition(n, ctx));
  const results = parts.map((p) => p.result);
  let result = "false";
  if (results.includes("true")) result = "true";
  else if (results.includes("conflicted")) result = "conflicted";
  else if (results.includes("unknown")) result = "unknown";
  return mergeParts(parts, result, `anyOf[${results.join(",")}]`);
}
function mergeParts(parts, result, trace) {
  return {
    result,
    evidence: parts.flatMap((p) => p.evidence),
    missingInformation: parts.flatMap((p) => p.missingInformation),
    conflicts: [...new Set(parts.flatMap((p) => p.conflicts))],
    trace: `${trace}=${result}`
  };
}
function emptyEval(result, trace) {
  return {
    result,
    evidence: [],
    missingInformation: [],
    conflicts: [],
    trace
  };
}
function evaluatePredicate(node, ctx) {
  const pred = node.predicate;
  if (!pred) {
    return emptyEval("unknown", "missing_predicate");
  }
  switch (pred) {
    case "fieldPresent":
      return boolKnown(
        ctx.fieldCodesPresent.includes(
          (node.fieldCode || ctx.fieldCode).toUpperCase()
        ),
        `fieldPresent:${node.fieldCode || ctx.fieldCode}`,
        ctx,
        node,
        "officialKnowledge"
      );
    case "documentTypePresent": {
      const want = (node.documentType || "").toLowerCase();
      const hit = ctx.documentTypes.some(
        (t) => t.toLowerCase() === want || t.toLowerCase().includes(want)
      );
      return boolKnown(
        hit,
        `documentTypePresent:${want}`,
        ctx,
        node,
        "document"
      );
    }
    case "yearIs": {
      const y = node.year;
      if (y == null) return emptyEval("unknown", "yearIs:missing");
      if (!ctx.yearsPresent.length) {
        return withMissing(
          "unknown",
          `yearIs:${y}:absent`,
          ctx,
          node,
          "Ann\xE9e des revenus non d\xE9termin\xE9e."
        );
      }
      if (ctx.yearsPresent.includes(y)) {
        return boolKnown(true, `yearIs:${y}`, ctx, node, "document");
      }
      return boolKnown(false, `yearIs:${y}:mismatch`, ctx, node, "document");
    }
    case "roleIs":
      return evalRole(node, ctx);
    case "regimeIs":
      return evalRegime(node, ctx);
    case "booleanIs":
    case "userFactEquals":
    case "factEquals":
      return evalEquals(node, ctx);
    case "factIn":
      return evalIn(node, ctx);
    case "factExists":
    case "amountPresent":
      return evalExists(node, ctx);
    default:
      return emptyEval("unknown", `unsupported:${pred}`);
  }
}
function evalRole(node, ctx) {
  const want = node.role;
  if (!want) return emptyEval("unknown", "roleIs:missing");
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const docRoles = ctx.facts.filter(
    (f) => f.fieldCode === code && (f.factType === "declarantRole" || f.declarantRole && f.factType !== "amount")
  ).map((f) => f.declarantRole || String(f.value || f.displayValue || ""));
  const userRoles = ctx.userFacts.filter((u) => {
    if (u.active === false) return false;
    if (u.fieldCode !== code && !u.requirementId?.includes("role")) {
      return false;
    }
    if (u.role && u.role !== "unknown") return true;
    if (u.requirementId?.includes("role") && u.normalizedValue != null) {
      return typeof u.normalizedValue === "string";
    }
    return false;
  }).map(
    (u) => u.role && u.role !== "unknown" ? String(u.role) : String(u.normalizedValue)
  );
  const all = [...docRoles, ...userRoles].filter(Boolean);
  if (!all.length) {
    return withMissing(
      "unknown",
      `roleIs:${want}:absent`,
      ctx,
      node,
      `Le r\xF4le d\xE9clarant pour ${code} n\u2019est pas encore connu.`
    );
  }
  const unique = [...new Set(all)];
  if (unique.length > 1 && !unique.every((r) => r === want)) {
    const docHas = docRoles.some((r) => r === want || r !== want);
    const userHas = userRoles.length > 0;
    if (docRoles.length && userRoles.length && docRoles.some((r) => !userRoles.includes(r))) {
      return {
        result: "conflicted",
        evidence: [
          evid("document", `R\xF4les document : ${docRoles.join(", ")}`, ctx),
          evid("user", `R\xF4les utilisateur : ${userRoles.join(", ")}`, ctx)
        ],
        missingInformation: [],
        conflicts: [
          `R\xF4le contradictoire pour ${code} (document vs utilisateur).`
        ],
        trace: `roleIs:${want}:conflicted`
      };
    }
    void docHas;
    void userHas;
  }
  const match = unique.includes(want);
  return boolKnown(match, `roleIs:${want}`, ctx, node, "document");
}
function evalRegime(node, ctx) {
  const want = String(node.value || "").toLowerCase();
  const fromDocs = detectRegimeFromFacts(
    ctx.facts,
    ctx.fieldCode,
    ctx.documentTexts
  );
  const fromUser = detectRegimeFromUser(ctx.userFacts, ctx.fieldCode);
  if (fromDocs && fromUser && fromDocs !== fromUser) {
    return {
      result: "conflicted",
      evidence: [
        evid(
          "document",
          `R\xE9gime d\u2019apr\xE8s document : ${fromDocs}`,
          ctx
        ),
        evid("user", `R\xE9gime d\u2019apr\xE8s votre r\xE9ponse : ${fromUser}`, ctx)
      ],
      missingInformation: [],
      conflicts: [
        "Les informations se contredisent sur le r\xE9gime d\u2019imposition des revenus fonciers (document vs r\xE9ponse utilisateur)."
      ],
      trace: `regimeIs:${want}:conflicted`
    };
  }
  const regime = fromDocs || fromUser;
  if (!regime) {
    return withMissing(
      "unknown",
      `regimeIs:${want}:absent`,
      ctx,
      node,
      "Le r\xE9gime d\u2019imposition des revenus fonciers (micro-foncier ou r\xE9el) n\u2019est pas encore connu."
    );
  }
  return boolKnown(
    regime === want,
    `regimeIs:${want}:${regime}`,
    ctx,
    node,
    fromDocs ? "document" : "user"
  );
}
function detectRegimeFromFacts(facts, fieldCode, documentTexts = []) {
  const blob2 = [
    ...facts.filter(
      (f) => !f.fieldCode || f.fieldCode.startsWith("4B") || f.fieldCode === fieldCode || /foncier|2044|régime/i.test(f.provenanceNote || "")
    ).map(
      (f) => [f.displayValue, f.provenanceNote, f.value, f.documentType].filter(Boolean).join(" ")
    ),
    ...documentTexts
  ].join(" ").toLowerCase();
  if (/micro[-\s]?foncier|r[eé]gime\s+micro/.test(blob2)) return "micro";
  if (/r[eé]gime\s+r[eé]el/.test(blob2)) return "reel";
  return null;
}
function detectRegimeFromUser(userFacts, fieldCode) {
  for (const u of userFacts) {
    if (u.active === false) continue;
    if (u.fieldCode && u.fieldCode !== fieldCode && !u.fieldCode.startsWith("4B")) {
      continue;
    }
    const raw = String(u.normalizedValue ?? u.answer ?? u.rawAnswer ?? "").toLowerCase().trim();
    if (/^micro|micro[-\s]?foncier/.test(raw)) return "micro";
    if (/^r[eé]el|regime\s*reel|régime\s*réel/.test(raw)) return "reel";
    if (u.requirementId?.includes("regime") || u.requirementId?.includes("2044")) {
      if (raw === "true" || raw === "oui") return "reel";
      if (raw === "false" || raw === "non") return "micro";
    }
  }
  return null;
}
function evalEquals(node, ctx) {
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const want = node.value;
  const docVals = ctx.facts.filter((f) => f.fieldCode === code && f.displayValue != null).map((f) => normalizeComparable(f.displayValue ?? f.value));
  const userVals = node.allowUserFact !== false ? ctx.userFacts.filter(
    (u) => u.active !== false && u.fieldCode === code && (u.normalizedValue != null || u.answer)
  ).map((u) => normalizeComparable(u.normalizedValue ?? u.answer)) : [];
  if (!docVals.length && !userVals.length) {
    return withMissing(
      "unknown",
      `equals:${code}:absent`,
      ctx,
      node,
      `Information manquante pour ${code}.`
    );
  }
  if (docVals.length && userVals.length && docVals.some((d) => userVals.every((u) => u !== d))) {
    return {
      result: "conflicted",
      evidence: [
        evid("document", `Document : ${docVals.join(", ")}`, ctx),
        evid("user", `Vous : ${userVals.join(", ")}`, ctx)
      ],
      missingInformation: [],
      conflicts: [`Valeurs contradictoires pour ${code}.`],
      trace: `equals:${code}:conflicted`
    };
  }
  const have = [...docVals, ...userVals];
  const ok = have.some((v) => v === normalizeComparable(want));
  return boolKnown(
    ok,
    `equals:${code}`,
    ctx,
    node,
    docVals.length ? "document" : "user"
  );
}
function evalIn(node, ctx) {
  const values = node.values || [];
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const docVals = ctx.facts.filter((f) => f.fieldCode === code && f.displayValue != null).map((f) => normalizeComparable(f.displayValue ?? f.value));
  if (!docVals.length) {
    return withMissing(
      "unknown",
      `in:${code}:absent`,
      ctx,
      node,
      `Information manquante pour ${code}.`
    );
  }
  const ok = docVals.some(
    (v) => values.map(normalizeComparable).includes(v)
  );
  return boolKnown(ok, `in:${code}`, ctx, node, "document");
}
function evalExists(node, ctx) {
  const code = (node.fieldCode || ctx.fieldCode).toUpperCase();
  const amountOnly = node.predicate === "amountPresent";
  const docs = ctx.facts.filter((f) => {
    if (f.fieldCode !== code) return false;
    if (amountOnly) {
      if (f.factType === "declarantRole" || f.factType === "fiscalYear") {
        return false;
      }
      if (typeof f.value === "number" && Number.isFinite(f.value)) return true;
      if (f.displayValue != null && /\d/.test(String(f.displayValue))) {
        return true;
      }
      return false;
    }
    return true;
  });
  const users = node.allowUserFact !== false ? ctx.userFacts.filter((u) => {
    if (u.active === false || u.fieldCode !== code) return false;
    if (u.answerStatus !== "accepted") return false;
    if (amountOnly) {
      return typeof u.normalizedValue === "number" || typeof u.normalizedValue === "string" && /\d/.test(u.normalizedValue);
    }
    return u.normalizedValue != null;
  }) : [];
  if (!docs.length && !users.length) {
    return withMissing(
      "unknown",
      `exists:${code}:absent`,
      ctx,
      node,
      amountOnly ? `Montant non retrouv\xE9 pour ${code}.` : `Aucun \xE9l\xE9ment trouv\xE9 concernant ${code}.`
    );
  }
  return boolKnown(
    true,
    `exists:${code}`,
    ctx,
    node,
    docs.length ? "document" : "user"
  );
}
function boolKnown(value, trace, ctx, _node, kind) {
  return {
    result: value ? "true" : "false",
    evidence: [
      evid(kind, `${trace} \u2192 ${value ? "vrai" : "faux"}`, ctx)
    ],
    missingInformation: [],
    conflicts: [],
    trace: `${trace}=${value ? "true" : "false"}`
  };
}
function withMissing(result, trace, ctx, node, reason) {
  const missing = [];
  if (node.missingInformationId && node.missingQuestion) {
    missing.push({
      id: node.missingInformationId,
      fieldCode: node.fieldCode || ctx.fieldCode,
      question: node.missingQuestion,
      expectedAnswerType: node.expectedAnswerType || "text",
      reason,
      ruleId: ctx.ruleId
    });
  }
  return {
    result,
    evidence: [],
    missingInformation: missing,
    conflicts: [],
    trace
  };
}
function evid(kind, detail, ctx) {
  return {
    evidenceId: nextEvidenceId(kind),
    sourceKind: kind,
    label: kind === "document" ? "Information trouv\xE9e dans le document" : kind === "user" ? "Information fournie par vous" : "Connaissance officielle",
    detail,
    ruleId: ctx.ruleId
  };
}
function normalizeComparable(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// lib/v4/knowledge/fr/tax/applicability/rules.ts
var RETRIEVED5 = "2026-08-08";
var YEARS = [2024, 2025, 2026];
function src4(url, title, supports = ["applicability"]) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED5,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
var SRC_2042_NOTICE3 = src4(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice \u2014 Remplir la d\xE9claration de revenus 2024 (formulaire 2042)"
);
var SRC_SALAIRES = src4(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/06-traitements_salaires_85a114.pdf",
  "Brochure IR \u2014 Traitements et salaires"
);
var SRC_FONCIERS_AIDE3 = src4(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR \u2014 revenus fonciers (cases 4BA \xE0 4EA)"
);
var SRC_FONCIERS_BROCHURE3 = src4(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR \u2014 Revenus fonciers"
);
var SRC_20442 = src4(
  "https://www.impots.gouv.fr/formulaire/2044/declaration-des-revenus-fonciers",
  "Formulaire n\xB02044 \u2014 D\xE9claration des revenus fonciers"
);
var TAX_APPLICABILITY_RULES = [
  {
    ruleId: "1aj-declarant1-scope",
    fieldCode: "1AJ",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: "declarant1",
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_SALAIRES],
    sourceExcerpt: "La case 1AJ concerne les traitements et salaires du d\xE9clarant 1 selon la notice 2042 / brochure salaires.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      op: "allOf",
      conditions: [
        {
          predicate: "roleIs",
          role: "declarant1",
          fieldCode: "1AJ",
          allowUserFact: true,
          missingInformationId: "1aj-role",
          missingQuestion: "Ce montant de traitements et salaires concerne-t-il le d\xE9clarant 1 ?",
          expectedAnswerType: "declarant"
        },
        {
          predicate: "amountPresent",
          fieldCode: "1AJ",
          allowUserFact: true,
          missingInformationId: "1aj-amount",
          missingQuestion: "Disposez-vous du montant des traitements et salaires du d\xE9clarant 1 ?",
          expectedAnswerType: "amount"
        }
      ]
    }
  },
  {
    ruleId: "1bj-declarant2-scope",
    fieldCode: "1BJ",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: "declarant2",
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_SALAIRES],
    sourceExcerpt: "La case 1BJ concerne les traitements et salaires du d\xE9clarant 2 selon la notice 2042 / brochure salaires.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      op: "allOf",
      conditions: [
        {
          predicate: "roleIs",
          role: "declarant2",
          fieldCode: "1BJ",
          allowUserFact: true,
          missingInformationId: "1bj-role",
          missingQuestion: "Ce montant de traitements et salaires concerne-t-il le d\xE9clarant 2 ?",
          expectedAnswerType: "declarant"
        },
        {
          predicate: "amountPresent",
          fieldCode: "1BJ",
          allowUserFact: true,
          missingInformationId: "1bj-amount",
          missingQuestion: "Disposez-vous du montant des traitements et salaires du d\xE9clarant 2 ?",
          expectedAnswerType: "amount"
        }
      ]
    }
  },
  {
    ruleId: "4be-micro-foncier-scope",
    fieldCode: "4BE",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_FONCIERS_AIDE3, SRC_FONCIERS_BROCHURE3],
    sourceExcerpt: "Le r\xE9gime micro-foncier (case 4BE) s\u2019applique si les recettes brutes n\u2019exc\xE8dent pas 15 000 \u20AC et sous r\xE9serve des exclusions ; l\u2019abattement de 30 % est ensuite appliqu\xE9 automatiquement pour d\xE9terminer le revenu imposable.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      op: "allOf",
      conditions: [
        {
          predicate: "regimeIs",
          value: "micro",
          fieldCode: "4BE",
          allowUserFact: true,
          missingInformationId: "4be-regime",
          missingQuestion: "Vos revenus fonciers rel\xE8vent-ils du r\xE9gime micro-foncier (et non du r\xE9gime r\xE9el) ?",
          expectedAnswerType: "choice"
        },
        {
          predicate: "amountPresent",
          fieldCode: "4BE",
          allowUserFact: true,
          missingInformationId: "4be-amount",
          missingQuestion: "Disposez-vous du montant des recettes brutes de locations non meubl\xE9es (case 4BE) ?",
          expectedAnswerType: "amount"
        }
      ]
    }
  },
  {
    ruleId: "4ba-regime-reel",
    fieldCode: "4BA",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_FONCIERS_AIDE3, SRC_FONCIERS_BROCHURE3, SRC_20442],
    sourceExcerpt: "La case 4BA sert au report du revenu net foncier d\xE9termin\xE9 selon le r\xE9gime r\xE9el ; le r\xE9gime (micro/r\xE9el) conditionne cette rubrique.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BA",
      allowUserFact: true,
      missingInformationId: "4ba-regime",
      missingQuestion: "Vos revenus fonciers rel\xE8vent-ils du r\xE9gime r\xE9el (et non du micro-foncier) ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "4bb-regime-reel",
    fieldCode: "4BB",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_FONCIERS_AIDE3],
    sourceExcerpt: "Les cases de d\xE9ficit foncier (dont 4BB) s\u2019inscrivent dans le cadre du r\xE9gime r\xE9el et des r\xE8gles d\u2019imputation de la notice ; aucune conclusion chiffr\xE9e d\u2019avantage fiscal n\u2019est tir\xE9e ici.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BB",
      allowUserFact: true,
      missingInformationId: "4bb-regime",
      missingQuestion: "Vos revenus fonciers rel\xE8vent-ils du r\xE9gime r\xE9el ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "4bc-regime-reel",
    fieldCode: "4BC",
    documentRef: "2042",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3, SRC_FONCIERS_AIDE3],
    sourceExcerpt: "La case 4BC concerne un d\xE9ficit pouvant s\u2019imputer sur le revenu global dans les conditions du r\xE9gime r\xE9el ; les seuils d\u2019imputation ne sont pas mod\xE9lis\xE9s ici.",
    effectWhenTrue: "applicable",
    effectWhenFalse: "notApplicable",
    conditions: {
      predicate: "regimeIs",
      value: "reel",
      fieldCode: "4BC",
      allowUserFact: true,
      missingInformationId: "4bc-regime",
      missingQuestion: "Vos revenus fonciers rel\xE8vent-ils du r\xE9gime r\xE9el ?",
      expectedAnswerType: "choice"
    }
  },
  {
    ruleId: "7db-no-aids-only-unknown",
    fieldCode: "7DB",
    documentRef: "2042-RICI",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3],
    sourceExcerpt: "La notice d\xE9crit des conditions relatives au cr\xE9dit d\u2019imp\xF4t pour l\u2019emploi \xE0 domicile ; la seule pr\xE9sence d\u2019un justificatif ne permet pas de conclure \xE0 l\u2019applicabilit\xE9.",
    // Cette règle ne produit JAMAIS applicable/notApplicable forte seule :
    // conditions volontairement « always unknown » via prédicat sans fait.
    effectWhenTrue: "applicable",
    effectWhenFalse: "unknown",
    conditions: {
      // Prédicat qui reste unknown sans inventer notApplicable
      predicate: "factExists",
      fieldCode: "7DB__applicability_gate_never_auto",
      allowUserFact: false,
      missingInformationId: "7db-situation",
      missingQuestion: "Disposez-vous d\u2019\xE9l\xE9ments sur des d\xE9penses d\u2019emploi \xE0 domicile pour l\u2019ann\xE9e concern\xE9e ?",
      expectedAnswerType: "yesNo"
    }
  },
  {
    ruleId: "7dr-aids-scope",
    fieldCode: "7DR",
    documentRef: "2042-RICI",
    taxYears: YEARS,
    yearPolicy: "verifiedStable",
    requiredRole: null,
    absenceIsUnknown: true,
    verificationStatus: "verified",
    provenance: [SRC_2042_NOTICE3],
    sourceExcerpt: "La case 7DR concerne les aides per\xE7ues pour financer les d\xE9penses d\u2019emploi \xE0 domicile, \xE0 indiquer s\xE9par\xE9ment des d\xE9penses (7DB).",
    effectWhenTrue: "applicable",
    effectWhenFalse: "needsInformation",
    conditions: {
      predicate: "amountPresent",
      fieldCode: "7DR",
      allowUserFact: true,
      missingInformationId: "7dr-amount",
      missingQuestion: "Avez-vous per\xE7u des aides pour financer l\u2019emploi \xE0 domicile (souvent case 7DR) ?",
      expectedAnswerType: "yesNo"
    }
  }
];
function getApplicabilityRulesForField(fieldCode) {
  const code = fieldCode.toUpperCase();
  return TAX_APPLICABILITY_RULES.filter((r) => r.fieldCode === code);
}

// lib/v4/knowledge/fr/tax/applicability/explainApplicability.ts
var HEADLINES = {
  applicable: "Les conditions mod\xE9lis\xE9es pour cette case sont satisfaites selon les informations disponibles.",
  notApplicable: "Non applicable selon les informations disponibles et la r\xE8gle officielle mod\xE9lis\xE9e.",
  needsInformation: "Information n\xE9cessaire \u2014 je ne peux pas encore d\xE9terminer si cette case est pertinente.",
  conflicted: "Informations contradictoires \u2014 conclusion d\u2019applicabilit\xE9 impossible.",
  unknown: "Impossible \xE0 d\xE9terminer \u2014 les sources mod\xE9lis\xE9es ne suffisent pas pour votre situation."
};
function explainTaxApplicability(input) {
  const { status, rule, cond: cond2, reasons } = input;
  const why = [...reasons];
  if (status === "applicable") {
    why.push(
      "Les informations disponibles correspondent aux conditions mod\xE9lis\xE9es pour cette case."
    );
  }
  if (status === "needsInformation") {
    for (const m of cond2.missingInformation) {
      why.push(`Information manquante : ${m.reason}`);
    }
  }
  if (status === "conflicted") {
    why.push("Les informations disponibles se contredisent sur un \xE9l\xE9ment d\xE9terminant.");
  }
  if (status === "unknown") {
    why.push(
      "Les sources actuellement mod\xE9lis\xE9es d\xE9crivent cette case, mais ne suffisent pas \xE0 d\xE9terminer son applicabilit\xE9 \xE0 votre situation."
    );
  }
  const limits = [
    "Cette \xE9valuation ne signifie pas une obligation de d\xE9clarer un montant.",
    "Cette \xE9valuation ne constitue pas une d\xE9cision d\u2019acc\xE8s \xE0 un avantage fiscal."
  ];
  if (rule?.sourceExcerpt) {
    limits.push(`P\xE9rim\xE8tre de la r\xE8gle : ${rule.sourceExcerpt}`);
  }
  return {
    status,
    headline: HEADLINES[status],
    why: [...new Set(why)],
    conditionsSatisfied: cond2.result === "true" ? [cond2.trace] : [],
    conditionsNotSatisfied: cond2.result === "false" ? [cond2.trace] : [],
    missingInformation: cond2.missingInformation.map((m) => m.question),
    conflicts: cond2.conflicts,
    provenance: (rule?.provenance || []).filter((p) => p.url).map((p) => ({ title: p.title || "Source officielle", url: p.url })),
    limits
  };
}
function applicabilityStatusLabel(status) {
  switch (status) {
    case "applicable":
      return "Conditions satisfaites";
    case "notApplicable":
      return "Non applicable selon les informations disponibles";
    case "needsInformation":
      return "Information n\xE9cessaire";
    case "conflicted":
      return "Informations contradictoires";
    case "unknown":
    default:
      return "Impossible \xE0 d\xE9terminer";
  }
}

// lib/v4/knowledge/fr/tax/applicability/bridgeClarification.ts
function buildClarificationCandidatesFromApplicability(evaluation, session, invariants) {
  const out = [];
  for (const miss of evaluation.missingInformation) {
    if (session) {
      const blocked = findBlockingQuestion(miss.id, miss.fieldCode, session);
      if (blocked) {
        if (blocked.status === "asked" && blocked.askedCount >= blocked.maxAskedCount) {
        }
        void invariants;
        continue;
      }
    }
    out.push({
      requirementId: miss.id,
      question: miss.question,
      expectedAnswerType: miss.expectedAnswerType,
      reason: miss.reason
    });
  }
  return out.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}
function findBlockingQuestion(missingId, fieldCode, session) {
  return session.questions.find((q) => {
    const idHit = q.requirementId === missingId || q.requirementId.endsWith(missingId) || missingId.endsWith(q.requirementId);
    const fieldHit = q.fieldCode === fieldCode && idHit;
    if (!idHit && !fieldHit) return false;
    return q.status === "unknown" || q.status === "refused" || q.status === "answered" || q.status === "resolved" || q.status === "notApplicable" || q.status === "superseded" || q.askedCount >= q.maxAskedCount;
  });
}
function mergeApplicabilityQuestionsIntoSession(session, evaluations, invariants) {
  const existing = new Set(session.questions.map((q) => q.requirementId));
  const additions = [];
  for (const ev of evaluations) {
    for (const c of ev.clarificationQuestionCandidates) {
      if (existing.has(c.requirementId)) continue;
      if (findBlockingQuestion(c.requirementId, ev.fieldCode, session)) {
        if (invariants) {
        }
        continue;
      }
      const prior = session.questions.find(
        (q) => q.requirementId === c.requirementId
      );
      if (prior && prior.askedCount > 0 && invariants) {
        invariants.applicabilityClarificationLoop += 1;
        continue;
      }
      additions.push({
        questionId: `cq-app-${c.requirementId}`,
        caseId: session.caseId,
        requirementId: c.requirementId,
        fieldCode: ev.fieldCode,
        documentRef: null,
        declarantRole: ev.role,
        question: c.question,
        expectedAnswerType: c.expectedAnswerType,
        reason: c.reason,
        priority: "blocking",
        provenance: ev.sources.map((s) => ({
          sourceType: "official",
          authority: "DGFiP",
          url: s.url,
          retrievedAt: "2026-08-08",
          title: s.title,
          supports: ["applicability"]
        })),
        evidenceRefs: [],
        status: "unasked",
        askedCount: 0,
        firstAskedSequence: null,
        lastAskedSequence: null,
        priorityScore: 0,
        priorityReasons: ["from_applicability"],
        choices: c.expectedAnswerType === "choice" ? ["r\xE9gime r\xE9el", "micro-foncier"] : c.expectedAnswerType === "declarant" ? ["d\xE9clarant 1", "d\xE9clarant 2", "foyer"] : c.expectedAnswerType === "yesNo" || c.expectedAnswerType === "boolean" ? ["oui", "non"] : void 0,
        dependsOnQuestionId: null,
        maxAskedCount: 2
      });
      existing.add(c.requirementId);
    }
  }
  if (!additions.length) return session;
  return {
    ...session,
    questions: [...session.questions, ...additions].sort(
      (a, b) => a.requirementId.localeCompare(b.requirementId) || (a.fieldCode || "").localeCompare(b.fieldCode || "")
    )
  };
}

// lib/v4/knowledge/fr/tax/applicability/evaluateApplicability.ts
function emptyApplicabilityInvariants() {
  return {
    knowledgePromotedToUserFact: 0,
    knowledgePromotedToDocumentFact: 0,
    documentFactPromotedToApplicabilityWithoutRule: 0,
    userFactPromotedToApplicabilityWithoutRule: 0,
    absencePromotedToNegative: 0,
    unsupportedApplicable: 0,
    unsupportedNotApplicable: 0,
    unsupportedEligibilityDecision: 0,
    supportingDocumentPromotedToEligibility: 0,
    crossYearApplicabilityPromotion: 0,
    crossRoleApplicabilityPromotion: 0,
    conflictAutoResolved: 0,
    unknownPromotedToKnown: 0,
    refusedPromotedToNegative: 0,
    automaticUnsafeAggregation: 0,
    applicabilityClarificationLoop: 0,
    uploadOrderChangesApplicability: 0,
    missingApplicabilityProvenance: 0
  };
}
function evaluateTaxFieldApplicability(input) {
  const invariants = emptyApplicabilityInvariants();
  const fieldCode = input.fieldCode.toUpperCase();
  const rules = getApplicabilityRulesForField(fieldCode);
  if (!rules.length) {
    return {
      invariants,
      evaluation: baseUnknown(
        fieldCode,
        "Les sources actuellement mod\xE9lis\xE9es d\xE9crivent cette case, mais ne suffisent pas \xE0 d\xE9terminer son applicabilit\xE9 \xE0 votre situation.",
        [
          "Aucune r\xE8gle d\u2019applicabilit\xE9 v\xE9rifi\xE9e n\u2019est mod\xE9lis\xE9e pour cette case."
        ]
      )
    };
  }
  const evaluations = rules.map(
    (rule) => evaluateOneRule(rule, input, invariants)
  );
  const merged = mergeFieldEvaluations(fieldCode, evaluations, invariants);
  merged.clarificationQuestionCandidates = buildClarificationCandidatesFromApplicability(
    merged,
    input.clarificationSession || null,
    invariants
  );
  return { evaluation: merged, invariants };
}
function evaluateDocumentCaseApplicability(docCase) {
  const codes = [
    .../* @__PURE__ */ new Set([
      ...docCase.taxContext.fieldCodesPresent,
      ...docCase.fieldAssistance.map((a) => a.fieldCode)
    ])
  ].sort();
  const invariants = emptyApplicabilityInvariants();
  const evaluations = [];
  for (const code of codes) {
    const { evaluation, invariants: inv } = evaluateTaxFieldApplicability({
      fieldCode: code,
      facts: docCase.factIndex,
      userFacts: docCase.userAnswers,
      conflicts: docCase.conflicts,
      documents: docCase.documents,
      documentTexts: docCase.documents.map((d) => d.text || ""),
      fieldCodesPresent: docCase.taxContext.fieldCodesPresent,
      yearsPresent: docCase.taxContext.yearsPresent,
      targetYear: docCase.taxContext.yearsPresent.length === 1 ? docCase.taxContext.yearsPresent[0] : null,
      clarificationSession: docCase.clarificationSession || null
    });
    evaluations.push(evaluation);
    mergeInv(invariants, inv);
  }
  for (const ev of evaluations) {
    if (ev.fieldCode === "7DB" && ev.status === "applicable") {
      const onlySupport = ev.evidence.every(
        (e) => /attestation|justificatif|supporting/i.test(e.detail) || e.sourceKind === "officialKnowledge"
      );
      if (onlySupport || !ev.ruleId) {
        invariants.supportingDocumentPromotedToEligibility += 1;
        ev.status = "unknown";
        ev.headline = "Impossible \xE0 d\xE9terminer \u2014 un justificatif seul ne suffit pas \xE0 conclure.";
        ev.limits.push(
          "La pr\xE9sence d\u2019un document support ne suffit pas \xE0 conclure qu\u2019un avantage fiscal s\u2019applique."
        );
      }
    }
  }
  return { evaluations, invariants };
}
function evaluateOneRule(rule, input, invariants) {
  const fieldCode = rule.fieldCode;
  if (!rule.provenance?.length || !rule.sourceExcerpt) {
    invariants.missingApplicabilityProvenance += 1;
    return baseUnknown(
      fieldCode,
      "Impossible \xE0 d\xE9terminer \u2014 provenance de r\xE8gle incompl\xE8te.",
      ["Provenance manquante \u2014 conclusion forte refus\xE9e."]
    );
  }
  const yearsPresent = input.yearsPresent || [];
  const yearRelation2 = deriveYearRelation2(
    rule,
    yearsPresent,
    input.targetYear ?? null,
    invariants
  );
  if (yearRelation2 === "yearMismatch" && rule.yearPolicy === "exact") {
    invariants.crossYearApplicabilityPromotion += 0;
    return {
      ...baseUnknown(
        fieldCode,
        "Impossible \xE0 d\xE9terminer pour cette ann\xE9e \u2014 la r\xE8gle mod\xE9lis\xE9e ne s\u2019applique pas automatiquement \xE0 un autre mill\xE9sime.",
        ["Ann\xE9e incompatible avec la politique exacte de la r\xE8gle."]
      ),
      ruleId: rule.ruleId,
      yearPolicy: rule.yearPolicy,
      yearRelation: yearRelation2,
      sources: sourcesOf(rule)
    };
  }
  const ctx = {
    fieldCode,
    ruleId: rule.ruleId,
    facts: input.facts,
    userFacts: input.userFacts || [],
    conflicts: input.conflicts || [],
    documentTypes: (input.documents || []).map((d) => d.detectedType || ""),
    documentTexts: input.documentTexts || (input.documents || []).map((d) => d.text || ""),
    fieldCodesPresent: input.fieldCodesPresent || [],
    yearsPresent,
    targetYear: input.targetYear ?? null,
    clarificationSession: input.clarificationSession || null
  };
  const cond2 = evaluateCondition(rule.conditions, ctx);
  if (rule.requiredRole) {
    const cross = detectCrossRolePromotion(
      rule.requiredRole,
      fieldCode,
      input.facts,
      input.userFacts || []
    );
    if (cross) {
      invariants.crossRoleApplicabilityPromotion += 1;
    }
  }
  let status = "unknown";
  const reasons = [];
  const satisfied = [];
  const unsatisfied = [];
  if (cond2.result === "conflicted") {
    status = "conflicted";
    reasons.push(...cond2.conflicts);
  } else if (cond2.result === "true") {
    status = rule.effectWhenTrue;
    satisfied.push(cond2.trace);
    reasons.push(rule.sourceExcerpt);
  } else if (cond2.result === "false") {
    status = rule.effectWhenFalse === "applicable" ? "applicable" : rule.effectWhenFalse === "notApplicable" ? "notApplicable" : rule.effectWhenFalse === "needsInformation" ? "needsInformation" : "unknown";
    unsatisfied.push(cond2.trace);
    reasons.push(rule.sourceExcerpt);
  } else {
    if (rule.absenceIsUnknown && cond2.missingInformation.length) {
      status = "needsInformation";
      reasons.push(
        "Je ne peux pas encore d\xE9terminer si cette case est pertinente : une information n\xE9cessaire manque."
      );
    } else if (cond2.missingInformation.length) {
      status = "needsInformation";
    } else {
      status = "unknown";
      reasons.push(
        "Les sources actuellement mod\xE9lis\xE9es d\xE9crivent cette case, mais ne suffisent pas \xE0 d\xE9terminer son applicabilit\xE9 \xE0 votre situation."
      );
    }
  }
  if (status === "notApplicable" && /absent|missing/i.test(cond2.trace) && rule.absenceIsUnknown) {
    invariants.absencePromotedToNegative += 1;
    status = "needsInformation";
  }
  if ((status === "applicable" || status === "notApplicable") && (!rule.ruleId || !rule.provenance.length)) {
    if (status === "applicable") invariants.unsupportedApplicable += 1;
    else invariants.unsupportedNotApplicable += 1;
    status = "unknown";
  }
  const session = input.clarificationSession;
  if (session && (status === "notApplicable" || status === "applicable")) {
    for (const miss of cond2.missingInformation) {
      const q = session.questions.find(
        (x) => x.requirementId === miss.id || x.questionId.includes(miss.id) || x.fieldCode === miss.fieldCode && (x.status === "unknown" || x.status === "refused")
      );
      if (q?.status === "unknown") {
        invariants.unknownPromotedToKnown += 1;
        status = "needsInformation";
      }
      if (q?.status === "refused" && status === "notApplicable") {
        invariants.refusedPromotedToNegative += 1;
        status = "unknown";
      }
    }
  }
  const explanation = explainTaxApplicability({
    status,
    rule,
    cond: cond2,
    reasons
  });
  return {
    fieldCode,
    status,
    headline: explanation.headline,
    ruleId: rule.ruleId,
    reasons: explanation.why,
    satisfiedConditions: explanation.conditionsSatisfied,
    unsatisfiedConditions: explanation.conditionsNotSatisfied,
    missingInformation: cond2.missingInformation,
    conflicts: cond2.conflicts,
    evidence: cond2.evidence.map((e) => ({
      ...e,
      provenance: rule.provenance
    })),
    sources: sourcesOf(rule),
    yearPolicy: rule.yearPolicy,
    yearRelation: yearRelation2,
    role: rule.requiredRole || null,
    limits: explanation.limits,
    clarificationQuestionCandidates: []
  };
}
function mergeFieldEvaluations(fieldCode, items, invariants) {
  if (!items.length) {
    return baseUnknown(
      fieldCode,
      "Impossible \xE0 d\xE9terminer.",
      ["Aucune \xE9valuation."]
    );
  }
  if (items.some((i) => i.status === "conflicted")) {
    const hit = items.find((i) => i.status === "conflicted");
    invariants.conflictAutoResolved += 0;
    return prefer(hit, items);
  }
  if (items.some((i) => i.status === "applicable")) {
    return prefer(
      items.find((i) => i.status === "applicable"),
      items
    );
  }
  if (items.some((i) => i.status === "notApplicable")) {
    return prefer(
      items.find((i) => i.status === "notApplicable"),
      items
    );
  }
  if (items.some((i) => i.status === "needsInformation")) {
    return prefer(
      items.find((i) => i.status === "needsInformation"),
      items
    );
  }
  return prefer(items[0], items);
}
function prefer(primary, all) {
  return {
    ...primary,
    missingInformation: uniqMissing(all.flatMap((a) => a.missingInformation)),
    conflicts: [...new Set(all.flatMap((a) => a.conflicts))],
    evidence: all.flatMap((a) => a.evidence),
    reasons: [...new Set(all.flatMap((a) => a.reasons))],
    limits: [...new Set(all.flatMap((a) => a.limits))]
  };
}
function uniqMissing(items) {
  const map = /* @__PURE__ */ new Map();
  for (const m of items) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function baseUnknown(fieldCode, headline, reasons) {
  return {
    fieldCode,
    status: "unknown",
    headline,
    ruleId: null,
    reasons,
    satisfiedConditions: [],
    unsatisfiedConditions: [],
    missingInformation: [],
    conflicts: [],
    evidence: [],
    sources: [],
    yearPolicy: null,
    yearRelation: "yearUnknown",
    role: null,
    limits: [
      "Cette \xE9valuation ne constitue ni une obligation d\xE9clarative ni une d\xE9cision d\u2019avantage fiscal."
    ],
    clarificationQuestionCandidates: []
  };
}
function sourcesOf(rule) {
  return rule.provenance.filter((p) => p.url).map((p) => ({ title: p.title || "Source officielle", url: p.url }));
}
function deriveYearRelation2(rule, yearsPresent, targetYear, invariants) {
  if (!yearsPresent.length && targetYear == null) return "yearUnknown";
  const years = targetYear != null ? [targetYear] : [...yearsPresent];
  const inRule = years.every((y) => rule.taxYears.includes(y));
  if (inRule) {
    return rule.yearPolicy === "verifiedStable" ? "yearStable" : "sameYear";
  }
  if (years.some((y) => !rule.taxYears.includes(y))) {
    if (rule.yearPolicy === "verifiedStable") {
      return "yearMismatch";
    }
    invariants.crossYearApplicabilityPromotion += 0;
    return "yearMismatch";
  }
  return "yearUnknown";
}
function detectCrossRolePromotion(required2, fieldCode, facts, userFacts) {
  const opposite = required2 === "declarant1" ? "declarant2" : required2 === "declarant2" ? "declarant1" : null;
  if (!opposite) return false;
  const usedOppositeDoc = facts.some(
    (f) => f.fieldCode === fieldCode && f.declarantRole === opposite && f.displayValue != null && !facts.some(
      (g) => g.fieldCode === fieldCode && g.declarantRole === required2 && g.displayValue != null
    )
  );
  const usedOppositeUser = userFacts.some(
    (u) => u.fieldCode === fieldCode && u.role === opposite && u.active !== false
  );
  return usedOppositeDoc || usedOppositeUser;
}
function mergeInv(a, b) {
  for (const key of Object.keys(b)) {
    a[key] = (a[key] || 0) + (b[key] || 0);
  }
}

// lib/v4/knowledge/fr/tax/calculation/evaluateFormula.ts
function evaluateTypedOperation(operation, values, unit, inputUnits, roundingPolicy) {
  if (!values.length) {
    return { ok: false, reason: "no_values" };
  }
  let raw;
  const notes = [`op:${operation}`];
  switch (operation) {
    case "identity":
      if (values.length !== 1) {
        return { ok: false, reason: "identity_requires_one_input" };
      }
      if (inputUnits.some((u) => u !== unit)) {
        return {
          ok: false,
          reason: "incompatible_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      raw = values[0];
      break;
    case "sum":
    case "subtract":
    case "multiply":
    case "divide":
    case "min":
    case "max":
      if (inputUnits.some((u) => u !== unit)) {
        return {
          ok: false,
          reason: "incompatible_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      if (operation === "sum") {
        raw = values.reduce((a, b) => a + b, 0);
        notes.push(`sum_of_${values.length}`);
      } else if (operation === "subtract") {
        if (values.length < 2) {
          return { ok: false, reason: "subtract_requires_two_inputs" };
        }
        raw = values.slice(1).reduce((a, b) => a - b, values[0]);
      } else if (operation === "multiply") {
        raw = values.reduce((a, b) => a * b, 1);
      } else if (operation === "divide") {
        if (values.length !== 2) {
          return { ok: false, reason: "divide_requires_two_inputs" };
        }
        if (values[1] === 0) return { ok: false, reason: "division_by_zero" };
        raw = values[0] / values[1];
      } else if (operation === "min") {
        raw = Math.min(...values);
      } else {
        raw = Math.max(...values);
      }
      break;
    case "percentage":
      if (values.length !== 2) {
        return { ok: false, reason: "percentage_requires_base_and_rate" };
      }
      if (inputUnits[0] !== "EUR" || inputUnits[1] !== "percentage") {
        return {
          ok: false,
          reason: "percentage_input_units",
          invariant: "incompatibleUnitsCalculated"
        };
      }
      if (unit !== "EUR") {
        return { ok: false, reason: "percentage_result_unit" };
      }
      raw = values[0] * values[1] / 100;
      break;
    default:
      return { ok: false, reason: `unsupported_operation:${operation}` };
  }
  const rounded = applyRounding(raw, roundingPolicy);
  if (!rounded.ok) return rounded;
  return { ok: true, value: rounded.value, notes: [...notes, ...rounded.notes] };
}
function applyRounding(value, policy) {
  switch (policy) {
    case "none":
      return { ok: true, value, notes: ["rounding:none"] };
    case "nearestEuro":
      return {
        ok: true,
        value: Math.round(value),
        notes: ["rounding:nearestEuro"]
      };
    case "floor":
      return { ok: true, value: Math.floor(value), notes: ["rounding:floor"] };
    case "ceil":
      return { ok: true, value: Math.ceil(value), notes: ["rounding:ceil"] };
    case "sourceDefined":
      return { ok: true, value, notes: ["rounding:sourceDefined"] };
    default:
      return {
        ok: false,
        reason: `unsupported_rounding:${policy}`,
        invariant: "unsupportedRounding"
      };
  }
}

// lib/v4/knowledge/fr/tax/calculation/resolveInputs.ts
function resolveFormulaInputs(formula, ctx) {
  const resolved = [];
  const missing = [];
  const conflicts = [];
  for (const input of formula.inputs) {
    const r = resolveOne2(input, formula, ctx);
    resolved.push(r);
    if (r.status === "missing" && input.required) missing.push(input.inputId);
    if (r.status === "conflicted") conflicts.push(input.inputId);
    if (r.status === "incompatible") {
      missing.push(input.inputId);
      ctx.invariants.incompatibleUnitsCalculated += 0;
    }
  }
  return {
    resolved,
    missing,
    conflicts,
    ok: missing.length === 0 && conflicts.length === 0
  };
}
function resolveOne2(input, formula, ctx) {
  if (input.constantId) {
    const c = (formula.constants || []).find(
      (x) => x.constantId === input.constantId
    );
    if (!c) {
      return {
        inputId: input.inputId,
        value: null,
        unit: input.unit,
        taxYear: null,
        role: input.role || null,
        sourceKind: "constant",
        sourceId: input.constantId,
        status: "missing",
        provenanceNote: `Constante officielle absente: ${input.constantId}`,
        documentId: null
      };
    }
    if (c.unit !== input.unit) {
      return {
        inputId: input.inputId,
        value: null,
        unit: input.unit,
        taxYear: null,
        role: input.role || null,
        sourceKind: "constant",
        sourceId: c.constantId,
        status: "incompatible",
        provenanceNote: `Unit\xE9 constante incompatible: ${c.unit} vs ${input.unit}`,
        documentId: null
      };
    }
    return {
      inputId: input.inputId,
      value: c.value,
      unit: c.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: "constant",
      sourceId: c.constantId,
      status: "resolved",
      provenanceNote: c.sourceNote,
      documentId: null
    };
  }
  const code = (input.fieldCode || "").toUpperCase();
  const candidates = [];
  const hasDocumentGraph = ctx.documents.length > 0;
  const primaryDocIds = new Set(
    ctx.documents.filter((d) => d.isPrimaryCopy || d.duplicateStatus !== "possibleDuplicate").map((d) => d.documentId)
  );
  for (const f of ctx.facts) {
    if (code && f.fieldCode !== code) continue;
    if (f.factType === "declarantRole" || f.factType === "fiscalYear") continue;
    const num2 = toNumber(f.displayValue ?? f.value);
    if (num2 == null && input.unit !== "boolean") continue;
    if (hasDocumentGraph && f.sourceDocumentId && !primaryDocIds.has(f.sourceDocumentId)) {
      continue;
    }
    if (hasDocumentGraph && f.sourceDocumentId && ctx.documents.some(
      (d) => d.documentId === f.sourceDocumentId && d.duplicateStatus === "possibleDuplicate" && !d.isPrimaryCopy
    )) {
      continue;
    }
    if (f.sourceDocumentId && ctx.documents.some(
      (d) => d.documentId === f.sourceDocumentId && d.duplicateStatus === "possibleVersion"
    )) {
    }
    if (formula.yearPolicy === "exact" && ctx.targetYear != null && f.year != null && f.year !== ctx.targetYear) {
      ctx.invariants.crossYearCalculation += 0;
      continue;
    }
    if (input.role && input.role !== "unknown") {
      if (input.role === "household") {
        if (f.declarantRole && f.declarantRole !== "unknown" && f.declarantRole !== "household") {
          ctx.invariants.crossRoleCalculation += 0;
          continue;
        }
      } else if (f.declarantRole && f.declarantRole !== "unknown" && f.declarantRole !== input.role) {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    }
    if (formula.rolePolicy === "household") {
      if (f.declarantRole && f.declarantRole !== "unknown" && f.declarantRole !== "household") {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    } else if (formula.rolePolicy !== "any" && formula.rolePolicy !== "unknown") {
      if (f.declarantRole && f.declarantRole !== "unknown" && f.declarantRole !== formula.rolePolicy) {
        ctx.invariants.crossRoleCalculation += 0;
        continue;
      }
    }
    candidates.push({
      inputId: input.inputId,
      value: num2,
      unit: input.unit,
      taxYear: f.year,
      role: f.declarantRole || input.role || null,
      sourceKind: "document",
      sourceId: f.factId,
      status: "resolved",
      provenanceNote: f.provenanceNote || `document:${f.sourceDocumentId}`,
      documentId: f.sourceDocumentId
    });
  }
  if (input.allowUserFact !== false) {
    for (const u of ctx.userFacts) {
      if (u.active === false) continue;
      if (code && u.fieldCode !== code) continue;
      if (u.answerStatus === "unknown" || u.answerStatus === "refused") continue;
      if (u.answerStatus !== "accepted") continue;
      if (input.unit !== "boolean" && (u.valueType === "boolean" || typeof u.normalizedValue === "boolean" || typeof u.answer === "string" && /^(oui|non|yes|no|true|false)$/i.test(u.answer.trim()))) {
        continue;
      }
      const num2 = toNumber(u.normalizedValue ?? u.answer);
      if (num2 == null && input.unit !== "boolean") continue;
      if (formula.yearPolicy === "exact" && ctx.targetYear != null && u.year != null && u.year !== ctx.targetYear) {
        continue;
      }
      if (input.role && u.role && u.role !== "unknown" && u.role !== input.role) {
        continue;
      }
      candidates.push({
        inputId: input.inputId,
        value: num2,
        unit: input.unit,
        taxYear: u.year ?? null,
        role: u.role || input.role || null,
        sourceKind: "user",
        sourceId: u.factId || u.questionId,
        status: "resolved",
        provenanceNote: "Information fournie par vous",
        documentId: null
      });
    }
  }
  if (input.allowDerivedValue) {
    for (const d of ctx.derivedValues || []) {
      if (code && d.fieldCode !== code) continue;
      if (d.unit !== input.unit) {
        continue;
      }
      const num2 = typeof d.value === "number" ? d.value : null;
      if (num2 == null) continue;
      candidates.push({
        inputId: input.inputId,
        value: num2,
        unit: d.unit,
        taxYear: d.taxYear,
        role: d.role,
        sourceKind: "derived",
        sourceId: d.derivedId,
        status: "resolved",
        provenanceNote: `derived:${d.formulaId}`,
        documentId: null
      });
    }
  }
  if (!candidates.length) {
    return {
      inputId: input.inputId,
      value: null,
      unit: input.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: "document",
      sourceId: "",
      status: "missing",
      provenanceNote: "Input absent",
      documentId: null
    };
  }
  const values = [
    ...new Set(candidates.map((c) => String(c.value)))
  ];
  if (values.length > 1) {
    return {
      inputId: input.inputId,
      value: null,
      unit: input.unit,
      taxYear: null,
      role: input.role || null,
      sourceKind: candidates[0].sourceKind,
      sourceId: candidates.map((c) => c.sourceId).join("|"),
      status: "conflicted",
      provenanceNote: `Conflit: ${candidates.map((c) => `${c.sourceKind}:${c.value}`).join(" vs ")}`,
      documentId: null
    };
  }
  const primary = pickPrimaryCandidate(candidates, ctx);
  if (candidates.length > 1 && candidates.every((c) => String(c.value) === String(primary.value))) {
    primary.provenanceNote = `Valeurs identiques (${candidates.length} sources) \u2014 une seule retenue, pas de double comptage. Sources: ${candidates.map((c) => c.sourceKind).join(", ")}`;
  }
  return primary;
}
function pickPrimaryCandidate(candidates, _ctx) {
  const order = { document: 0, user: 1, derived: 2, constant: 3 };
  return [...candidates].sort(
    (a, b) => order[a.sourceKind] - order[b.sourceKind]
  )[0];
}
function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "string") return null;
  const n = Number(
    v.replace(/\s/g, "").replace(/€/g, "").replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}

// lib/v4/knowledge/fr/tax/calculation/formulas.ts
var RETRIEVED6 = "2026-08-08";
function src5(url, title, supports = ["calculation"]) {
  return {
    sourceType: "official",
    authority: "DGFiP",
    url,
    retrievedAt: RETRIEVED6,
    title,
    supports,
    licenseId: "impots-gouv-fr"
  };
}
var SRC_FONCIERS_AIDE4 = src5(
  "https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2025/aides/fonciers.htm",
  "Aide simulateur IR \u2014 revenus fonciers (cases 4BA \xE0 4EA)"
);
var SRC_2042_NOTICE4 = src5(
  "https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2025/2042_5104.pdf",
  "Notice \u2014 Remplir la d\xE9claration de revenus 2024 (formulaire 2042)"
);
var SRC_FONCIERS_BROCHURE4 = src5(
  "https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/10-rev_fonciers_157a160.pdf",
  "Brochure IR \u2014 Revenus fonciers"
);
var TAX_FORMULAS = [
  {
    formulaId: "4be-micro-foncier-revenu-imposable",
    version: "1",
    registryStatus: "verified",
    targetFieldCode: "4BE",
    documentRef: "2042",
    taxYears: [2024, 2025, 2026],
    effectiveFrom: 2024,
    effectiveTo: 2026,
    yearPolicy: "verifiedStable",
    rolePolicy: "household",
    operation: "percentage",
    inputs: [
      {
        inputId: "recettesBrutes",
        label: "Recettes brutes micro-foncier (case 4BE)",
        fieldCode: "4BE",
        unit: "EUR",
        required: true,
        allowUserFact: true,
        role: "household"
      },
      {
        inputId: "tauxImposableApresAbattement",
        label: "Taux de revenu imposable apr\xE8s abattement forfaitaire",
        unit: "percentage",
        required: true,
        constantId: "taxableRetentionPercent"
      }
    ],
    unit: "EUR",
    roundingPolicy: "none",
    requiresApplicabilityField: "4BE",
    constants: [
      {
        constantId: "abatementPercent",
        label: "Abattement forfaitaire micro-foncier",
        value: 30,
        unit: "percentage",
        sourceNote: "Aide IR fonciers : \xAB Un abattement de 30 % (\xE9valuation forfaitaire de vos charges) sera appliqu\xE9 pour d\xE9terminer votre revenu imposable. \xBB"
      },
      {
        constantId: "taxableRetentionPercent",
        label: "Part imposable apr\xE8s abattement (100 % \u2212 30 %)",
        value: 70,
        unit: "percentage",
        sourceNote: "Cons\xE9quence arithm\xE9tique directe de l\u2019abattement forfaitaire de 30 % sur les recettes brutes."
      },
      {
        constantId: "grossCeilingEur",
        label: "Plafond de recettes brutes du r\xE9gime micro-foncier",
        value: 15e3,
        unit: "EUR",
        sourceNote: "Aide IR fonciers : recettes brutes du foyer n\u2019exc\xE9dant pas 15 000 \u20AC pour relever du micro-foncier."
      }
    ],
    formulaConditions: [
      {
        kind: "inputAtMost",
        inputId: "recettesBrutes",
        value: 15e3,
        unit: "EUR",
        onFail: "notApplicable",
        message: "Les recettes brutes d\xE9passent le plafond de 15 000 \u20AC du r\xE9gime micro-foncier : cette formule d\u2019abattement ne s\u2019applique pas."
      },
      {
        kind: "userFactAccepted",
        requirementId: "4be-micro-exclusions-ok",
        fieldCode: "4BE",
        missingId: "4be-micro-exclusions-ok",
        message: "Les exclusions officielles du micro-foncier (amortissements sp\xE9cifiques, Malraux, monuments historiques, etc.) ne sont pas encore confirm\xE9es comme absentes."
      }
    ],
    resultLabel: "Revenu foncier imposable apr\xE8s abattement forfaitaire micro-foncier (\u2260 montant \xE0 porter en 4BE)",
    provenance: [SRC_FONCIERS_AIDE4, SRC_2042_NOTICE4, SRC_FONCIERS_BROCHURE4],
    sourceExcerpt: "Si vous relevez du r\xE9gime micro foncier, indiquez le montant de vos loyers per\xE7us en case 4BE. Un abattement de 30 % (\xE9valuation forfaitaire de vos charges) sera appliqu\xE9 pour d\xE9terminer votre revenu imposable. Ne le d\xE9duisez pas, il sera calcul\xE9 automatiquement. Condition : revenus fonciers bruts n\u2019exc\xE9dant pas 15 000 \u20AC (aide simulateur IR \u2014 revenus fonciers).",
    verificationStatus: "verified"
  }
];
function getFormulasForField(fieldCode, extra2 = []) {
  const code = fieldCode.toUpperCase();
  return [...TAX_FORMULAS, ...extra2].filter(
    (f) => f.targetFieldCode.toUpperCase() === code
  );
}

// lib/v4/knowledge/fr/tax/calculation/explainCalculation.ts
function explainTaxCalculation(result, formula) {
  const limits = [
    "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration.",
    "Ce calcul ne constitue ni une obligation ni une d\xE9cision d\u2019avantage fiscal."
  ];
  let headline = result.explanation;
  switch (result.status) {
    case "calculated":
      headline = `Cette valeur est calcul\xE9e \xE0 partir des informations suivantes selon la formule sourc\xE9e ${result.formulaId}.`;
      break;
    case "needsInformation":
      headline = `Cette valeur ne peut pas encore \xEAtre calcul\xE9e : ${(result.missingInputs || []).join(", ") || "une information"} manque.`;
      break;
    case "conflicted":
      headline = "Cette valeur ne peut pas \xEAtre calcul\xE9e car plusieurs informations incompatibles existent.";
      break;
    case "notApplicable":
      headline = "Calcul non applicable \u2014 la case n\u2019est pas pertinente selon les informations disponibles.";
      break;
    case "unsupported":
      headline = "Les r\xE8gles actuellement mod\xE9lis\xE9es ne permettent pas de calculer cette valeur de fa\xE7on fiable.";
      break;
  }
  return {
    status: result.status,
    headline,
    formulaId: result.formulaId,
    operation: formula?.operation || null,
    inputs: result.inputs.map(
      (i) => `${i.inputId}=${i.value ?? "?"} (${i.sourceKind}${i.status !== "resolved" ? `, ${i.status}` : ""})`
    ),
    result: result.value != null ? `${result.value}${result.unit === "EUR" ? " \u20AC" : result.unit ? ` ${result.unit}` : ""}` : null,
    unit: result.unit,
    year: result.inputs.find((i) => i.taxYear != null)?.taxYear ?? null,
    role: formula?.rolePolicy || null,
    sources: result.sources,
    rounding: formula?.roundingPolicy || null,
    limits
  };
}

// lib/v4/knowledge/fr/tax/calculation/formulaConditions.ts
function evaluateFormulaConditions(formula, ctx) {
  for (const cond2 of formula.formulaConditions || []) {
    const r = evaluateOne(cond2, ctx);
    if (!r.ok) return r;
  }
  return { ok: true };
}
function evaluateOne(cond2, ctx) {
  if (cond2.kind === "inputAtMost") {
    const inp = ctx.resolved.find((r) => r.inputId === cond2.inputId);
    if (!inp || inp.status !== "resolved" || typeof inp.value !== "number") {
      return {
        ok: false,
        status: "needsInformation",
        missingInputs: [cond2.inputId],
        explanation: `Cette valeur ne peut pas encore \xEAtre calcul\xE9e : ${cond2.inputId} manque.`
      };
    }
    if (inp.unit !== cond2.unit) {
      return {
        ok: false,
        status: "unsupported",
        missingInputs: [],
        explanation: `Unit\xE9 incompatible pour la condition ${cond2.inputId}.`
      };
    }
    if (inp.value > cond2.value) {
      return {
        ok: false,
        status: cond2.onFail,
        missingInputs: [],
        explanation: cond2.message
      };
    }
    return { ok: true };
  }
  if (cond2.kind === "userFactAccepted") {
    const accepted = ctx.userFacts.some(
      (u) => u.active !== false && u.answerStatus === "accepted" && u.requirementId === cond2.requirementId && (!u.fieldCode || u.fieldCode.toUpperCase() === cond2.fieldCode.toUpperCase()) && isAffirmative2(u.normalizedValue ?? u.answer)
    );
    if (!accepted) {
      return {
        ok: false,
        status: "needsInformation",
        missingInputs: [cond2.missingId],
        explanation: cond2.message
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    status: "unsupported",
    missingInputs: [],
    explanation: "Condition de formule non reconnue."
  };
}
function isAffirmative2(v) {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return ["oui", "yes", "true", "ok", "confirm\xE9", "confirme", "1"].includes(s);
}

// lib/v4/knowledge/fr/tax/ruleRegistry/buildEntries.ts
function mapVerificationToRegistryStatus(verificationStatus, registryStatus) {
  if (registryStatus) return registryStatus;
  if (verificationStatus === "verified") return "verified";
  if (verificationStatus === "partial") return "experimental";
  return "unsupported";
}
function formulaVersion(f) {
  return f.version && String(f.version).trim() ? String(f.version) : "1";
}
function applicabilityVersion(r) {
  return r.version && String(r.version).trim() ? String(r.version) : "1";
}
function entryFromFormula(f) {
  const provenance2 = f.provenance || [];
  return {
    ruleId: `calc:${f.formulaId}`,
    kind: "calculation",
    fieldCodes: [f.targetFieldCode.toUpperCase()],
    taxYears: [...f.taxYears].sort((a, b) => a - b),
    effectiveFrom: f.effectiveFrom ?? null,
    effectiveTo: f.effectiveTo ?? null,
    version: formulaVersion(f),
    status: mapVerificationToRegistryStatus(
      f.verificationStatus,
      f.registryStatus
    ),
    sourceRefs: provenance2.map((p) => p.url).filter((u) => Boolean(u)).sort(),
    provenance: [...provenance2],
    sourceExcerpt: f.sourceExcerpt || null,
    formulaId: f.formulaId,
    applicabilityRuleId: null
  };
}
function entryFromApplicabilityRule(r) {
  const provenance2 = r.provenance || [];
  return {
    ruleId: `app:${r.ruleId}`,
    kind: "applicability",
    fieldCodes: [r.fieldCode.toUpperCase()],
    taxYears: [...r.taxYears].sort((a, b) => a - b),
    effectiveFrom: null,
    effectiveTo: null,
    version: applicabilityVersion(r),
    status: mapVerificationToRegistryStatus(r.verificationStatus),
    sourceRefs: provenance2.map((p) => p.url).filter((u) => Boolean(u)).sort(),
    provenance: [...provenance2],
    sourceExcerpt: r.sourceExcerpt || null,
    formulaId: null,
    applicabilityRuleId: r.ruleId
  };
}
function sortRegistryEntries(entries) {
  return [...entries].sort((a, b) => {
    const k = a.ruleId.localeCompare(b.ruleId) || a.version.localeCompare(b.version) || a.kind.localeCompare(b.kind) || a.taxYears.join(",").localeCompare(b.taxYears.join(","));
    return k;
  });
}
function buildTaxRuleRegistry(options = {}) {
  const formulas = options.formulas ?? TAX_FORMULAS;
  const appRules = options.applicabilityRules ?? TAX_APPLICABILITY_RULES;
  const extras = options.extraEntries ?? [];
  return sortRegistryEntries([
    ...formulas.map(entryFromFormula),
    ...appRules.map(entryFromApplicabilityRule),
    ...extras
  ]);
}

// lib/v4/knowledge/fr/tax/ruleRegistry/resolve.ts
function emptyRuleRegistryInvariants() {
  return {
    implicitRuleSelection: 0,
    unsourcedVerifiedRules: 0,
    ambiguousRuleAutoResolution: 0,
    derivedValuePromotedToDeclaredAmount: 0,
    calculationPromotedToEligibility: 0,
    implicitAmountAggregation: 0
  };
}
function entryCoversYear(entry, taxYear) {
  if (taxYear == null) return true;
  if (entry.taxYears.includes(taxYear)) return true;
  const from = entry.effectiveFrom;
  const to = entry.effectiveTo;
  if (from != null || to != null) {
    const lo = from ?? Number.NEGATIVE_INFINITY;
    const hi = to ?? Number.POSITIVE_INFINITY;
    return taxYear >= lo && taxYear <= hi;
  }
  return false;
}
function resolveTaxRule(options) {
  const taxYear = options.taxYear ?? null;
  const entries = sortRegistryEntries(
    options.entries ?? buildTaxRuleRegistry()
  );
  const field3 = options.fieldCode?.toUpperCase() || null;
  let pool = entries.filter((e) => {
    if (options.ruleId && e.ruleId !== options.ruleId) return false;
    if (options.kind && e.kind !== options.kind) return false;
    if (field3 && !e.fieldCodes.map((c) => c.toUpperCase()).includes(field3)) {
      return false;
    }
    return entryCoversYear(e, taxYear);
  });
  if (taxYear != null) {
    const yearHits = pool.filter((e) => entryCoversYear(e, taxYear));
    pool = yearHits;
  }
  const deprecated = pool.filter((e) => e.status === "deprecated");
  const experimental = pool.filter((e) => e.status === "experimental");
  const unsupported = pool.filter((e) => e.status === "unsupported");
  let executable = pool.filter((e) => e.status === "verified");
  if (options.allowExperimental) {
    executable = sortRegistryEntries([...executable, ...experimental]);
  }
  if (options.allowDeprecated) {
    executable = sortRegistryEntries([...executable, ...deprecated]);
  }
  executable = sortRegistryEntries(executable);
  if (executable.length === 1) {
    return {
      status: "resolved",
      entry: executable[0],
      candidates: executable,
      reason: `R\xE8gle r\xE9solue: ${executable[0].ruleId}@${executable[0].version}`,
      taxYear
    };
  }
  if (executable.length > 1) {
    return {
      status: "ambiguous",
      entry: null,
      candidates: executable,
      reason: `Plusieurs versions \xE9galement valides: ${executable.map((e) => `${e.ruleId}@${e.version}`).join(", ")}`,
      taxYear
    };
  }
  if (!options.allowExperimental && experimental.length > 0 && deprecated.length === 0) {
    return {
      status: "experimentalOnly",
      entry: null,
      candidates: sortRegistryEntries(experimental),
      reason: "Seules des r\xE8gles experimental existent pour ce p\xE9rim\xE8tre \u2014 non ex\xE9cutables en production.",
      taxYear
    };
  }
  if (unsupported.length && !pool.some((e) => e.status === "verified")) {
    return {
      status: "unsupported",
      entry: null,
      candidates: sortRegistryEntries(pool),
      reason: "Aucune r\xE8gle verified compatible pour ce p\xE9rim\xE8tre.",
      taxYear
    };
  }
  return {
    status: "unsupported",
    entry: null,
    candidates: sortRegistryEntries(pool),
    reason: taxYear != null ? `Aucune version compatible pour l'ann\xE9e ${taxYear}.` : "Aucune version compatible.",
    taxYear
  };
}
function resolveTaxFormula(options) {
  const invariants = emptyRuleRegistryInvariants();
  const taxYear = options.taxYear ?? null;
  const fieldCode = options.fieldCode.toUpperCase();
  const allFormulas = [
    ...options.formulas ?? TAX_FORMULAS,
    ...options.extraFormulas ?? []
  ];
  const formulaByKey = new Map(
    allFormulas.map((f) => [`${f.formulaId}@${formulaVersion(f)}`, f])
  );
  const calcEntries = sortRegistryEntries(allFormulas.map(entryFromFormula));
  const resolution = resolveTaxRule({
    entries: calcEntries,
    ruleId: options.formulaId ? `calc:${options.formulaId}` : null,
    fieldCode,
    kind: "calculation",
    taxYear,
    allowExperimental: options.allowExperimental === true,
    allowDeprecated: false
  });
  if (resolution.status === "ambiguous") {
    invariants.ambiguousRuleAutoResolution += 0;
    return {
      status: "ambiguous",
      formula: null,
      entry: null,
      candidates: resolution.candidates,
      reason: resolution.reason,
      taxYear,
      invariants
    };
  }
  if (resolution.status !== "resolved" || !resolution.entry) {
    const status = resolution.status === "experimentalOnly" ? "experimentalOnly" : "unsupported";
    return {
      status,
      formula: null,
      entry: null,
      candidates: resolution.candidates,
      reason: resolution.reason,
      taxYear,
      invariants
    };
  }
  const entry = resolution.entry;
  if (entry.status === "verified" && entry.sourceRefs.length === 0) {
    invariants.unsourcedVerifiedRules += 1;
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: "R\xE8gle verified sans sourceRefs \u2014 ex\xE9cution refus\xE9e.",
      taxYear,
      invariants
    };
  }
  const formulaId = entry.formulaId || options.formulaId;
  const formula = formulaId ? formulaByKey.get(`${formulaId}@${entry.version}`) || null : null;
  if (!formula) {
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: "Entr\xE9e registre sans TaxFormula li\xE9e pour cette version.",
      taxYear,
      invariants
    };
  }
  if (taxYear != null && !formula.taxYears.includes(taxYear) && !((formula.effectiveFrom != null || formula.effectiveTo != null) && taxYear >= (formula.effectiveFrom ?? Number.NEGATIVE_INFINITY) && taxYear <= (formula.effectiveTo ?? Number.POSITIVE_INFINITY))) {
    return {
      status: "unsupported",
      formula: null,
      entry,
      candidates: [entry],
      reason: `La formule ${formula.formulaId} ne couvre pas l'ann\xE9e ${taxYear}.`,
      taxYear,
      invariants
    };
  }
  return {
    status: "resolved",
    formula,
    entry,
    candidates: [entry],
    reason: resolution.reason,
    taxYear,
    invariants
  };
}

// lib/v4/knowledge/fr/tax/calculation/calculateDerivedValue.ts
function emptyCalculationInvariants() {
  return {
    implicitAmountAggregation: 0,
    calculationWithoutVerifiedFormula: 0,
    calculationWithoutFormulaProvenance: 0,
    calculationWithMissingInput: 0,
    calculationWithConflictedInput: 0,
    calculationWithUnknownApplicability: 0,
    calculationWithNeedsInformationApplicability: 0,
    crossYearCalculation: 0,
    crossRoleCalculation: 0,
    incompatibleUnitsCalculated: 0,
    duplicateAmountDoubleCount: 0,
    versionAmountAutoSelected: 0,
    unsupportedRounding: 0,
    derivedValuePromotedToDeclaredAmount: 0,
    calculationPromotedToEligibility: 0,
    calculationPromotedToObligation: 0,
    uploadOrderChangesCalculation: 0,
    automaticUnsafeAggregation: 0,
    implicitRuleSelection: 0,
    unsourcedVerifiedRules: 0,
    ambiguousRuleAutoResolution: 0
  };
}
var derivedSeq = 0;
function calculateDerivedValue(options) {
  const invariants = emptyCalculationInvariants();
  const fieldCode = options.fieldCode.toUpperCase();
  const formulas = getFormulasForField(fieldCode, options.extraFormulas || []);
  const formulaResolution = resolveTaxFormula({
    fieldCode,
    taxYear: options.targetYear ?? null,
    extraFormulas: options.extraFormulas || []
  });
  invariants.implicitRuleSelection += formulaResolution.invariants.implicitRuleSelection;
  invariants.unsourcedVerifiedRules += formulaResolution.invariants.unsourcedVerifiedRules;
  invariants.ambiguousRuleAutoResolution += formulaResolution.invariants.ambiguousRuleAutoResolution;
  if (!formulas.length || formulaResolution.status === "unsupported") {
    const amountCount = options.facts.filter(
      (f) => f.fieldCode === fieldCode && (typeof f.value === "number" || f.displayValue != null && /\d/.test(String(f.displayValue)))
    ).length;
    if (amountCount > 1) {
      invariants.implicitAmountAggregation += 0;
    }
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        formulaResolution.reason || "Les r\xE8gles actuellement mod\xE9lis\xE9es ne permettent pas de calculer cette valeur de fa\xE7on fiable."
      )
    };
  }
  if (formulaResolution.status === "ambiguous") {
    invariants.ambiguousRuleAutoResolution += 0;
    return {
      invariants,
      result: {
        fieldCode,
        status: "conflicted",
        value: null,
        unit: null,
        formulaId: null,
        inputs: [],
        missingInputs: [],
        conflicts: [formulaResolution.reason],
        evidence: [],
        explanation: "Cette valeur ne peut pas \xEAtre calcul\xE9e car plusieurs versions de formule \xE9galement valides existent pour ce p\xE9rim\xE8tre.",
        sources: [],
        limits: [
          "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
        ],
        derivedValue: null,
        rule: null
      }
    };
  }
  if (formulaResolution.status === "experimentalOnly" || !formulaResolution.formula) {
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        formulaResolution.reason || "Aucune formule verified ex\xE9cutable pour ce p\xE9rim\xE8tre."
      )
    };
  }
  const app = options.applicability;
  if (app) {
    if (app.status === "notApplicable") {
      return {
        invariants,
        result: {
          fieldCode,
          status: "notApplicable",
          value: null,
          unit: null,
          formulaId: null,
          inputs: [],
          missingInputs: [],
          conflicts: [],
          evidence: [],
          explanation: "Calcul non applicable \u2014 la case n\u2019est pas pertinente selon les informations disponibles.",
          sources: [],
          limits: [
            "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
          ],
          derivedValue: null
        }
      };
    }
    if (app.status === "unknown") {
      return {
        invariants,
        result: unsupportedResult(
          fieldCode,
          "Calcul impossible tant que la pertinence de la case n\u2019est pas d\xE9termin\xE9e."
        )
      };
    }
    if (app.status === "needsInformation") {
      return {
        invariants,
        result: {
          fieldCode,
          status: "needsInformation",
          value: null,
          unit: null,
          formulaId: null,
          inputs: [],
          missingInputs: app.missingInformation.map((m) => m.id),
          conflicts: [],
          evidence: [],
          explanation: "Cette valeur ne peut pas encore \xEAtre calcul\xE9e : des informations d\u2019applicabilit\xE9 manquent.",
          sources: [],
          limits: [
            "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
          ],
          derivedValue: null
        }
      };
    }
    if (app.status === "conflicted") {
      return {
        invariants,
        result: {
          fieldCode,
          status: "conflicted",
          value: null,
          unit: null,
          formulaId: null,
          inputs: [],
          missingInputs: [],
          conflicts: app.conflicts,
          evidence: [],
          explanation: "Cette valeur ne peut pas \xEAtre calcul\xE9e car plusieurs informations incompatibles existent.",
          sources: [],
          limits: [
            "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
          ],
          derivedValue: null
        }
      };
    }
  }
  const formula = formulaResolution.formula;
  const registryEntry = formulaResolution.entry;
  const ruleProv = buildRuleProvenance(
    formula,
    registryEntry,
    options.targetYear ?? null
  );
  if (formula.verificationStatus !== "verified" || !formula.provenance?.length || !formula.sourceExcerpt || !formula.formulaId) {
    invariants.calculationWithoutVerifiedFormula += 0;
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        "Formule sans provenance / v\xE9rification insuffisante \u2014 calcul refus\xE9.",
        ruleProv
      )
    };
  }
  if (!formula.provenance.length) {
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        "Provenance de formule incompl\xE8te.",
        ruleProv
      )
    };
  }
  if (formula.requiresApplicabilityField && !options.applicability) {
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        "Calcul impossible tant que la pertinence de la case n\u2019est pas d\xE9termin\xE9e."
      )
    };
  }
  if (formula.yearPolicy === "exact" && options.targetYear != null && !formula.taxYears.includes(options.targetYear)) {
    invariants.crossYearCalculation = 0;
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        "La formule mod\xE9lis\xE9e ne s\u2019applique pas \xE0 cette ann\xE9e."
      )
    };
  }
  if (options.targetYear != null && !formula.taxYears.includes(options.targetYear)) {
    invariants.crossYearCalculation = 0;
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        "La formule mod\xE9lis\xE9e ne s\u2019applique pas \xE0 cette ann\xE9e."
      )
    };
  }
  const resolved = resolveFormulaInputs(formula, {
    facts: options.facts,
    userFacts: options.userFacts || [],
    derivedValues: options.derivedValues || [],
    documents: options.documents || [],
    targetYear: options.targetYear ?? null,
    invariants
  });
  if (resolved.conflicts.length) {
    invariants.calculationWithConflictedInput = 0;
    return {
      invariants,
      result: {
        fieldCode,
        status: "conflicted",
        value: null,
        unit: formula.unit,
        formulaId: formula.formulaId,
        inputs: resolved.resolved,
        missingInputs: [],
        conflicts: resolved.conflicts.map(
          (id) => resolved.resolved.find((r) => r.inputId === id)?.provenanceNote || id
        ),
        evidence: [],
        explanation: "Cette valeur ne peut pas \xEAtre calcul\xE9e car plusieurs informations incompatibles existent pour un input.",
        sources: sourcesOf2(formula),
        limits: [
          "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
        ],
        derivedValue: null,
        rule: ruleProv
      }
    };
  }
  if (resolved.missing.length) {
    invariants.calculationWithMissingInput = 0;
    return {
      invariants,
      result: {
        fieldCode,
        status: "needsInformation",
        value: null,
        unit: formula.unit,
        formulaId: formula.formulaId,
        inputs: resolved.resolved,
        missingInputs: resolved.missing,
        conflicts: [],
        evidence: [],
        explanation: `Cette valeur ne peut pas encore \xEAtre calcul\xE9e : ${resolved.missing.join(", ")} manque.`,
        sources: sourcesOf2(formula),
        limits: [
          "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
        ],
        derivedValue: null,
        rule: ruleProv
      }
    };
  }
  const cond2 = evaluateFormulaConditions(formula, {
    resolved: resolved.resolved,
    userFacts: options.userFacts || []
  });
  if (!cond2.ok) {
    return {
      invariants,
      result: {
        fieldCode,
        status: cond2.status,
        value: null,
        unit: formula.unit,
        formulaId: formula.formulaId,
        inputs: resolved.resolved,
        missingInputs: cond2.missingInputs,
        conflicts: [],
        evidence: [],
        explanation: cond2.explanation,
        sources: sourcesOf2(formula),
        limits: [
          "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration.",
          formula.resultLabel || "Ce calcul ne constitue ni une obligation ni une d\xE9cision d\u2019avantage fiscal."
        ],
        derivedValue: null,
        rule: ruleProv
      }
    };
  }
  const values = [];
  const units = [];
  for (const inp of formula.inputs) {
    const r = resolved.resolved.find((x) => x.inputId === inp.inputId);
    if (typeof r.value !== "number") {
      return {
        invariants,
        result: {
          fieldCode,
          status: "needsInformation",
          value: null,
          unit: formula.unit,
          formulaId: formula.formulaId,
          inputs: resolved.resolved,
          missingInputs: [inp.inputId],
          conflicts: [],
          evidence: [],
          explanation: `Input non num\xE9rique : ${inp.inputId}`,
          sources: sourcesOf2(formula),
          limits: [
            "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
          ],
          derivedValue: null,
          rule: ruleProv
        }
      };
    }
    values.push(r.value);
    units.push(r.unit);
  }
  const evalResult = evaluateTypedOperation(
    formula.operation,
    values,
    formula.unit,
    units,
    formula.roundingPolicy
  );
  if (!evalResult.ok) {
    if (evalResult.invariant === "incompatibleUnitsCalculated") {
      invariants.incompatibleUnitsCalculated += 1;
    }
    if (evalResult.invariant === "unsupportedRounding") {
      invariants.unsupportedRounding += 1;
    }
    if (evalResult.invariant) {
      invariants[evalResult.invariant] = 0;
    }
    return {
      invariants,
      result: unsupportedResult(
        fieldCode,
        `Calcul refus\xE9 : ${evalResult.reason}`
      )
    };
  }
  derivedSeq += 1;
  const derived = {
    derivedId: `dv-${formula.formulaId}-${derivedSeq}`,
    kind: "derived",
    fieldCode,
    value: evalResult.value,
    unit: formula.unit,
    formulaId: formula.formulaId,
    taxYear: options.targetYear ?? null,
    role: formula.rolePolicy === "any" || formula.rolePolicy === "unknown" ? null : formula.rolePolicy,
    inputs: resolved.resolved,
    provenance: formula.provenance
  };
  const result = {
    fieldCode,
    status: "calculated",
    value: evalResult.value,
    unit: formula.unit,
    formulaId: formula.formulaId,
    inputs: resolved.resolved,
    missingInputs: [],
    conflicts: [],
    evidence: resolved.resolved.map((r, i) => ({
      evidenceId: `ce-${i}`,
      label: r.sourceKind === "user" ? "Information fournie par vous" : r.sourceKind === "derived" ? "Valeur d\xE9riv\xE9e" : r.sourceKind === "constant" ? "Constante officielle de la formule" : "Information trouv\xE9e dans le document",
      detail: `${r.inputId}=${r.value} ${r.unit}`,
      sourceKind: r.sourceKind === "constant" ? "formula" : r.sourceKind === "derived" ? "derived" : r.sourceKind,
      sourceId: r.sourceId
    })),
    explanation: "",
    sources: sourcesOf2(formula),
    limits: [
      "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration.",
      formula.resultLabel || "Ce calcul ne constitue ni une obligation ni une d\xE9cision d\u2019avantage fiscal.",
      "Ce calcul ne constitue ni une obligation ni une d\xE9cision d\u2019avantage fiscal."
    ],
    derivedValue: derived,
    rule: ruleProv
  };
  result.explanation = explainTaxCalculation(result, formula).headline;
  if (result.value != null) {
    invariants.derivedValuePromotedToDeclaredAmount += 0;
    invariants.calculationPromotedToEligibility += 0;
    invariants.calculationPromotedToObligation += 0;
  }
  return { result, invariants };
}
function evaluateDocumentCaseCalculations(docCase, extraFormulas = []) {
  const t0 = Date.now();
  const invariants = emptyCalculationInvariants();
  const results = [];
  let formulasEvaluated = 0;
  let inputsResolved = 0;
  let calculationsProduced = 0;
  let calculationsBlocked = 0;
  let conflicts = 0;
  const codes = [
    .../* @__PURE__ */ new Set([
      ...docCase.taxContext.fieldCodesPresent,
      ...docCase.fieldAssistance.map((a) => a.fieldCode),
      ...extraFormulas.map((f) => f.targetFieldCode)
    ])
  ].sort();
  const derivedAcc = [];
  for (const code of codes) {
    const app = (docCase.applicabilityEvaluations || []).find(
      (e) => e.fieldCode === code
    );
    const { result, invariants: inv } = calculateDerivedValue({
      fieldCode: code,
      facts: docCase.factIndex,
      userFacts: docCase.userAnswers,
      derivedValues: derivedAcc,
      documents: docCase.documents,
      applicability: app || null,
      targetYear: docCase.taxContext.yearsPresent.length === 1 ? docCase.taxContext.yearsPresent[0] : null,
      extraFormulas
    });
    formulasEvaluated += getFormulasForField(code, extraFormulas).length || 1;
    inputsResolved += result.inputs.filter((i) => i.status === "resolved").length;
    if (result.status === "calculated") {
      calculationsProduced += 1;
      if (result.derivedValue) derivedAcc.push(result.derivedValue);
    } else {
      calculationsBlocked += 1;
    }
    if (result.status === "conflicted") conflicts += 1;
    results.push(result);
    mergeInv2(invariants, inv);
  }
  if (docCase.suggestedDeclaredAmount != null) {
    invariants.derivedValuePromotedToDeclaredAmount += 1;
  }
  return {
    results,
    invariants,
    metrics: {
      formulasEvaluated,
      inputsResolved,
      calculationsProduced,
      calculationsBlocked,
      conflicts,
      durationMs: Date.now() - t0
    }
  };
}
function unsupportedResult(fieldCode, explanation, rule = null) {
  return {
    fieldCode,
    status: "unsupported",
    value: null,
    unit: null,
    formulaId: rule?.formulaId || null,
    inputs: [],
    missingInputs: [],
    conflicts: [],
    evidence: [],
    explanation,
    sources: rule?.sources || [],
    limits: [
      "Cette valeur calcul\xE9e n\u2019est pas une valeur officielle de d\xE9claration."
    ],
    derivedValue: null,
    rule
  };
}
function buildRuleProvenance(formula, entry, taxYear) {
  return {
    ruleId: entry?.ruleId || `calc:${formula.formulaId}`,
    formulaId: formula.formulaId,
    version: entry?.version || formulaVersion(formula),
    taxYear,
    status: entry?.status || "verified",
    sources: sourcesOf2(formula)
  };
}
function sourcesOf2(formula) {
  return formula.provenance.filter((p) => p.url).map((p) => ({ title: p.title || "Source officielle", url: p.url }));
}
function mergeInv2(a, b) {
  for (const k of Object.keys(b)) {
    a[k] = (a[k] || 0) + (b[k] || 0);
  }
}

// lib/v4/localExplanation/explainDocumentFacts.ts
function collectSourceFactsForSubject(input) {
  const code = input.subject.toUpperCase();
  const sourceFacts = [];
  const details = [];
  const docFacts = input.facts.filter(
    (f) => (f.fieldCode || "").toUpperCase() === code
  );
  for (const f of docFacts) {
    const value = f.displayValue != null ? String(f.displayValue) : f.value != null ? String(f.value) : null;
    sourceFacts.push({
      kind: "document",
      id: f.factId,
      label: `Information trouv\xE9e pour ${code}`,
      value,
      fieldCode: code,
      documentId: f.sourceDocumentId || null
    });
    if (value != null) {
      details.push(
        `Le document indique ${formatValue(value, f)} associ\xE9 \xE0 la case ${code}.`
      );
    } else {
      details.push(`La case ${code} est mentionn\xE9e dans le document sans montant exploitable.`);
    }
  }
  for (const u of input.userFacts || []) {
    if ((u.fieldCode || "").toUpperCase() !== code) continue;
    if (u.active === false) continue;
    if (u.answerStatus !== "accepted") continue;
    const value = u.normalizedValue != null ? String(u.normalizedValue) : u.answer != null ? String(u.answer) : null;
    if (u.valueType === "boolean" || typeof u.normalizedValue === "boolean") {
      sourceFacts.push({
        kind: "user",
        id: u.factId || u.questionId,
        label: "Pr\xE9cision fournie par vous",
        value,
        fieldCode: code,
        documentId: null
      });
      details.push("Une pr\xE9cision fournie par vous a \xE9t\xE9 prise en compte.");
      continue;
    }
    sourceFacts.push({
      kind: "user",
      id: u.factId || u.questionId,
      label: "Information fournie par vous",
      value,
      fieldCode: code,
      documentId: null
    });
    if (value != null) {
      details.push(`Vous avez indiqu\xE9 ${value} pour ${code}.`);
    }
  }
  let foundSummary = null;
  const amountLike = sourceFacts.find(
    (s) => s.kind === "document" && s.value != null && /\d/.test(s.value) && s.label.includes("Information trouv\xE9e")
  );
  if (amountLike?.value != null) {
    foundSummary = `Le document indique ${amountLike.value}${/€/.test(amountLike.value) ? "" : " \u20AC"} dans la case ${code}.`.replace(" \u20AC \u20AC", " \u20AC");
  } else if (input.view?.foundByDocument?.length) {
    foundSummary = `Des \xE9l\xE9ments li\xE9s \xE0 ${code} ont \xE9t\xE9 rep\xE9r\xE9s dans le dossier.`;
  } else if (!sourceFacts.length) {
    foundSummary = null;
  }
  return { sourceFacts, foundSummary, details: [...new Set(details)] };
}
function formatValue(value, f) {
  if (/€/.test(value)) return value;
  if (typeof f.value === "number") return `${f.value} \u20AC`;
  if (/^\d/.test(value.replace(/\s/g, ""))) return `${value} \u20AC`;
  return value;
}

// lib/v4/localExplanation/explainApplicabilityLocal.ts
function explainApplicabilityLocal(app) {
  if (!app) {
    return {
      status: "unknown",
      summary: "Cette information ne peut pas encore \xEAtre d\xE9termin\xE9e avec les \xE9l\xE9ments disponibles.",
      details: [],
      missingInformation: [],
      why: [
        "Aucune \xE9valuation d\u2019applicabilit\xE9 n\u2019est disponible pour ce sujet."
      ],
      sourceRefs: [],
      ruleRefs: []
    };
  }
  const missingInformation = (app.missingInformation || []).map(
    (m) => m.question || m.reason || m.id
  );
  const why = [...app.reasons || []];
  const sourceRefs = [...app.sources || []];
  const ruleRefs = app.ruleId ? [
    {
      ruleId: `app:${app.ruleId}`,
      kind: "applicability",
      status: null,
      version: null
    }
  ] : [];
  switch (app.status) {
    case "applicable":
      return {
        status: "explained",
        summary: "Les conditions mod\xE9lis\xE9es pour ce point sont satisfaites selon les informations disponibles.",
        details: why,
        missingInformation: [],
        why: [
          "Les faits et pr\xE9cisions disponibles correspondent \xE0 la r\xE8gle d\u2019applicabilit\xE9 v\xE9rifi\xE9e."
        ],
        sourceRefs,
        ruleRefs
      };
    case "needsInformation":
      return {
        status: "needsInformation",
        summary: "Une information suppl\xE9mentaire est n\xE9cessaire pour d\xE9terminer si cette r\xE8gle s\u2019applique.",
        details: why,
        missingInformation,
        why: [
          "Le moteur refuse de conclure tant qu\u2019une information d\xE9terminante manque."
        ],
        sourceRefs,
        ruleRefs
      };
    case "conflicted":
      return {
        status: "conflicted",
        summary: "Les informations disponibles sont contradictoires.",
        details: [...why, ...app.conflicts || []],
        missingInformation: [],
        why: [
          "Des \xE9l\xE9ments incompatibles emp\xEAchent toute conclusion d\u2019applicabilit\xE9."
        ],
        sourceRefs,
        ruleRefs
      };
    case "notApplicable":
      return {
        status: "notApplicable",
        summary: "Selon les informations disponibles et la r\xE8gle mod\xE9lis\xE9e, ce point n\u2019est pas pertinent pour ce dossier.",
        details: why,
        missingInformation: [],
        why: ["La r\xE8gle d\u2019applicabilit\xE9 conclut \xE0 non pertinent."],
        sourceRefs,
        ruleRefs
      };
    case "unknown":
    default:
      return {
        status: "unknown",
        summary: "Cette information ne peut pas encore \xEAtre d\xE9termin\xE9e avec les \xE9l\xE9ments disponibles.",
        details: why,
        missingInformation,
        why: [
          "Les sources mod\xE9lis\xE9es ne suffisent pas pour conclure sur ce point."
        ],
        sourceRefs,
        ruleRefs
      };
  }
}

// lib/v4/localExplanation/explainDerivedValueLocal.ts
function explainDerivedValueLocal(calc) {
  if (!calc || calc.status === "unsupported") {
    if (calc?.status === "unsupported") {
      return {
        status: "unsupported",
        summary: "ExpliqueMoi ne dispose pas encore d\u2019une r\xE8gle suffisamment v\xE9rifi\xE9e pour expliquer ce point.",
        calculationExplanation: calc.explanation || null,
        calculation: null,
        details: [],
        missingInformation: [],
        why: [
          "Aucune formule verified ex\xE9cutable n\u2019a produit de r\xE9sultat pour ce sujet."
        ],
        sourceRefs: calc.sources || [],
        ruleRefs: calc.rule ? [
          {
            ruleId: calc.rule.ruleId,
            version: calc.rule.version,
            kind: "calculation",
            status: calc.rule.status,
            formulaId: calc.rule.formulaId
          }
        ] : [],
        derivedFacts: []
      };
    }
    return {
      status: null,
      summary: null,
      calculationExplanation: null,
      calculation: null,
      details: [],
      missingInformation: [],
      why: [],
      sourceRefs: [],
      ruleRefs: [],
      derivedFacts: []
    };
  }
  const ruleRefs = calc.rule ? [
    {
      ruleId: calc.rule.ruleId,
      version: calc.rule.version,
      kind: "calculation",
      status: calc.rule.status,
      formulaId: calc.rule.formulaId
    }
  ] : calc.formulaId ? [
    {
      ruleId: `calc:${calc.formulaId}`,
      formulaId: calc.formulaId,
      kind: "calculation"
    }
  ] : [];
  const derivedFacts = [];
  if (calc.status === "calculated" && calc.derivedValue) {
    derivedFacts.push({
      kind: "derived",
      id: calc.derivedValue.derivedId,
      label: "Valeur calcul\xE9e (d\xE9riv\xE9e)",
      value: calc.value != null ? `${calc.value}${calc.unit === "EUR" ? " \u20AC" : calc.unit ? ` ${calc.unit}` : ""}` : null,
      fieldCode: calc.fieldCode,
      documentId: null
    });
  }
  switch (calc.status) {
    case "calculated": {
      const valueLabel = calc.value != null ? `${calc.value}${calc.unit === "EUR" ? " \u20AC" : calc.unit ? ` ${calc.unit}` : ""}` : "\u2014";
      const versionNote = calc.rule?.version ? ` (formule ${calc.formulaId}, v${calc.rule.version})` : calc.formulaId ? ` (formule ${calc.formulaId})` : "";
      return {
        status: "explained",
        summary: `Valeur calcul\xE9e \xE0 partir des informations disponibles : ${valueLabel}.`,
        calculationExplanation: `Le moteur applique la formule v\xE9rifi\xE9e${versionNote}. ${calc.explanation}`,
        calculation: {
          status: calc.status,
          value: calc.value,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: `R\xE9sultat calcul\xE9 : ${valueLabel}`
        },
        details: [
          "Ce r\xE9sultat est une valeur d\xE9riv\xE9e, distincte du montant \xE9ventuellement lu dans le document.",
          ...calc.limits || []
        ],
        missingInformation: [],
        why: [
          "Un calcul d\xE9terministe a \xE9t\xE9 ex\xE9cut\xE9 \xE0 partir de faits disponibles et d\u2019une formule sourc\xE9e."
        ],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts
      };
    }
    case "needsInformation":
      return {
        status: "needsInformation",
        summary: "Une information suppl\xE9mentaire est n\xE9cessaire pour calculer cette valeur.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [],
        missingInformation: [...calc.missingInputs || []],
        why: ["Le calcul reste bloqu\xE9 tant qu\u2019un input n\xE9cessaire manque."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    case "conflicted":
      return {
        status: "conflicted",
        summary: "Les informations disponibles sont contradictoires.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [...calc.conflicts || []],
        missingInformation: [],
        why: ["Le moteur refuse de trancher un conflit d\u2019entr\xE9es."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    case "notApplicable":
      return {
        status: "notApplicable",
        summary: "Le calcul n\u2019est pas applicable selon les informations disponibles.",
        calculationExplanation: calc.explanation,
        calculation: {
          status: calc.status,
          value: null,
          unit: calc.unit,
          formulaId: calc.formulaId,
          version: calc.rule?.version || null,
          summary: calc.explanation
        },
        details: [],
        missingInformation: [],
        why: ["Les conditions de la formule ne sont pas r\xE9unies."],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
    default:
      return {
        status: "unsupported",
        summary: "ExpliqueMoi ne dispose pas encore d\u2019une r\xE8gle suffisamment v\xE9rifi\xE9e pour expliquer ce point.",
        calculationExplanation: calc.explanation,
        calculation: null,
        details: [],
        missingInformation: [],
        why: [],
        sourceRefs: calc.sources || [],
        ruleRefs,
        derivedFacts: []
      };
  }
}

// lib/v4/localExplanation/buildLocalExplanations.ts
function emptyLocalExplanationInvariants() {
  return {
    unsupportedExplanationPromoted: 0,
    unknownExplanationPromoted: 0,
    unsourcedExplanation: 0,
    explanationChangedFacts: 0,
    explanationPromotedToDeclaration: 0,
    explanationPromotedToEligibility: 0,
    implicitExplanationAggregation: 0
  };
}
var seq3 = 0;
function buildLocalExplanations(docCase) {
  const invariants = emptyLocalExplanationInvariants();
  const explanations = [];
  const factsFingerprint = JSON.stringify(
    (docCase.factIndex || []).map((f) => [f.factId, f.value, f.fieldCode])
  );
  const suggestedBefore = docCase.suggestedDeclaredAmount;
  const eligibilityBefore = docCase.eligibilityDecision;
  const subjects = [
    .../* @__PURE__ */ new Set([
      ...docCase.taxContext?.fieldCodesPresent || [],
      ...(docCase.caseCentricViews || []).map((v) => v.fieldCode),
      ...(docCase.calculationResults || []).map((r) => r.fieldCode),
      ...(docCase.applicabilityEvaluations || []).map((e) => e.fieldCode)
    ])
  ].map((c) => c.toUpperCase()).sort();
  for (const subject of subjects) {
    const view = (docCase.caseCentricViews || []).find(
      (v) => v.fieldCode.toUpperCase() === subject
    ) || null;
    const app = (docCase.applicabilityEvaluations || []).find(
      (e) => e.fieldCode.toUpperCase() === subject
    ) || view?.applicability || null;
    const calc = (docCase.calculationResults || []).find(
      (r) => r.fieldCode.toUpperCase() === subject
    ) || view?.calculation || null;
    const factsPart = collectSourceFactsForSubject({
      subject,
      facts: docCase.factIndex || [],
      userFacts: docCase.userAnswers || [],
      view
    });
    const appPart = explainApplicabilityLocal(app);
    const calcPart = explainDerivedValueLocal(calc);
    const title = view?.label || (subject === "4BE" ? "Revenus fonciers (micro-foncier)" : `Case ${subject}`);
    const status = mergeStatus(appPart.status, calcPart.status, factsPart);
    const details = [];
    if (factsPart.foundSummary) details.push(factsPart.foundSummary);
    details.push(...factsPart.details);
    if (view?.whatIsIt) {
      details.push(view.whatIsIt);
    }
    details.push(...appPart.details);
    details.push(...calcPart.details);
    const missingInformation = [
      ...appPart.missingInformation,
      ...calcPart.missingInformation
    ];
    const summary = buildSummary({
      status,
      subject,
      title,
      foundSummary: factsPart.foundSummary,
      appSummary: appPart.summary,
      calcSummary: calcPart.summary,
      whatIsIt: view?.whatIsIt || null
    });
    const sourceRefs = uniqueSources([
      ...appPart.sourceRefs,
      ...calcPart.sourceRefs,
      ...view?.officialSources || []
    ]);
    const ruleRefs = [...appPart.ruleRefs, ...calcPart.ruleRefs];
    const sourceFacts = [...factsPart.sourceFacts, ...calcPart.derivedFacts];
    const why = [
      ...factsPart.details.slice(0, 1),
      ...appPart.why,
      ...calcPart.why
    ];
    let sourceExplanation = null;
    if (sourceRefs.length) {
      sourceExplanation = `Sources utilis\xE9es : ${sourceRefs.map((s) => s.title).join(" ; ")}.`;
    } else if (status === "explained" && calcPart.status === "explained") {
      invariants.unsourcedExplanation += 1;
      sourceExplanation = "Aucune source officielle n\u2019est attach\xE9e \xE0 cette explication.";
    } else if (!sourceRefs.length && status === "explained" && !factsPart.sourceFacts.length) {
      invariants.unsourcedExplanation += 1;
    } else {
      sourceExplanation = sourceRefs.length ? null : "Les \xE9l\xE9ments pr\xE9sent\xE9s s\u2019appuient sur les faits du dossier et les r\xE8gles mod\xE9lis\xE9es disponibles.";
    }
    const limits = [
      "Cette explication ne modifie aucune information du dossier.",
      "Une valeur calcul\xE9e n\u2019est pas automatiquement un montant \xE0 d\xE9clarer.",
      "Cette explication ne constitue pas une d\xE9cision d\u2019\xE9ligibilit\xE9."
    ];
    const blob2 = [summary, ...details, calcPart.calculationExplanation || ""].join(
      " "
    );
    if (/vous devez déclarer|montant à reporter|vous êtes éligible|vous avez droit/i.test(
      blob2
    )) {
      invariants.explanationPromotedToDeclaration += 1;
      invariants.explanationPromotedToEligibility += 1;
    }
    if (status === "explained" && (app?.status === "unknown" || app?.status === "needsInformation")) {
      if (!factsPart.foundSummary) {
        invariants.unknownExplanationPromoted += 1;
      }
    }
    if (status === "explained" && calc?.status === "unsupported" && calcPart.status === "explained") {
      invariants.unsupportedExplanationPromoted += 1;
    }
    seq3 += 1;
    explanations.push({
      id: `lex-${subject}-${seq3}`,
      domain: "fiscal",
      subject,
      title,
      summary,
      details: [...new Set(details)].filter(Boolean),
      importance: calcPart.status === "explained" ? "primary" : "secondary",
      status,
      sourceFacts,
      ruleRefs,
      sourceRefs,
      taxYear: calc?.rule?.taxYear ?? (docCase.taxContext.yearsPresent.length === 1 ? docCase.taxContext.yearsPresent[0] : null),
      calculation: calcPart.calculation,
      calculationExplanation: calcPart.calculationExplanation,
      sourceExplanation,
      missingInformation: [...new Set(missingInformation)],
      why: [...new Set(why)].filter(Boolean),
      limits
    });
  }
  const factsFingerprintAfter = JSON.stringify(
    (docCase.factIndex || []).map((f) => [f.factId, f.value, f.fieldCode])
  );
  if (factsFingerprint !== factsFingerprintAfter) {
    invariants.explanationChangedFacts += 1;
  }
  if (docCase.suggestedDeclaredAmount !== suggestedBefore) {
    invariants.explanationPromotedToDeclaration += 1;
  }
  if (docCase.eligibilityDecision !== eligibilityBefore) {
    invariants.explanationPromotedToEligibility += 1;
  }
  if (docCase.suggestedDeclaredAmount != null) {
    invariants.explanationPromotedToDeclaration += 1;
  }
  if (docCase.eligibilityDecision != null) {
    invariants.explanationPromotedToEligibility += 1;
  }
  explanations.sort((a, b) => a.subject.localeCompare(b.subject));
  return { explanations, invariants };
}
function mergeStatus(appStatus, calcStatus, facts) {
  const ranks = {
    conflicted: 5,
    needsInformation: 4,
    notApplicable: 3,
    unsupported: 2,
    unknown: 1,
    explained: 0
  };
  let status = appStatus;
  if (calcStatus && ranks[calcStatus] > ranks[status]) {
    if (calcStatus === "unsupported" && facts.foundSummary && appStatus === "explained") {
      status = "explained";
    } else if (calcStatus === "unsupported" && facts.foundSummary && (appStatus === "unknown" || !facts.sourceFacts.length)) {
      status = "explained";
    } else {
      status = calcStatus;
    }
  }
  if (appStatus === "unknown" && (calcStatus == null || calcStatus === "unsupported") && facts.foundSummary) {
    return "explained";
  }
  if (appStatus === "unknown" && (calcStatus == null || calcStatus === "unsupported") && !facts.foundSummary) {
    return calcStatus === "unsupported" ? "unsupported" : "unknown";
  }
  return status;
}
function buildSummary(input) {
  if (input.status === "conflicted") {
    return "Les informations disponibles sont contradictoires.";
  }
  if (input.status === "needsInformation") {
    return "Une information suppl\xE9mentaire est n\xE9cessaire pour d\xE9terminer si cette r\xE8gle s\u2019applique ou pour calculer une valeur.";
  }
  if (input.status === "notApplicable") {
    return input.appSummary;
  }
  if (input.status === "unsupported" && !input.foundSummary) {
    return "ExpliqueMoi ne dispose pas encore d\u2019une r\xE8gle suffisamment v\xE9rifi\xE9e pour expliquer ce point.";
  }
  if (input.status === "unknown" && !input.foundSummary) {
    return "Cette information ne peut pas encore \xEAtre d\xE9termin\xE9e avec les \xE9l\xE9ments disponibles.";
  }
  const parts = [];
  if (input.foundSummary) parts.push(input.foundSummary);
  else if (input.whatIsIt) parts.push(input.whatIsIt);
  if (input.calcSummary && input.status === "explained") {
    parts.push(input.calcSummary);
  } else if (input.appSummary && input.status === "explained") {
    parts.push(input.appSummary);
  }
  return parts.join(" ") || input.appSummary;
}
function uniqueSources(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const s of list) {
    if (!s?.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}
function attachLocalExplanations(docCase) {
  const { explanations, invariants } = buildLocalExplanations(docCase);
  const bySubject = new Map(explanations.map((e) => [e.subject, e]));
  const views = (docCase.caseCentricViews || []).map((v) => ({
    ...v,
    localExplanation: bySubject.get(v.fieldCode.toUpperCase()) || null
  }));
  const existing = new Set(views.map((v) => v.fieldCode.toUpperCase()));
  for (const e of explanations) {
    if (existing.has(e.subject)) continue;
    if (!e.sourceFacts.length && !e.calculation && e.status === "unsupported") {
      continue;
    }
    views.push({
      fieldCode: e.subject,
      label: e.title,
      whatIsIt: e.summary,
      foundByDocument: [],
      toVerify: [...e.missingInformation],
      supportingDocuments: [],
      generalConditions: [],
      officialSources: [...e.sourceRefs],
      informationStatus: "missingInformation",
      priorityQuestions: [],
      applicability: (docCase.applicabilityEvaluations || []).find(
        (a) => a.fieldCode.toUpperCase() === e.subject
      ) || null,
      calculation: (docCase.calculationResults || []).find(
        (r) => r.fieldCode.toUpperCase() === e.subject
      ) || null,
      localExplanation: e,
      suggestedDeclaredAmount: null
    });
  }
  views.sort((a, b) => a.fieldCode.localeCompare(b.fieldCode));
  return {
    ...docCase,
    localExplanations: explanations,
    localExplanationInvariants: invariants,
    caseCentricViews: views,
    suggestedDeclaredAmount: null,
    eligibilityDecision: null
  };
}

// lib/v4/knowledge/fr/tax/case/buildDocumentCase.ts
function emptyInvariants() {
  return {
    crossDocumentFactLostProvenance: 0,
    crossDocumentUnsafeMerge: 0,
    crossDocumentUnsafeAggregation: 0,
    yearMismatchPromotedToStrong: 0,
    roleMismatchPromotedToStrong: 0,
    unknownDocumentPromotedToKnown: 0,
    duplicateDocumentDoubleCounted: 0,
    uploadOrderChangesConclusion: 0,
    removedDocumentFactSurvives: 0,
    candidateRelationPresentedAsCertain: 0,
    userAnswerPromotedToOfficialKnowledge: 0,
    knowledgePromotedToUserFact: 0,
    automaticUnsafeAggregation: 0,
    missingPresentedAsUserDoesNotHave: 0,
    unsupportedTaxAmount: 0,
    unsupportedEligibilityDecision: 0
  };
}
function statusLabelFr2(status) {
  switch (status) {
    case "found":
      return "Information retrouv\xE9e dans les documents actuellement analys\xE9s";
    case "missing":
      return "Information non retrouv\xE9e dans les documents actuellement analys\xE9s";
    case "ambiguous":
      return "Information ambigu\xEB entre plusieurs documents \u2014 \xE0 v\xE9rifier";
    case "notChecked":
      return "Information non encore confront\xE9e au dossier";
    default:
      return "Statut inconnu";
  }
}
function recognitionLabel(inst) {
  if (inst.detectedReference && inst.confidence >= 0.55) {
    return inst.detectedReference;
  }
  if (inst.detectedType && /invoice|facture/i.test(inst.detectedType)) {
    return "Document non fiscal / facture";
  }
  if (!inst.detectedType || inst.detectedType === "unknown" || inst.detectedType === "unknownTaxDocument" || inst.confidence < 0.45) {
    return "Type de document non identifi\xE9 avec certitude";
  }
  return inst.detectedType;
}
function buildDocumentCase(inputs, options = {}) {
  if (options.resetIds) resetRequirementFactIdsForTests();
  const invariants = emptyInvariants();
  const userAnswers = options.userAnswers || [];
  const prepared = inputs.map((input, idx) => {
    const text = input.text || "";
    const contentHash = hashDocumentContent(text);
    return { input, text, contentHash, idx };
  });
  prepared.sort(
    (a, b) => a.contentHash.localeCompare(b.contentHash) || String(a.input.fileName || "").localeCompare(String(b.input.fileName || "")) || a.idx - b.idx
  );
  const hashOccurrence = /* @__PURE__ */ new Map();
  const seeds = prepared.map((p) => {
    const occ = hashOccurrence.get(p.contentHash) || 0;
    hashOccurrence.set(p.contentHash, occ + 1);
    const documentId = p.input.documentId || buildDocumentId(p.contentHash, occ);
    return {
      documentId,
      text: p.text,
      fileName: p.input.fileName || null,
      contentHash: p.contentHash
    };
  });
  const caseId = buildCaseId(seeds.map((s) => s.contentHash));
  const analyzed = seeds.map((seed) => {
    const result = analyzeDocumentV4({
      text: seed.text,
      fiscalKnowledge: true
    });
    const kn = result.fiscalKnowledge;
    const primary = kn?.primaryIdentity;
    const ref = primary?.role === "documentIdentity" ? primary.normalized : kn?.detectedReferences?.find((r) => r.role === "documentIdentity")?.normalized || null;
    let fiscalYear = null;
    const yearMatch = seed.text.match(
      /(?:revenus?\s+de\s+l['’]?année|année)\s*(20\d{2})/i
    );
    if (yearMatch) fiscalYear = Number(yearMatch[1]);
    else {
      const bare = seed.text.match(/\b(202[4-6])\b/);
      if (bare) fiscalYear = Number(bare[1]);
    }
    const detectedType = result.classification.primary || kn?.suggestedDocumentType || null;
    let detectedReference = ref;
    if (!detectedReference && /facture|invoice/i.test(seed.text) && /7DB|1AJ/.test(seed.text)) {
      detectedReference = null;
    }
    const confidence = Math.max(
      result.classification.confidence?.score ?? 0,
      typeof primary?.confidence === "number" ? primary.confidence : 0
    );
    return {
      seed,
      result,
      kn,
      detectedType,
      detectedReference,
      fiscalYear,
      confidence,
      detectedFields: kn?.detectedFields || [],
      fieldExplanations: kn?.fieldExplanations || []
    };
  });
  const dupMap = assessDuplicates(
    analyzed.map((a) => ({
      documentId: a.seed.documentId,
      text: a.seed.text,
      fileName: a.seed.fileName,
      detectedReference: a.detectedReference,
      detectedFields: a.detectedFields.map((f) => ({
        normalizedCode: f.normalizedCode,
        detectedValue: f.detectedValue
      }))
    }))
  );
  const documents = analyzed.map((a) => {
    const dup = dupMap.get(a.seed.documentId);
    const label = a.seed.fileName || a.detectedReference || "Document";
    const facts = buildDocumentFactIndex([
      {
        id: a.seed.documentId,
        label,
        documentType: a.detectedType,
        year: a.fiscalYear,
        text: a.seed.text,
        detectedFields: a.detectedFields
      }
    ]);
    for (const f of facts) {
      if (!f.sourceDocumentId) {
        invariants.crossDocumentFactLostProvenance += 1;
        f.sourceDocumentId = a.seed.documentId;
      }
    }
    if (!a.detectedReference && a.detectedType === "unknown" && /2042|2044/.test(a.seed.fileName || "")) {
    }
    const inst = {
      documentId: a.seed.documentId,
      fileName: a.seed.fileName,
      contentHash: dup.contentHash,
      detectedType: a.detectedType,
      detectedReference: a.detectedReference,
      fiscalYear: a.fiscalYear,
      documentYear: a.fiscalYear,
      confidence: a.confidence,
      recognitionLabel: recognitionLabel({
        detectedReference: a.detectedReference,
        detectedType: a.detectedType,
        confidence: a.confidence
      }),
      text: a.seed.text,
      facts,
      detectedFields: a.detectedFields,
      fieldExplanations: a.fieldExplanations,
      duplicateOf: dup.duplicateOf,
      duplicateStatus: dup.duplicateStatus,
      isPrimaryCopy: dup.isPrimaryCopy,
      provenance: a.kn?.fieldExplanations?.[0]?.provenance || []
    };
    if (inst.recognitionLabel !== "Type de document non identifi\xE9 avec certitude" && !inst.detectedReference && !inst.detectedType && inst.confidence < 0.4) {
      invariants.unknownDocumentPromotedToKnown += 1;
    }
    return inst;
  });
  const factIndex = [];
  for (const d of documents) {
    if (!d.isPrimaryCopy && d.duplicateStatus === "possibleDuplicate") {
      continue;
    }
    factIndex.push(...d.facts);
  }
  const factKeys = /* @__PURE__ */ new Set();
  for (const f of factIndex) {
    const key = `${f.sourceDocumentId}|${f.factType}|${f.fieldCode}|${f.displayValue}`;
    if (factKeys.has(key) && f.factType === "fieldValue") {
    }
    factKeys.add(key);
  }
  const dupDocs = documents.filter(
    (d) => d.duplicateStatus === "possibleDuplicate" && !d.isPrimaryCopy
  );
  for (const d of dupDocs) {
    const leaked = factIndex.some((f) => f.sourceDocumentId === d.documentId);
    if (leaked) invariants.duplicateDocumentDoubleCounted += 1;
  }
  const relations = buildDocumentRelations(documents);
  for (const r of relations) {
    if (r.confidence >= 0.9 && r.relationType.startsWith("possible")) {
      invariants.candidateRelationPresentedAsCertain += 1;
      r.confidence = Math.min(r.confidence, 0.75);
      invariants.candidateRelationPresentedAsCertain -= 1;
    }
  }
  const conflicts = detectFactConflicts(documents, factIndex);
  const reqRegistry = loadFrenchTaxFieldRequirementsRegistry();
  const yearsPresent = [
    ...new Set(
      documents.map((d) => d.fiscalYear).filter((y) => y != null)
    )
  ].sort();
  const targetYear = yearsPresent.length === 1 ? yearsPresent[0] : null;
  const fieldCodesPresent = [
    ...new Set(
      documents.flatMap((d) => d.detectedFields.map((f) => f.normalizedCode))
    )
  ].sort();
  const requirementMatches = [];
  let candidateMatches = 0;
  let strongMatches = 0;
  let ambiguousMatches = 0;
  let rejectedMatches = 0;
  for (const entry of reqRegistry.entries) {
    const relevant = fieldCodesPresent.includes(entry.normalizedCode) || documents.some(
      (d) => (entry.possibleSupportingDocuments || []).some(
        (s) => s.documentTypeHints.some(
          (h) => (d.detectedType || "").toLowerCase().includes(h.toLowerCase())
        )
      )
    ) || documents.some(
      (d) => entry.documentRefs.some((r) => d.detectedReference === r)
    );
    if (!relevant && documents.length > 0) {
      const formHit = documents.some(
        (d) => entry.documentRefs.some(
          (r) => d.detectedReference === r || (d.text || "").includes(entry.normalizedCode)
        )
      );
      if (!formHit) continue;
    }
    const expectedRole = entry.normalizedCode === "1AJ" ? "declarant1" : entry.normalizedCode === "1BJ" ? "declarant2" : null;
    for (const req2 of entry.informationRequirements) {
      const scored = findCandidateFactsForRequirementInCase(
        req2,
        factIndex,
        { targetYear, expectedRole }
      );
      if (scored.verdict === "strong") strongMatches += 1;
      else if (scored.verdict === "candidate") candidateMatches += 1;
      else if (scored.verdict === "ambiguous") ambiguousMatches += 1;
      else rejectedMatches += 1;
      if (scored.yearRelation === "yearMismatch" && scored.verdict === "strong") {
        invariants.yearMismatchPromotedToStrong += 1;
      }
      const agg = refuseUnsafeAggregation(scored.matches.map((m) => m.fact));
      if (agg.aggregatedValue != null) {
        invariants.crossDocumentUnsafeAggregation += 1;
        invariants.automaticUnsafeAggregation += 1;
      }
      const label = statusLabelFr2(scored.status);
      if (/vous n['’]avez pas|vous ne possédez pas/i.test(label)) {
        invariants.missingPresentedAsUserDoesNotHave += 1;
      }
      requirementMatches.push({
        requirementId: req2.id,
        fieldCode: entry.normalizedCode,
        status: scored.status,
        statusLabel: label,
        verdict: scored.verdict,
        candidateFacts: scored.matches.map((m) => m.fact),
        evidenceLinks: scored.matches.map((m) => ({
          requirementId: req2.id,
          factId: m.fact.factId,
          confidence: m.breakdown.fieldEvidenceMatch + m.breakdown.factTypeMatch + m.breakdown.yearMatch,
          evidence: m.fact.evidence || [],
          matchReason: m.breakdown.contributions.map((c) => c.note).join("+") || m.verdict,
          status: m.verdict === "strong" ? "strong" : m.verdict === "ambiguous" ? "ambiguous" : "candidate"
        })),
        scoreBreakdowns: scored.matches.map((m) => ({
          factId: m.fact.factId,
          documentId: m.fact.sourceDocumentId,
          breakdown: m.breakdown,
          verdict: m.verdict
        })),
        aggregatedValue: null,
        yearRelation: scored.yearRelation
      });
    }
  }
  const fieldAssistance = [];
  const codesForAssist = [
    .../* @__PURE__ */ new Set([
      ...fieldCodesPresent.filter(
        (c) => reqRegistry.entries.some((e) => e.normalizedCode === c)
      ),
      ...reqRegistry.entries.filter(
        (e) => documents.some(
          (d) => e.documentRefs.some((r) => d.detectedReference === r)
        )
      ).map((e) => e.normalizedCode)
    ])
  ].sort();
  for (const code of codesForAssist) {
    const detected = documents.flatMap((d) => d.detectedFields).find((f) => f.normalizedCode === code);
    const expl = documents.flatMap((d) => d.fieldExplanations).find((e) => e.fieldCode === code);
    const assist = buildTaxFieldAssistance({
      fieldCode: code,
      documentRef: documents.find((d) => d.detectedReference)?.detectedReference || null,
      year: targetYear,
      detected: detected || null,
      explanation: expl || null,
      documents: documents.filter((d) => d.isPrimaryCopy || d.duplicateStatus !== "possibleDuplicate").map((d) => ({
        id: d.documentId,
        label: d.fileName || d.detectedReference || d.documentId,
        documentType: d.detectedType,
        year: d.fiscalYear,
        text: d.text,
        detectedFields: d.detectedFields
      })),
      preindexedFacts: factIndex,
      userAnswers: userAnswers.map((u) => ({
        requirementId: u.requirementId,
        answer: u.answer
      }))
    });
    assist.suggestedDeclaredAmount = null;
    assist.eligibilityDecision = null;
    for (const e of assist.evaluatedRequirements) {
      e.aggregatedValue = null;
    }
    invariants.knowledgePromotedToUserFact += assist.invariants.knowledgePromotedToUserFact;
    invariants.automaticUnsafeAggregation += assist.invariants.automaticUnsafeAggregation;
    invariants.unsupportedTaxAmount += assist.invariants.unsupportedTaxAmount;
    invariants.unsupportedEligibilityDecision += assist.invariants.unsupportedEligibilityDecision;
    fieldAssistance.push(assist);
  }
  for (const ua of userAnswers) {
    if (ua.kind !== "user") {
      invariants.userAnswerPromotedToOfficialKnowledge += 1;
    } else if (ua.source !== "user" && ua.source !== "clarification") {
      invariants.userAnswerPromotedToOfficialKnowledge += 1;
    }
  }
  for (const removedId of options.removedDocumentIds || []) {
    if (factIndex.some((f) => f.sourceDocumentId === removedId)) {
      invariants.removedDocumentFactSurvives += 1;
    }
    if (documents.some((d) => d.documentId === removedId)) {
      invariants.removedDocumentFactSurvives += 1;
    }
  }
  let caseCentricViews = buildCaseCentricViews(
    fieldAssistance,
    documents,
    requirementMatches
  );
  const documentCentricViews = buildDocumentCentricViews(documents, relations);
  const ambiguities = [];
  for (const c of conflicts) ambiguities.push(c.description);
  for (const m of requirementMatches) {
    if (m.status === "ambiguous") {
      ambiguities.push(
        `Ambigu\xEFt\xE9 sur ${m.fieldCode} / ${m.requirementId} \u2014 plusieurs \xE9l\xE9ments candidats.`
      );
    }
  }
  const primaryReferences = [
    ...new Set(
      documents.map((d) => d.detectedReference).filter((r) => Boolean(r))
    )
  ].sort();
  const draft = {
    caseId,
    documents,
    factIndex,
    relations,
    ambiguities: [...new Set(ambiguities)],
    conflicts,
    requirementMatches,
    fieldAssistance,
    caseCentricViews,
    documentCentricViews,
    userAnswers,
    metrics: {
      documents: documents.length,
      facts: factIndex.length,
      requirements: requirementMatches.length,
      candidateMatches,
      strongMatches,
      ambiguousMatches,
      rejectedMatches,
      relations: relations.length,
      conflicts: conflicts.length
    },
    taxContext: {
      primaryReferences,
      yearsPresent,
      fieldCodesPresent
    },
    provenance: fieldAssistance.flatMap((a) => a.provenance).slice(0, 12),
    suggestedDeclaredAmount: null,
    eligibilityDecision: null,
    invariants
  };
  const app = evaluateDocumentCaseApplicability(draft);
  const draftWithApp = {
    ...draft,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants
  };
  const calc = evaluateDocumentCaseCalculations(draftWithApp);
  caseCentricViews = caseCentricViews.map((v) => ({
    ...v,
    applicability: app.evaluations.find((e) => e.fieldCode === v.fieldCode) || null,
    calculation: calc.results.find((r) => r.fieldCode === v.fieldCode) || null
  }));
  const withCalc = {
    ...draftWithApp,
    caseCentricViews,
    calculationResults: calc.results,
    calculationInvariants: calc.invariants,
    calculationMetrics: calc.metrics,
    suggestedDeclaredAmount: null
  };
  return attachLocalExplanations(withCalc);
}
function buildCaseCentricViews(assistance, documents, matches) {
  return assistance.map((a) => {
    const byDoc = /* @__PURE__ */ new Map();
    for (const f of a.candidateFacts) {
      const id = f.sourceDocumentId || "unknown";
      const list = byDoc.get(id) || [];
      if (f.displayValue) {
        list.push(
          f.fieldCode ? `case ${f.fieldCode} : ${f.displayValue}` : `montant / info candidat : ${f.displayValue}`
        );
      } else if (f.year) {
        list.push(`ann\xE9e : ${f.year}`);
      } else {
        list.push(f.provenanceNote || f.factType);
      }
      byDoc.set(id, list);
    }
    for (const d of documents) {
      for (const field3 of d.detectedFields) {
        if (field3.normalizedCode !== a.fieldCode) continue;
        const list = byDoc.get(d.documentId) || [];
        list.push(
          field3.presence === "presentWithValue" ? `case ${field3.normalizedCode} d\xE9tect\xE9e${field3.detectedValue ? ` : ${field3.detectedValue}` : ""}` : `case ${field3.normalizedCode} d\xE9tect\xE9e`
        );
        byDoc.set(d.documentId, list);
      }
    }
    const toVerify = [
      ...a.ambiguousRequirements.map((r) => r.label),
      ...matches.filter((m) => m.fieldCode === a.fieldCode && m.status === "ambiguous").map((m) => `relation / ${m.requirementId}`)
    ];
    return {
      fieldCode: a.fieldCode,
      label: a.knowledge.label,
      whatIsIt: a.knowledge.plainLanguageWhat || a.knowledge.whatIsIt,
      foundByDocument: [...byDoc.entries()].map(([documentId, notes]) => ({
        documentId,
        fileName: documents.find((d) => d.documentId === documentId)?.fileName || null,
        notes: [...new Set(notes)]
      })),
      toVerify: [...new Set(toVerify)],
      supportingDocuments: a.supportingDocuments,
      generalConditions: a.generalConditions.map((c) => c.statement),
      officialSources: a.provenance.filter((p) => p.url).slice(0, 4).map((p) => ({ title: p.title || "Source officielle", url: p.url })),
      informationStatus: a.informationStatus,
      priorityQuestions: a.priorityQuestions,
      suggestedDeclaredAmount: null
    };
  });
}
function buildDocumentCentricViews(documents, relations) {
  return documents.map((d) => {
    const linked = relations.filter(
      (r) => r.fromDocumentId === d.documentId || r.toDocumentId === d.documentId
    ).filter((r) => r.fieldCodeHint || r.relationType === "possibleFieldEvidence").map((r) => ({
      fieldCode: r.fieldCodeHint || "\u2014",
      relationType: r.relationType,
      reason: r.reason,
      confidence: r.confidence
    }));
    let duplicateMessage = null;
    if (d.duplicateStatus === "possibleDuplicate") {
      duplicateMessage = "Ce document semble d\xE9j\xE0 pr\xE9sent dans le dossier.";
    } else if (d.duplicateStatus === "possibleVersion") {
      duplicateMessage = "Ce document ressemble \xE0 un autre sans \xEAtre identique \u2014 les deux sont conserv\xE9s.";
    }
    return {
      documentId: d.documentId,
      fileName: d.fileName,
      detectedType: d.detectedType,
      detectedReference: d.detectedReference,
      year: d.fiscalYear,
      recognitionLabel: d.recognitionLabel,
      confidence: d.confidence,
      detectedFacts: d.facts.filter((f) => f.displayValue).slice(0, 8).map((f) => ({
        label: f.fieldCode || f.factType,
        value: f.displayValue || String(f.value ?? "")
      })),
      potentiallyLinkedTo: linked,
      duplicateStatus: d.duplicateStatus,
      duplicateMessage
    };
  });
}
function assertUploadOrderStable(inputsA, inputsB) {
  const caseA = buildDocumentCase(inputsA, { resetIds: true });
  const caseB = buildDocumentCase(inputsB, { resetIds: true });
  const sig = (c) => JSON.stringify({
    caseId: c.caseId,
    refs: c.taxContext.primaryReferences,
    fields: c.taxContext.fieldCodesPresent,
    years: c.taxContext.yearsPresent,
    matchStatuses: c.requirementMatches.map((m) => [
      m.requirementId,
      m.status,
      m.verdict
    ]),
    conflictKinds: c.conflicts.map((x) => x.kind).sort(),
    relationTypes: c.relations.map((r) => r.relationType).sort(),
    suggested: c.suggestedDeclaredAmount,
    applicability: (c.applicabilityEvaluations || []).map((e) => [
      e.fieldCode,
      e.status,
      e.ruleId
    ])
  });
  const ok = sig(caseA) === sig(caseB);
  return { ok, uploadOrderChangesConclusion: ok ? 0 : 1 };
}

// lib/v4/knowledge/fr/tax/case/audit.ts
function auditDocumentCase(docCase) {
  const documentsWithoutId = [];
  const factsWithoutDocumentId = [];
  const relationsWithoutEvidence = [];
  const matchesWithoutReason = [];
  const lostProvenance = [];
  const duplicateDoubleCount = [];
  const yearIncompatibleStrong = [];
  const roleIncompatibleStrong = [];
  const invalidRelations = [];
  const orphanFacts = [];
  const orphanRelations = [];
  const unsafeAggregation = [];
  const unsupportedCertainty = [];
  const invariantViolations = [];
  const docIds = new Set(docCase.documents.map((d) => d.documentId));
  for (const d of docCase.documents) {
    if (!d.documentId) documentsWithoutId.push(d.fileName || "?");
  }
  for (const f of docCase.factIndex) {
    if (!f.sourceDocumentId) {
      factsWithoutDocumentId.push(f.factId);
      lostProvenance.push(f.factId);
    } else if (!docIds.has(f.sourceDocumentId)) {
      orphanFacts.push(f.factId);
    }
  }
  for (const r of docCase.relations) {
    if (!r.evidence?.length) relationsWithoutEvidence.push(r.relationId);
    if (!r.reason?.trim()) invalidRelations.push(`${r.relationId}:no_reason`);
    if (!docIds.has(r.fromDocumentId) || !docIds.has(r.toDocumentId)) {
      orphanRelations.push(r.relationId);
    }
    if (r.relationType.startsWith("possible") && r.confidence >= 0.95 && !/potentiel/i.test(r.reason)) {
      unsupportedCertainty.push(r.relationId);
    }
  }
  for (const m of docCase.requirementMatches) {
    for (const link of m.evidenceLinks) {
      if (!link.matchReason?.trim()) {
        matchesWithoutReason.push(`${m.requirementId}:${link.factId}`);
      }
    }
    if (m.aggregatedValue != null) {
      unsafeAggregation.push(m.requirementId);
    }
    if (m.yearRelation === "yearMismatch" && m.verdict === "strong") {
      yearIncompatibleStrong.push(m.requirementId);
    }
    for (const sb of m.scoreBreakdowns) {
      if (sb.verdict === "strong" && sb.breakdown.rejectReasons.some((x) => x.includes("roleMismatch"))) {
        roleIncompatibleStrong.push(m.requirementId);
      }
    }
  }
  const nonPrimary = docCase.documents.filter(
    (d) => d.duplicateStatus === "possibleDuplicate" && !d.isPrimaryCopy
  );
  for (const d of nonPrimary) {
    if (docCase.factIndex.some((f) => f.sourceDocumentId === d.documentId)) {
      duplicateDoubleCount.push(d.documentId);
    }
  }
  if (docCase.suggestedDeclaredAmount != null) {
    unsafeAggregation.push("suggestedDeclaredAmount");
  }
  for (const [k, v] of Object.entries(docCase.invariants)) {
    if (typeof v === "number" && v > 0) {
      invariantViolations.push(`${k}=${v}`);
    }
  }
  const ok = documentsWithoutId.length === 0 && factsWithoutDocumentId.length === 0 && relationsWithoutEvidence.length === 0 && matchesWithoutReason.length === 0 && lostProvenance.length === 0 && duplicateDoubleCount.length === 0 && yearIncompatibleStrong.length === 0 && roleIncompatibleStrong.length === 0 && invalidRelations.length === 0 && orphanFacts.length === 0 && orphanRelations.length === 0 && unsafeAggregation.length === 0 && unsupportedCertainty.length === 0 && invariantViolations.length === 0;
  return {
    ok,
    documentsWithoutId,
    factsWithoutDocumentId,
    relationsWithoutEvidence,
    matchesWithoutReason,
    lostProvenance,
    duplicateDoubleCount,
    yearIncompatibleStrong,
    roleIncompatibleStrong,
    invalidRelations,
    orphanFacts,
    orphanRelations,
    unsafeAggregation,
    unsupportedCertainty,
    invariantViolations
  };
}

// lib/v4/knowledge/fr/tax/case/safety.ts
function checkDocumentCaseSafety(docCase) {
  const violations = [];
  const audit = auditDocumentCase(docCase);
  if (!audit.ok) {
    for (const [k, v] of Object.entries(audit)) {
      if (k === "ok") continue;
      if (Array.isArray(v) && v.length) violations.push(`${k}:${v.length}`);
    }
  }
  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
  }
  for (const m of docCase.requirementMatches) {
    if (m.aggregatedValue != null) violations.push(`agg:${m.requirementId}`);
  }
  for (const view of docCase.caseCentricViews) {
    if (view.suggestedDeclaredAmount != null) {
      violations.push(`viewAgg:${view.fieldCode}`);
    }
    const blob2 = JSON.stringify(view);
    if (/reportez|vous devez déclarer|éligible|additionnez/i.test(blob2)) {
      violations.push(`forbiddenTone:${view.fieldCode}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

// lib/v4/knowledge/fr/tax/clarification/parseAnswer.ts
var UNKNOWN_RE = /^(je\s+ne\s+sais\s+pas|je\s+sais\s+pas|jsp|inconnu|aucune\s+id[eé]e|ne\s+sais\s+pas)$/i;
var REFUSED_RE = /^(je\s+pr[eé]f[eè]re\s+ne\s+pas\s+r[eé]pondre|passer|skip|passer\s+cette\s+question)$/i;
var YES_RE = /^(oui|yes|o|y|true|vrai)$/i;
var NO_RE = /^(non|no|n|false|faux)$/i;
function parseClarificationAnswer(raw, expected) {
  const rawAnswer = String(raw ?? "");
  const trimmed = rawAnswer.trim();
  const notes = [];
  if (!trimmed) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "unanswered",
      parseNotes: ["empty"]
    };
  }
  if (UNKNOWN_RE.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: "unknown",
      status: "unknown",
      parseNotes: ["explicit_unknown"]
    };
  }
  if (REFUSED_RE.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: "refused",
      status: "refused",
      parseNotes: ["explicit_refusal"]
    };
  }
  if (/environ|approx|~|vers\s+\d|environ\s+\d/i.test(trimmed)) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "ambiguous",
      parseNotes: ["approximate_language"]
    };
  }
  switch (expected) {
    case "amount":
    case "decimal":
      return parseAmount2(rawAnswer, trimmed, expected, notes);
    case "integer":
    case "year": {
      const n = Number(trimmed.replace(/\s/g, ""));
      if (!Number.isInteger(n)) {
        return invalid(rawAnswer, expected, ["not_integer"]);
      }
      if (expected === "year" && (n < 1990 || n > 2100)) {
        return invalid(rawAnswer, expected, ["year_out_of_range"]);
      }
      return {
        rawAnswer,
        normalizedValue: n,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
    }
    case "boolean":
    case "yesNo": {
      if (YES_RE.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: true,
          valueType: expected,
          status: "accepted",
          parseNotes: ["yes"]
        };
      }
      if (NO_RE.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: false,
          valueType: expected,
          status: "accepted",
          parseNotes: ["no"]
        };
      }
      if (/^aucun(e)?$/i.test(trimmed)) {
        return {
          rawAnswer,
          normalizedValue: null,
          valueType: expected,
          status: "ambiguous",
          parseNotes: ["aucun_not_safe_boolean"]
        };
      }
      return invalid(rawAnswer, expected, ["not_boolean"]);
    }
    case "declarant": {
      const map = {
        "1": "declarant1",
        "d\xE9clarant 1": "declarant1",
        "declarant 1": "declarant1",
        "declarant1": "declarant1",
        "2": "declarant2",
        "d\xE9clarant 2": "declarant2",
        "declarant 2": "declarant2",
        "declarant2": "declarant2",
        foyer: "household",
        "foyer fiscal": "household"
      };
      const key = trimmed.toLowerCase();
      if (map[key]) {
        return {
          rawAnswer,
          normalizedValue: map[key],
          valueType: "declarant",
          status: "accepted",
          parseNotes: ["declarant_mapped"]
        };
      }
      return invalid(rawAnswer, expected, ["unknown_declarant"]);
    }
    case "choice":
    case "text":
    case "document":
    case "date":
      return {
        rawAnswer,
        normalizedValue: trimmed,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
    default:
      return {
        rawAnswer,
        normalizedValue: trimmed,
        valueType: expected,
        status: "accepted",
        parseNotes: notes
      };
  }
}
function parseAmount2(rawAnswer, trimmed, expected, notes) {
  if (/^\d{1,3}\.\d{3}(\.\d{3})*$/.test(trimmed.replace(/\s/g, "").replace(/€/g, ""))) {
    return {
      rawAnswer,
      normalizedValue: null,
      valueType: expected,
      status: "ambiguous",
      parseNotes: ["dot_thousands_ambiguous_fr"]
    };
  }
  const cleaned = trimmed.replace(/\s/g, "").replace(/€/g, "").replace(/\u00a0/g, "");
  const fr = cleaned.replace(/(\d),(\d{2})$/, "$1.$2");
  if (!/^-?\d+([.,]\d+)?$/.test(fr.replace(/\./g, (m, off, s) => {
    return m;
  })) && !/^-?\d+$/.test(cleaned.replace(",", ""))) {
  }
  const normalized = fr.includes(",") && !fr.match(/,\d{2}$/) ? null : Number(fr.replace(",", "."));
  if (normalized == null || !Number.isFinite(normalized)) {
    const digits = cleaned.replace(/[^\d.,-]/g, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
      return {
        rawAnswer,
        normalizedValue: null,
        valueType: expected,
        status: "ambiguous",
        parseNotes: ["dot_thousands_ambiguous_fr"]
      };
    }
    const n2 = Number(digits.replace(",", "."));
    if (!Number.isFinite(n2)) {
      return invalid(rawAnswer, expected, ["not_amount"]);
    }
    notes.push("amount_parsed");
    return {
      rawAnswer,
      normalizedValue: n2,
      valueType: expected,
      status: "accepted",
      parseNotes: notes
    };
  }
  notes.push("amount_parsed");
  return {
    rawAnswer,
    normalizedValue: normalized,
    valueType: expected,
    status: "accepted",
    parseNotes: notes
  };
}
function invalid(rawAnswer, expected, notes) {
  return {
    rawAnswer,
    normalizedValue: null,
    valueType: expected,
    status: "invalid",
    parseNotes: notes
  };
}

// lib/v4/knowledge/fr/tax/clarification/selectNextQuestion.ts
var PRIORITY_WEIGHT = {
  ambiguity: 100,
  blocking: 90,
  declarantUnknown: 80,
  yearUnknown: 70,
  supportingDocument: 40,
  secondary: 20
};
var DEFAULT_MAX_ASKED = 2;
function selectNextClarificationQuestion(session, docCase, options) {
  const focus = options?.focusFieldCode || null;
  const candidates = session.questions.filter((q) => isAskable(q, session)).filter((q) => !focus || q.fieldCode === focus).map((q) => scoreQuestion(q, docCase, session)).sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return (a.requirementId || "").localeCompare(b.requirementId || "") || (a.fieldCode || "").localeCompare(b.fieldCode || "") || a.questionId.localeCompare(b.questionId);
  });
  return candidates[0] || null;
}
function isAskable(q, session) {
  if (q.status === "answered" || q.status === "resolved" || q.status === "superseded" || q.status === "notApplicable" || q.status === "refused") {
    return false;
  }
  if (q.status === "unknown") {
    return false;
  }
  if (q.askedCount >= (q.maxAskedCount || DEFAULT_MAX_ASKED)) {
    return false;
  }
  if (q.dependsOnQuestionId) {
    const dep = session.questions.find(
      (x) => x.questionId === q.dependsOnQuestionId
    );
    if (!dep || dep.status !== "answered") return false;
    const ans = session.answers.filter((a) => a.questionId === dep.questionId).sort((a, b) => b.sequence - a.sequence)[0];
    if (ans && ans.normalizedValue === false) {
      return false;
    }
  }
  return q.status === "unasked" || q.status === "asked" || q.status === "invalid" || q.status === "ambiguous";
}
function scoreQuestion(q, docCase, _session) {
  const reasons = [];
  let score = PRIORITY_WEIGHT[q.priority] || 10;
  const present = new Set(docCase.taxContext.fieldCodesPresent || []);
  const match = docCase.requirementMatches.find(
    (m) => m.requirementId === q.requirementId
  );
  if (match?.status === "ambiguous") {
    score += 50;
    reasons.push("blocking_ambiguity");
  }
  if (match?.status === "missing" && (q.priority === "blocking" || q.expectedAnswerType === "amount")) {
    score += 40;
    reasons.push("missing_required");
  }
  if (q.priority === "declarantUnknown" || /role|déclarant/i.test(q.requirementId)) {
    const fieldPresent = q.fieldCode ? present.has(q.fieldCode) : false;
    const fieldMatches = docCase.requirementMatches.filter(
      (m) => m.fieldCode === q.fieldCode && m.status === "ambiguous"
    );
    const multiAmount = fieldPresent && (docCase.factIndex.filter(
      (f) => f.fieldCode === q.fieldCode && (f.factType === "amount" || f.factType === "fieldValue") && f.displayValue != null
    ).length > 1 || fieldMatches.length > 0);
    if (multiAmount) {
      score += 55;
      reasons.push("role_resolves_ambiguity");
    } else if (!fieldPresent) {
      score -= 60;
      reasons.push("role_field_not_in_case");
    }
  }
  if (q.priority === "yearUnknown") {
    score += 25;
    reasons.push("year_needed");
  }
  if (q.fieldCode && present.has(q.fieldCode)) {
    score += 30;
    reasons.push("field_present_in_case");
  } else if (q.fieldCode && present.size > 0) {
    score -= 45;
    reasons.push("field_not_currently_examined");
  }
  if (match?.evidenceSource === "foundInDocument" || match?.status === "found" && match.verdict === "strong") {
    score -= 100;
    reasons.push("already_found_in_document");
  }
  if (match?.evidenceSource === "providedByUser") {
    score -= 100;
    reasons.push("already_provided_by_user");
  }
  reasons.push(`base_priority:${q.priority}`);
  return {
    ...q,
    priorityScore: score,
    priorityReasons: reasons
  };
}

// lib/v4/knowledge/fr/tax/clarification/buildClarificationState.ts
import { createHash as createHash2 } from "node:crypto";
function emptyClarificationInvariants() {
  return {
    userFactPromotedToDocumentFact: 0,
    userFactPromotedToOfficialKnowledge: 0,
    unknownPromotedToKnown: 0,
    refusedPromotedToNegative: 0,
    invalidAnswerAccepted: 0,
    ambiguousAnswerPromotedToCertain: 0,
    userDocumentConflictAutoResolved: 0,
    userUserConflictLost: 0,
    crossYearAnswerPromoted: 0,
    crossRoleAnswerPromoted: 0,
    clarificationLoopDetected: 0,
    questionRepeatedAfterRefusal: 0,
    questionRepeatedAfterUnknownImmediately: 0,
    uploadOrderChangesQuestion: 0,
    automaticUnsafeAggregation: 0,
    unsupportedEligibilityDecision: 0,
    missingProvenance: 0
  };
}
function mapAnswerType(t) {
  switch (t) {
    case "amount":
    case "year":
    case "text":
    case "document":
    case "declarant":
    case "yesNo":
      return t;
    default:
      return "text";
  }
}
function questionId(caseId, requirementId, fieldCode) {
  const h = createHash2("sha256").update(`${caseId}|${requirementId}|${fieldCode || ""}`).digest("hex").slice(0, 12);
  return `cq-${h}`;
}
function buildClarificationSession(docCase, previous) {
  const sessionId = previous?.sessionId || `cs-${createHash2("sha256").update(docCase.caseId).digest("hex").slice(0, 12)}`;
  const prevByReq = new Map(
    (previous?.questions || []).map((q) => [q.requirementId, q])
  );
  const questions = [];
  for (const assist of docCase.fieldAssistance) {
    for (const q of assist.questions) {
      const match = docCase.requirementMatches.find(
        (m) => m.requirementId === q.requirementId
      );
      const evidenceSource = match?.evidenceSource;
      if (evidenceSource === "foundInDocument" || evidenceSource === "providedByUser" || match?.status === "found" && match.verdict === "strong") {
        continue;
      }
      const prev = prevByReq.get(q.requirementId);
      let status = prev?.status || "unasked";
      if (evidenceSource === "notApplicableKnown") status = "notApplicable";
      else if (evidenceSource === "unknown" && prev?.status === "unknown") {
        status = "unknown";
      } else if (evidenceSource === "refused") status = "refused";
      if (match && (match.status === "missing" || match.status === "ambiguous") && status === "resolved") {
        status = "unasked";
      }
      const qid = questionId(
        docCase.caseId,
        q.requirementId,
        assist.fieldCode
      );
      questions.push({
        questionId: qid,
        caseId: docCase.caseId,
        requirementId: q.requirementId,
        fieldCode: assist.fieldCode,
        documentRef: assist.documentRef,
        declarantRole: /1AJ|1AS|1AP|1AK/i.test(assist.fieldCode) ? "declarant1" : /1BJ|1BS|1BP|1BK/i.test(assist.fieldCode) ? "declarant2" : "household",
        question: q.question,
        expectedAnswerType: mapAnswerType(q.expectedAnswerType),
        reason: q.reason,
        priority: q.priority,
        provenance: q.provenance || [],
        evidenceRefs: (match?.evidenceLinks || []).map((l) => l.factId),
        status,
        askedCount: prev?.askedCount || 0,
        firstAskedSequence: prev?.firstAskedSequence ?? null,
        lastAskedSequence: prev?.lastAskedSequence ?? null,
        priorityScore: 0,
        priorityReasons: [],
        choices: q.expectedAnswerType === "declarant" ? ["d\xE9clarant 1", "d\xE9clarant 2", "foyer"] : q.expectedAnswerType === "yesNo" ? ["oui", "non"] : void 0,
        dependsOnQuestionId: null,
        maxAskedCount: DEFAULT_MAX_ASKED
      });
    }
  }
  const byReq = /* @__PURE__ */ new Map();
  for (const q of questions.sort(
    (a, b) => a.requirementId.localeCompare(b.requirementId)
  )) {
    if (!byReq.has(q.requirementId)) byReq.set(q.requirementId, q);
  }
  const uniqueQuestions = [...byReq.values()].sort(
    (a, b) => a.requirementId.localeCompare(b.requirementId) || (a.fieldCode || "").localeCompare(b.fieldCode || "")
  );
  for (const q of uniqueQuestions) {
    if (q.requirementId.endsWith("-2044") || q.requirementId.includes("4ba-2044")) {
    }
  }
  const session = {
    sessionId,
    caseId: docCase.caseId,
    sequence: previous?.sequence || 0,
    questions: uniqueQuestions,
    answers: previous?.answers || [],
    activeUserFacts: (previous?.activeUserFacts || []).filter((f) => f.active !== false),
    historicalUserFacts: previous?.historicalUserFacts || [],
    currentQuestionId: null,
    changeHistory: previous?.changeHistory || [],
    invariants: previous?.invariants || emptyClarificationInvariants()
  };
  const next = selectNextClarificationQuestion(session, docCase);
  session.currentQuestionId = next?.questionId || null;
  if (next) {
    const idx = session.questions.findIndex((q) => q.questionId === next.questionId);
    if (idx >= 0 && session.questions[idx].status === "unasked") {
    }
  }
  return session;
}
function markQuestionAsked(session, questionId2) {
  const sequence = session.sequence + 1;
  const questions = session.questions.map((q2) => {
    if (q2.questionId !== questionId2) return q2;
    if (q2.status === "refused" || q2.status === "unknown") {
      const inv = { ...session.invariants };
      if (q2.status === "refused") inv.questionRepeatedAfterRefusal += 1;
      if (q2.status === "unknown") inv.questionRepeatedAfterUnknownImmediately += 1;
      session.invariants = inv;
    }
    return {
      ...q2,
      status: q2.status === "unasked" ? "asked" : q2.status,
      askedCount: q2.askedCount + 1,
      firstAskedSequence: q2.firstAskedSequence ?? sequence,
      lastAskedSequence: sequence
    };
  });
  const q = questions.find((x) => x.questionId === questionId2);
  if (q && q.askedCount > q.maxAskedCount) {
    session.invariants.clarificationLoopDetected += 1;
  }
  return {
    ...session,
    sequence,
    questions,
    currentQuestionId: questionId2
  };
}

// lib/v4/knowledge/fr/tax/clarification/explainCaseChanges.ts
function explainClarificationChanges(changeSet) {
  const out = [...changeSet.explanations || []];
  for (const id of changeSet.factsAdded) {
    if (!out.some((e) => e.includes(id) || /indiqué|indiquée/i.test(e))) {
      out.push("Une information fournie par vous a \xE9t\xE9 enregistr\xE9e.");
    }
  }
  for (const id of changeSet.factsSuperseded) {
    if (!out.some((e) => /modifiée|modifié/i.test(e))) {
      out.push(`Une r\xE9ponse pr\xE9c\xE9dente (${id}) a \xE9t\xE9 remplac\xE9e explicitement.`);
    }
  }
  for (const id of changeSet.conflictsAdded) {
    if (/userVsUser/i.test(id)) {
      out.push(
        "Deux r\xE9ponses utilisateur successives diff\xE8rent \u2014 l\u2019historique est conserv\xE9."
      );
    } else if (/user-doc|userVsDocument/i.test(id)) {
      out.push(
        "Une contradiction entre votre r\xE9ponse et un document a \xE9t\xE9 conserv\xE9e sans \xE9crasement."
      );
    }
  }
  for (const r of changeSet.requirementsChanged) {
    out.push(
      `Statut de \xAB ${r.requirementId} \xBB : ${r.from} \u2192 ${r.to}${r.evidenceSource === "providedByUser" ? " (indiqu\xE9 par vous)" : r.evidenceSource === "foundInDocument" ? " (trouv\xE9 dans vos documents)" : ""}.`
    );
  }
  return [...new Set(out)];
}

// lib/v4/knowledge/fr/tax/clarification/applyUserAnswer.ts
function emptyChangeSet() {
  return {
    factsAdded: [],
    factsSuperseded: [],
    conflictsAdded: [],
    conflictsResolved: [],
    requirementsChanged: [],
    questionsResolved: [],
    questionsAdded: [],
    documentsAffected: [],
    caseStatusChanges: [],
    explanations: []
  };
}
function caseInputsFrom(docCase) {
  return docCase.documents.map((d) => ({
    text: d.text,
    fileName: d.fileName
  }));
}
function initClarificationState(docCase, previous) {
  let session = buildClarificationSession(docCase, previous);
  const app = evaluateDocumentCaseApplicability({
    ...docCase,
    clarificationSession: session
  });
  session = mergeApplicabilityQuestionsIntoSession(
    session,
    app.evaluations,
    app.invariants
  );
  const next = selectNextClarificationQuestion(session, docCase);
  if (next) {
    session = {
      ...session,
      questions: session.questions.map(
        (q) => q.questionId === next.questionId ? {
          ...q,
          priorityScore: next.priorityScore,
          priorityReasons: next.priorityReasons
        } : q
      )
    };
    session = markQuestionAsked(session, next.questionId);
  }
  const withSession = {
    ...docCase,
    clarificationSession: session,
    userAnswers: session.activeUserFacts,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants
  };
  return {
    session,
    documentCase: withSession,
    currentQuestion: next ? session.questions.find((q) => q.questionId === next.questionId) || null : null,
    lastChangeSet: null
  };
}
function applyClarificationAnswer(state, questionId2, rawAnswer) {
  const changeSet = emptyChangeSet();
  let session = {
    ...state.session,
    invariants: { ...state.session.invariants },
    questions: state.session.questions.map((q) => ({ ...q })),
    answers: [...state.session.answers],
    activeUserFacts: [...state.session.activeUserFacts],
    historicalUserFacts: [...state.session.historicalUserFacts],
    changeHistory: [...state.session.changeHistory]
  };
  const question = session.questions.find((q) => q.questionId === questionId2);
  if (!question) {
    changeSet.explanations.push("Question introuvable \u2014 aucune modification.");
    return {
      state,
      changeSet,
      accepted: false
    };
  }
  if (question.status === "refused") {
    session.invariants.questionRepeatedAfterRefusal += 1;
    session.invariants.clarificationLoopDetected += 1;
  }
  if (question.status === "unknown" && question.lastAskedSequence === session.sequence) {
    session.invariants.questionRepeatedAfterUnknownImmediately += 1;
  }
  const parsed = parseClarificationAnswer(rawAnswer, question.expectedAnswerType);
  const sequence = session.sequence + 1;
  const answerId = `ca-${question.questionId}-${sequence}`;
  const answer = {
    answerId,
    questionId: question.questionId,
    requirementId: question.requirementId,
    rawAnswer: parsed.rawAnswer,
    normalizedValue: parsed.normalizedValue,
    valueType: parsed.valueType,
    status: parsed.status,
    sequence,
    parseNotes: parsed.parseNotes
  };
  session.answers.push(answer);
  session.sequence = sequence;
  session.questions = session.questions.map((q) => {
    if (q.questionId !== questionId2) return q;
    let status = q.status;
    if (parsed.status === "accepted") status = "answered";
    else if (parsed.status === "unknown") status = "unknown";
    else if (parsed.status === "refused") status = "refused";
    else if (parsed.status === "invalid") status = "invalid";
    else if (parsed.status === "ambiguous") status = "ambiguous";
    else if (parsed.status === "unanswered") status = "asked";
    return { ...q, status };
  });
  if (parsed.status === "invalid") {
    changeSet.explanations.push(
      "La r\xE9ponse n\u2019a pas pu \xEAtre interpr\xE9t\xE9e de fa\xE7on certaine. Aucune valeur n\u2019a \xE9t\xE9 enregistr\xE9e."
    );
    const next = selectNextClarificationQuestion(session, state.documentCase);
    session.currentQuestionId = next?.questionId || questionId2;
    const docCase = {
      ...state.documentCase,
      clarificationSession: session,
      userAnswers: session.activeUserFacts
    };
    return {
      state: {
        session,
        documentCase: docCase,
        currentQuestion: session.questions.find((q) => q.questionId === session.currentQuestionId) || null,
        lastChangeSet: changeSet
      },
      changeSet,
      accepted: false
    };
  }
  if (parsed.status === "ambiguous") {
    changeSet.explanations.push(
      "Cette r\xE9ponse est ambigu\xEB. Je peux vous demander une confirmation, sans enregistrer de valeur certaine."
    );
    session.currentQuestionId = questionId2;
    const docCase = {
      ...state.documentCase,
      clarificationSession: session,
      userAnswers: session.activeUserFacts
    };
    return {
      state: {
        session,
        documentCase: docCase,
        currentQuestion: question,
        lastChangeSet: changeSet
      },
      changeSet,
      accepted: false
    };
  }
  if (parsed.status === "unknown") {
    changeSet.explanations.push(
      "Cette information reste inconnue. Je peux continuer avec les autres \xE9l\xE9ments disponibles."
    );
    changeSet.caseStatusChanges.push(
      `${question.requirementId}:unknown`
    );
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }
  if (parsed.status === "refused") {
    changeSet.explanations.push(
      "Vous avez choisi de ne pas r\xE9pondre \xE0 cette question. Je continue avec les autres \xE9l\xE9ments disponibles."
    );
    changeSet.caseStatusChanges.push(`${question.requirementId}:refused`);
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }
  if (parsed.status !== "accepted") {
    return finalizeWithRecalc(state.documentCase, session, changeSet, null);
  }
  const factId = `uf-${question.requirementId}-${sequence}`;
  const prevActive = session.activeUserFacts.find(
    (f) => f.requirementId === question.requirementId && f.active !== false
  );
  if (prevActive) {
    const oldVal = prevActive.normalizedValue ?? prevActive.answer;
    const newVal = parsed.normalizedValue;
    if (String(oldVal) !== String(newVal)) {
      const superseded = {
        ...prevActive,
        active: false,
        supersededBy: factId
      };
      session.historicalUserFacts.push(superseded);
      session.activeUserFacts = session.activeUserFacts.filter(
        (f) => f.factId !== prevActive.factId
      );
      changeSet.factsSuperseded.push(prevActive.factId || prevActive.questionId);
      changeSet.explanations.push(
        `Votre r\xE9ponse concernant ${question.fieldCode || question.requirementId} a \xE9t\xE9 modifi\xE9e de ${oldVal} \xE0 ${newVal}.`
      );
      changeSet.conflictsAdded.push(
        `userVsUser:${question.requirementId}:${sequence}`
      );
    } else {
      session.activeUserFacts = session.activeUserFacts.filter(
        (f) => f.requirementId !== question.requirementId
      );
    }
  }
  const userFact = {
    kind: "user",
    factId,
    questionId: question.questionId,
    requirementId: question.requirementId,
    fieldCode: question.fieldCode,
    answer: String(parsed.normalizedValue ?? parsed.rawAnswer),
    rawAnswer: parsed.rawAnswer,
    normalizedValue: parsed.normalizedValue,
    valueType: parsed.valueType,
    answerStatus: "accepted",
    role: question.declarantRole,
    year: question.expectedAnswerType === "year" ? Number(parsed.normalizedValue) : state.documentCase.taxContext.yearsPresent[0] ?? null,
    documentRef: question.documentRef,
    answeredAt: null,
    sequence,
    active: true,
    supersededBy: null,
    source: "clarification"
  };
  if (userFact.kind !== "user") {
    session.invariants.userFactPromotedToDocumentFact += 1;
  }
  if (userFact.source === "official") {
    session.invariants.userFactPromotedToOfficialKnowledge += 1;
  }
  session.activeUserFacts.push(userFact);
  changeSet.factsAdded.push(factId);
  changeSet.questionsResolved.push(question.questionId);
  changeSet.explanations.push(
    `Vous avez indiqu\xE9 ${formatValue2(userFact)} pour ${question.fieldCode || "cette information"}. Cette valeur provient de votre r\xE9ponse et non d\u2019un document analys\xE9.`
  );
  return finalizeWithRecalc(
    state.documentCase,
    session,
    changeSet,
    question.fieldCode
  );
}
function formatValue2(f) {
  if (typeof f.normalizedValue === "number") {
    return f.valueType === "amount" ? `${f.normalizedValue} \u20AC`.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : String(f.normalizedValue);
  }
  return String(f.normalizedValue ?? f.answer);
}
function finalizeWithRecalc(previousCase, session, changeSet, focusField) {
  const beforeMatches = new Map(
    previousCase.requirementMatches.map((m) => [
      m.requirementId,
      { status: m.status, source: m.evidenceSource }
    ])
  );
  const rebuilt = rebuildCaseWithUserFacts(previousCase, session);
  let nextSession = buildClarificationSession(rebuilt, session);
  nextSession = {
    ...nextSession,
    invariants: mergeInvariants(session.invariants, nextSession.invariants),
    answers: session.answers,
    activeUserFacts: session.activeUserFacts,
    historicalUserFacts: session.historicalUserFacts,
    changeHistory: session.changeHistory,
    sequence: session.sequence
  };
  const { conflicts, conflictIds, invDelta } = detectUserDocumentConflicts(
    rebuilt,
    nextSession.activeUserFacts
  );
  nextSession.invariants = mergeInvariants(nextSession.invariants, invDelta);
  const mergedConflicts = mergeConflicts(rebuilt.conflicts, conflicts);
  changeSet.conflictsAdded.push(...conflictIds);
  for (const m of rebuilt.requirementMatches) {
    const prev = beforeMatches.get(m.requirementId);
    const source = deriveEvidenceSource(m.requirementId, m, nextSession);
    m.evidenceSource = source;
    if (source === "providedByUser") {
      m.statusLabel = "Information indiqu\xE9e par vous (non issue d\u2019un document analys\xE9)";
    }
    if (prev && (prev.status !== m.status || prev.source !== source)) {
      changeSet.requirementsChanged.push({
        requirementId: m.requirementId,
        from: `${prev.status}/${prev.source || "?"}`,
        to: `${m.status}/${source}`,
        evidenceSource: source
      });
    }
  }
  for (const q of nextSession.questions) {
    const last = [...session.answers].filter((a) => a.questionId === q.questionId).sort((a, b) => b.sequence - a.sequence)[0];
    if (!last) continue;
    const match = rebuilt.requirementMatches.find(
      (m) => m.requirementId === q.requirementId
    );
    if (!match) continue;
    if (last.status === "unknown") {
      match.evidenceSource = "unknown";
      match.statusLabel = "Information rest\xE9e inconnue apr\xE8s votre r\xE9ponse";
    }
    if (last.status === "refused") {
      match.evidenceSource = "refused";
      match.statusLabel = "Vous avez choisi de ne pas r\xE9pondre";
    }
  }
  const nextQ = selectNextClarificationQuestion(nextSession, rebuilt, {
    focusFieldCode: focusField
  });
  if (nextQ) {
    nextSession = markQuestionAsked(nextSession, nextQ.questionId);
    const asked = nextSession.questions.find(
      (q) => q.questionId === nextQ.questionId
    );
    if (asked && asked.askedCount > asked.maxAskedCount) {
      nextSession.invariants.clarificationLoopDetected += 1;
    }
  } else {
    nextSession.currentQuestionId = null;
  }
  changeSet.explanations = explainClarificationChanges(changeSet);
  nextSession.changeHistory = [...nextSession.changeHistory, changeSet];
  const app = evaluateDocumentCaseApplicability({
    ...rebuilt,
    conflicts: mergedConflicts,
    clarificationSession: nextSession,
    userAnswers: nextSession.activeUserFacts
  });
  nextSession = mergeApplicabilityQuestionsIntoSession(
    nextSession,
    app.evaluations,
    app.invariants
  );
  const withApp = {
    ...rebuilt,
    conflicts: mergedConflicts,
    clarificationSession: nextSession,
    userAnswers: nextSession.activeUserFacts,
    applicabilityEvaluations: app.evaluations,
    applicabilityInvariants: app.invariants
  };
  const calc = evaluateDocumentCaseCalculations(withApp);
  const documentCase = attachLocalExplanations({
    ...withApp,
    calculationResults: calc.results,
    calculationInvariants: calc.invariants,
    calculationMetrics: calc.metrics,
    caseCentricViews: rebuilt.caseCentricViews.map((v) => ({
      ...v,
      applicability: app.evaluations.find((e) => e.fieldCode === v.fieldCode) || null,
      calculation: calc.results.find((r) => r.fieldCode === v.fieldCode) || null
    })),
    suggestedDeclaredAmount: null,
    eligibilityDecision: null
  });
  if (documentCase.suggestedDeclaredAmount != null) {
    nextSession.invariants.automaticUnsafeAggregation += 1;
  }
  return {
    accepted: true,
    changeSet,
    state: {
      session: nextSession,
      documentCase,
      currentQuestion: nextQ ? nextSession.questions.find((q) => q.questionId === nextQ.questionId) || null : null,
      lastChangeSet: changeSet
    }
  };
}
function rebuildCaseWithUserFacts(previousCase, session) {
  const opts = {
    resetIds: true,
    userAnswers: session.activeUserFacts
  };
  const rebuilt = buildDocumentCase(caseInputsFrom(previousCase), opts);
  for (const m of rebuilt.requirementMatches) {
    const uf = session.activeUserFacts.find(
      (f) => f.requirementId === m.requirementId && f.active !== false
    );
    const hasDoc = m.verdict === "strong" && m.candidateFacts.some((f) => f.sourceDocumentId);
    if (uf && uf.answerStatus === "accepted") {
      if (hasDoc) {
        m.evidenceSource = m.status === "ambiguous" ? "ambiguous" : "foundInDocument";
      } else if (m.status === "missing" || m.candidateFacts.length === 0) {
        m.status = "found";
        m.evidenceSource = "providedByUser";
        m.statusLabel = "Information indiqu\xE9e par vous (non issue d\u2019un document analys\xE9)";
        m.verdict = "candidate";
      } else {
        m.evidenceSource = "providedByUser";
        m.statusLabel = "Information indiqu\xE9e par vous (non issue d\u2019un document analys\xE9)";
      }
    } else if (hasDoc) {
      m.evidenceSource = "foundInDocument";
    } else if (m.status === "missing") {
      m.evidenceSource = "missing";
    } else if (m.status === "ambiguous") {
      m.evidenceSource = "ambiguous";
    }
  }
  return rebuilt;
}
function deriveEvidenceSource(requirementId, match, session) {
  if (match.evidenceSource) return match.evidenceSource;
  const uf = session.activeUserFacts.find(
    (f) => f.requirementId === requirementId && f.active !== false
  );
  if (uf) return "providedByUser";
  if (match.status === "found") return "foundInDocument";
  if (match.status === "ambiguous") return "ambiguous";
  if (match.status === "missing") return "missing";
  return "missing";
}
function detectUserDocumentConflicts(docCase, userFacts) {
  const conflicts = [];
  const conflictIds = [];
  const invDelta = emptyClarificationInvariants();
  for (const uf of userFacts) {
    if (uf.active === false) continue;
    if (uf.normalizedValue == null && !uf.answer) continue;
    if (!uf.fieldCode) continue;
    const docFacts = docCase.factIndex.filter(
      (f) => f.fieldCode === uf.fieldCode && (f.factType === "fieldValue" || f.factType === "amount") && f.displayValue != null
    );
    for (const df of docFacts) {
      const docNum = normalizeNum(df.displayValue ?? df.value);
      const userNum = normalizeNum(uf.normalizedValue ?? uf.answer);
      if (docNum != null && userNum != null && docNum !== userNum) {
        if (uf.year != null && df.year != null && uf.year !== df.year) {
          invDelta.crossYearAnswerPromoted += 0;
          continue;
        }
        if (uf.role && df.declarantRole && uf.role !== "household" && df.declarantRole !== "household" && uf.role !== df.declarantRole) {
          continue;
        }
        const id = `conflict-user-doc-${uf.fieldCode}-${uf.factId}-${df.factId}`;
        conflicts.push({
          conflictId: id,
          kind: "userVsDocument",
          documentIds: df.sourceDocumentId ? [df.sourceDocumentId] : [],
          factIds: [df.factId],
          userFactIds: uf.factId ? [uf.factId] : [],
          description: `Le document indique ${df.displayValue}, tandis que vous avez indiqu\xE9 ${uf.normalizedValue ?? uf.answer}. Je conserve les deux informations s\xE9par\xE9ment.`,
          evidence: df.evidence || [],
          resolution: "unresolved"
        });
        conflictIds.push(id);
      }
    }
  }
  return { conflicts, conflictIds, invDelta };
}
function normalizeNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(
    v.replace(/\s/g, "").replace(/€/g, "").replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}
function mergeConflicts(existing, extra2) {
  const map = /* @__PURE__ */ new Map();
  for (const c of [...existing, ...extra2]) map.set(c.conflictId, c);
  return [...map.values()];
}
function mergeInvariants(a, b) {
  const out = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = (out[key] || 0) + (b[key] || 0);
  }
  return out;
}

// lib/v4/knowledge/fr/tax/clarification/audit.ts
function auditClarification(docCase, session) {
  const sess = session || docCase.clarificationSession;
  const violations = [];
  if (!sess) {
    return { ok: true, violations: [], invariants: null };
  }
  for (const [k, v] of Object.entries(sess.invariants)) {
    if (typeof v === "number" && v > 0) {
      violations.push(`${k}=${v}`);
    }
  }
  for (const f of sess.activeUserFacts) {
    if (f.kind !== "user") {
      violations.push(`userFact.kind:${f.factId}`);
    }
    if (f.source !== "user" && f.source !== "clarification") {
      violations.push(`userFact.source:${f.factId}`);
    }
    if (docCase.factIndex.some(
      (df) => df.factId === f.factId || (df.provenanceNote || "").includes("OfficialKnowledge")
    )) {
      if (docCase.factIndex.some((df) => df.factId === f.factId)) {
        violations.push(`userFactInDocumentIndex:${f.factId}`);
      }
    }
  }
  for (const c of docCase.conflicts) {
    if (c.kind === "userVsDocument" && c.resolution && c.resolution !== "unresolved" && c.resolution !== "acknowledged") {
      violations.push(`autoResolvedConflict:${c.conflictId}`);
    }
  }
  for (const q of sess.questions) {
    if (!q.provenance?.length) violations.push(`missingProvenance:${q.questionId}`);
    if (q.askedCount > q.maxAskedCount) {
      violations.push(`loop:${q.questionId}`);
    }
  }
  if (docCase.suggestedDeclaredAmount != null) {
    violations.push("suggestedDeclaredAmount");
  }
  if (docCase.eligibilityDecision != null) {
    violations.push("eligibilityDecision");
  }
  return {
    ok: violations.length === 0,
    violations,
    invariants: sess.invariants
  };
}

// lib/v4/integration/documentCaseViewModel.ts
function statusLabelFr3(status) {
  return applicabilityStatusLabel(status);
}
function documentCaseToPreviewJson(docCase) {
  return {
    case_id: docCase.caseId,
    documents_count: docCase.documents.length,
    local_explanations: (docCase.localExplanations || []).map((e) => ({
      id: e.id,
      subject: e.subject,
      title: e.title,
      summary: e.summary,
      status: e.status,
      importance: e.importance
    })),
    documents: docCase.documentCentricViews.map((d) => ({
      document_id: d.documentId,
      file_name: d.fileName,
      detected_type: d.detectedType,
      detected_reference: d.detectedReference,
      year: d.year,
      recognition_label: d.recognitionLabel,
      confidence: d.confidence,
      detected_facts: d.detectedFacts,
      potentially_linked_to: d.potentiallyLinkedTo.map((l) => ({
        field_code: l.fieldCode,
        relation_type: l.relationType,
        reason: l.reason,
        confidence: l.confidence
      })),
      duplicate_status: d.duplicateStatus,
      duplicate_message: d.duplicateMessage
    })),
    relations: docCase.relations.map((r) => ({
      from_document_id: r.fromDocumentId,
      to_document_id: r.toDocumentId,
      relation_type: r.relationType,
      confidence: r.confidence,
      reason: r.reason,
      field_code_hint: r.fieldCodeHint,
      year_relation: r.yearRelation
    })),
    conflicts: docCase.conflicts.map((c) => ({
      kind: c.kind,
      description: c.description,
      document_ids: c.documentIds,
      user_fact_ids: c.userFactIds || [],
      resolution: c.resolution || "unresolved"
    })),
    ambiguities: docCase.ambiguities,
    tax_fields: docCase.caseCentricViews.map((v) => ({
      field_code: v.fieldCode,
      label: v.label,
      explanation: v.whatIsIt,
      found_by_document: v.foundByDocument.map((f) => ({
        document_id: f.documentId,
        file_name: f.fileName,
        notes: f.notes
      })),
      to_verify: v.toVerify,
      supporting_documents: v.supportingDocuments.map((s) => ({
        label: s.label,
        description: s.description,
        normative: s.normative
      })),
      general_conditions: v.generalConditions,
      official_sources: v.officialSources,
      information_status: v.informationStatus,
      priority_questions: v.priorityQuestions.map((q) => ({
        question: q.question,
        reason: q.reason
      })),
      applicability: v.applicability ? {
        status: v.applicability.status,
        status_label: statusLabelFr3(v.applicability.status),
        headline: v.applicability.headline,
        reasons: v.applicability.reasons,
        evidence: v.applicability.evidence.map((e) => ({
          source_kind: e.sourceKind,
          label: e.label,
          detail: e.detail
        })),
        missing_information: v.applicability.missingInformation.map((m) => ({
          id: m.id,
          question: m.question,
          reason: m.reason
        })),
        conflicts: v.applicability.conflicts,
        sources: v.applicability.sources,
        rule_id: v.applicability.ruleId,
        limits: v.applicability.limits
      } : null,
      calculation: v.calculation ? {
        status: v.calculation.status,
        value: v.calculation.value,
        unit: v.calculation.unit,
        formula_id: v.calculation.formulaId,
        inputs: v.calculation.inputs.map((i) => ({
          input_id: i.inputId,
          value: i.value,
          unit: i.unit,
          source_kind: i.sourceKind,
          status: i.status,
          provenance_note: i.provenanceNote
        })),
        missing_inputs: v.calculation.missingInputs,
        conflicts: v.calculation.conflicts,
        explanation: v.calculation.explanation,
        sources: v.calculation.sources,
        rule: v.calculation.rule ? {
          rule_id: v.calculation.rule.ruleId,
          formula_id: v.calculation.rule.formulaId,
          version: v.calculation.rule.version,
          tax_year: v.calculation.rule.taxYear,
          status: v.calculation.rule.status,
          sources: v.calculation.rule.sources
        } : null
      } : null,
      local_explanation: v.localExplanation ? {
        id: v.localExplanation.id,
        subject: v.localExplanation.subject,
        title: v.localExplanation.title,
        summary: v.localExplanation.summary,
        details: v.localExplanation.details,
        status: v.localExplanation.status,
        importance: v.localExplanation.importance,
        missing_information: v.localExplanation.missingInformation,
        why: v.localExplanation.why,
        source_explanation: v.localExplanation.sourceExplanation,
        calculation_explanation: v.localExplanation.calculationExplanation,
        calculation: v.localExplanation.calculation,
        source_facts: v.localExplanation.sourceFacts.map((f) => ({
          kind: f.kind,
          id: f.id,
          label: f.label,
          value: f.value,
          field_code: f.fieldCode,
          document_id: f.documentId
        })),
        rule_refs: v.localExplanation.ruleRefs,
        source_refs: v.localExplanation.sourceRefs,
        limits: v.localExplanation.limits
      } : null,
      suggested_declared_amount: null
    })),
    metrics: {
      documents: docCase.metrics.documents,
      facts: docCase.metrics.facts,
      requirements: docCase.metrics.requirements,
      candidate_matches: docCase.metrics.candidateMatches,
      strong_matches: docCase.metrics.strongMatches,
      ambiguous_matches: docCase.metrics.ambiguousMatches,
      rejected_matches: docCase.metrics.rejectedMatches,
      relations: docCase.metrics.relations,
      conflicts: docCase.metrics.conflicts
    },
    tax_context: {
      primary_references: docCase.taxContext.primaryReferences,
      years_present: docCase.taxContext.yearsPresent,
      field_codes_present: docCase.taxContext.fieldCodesPresent
    },
    clarification: docCase.clarificationSession ? {
      session_id: docCase.clarificationSession.sessionId,
      current_question: (() => {
        const q = docCase.clarificationSession.questions.find(
          (x) => x.questionId === docCase.clarificationSession?.currentQuestionId
        );
        if (!q) return null;
        return {
          question_id: q.questionId,
          field_code: q.fieldCode,
          requirement_id: q.requirementId,
          question: q.question,
          reason: q.reason,
          expected_answer_type: q.expectedAnswerType,
          choices: q.choices || [],
          priority_reasons: q.priorityReasons
        };
      })(),
      user_facts: docCase.clarificationSession.activeUserFacts.map((f) => ({
        fact_id: f.factId,
        field_code: f.fieldCode,
        requirement_id: f.requirementId,
        value: f.normalizedValue ?? f.answer,
        raw_answer: f.rawAnswer ?? f.answer,
        source_label: "Information fournie par vous",
        active: f.active !== false
      })),
      historical_user_facts: (docCase.clarificationSession.historicalUserFacts || []).map((f) => ({
        fact_id: f.factId,
        field_code: f.fieldCode,
        value: f.normalizedValue ?? f.answer,
        superseded_by: f.supersededBy,
        source_label: "Ancienne r\xE9ponse (historique)"
      })),
      last_changes: docCase.clarificationSession.changeHistory.slice(-1)[0]?.explanations || [],
      user_vs_document_conflicts: docCase.conflicts.filter((c) => c.kind === "userVsDocument").map((c) => ({
        description: c.description,
        resolution: c.resolution || "unresolved"
      }))
    } : null,
    applicability_summary: (docCase.applicabilityEvaluations || []).map((e) => ({
      field_code: e.fieldCode,
      status: e.status,
      status_label: statusLabelFr3(e.status),
      headline: e.headline
    })),
    suggested_declared_amount: null,
    eligibility_decision: null,
    invariants: {
      cross_document_fact_lost_provenance: docCase.invariants.crossDocumentFactLostProvenance,
      cross_document_unsafe_merge: docCase.invariants.crossDocumentUnsafeMerge,
      cross_document_unsafe_aggregation: docCase.invariants.crossDocumentUnsafeAggregation,
      year_mismatch_promoted_to_strong: docCase.invariants.yearMismatchPromotedToStrong,
      role_mismatch_promoted_to_strong: docCase.invariants.roleMismatchPromotedToStrong,
      unknown_document_promoted_to_known: docCase.invariants.unknownDocumentPromotedToKnown,
      duplicate_document_double_counted: docCase.invariants.duplicateDocumentDoubleCounted,
      upload_order_changes_conclusion: docCase.invariants.uploadOrderChangesConclusion,
      removed_document_fact_survives: docCase.invariants.removedDocumentFactSurvives,
      candidate_relation_presented_as_certain: docCase.invariants.candidateRelationPresentedAsCertain,
      user_answer_promoted_to_official_knowledge: docCase.invariants.userAnswerPromotedToOfficialKnowledge
    }
  };
}

// lib/v4/integration/runPreview.ts
function parseMultiDocumentPaste(text) {
  const raw = text || "";
  if (!/^---DOC/m.test(raw)) {
    return [{ text: raw, fileName: null }];
  }
  const parts = raw.split(/^---DOC(?::([^\n]+))?---\s*$/m);
  const docs = [];
  if (parts[0]?.trim()) {
  }
  for (let i = 1; i < parts.length; i += 2) {
    const fileName = (parts[i] || "").trim() || null;
    const body = (parts[i + 1] || "").trim();
    if (body.length >= 10) docs.push({ text: body, fileName });
  }
  if (!docs.length && raw.trim()) {
    return [{ text: raw, fileName: null }];
  }
  return docs;
}
function runV4PreviewAnalysis(input) {
  const diagnostics = [];
  try {
    if (input.resetIds) {
      resetCandidateIdsForTests();
      resetRelationIdsForTests();
      resetRequirementFactIdsForTests();
    }
    let dossierDocs = input.documents || [];
    if (!dossierDocs.length && input.pastedText) {
      dossierDocs = parseMultiDocumentPaste(input.pastedText);
    }
    if (!dossierDocs.length && input.pages?.length) {
      const byFile = /* @__PURE__ */ new Map();
      for (const p of input.pages) {
        const key = p.sourceName || p.name || "document";
        const list = byFile.get(key) || [];
        const pageText = p.text || p.content || "";
        list.push(pageText);
        byFile.set(key, list);
      }
      if (byFile.size > 1) {
        dossierDocs = [...byFile.entries()].map(([fileName, texts]) => ({
          fileName,
          text: texts.join("\n")
        }));
      }
    }
    const multi = dossierDocs.length > 1;
    const adapted = input.adapted || (input.ocrResult ? ocrResultToV4Input(input.ocrResult) : pagesToV4Input({
      pages: input.pages,
      pastedText: multi ? dossierDocs.map((d) => d.text).join("\n\n") : input.pastedText || dossierDocs[0]?.text
    }));
    diagnostics.push(...adapted.diagnostics);
    diagnostics.push({
      step: "v4_input",
      blocks: adapted.blocks.length,
      chars: adapted.text.replace(/\s+/g, "").length,
      extractionQuality: adapted.extractionQuality,
      source: adapted.source,
      dossierDocuments: dossierDocs.length
    });
    const v4 = analyzeDocumentV4(
      adapted.blocks.length > 0 ? { blocks: adapted.blocks, fiscalKnowledge: true } : { text: adapted.text || "", fiscalKnowledge: true }
    );
    const analysis = mapV4ResultToPreviewAnalysis(v4, {
      extractionQuality: adapted.extractionQuality,
      fallbackReason: null
    });
    const fiscalMono = !multi && dossierDocs.length === 1 && Boolean(analysis.fiscal_document);
    if (multi || fiscalMono) {
      let docCase = buildDocumentCase(
        dossierDocs.map((d) => ({
          text: d.text,
          fileName: d.fileName || null
        })),
        { resetIds: Boolean(input.resetIds) }
      );
      if (multi) {
        const order = assertUploadOrderStable(
          dossierDocs.map((d) => ({ text: d.text, fileName: d.fileName })),
          [...dossierDocs].reverse().map((d) => ({ text: d.text, fileName: d.fileName }))
        );
        docCase.invariants.uploadOrderChangesConclusion = order.uploadOrderChangesConclusion;
      }
      let clar = initClarificationState(docCase);
      for (const step of input.clarificationAnswers || []) {
        const qid = step.questionId || clar.currentQuestion?.questionId || clar.session.currentQuestionId;
        if (!qid) break;
        clar = applyClarificationAnswer(clar, qid, step.answer).state;
      }
      docCase = clar.documentCase;
      const safety = checkDocumentCaseSafety(docCase);
      if (!safety.ok && docCase.invariants.crossDocumentUnsafeAggregation > 0) {
        return {
          ok: false,
          technicalError: true,
          fallbackReason: "v4_invariant_violation",
          message: "Invariants dossier V4-R/S viol\xE9s.",
          diagnostics: [...diagnostics, { step: "case_safety", ...safety }]
        };
      }
      analysis.document_case = documentCaseToPreviewJson(docCase);
      if (analysis.fiscal_document && docCase.caseCentricViews.length) {
        const fd = analysis.fiscal_document;
        fd.dossier_summary = {
          documents_count: docCase.documents.length,
          years_present: docCase.taxContext.yearsPresent,
          conflicts_count: docCase.conflicts.length
        };
      }
      diagnostics.push({
        step: "document_case",
        caseId: docCase.caseId,
        metrics: docCase.metrics,
        safety_ok: safety.ok,
        clarification_question: clar.currentQuestion?.requirementId || null
      });
    }
    const inv = analysis.v4_invariants;
    if (inv.unsupportedPresentationFacts !== 0 || inv.unsupportedExplanationFacts !== 0 || inv.inventedActions !== 0 || inv.inventedDeadlines !== 0 || inv.inventedAmounts !== 0 || inv.inventedReasons !== 0 || (inv.knowledgePromotedToDocumentFact || 0) !== 0 || (inv.unsupportedUserActions || 0) !== 0 || (inv.taxFieldKnowledgePromotedToFact || 0) !== 0 || (inv.emptyFieldConvertedToZero || 0) !== 0 || (inv.fieldFalsePositiveCritical || 0) !== 0 || (inv.knowledgePromotedToUserFact || 0) !== 0 || (inv.requirementPromotedToObligation || 0) !== 0 || (inv.candidateFactPromotedToCertain || 0) !== 0 || (inv.unsupportedEligibilityDecision || 0) !== 0 || (inv.unsupportedTaxAmount || 0) !== 0 || (inv.automaticUnsafeAggregation || 0) !== 0 || (inv.missingPresentedAsUserDoesNotHave || 0) !== 0) {
      return {
        ok: false,
        technicalError: true,
        fallbackReason: "v4_invariant_violation",
        message: "Invariants V4 viol\xE9s \u2014 fallback V3 possible.",
        diagnostics: [
          ...diagnostics,
          { step: "invariants", ...inv }
        ]
      };
    }
    const warnings = [...analysis.warnings || []];
    return {
      ok: true,
      analysis,
      warnings,
      pdfProcessing: {
        mode: "v4_local",
        engine: "v4",
        hasText: adapted.extractionQuality !== "empty",
        scanned: adapted.extractionQuality === "empty",
        pageCount: multi ? dossierDocs.length : adapted.pageCount,
        extractionQuality: adapted.extractionQuality,
        diagnostics
      },
      adapted
    };
  } catch (error) {
    const message = String(
      error?.message || error || "erreur V4 inconnue"
    ).slice(0, 400);
    return {
      ok: false,
      technicalError: true,
      fallbackReason: "v4_technical_error",
      message,
      diagnostics: [
        ...diagnostics,
        { step: "v4_exception", message }
      ]
    };
  }
}

// lib/v4/integration/runDocumentCase.ts
function runV4PreviewDocumentCase(input) {
  try {
    if (input.resetIds) {
      resetCandidateIdsForTests();
      resetRelationIdsForTests();
      resetRequirementFactIdsForTests();
    }
    const docs = (input.documents || []).map((d) => ({
      text: d.text,
      fileName: d.fileName || null
    }));
    if (!docs.length) {
      return {
        ok: false,
        technicalError: true,
        message: "Aucun document fourni pour le dossier."
      };
    }
    let docCase = buildDocumentCase(docs, {
      resetIds: Boolean(input.resetIds),
      userAnswers: (input.userAnswers || []).map((u) => ({
        kind: "user",
        questionId: u.questionId,
        requirementId: u.requirementId,
        answer: u.answer,
        answeredAt: u.answeredAt ?? null,
        source: "user"
      }))
    });
    const reversed = [...docs].reverse();
    const order = assertUploadOrderStable(docs, reversed);
    docCase.invariants.uploadOrderChangesConclusion = order.uploadOrderChangesConclusion;
    let clarState = initClarificationState(docCase);
    for (const step of input.clarificationAnswers || []) {
      const qid = step.questionId || clarState.currentQuestion?.questionId || clarState.session.currentQuestionId;
      if (!qid) break;
      const result = applyClarificationAnswer(clarState, qid, step.answer);
      clarState = result.state;
    }
    docCase = clarState.documentCase;
    const safety = checkDocumentCaseSafety(docCase);
    const clarAudit = auditClarification(docCase, clarState.session);
    if (docCase.invariants.crossDocumentUnsafeAggregation > 0 || docCase.suggestedDeclaredAmount != null) {
      return {
        ok: false,
        technicalError: true,
        message: "Invariant agr\xE9gation V4-R/S viol\xE9."
      };
    }
    return {
      ok: true,
      document_case: documentCaseToPreviewJson(docCase),
      safety_ok: safety.ok,
      clarification_ok: clarAudit.ok
    };
  } catch (error) {
    return {
      ok: false,
      technicalError: true,
      message: String(error?.message || error).slice(0, 400)
    };
  }
}
export {
  buildFiscalDocumentViewModel,
  documentCaseToPreviewJson,
  familyLabelFr,
  fiscalViewModelToPreviewJson,
  humanEvidenceSupport,
  humanFieldLabel,
  isV4EngineEnabled,
  mapV4ResultToPreviewAnalysis,
  ocrResultToV4Input,
  pagesToV4Input,
  parseMultiDocumentPaste,
  pdfExtractionToV4Blocks,
  qualityStatusLabelFr,
  runV4PreviewAnalysis,
  runV4PreviewDocumentCase,
  shouldAttachFiscalViewModel,
  textToV4Blocks
};
