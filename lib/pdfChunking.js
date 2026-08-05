/**
 * Découpage dynamique des PDF longs + fusion des analyses partielles.
 * Pas de limite de pages utilisateur — uniquement la taille 4 Mo.
 */

export const MAX_DOCUMENT_SIZE = 4 * 1024 * 1024;

/** Nombre de pages au-delà duquel on préfère le mode chunked. */
export const DIRECT_PAGE_SOFT_LIMIT = 6;

/** Taille fichier au-delà de laquelle le mode direct PDF est risqué. */
export const DIRECT_SIZE_SOFT_LIMIT = 1.5 * 1024 * 1024;

/**
 * Estime des groupes de pages (1-based inclusive ranges).
 */
export function planPdfChunks(meta = {}) {
  const pageCount = Math.max(0, Number(meta.pageCount) || 0);
  const fileSize = Number(meta.fileSize) || 0;
  const textLength = Number(meta.textLength) || 0;
  const scanned = meta.scanned === true;
  const pageTexts = Array.isArray(meta.pageTexts) ? meta.pageTexts : [];

  if (pageCount < 1) {
    return {
      mode: "direct",
      chunkCount: 0,
      chunks: [],
      reason: "empty"
    };
  }

  const canDirect =
    pageCount <= DIRECT_PAGE_SOFT_LIMIT &&
    fileSize <= DIRECT_SIZE_SOFT_LIMIT &&
    !scanned;

  if (canDirect) {
    return {
      mode: "direct",
      chunkCount: 1,
      chunks: [
        {
          index: 0,
          startPage: 1,
          endPage: pageCount,
          pageNumbers: range(1, pageCount),
          strategy: "direct_pdf"
        }
      ],
      reason: "small_text_pdf"
    };
  }

  // Taille de groupe dynamique
  let pagesPerChunk;

  if (scanned) {
    // Images : chunks plus petits
    const avgBytes = fileSize / pageCount;
    pagesPerChunk = avgBytes > 180_000 ? 2 : avgBytes > 90_000 ? 3 : 4;
  } else {
    const avgText = textLength / Math.max(pageCount, 1);
    if (avgText > 2500) {
      pagesPerChunk = 4;
    } else if (avgText > 800) {
      pagesPerChunk = 6;
    } else {
      pagesPerChunk = 8;
    }

    // Gros fichiers texte : réduire encore
    if (fileSize > 2.5 * 1024 * 1024) {
      pagesPerChunk = Math.min(pagesPerChunk, 4);
    }
  }

  pagesPerChunk = Math.max(2, Math.min(pagesPerChunk, 10));

  const chunks = [];

  for (let start = 1; start <= pageCount; start += pagesPerChunk) {
    const end = Math.min(pageCount, start + pagesPerChunk - 1);
    const pageNumbers = range(start, end);
    const chunkText = pageTexts
      .filter((item) => pageNumbers.includes(item.pageNumber))
      .map((item) => item.text || "")
      .join(" ");

    chunks.push({
      index: chunks.length,
      startPage: start,
      endPage: end,
      pageNumbers,
      strategy: scanned ? "page_images" : "text_chunk",
      estimatedTextLength: chunkText.length
    });
  }

  return {
    mode: "chunked",
    chunkCount: chunks.length,
    chunks,
    pagesPerChunk,
    reason: scanned ? "scanned_or_long" : "long_text_pdf"
  };
}

/**
 * Fusionne les analyses partielles de chunks en une analyse unique.
 */
