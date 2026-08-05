/**
 * Contexte documentaire enrichi + réponses locales (sans Gemini)
 * pour le chat ExpliqueMoi Sprint 3.
 */

export function normalizeTables(rawTables) {
  if (!Array.isArray(rawTables)) {
    return [];
  }

  return rawTables
    .slice(0, 8)
    .map((table, index) => {
      const columns = Array.isArray(table?.columns)
        ? table.columns.map((col) => cleanText(col)).filter(Boolean)
        : [];

      const rows = Array.isArray(table?.rows)
        ? table.rows
            .slice(0, 40)
            .map((row) => {
              if (Array.isArray(row)) {
                return row.map((cell) => cleanText(String(cell ?? "")));
              }

              if (row && typeof row === "object") {
                return columns.map((col) =>
                  cleanText(String(row[col] ?? row[col.toLowerCase()] ?? ""))
                );
              }

              return [cleanText(String(row ?? ""))];
            })
            .filter((row) => row.some((cell) => cell))
        : [];

      const totals =
        table?.totals && typeof table.totals === "object"
          ? Object.fromEntries(
              Object.entries(table.totals)
                .map(([key, value]) => [cleanText(key), cleanText(String(value))])
                .filter(([key, value]) => key && value)
            )
          : {};

      return {
        id: cleanText(table?.id) || `table_${index + 1}`,
        title:
          cleanText(table?.title) ||
          cleanText(table?.name) ||
          `Tableau ${index + 1}`,
        columns,
        rows,
        page: cleanText(table?.page) || "Page non précisée",
        confidence: normalizeConfidence(table?.confidence),
        totals,
        notes: cleanText(table?.notes),
        kind: cleanText(table?.kind) || inferTableKind(table, columns, rows)
      };
    })
    .filter((table) => table.columns.length || table.rows.length);
}

export function normalizeTimeline(rawTimeline) {
  if (!Array.isArray(rawTimeline)) {
    return [];
  }

  return rawTimeline
    .slice(0, 12)
    .map((item) => ({
      date: cleanText(item?.date),
      label: cleanText(item?.label),
      meaning: cleanText(item?.meaning || item?.description)
    }))
    .filter((item) => item.date || item.label);
}

export function normalizeEntities(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    people: toStringList(source.people || source.personnes),
    addresses: toStringList(source.addresses || source.adresses),
    references: toStringList(source.references || source.refs),
    signatures: toStringList(source.signatures),
    organizations: toStringList(
      source.organizations || source.organismes || source.issuers
    )
  };
}

export function normalizeAmountsDetail(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, 12)
    .map((item) => ({
      label: cleanText(item?.label || item?.type),
      value: cleanText(item?.value || item?.amount),
      kind: cleanText(item?.kind || item?.nature), // HT | TVA | TTC | autre
      page: cleanText(item?.page)
    }))
    .filter((item) => item.value);
}

/**
 * Construit un contexte compact réutilisable par le chat
 * (évite de renvoyer le PDF/images à Gemini).
 */
