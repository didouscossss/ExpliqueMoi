/**
 * Assistant d’actions post-analyse (reply / fill / checklist / questions).
 * Génération locale prioritaire à partir du documentContext — sans dépendre
 * d’un appel Gemini long (cause des 504 Vercel non-JSON).
 */

const ALLOWED_ACTIONS = ["reply", "fill", "checklist", "questions"];

const PERSONAL_PLACEHOLDERS = {
  name: "[Votre nom]",
  address: "[Votre adresse]",
  fileNumber: "[Numéro de dossier]",
  email: "[Votre e-mail]",
  phone: "[Votre téléphone]",
  birthDate: "[Votre date de naissance]"
};

export function getAllowedAssistActions() {
  return [...ALLOWED_ACTIONS];
}

/**
 * Contexte compact et normalisé pour les 4 actions.
 */
export function buildAssistContext(analysis, options = {}) {
  if (!analysis || typeof analysis !== "object") {
    return null;
  }

  const entities =
    analysis.entities && typeof analysis.entities === "object"
      ? analysis.entities
      : {};

  const references = uniqueStrings([
    ...(Array.isArray(entities.references) ? entities.references : []),
    ...(Array.isArray(analysis.references) ? analysis.references : [])
  ]);

  const proofs = normalizeProofs(analysis);
  const formFields = normalizeFormFields(analysis);
  const requiredDocuments = normalizeRequiredDocuments(analysis, proofs);
  const requests = normalizeRequests(analysis);
  const actions = normalizeActions(analysis.actions);
  const dates = normalizeDates(analysis.dates || analysis.timeline);
  const amounts = normalizeAmounts(analysis);
  const tables = Array.isArray(analysis.tables) ? analysis.tables : [];

  return {
    analysisId:
      options.analysisId ??
      analysis.analysisId ??
      analysis.analysis_id ??
      null,
    documentType: cleanText(
      analysis.documentType || analysis.document_type || ""
    ),
    issuer: cleanText(analysis.issuer || ""),
    summary: cleanText(
      analysis.summary || analysis.plain_summary || ""
    ),
    whyReceived: cleanText(
      analysis.whyReceived || analysis.why_received || ""
    ),
    request: cleanText(analysis.request || ""),
    requests,
    actions,
    dates,
    amounts,
    references,
    proofs,
    tables,
    formFields,
    requiredDocuments,
    evidence: Array.isArray(analysis.evidence) ? analysis.evidence : [],
    entities: {
      people: toStringList(entities.people),
      addresses: toStringList(entities.addresses),
      references,
      signatures: toStringList(entities.signatures),
      organizations: toStringList(
        entities.organizations || entities.organismes
      )
    },
    amount:
      analysis.amount && typeof analysis.amount === "object"
        ? analysis.amount
        : null,
    urgency: analysis.urgency || null,
    confidence: analysis.confidence ?? null
  };
}

export function isAssistContextUsable(context) {
  if (!context || typeof context !== "object") {
    return false;
  }

  return Boolean(
    context.summary ||
      context.documentType ||
      context.issuer ||
      context.request ||
      context.requests.length ||
      context.actions.length ||
      context.formFields.length ||
      context.requiredDocuments.length ||
      context.dates.length ||
      context.proofs.length
  );
}

/**
 * Exécute une action d’aide à partir du contexte courant uniquement.
 */
export function runDocumentAction(actionType, context) {
  const action = String(actionType || "");

  if (!ALLOWED_ACTIONS.includes(action)) {
    return failure("INVALID_ACTION", "Type d’aide non reconnu.");
  }

  if (!isAssistContextUsable(context)) {
    return failure(
      "INVALID_CONTEXT",
      "Le document actuel ne contient pas assez d’informations."
    );
  }

  try {
    if (action === "reply") {
      return success("reply", buildReplyResult(context));
    }

    if (action === "fill") {
      const fill = buildFillResult(context);

      if (!fill) {
        return failure(
          "NO_FORM_DETECTED",
          "Ce document ne semble pas contenir de formulaire à remplir."
        );
      }

      return success("fill", fill);
    }

    if (action === "checklist") {
      return success("checklist", buildChecklistResult(context));
    }

    return success("questions", buildQuestionsResult(context));
  } catch (error) {
    return failure(
      "ASSIST_FAILED",
      error?.message ||
        "Je n’ai pas pu préparer cette aide pour le document actuel."
    );
  }
}

export function success(action, result) {
  return {
    ok: true,
    action,
    result
  };
}