export function mergeChunkAnalyses(chunkResults = []) {
  const usable = chunkResults.filter(
    (item) => item && item.ok && item.analysis && typeof item.analysis === "object"
  );

  if (!usable.length) {
    return {
      ok: false,
      analysis: null,
      warnings: [],
      failedPages: uniqueSorted(
        chunkResults.flatMap((item) => item?.failedPages || [])
      ),
      processedPages: uniqueSorted(
        chunkResults.flatMap((item) => item?.processedPages || [])
      )
    };
  }

  const warnings = [];
  const pushWarning = (value) => {
    const text = clean(value);
    if (text && !warnings.includes(text)) {
      warnings.push(text);
    }
  };

  usable.forEach((item) => {
    (item.analysis.warnings || []).forEach(pushWarning);
    (item.warnings || []).forEach(pushWarning);
  });

  const failedPages = uniqueSorted(
    chunkResults.flatMap((item) => item?.failedPages || [])
  );
  const processedPages = uniqueSorted(
    chunkResults.flatMap((item) => item?.processedPages || [])
  );

  if (failedPages.length) {
    pushWarning(
      failedPages.length === 1
        ? `L’analyse a réussi, mais la page ${failedPages[0]} était difficile à lire.`
        : `L’analyse a réussi, mais les pages ${failedPages.join(" et ")} étaient difficiles à lire.`
    );
  }

  // Contradictions simples sur montant principal
  const amounts = usable
    .map((item) => clean(item.analysis.amount?.value))
    .filter(
      (value) =>
        value && !/non trouvée|non trouvé|incertitude/i.test(value)
    );

  const uniqueAmounts = [...new Set(amounts)];
  if (uniqueAmounts.length > 1) {
    pushWarning(
      "Plusieurs montants principaux différents apparaissent selon les pages ; vérifiez le document."
    );
  }

  const documentType =
    pickBestText(usable.map((item) => item.analysis.document_type)) ||
    "Document non identifié";

  const issuer = pickBestText(usable.map((item) => item.analysis.issuer));

  const summaries = usable
    .map((item) => clean(item.analysis.plain_summary))
    .filter(Boolean);

  const plain_summary =
    summaries.length <= 1
      ? summaries[0] ||
        "C’est un document dont l’objet n’a pas été identifié avec certitude."
      : `C’est un document en plusieurs parties. ${summaries
          .slice(0, 3)
          .join(" ")}`.slice(0, 600);

  const request =
    pickBestText(usable.map((item) => item.analysis.request)) ||
    "Information non trouvée avec certitude";

  const why_received =
    pickBestText(usable.map((item) => item.analysis.why_received)) ||
    "Information non trouvée avec certitude";

  const actions = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.actions) ? item.analysis.actions : []
    ),
    (item) => `${clean(item?.action)}|${clean(item?.how)}`
  ).slice(0, 5);

  const dates = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.dates) ? item.analysis.dates : []
    ),
    (item) => `${clean(item?.date)}|${clean(item?.label)}`
  ).slice(0, 10);

  const timeline = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.timeline) ? item.analysis.timeline : []
    ),
    (item) => `${clean(item?.date)}|${clean(item?.label)}`
  ).slice(0, 16);

  const amounts_detail = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.amounts_detail)
        ? item.analysis.amounts_detail
        : []
    ),
    (item) => `${clean(item?.label)}|${clean(item?.value)}|${clean(item?.page)}`
  ).slice(0, 20);

  const evidence = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.evidence) ? item.analysis.evidence : []
    ),
    (item) => `${clean(item?.page)}|${clean(item?.quote)}`
  ).slice(0, 12);

  const tables = mergeTables(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.tables) ? item.analysis.tables : []
    )
  );

  const formFields = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(item.analysis.form_fields || item.analysis.formFields)
        ? item.analysis.form_fields || item.analysis.formFields
        : []
    ),
    (item) =>
      `${clean(item?.id)}|${clean(item?.label)}|${clean(String(item?.page))}`
  ).slice(0, 40);

  const requiredDocuments = dedupeByKey(
    usable.flatMap((item) =>
      Array.isArray(
        item.analysis.required_documents || item.analysis.requiredDocuments
      )
        ? item.analysis.required_documents || item.analysis.requiredDocuments
        : []
    ),
    (item) => `${clean(item?.label || item?.name)}|${clean(item?.reason)}`
  ).slice(0, 30);

  const entities = {
    people: uniqueStrings(
      usable.flatMap((item) => item.analysis.entities?.people || [])
    ),
    addresses: uniqueStrings(
      usable.flatMap((item) => item.analysis.entities?.addresses || [])
    ),
    references: uniqueStrings(
      usable.flatMap((item) => item.analysis.entities?.references || [])
    ),
    signatures: uniqueStrings(
      usable.flatMap((item) => item.analysis.entities?.signatures || [])
    ),
    organizations: uniqueStrings(
      usable.flatMap((item) => item.analysis.entities?.organizations || [])
    )
  };

  const confidences = usable
    .map((item) => Number(item.analysis.confidence))
    .filter((value) => Number.isFinite(value));

  const confidence = confidences.length
    ? Math.round(
        confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      )
    : 0;

  const reading_quality = failedPages.length
    ? "partial"
    : usable.every((item) => item.analysis.reading_quality === "full")
      ? "full"
      : "partial";

  const urgency = pickUrgency(usable.map((item) => item.analysis.urgency));

  const amount = pickAmount(usable.map((item) => item.analysis.amount));

  return {
    ok: true,
    analysis: {
      document_type: documentType,
      issuer,
      plain_summary,
      request,
      why_received,
      urgency,
      actions,
      dates,
      timeline,
      amount,
      amounts_detail,
      tables,
      form_fields: formFields,
      required_documents: requiredDocuments,
      entities,
      evidence,
      confidence,
      reading_quality,
      warnings
    },
    warnings,
    failedPages,
    processedPages
  };
}