export function buildDocumentContext(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return null;
  }

  const tables = Array.isArray(analysis.tables)
    ? analysis.tables
    : normalizeTables(analysis.tables);

  const entities = analysis.entities || normalizeEntities({});
  const requests = Array.isArray(analysis.requests)
    ? analysis.requests
    : analysis.request
      ? [analysis.request]
      : [];
  const amounts = Array.isArray(analysis.amountsDetail)
    ? analysis.amountsDetail
    : Array.isArray(analysis.amounts_detail)
      ? analysis.amounts_detail
      : Array.isArray(analysis.amounts)
        ? analysis.amounts
        : [];
  const references = toStringList(
    entities.references || analysis.references || []
  );
  const proofs = Array.isArray(analysis.proofs)
    ? analysis.proofs
    : Array.isArray(analysis.pieces)
      ? analysis.pieces
      : [];
  const formFields = Array.isArray(analysis.formFields)
    ? analysis.formFields
    : Array.isArray(analysis.form_fields)
      ? analysis.form_fields
      : [];
  const requiredDocuments = Array.isArray(analysis.requiredDocuments)
    ? analysis.requiredDocuments
    : Array.isArray(analysis.required_documents)
      ? analysis.required_documents
      : [];

  return {
    // Clés historiques (chat)
    document_type: analysis.documentType || analysis.document_type || "",
    issuer: analysis.issuer || "",
    summary: analysis.summary || analysis.plain_summary || "",
    request: analysis.request || "",
    why_received: analysis.whyReceived || analysis.why_received || "",
    amount: analysis.amount || null,
    amounts_detail: analysis.amountsDetail || analysis.amounts_detail || [],
    dates: analysis.dates || [],
    timeline: analysis.timeline || [],
    actions: analysis.actions || [],
    evidence: analysis.evidence || [],
    tables,
    entities,
    urgency: analysis.urgency || null,
    confidence: analysis.confidence ?? null,
    reading_quality: analysis.readingQuality || analysis.reading_quality || "",
    // Contexte enrichi pour les actions post-analyse
    analysisId: analysis.analysisId ?? analysis.analysis_id ?? null,
    documentType: analysis.documentType || analysis.document_type || "",
    requests,
    amounts,
    references,
    proofs,
    formFields,
    requiredDocuments
  };
}

/**
 * Tente de répondre localement à partir des données déjà analysées.
 * Retourne null si un raisonnement Gemini est nécessaire.
 */