export function failure(code, message) {
  return {
    ok: false,
    error: {
      code: String(code || "ASSIST_FAILED"),
      message:
        cleanText(message) ||
        "Je n’ai pas pu préparer cette aide pour le document actuel."
    }
  };
}

function buildReplyResult(context) {
  const issuer = context.issuer || "Madame, Monsieur";
  const missingFields = [];
  const refs = context.references;

  if (!context.entities.people.length) {
    missingFields.push(PERSONAL_PLACEHOLDERS.name);
  }

  if (!context.entities.addresses.length) {
    missingFields.push(PERSONAL_PLACEHOLDERS.address);
  }

  if (!refs.length) {
    missingFields.push(PERSONAL_PLACEHOLDERS.fileNumber);
  }

  const deadline = findDeadline(context.dates);
  const mainRequest =
    context.requests[0] ||
    context.request ||
    (context.actions[0]?.action ?? "");

  const subjectParts = [
    context.documentType ? `Objet : ${context.documentType}` : "Objet : Votre courrier",
    refs[0] ? `— réf. ${refs[0]}` : ""
  ].filter(Boolean);

  const bodyLines = [
    `${issuer.includes("Madame") || issuer.includes("Monsieur") ? issuer : `Madame, Monsieur,`}`,
    "",
    `Je vous contacte concernant ${
      context.documentType
        ? `votre document « ${context.documentType} »`
        : "votre courrier"
    }${context.issuer ? ` de ${context.issuer}` : ""}.`,
    "",
    context.summary
      ? `D’après les éléments dont je dispose : ${context.summary}`
      : "Je souhaite donner suite aux éléments mentionnés dans votre courrier.",
    "",
    mainRequest
      ? `Concernant votre demande (« ${mainRequest} »), je vous prie de trouver ci-dessous ma réponse.`
      : "Je vous prie de trouver ci-dessous ma réponse.",
    "",
    deadline?.date
      ? `Je note la date indiquée : ${deadline.date}${
          deadline.meaning ? ` (${deadline.meaning})` : ""
        }.`
      : null,
    context.amount?.value &&
    !/non trouvé|non trouvée|incertitude/i.test(context.amount.value)
      ? `Montant mentionné : ${context.amount.value}${
          context.amount.meaning ? ` (${context.amount.meaning})` : ""
        }.`
      : null,
    "",
    `Je reste à votre disposition pour tout complément.`,
    "",
    "Cordialement,",
    "",
    context.entities.people[0] || PERSONAL_PLACEHOLDERS.name,
    context.entities.addresses[0] || PERSONAL_PLACEHOLDERS.address,
    refs[0]
      ? `Référence : ${refs[0]}`
      : `Référence : ${PERSONAL_PLACEHOLDERS.fileNumber}`
  ].filter((line) => line !== null);

  return {
    subject: subjectParts.join(" "),
    body: bodyLines.join("\n"),
    missingFields: uniqueStrings(missingFields),
    tone: "formal"
  };
}

function buildFillResult(context) {
  if (!hasFormSignal(context)) {
    return null;
  }

  const fields = [];

  for (const field of context.formFields) {
    fields.push({
      label: field.label,
      required: field.required !== false,
      value: field.value || "",
      help:
        field.help ||
        `Indiquez la valeur demandée pour « ${field.label} ».`,
      source: field.source || null
    });
  }

  if (!fields.length) {
    // Champs dérivés du document (sans inventer de données personnelles)
    const derived = [
      {
        label: "Nom",
        required: true,
        value: context.entities.people[0] || "",
        help: "Indiquez votre nom de famille.",
        source: context.entities.people[0]
          ? "Identité détectée dans le document"
          : null
      },
      {
        label: "Adresse",
        required: true,
        value: context.entities.addresses[0] || "",
        help: "Indiquez votre adresse postale complète.",
        source: context.entities.addresses[0]
          ? "Adresse détectée dans le document"
          : null
      },
      {
        label: "Numéro de dossier / référence",
        required: Boolean(context.references[0]),
        value: context.references[0] || "",
        help: "Recopiez le numéro de dossier ou la référence indiquée.",
        source: context.references[0]
          ? "Référence détectée dans le document"
          : null
      }
    ];

    if (
      context.amount?.value &&
      !/non trouvé|non trouvée|incertitude/i.test(context.amount.value)
    ) {
      derived.push({
        label: "Montant",
        required: false,
        value: context.amount.value,
        help: "Vérifiez le montant avant de le reporter.",
        source: "Montant principal extrait du document"
      });
    }

    const deadline = findDeadline(context.dates);

    if (deadline?.date) {
      derived.push({
        label: "Date limite / échéance",
        required: false,
        value: deadline.date,
        help: "Notez cette date ; ne la modifiez pas si le formulaire la demande seulement à titre informatif.",
        source: deadline.label || "Dates du document"
      });
    }

    for (const request of context.requests.slice(0, 6)) {
      derived.push({
        label: truncate(request, 80),
        required: true,
        value: "",
        help: "Complétez ce point demandé dans le document. N’inventez aucune information personnelle.",
        source: "Demande identifiée dans le document"
      });
    }

    fields.push(...derived);
  }

  return {
    fields: fields.slice(0, 20)
  };
}