export function formatBytesFr(bytes) {
  const value = Number(bytes) || 0;

  if (value < 1024) {
    return `${value} o`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1).replace(".", ",")} Ko`;
  }

  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function buildTooLargeMessage(actualBytes, limitBytes = MAX_DOCUMENT_SIZE) {
  return (
    `La taille maximale autorisée est de 4 Mo. Réduisez la taille du document ou divisez-le en plusieurs fichiers. ` +
    `Taille du fichier : ${formatBytesFr(actualBytes)} — limite : ${formatBytesFr(limitBytes)}`
  );
}

function mergeTables(tables) {
  if (!Array.isArray(tables) || !tables.length) {
    return [];
  }

  const merged = [];

  for (const table of tables) {
    if (!table) {
      continue;
    }

    const title = clean(table.title);
    const columnsKey = (table.columns || []).map(clean).join("|");
    const existing = merged.find(
      (item) =>
        clean(item.title) === title &&
        (item.columns || []).map(clean).join("|") === columnsKey &&
        title
    );

    if (!existing) {
      merged.push({
        ...table,
        rows: Array.isArray(table.rows) ? [...table.rows] : [],
        page: clean(table.page)
      });
      continue;
    }

    // Tableau multi-pages : concaténer les lignes
    const rows = Array.isArray(table.rows) ? table.rows : [];
    existing.rows = [...(existing.rows || []), ...rows].slice(0, 80);

    if (table.page && existing.page && !String(existing.page).includes(table.page)) {
      existing.page = `${existing.page}, ${table.page}`;
    }

    existing.totals = {
      ...(existing.totals || {}),
      ...(table.totals || {})
    };

    if (Number(table.confidence) > Number(existing.confidence || 0)) {
      existing.confidence = table.confidence;
    }
  }

  return merged.slice(0, 12);
}

function pickBestText(values) {
  const cleaned = values.map(clean).filter(Boolean);
  if (!cleaned.length) {
    return "";
  }

  const ranked = cleaned
    .filter((value) => !/non identifié|non trouvée avec certitude|indisponible/i.test(value))
    .sort((a, b) => b.length - a.length);

  return ranked[0] || cleaned[0];
}

function pickAmount(amounts) {
  for (const amount of amounts) {
    const value = clean(amount?.value);
    if (value && !/non trouvée|non trouvé|incertitude/i.test(value)) {
      return {
        value,
        meaning: clean(amount?.meaning)
      };
    }
  }

  return {
    value: "Information non trouvée avec certitude",
    meaning: ""
  };
}

function pickUrgency(list) {
  const order = { urgent: 3, soon: 2, uncertain: 1, none: 0 };
  let best = { level: "uncertain", message: "Le niveau d’urgence n’a pas été déterminé." };

  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const level = clean(item.level);
    if ((order[level] || 0) >= (order[best.level] || 0) && clean(item.message)) {
      best = {
        level: ["none", "soon", "urgent", "uncertain"].includes(level)
          ? level
          : "uncertain",
        message: clean(item.message)
      };
    }
  }

  return best;
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item) {
      continue;
    }

    const key = keyFn(item);
    if (!key || key === "|" || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function uniqueStrings(values) {
  return [
    ...new Set(values.map((item) => clean(String(item))).filter(Boolean))
  ].slice(0, 20);
}

function uniqueSorted(values) {
  return [...new Set(values.map(Number).filter((n) => n > 0))].sort(
    (a, b) => a - b
  );
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