export function tryAnswerLocally(question, analysis) {
  const q = cleanText(question).toLowerCase();

  if (!q || !analysis) {
    return null;
  }

  const context = buildDocumentContext(analysis);

  if (isMissingQuestion(q)) {
    // handled by Gemini or local "not found" patterns below
  }

  if (/résume|resume|c['’]?est quoi|explique(-| )moi (ce|le) document/i.test(q)) {
    return answer(
      context.summary ||
        "Je ne trouve pas cette information dans le document.",
      "résumé du document",
      Boolean(context.summary)
    );
  }

  if (/que dois[- ]je faire|quelles? actions?|prochaines? étapes?/i.test(q)) {
    if (!context.actions?.length) {
      return notFound();
    }

    const lines = context.actions
      .map((item, index) => {
        const action = item.action || item;
        const how = item.how ? ` — ${item.how}` : "";
        return `${index + 1}. ${action}${how}`;
      })
      .join("\n");

    return answer(lines, "liste des actions du document", true);
  }

  if (/justificatif|pièces? à fournir|documents? à joindre/i.test(q)) {
    const fromEvidence = (context.evidence || [])
      .filter((item) =>
        /justificatif|pièce|joindre|fournir|attestation/i.test(
          `${item.quote || ""} ${item.explanation || ""}`
        )
      )
      .map((item) => item.quote || item.explanation)
      .filter(Boolean);

    if (fromEvidence.length) {
      return answer(
        fromEvidence.join("\n"),
        "passages relatifs aux justificatifs",
        true
      );
    }

    return null;
  }

  if (/date limite|échéance|avant quelle date|délai/i.test(q)) {
    const deadline =
      (context.dates || []).find((item) =>
        /limite|échéance|délai|avant le/i.test(
          `${item.label || ""} ${item.meaning || ""}`
        )
      ) ||
      (context.timeline || []).find((item) =>
        /limite|échéance|délai/i.test(`${item.label || ""} ${item.meaning || ""}`)
      );

    if (!deadline?.date) {
      return notFound();
    }

    return answer(
      `${deadline.date}${deadline.meaning ? ` — ${deadline.meaning}` : ""}`,
      deadline.label
        ? `date « ${deadline.label} »`
        : "dates du document",
      true
    );
  }

  if (/montant|combien|payer|ttc|ht|tva|total/i.test(q)) {
    if (/total|ttc/i.test(q) && context.tables?.length) {
      for (const table of context.tables) {
        const totalEntry = Object.entries(table.totals || {}).find(([key]) =>
          /total|ttc/i.test(key)
        );

        if (totalEntry) {
          return answer(
            `${totalEntry[0]} : ${totalEntry[1]}`,
            `tableau « ${table.title} »`,
            true
          );
        }
      }
    }

    if (context.amount?.value && !/non trouvé|non trouvée|incertitude/i.test(context.amount.value)) {
      return answer(
        `${context.amount.value}${
          context.amount.meaning ? ` (${context.amount.meaning})` : ""
        }`,
        "montant principal extrait du document",
        true
      );
    }

    const detail = (context.amounts_detail || []).find((item) => {
      if (/tva/i.test(q)) return /tva/i.test(`${item.kind} ${item.label}`);
      if (/\bht\b/i.test(q)) return /\bht\b/i.test(`${item.kind} ${item.label}`);
      if (/ttc/i.test(q)) return /ttc/i.test(`${item.kind} ${item.label}`);
      return true;
    });

    if (detail) {
      return answer(
        `${detail.label || detail.kind || "Montant"} : ${detail.value}`,
        detail.page
          ? `montants détaillés (${detail.page})`
          : "montants détaillés du document",
        true
      );
    }

    return notFound();
  }

  if (/expéditeur|émetteur|qui (a |l[’'])envoy|organisme|de la part/i.test(q)) {
    if (context.issuer) {
      return answer(context.issuer, "émetteur identifié dans le document", true);
    }

    if (context.entities?.organizations?.length) {
      return answer(
        context.entities.organizations.join(", "),
        "organismes détectés dans le document",
        true
      );
    }

    return notFound();
  }

  if (/pourquoi.*(reçu|courrier|lettre|mail)|raison/i.test(q)) {
    if (
      context.why_received &&
      !/non trouvée avec certitude|non indiquée/i.test(context.why_received)
    ) {
      return answer(context.why_received, "explication « pourquoi reçu »", true);
    }

    return notFound();
  }

  if (/explique (ce |le )?tableau|compare les lignes|quel est le total/i.test(q)) {
    if (!context.tables?.length) {
      return notFound();
    }

    if (/total/i.test(q)) {
      for (const table of context.tables) {
        const entries = Object.entries(table.totals || {});
        if (entries.length) {
          return answer(
            entries.map(([k, v]) => `${k} : ${v}`).join("\n"),
            `tableau « ${table.title} »`,
            true
          );
        }
      }
    }

    if (/explique/i.test(q)) {
      const table = context.tables[0];
      const previewRows = table.rows
        .slice(0, 3)
        .map((row) => row.join(" | "))
        .join("\n");

      return answer(
        `Le tableau « ${table.title} » (${table.page}) contient les colonnes : ${
          table.columns.join(", ") || "non nommées"
        }.${previewRows ? `\nAperçu :\n${previewRows}` : ""}${
          table.notes ? `\nNote : ${table.notes}` : ""
        }`,
        `tableau « ${table.title} »`,
        true
      );
    }

    // compare lines → Gemini
    return null;
  }

  if (/signature/i.test(q)) {
    if (context.entities?.signatures?.length) {
      return answer(
        context.entities.signatures.join(", "),
        "signatures détectées",
        true
      );
    }

    return notFound();
  }

  // Default: needs Gemini reasoning
  return null;
}

function answer(text, source, found) {
  return {
    ok: true,
    found: Boolean(found),
    answer: cleanText(text) || "Je ne trouve pas cette information dans le document.",
    source: cleanText(source) || "document analysé",
    mode: "local"
  };
}

function notFound() {
  return {
    ok: true,
    found: false,
    answer: "Je ne trouve pas cette information dans le document.",
    source: "document analysé",
    mode: "local"
  };
}

function isMissingQuestion(q) {
  return /existe|manque|n['’]est pas|introuvable/i.test(q);
}

function inferTableKind(table, columns, rows) {
  const blob = `${table?.title || ""} ${columns.join(" ")} ${rows
    .slice(0, 3)
    .flat()
    .join(" ")}`.toLowerCase();

  if (/échéance|echeance|mensualité|échéance/i.test(blob)) {
    return "schedule";
  }

  if (/tva|ht|ttc|montant|facture/i.test(blob)) {
    return "invoice";
  }

  if (/formulaire|cerfa|champ/i.test(blob)) {
    return "form";
  }

  return "table";
}

function toStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => cleanText(String(item))).filter(Boolean).slice(0, 12);
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
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
