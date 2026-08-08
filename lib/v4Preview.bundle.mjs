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
function factKey(field2, kind) {
  return kind && kind !== field2 ? `${field2}:${kind}` : field2;
}

// lib/v4/integration/mapToPreview.ts
function isAmbiguous(item) {
  return item.status === "ambiguous" || item.status === "contradictory";
}
function pickPrimaryAmount(items) {
  if (!items.length) return null;
  const usable = items.filter((i) => !isAmbiguous(i) && i.value != null);
  if (!usable.length) return null;
  const due = usable.find(
    (i) => i.sourceFacts?.includes("amountDue") || i.sourceFacts?.includes("netToPay") || /^montant dû$/i.test(i.label || "")
  );
  if (due) return due;
  const ttc = usable.find(
    (i) => i.sourceFacts?.includes("amountTTC") || /ttc/i.test(i.label || "")
  );
  if (ttc) return ttc;
  const primaryTier = usable.find((i) => i.tier === "primary");
  return primaryTier || usable[0];
}
function pickPrimaryDate(items) {
  if (!items.length) return null;
  const usable = items.find((i) => !isAmbiguous(i) && i.value != null);
  return usable || null;
}
function mapV4ResultToPreviewAnalysis(result, options = {}) {
  const { presentation, diagnostics, explanation } = result;
  const identity = presentation.documentIdentity;
  const essentialText = presentation.essential.map((e) => e.text).filter(Boolean).join(" ");
  const plain_summary = essentialText || identity.text || (identity.documentType === "unknown" ? "Les \xE9l\xE9ments extraits ne permettent pas encore d\u2019identifier clairement ce document." : identity.label);
  const actions = presentation.actions.filter((a) => a.text && a.status !== "noExplicitActionDetected").map((a) => ({
    action: a.text,
    how: a.label || ""
  }));
  const request = actions[0]?.action || "Aucune demande certaine.";
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
  const evidence = presentation.evidencePassages.filter((p) => p.excerpt && p.excerpt.trim().length >= 4).map((p) => ({
    page: p.page ? `Page ${p.page}` : "Document",
    quote: p.excerpt,
    explanation: p.supportedFacts?.length ? `\xC9l\xE9ments li\xE9s : ${p.supportedFacts.join(", ")}` : ""
  }));
  let urgencyLevel = "none";
  let urgencyMessage = "Aucune urgence particuli\xE8re n\u2019a \xE9t\xE9 identifi\xE9e.";
  const deadlineDate = presentation.importantDates.find(
    (d) => !isAmbiguous(d) && /deadline|échéance|limite/i.test(`${d.kind} ${d.label}`)
  );
  if (presentation.actions.length && deadlineDate) {
    urgencyLevel = "soon";
    urgencyMessage = deadlineDate.text || "Une \xE9ch\xE9ance est indiqu\xE9e.";
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
  return {
    engine: "v4",
    document_type: identity.text || identity.label || "Document",
    issuer: "",
    plain_summary,
    request,
    why_received,
    actions,
    dates,
    enriched_dates: dates,
    amount,
    urgency: { level: urgencyLevel, message: urgencyMessage },
    evidence,
    warnings,
    confidence,
    reading_quality,
    tables: [],
    amounts_detail,
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
      explanationDocumentType: explanation.documentType?.primary || null
    },
    v4_invariants: {
      unsupportedPresentationFacts: presentation.unsupportedPresentationFacts,
      unsupportedExplanationFacts: explanation.unsupportedExplanationFacts,
      inventedActions: presentation.inventedActions,
      inventedDeadlines: presentation.inventedDeadlines,
      inventedAmounts: presentation.inventedAmounts,
      inventedReasons: presentation.inventedReasons,
      ...inventedUi
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
  // Impératifs de démarche (formulaires) — pas les négations (filtrées à part)
  /\b((?:retournez|transmettez|envoyez|compl[eé]tez|joignez)\s+[^.\n]{5,80})/gi
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
    "amountHT",
    "amountTTC",
    "amountDue",
    "vatAmount",
    "linePrice",
    "offerPrice",
    "capitalSocial",
    "balance",
    "netToPay",
    "other"
  ],
  percentage: ["vatRate", "discountRate", "other"],
  date: ["invoiceDate", "dueDate", "documentDate", "deadline", "other"],
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
function applyNegativeMoneyContext(reasons, L, role) {
  const invoiceLike = [
    "amountHT",
    "amountTTC",
    "amountDue",
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
  if ((role === "amountDue" || role === "amountTTC" || role === "netToPay") && /deja\s+(paye|prelev)|acompte|sous[-\s]?total|remise\b/.test(L.same)) {
    pushReason(reasons, "negative:alreadyPaidOrPartial", SCORE_WEIGHTS.alreadyPaidPenalty);
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
    labelHit(reasons, L, /\bht\b|hors\s*taxes?|net\s+ht/, "HT");
    if (/sous[-\s]?total|remise\b/.test(L.same)) {
      pushReason(reasons, "negative:partialHt", -0.45);
    }
    if (/net\s+ht/.test(L.same)) {
      pushReason(reasons, "lexical:netHT", 0.2);
    }
    if (/\btva\b/.test(L.next) || /\btva\b/.test(L.same)) {
      pushReason(reasons, "nearVATBlock", SCORE_WEIGHTS.nearLabelProximity);
    }
  } else if (role === "amountTTC") {
    labelHit(reasons, L, /\bttc\b|toutes\s*taxes/, "TTC");
    if (/\btotal\b/.test(L.same) || /\btotal\b/.test(L.before)) {
      pushReason(reasons, "lexical:total", SCORE_WEIGHTS.totalKeyword);
    }
  } else if (role === "amountDue") {
    labelHit(
      reasons,
      L,
      /reste\s+a\s+payer|montant\s+restant|net\s*a\s*payer|somme\s*a\s*payer|(?<!deja\s+)a\s*payer/,
      "payable",
      SCORE_WEIGHTS.sameLineLabel,
      SCORE_WEIGHTS.previousLineLabel,
      0
    );
    if (/reste\s+a\s+payer|montant\s+restant\s+du/.test(L.same)) {
      pushReason(reasons, "lexical:resteAPayer", SCORE_WEIGHTS.resteAPayerBoost);
    } else if (/(?<!deja\s+)a\s*payer/.test(L.same)) {
      pushReason(reasons, "lexical:aPayer", SCORE_WEIGHTS.payableKeyword);
    }
    if (/montant\s+(du\s+)?prelevement|prelevement\s+de|prelevement\s+automatique/.test(
      L.same
    ) && !/deja\s+prelev/.test(L.same)) {
      pushReason(reasons, "lexical:prelevementDue", SCORE_WEIGHTS.payableKeyword);
    }
    if (/\bttc\b/.test(L.same) && !/a\s*payer|restant|du\b/.test(L.same)) {
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
      labelHit(reasons, L, /\btva\b|\bvat\b|montant\s+tva/, "TVA");
      if (/%/.test(L.same) && /\btva\b/.test(L.same)) {
        pushReason(reasons, "nearVATRate", SCORE_WEIGHTS.nearLabelProximity);
      }
      if (/net\s+ht|sous[-\s]?total|remise\b|deja\s+(paye|prelev)/.test(L.same)) {
        pushReason(reasons, "negative:nonVatLine", -0.4);
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
  } else if (role === "dueDate" || role === "deadline") {
    labelHit(
      reasons,
      L,
      /echeance|a\s+payer\s+avant|au\s+plus\s+tard|avant\s+le|dans\s+un\s+delai|merci\s+de|date\s+limite|limite\s+de\s+paiement/,
      "deadline"
    );
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
  const hasPrelevement = /prelevement|prélèvement|mandat\s+sepa/.test(lex2);
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

// lib/v4/classification/profiles/registry.ts
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
  if (structures.hasPrelevement || /prelevement|pr[eé]l[eè]vement/.test(lex2)) {
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
  const blob = normalizeLex(
    [c.context?.previousLine, c.context?.sameLine, c.context?.nextLine].filter(Boolean).join(" ")
  );
  return re.test(blob);
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
        if (ok && ttcGreater) {
          pushReason2(
            reasons,
            `arithmetic:HT+TVA\u2248TTC (${num(ht)}+${num(vat)}=${sum}\u2248${num(ttc)})`,
            RELATION_WEIGHTS.htPlusVatEqualsTtc
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
        } else if (!ok && topTrioRoles && isCredibleVatAmount(vat)) {
          const penaltyReasons = [];
          pushReason2(
            penaltyReasons,
            `contradiction:HT+TVA\u2260TTC (${num(ht)}+${num(vat)}=${sum}\u2260${num(ttc)})`,
            RELATION_WEIGHTS.arithmeticMismatch
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
        if (!nearlyEqual(expected, num(ttc), RELATION_WEIGHTS.moneyTolerance)) {
          if (topTrioRoles && isTopRole(rate, "vatRate")) {
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
        if (!ttcGreater) continue;
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
    return /reste\s+a\s+payer|montant\s+restant|net\s*a\s*payer|somme\s*a\s*payer|(?<!deja\s+)a\s*payer/.test(
      line
    );
  });
}
function scoreCandidateForField(c, exp, ctx) {
  if (!exp.candidateTypes.includes(c.type)) return null;
  const reasons = [];
  let score = 0;
  const roles = exp.preferredRoles?.length ? exp.preferredRoles : [bestRole(c) || ""].filter(Boolean);
  const strongDueExists = exp.field === "amountDue" && hasStrongAmountDueCandidate(ctx);
  let best = 0;
  for (const role of roles) {
    let rs = roleScore(c, role);
    if (exp.field === "amountDue" && role === "amountTTC" && strongDueExists) {
      rs *= 0.25;
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
  const blob = candidateContextBlob(c);
  const sameLine = normalizeLex(c.context?.sameLine || "");
  for (const re of exp.positiveContext || []) {
    if (re.test(blob) || re.test(String(c.raw || ""))) {
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
function field(partial) {
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
  return field({
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
    field({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "subject",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle", "sectionTitle", "dossierReference"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bobjet\s*:/i]
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "importantDates",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field({
      field: "deadlines",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate"],
      cardinality: "multiple",
      importance: "critical",
      confidenceThreshold: 0.5,
      expectedRelations: ["actionDeadline"],
      positiveContext: [/avant\s+le|d['’]?ici\s+le|[eé]ch[eé]ance/i]
    }),
    field({
      field: "requiredDocuments",
      candidateTypes: ["action", "reference"],
      preferredRoles: ["requestedAction", "dossierReference"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pi[eè]ces?|documents?\s+[aà]\s+fournir|joindre/i]
    }),
    field({
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
    field({
      field: "accountHolder",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "bank",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "accountIdentifiers",
      candidateTypes: ["iban", "accountNumber", "reference"],
      preferredRoles: ["accountIban", "accountIdentifier"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "statementPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
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
    field({
      field: "certificateType",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/attestation|certificat/i]
    }),
    field({
      field: "issueDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "high",
      confidenceThreshold: 0.45
    }),
    field({
      field: "validityPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "dueDate"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "statements",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
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
    field({
      field: "contractTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle"],
      importance: "high",
      confidenceThreshold: 0.35,
      positiveContext: [/\bcontrat\b|\bconvention\b/i]
    }),
    field({
      field: "endDate",
      candidateTypes: ["date"],
      preferredRoles: ["dueDate", "deadline", "documentDate"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/fin|terme|expire|jusqu['’]?au/i]
    }),
    field({
      field: "duration",
      candidateTypes: ["period", "reference"],
      preferredRoles: ["billingPeriod", "other"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/dur[eé]e|mois|ans|ann[eé]e/i]
    }),
    field({
      field: "noticePeriod",
      candidateTypes: ["period", "deadline", "date"],
      preferredRoles: ["deadline", "other"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]avis|r[eé]siliation|d[eé]nonciation/i]
    }),
    field({
      field: "obligations",
      candidateTypes: ["obligation", "action"],
      preferredRoles: ["obligation", "requestedAction"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "paymentClauses",
      candidateTypes: ["money"],
      preferredRoles: ["amountDue", "amountTTC", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/signature|sign[eé]/i]
    }),
    field({
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
    field({
      field: "topic",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle", "documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "sections",
      candidateTypes: ["sectionTitle", "documentTitle"],
      preferredRoles: ["sectionTitle"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.25
    }),
    field({
      field: "keyPoints",
      candidateTypes: ["action", "obligation", "warning"],
      preferredRoles: ["requestedAction", "obligation", "warning"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field({
      field: "definitions",
      candidateTypes: ["sectionTitle", "reference"],
      preferredRoles: ["sectionTitle", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3,
      positiveContext: [/d[eé]finition|signifie|on\s+entend/i]
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "procedures",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
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
    field({
      field: "turnover",
      candidateTypes: ["money"],
      preferredRoles: ["amountTTC", "other"],
      importance: "high",
      confidenceThreshold: 0.45,
      positiveContext: [/chiffre\s+d['’]?affaires|ca\b|turnover/i]
    }),
    field({
      field: "operatingResult",
      candidateTypes: ["money"],
      preferredRoles: ["other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+d['’]?exploitation/i]
    }),
    field({
      field: "netResult",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/r[eé]sultat\s+net/i]
    }),
    field({
      field: "assets",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/actif/i]
    }),
    field({
      field: "liabilities",
      candidateTypes: ["money"],
      preferredRoles: ["other", "balance"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/passif/i]
    }),
    field({
      field: "equity",
      candidateTypes: ["money"],
      preferredRoles: ["capitalSocial", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/capitaux\s+propres|equity/i]
    }),
    field({
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
    field({
      field: "issuingOrganization",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "fields",
      candidateTypes: ["person", "address", "email", "phone", "reference"],
      preferredRoles: ["recipient", "other", "contactEmail"],
      cardinality: "multiple",
      importance: "high",
      confidenceThreshold: 0.3
    }),
    field({
      field: "signatures",
      candidateTypes: ["person"],
      preferredRoles: ["signatory"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3,
      positiveContext: [/signature/i]
    }),
    field({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "deadline"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.35
    }),
    field({
      field: "instructions",
      candidateTypes: ["action", "warning"],
      preferredRoles: ["requestedAction", "warning"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35
    }),
    field({
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
      negativeSignals: [/capital\s+social/i]
    }),
    required({
      field: "amountHT",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
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
    field({
      field: "legalIssuer",
      candidateTypes: ["organization"],
      preferredRoles: ["legalIssuer", "issuer"],
      importance: "medium",
      confidenceThreshold: 0.5
    }),
    field({
      field: "recipient",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "invoiceNumber",
      candidateTypes: ["reference", "invoiceNumber"],
      preferredRoles: ["invoiceNumber"],
      importance: "high",
      positiveContext: [/facture|n[°o]/i],
      confidenceThreshold: 0.45
    }),
    field({
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
    field({
      field: "dueDate",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["dueDate", "deadline"],
      importance: "medium",
      confidenceThreshold: 0.55,
      positiveContext: [/[eé]ch[eé]ance|payable|avant\s+le/i]
    }),
    field({
      field: "servicePeriod",
      candidateTypes: ["period"],
      preferredRoles: ["billingPeriod", "fiscalPeriod"],
      importance: "low",
      confidenceThreshold: 0.5
    }),
    field({
      field: "vatRate",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate"],
      importance: "high",
      confidenceThreshold: 0.5,
      expectedRelations: ["arithmetic"]
    }),
    field({
      field: "amountDue",
      candidateTypes: ["money"],
      // amountTTC = repli faible si aucun « reste à payer » / « à payer » explicite.
      // Le resolver démotive ce repli dès qu’un candidat amountDue est fort.
      preferredRoles: ["amountDue", "netToPay", "amountTTC"],
      importance: "high",
      // Ne force PAS égalité avec amountTTC
      confidenceThreshold: 0.5,
      positiveContext: [
        /reste\s+[aà]\s+payer|montant\s+restant|montant\s+(total\s+)?([aà]\s+payer|d[uû])|net\s+[aà]\s+payer|somme\s+[aà]\s+payer/i
      ],
      negativeSignals: [
        /deja\s+(pay[eé]|pr[eé]lev)|sous[-\s]?total|remise\b|capital\s+social/i
      ]
    }),
    field({
      field: "paymentMethod",
      candidateTypes: ["iban"],
      preferredRoles: ["paymentIban"],
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["clientNumber", "dossierReference", "invoiceNumber"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ],
  forbiddenOrSuspiciousFields: [
    field({
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
    field({
      field: "employer",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "employee",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "signatory"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "payPeriod",
      candidateTypes: ["period", "date"],
      preferredRoles: ["billingPeriod", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "netTaxable",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountHT"],
      importance: "medium",
      confidenceThreshold: 0.45,
      positiveContext: [/net\s+imposable/i]
    }),
    field({
      field: "socialContributions",
      candidateTypes: ["money"],
      preferredRoles: ["linePrice", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/cotisation|urssaf|cs[g|g]/i]
    }),
    field({
      field: "withholdingTax",
      candidateTypes: ["money"],
      preferredRoles: ["vatAmount", "other"],
      importance: "medium",
      confidenceThreshold: 0.4,
      positiveContext: [/pr[eé]l[eè]vement\s+[aà]\s+la\s+source|pas\b/i]
    }),
    field({
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
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
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
    field({
      field: "taxAuthority",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "legalIssuer"],
      importance: "high",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxpayer",
      candidateTypes: ["person", "organization"],
      preferredRoles: ["recipient", "recipientOrg"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxType",
      candidateTypes: ["documentTitle", "sectionTitle", "reference"],
      preferredRoles: ["documentTitle"],
      importance: "medium",
      confidenceThreshold: 0.35,
      positiveContext: [/imp[oô]t|taxe|fonci[eè]re|revenu/i]
    }),
    field({
      field: "fiscalPeriod",
      candidateTypes: ["period", "reference", "documentTitle", "sectionTitle"],
      preferredRoles: ["fiscalPeriod", "billingPeriod", "other", "documentTitle"],
      importance: "high",
      confidenceThreshold: 0.3,
      positiveContext: [/p[eé]riode\s+fiscale|exercice\s+20\d{2}|revenu\s+20\d{2}|fiscale\s+20\d{2}/i],
      negativeSignals: [/date\s+limite|paiement|montant/i]
    }),
    field({
      field: "documentDate",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "invoiceDate"],
      importance: "medium",
      confidenceThreshold: 0.45
    }),
    field({
      field: "reference",
      candidateTypes: ["reference"],
      preferredRoles: ["dossierReference", "clientNumber"],
      importance: "medium",
      confidenceThreshold: 0.4
    }),
    field({
      field: "taxableBase",
      candidateTypes: ["money"],
      preferredRoles: ["amountHT", "other"],
      importance: "low",
      confidenceThreshold: 0.5,
      positiveContext: [/base\s+(imposable|taxable)|revenu\s+fiscal/i]
    }),
    field({
      field: "paymentDeadline",
      candidateTypes: ["date", "deadline"],
      preferredRoles: ["deadline", "dueDate", "documentDate"],
      importance: "high",
      confidenceThreshold: 0.4,
      positiveContext: [/date\s+limite|avant\s+le|limite\s+de\s+paiement|paiement/i]
    }),
    field({
      field: "rates",
      candidateTypes: ["percentage"],
      preferredRoles: ["vatRate", "other"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.4
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning", "action"],
      preferredRoles: ["warning", "requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.4
    })
  ]
});

// lib/v4/profiles/definitions/unknown.ts
var unknownProfile = createDocumentProfile({
  id: "unknown",
  expectedFields: [],
  optionalFields: [
    field({
      field: "probableTitle",
      candidateTypes: ["documentTitle", "sectionTitle"],
      preferredRoles: ["documentTitle", "sectionTitle"],
      importance: "medium",
      confidenceThreshold: 0.25
    }),
    field({
      field: "organizations",
      candidateTypes: ["organization"],
      preferredRoles: ["issuer", "recipientOrg", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "persons",
      candidateTypes: ["person"],
      preferredRoles: ["recipient", "sender", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "dates",
      candidateTypes: ["date"],
      preferredRoles: ["documentDate", "other"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "moneyValues",
      candidateTypes: ["money"],
      preferredRoles: ["other", "amountTTC", "amountDue"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
      field: "references",
      candidateTypes: ["reference"],
      preferredRoles: ["other", "dossierReference"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
      field: "actions",
      candidateTypes: ["action"],
      preferredRoles: ["requestedAction"],
      cardinality: "multiple",
      importance: "medium",
      confidenceThreshold: 0.3
    }),
    field({
      field: "warnings",
      candidateTypes: ["warning"],
      preferredRoles: ["warning"],
      cardinality: "multiple",
      importance: "low",
      confidenceThreshold: 0.3
    }),
    field({
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
  runOnText(text) {
    return this.runOnBlocks(blocksFromPlainText(text));
  }
  runOnBlocks(blocks) {
    const { candidates } = this.candidates.runOnBlocks(blocks);
    const built = buildRelations(candidates);
    const consistency = analyzeConsistency(candidates);
    const classification = this.router.classify({
      blocks,
      candidates,
      relations: built.relations,
      consistency
    });
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
      validation
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
    amountHT: "high",
    vatAmount: "high",
    invoiceDate: "high",
    issuer: "high",
    dueDate: "medium"
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
function importanceFor(type, field2, fallback) {
  const boosted = PROFILE_BOOST[type]?.[field2];
  if (boosted) return boosted;
  if (fallback) return fallback;
  if (FINANCIAL_KINDS.has(field2)) return "medium";
  if (DATE_KINDS.has(field2)) return "medium";
  if (PARTY_KINDS.has(field2)) return "medium";
  return "low";
}
function isFinancialField(field2) {
  return FINANCIAL_KINDS.has(field2);
}
function isDateField(field2) {
  return DATE_KINDS.has(field2);
}
function isPartyField(field2) {
  return PARTY_KINDS.has(field2);
}

// lib/v4/understanding/actions.ts
function deadlineItemFromRelation(rel, candidates, blocks, type) {
  const dateCand = candidates.find(
    (c) => (c.id === rel.targetCandidateId || c.id === rel.sourceCandidateId) && (c.type === "date" || c.type === "deadline")
  );
  if (!dateCand) return null;
  const evidence = enrichEvidence(dateCand.evidence, blocks);
  if (!evidence.length) return null;
  return {
    kind: "actionDeadline",
    value: dateCand.value,
    confidence: toConfidence(rel.score),
    status: "resolved",
    importance: importanceFor(type, "actionDeadline", "critical"),
    evidence,
    derivedFrom: [
      `relation:${rel.id}`,
      `candidate:${dateCand.id}`,
      "relationType:actionDeadline"
    ],
    reasoning: rel.reasons
  };
}
function buildActions(type, fields, candidates, relations, blocks) {
  const actions = [];
  const actionRels = relations.filter((r) => r.type === "actionDeadline");
  const actionField = fields.find(
    (f) => (f.field === "requestedActions" || f.field === "obligations") && (f.status === "resolved" || f.status === "ambiguous")
  );
  const actionCandidates = candidates.filter((c) => c.type === "action");
  for (const rel of actionRels) {
    const actionCand = candidates.find(
      (c) => (c.id === rel.sourceCandidateId || c.id === rel.targetCandidateId) && c.type === "action"
    );
    if (!actionCand) continue;
    const evidence = enrichEvidence(
      [...actionCand.evidence || [], ...rel.evidence || []],
      blocks
    );
    if (!evidence.length) continue;
    const deadline = deadlineItemFromRelation(rel, candidates, blocks, type);
    actions.push({
      actionType: "requestedAction",
      description: String(actionCand.value),
      actor: null,
      target: null,
      deadline,
      requiredDocuments: [],
      conditions: [],
      confidence: toConfidence(rel.score),
      evidence,
      status: "resolved",
      derivedFrom: [
        `candidate:${actionCand.id}`,
        `relation:${rel.id}`,
        ...deadline ? deadline.derivedFrom : []
      ],
      reasoning: [
        ...rel.reasons,
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
function fieldToItem(field2, type, blocks) {
  if (field2.status === "notApplicable") return null;
  if (field2.status === "missing") {
    return null;
  }
  const evidence = enrichEvidence(field2.evidence, blocks);
  if ((field2.status === "resolved" || field2.status === "ambiguous") && field2.value !== void 0 && evidence.length === 0) {
    return null;
  }
  return {
    kind: field2.field,
    value: field2.value,
    confidence: field2.confidence || toConfidence(0.5),
    status: field2.status,
    importance: importanceFor(
      type,
      field2.field,
      field2.expectation.importance
    ),
    evidence,
    derivedFrom: [
      `field:${field2.field}`,
      ...(field2.candidateIds || []).map((id) => `candidate:${id}`),
      ...(field2.reasons || []).map((r) => r.signal)
    ],
    reasoning: field2.reasons || []
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
  push("paymentRequest", /montant\s+[aà]\s+payer|total\s+ttc|facture/i, 0.35, "content:paymentCue");
  push("informationRequest", /transmettre|merci\s+de|justificatif|veuillez/i, 0.4, "content:requestCue");
  push("certification", /attestation|certifie|je\s+soussign/i, 0.4, "content:certCue");
  push("agreement", /\bcontrat\b|\bconvention\b|prend\s+effet|pr[eé]avis/i, 0.4, "content:contractCue");
  push("accountStatement", /relev[eé]\s+de\s+compte|solde\s+pr[eé]c[eé]dent|d[eé]bit|cr[eé]dit/i, 0.4, "content:bankCue");
  push("taxObligation", /imp[oô]t|montant\s+[aà]\s+payer|date\s+limite/i, 0.3, "content:taxCue");
  push("explanation", /guide|mode\s+d['’]?emploi|comment\s+faire|\b[eé]tape/i, 0.35, "content:guideCue");
  push("information", /nous\s+vous\s+informons|pour\s+information|mis\s+[aà]\s+jour/i, 0.25, "content:infoCue");
  const has = (name) => fields.some((f) => f.field === name && f.status === "resolved");
  if (has("amountDue") || has("amountTTC")) {
    signals.push({
      kind: "paymentRequest",
      weight: 0.25,
      evidence: enrichEvidence(
        fields.find((f) => f.field === "amountDue" || f.field === "amountTTC")?.evidence,
        blocks
      ),
      reasons: [{ signal: "field:amount", delta: 0.25 }]
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
    invoice: "paymentRequest",
    administrativeLetter: "informationRequest",
    certificate: "certification",
    notice: "information",
    contract: "agreement",
    bankStatement: "accountStatement",
    taxDocument: "taxObligation",
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
      (d) => /deadline|dueDate|paymentDeadline|actionDeadline/i.test(d.kind)
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
function fromArith(rel, resolution, blocks) {
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
      ...rel.evidence || []
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
      relation: rel.label || "HT + TVA \u2248 TTC"
    },
    confidence: toConfidence(rel.score),
    status: "resolved",
    importance: "high",
    evidence,
    derivedFrom: [
      "field:amountHT",
      "field:vatAmount",
      "field:amountTTC",
      `relation:${rel.id}`,
      "arithmetic:HT+VAT\u2248TTC"
    ],
    reasoning: [
      ...rel.reasons,
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
function dedupeFacts(facts) {
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
  const summaryFacts = dedupeFacts(
    [
      itemToFact(u.purpose, blocks, "purpose"),
      title,
      u.identity.reference ? itemToFact(u.identity.reference, blocks) : null,
      ...u.parties.map((p) => itemToFact(p, blocks))
    ].filter((f) => Boolean(f))
  );
  const importantFacts = dedupeFacts(
    u.keyFacts.map((k) => itemToFact(k, blocks)).filter((f) => Boolean(f))
  );
  const amounts = dedupeFacts(
    u.financialFacts.map((f) => itemToFact(f, blocks)).filter((x) => Boolean(x))
  );
  const deadlines = dedupeFacts(
    [
      ...u.importantDates.filter(
        (d) => /deadline|dueDate|paymentDeadline|actionDeadline|effectiveDate|endDate/i.test(
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
    const ttc = findAny(explanation, "amountTTC", "amountDue");
    const date = findAny(explanation, "invoiceDate", "documentDate");
    if (ttc) sources.push(ttc);
    if (date) sources.push(date);
    const money = ttc ? formatMoneyFR(ttc.value) : null;
    const d = date ? formatDateFR(date.value) : null;
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
  };
  const text = map[String(purpose.value)];
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
function amountLabel(field2) {
  const map = {
    amountHT: "Total HT",
    vatAmount: "TVA",
    vatRate: "Taux de TVA",
    amountTTC: "Total TTC",
    amountDue: "Montant d\xFB",
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
  return map[field2] || field2;
}
function dateLabel(field2) {
  const map = {
    invoiceDate: "Date de facture",
    documentDate: "Date du document",
    dueDate: "Date d'\xE9ch\xE9ance",
    paymentDeadline: "Date limite de paiement",
    actionDeadline: "\xC9ch\xE9ance d'action",
    effectiveDate: "Date d'effet",
    endDate: "Date de fin",
    fiscalPeriod: "P\xE9riode fiscale",
    statementPeriod: "P\xE9riode du relev\xE9",
    noticePeriod: "Pr\xE9avis"
  };
  return map[field2] || field2;
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
    const ok = a.sourceFacts.some((s) => s.startsWith("action:")) || a.kind === "prelevementInfo" && a.sourceFacts.some(
      (s) => s.startsWith("secondary:paymentInformation") || s.startsWith("action:")
    ) && a.evidence.length > 0;
    if (!ok) inventedActions += 1;
  }
  for (const d of presentation.importantDates) {
    const ok = d.sourceFacts.some((s) => {
      const field2 = s.split(":")[0];
      return explanation.deadlines.some((x) => x.field === field2 || x.kind === field2) || explanation.importantFacts.some(
        (x) => (x.field === field2 || x.kind === field2) && /date|deadline|period/i.test(x.field)
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
    for (const field2 of ["amountTTC", "amountDue", "invoiceDate", "dueDate"]) {
      const f = [...explanation.amounts, ...explanation.deadlines].find(
        (x) => x.field === field2 && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (field2.startsWith("amount") || field2 === "amountDue" || field2 === "amountTTC") {
        const money = formatMoneyFR(f.value);
        if (!money) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialAmount",
            label: amountLabel(f.field),
            text: `${amountLabel(f.field)} : ${money}.`,
            tier: "important"
          })
        );
      } else {
        const d = formatDateFR(f.value);
        if (!d) continue;
        items.push(
          itemFromFact(f, {
            kind: "essentialDate",
            label: dateLabel(f.field),
            text: `${dateLabel(f.field)} : ${d}.`,
            tier: "important"
          })
        );
      }
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
    for (const field2 of ["parties", "contractTitle", "effectiveDate", "noticePeriod", "duration"]) {
      const f = [...explanation.importantFacts, ...explanation.deadlines, ...explanation.summaryFacts].find(
        (x) => x.field === field2 && (isUsableFactStatus(x.status) || x.status === "ambiguous")
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
    for (const field2 of ["openingBalance", "closingBalance", "transactions"]) {
      const f = explanation.amounts.find(
        (x) => x.field === field2 && isUsableFactStatus(x.status)
      );
      if (!f) continue;
      if (field2 === "transactions" && Array.isArray(f.value)) {
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
    for (const field2 of ["amountDue", "taxAmount", "paymentDeadline", "fiscalPeriod"]) {
      const f = [...explanation.amounts, ...explanation.deadlines, ...explanation.importantFacts].find(
        (x) => x.field === field2 && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      if (!f) continue;
      if (field2.includes("amount") || field2 === "taxAmount" || field2 === "amountDue") {
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
function buildActions2(explanation) {
  const out = [];
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected" || !a.description) continue;
    const desc = a.description.toLowerCase();
    const isPrelevement = /pr[eé]l[eè]vement|mandat\s+sepa|pr[eé]lev[eé]\s+automatiquement/.test(
      desc
    );
    if (isPrelevement) {
      const moneyFact = explanation.amounts.find(
        (x) => (x.field === "amountDue" || x.field === "amountTTC") && isUsableFactStatus(x.status) && !Array.isArray(x.value)
      );
      const money = moneyFact ? formatMoneyFR(moneyFact.value) : null;
      const d = a.deadline ? formatDateFR(a.deadline.value) : null;
      let text = "Un pr\xE9l\xE8vement automatique est indiqu\xE9.";
      if (money && d) {
        text = `Un pr\xE9l\xE8vement de ${money} est pr\xE9vu le ${d}.`;
      } else if (money) {
        text = `Un pr\xE9l\xE8vement de ${money} est indiqu\xE9.`;
      } else if (d) {
        text = `Un pr\xE9l\xE8vement automatique est pr\xE9vu le ${d}.`;
      }
      out.push({
        kind: "prelevementInfo",
        label: "Pr\xE9l\xE8vement",
        text,
        status: "info",
        tier: "important",
        sourceFacts: [
          `action:${a.actionType}`,
          ...moneyFact ? [sourceKey(moneyFact)] : [],
          ...a.deadline ? [sourceKey(a.deadline)] : []
        ],
        evidence: [
          ...a.evidence,
          ...moneyFact?.evidence || [],
          ...a.deadline?.evidence || []
        ]
      });
      continue;
    }
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
  const paySec = explanation.secondaryInformation.find(
    (s) => s.sectionKind === "paymentInformation"
  );
  const hasPrelevementSignal = paySec?.signals.some((s) => /prelevement|sepa|payment/i.test(s)) || paySec?.evidence.some(
    (e) => /pr[eé]l[eè]vement|mandat\s+sepa/i.test(e.text)
  );
  if (hasPrelevementSignal && (paySec?.evidence?.length || 0) > 0 && !out.some((o) => o.kind === "prelevementInfo") && explanation.documentType.primary === "invoice") {
    const moneyFact = explanation.amounts.find(
      (x) => (x.field === "amountDue" || x.field === "amountTTC") && isUsableFactStatus(x.status) && !Array.isArray(x.value)
    );
    const money = moneyFact ? formatMoneyFR(moneyFact.value) : null;
    out.push({
      kind: "prelevementInfo",
      label: "Pr\xE9l\xE8vement",
      text: money ? `Un pr\xE9l\xE8vement automatique de ${money} est indiqu\xE9.` : "Un pr\xE9l\xE8vement automatique est indiqu\xE9.",
      status: "info",
      tier: "important",
      sourceFacts: [
        `secondary:paymentInformation`,
        ...moneyFact ? [sourceKey(moneyFact)] : []
      ],
      evidence: [
        ...paySec?.evidence || [],
        ...moneyFact?.evidence || []
      ]
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
        kind: "amount",
        label: amountLabel(a.field),
        text: `${amountLabel(a.field)} : ${money}.`,
        tier: a.field === "amountTTC" || a.field === "amountDue" ? "primary" : "important"
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
  return explanation.secondaryInformation.filter((s) => s.sectionKind !== "bankStatement").filter((s) => s.evidence.length > 0).map((s) => ({
    kind: s.sectionKind,
    label: labels[s.sectionKind] || s.sectionKind,
    text: `${labels[s.sectionKind] || s.sectionKind} pr\xE9sentes dans le document.`,
    status: s.status,
    tier: "secondary",
    sourceFacts: [`secondary:${s.sectionKind}`, ...s.derivedFrom],
    evidence: [...s.evidence]
  }));
}
function buildEvidencePassages(explanation) {
  const map = /* @__PURE__ */ new Map();
  const absorb = (facts, evidence) => {
    for (const e of evidence) {
      if (!e.text) continue;
      const key = `${e.page}|${e.blockId || ""}|${e.text}`;
      const existing = map.get(key);
      if (existing) {
        for (const f of facts) {
          if (!existing.supportedFacts.includes(f)) {
            existing.supportedFacts.push(f);
          }
        }
      } else {
        map.set(key, {
          page: e.page,
          blockId: e.blockId ?? null,
          excerpt: e.text,
          supportedFacts: [...facts]
        });
      }
    }
  };
  for (const f of [
    ...explanation.amounts,
    ...explanation.deadlines,
    ...explanation.importantFacts,
    ...explanation.summaryFacts
  ]) {
    absorb([sourceKey(f)], f.evidence);
  }
  for (const a of explanation.actions) {
    if (a.status === "noExplicitActionDetected") continue;
    absorb([`action:${a.actionType}`], a.evidence);
  }
  for (const w of explanation.warnings) {
    absorb([`warning:${w.kind}`], w.evidence);
  }
  return [...map.values()].slice(0, 40);
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
  const partial = {
    documentIdentity,
    essential: buildEssential(explanation),
    actions: buildActions2(explanation),
    reason,
    importantDates: buildDates(explanation),
    importantAmounts: buildAmounts(explanation),
    warnings: buildWarnings2(explanation),
    evidencePassages: buildEvidencePassages(explanation),
    secondaryInformation: buildSecondary(explanation)
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
    diagnostics
  };
}

// lib/v4/integration/runPreview.ts
function runV4PreviewAnalysis(input) {
  const diagnostics = [];
  try {
    if (input.resetIds) {
      resetCandidateIdsForTests();
      resetRelationIdsForTests();
    }
    const adapted = input.adapted || (input.ocrResult ? ocrResultToV4Input(input.ocrResult) : pagesToV4Input({
      pages: input.pages,
      pastedText: input.pastedText
    }));
    diagnostics.push(...adapted.diagnostics);
    diagnostics.push({
      step: "v4_input",
      blocks: adapted.blocks.length,
      chars: adapted.text.replace(/\s+/g, "").length,
      extractionQuality: adapted.extractionQuality,
      source: adapted.source
    });
    const v4 = analyzeDocumentV4(
      adapted.blocks.length > 0 ? { blocks: adapted.blocks } : { text: adapted.text || "" }
    );
    const analysis = mapV4ResultToPreviewAnalysis(v4, {
      extractionQuality: adapted.extractionQuality,
      fallbackReason: null
    });
    const inv = analysis.v4_invariants;
    if (inv.unsupportedPresentationFacts !== 0 || inv.unsupportedExplanationFacts !== 0 || inv.inventedActions !== 0 || inv.inventedDeadlines !== 0 || inv.inventedAmounts !== 0 || inv.inventedReasons !== 0) {
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
        pageCount: adapted.pageCount,
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
export {
  isV4EngineEnabled,
  mapV4ResultToPreviewAnalysis,
  ocrResultToV4Input,
  pagesToV4Input,
  pdfExtractionToV4Blocks,
  runV4PreviewAnalysis,
  textToV4Blocks
};