function buildChecklistResult(context) {
  const items = [];

  for (const doc of context.requiredDocuments) {
    items.push({
      label: doc.label,
      required: doc.required !== false,
      reason:
        doc.reason ||
        "Demandée dans le document."
    });
  }

  if (!items.length) {
    for (const proof of context.proofs) {
      items.push({
        label: proof.label,
        required: proof.required !== false,
        reason: proof.reason || "Mentionnée dans le document."
      });
    }
  }

  if (!items.length) {
    for (const evidence of context.evidence) {
      const blob = `${evidence?.quote || ""} ${evidence?.explanation || ""}`;

      if (
        /justificatif|pièce|joindre|fournir|attestation|rib|identité|domicile/i.test(
          blob
        )
      ) {
        items.push({
          label:
            cleanText(evidence.quote) ||
            cleanText(evidence.explanation) ||
            "Pièce mentionnée",
          required: true,
          reason:
            cleanText(evidence.explanation) ||
            "Demandée dans le document."
        });
      }
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of items) {
    const key = item.label.toLowerCase();

    if (!item.label || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push({
      label: item.label,
      required: item.required !== false,
      reason: item.reason || "Demandée dans le document."
    });
  }

  if (!unique.length) {
    return {
      items: [],
      message:
        "Aucune pièce justificative n’est explicitement demandée dans ce document."
    };
  }

  return {
    items: unique.slice(0, 15),
    message: ""
  };
}

function buildQuestionsResult(context) {
  const questions = [];
  const deadline = findDeadline(context.dates);

  if (deadline?.date) {
    questions.push(
      `Pouvez-vous confirmer que la date limite est bien le ${deadline.date} ?`
    );
  } else {
    questions.push("Pouvez-vous confirmer la date limite de réponse ?");
  }

  if (context.requiredDocuments.length || context.proofs.length) {
    questions.push("Quels justificatifs dois-je transmettre exactement ?");
  } else if (
    /justificatif|pièce|joindre|dossier/i.test(
      `${context.summary} ${context.request}`
    )
  ) {
    questions.push("Quels justificatifs dois-je transmettre ?");
  }

  if (
    context.amount?.value &&
    !/non trouvé|non trouvée|incertitude/i.test(context.amount.value)
  ) {
    questions.push(
      `Le montant de ${context.amount.value} est-il définitif, ou peut-il être ajusté ?`
    );
  }

  if (context.references[0]) {
    questions.push(
      `Pouvez-vous confirmer que la référence ${context.references[0]} est la bonne pour mon dossier ?`
    );
  } else {
    questions.push(
      "Quel numéro de dossier dois-je indiquer dans ma réponse ?"
    );
  }

  if (context.actions.length) {
    questions.push(
      "Quelles sont les modalités exactes pour effectuer la démarche demandée (courrier, en ligne, rendez-vous) ?"
    );
  }

  if (context.requests.length > 1) {
    questions.push(
      "Quelles demandes sont prioritaires si je ne peux pas tout transmettre immédiatement ?"
    );
  }

  if (/conséquence|pénalité|majoration|recouvrement|contentieux/i.test(
    `${context.summary} ${context.request}`
  )) {
    questions.push(
      "Quelles sont les conséquences si je réponds après la date indiquée ?"
    );
  }

  const unique = uniqueStrings(questions).slice(0, 8);

  return {
    questions: unique.length
      ? unique
      : [
          "Pouvez-vous préciser la suite à donner à ce document ?",
          "Quels éléments dois-je vous transmettre pour finaliser mon dossier ?"
        ]
  };
}

function hasFormSignal(context) {
  if (context.formFields.length) {
    return true;
  }

  const blob = `${context.documentType} ${context.summary} ${context.request}`;

  // Négation explicite : ce n’est pas un formulaire
  if (
    /aucun formulaire|pas de formulaire|ne (semble )?(pas|plus) contenir de formulaire|sans formulaire/i.test(
      blob
    )
  ) {
    return false;
  }

  if (
    /\bcerfa\b|formulaire|déclaration à (remplir|compléter)|declaration a (remplir|completer)|demande à compléter|à remplir|à completer/i.test(
      blob
    )
  ) {
    return true;
  }

  if (
    context.actions.some((item) =>
      /remplir|compléter|completer|formulaire|case|champ/i.test(
        `${item.action || ""} ${item.how || ""}`
      )
    )
  ) {
    return true;
  }

  if (
    context.tables.some((table) => {
      const title = `${table?.title || ""} ${table?.kind || ""}`;
      return /formulaire|champs?|saisie|déclaration/i.test(title);
    })
  ) {
    return true;
  }

  return false;
}

function findDeadline(dates) {
  if (!Array.isArray(dates)) {
    return null;
  }

  return (
    dates.find((item) =>
      /limite|échéance|echeance|délai|delai|avant le|à retourner|a retourner/i.test(
        `${item.label || ""} ${item.meaning || ""}`
      )
    ) || dates.find((item) => item?.date) || null
  );
}

function normalizeRequests(analysis) {
  if (Array.isArray(analysis.requests)) {
    return uniqueStrings(analysis.requests.map((item) => {
      if (typeof item === "string") {
        return item;
      }

      return item?.label || item?.text || item?.request || "";
    }));
  }

  const single = cleanText(analysis.request || "");
  return single ? [single] : [];
}

function normalizeActions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, 12)
    .map((item) => {
      if (typeof item === "string") {
        return { action: cleanText(item), how: "" };
      }

      return {
        action: cleanText(item?.action || item?.label || ""),
        how: cleanText(item?.how || item?.detail || "")
      };
    })
    .filter((item) => item.action);
}

function normalizeDates(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, 12)
    .map((item) => ({
      date: cleanText(item?.date),
      label: cleanText(item?.label),
      meaning: cleanText(item?.meaning || item?.description)
    }))
    .filter((item) => item.date || item.label);
}

function normalizeAmounts(analysis) {
  const list = [];

  if (
    analysis.amount?.value &&
    !/non trouvé|non trouvée|incertitude/i.test(analysis.amount.value)
  ) {
    list.push({
      label: cleanText(analysis.amount.meaning) || "Montant principal",
      value: cleanText(analysis.amount.value)
    });
  }

  const detail =
    analysis.amountsDetail ||
    analysis.amounts_detail ||
    analysis.amounts ||
    [];

  if (Array.isArray(detail)) {
    for (const item of detail) {
      const value = cleanText(item?.value || item?.amount);

      if (!value) {
        continue;
      }

      list.push({
        label: cleanText(item?.label || item?.kind || "Montant"),
        value
      });
    }
  }

  return list.slice(0, 12);
}

function normalizeFormFields(analysis) {
  const raw =
    analysis.formFields ||
    analysis.form_fields ||
    analysis.fields ||
    [];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, 20)
    .map((field) => ({
      label: cleanText(field?.label || field?.name || field?.id),
      required: field?.required !== false,
      value: cleanText(field?.value || ""),
      help: cleanText(field?.help || field?.hint || ""),
      source: cleanText(field?.source || "") || null
    }))
    .filter((field) => field.label);
}

function normalizeProofs(analysis) {
  const raw = analysis.proofs || analysis.pieces || [];

  if (Array.isArray(raw) && raw.length) {
    return raw
      .slice(0, 15)
      .map((item) => {
        if (typeof item === "string") {
          return {
            label: cleanText(item),
            required: true,
            reason: "Demandée dans le document."
          };
        }

        return {
          label: cleanText(item?.label || item?.name || item?.document),
          required: item?.required !== false,
          reason: cleanText(item?.reason || item?.why) ||
            "Demandée dans le document."
        };
      })
      .filter((item) => item.label);
  }

  return [];
}

function normalizeRequiredDocuments(analysis, proofs) {
  const raw =
    analysis.requiredDocuments ||
    analysis.required_documents ||
    analysis.documentsRequired ||
    [];

  if (Array.isArray(raw) && raw.length) {
    return raw
      .slice(0, 15)
      .map((item) => {
        if (typeof item === "string") {
          return {
            label: cleanText(item),
            required: true,
            reason: "Demandée dans le document."
          };
        }

        return {
          label: cleanText(item?.label || item?.name || item?.document),
          required: item?.required !== false,
          reason:
            cleanText(item?.reason || item?.why) ||
            "Demandée dans le document."
        };
      })
      .filter((item) => item.label);
  }

  return proofs;
}

function toStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return uniqueStrings(values);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const cleaned = cleanText(value);

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function truncate(value, max) {
  const text = cleanText(value);

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 1).trim()}…`;
}

export function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}
